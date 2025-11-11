import type { JoinedVariant, VariantConflict } from '../types';

/**
 * 衝突解決の選択肢
 */
export type ConflictResolution = 
    | { action: 'merge'; targetVariantId: string }      // 統合先の既存バリアントに集約
    | { action: 'discard' }                              // 統合元のバリアントを削除
    | { action: 'keep-both' };                           // 両方保持（IDはそのまま）

/**
 * 統合元と統合先のバリアントを比較し、同じ (type, sealing, damages, storageLocation) を持つペアを検出
 * 
 * 衝突条件: type, sealing, damages, storageLocation が全て一致するバリアント
 */
export function detectVariantConflicts(
    fromVariants: JoinedVariant[],
    toVariants: JoinedVariant[]
): VariantConflict[] {
    const conflicts: VariantConflict[] = [];
    
    // (type, sealing, damages, storageLocation) をキーにしてグループ化
    const makeKey = (v: JoinedVariant) => 
        `${v.type}|${v.sealing}|${v.damages || ''}|${v.location || ''}`;
    
    const fromByKey = new Map<string, JoinedVariant[]>();
    fromVariants.forEach(v => {
        const key = makeKey(v);
        const existing = fromByKey.get(key) || [];
        existing.push(v);
        fromByKey.set(key, existing);
    });
    
    const toByKey = new Map<string, JoinedVariant[]>();
    toVariants.forEach(v => {
        const key = makeKey(v);
        const existing = toByKey.get(key) || [];
        existing.push(v);
        toByKey.set(key, existing);
    });
    
    // 共通のキーを見つける
    fromByKey.forEach((fromVars, key) => {
        const toVars = toByKey.get(key);
        if (toVars && toVars.length > 0) {
            const [type, sealing, damages, location] = key.split('|');
            conflicts.push({
                type,
                sealing,
                damages: damages || undefined,
                storageLocation: location || undefined,
                fromVariants: fromVars,
                toVariants: toVars,
            });
        }
    });
    
    return conflicts;
}

/**
 * 衝突解決に基づいてFirestoreドキュメント操作を生成
 */
export type ConflictResolutionDoc = {
    collection: string;
    docId: string;
    action: 'update' | 'delete' | 'archive';
    data?: Record<string, any>;
    summary: string;
};

export function buildConflictResolutionDocs(
    conflict: VariantConflict,
    resolution: ConflictResolution,
    targetGroupId: string
): ConflictResolutionDoc[] {
    const docs: ConflictResolutionDoc[] = [];
    
    if (resolution.action === 'merge') {
        // 統合元のバリアントをアーカイブして削除
        conflict.fromVariants.forEach(fromVar => {
            // variants_master をアーカイブ
            docs.push({
                collection: 'variants_master_archive',
                docId: fromVar.variant_id,
                action: 'update',
                data: {
                    variant_id: fromVar.variant_id,
                    type: fromVar.type,
                    sealing: fromVar.sealing,
                    archivedAt: new Date().toISOString(),
                    reason: 'merged_into_existing',
                    mergedIntoVariant: resolution.targetVariantId,
                },
                summary: `Archive variant ${fromVar.variant_id} (merged into ${resolution.targetVariantId})`,
            });
            
            // variants_master から削除
            docs.push({
                collection: 'variants_master',
                docId: fromVar.variant_id,
                action: 'delete',
                summary: `Delete variant ${fromVar.variant_id}`,
            });
            
            // inventory_master の variantIdRef を更新
            docs.push({
                collection: 'inventory_master',
                docId: fromVar.inventory_id,
                action: 'update',
                data: {
                    variantIdRef: resolution.targetVariantId,
                },
                summary: `Update inventory ${fromVar.inventory_id} → variant ${resolution.targetVariantId}`,
            });
        });
    } else if (resolution.action === 'discard') {
        // 統合元のバリアントを削除（在庫も削除）
        conflict.fromVariants.forEach(fromVar => {
            // variants_master をアーカイブ
            docs.push({
                collection: 'variants_master_archive',
                docId: fromVar.variant_id,
                action: 'update',
                data: {
                    variant_id: fromVar.variant_id,
                    type: fromVar.type,
                    sealing: fromVar.sealing,
                    archivedAt: new Date().toISOString(),
                    reason: 'discarded_during_merge',
                },
                summary: `Archive variant ${fromVar.variant_id} (discarded)`,
            });
            
            // variants_master から削除
            docs.push({
                collection: 'variants_master',
                docId: fromVar.variant_id,
                action: 'delete',
                summary: `Delete variant ${fromVar.variant_id}`,
            });
            
            // inventory_master をアーカイブ
            docs.push({
                collection: 'inventory_master_archive',
                docId: fromVar.inventory_id,
                action: 'update',
                data: {
                    inventory_id: fromVar.inventory_id,
                    variantIdRef: fromVar.variant_id,
                    location: fromVar.location,
                    quantity: fromVar.quantity,
                    damages: fromVar.damages,
                    note: fromVar.note,
                    barcode: fromVar.barcode,
                    status: fromVar.status,
                    archivedAt: new Date().toISOString(),
                    reason: 'variant_discarded',
                },
                summary: `Archive inventory ${fromVar.inventory_id}`,
            });
            
            // inventory_master から削除
            docs.push({
                collection: 'inventory_master',
                docId: fromVar.inventory_id,
                action: 'delete',
                summary: `Delete inventory ${fromVar.inventory_id}`,
            });
        });
    } else if (resolution.action === 'keep-both') {
        // 統合元のバリアントの variantGroupIdRef だけ更新（ID はそのまま）
        conflict.fromVariants.forEach(fromVar => {
            docs.push({
                collection: 'variants_master',
                docId: fromVar.variant_id,
                action: 'update',
                data: {
                    variantGroupIdRef: targetGroupId,
                },
                summary: `Update variant ${fromVar.variant_id} → group ${targetGroupId}`,
            });
        });
    }
    
    return docs;
}
