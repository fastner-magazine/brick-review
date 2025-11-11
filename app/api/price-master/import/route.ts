import { NextRequest, NextResponse } from 'next/server';
import { adminDb as db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

// CSV からインポートされた価格データの型
type ImportedPriceRecord = {
    buyback_price_id: string;
    variantIdRef: string;
    variantGroupIdRef: string;
    product_name: string;
    category: string;
    type: string;
    sealing: string;
    priority: string;
    amount: string;
    status: string;
    image: string;
    notes: string;
    match_score: string;
    original_type: string;
    original_condition: string;
    createdAt: string;
    updatedAt: string;
};

// products_master, variants_master, inventories_master からデータを取得
async function loadMasterData() {
    console.log('[loadMasterData] Starting to load master data...');
    try {
        console.log('[loadMasterData] Fetching products_master...');
        const productsSnapshot = await db.collection('products_master').get();
        console.log('[loadMasterData] products_master loaded:', productsSnapshot.size, 'documents');

        console.log('[loadMasterData] Fetching variants_master...');
        const variantsSnapshot = await db.collection('variants_master').get();
        console.log('[loadMasterData] variants_master loaded:', variantsSnapshot.size, 'documents');

        console.log('[loadMasterData] Fetching inventoriesMaster...');
        const inventoriesSnapshot = await db.collection('inventoriesMaster').get();
        console.log('[loadMasterData] inventoriesMaster loaded:', inventoriesSnapshot.size, 'documents');

        const products = productsSnapshot.docs.map(doc => {
            const data = doc.data();
            const seriesId = data.series_id || '';
            const productName = data.product_name || '';
            const vol = data.vol || '';

            // displayName を生成（series_id + product_name + vol の連結）
            const displayName = [seriesId, productName, vol].filter(Boolean).join(' ') || productName;

            return {
                variant_group_id: doc.id,
                series_id: seriesId,
                product_name: productName,
                vol: vol,
                displayName: displayName,
                category: data.category || '',
                ...data,
            };
        });

        console.log('[loadMasterData] Processed', products.length, 'products');

        const variants = variantsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                variant_id: doc.id,
                variantGroupIdRef: data.variantGroupIdRef || '',
                type: data.type || '',
                sealing: data.sealing || '',
                ...data,
            };
        });

        console.log('[loadMasterData] Processed', variants.length, 'variants');

        const inventories = inventoriesSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                inventory_id: doc.id,
                variant_id: data.variant_id || '',
                variant_group_id: data.variant_group_id || '',
                productName: data.productName || '',
                category: data.category || '',
                types: data.types || '',
                sealing: data.sealing || '',
                location: data.location || '',
                quantity: data.quantity || 0,
                barcode: data.barcode || '',
                ...data,
            };
        });

        console.log('[loadMasterData] Processed', inventories.length, 'inventories');

        return { products, variants, inventories };
    } catch (error) {
        console.error('[loadMasterData] Error:', error);
        throw error;
    }
}

// POST: CSV データのインポート処理
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { records } = body as { records: ImportedPriceRecord[] };

        if (!records || !Array.isArray(records)) {
            return NextResponse.json(
                { error: 'Invalid request: records array is required' },
                { status: 400 }
            );
        }

        console.log('[PriceMasterImport] Processing', records.length, 'records');

        // マスターデータを読み込み
        let products, inventories;
        try {
            const result = await loadMasterData();
            products = result.products;
            inventories = result.inventories;
        } catch (dbError) {
            console.error('[PriceMasterImport] Database error:', dbError);
            return NextResponse.json(
                { error: 'Database connection failed: ' + (dbError instanceof Error ? dbError.message : String(dbError)) },
                { status: 500 }
            );
        }

        // inventories_masterのマップを作成（inventory_idでアクセス）
        const inventoriesMap = new Map(
            inventories.map(inv => [inv.inventory_id, inv])
        );

        // レコードを処理
        const processedRecords = records.map((record) => {
            const hasVariantMapping = record.variantGroupIdRef && record.variantIdRef;

            // inventory_idがある場合、inventories_masterのデータを取得
            const inventoryId = (record as any).inventory_id;
            const inventoryData = inventoryId ? inventoriesMap.get(inventoryId) : null;

            return {
                ...record,
                needsMapping: !hasVariantMapping,
                suggestedProducts: hasVariantMapping ? [] : findSuggestedProducts(
                    record.product_name,
                    record.category,
                    products
                ),
                inventoryData: inventoryData || null, // inventories_masterのデータを追加
            };
        });

        return NextResponse.json({
            success: true,
            records: processedRecords,
            stats: {
                total: records.length,
                mapped: records.filter(r => r.variantGroupIdRef && r.variantIdRef).length,
                needsMapping: records.filter(r => !r.variantGroupIdRef || !r.variantIdRef).length,
            },
        });
    } catch (error) {
        console.error('[PriceMasterImport] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// GET: 商品とバリアント情報の検索
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action');

        if (action === 'search-products') {
            const query = searchParams.get('query') || '';

            const { products } = await loadMasterData();

            const filtered = products.filter(product => {
                const productName = String(product.product_name || '').toLowerCase();
                const seriesId = String(product.series_id || '').toLowerCase();
                const vol = String(product.vol || '').toLowerCase();
                const displayName = String(product.displayName || '').toLowerCase();
                const queryLower = query.toLowerCase();

                // 検索文字列が series_id、product_name、vol、displayName のいずれかに含まれているか
                const matchesQuery = !query ||
                    productName.includes(queryLower) ||
                    seriesId.includes(queryLower) ||
                    vol.includes(queryLower) ||
                    displayName.includes(queryLower);

                return matchesQuery;
            });

            return NextResponse.json({
                success: true,
                products: filtered.slice(0, 50), // 最大50件
            });
        }

        if (action === 'get-variants') {
            const variantGroupId = searchParams.get('variantGroupId');

            if (!variantGroupId) {
                return NextResponse.json(
                    { error: 'variantGroupId is required' },
                    { status: 400 }
                );
            }

            const { variants } = await loadMasterData();

            const filtered = variants.filter(
                v => v.variantGroupIdRef === variantGroupId
            );

            return NextResponse.json({
                success: true,
                variants: filtered,
            });
        }

        if (action === 'get-inventory') {
            const inventoryId = searchParams.get('inventoryId');

            if (!inventoryId) {
                return NextResponse.json(
                    { error: 'inventoryId is required' },
                    { status: 400 }
                );
            }

            const { inventories } = await loadMasterData();

            const inventory = inventories.find(
                inv => inv.inventory_id === inventoryId
            );

            return NextResponse.json({
                success: true,
                inventory: inventory || null,
            });
        }

        return NextResponse.json(
            { error: 'Invalid action parameter' },
            { status: 400 }
        );
    } catch (error) {
        console.error('[PriceMasterImport] GET Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// 商品名とカテゴリから候補を提案
function findSuggestedProducts(
    productName: string,
    category: string,
    products: any[]
): any[] {
    // 明示的に String() で文字列に変換してから toLowerCase() を呼ぶ
    const nameLower = String(productName || '').toLowerCase();
    const categoryLower = String(category || '').toLowerCase();

    const scored = products.map(product => {
        const pName = String(product?.product_name || '').toLowerCase();
        const pSeriesId = String(product?.series_id || '').toLowerCase();
        const pVol = String(product?.vol || '').toLowerCase();
        const pDisplayName = String(product?.displayName || '').toLowerCase();
        const pCategory = String(product?.category || '').toLowerCase();

        let score = 0;

        // カテゴリ完全一致
        if (pCategory === categoryLower) score += 30;

        // 商品名の類似度（各フィールドで検索）
        const nameWords = nameLower.split(/\s+/);
        nameWords.forEach(word => {
            if (pName.includes(word)) score += 10;
            if (pSeriesId.includes(word)) score += 8;
            if (pVol.includes(word)) score += 8;
            if (pDisplayName.includes(word)) score += 12;
        });

        // 完全一致（どれかのフィールドで）
        if (pName === nameLower || pDisplayName === nameLower) score += 50;

        return { product, score };
    });

    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(s => s.product);
}
