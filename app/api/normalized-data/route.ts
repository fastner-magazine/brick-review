import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * レスポンス型
 */
type NormalizedDataResponse = {
    success: boolean;
    timestamp: string;
    products?: Array<{
        docid: string;
        variant_group_id: string;
        product_name: string;
        category: string;
    }>;
    variants?: Array<{
        variant_id: string;
        variantGroupIdRef: string;
        type: string;
        sealing: string;
    }>;
    inventory?: Array<{
        inventory_id: string;
        variantIdRef: string;
        location: string;
        quantity: number;
        damages: string;
        note: string;
        barcode: string;
        status: string;
        created_at: string;
        updated_at: string;
    }>;
    error?: string;
};

/**
 * 書き込みリクエスト型
 */
type WriteRequest = {
    operations: Array<{
        collection: 'productsMaster' | 'variantsMaster' | 'inventoriesMaster' |
        'products_master_archive' | 'variants_master_archive' | 'inventory_master_archive';
        action: 'set' | 'update' | 'delete';
        docId: string;
        data?: Record<string, any>;
    }>;
};


/**
 * GET: 指定されたコレクションのデータを取得
 */
export async function GET(request: NextRequest) {
    try {
        const db = getAdminDb();

        // クエリパラメータから取得対象を決定
        const searchParams = request.nextUrl.searchParams;
        const collectionsParam = searchParams.get('collections');
        const requestedCollections = collectionsParam
            ? collectionsParam.split(',') as ('products' | 'variants' | 'inventory')[]
            : ['products', 'variants', 'inventory'];

        const response: NormalizedDataResponse = {
            success: true,
            timestamp: new Date().toISOString(),
        };

        // 並列取得
        const promises: Promise<void>[] = [];

        if (requestedCollections.includes('products')) {
            promises.push(
                db.collection('productsMaster').get().then(snapshot => {
                    response.products = snapshot.docs.map(doc => ({
                        docid: doc.id,
                        variant_group_id: doc.data().variant_group_id || '',
                        product_name: doc.data().product_name || '',
                        category: doc.data().category || '',
                    }));
                })
            );
        }

        if (requestedCollections.includes('variants')) {
            promises.push(
                db.collection('variantsMaster').get().then(snapshot => {
                    response.variants = snapshot.docs.map(doc => ({
                        variant_id: doc.id,
                        variantGroupIdRef: doc.data().variantGroupIdRef || '',
                        type: doc.data().type || '',
                        sealing: doc.data().sealing || '',
                    }));
                })
            );
        }

        if (requestedCollections.includes('inventory')) {
            promises.push(
                db.collection('inventoriesMaster').get().then(snapshot => {
                    response.inventory = snapshot.docs.map(doc => ({
                        inventory_id: doc.id,
                        variantIdRef: doc.data().variantIdRef || '',
                        location: doc.data().location || '',
                        quantity: Number(doc.data().quantity) || 0,
                        damages: doc.data().damages || '',
                        note: doc.data().note || '',
                        barcode: doc.data().barcode || '',
                        status: doc.data().status || '',
                        created_at: doc.data().created_at || '',
                        updated_at: doc.data().updated_at || '',
                    }));
                })
            );
        }

        await Promise.all(promises);

        return NextResponse.json(response);

    } catch (error) {
        console.error('[API /normalized-data GET] Error:', error);
        return NextResponse.json({
            success: false,
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

/**
 * POST: バッチ書き込み（複数コレクションへの操作をまとめて実行）
 */
export async function POST(request: NextRequest) {
    const opId = `${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)}`;
    console.log('======================================');
    console.log(`[normalized-data POST][${opId}] 🎯 Request received at`, new Date().toISOString());

    try {
        const db = getAdminDb();

        const body = await request.json() as WriteRequest;
        console.log(`[normalized-data POST][${opId}] Request body:`, JSON.stringify(body, null, 2));

        if (!body.operations || !Array.isArray(body.operations)) {
            console.error(`[normalized-data POST][${opId}] ❌ Invalid request body`);
            return NextResponse.json({
                success: false,
                written: 0,
                errors: ['Invalid request body: operations array required'],
            }, { status: 400 });
        }

        console.log(`[normalized-data POST][${opId}] Total operations: ${body.operations.length}`);

        // 操作の内訳をログ出力
        const opsSummary = body.operations.reduce<Record<string, Record<string, number>>>((acc, op) => {
            if (!acc[op.collection]) acc[op.collection] = {};
            acc[op.collection][op.action] = (acc[op.collection][op.action] || 0) + 1;
            return acc;
        }, {});
        console.log(`[normalized-data POST][${opId}] Operations summary:`, JSON.stringify(opsSummary, null, 2));

        const BATCH_LIMIT = 500;
        let totalWritten = 0;
        const errors: string[] = [];

        // 500件ごとにバッチ分割
        for (let i = 0; i < body.operations.length; i += BATCH_LIMIT) {
            const chunk = body.operations.slice(i, i + BATCH_LIMIT);
            console.log(`[normalized-data POST][${opId}] Processing chunk ${Math.floor(i / BATCH_LIMIT) + 1} (${chunk.length} operations)`);
            const batch = db.batch();

            chunk.forEach((op, idx) => {
                const docRef = db.collection(op.collection).doc(op.docId);

                try {
                    if (op.action === 'set' && op.data) {
                        console.log(`[normalized-data POST][${opId}] ✅ SET ${op.collection}/${op.docId}`);
                        batch.set(docRef, op.data);
                    } else if (op.action === 'update' && op.data) {
                        console.log(`[normalized-data POST][${opId}] ✏️ UPDATE ${op.collection}/${op.docId}`);
                        batch.update(docRef, op.data);
                    } else if (op.action === 'delete') {
                        console.log(`[normalized-data POST][${opId}] 🔥🔥🔥 DELETE ${op.collection}/${op.docId}`);
                        batch.delete(docRef);
                    } else {
                        console.error(`[normalized-data POST][${opId}] ❌ Invalid operation: ${op.action} on ${op.collection}/${op.docId}`);
                        errors.push(`Invalid operation: ${op.action} on ${op.collection}/${op.docId}`);
                    }
                } catch (err) {
                    console.error(`[normalized-data POST][${opId}] ❌ Failed to queue operation [${idx}]:`, err);
                    errors.push(`Failed to queue operation: ${err instanceof Error ? err.message : String(err)}`);
                }
            });

            try {
                console.log(`[normalized-data POST][${opId}] Committing batch...`);
                await batch.commit();
                console.log(`[normalized-data POST][${opId}] ✅ Batch committed successfully`);
                totalWritten += chunk.length;
            } catch (err) {
                console.error(`[normalized-data POST][${opId}] ❌ Batch commit failed:`, err);
                errors.push(`Batch commit failed: ${err instanceof Error ? err.message : String(err)}`);
            }

            // 削除操作の検証
            const deleteOps = chunk.filter(op => op.action === 'delete');
            if (deleteOps.length > 0) {
                console.log(`[normalized-data POST][${opId}] 🔍 Verifying ${deleteOps.length} DELETE operations...`);
                for (const op of deleteOps) {
                    const docRef = db.collection(op.collection).doc(op.docId);
                    const snapshot = await docRef.get();
                    if (snapshot.exists) {
                        console.error(`[normalized-data POST][${opId}] ❌❌❌ CRITICAL: Document ${op.collection}/${op.docId} still EXISTS after delete!`);
                        console.error(`[normalized-data POST][${opId}] Document data:`, JSON.stringify(snapshot.data(), null, 2));
                    } else {
                        console.log(`[normalized-data POST][${opId}] ✅✅✅ VERIFIED: Document ${op.collection}/${op.docId} successfully deleted`);
                    }
                }
            }
        }

        console.log(`[normalized-data POST][${opId}] ✅ Complete: ${totalWritten} written, ${errors.length} errors`);
        console.log('======================================');

        return NextResponse.json({
            success: errors.length === 0,
            written: totalWritten,
            errors: errors.length > 0 ? errors : undefined,
        });

    } catch (error) {
        console.error(`[normalized-data POST][${opId}] ❌ Fatal error:`, error);
        console.log('======================================');
        return NextResponse.json({
            success: false,
            written: 0,
            errors: [error instanceof Error ? error.message : 'Unknown error'],
        }, { status: 500 });
    }
}
