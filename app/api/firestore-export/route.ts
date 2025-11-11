import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { initAdmin } from '@/lib/firebase-admin';

export const maxDuration = 300; // 5分のタイムアウト

// サブコレクションを再帰的に取得
async function getSubcollectionsRecursive(docRef: FirebaseFirestore.DocumentReference): Promise<Record<string, any>> {
    const subcollections: Record<string, any> = {};

    try {
        const collections = await docRef.listCollections();

        for (const subCol of collections) {
            const subDocs = await subCol.get();
            subcollections[subCol.id] = {};

            for (const subDoc of subDocs.docs) {
                const subDocData = subDoc.data();
                subcollections[subCol.id][subDoc.id] = {
                    _id: subDoc.id,
                    _path: subDoc.ref.path,
                    ...subDocData,
                };

                // 再帰的にさらに深いサブコレクションを取得
                const nestedSubcollections = await getSubcollectionsRecursive(subDoc.ref);
                if (Object.keys(nestedSubcollections).length > 0) {
                    subcollections[subCol.id][subDoc.id]._subcollections = nestedSubcollections;
                }
            }
        }
    } catch (error) {
        console.error('Error fetching subcollections:', error);
    }

    return subcollections;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { collectionName, includeSubcollections, offset = 0, limit = 1000, ids } = body;

        if (!collectionName) {
            return NextResponse.json(
                { error: 'コレクション名が必要です' },
                { status: 400 }
            );
        }

        // Firebase Admin初期化
        initAdmin();
        const db = getFirestore();

        const collectionRef = db.collection(collectionName);

        const documents: Record<string, any> = {};

        // ID 指定モード
        if (Array.isArray(ids) && ids.length > 0) {
            // 重複/空を除去
            const cleanIds = Array.from(new Set((ids as string[]).map((s) => String(s).trim()).filter((s) => s.length > 0)));
            // 個別取得（件数が少ない想定）
            for (const id of cleanIds) {
                const docRef = collectionRef.doc(id);
                const docSnap = await docRef.get();
                if (!docSnap.exists) continue;
                const docData = docSnap.data() as Record<string, any>;
                documents[docSnap.id] = {
                    _id: docSnap.id,
                    _path: docRef.path,
                    ...docData,
                };

                if (includeSubcollections) {
                    const subcollections = await getSubcollectionsRecursive(docRef);
                    if (Object.keys(subcollections).length > 0) {
                        documents[docSnap.id]._subcollections = subcollections;
                    }
                }
            }

            return NextResponse.json({
                documents,
                hasMore: false,
                nextOffset: undefined,
                count: Object.keys(documents).length,
            });
        }

        // ページング対応: offset と limit を使用
        const query = collectionRef.offset(offset).limit(limit);
        const snapshot = await query.get();

        for (const doc of snapshot.docs) {
            const docData = doc.data();

            documents[doc.id] = {
                _id: doc.id,
                _path: doc.ref.path,
                ...docData,
            };

            // サブコレクションを含める場合
            if (includeSubcollections) {
                const subcollections = await getSubcollectionsRecursive(doc.ref);
                if (Object.keys(subcollections).length > 0) {
                    documents[doc.id]._subcollections = subcollections;
                }
            }
        }

        return NextResponse.json({
            documents,
            hasMore: snapshot.size === limit,
            nextOffset: offset + snapshot.size,
            count: snapshot.size,
        });

    } catch (error) {
        console.error('Export error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : '不明なエラー' },
            { status: 500 }
        );
    }
}

// ドキュメント数カウント、プレビュー取得、コレクション一覧取得
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action'); // 'count', 'preview', 'collections'
        const collectionName = searchParams.get('collection');

        // Firebase Admin初期化
        initAdmin();
        const db = getFirestore();

        // コレクション一覧取得
        if (action === 'collections') {
            try {
                // Firestoreから実際のコレクション一覧を取得
                const collections = await db.listCollections();
                const collectionIds = collections.map(col => col.id);
                
                // アルファベット順にソート
                collectionIds.sort();
                
                return NextResponse.json({ collections: collectionIds });
            } catch (error) {
                console.error('Failed to list collections:', error);
                // エラー時はよく使うコレクションのリストを返す
                const commonCollections = [
                    'products_master',
                    'variants_master',
                    'inventory_master',
                    'price_master',
                    'buy_requests',
                    'boxes',
                    'skus',
                    'skuOverrides',
                ];
                return NextResponse.json({ collections: commonCollections });
            }
        }

        if (!collectionName) {
            return NextResponse.json(
                { error: 'コレクション名が必要です' },
                { status: 400 }
            );
        }

        const collectionRef = db.collection(collectionName);

        // プレビュー取得（最初の3件）
        if (action === 'preview') {
            const snapshot = await collectionRef.limit(3).get();
            const preview = snapshot.docs.map(doc => ({
                _id: doc.id,
                ...doc.data(),
            }));
            return NextResponse.json({ preview });
        }

        // カウント取得（デフォルト）
        const snapshot = await collectionRef.count().get();
        return NextResponse.json({
            count: snapshot.data().count,
        });

    } catch (error) {
        console.error('GET error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : '不明なエラー' },
            { status: 500 }
        );
    }
}
