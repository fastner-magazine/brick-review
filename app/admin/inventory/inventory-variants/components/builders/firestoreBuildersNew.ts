/**
 * 新しい3テーブル正規化構造用のFirestoreビルダー
 * products_master / variants_master / inventory_master
 */

import type { ProductDraft, VariantDraft, AggregatedProduct } from '../types';

export type FirestoreOperation = {
    collection: 'products_master' | 'variants_master' | 'inventory_master' |
                'products_master_archive' | 'variants_master_archive' | 'inventory_master_archive';
    action: 'set' | 'update' | 'delete';
    docId: string;
    data?: Record<string, any>;
};

/**
 * products_master ドキュメントを構築
 */
export function buildProductMasterDoc(
    draft: ProductDraft,
    activeGroup: AggregatedProduct
): FirestoreOperation {
    const variant_group_id = (draft.variantGroupId || activeGroup.variantGroupId).trim();
    const now = new Date().toISOString();

    return {
        collection: 'products_master',
        action: 'set',
        docId: variant_group_id,
        data: {
            variant_group_id,
            product_name: draft.productName.trim(),
            category: draft.category.trim(),
            updated_at: now,
        },
    };
}

/**
 * variants_master ドキュメントを構築
 */
export function buildVariantMasterDoc(
    variantDraft: VariantDraft,
    productDraft: ProductDraft,
    activeGroup: AggregatedProduct
): FirestoreOperation {
    const variant_group_id = (productDraft.variantGroupId || activeGroup.variantGroupId).trim();
    const variant_id = variantDraft.variantSku; // variant_id として使用
    const now = new Date().toISOString();

    return {
        collection: 'variants_master',
        action: 'set',
        docId: variant_id,
        data: {
            variant_id,
            variantGroupIdRef: variant_group_id,
            type: variantDraft.types.trim(),
            sealing: variantDraft.sealing.trim(),
            updated_at: now,
        },
    };
}

/**
 * inventory_master ドキュメントを構築
 */
export function buildInventoryMasterDoc(
    variantDraft: VariantDraft
): FirestoreOperation {
    const now = new Date().toISOString();

    return {
        collection: 'inventory_master',
        action: 'set',
        docId: variantDraft.inventoryId,
        data: {
            inventory_id: variantDraft.inventoryId,
            variantIdRef: variantDraft.variantSku,
            location: variantDraft.storageLocation.trim(),
            quantity: Number(variantDraft.quantity) || 0,
            damages: variantDraft.damages.trim(),
            note: variantDraft.notes.trim(),
            barcode: variantDraft.barcode.trim(),
            status: variantDraft.statusTokens.trim(),
            updated_at: now,
        },
    };
}

/**
 * アーカイブ操作を構築（削除前に保存）
 */
export function buildArchiveOperation(
    collection: 'products_master' | 'variants_master' | 'inventory_master',
    docId: string,
    data: Record<string, any>,
    reason: string
): FirestoreOperation {
    const archiveCollection = `${collection}_archive` as 'products_master_archive' | 'variants_master_archive' | 'inventory_master_archive';
    
    return {
        collection: archiveCollection,
        action: 'set',
        docId,
        data: {
            ...data,
            archivedAt: new Date().toISOString(),
            archiveReason: reason,
        },
    };
}

/**
 * 削除操作を構築
 */
export function buildDeleteOperation(
    collection: 'products_master' | 'variants_master' | 'inventory_master',
    docId: string
): FirestoreOperation {
    return {
        collection,
        action: 'delete',
        docId,
    };
}

/**
 * 商品統合時の操作セットを構築
 * 1. 旧products_masterをアーカイブ
 * 2. 旧products_masterを削除
 * 3. すべてのvariantsのvariantGroupIdRefを更新
 */
export function buildMergeOperations(
    fromGroup: AggregatedProduct,
    toGroupId: string
): FirestoreOperation[] {
    console.log('[firestoreBuildersNew.buildMergeOperations] 🚀 Building merge operations');
    console.log('[firestoreBuildersNew.buildMergeOperations] From:', fromGroup.variantGroupId, fromGroup.productName);
    console.log('[firestoreBuildersNew.buildMergeOperations] From docid:', fromGroup.docid);
    console.log('[firestoreBuildersNew.buildMergeOperations] To:', toGroupId);
    console.log('[firestoreBuildersNew.buildMergeOperations] Variants to update:', fromGroup.variants.length);
    
    const operations: FirestoreOperation[] = [];

    // ドキュメントIDとして使用する値（優先順位: docid > variant_group_id）
    // 新しいデータではvariant_group_idがドキュメントIDになっているため、
    // docidがない場合はvariant_group_idを使用
    const fromDocId = fromGroup.docid || fromGroup.variantGroupId;
    console.log('[firestoreBuildersNew.buildMergeOperations] Using document ID:', fromDocId);

    // 1. 旧グループをアーカイブ
    console.log('[firestoreBuildersNew.buildMergeOperations] Adding archive operation');
    operations.push(
        buildArchiveOperation(
            'products_master',
            fromDocId, // ドキュメントIDを使用
            {
                variant_group_id: fromGroup.variantGroupId,
                product_name: fromGroup.productName,
                category: fromGroup.category,
            },
            `merged_into_${toGroupId}`
        )
    );

    // 2. 旧グループを削除
    console.log('[firestoreBuildersNew.buildMergeOperations] 🔥🔥🔥 Adding DELETE operation for docId:', fromDocId);
    console.log('[firestoreBuildersNew.buildMergeOperations] (variant_group_id:', fromGroup.variantGroupId, ')');
    operations.push(
        buildDeleteOperation('products_master', fromDocId) // ドキュメントIDを使用
    );

    // 3. すべてのバリアントのvariantGroupIdRefを更新
    console.log('[firestoreBuildersNew.buildMergeOperations] Adding variant update operations');
    fromGroup.variants.forEach((variant, idx) => {
        console.log(`[firestoreBuildersNew.buildMergeOperations]   Variant[${idx}]:`, variant.variantSku);
        operations.push({
            collection: 'variants_master',
            action: 'update',
            docId: variant.variantSku,
            data: {
                variantGroupIdRef: toGroupId,
                updated_at: new Date().toISOString(),
            },
        });
    });

    console.log('[firestoreBuildersNew.buildMergeOperations] ✅ Built', operations.length, 'operations');
    return operations;
}

/**
 * FirestoreOperationをAPI用のリクエスト形式に変換
 */
export function operationsToApiRequest(operations: FirestoreOperation[]) {
    return {
        operations: operations.map(op => ({
            collection: op.collection,
            action: op.action,
            docId: op.docId,
            data: op.data,
        })),
    };
}

/**
 * API経由でFirestore操作を実行
 */
export async function executeOperations(operations: FirestoreOperation[]): Promise<{
    success: boolean;
    written: number;
    errors?: string[];
}> {
    console.log('[firestoreBuildersNew.executeOperations] 🚀 Executing operations via API');
    console.log('[firestoreBuildersNew.executeOperations] Total operations:', operations.length);
    
    const payload = operationsToApiRequest(operations);
    console.log('[firestoreBuildersNew.executeOperations] Request payload:', JSON.stringify(payload, null, 2));
    
    // Use absolute URL to ensure proper routing
    const apiUrl = (typeof window !== 'undefined' && window.location && window.location.origin)
        ? `${window.location.origin}/api/normalized-data`
        : '/api/normalized-data';
    
    console.log('[firestoreBuildersNew.executeOperations] 🌐 Fetching URL:', apiUrl);
    console.log('[firestoreBuildersNew.executeOperations] Request body size:', JSON.stringify(payload).length, 'bytes');
    
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    console.log('[firestoreBuildersNew.executeOperations] Response status:', response.status);

    if (!response.ok) {
        console.error('[firestoreBuildersNew.executeOperations] ❌ API error:', response.status);
        throw new Error(`API error: ${response.status}`);
    }

    const result = await response.json();
    console.log('[firestoreBuildersNew.executeOperations] ✅ Response:', result);
    return result;
}
