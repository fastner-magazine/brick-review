import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/firebase-admin';

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const collection = String(url.searchParams.get('collection') || '').trim();
        if (!collection) return NextResponse.json({ error: 'collection required' }, { status: 400 });
        const subcollection = url.searchParams.get('subcollection') || undefined;
        const limit = Number(url.searchParams.get('limit') || '5') || 5;

        const admin = getAdmin();
        const db = admin.firestore();

        if (!subcollection) {
            const snap = await db.collection(collection).limit(limit).get();
            const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
            return NextResponse.json({ docs });
        }

        // subcollection: fetch documents from first-level document subcollections across up to `limit` parent docs
        const parentSnap = await db.collection(collection).limit(limit).get();
        const docs: { id: string; data: Record<string, any> }[] = [];
        for (const p of parentSnap.docs) {
            const subSnap = await db.collection(`${collection}/${p.id}/${subcollection}`).limit(limit).get();
            subSnap.docs.forEach((d) => {
                docs.push({ id: `${p.id}/${d.id}`, data: d.data() });
            });
            if (docs.length >= limit) break;
        }
        return NextResponse.json({ docs: docs.slice(0, limit) });
    } catch (err: any) {
        return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const collection = String(body?.collection || '').trim();
        if (!collection) return NextResponse.json({ error: 'collection required' }, { status: 400 });
        const subcollection: string | undefined = body?.subcollection;
        const docs: Array<{ id: string; mappings: Record<string, string> }> = Array.isArray(body?.docs) ? body.docs : [];
        if (docs.length === 0) return NextResponse.json({ written: 0, failed: [] });

        const admin = getAdmin();
        const db = admin.firestore();
        const failed: { id: string; reason: string }[] = [];
        let written = 0;

        // process sequentially to keep logic simple (max small number of docs)
        for (const entry of docs) {
            try {
                const id = String(entry.id || '');
                if (!id) {
                    failed.push({ id: entry.id, reason: 'invalid id' });
                    continue;
                }

                if (!subcollection) {
                    const ref = db.collection(collection).doc(id);
                    const snap = await ref.get();
                    if (!snap.exists) {
                        failed.push({ id, reason: 'not found' });
                        continue;
                    }
                    const data = snap.data() || {};
                    const updateObj: Record<string, any> = {};
                    const deleteKeys: string[] = [];
                    for (const [oldK, newK] of Object.entries(entry.mappings || {})) {
                        if (!newK || newK === oldK) continue;
                        if (Object.prototype.hasOwnProperty.call(data, oldK)) {
                            updateObj[newK] = data[oldK];
                            deleteKeys.push(oldK);
                        }
                    }
                    if (Object.keys(updateObj).length === 0 && deleteKeys.length === 0) {
                        // nothing to do
                        written += 0;
                        continue;
                    }
                    // combine update and deletes
                    const updates: Record<string, any> = { ...updateObj };
                    if (deleteKeys.length > 0) {
                        deleteKeys.forEach((k) => { updates[k] = admin.firestore.FieldValue.delete(); });
                    }
                    await ref.update(updates as any);
                    written += 1;
                } else {
                    // id is like parentId/childId or parentId when mappings should be applied to subcollection docs?
                    // We'll allow id either 'parentId/childId' or 'parentId' and then apply to every doc in that parent's subcollection
                    if (id.includes('/')) {
                        const [parentId, childId] = id.split('/');
                        const ref = db.collection(`${collection}/${parentId}/${subcollection}`).doc(childId);
                        const snap = await ref.get();
                        if (!snap.exists) { failed.push({ id, reason: 'not found' }); continue; }
                        const data = snap.data() || {};
                        const updates: Record<string, any> = {};
                        const deleteKeys: string[] = [];
                        for (const [oldK, newK] of Object.entries(entry.mappings || {})) {
                            if (!newK || newK === oldK) continue;
                            if (Object.prototype.hasOwnProperty.call(data, oldK)) {
                                updates[newK] = data[oldK];
                                deleteKeys.push(oldK);
                            }
                        }
                        deleteKeys.forEach((k) => { updates[k] = admin.firestore.FieldValue.delete(); });
                        if (Object.keys(updates).length > 0) {
                            await ref.update(updates as any);
                            written += 1;
                        }
                    } else {
                        // apply to all docs in parent's subcollection that match parent id
                        const subSnap = await db.collection(`${collection}/${id}/${subcollection}`).get();
                        for (const sd of subSnap.docs) {
                            const data = sd.data() || {};
                            const updates: Record<string, any> = {};
                            const deleteKeys: string[] = [];
                            for (const [oldK, newK] of Object.entries(entry.mappings || {})) {
                                if (!newK || newK === oldK) continue;
                                if (Object.prototype.hasOwnProperty.call(data, oldK)) {
                                    updates[newK] = data[oldK];
                                    deleteKeys.push(oldK);
                                }
                            }
                            deleteKeys.forEach((k) => { updates[k] = admin.firestore.FieldValue.delete(); });
                            if (Object.keys(updates).length > 0) {
                                await db.collection(`${collection}/${id}/${subcollection}`).doc(sd.id).update(updates as any);
                                written += 1;
                            }
                        }
                    }
                }
            } catch (e: any) {
                failed.push({ id: entry.id, reason: String(e?.message || e) });
            }
        }

        return NextResponse.json({ written, failed });
    } catch (err: any) {
        return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
    }
}
