import { NextRequest, NextResponse } from 'next/server';
import { getAdmin } from '@/lib/firebase-admin';

type IncomingDoc = {
    id?: string; // Optional client-provided document ID
    data: Record<string, unknown>; // Arbitrary document payload
};

function sanitizeCollectionName(name: string): string | null {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    // Basic allowlist: letters, numbers, underscore, hyphen. Firestore forbids '/'.
    return /^[A-Za-z0-9_-]{1,64}$/.test(trimmed) ? trimmed : null;
}

function sanitizeDocId(id: string | undefined): string | undefined {
    if (!id) return undefined;
    const v = String(id).trim();
    if (!v) return undefined;
    // Replace forbidden '/'
    return v.replaceAll('/', '_');
}

export async function POST(req: NextRequest) {
    const startTime = Date.now();
    try {
        console.log('======================================');
        console.log('[upload] 🎯 POST request received at', new Date().toISOString());
        
        const body = await req.json();
        const collectionIn = String(body?.collection || '').trim();
        const collection = sanitizeCollectionName(collectionIn);
        const docs: IncomingDoc[] = Array.isArray(body?.docs) ? body.docs : [];

        // Short operation identifier for correlated logs
        const opId = `${new Date().toISOString()}-${Math.random().toString(36).slice(2,8)}`;
        console.log(`[upload][${opId}] Received upload request. collection=${collection}, docs=${docs.length}`);
        console.log(`[upload][${opId}] Request origin: ${req.headers.get('origin') || 'n/a'}`);
        console.log(`[upload][${opId}] Content-Type: ${req.headers.get('content-type') || 'n/a'}`);

        // Log a concise preview of the incoming docs (id and whether it's a delete)
        try {
            const preview = docs.slice(0, 20).map(d => ({ id: d.id, _deleteDoc: !!d?.data?._deleteDoc }));
            console.log(`[upload][${opId}] Payload preview (first ${preview.length}):`, JSON.stringify(preview));
            
            // 詳細デバッグ: 最初の3件の完全なペイロードを出力
            if (docs.length > 0 && docs.length <= 5) {
                console.log(`[upload][${opId}] Full payload (all ${docs.length} docs):`, JSON.stringify(docs, null, 2));
            }
        } catch (err) {
            console.log(`[upload][${opId}] Failed to stringify payload preview: ${String(err)}`);
        }

        if (!collection) {
            return NextResponse.json({ written: 0, failed: [], message: 'Invalid collection name' }, { status: 400 });
        }
        if (!docs.length) {
            return NextResponse.json({ written: 0, failed: [], message: 'No docs provided' }, { status: 400 });
        }

        const admin = getAdmin();
        const db = admin.firestore();

    const failed: { id?: string; reason: string }[] = [];
    let written = 0;

    // Use batched writes capped to 450 ops per commit to be safe
        const BATCH_LIMIT = 450;
    // Maintain a short-lived in-memory map of recent deletions to detect quick recreations (resurrections)
    // Key format: `${collection}:${docId}` -> timestamp (ms)
    const RECENT_DELETION_TTL_MS = 30_000; // 30 seconds
    // store on globalThis so subsequent requests in same process can observe
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (!globalThis.__recentDeletions) globalThis.__recentDeletions = new Map<string, number>();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const recentDeletions: Map<string, number> = globalThis.__recentDeletions;
        for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
            const slice = docs.slice(i, i + BATCH_LIMIT);
            const batch = db.batch();
            const plannedOps: { action: 'delete' | 'set'; docId?: string; providedId?: string }[] = [];
            for (const doc of slice) {
                try {
                    const docId = sanitizeDocId(doc?.id);
                    const ref = docId ? db.collection(collection).doc(docId) : db.collection(collection).doc();

                    // Record planned operation for logging before commit
                    if (doc?.data?._deleteDoc === true) {
                        plannedOps.push({ action: 'delete', docId: ref.id, providedId: docId });
                        console.log(`[upload][${opId}] ❌ PLAN DELETE ${collection}/${ref.id} (providedId=${String(doc?.id)})`);
                        batch.delete(ref);
                        // record recent deletion for resurrection detection
                        try {
                            recentDeletions.set(`${collection}:${ref.id}`, Date.now());
                        } catch (err) {
                            console.log(`[upload][${opId}] Failed to record recent deletion: ${String(err)}`);
                        }
                        written += 1;
                    } else {
                        plannedOps.push({ action: 'set', docId: ref.id, providedId: docId });
                        console.log(`[upload][${opId}] ✅ PLAN SET ${collection}/${ref.id} (providedId=${String(doc?.id)})`);
                        // resurrection detection: if this doc was deleted recently, log warning
                        try {
                            const key = `${collection}:${ref.id}`;
                            const ts = recentDeletions.get(key);
                            if (ts && Date.now() - ts <= RECENT_DELETION_TTL_MS) {
                                console.warn(`[upload][${opId}] ⚠️ Resurrection detected: ${collection}/${ref.id} was deleted ${Date.now() - ts}ms ago and is now being set`);
                            }
                        } catch (err) {
                            console.log(`[upload][${opId}] Resurrection detection failed: ${String(err)}`);
                        }
                        batch.set(ref, doc?.data ?? {}, { merge: true });
                        written += 1;
                    }
                } catch (e: any) {
                    console.error(`[upload] ⚠️ ERROR on ${collection}/${doc?.id}:`, e?.message);
                    failed.push({ id: doc?.id, reason: e?.message || 'unknown error' });
                }
            }
            await batch.commit();
            console.log(`[upload][${opId}] Batch committed: ${slice.length} operations`);

            // Log which operations were executed (use plannedOps)
            try {
                console.log(`[upload][${opId}] Executed ops:`, JSON.stringify(plannedOps));
            } catch (err) {
                console.log(`[upload][${opId}] Executed ops logged (non-serializable): ${String(err)}`);
            }

            // デバッグ: 削除されたドキュメントが実際に削除されているか確認
            const deleteOps = slice.filter(doc => doc?.data?._deleteDoc === true);
            console.log(`[upload][${opId}] 🔍 Verifying ${deleteOps.length} DELETE operations...`);
            
            for (const doc of deleteOps) {
                const docId = sanitizeDocId(doc?.id) || undefined;
                if (!docId) {
                    console.warn(`[upload][${opId}] ⚠️ WARN: Delete requested but no doc.id provided in payload for collection=${collection}. Unable to verify by id.`);
                    continue;
                }
                
                console.log(`[upload][${opId}] 🔍 Checking if ${collection}/${docId} exists after delete...`);
                const ref = db.collection(collection).doc(docId);
                const snap = await ref.get();
                
                if (snap.exists) {
                    const data = snap.data() || {};
                    console.error(`[upload][${opId}] ❌❌❌ CRITICAL: Document ${collection}/${docId} still EXISTS after delete!`);
                    console.error(`[upload][${opId}] Document data keys: ${Object.keys(data).join(', ')}`);
                    console.error(`[upload][${opId}] Document data: ${JSON.stringify(data, null, 2)}`);
                } else {
                    console.log(`[upload][${opId}] ✅✅✅ VERIFIED: Document ${collection}/${docId} successfully deleted (does not exist)`);
                }
            }
            
            if (deleteOps.length > 0) {
                console.log(`[upload][${opId}] 🔍 DELETE verification complete: ${deleteOps.length} operations checked`);
            }
        }

        const elapsed = Date.now() - startTime;
        console.log(`[upload][${opId}] ✅ Complete: ${written} written, ${failed.length} failed (took ${elapsed}ms)`);
        console.log('======================================');
        return NextResponse.json({ written, failed }, { status: 200 });
    } catch (error: any) {
        const elapsed = Date.now() - startTime;
        console.error('[upload] ❌ Fatal error:', error?.message || String(error));
        console.error('[upload] Error stack:', error?.stack);
        console.error(`[upload] Failed after ${elapsed}ms`);
        console.log('======================================');
        return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
    }
}
