import { NextResponse, NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

type AggregatedVariant = {
    inventoryId: string;
    variantSku: string;
    types: string;
    damages: string;
    sealing: string;
    storageLocation: string;
    quantity: number;
    unitPrice: number | null;
    statusTokens: string;
    barcode: string;
    notes: string;
    updatedAt: string;
    createdAt: string;
};

type AggregatedProduct = {
    variantGroupId: string;
    seriesId?: string;
    productName: string;
    vol?: string;
    displayName?: string;
    releaseDate?: string;
    category: string;
    types: string[];
    damages: string[];
    sealing: string[];
    totalQuantity: number;
    variants: AggregatedVariant[];
};

function parseNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const num = typeof value === 'number' ? value : parseFloat(String(value));
    return isNaN(num) ? null : num;
}

/**
 * Firestore Timestamp を JST (UTC+9) の文字列に変換します。
 * @param timestamp Firestore の Timestamp オブジェクト (seconds, nanoseconds) または文字列
 * @returns "YYYY/MM/DD HH:MM:SS" 形式の JST 文字列
 */
function formatTimestampToJST(timestamp: any): string {
    if (!timestamp) return '';

    try {
        let date: Date;

        // Firestore Timestamp オブジェクト ({ _seconds, _nanoseconds } または { seconds, nanoseconds })
        if (timestamp._seconds !== undefined || timestamp.seconds !== undefined) {
            const seconds = timestamp._seconds ?? timestamp.seconds;
            date = new Date(seconds * 1000);
        }
        // 既に Date オブジェクト
        else if (timestamp instanceof Date) {
            date = timestamp;
        }
        // toDate() メソッドを持つ Firestore Timestamp
        else if (typeof timestamp.toDate === 'function') {
            date = timestamp.toDate();
        }
        // 文字列の場合はそのまま返す
        else if (typeof timestamp === 'string') {
            return timestamp;
        }
        else {
            return '';
        }

        // UTC+9 (JST) に変換して表示
        const jstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
        const year = jstDate.getUTCFullYear();
        const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(jstDate.getUTCDate()).padStart(2, '0');
        const hours = String(jstDate.getUTCHours()).padStart(2, '0');
        const minutes = String(jstDate.getUTCMinutes()).padStart(2, '0');
        const seconds = String(jstDate.getUTCSeconds()).padStart(2, '0');

        return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
        console.error('Timestamp format error:', error);
        return '';
    }
}

/**
 * 検索用の正規化関数
 * - 全角→半角変換
 * - 大文字→小文字変換
 * - 記号（-_スペース等）を除去
 * 
 * 例: "OP-03" → "op03", "ＯＰ－０３" → "op03"
 */
function normalizeSearchTerm(text: string): string {
    if (!text) return '';

    return text
        // 全角英数字を半角に変換
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        // 小文字に変換
        .toLowerCase()
        // 記号（ハイフン、アンダースコア、スペース等）を除去
        .replace(/[-_\s]/g, '');
}

export async function GET(request: NextRequest) {
    try {
        console.log('[inventory-variants] Starting GET request...');
        console.log('[inventory-variants] Request URL:', request.url);

        // 必要なフィールドのみを選択してデータ転送量を削減
        const productFields = [
            'variant_group_id',
            'variantGroupId',
            'series_id',
            'productName',
            'vol',
            'display_name',
            'release_date',
            'category',
            'types',
            'damages',
            'sealing'
        ];

        const variantFields = [
            'variant_id',
            'variantGroupIdRef',
            'variant_group_id',
            'types',
            'damages',
            'sealing'
        ];

        const inventoryFields = [
            'variantIdRef',
            'variant_sku',
            'types',
            'types_raw',
            'damages',
            'damages_raw',
            'sealing',
            'sealing_raw',
            'storage',
            'storage_location',
            'quantity',
            'unit_price',
            'status_tokens',
            'status_tokens_raw',
            'barcode',
            'notes',
            'updated_at',
            'created_at'
        ];

        // クエリパラメータからlimit、category、search、variantGroupId、page、listOnly を取得
        const { searchParams } = new URL(request.url);
        const limitParam = searchParams.get('limit');
        const categoryParam = searchParams.get('category');
        const searchParam = searchParams.get('search');
        const variantGroupIdParam = searchParams.get('variantGroupId');
        const pageParam = searchParams.get('page');
        const showAll = searchParams.get('showAll') === 'true';
        const listOnly = searchParams.get('listOnly') === 'true'; // 商品リストのみ取得（variants/inventory不要）

        const limit = limitParam ? parseInt(limitParam, 10) : 50; // デフォルト50件
        const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1; // デフォルト1ページ目

        // 変数宣言（グローバルスコープ）
        let productsSnapshot: any;
        let variantsSnapshot: any;
        let inventorySnapshot: any;

        // 特定の商品グループのみを取得する場合（保存後の部分更新用）
        if (variantGroupIdParam) {
            try {
                // productsMasterから特定グループを取得（必要なフィールドのみ）
                productsSnapshot = await adminDb.collection('productsMaster')
                    .where('variant_group_id', '==', variantGroupIdParam)
                    .select(...productFields)
                    .get();

                if (productsSnapshot.empty) {
                    return NextResponse.json({
                        generatedAt: new Date().toISOString(),
                        totalGroups: 0,
                        items: [],
                        limited: false,
                        message: `Group ${variantGroupIdParam} not found`
                    });
                }

                // variantsMasterからこのグループに属するバリアントを取得（必要なフィールドのみ）
                variantsSnapshot = await adminDb.collection('variantsMaster')
                    .where('variantGroupIdRef', '==', variantGroupIdParam)
                    .select(...variantFields)
                    .get();

                // inventoriesMasterからこのグループに属する在庫を取得
                // variantIdRef が vg_{groupId}_* の形式なので、variant_idsから取得
                const variantIds = variantsSnapshot.docs.map(doc => doc.data().variant_id || doc.id);

                let inventoryDocs: any[] = [];
                if (variantIds.length > 0) {
                    // Firestoreの in クエリは最大10件まで
                    const chunks: string[][] = [];
                    for (let i = 0; i < variantIds.length; i += 10) {
                        chunks.push(variantIds.slice(i, i + 10));
                    }

                    const inventorySnapshots = await Promise.all(
                        chunks.map(chunk =>
                            adminDb.collection('inventoriesMaster')
                                .where('variantIdRef', 'in', chunk)
                                .select(...inventoryFields)
                                .get()
                        )
                    );

                    inventoryDocs = inventorySnapshots.flatMap(snap => snap.docs);
                }

                // Snapshotライクなオブジェクトに変換
                inventorySnapshot = {
                    docs: inventoryDocs,
                    size: inventoryDocs.length
                };
            } catch (error) {
                console.error('[inventory-variants] Error fetching specific group:', error);
                throw error; // 外側のcatchブロックでハンドリング
            }

            // 通常フローと同じ集約処理を実行
            // productsSnapshot, variantsSnapshot, inventorySnapshot が定義済み
            // 下記の集約ロジックで使用される（通常フローと合流）
        } else {
            // 特定グループ取得でない場合の通常の取得処理

            // 検索がない場合で showAll=false の場合は空の結果を返す（初期状態）
            if (!searchParam && !showAll && !categoryParam) {
                console.log('[inventory-variants] No search/showAll - returning empty result');
                return NextResponse.json({
                    generatedAt: new Date().toISOString(),
                    totalGroups: 0,
                    items: [],
                    limited: false,
                    message: 'Use search or showAll=true to fetch data'
                });
            }

            console.log('[inventory-variants] Search params:', { searchParam, showAll, categoryParam });

            // 検索文字列がある場合は商品名フィールドで範囲検索
            let productsQuery: any = adminDb.collection('productsMaster');

            // カテゴリーフィルター
            if (categoryParam && categoryParam !== 'all') {
                productsQuery = productsQuery.where('category', '==', categoryParam);
            }

            // 商品名検索（series_id, productName, vol のいずれかで検索）
            // 正規化フィールド（_normalized）を使用してあいまい検索を実現
            // Firestoreは複数フィールドのOR検索ができないため、3つのクエリを実行して結合
            if (searchParam && searchParam.trim()) {
                console.log('[inventory-variants] Performing search for:', searchParam);
                const searchNormalized = normalizeSearchTerm(searchParam.trim());
                console.log('[inventory-variants] Normalized search term:', searchNormalized);

                // まず正規化フィールドで検索を試行
                const [seriesResults, nameResults, volResults] = await Promise.all([
                    // series_id_normalized で検索（必要なフィールドのみ選択）
                    productsQuery
                        .where('series_id_normalized', '>=', searchNormalized)
                        .where('series_id_normalized', '<=', searchNormalized + '\uf8ff')
                        .select(...productFields)
                        .get()
                        .catch(() => ({ docs: [], size: 0 })), // フィールドが存在しない場合は空結果を返す
                    // productName_normalized で検索（必要なフィールドのみ選択）
                    productsQuery
                        .where('productName_normalized', '>=', searchNormalized)
                        .where('productName_normalized', '<=', searchNormalized + '\uf8ff')
                        .select(...productFields)
                        .get()
                        .catch(() => ({ docs: [], size: 0 })),
                    // vol_normalized で検索（必要なフィールドのみ選択）
                    productsQuery
                        .where('vol_normalized', '>=', searchNormalized)
                        .where('vol_normalized', '<=', searchNormalized + '\uf8ff')
                        .select(...productFields)
                        .get()
                        .catch(() => ({ docs: [], size: 0 }))
                ]);

                // 結果をマージ（重複を除去）
                const allDocs = new Map();
                [seriesResults, nameResults, volResults].forEach(snapshot => {
                    snapshot.docs.forEach(doc => {
                        if (!allDocs.has(doc.id)) {
                            allDocs.set(doc.id, doc);
                        }
                    });
                });

                console.log(`[inventory-variants] Search results - series: ${seriesResults.size}, name: ${nameResults.size}, vol: ${volResults.size}, total unique: ${allDocs.size}`);

                // 正規化フィールドでの検索結果が0件の場合、通常フィールドで検索（フォールバック）
                if (allDocs.size === 0) {
                    console.log('[inventory-variants] No results from normalized search, trying fallback...');
                    const searchLower = searchParam.trim().toLowerCase();

                    const [seriesFallback, nameFallback, volFallback] = await Promise.all([
                        // series_id で検索
                        productsQuery
                            .where('series_id', '>=', searchLower)
                            .where('series_id', '<=', searchLower + '\uf8ff')
                            .select(...productFields)
                            .get()
                            .catch(() => ({ docs: [], size: 0 })),
                        // productName で検索
                        productsQuery
                            .where('productName', '>=', searchLower)
                            .where('productName', '<=', searchLower + '\uf8ff')
                            .select(...productFields)
                            .get()
                            .catch(() => ({ docs: [], size: 0 })),
                        // vol で検索
                        productsQuery
                            .where('vol', '>=', searchLower)
                            .where('vol', '<=', searchLower + '\uf8ff')
                            .select(...productFields)
                            .get()
                            .catch(() => ({ docs: [], size: 0 }))
                    ]);

                    [seriesFallback, nameFallback, volFallback].forEach(snapshot => {
                        snapshot.docs.forEach(doc => {
                            if (!allDocs.has(doc.id)) {
                                allDocs.set(doc.id, doc);
                            }
                        });
                    });
                }

                // マージした結果をSnapshotライクなオブジェクトに変換
                productsSnapshot = {
                    docs: Array.from(allDocs.values()),
                    size: allDocs.size
                };
            } else {
                // 検索なしの場合は全件取得（必要なフィールドのみ選択）
                productsSnapshot = await productsQuery.select(...productFields).get();
            }

            // listOnly=true の場合は variants と inventory を取得しない（商品リストのみ）
            if (listOnly) {
                variantsSnapshot = { docs: [], size: 0 };
                inventorySnapshot = { docs: [], size: 0 };
            } else {
                // variants と inventory も必要なフィールドのみ選択
                variantsSnapshot = await adminDb.collection('variantsMaster')
                    .select(...variantFields)
                    .get();
                inventorySnapshot = await adminDb.collection('inventoriesMaster')
                    .select(...inventoryFields)
                    .get();
            }
        }

        // ここから共通の集約処理（特定グループ取得と通常取得の両方で実行）

        // variantsMaster を variant_id でマップ化
        const variantById: Record<string, any> = {};
        variantsSnapshot.docs.forEach((doc) => {
            const data = doc.data();
            const variantId = data.variant_id || doc.id;
            variantById[variantId] = {
                id: doc.id,
                variant_id: variantId,
                variantGroupIdRef: data.variantGroupIdRef || data.variant_group_id || '',
                ...data,
            };
        });

        // productsMaster を variantGroupId でグループ化
        const productsByGroupId: Record<string, any[]> = {};
        productsSnapshot.docs.forEach((doc) => {
            const data = doc.data();
            const variantGroupId = data.variant_group_id || data.variantGroupId || '';
            if (!variantGroupId) return;

            if (!productsByGroupId[variantGroupId]) {
                productsByGroupId[variantGroupId] = [];
            }
            productsByGroupId[variantGroupId].push({ id: doc.id, ...data });
        });

        // inventoriesMaster を処理して variantGroupId でグループ化
        const inventoryByGroupId: Record<string, AggregatedVariant[]> = {};
        inventorySnapshot.docs.forEach((doc) => {
            const data = doc.data();

            // variantIdRef のフォーマットを確認
            const variantIdRef = data.variantIdRef || '';
            if (!variantIdRef) {
                // variantIdRefがない在庫アイテムはスキップ
                return;
            }

            // variantIdRef が "vg_xxx_yyy" 形式の場合、variant_group_id として扱う
            // variantIdRef が variantsMaster.variant_id を指している場合、variant から解決
            let variantGroupId = '';
            let variantData: any = null;

            // まず variantsMaster から探す
            const variant = variantById[variantIdRef];
            if (variant) {
                // 正常な参照チェーン: inventory → variant → product
                variantGroupId = variant.variantGroupIdRef;
                variantData = variant;
            } else if (variantIdRef.startsWith('vg_')) {
                // variantIdRef が直接 variant_group_id の場合（スキーマ不整合）
                // フォーマット: vg_{variant_group_id}_{suffix}
                const parts = variantIdRef.split('_');
                if (parts.length >= 3) {
                    // 最後のサフィックスを除いた部分を variant_group_id とする
                    variantGroupId = parts.slice(0, parts.length - 1).join('_');
                    console.warn(`[inventory-variants] inventory ${doc.id} has direct variant_group_id reference: ${variantIdRef} → ${variantGroupId}`);
                }
            }

            if (!variantGroupId) {
                console.warn(`[inventory-variants] Cannot resolve variant_group_id for inventory ${doc.id} (variantIdRef: ${variantIdRef})`);
                return;
            }

            const typeValue = data.types || data.types_raw || (variantData ? variantData.type : '') || '';
            const damagesValue = data.damages || data.damages_raw || '';
            const sealingValue = data.sealing || data.sealing_raw || (variantData ? variantData.sealing : '') || '';
            const storageValue = data.storage || data.storage_location || data.location || '';

            const aggregatedVariant: AggregatedVariant = {
                inventoryId: data.inventory_id || doc.id,
                variantSku: data.variant_sku || (variantData ? variantData.variant_id : '') || '',
                types: typeValue,
                damages: damagesValue,
                sealing: sealingValue,
                storageLocation: storageValue,
                quantity: parseNumber(data.quantity) ?? 0,
                unitPrice: parseNumber(data.unit_price),
                statusTokens: data.status_tokens || data.status || '',  // status_tokensを優先
                barcode: data.barcode || '',
                notes: data.notes || data.note || '',  // notesを優先
                updatedAt: formatTimestampToJST(data.updated_at || data.updatedAt),
                createdAt: formatTimestampToJST(data.created_at || data.createdAt),
            };

            if (!inventoryByGroupId[variantGroupId]) {
                inventoryByGroupId[variantGroupId] = [];
            }
            inventoryByGroupId[variantGroupId].push(aggregatedVariant);
        });

        // AggregatedProduct を構築
        const aggregated: AggregatedProduct[] = [];

        Object.entries(productsByGroupId).forEach(([variantGroupId, products]) => {
            if (products.length === 0) return;

            // productsMaster から商品情報を取得（信頼できる情報源）
            const firstProduct = products[0];
            const seriesId = firstProduct.series_id || '';
            const productName = firstProduct.productName || '';
            const vol = firstProduct.vol || '';
            const category = firstProduct.category || '';

            // 発売日の処理（Firestore Timestampから変換）
            let releaseDate: string | undefined = undefined;
            if (firstProduct.release_date) {
                try {
                    const timestamp = firstProduct.release_date;
                    if (timestamp?._seconds) {
                        // Firestore Timestamp形式
                        releaseDate = new Date(timestamp._seconds * 1000).toISOString();
                    } else if (typeof timestamp === 'string') {
                        // ISO文字列形式
                        releaseDate = timestamp;
                    }
                } catch (e) {
                    console.warn(`[inventory-variants] Failed to parse release_date for ${variantGroupId}:`, e);
                }
            }

            // 表示用の結合名を生成
            let displayName = productName;
            if (seriesId || vol) {
                const parts = [seriesId, productName, vol].filter(Boolean);
                displayName = parts.join(' ');
            }

            const typesSet = new Set<string>();
            const damagesSet = new Set<string>();
            const sealingSet = new Set<string>();

            // productsMaster からの types, damages, sealing を収集
            products.forEach((product) => {
                if (product.types) typesSet.add(product.types);
                if (product.damages) {
                    const damageIds = String(product.damages).split('|').map((t) => t.trim());
                    damageIds.forEach((id) => { if (id) damagesSet.add(id); });
                }
                if (product.sealing) sealingSet.add(product.sealing);
            });

            // inventoriesMaster からの variants と追加属性を収集
            const variants = inventoryByGroupId[variantGroupId] || [];
            variants.forEach((variant) => {
                if (variant.types) typesSet.add(variant.types);
                if (variant.damages) {
                    const damageIds = variant.damages.split('|').map((t) => t.trim());
                    damageIds.forEach((id) => { if (id) damagesSet.add(id); });
                }
                if (variant.sealing) sealingSet.add(variant.sealing);
            });

            const totalQuantity = variants.reduce((acc, v) => acc + (v.quantity ?? 0), 0);

            aggregated.push({
                variantGroupId,
                seriesId: seriesId || undefined,
                productName,
                vol: vol || undefined,
                displayName,
                releaseDate,
                category,
                types: Array.from(typesSet),
                damages: Array.from(damagesSet),
                sealing: Array.from(sealingSet),
                totalQuantity,
                variants: variants.sort((a, b) => {
                    if (a.variantSku && b.variantSku) {
                        const diff = a.variantSku.localeCompare(b.variantSku);
                        if (diff !== 0) return diff;
                    }
                    // inventoryId は数値の可能性があるため、文字列に変換して比較
                    const idA = String(a.inventoryId || '');
                    const idB = String(b.inventoryId || '');
                    return idA.localeCompare(idB);
                }),
            });
        });

        aggregated.sort((a, b) => {
            const nameA = String(a.productName || '');
            const nameB = String(b.productName || '');
            return nameA.localeCompare(nameB, 'ja');
        });

        // サーバー側ページネーション
        const totalItems = aggregated.length;
        const totalPages = Math.ceil(totalItems / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const resultItems = aggregated.slice(startIndex, endIndex);

        return NextResponse.json({
            generatedAt: new Date().toISOString(),
            totalGroups: totalItems,
            currentPage: page,
            totalPages,
            limit,
            items: resultItems,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        });
    } catch (error) {
        console.error('[inventory-variants] CRITICAL ERROR:', error);
        console.error('[inventory-variants] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.error('[inventory-variants] Error message:', error instanceof Error ? error.message : String(error));
        return NextResponse.json(
            {
                error: 'Failed to load inventory/product data from Firestore.',
                details: error instanceof Error ? error.message : String(error)
            },
            { status: 500 },
        );
    }
}
