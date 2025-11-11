/**
 * Firestore操作ロジック
 * 
 * 責務:
 * - ドキュメント収集（collectDocsForActiveGroup）
 * - Firestore書き込み（writeDocsToFirestore）
 * - グループスナップショット構築（buildUpdatedGroupSnapshot）
 */

import type { AggregatedProduct, ProductDraft, VariantDraft, PendingDoc, FirestoreDoc } from '../components/types';
import type { TaxonomyResolver } from '@/lib/taxonomyResolver';
import { buildProductDoc, buildVariantDoc } from '../components/builders/firestoreBuilders';
import { parseTypesInput, parseDamagesInput, parseSealingInput, numberFromInput } from '../components/utils';
import { getVariantKey } from '../components/keys';

export type FirestoreWriteFailure = { collection: string; id?: string; reason: string };

export interface CollectDocsResult {
    docs: PendingDoc[];
    updatedGroup: AggregatedProduct | null;
}

export interface WriteDocsResult {
    written: number;
    failures: FirestoreWriteFailure[];
}

/**
 * 更新後のグループスナップショットを構築
 */
export function buildUpdatedGroupSnapshot(
    activeGroup: AggregatedProduct,
    productDraft: ProductDraft,
    variantDrafts: Record<string, VariantDraft>
): AggregatedProduct | null {
    if (!activeGroup || !productDraft) return null;

    const effectiveGroupId = (productDraft.variantGroupId || activeGroup.variantGroupId).trim() || activeGroup.variantGroupId;
    const parsedTypes = parseTypesInput(productDraft.typesInput);
    const parsedDamages = parseDamagesInput(productDraft.damagesInput);
    const parsedSealing = parseSealingInput(productDraft.sealingInput);

    const normalizedTypes = parsedTypes.length > 0 ? [parsedTypes[0]] : [];
    const normalizedDamages = parsedDamages.length > 0 ? [parsedDamages[0]] : [];
    const normalizedSealing = parsedSealing.length > 0 ? [parsedSealing[0]] : [];

    const updatedVariants = activeGroup.variants.map((variant) => {
        const draft = variantDrafts[getVariantKey(variant)];
        if (!draft) return variant;
        const quantity = numberFromInput(draft.quantity);
        const unitPrice = numberFromInput(draft.unitPrice);
        return {
            ...variant,
            types: draft.types || variant.types,
            damages: draft.damages || variant.damages,
            sealing: draft.sealing || variant.sealing,
            storageLocation: draft.storageLocation || variant.storageLocation,
            quantity: quantity ?? variant.quantity,
            unitPrice: unitPrice ?? variant.unitPrice,
            statusTokens: draft.statusTokens || variant.statusTokens,
            barcode: draft.barcode || variant.barcode,
            notes: draft.notes || variant.notes,
        };
    });

    const totalQuantity = updatedVariants.reduce((acc, variant) => acc + (variant.quantity ?? 0), 0);

    return {
        ...activeGroup,
        variantGroupId: effectiveGroupId,
        productName: productDraft.productName.trim() || activeGroup.productName,
        category: productDraft.category.trim() || activeGroup.category,
        types: normalizedTypes,
        damages: normalizedDamages,
        sealing: normalizedSealing,
        totalQuantity,
        variants: updatedVariants,
    };
}

/**
 * アクティブグループの変更をPendingDocに収集
 */
export function collectDocsForActiveGroup(
    activeGroup: AggregatedProduct,
    productDraft: ProductDraft,
    variantDrafts: Record<string, VariantDraft>,
    productDiffFields: string[],
    variantDiffs: Array<{ draft: VariantDraft; changedFields: string[] }>,
    taxonomy: TaxonomyResolver
): CollectDocsResult {
    if (!activeGroup || !productDraft) {
        return { docs: [], updatedGroup: null };
    }

    const docs: PendingDoc[] = [];
    const effectiveGroupId = (productDraft.variantGroupId || activeGroup.variantGroupId).trim() || activeGroup.variantGroupId;

    console.log('[collectDocsForActiveGroup] productDiffFields:', productDiffFields);
    console.log('[collectDocsForActiveGroup] activeGroup.productName:', activeGroup.productName);
    console.log('[collectDocsForActiveGroup] productDraft.productName:', productDraft.productName);

    // ステップ1: variant_group_id が変更された場合（統合時）、まずアーカイブを作成
    const isGroupMerge = effectiveGroupId !== activeGroup.variantGroupId;
    const hasVariants = activeGroup.variants && activeGroup.variants.length > 0;

    console.log(`[collectDocsForActiveGroup] isGroupMerge=${isGroupMerge}, hasVariants=${hasVariants}, variants.length=${activeGroup.variants?.length || 0}`);
    console.log(`[collectDocsForActiveGroup] effectiveGroupId=${effectiveGroupId}, activeGroup.variantGroupId=${activeGroup.variantGroupId}`);

    if (isGroupMerge && hasVariants) {
        // バリアントが存在する場合のみ統合処理を実行
        console.log(`[collectDocsForActiveGroup] Group merge detected: ${activeGroup.variantGroupId} → ${effectiveGroupId}`);

        // 1-1. 旧グループをアーカイブコレクションに保存（削除せずコピー）
        docs.push({
            collection: 'products_master_archive',
            doc: {
                id: activeGroup.variantGroupId,
                data: {
                    variant_group_id: activeGroup.variantGroupId,
                    product_name: activeGroup.productName,
                    category: activeGroup.category,
                    types: activeGroup.types,
                    damages: activeGroup.damages,
                    sealing: activeGroup.sealing,
                    mergedInto: effectiveGroupId,
                    archivedAt: new Date().toISOString(),
                    originalData: {
                        variant_skus: activeGroup.variants.map(v => v.variantSku || v.inventoryId),
                        totalQuantity: activeGroup.totalQuantity,
                    },
                },
            },
            summary: `STEP1: Archive / products_master_archive / ${activeGroup.variantGroupId} [merged into ${effectiveGroupId}]`,
        });

        // 1-2. 旧グループをproductsMasterから削除
        docs.push({
            collection: 'productsMaster',
            doc: {
                id: activeGroup.variantGroupId,
                data: {
                    _deleteDoc: true,
                },
            },
            summary: `STEP2: Delete / productsMaster / ${activeGroup.variantGroupId}`,
        });

        // 1-3. すべてのvariantを統合先に移動（3テーブル全て更新）

        // 1-3-1. variantsMaster の更新
        activeGroup.variants.forEach((variant, index) => {
            const typesPart = variant.types || 'unknown';
            const oldVariantId = variant.variantSku || `${activeGroup.variantGroupId}_${typesPart}`;

            // 既存の variant_id から suffix（ハッシュ部分）を抽出
            const suffixMatch = oldVariantId.match(/_([a-f0-9]+)$/);
            const suffix = suffixMatch ? suffixMatch[1] : '03d2ee826b';
            const newVariantIdWithSuffix = `${effectiveGroupId}_${suffix}`;

            docs.push({
                collection: 'variantsMaster',
                doc: {
                    id: oldVariantId,
                    data: {
                        variantGroupIdRef: effectiveGroupId,
                        variant_id: newVariantIdWithSuffix,
                        type: variant.types || 'default',
                        sealing: variant.sealing || '',
                    },
                },
                summary: `STEP1-${index + 1}A: Update variantsMaster / ${oldVariantId} → ${newVariantIdWithSuffix}`,
            });
        });

        // 1-3-2. inventoriesMaster の更新
        activeGroup.variants.forEach((variant, index) => {
            const typesPart = variant.types || 'unknown';
            const oldVariantId = variant.variantSku || `${activeGroup.variantGroupId}_${typesPart}`;
            const newVariantSku = `${effectiveGroupId}_${typesPart}`;
            const productName = productDraft.productName.trim() || activeGroup.productName;

            // 既存の variant_id から suffix（ハッシュ部分）を抽出
            const suffixMatch = oldVariantId.match(/_([a-f0-9]+)$/);
            const suffix = suffixMatch ? suffixMatch[1] : '03d2ee826b';
            const newVariantIdWithSuffix = `${effectiveGroupId}_${suffix}`;

            docs.push({
                collection: 'inventoriesMaster',
                doc: {
                    id: variant.inventoryId,
                    data: {
                        // 既存フィールドを全て保持
                        types: variant.types,
                        damages: variant.damages,
                        sealing: variant.sealing,
                        storageLocation: variant.storageLocation,
                        quantity: variant.quantity,
                        unitPrice: variant.unitPrice,
                        statusTokens: variant.statusTokens,
                        barcode: variant.barcode,
                        notes: variant.notes,
                        createdAt: variant.createdAt,
                        // 統合先への参照を更新
                        variantIdRef: newVariantIdWithSuffix,
                        groupIdRef: effectiveGroupId,
                        productNameRef: productName,
                        variant_sku: newVariantSku,
                        previous_variant_group_id: activeGroup.variantGroupId,
                        updated_at: new Date().toISOString(),
                    },
                },
                summary: `STEP1-${index + 1}B: Update inventoriesMaster / ${variant.inventoryId}`,
            });
        });
    } else if (isGroupMerge && !hasVariants) {
        // バリアントが0件の場合は通常のアーカイブ処理のみ実行（統合せず削除のみ）
        console.log(`[collectDocsForActiveGroup] No variants found for group ${activeGroup.variantGroupId}, archiving without merge`);

        // アーカイブに保存（mergedIntoなし）
        docs.push({
            collection: 'products_master_archive',
            doc: {
                id: activeGroup.variantGroupId,
                data: {
                    variant_group_id: activeGroup.variantGroupId,
                    product_name: activeGroup.productName,
                    category: activeGroup.category,
                    types: activeGroup.types,
                    damages: activeGroup.damages,
                    sealing: activeGroup.sealing,
                    archivedAt: new Date().toISOString(),
                    originalData: {
                        variant_skus: [],
                        totalQuantity: 0,
                    },
                },
            },
            summary: `STEP1: Archive (no variants) / products_master_archive / ${activeGroup.variantGroupId}`,
        });

        // products_masterから削除
        docs.push({
            collection: 'productsMaster',
            doc: {
                id: activeGroup.variantGroupId,
                data: {
                    _deleteDoc: true,
                },
            },
            summary: `STEP2: Delete (no variants) / products_master / ${activeGroup.variantGroupId}`,
        });
    }

    // ステップ2: products_master の変更（新規作成または更新）
    if (productDiffFields.length > 0) {
        const doc = buildProductDoc(activeGroup, productDraft, productDiffFields, taxonomy);
        console.log('[collectDocsForActiveGroup] products_master doc:', doc);
        docs.push({
            ...doc,
            summary: `STEP3: Update product / ${doc.summary}`,
        });
    } else {
        console.log('[collectDocsForActiveGroup] No product changes detected - skipping products_master update');
    }

    // ステップ3: variants の変更
    variantDiffs.forEach((diff, index) => {
        const doc = buildVariantDoc(activeGroup, productDraft, diff.draft, diff.changedFields, taxonomy);
        docs.push({
            ...doc,
            summary: `STEP4-${index + 1}: Update variant / ${doc.summary}`,
        });
    });

    console.log('[collectDocsForActiveGroup] Total docs collected:', docs.length);
    console.log('[collectDocsForActiveGroup] Docs by collection:',
        docs.reduce<Record<string, number>>((acc, doc) => {
            acc[doc.collection] = (acc[doc.collection] || 0) + 1;
            return acc;
        }, {})
    );
    docs.forEach((doc, idx) => {
        console.log(`[collectDocsForActiveGroup] Doc[${idx}]: ${doc.summary}`);
        if (doc.doc.data?._deleteDoc === true) {
            console.log(`  → 🔥🔥🔥 DELETE flag detected for ${doc.collection}/${doc.doc.id}`);
            console.log(`  → Document ID to be deleted: "${doc.doc.id}"`);
            console.log(`  → Collection: "${doc.collection}"`);
        }
    });

    // 削除対象のドキュメントIDリストを出力
    const deleteTargets = docs
        .filter(doc => doc.doc.data?._deleteDoc === true)
        .map(doc => ({ collection: doc.collection, id: doc.doc.id }));

    if (deleteTargets.length > 0) {
        console.log('[collectDocsForActiveGroup] 🔥🔥🔥 DELETE TARGETS:', JSON.stringify(deleteTargets, null, 2));
    }

    // デバッグ: バリアント情報をalertで表示（一時的）
    if (isGroupMerge) {
        const collectionCounts = docs.reduce<Record<string, number>>((acc, doc) => {
            acc[doc.collection] = (acc[doc.collection] || 0) + 1;
            return acc;
        }, {});
        const debugInfo = `統合処理デバッグ:\n` +
            `isGroupMerge: ${isGroupMerge}\n` +
            `hasVariants: ${hasVariants}\n` +
            `variants.length: ${activeGroup.variants?.length || 0}\n` +
            `Total docs: ${docs.length}\n` +
            `Collections: ${JSON.stringify(collectionCounts)}`;
        alert(debugInfo);
    }

    return {
        docs,
        updatedGroup: buildUpdatedGroupSnapshot(activeGroup, productDraft, variantDrafts)
    };
}

/**
 * PendingDocをFirestoreへ書き込み
 */
export async function writeDocsToFirestore(docs: PendingDoc[]): Promise<WriteDocsResult> {
    console.log(`[writeDocsToFirestore] Total docs to write: ${docs.length}`);

    const grouped = docs.reduce<Record<string, FirestoreDoc[]>>((acc, item) => {
        if (!acc[item.collection]) acc[item.collection] = [];
        acc[item.collection].push(item.doc);
        return acc;
    }, {});

    console.log('[writeDocsToFirestore] Grouped collections:', Object.keys(grouped));
    console.log('[writeDocsToFirestore] Document counts:', Object.entries(grouped).map(([col, docs]) => `${col}: ${docs.length}`).join(', '));

    let totalWritten = 0;
    const failures: FirestoreWriteFailure[] = [];
    const UPLOAD_CHUNK_LIMIT = 100;

    for (const [collection, payload] of Object.entries(grouped)) {
        if (payload.length === 0) continue;
        console.log(`[writeDocsToFirestore] Processing collection: ${collection}, docs: ${payload.length}`);

        for (let i = 0; i < payload.length; i += UPLOAD_CHUNK_LIMIT) {
            const slice = payload.slice(i, i + UPLOAD_CHUNK_LIMIT);
            console.log(`[writeDocsToFirestore] → chunk ${Math.floor(i / UPLOAD_CHUNK_LIMIT) + 1} (${slice.length} docs)`);

            // デバッグ: ペイロードの詳細をログ出力
            slice.forEach((doc, idx) => {
                if (doc.data?._deleteDoc === true) {
                    console.log(`[writeDocsToFirestore] DELETE operation [${i + idx}]: ${collection}/${doc.id}`);
                } else {
                    console.log(`[writeDocsToFirestore] SET operation [${i + idx}]: ${collection}/${doc.id}`);
                }
            });

            try {
                const requestBody = { collection, docs: slice };
                console.log(`[writeDocsToFirestore] Request body chunk:`, JSON.stringify(requestBody, null, 2));

                // Use absolute URL to avoid potential relative-path issues in some hosting setups
                const uploadUrl = (typeof window !== 'undefined' && window.location && window.location.origin)
                    ? `${window.location.origin}/api/products-import/upload`
                    : '/api/products-import/upload';

                // Log approximate payload size to help debug network/timeout issues
                let bodyStr = '';
                try {
                    bodyStr = JSON.stringify(requestBody);
                    console.log(`[writeDocsToFirestore] Request body chunk size: ${bodyStr.length} bytes`);
                    console.log(`[writeDocsToFirestore] About to fetch to URL: ${uploadUrl}`);
                    console.log(`[writeDocsToFirestore] DELETE operations in this chunk: ${slice.filter(d => d?.data?._deleteDoc === true).length}`);
                } catch (err) {
                    console.log('[writeDocsToFirestore] Failed to compute request body size:', err);
                }

                console.log(`[writeDocsToFirestore] 🚀 Starting fetch request...`);
                const res = await fetch(uploadUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: bodyStr || JSON.stringify(requestBody),
                });
                console.log(`[writeDocsToFirestore] ✅ Fetch completed! ${collection} chunk response: ${res.status}`);
                if (!res.ok) {
                    const text = await res.text();
                    console.error(`[writeDocsToFirestore] ${collection} chunk failed:`, text);
                    failures.push({ collection, reason: text || `HTTP ${res.status}` });
                    continue;
                }
                const result = await res.json();
                console.log(`[writeDocsToFirestore] ${collection} chunk result:`, result);
                totalWritten += Number(result?.written || 0);
                const failedItems = Array.isArray(result?.failed) ? result.failed : [];
                failedItems.forEach((item: any) => {
                    failures.push({ collection, id: item?.id, reason: item?.reason || 'unknown error' });
                });
            } catch (error) {
                // Enhance network error logging for diagnosis
                console.error(`[writeDocsToFirestore] ❌ ${collection} chunk exception:`, error);
                console.error(`[writeDocsToFirestore] Error type: ${error?.constructor?.name || typeof error}`);
                console.error(`[writeDocsToFirestore] Collection: ${collection}, Chunk size: ${slice.length}`);
                try {
                    console.error('[writeDocsToFirestore] navigator.onLine =', typeof navigator !== 'undefined' ? navigator.onLine : 'n/a');
                } catch {
                    // ignore
                }
                if (error instanceof Error) {
                    console.error('[writeDocsToFirestore] error.message:', error.message);
                    console.error('[writeDocsToFirestore] error.stack:', error.stack);
                }
                // Log the operation details that failed
                try {
                    const deleteCount = slice.filter(d => d?.data?._deleteDoc === true).length;
                    const setCount = slice.length - deleteCount;
                    console.error(`[writeDocsToFirestore] Failed chunk had ${deleteCount} DELETE and ${setCount} SET operations`);
                } catch (e) {
                    console.error('[writeDocsToFirestore] Could not log operation counts:', e);
                }
                failures.push({ collection, reason: error instanceof Error ? error.message : String(error) });
            }
        }
    }

    return { written: totalWritten, failures };
}
