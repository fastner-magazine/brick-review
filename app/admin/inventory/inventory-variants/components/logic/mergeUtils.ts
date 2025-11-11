/**
 * 商品統合処理の簡潔なユーティリティ
 */

import type { AggregatedProduct, MergeContext } from '../types';
import { buildMergeOperations, executeOperations } from '../builders/firestoreBuildersNew';
import { detectVariantConflicts } from '../logic/conflicts';

/**
 * 統合可能かチェックし、コンテキストを返す
 */
export function prepareMerge(
    fromGroup: AggregatedProduct,
    toGroup: AggregatedProduct
): MergeContext {
    // バリアント衝突を検出（新型で渡すため一旦変換）
    const fromVariants = fromGroup.variants.map(v => ({
        variant_id: v.variantSku,
        inventory_id: v.inventoryId,
        type: v.types,
        sealing: v.sealing,
        location: v.storageLocation,
        quantity: v.quantity,
        damages: v.damages,
        note: v.notes,
        barcode: v.barcode,
        status: v.statusTokens,
        created_at: v.createdAt,
        updated_at: v.updatedAt,
    }));

    const toVariants = toGroup.variants.map(v => ({
        variant_id: v.variantSku,
        inventory_id: v.inventoryId,
        type: v.types,
        sealing: v.sealing,
        location: v.storageLocation,
        quantity: v.quantity,
        damages: v.damages,
        note: v.notes,
        barcode: v.barcode,
        status: v.statusTokens,
        created_at: v.createdAt,
        updated_at: v.updatedAt,
    }));

    const conflicts = detectVariantConflicts(fromVariants, toVariants);

    return {
        fromGroup,
        toGroup,
        conflicts,
    };
}

/**
 * 統合を実行（衝突なしの場合）
 */
export async function executeMerge(context: MergeContext): Promise<{
    success: boolean;
    message: string;
}> {
    console.log('[mergeUtils.executeMerge] 🚀 Starting merge execution');
    console.log('[mergeUtils.executeMerge] Context:', {
        fromGroupId: context.fromGroup.variantGroupId,
        toGroupId: context.toGroup.variantGroupId,
        conflictsCount: context.conflicts.length,
    });
    
    if (context.conflicts.length > 0) {
        console.warn('[mergeUtils.executeMerge] ❌ Cannot merge: conflicts detected');
        return {
            success: false,
            message: `${context.conflicts.length}件のバリアント衝突があります。先に解決してください。`,
        };
    }

    try {
        console.log('[mergeUtils.executeMerge] Building merge operations...');
        const operations = buildMergeOperations(
            context.fromGroup,
            context.toGroup.variantGroupId
        );
        
        console.log('[mergeUtils.executeMerge] Operations built:', {
            totalOps: operations.length,
            byCollection: operations.reduce<Record<string, number>>((acc, op) => {
                acc[op.collection] = (acc[op.collection] || 0) + 1;
                return acc;
            }, {}),
        });

        console.log('[mergeUtils.executeMerge] Executing operations...');
        const result = await executeOperations(operations);
        console.log('[mergeUtils.executeMerge] Operations result:', result);

        if (!result.success) {
            console.error('[mergeUtils.executeMerge] ❌ Operations failed:', result.errors);
            return {
                success: false,
                message: `統合処理でエラーが発生しました: ${result.errors?.join(', ')}`,
            };
        }

        console.log('[mergeUtils.executeMerge] ✅ Merge completed successfully');
        return {
            success: true,
            message: `統合が完了しました（${result.written}件の操作）`,
        };
    } catch (error) {
        console.error('[mergeUtils.executeMerge] ❌ Exception during merge:', error);
        return {
            success: false,
            message: `統合処理で例外が発生しました: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * 統合提案を検索
 */
export function findMergeCandidates(
    currentGroup: AggregatedProduct,
    allGroups: AggregatedProduct[]
): AggregatedProduct[] {
    const currentName = String(currentGroup.productName || '').trim().toLowerCase();
    
    return allGroups.filter(group => {
        if (group.variantGroupId === currentGroup.variantGroupId) return false;
        const groupName = String(group.productName || '').trim().toLowerCase();
        return groupName === currentName;
    });
}

/**
 * 最適な統合先を選択（在庫数が多い方を優先）
 */
export function selectBestMergeTarget(candidates: AggregatedProduct[]): AggregatedProduct | null {
    if (candidates.length === 0) return null;

    return [...candidates].sort((a, b) => {
        // 在庫数で比較
        const quantityDiff = b.totalQuantity - a.totalQuantity;
        if (quantityDiff !== 0) return quantityDiff;

        // バリアント数で比較
        return b.variants.length - a.variants.length;
    })[0];
}
