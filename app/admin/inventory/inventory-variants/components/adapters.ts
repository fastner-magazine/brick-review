import type { JoinedProduct, JoinedVariant, AggregatedProduct, AggregatedVariant } from './types';

/**
 * 新しい正規化データ型を旧型に変換（既存コードとの互換性のため）
 */
export function joinedToAggregated(joined: JoinedProduct): AggregatedProduct {
    // variants から unique な type / damages / sealing を抽出
    const uniqueTypes = Array.from(new Set(joined.variants.map(v => v.type).filter(Boolean)));
    const uniqueDamages = Array.from(new Set(joined.variants.map(v => v.damages).filter(Boolean)));
    const uniqueSealing = Array.from(new Set(joined.variants.map(v => v.sealing).filter(Boolean)));

    const aggregatedVariants: AggregatedVariant[] = joined.variants.map(v => ({
        inventoryId: v.inventory_id,
        variantSku: v.variant_id, // variant_id を variantSku として使用
        types: v.type,
        damages: v.damages,
        sealing: v.sealing,
        storageLocation: v.location,
        quantity: v.quantity,
        unitPrice: null, // 新スキーマには存在しない（後で追加可能）
        statusTokens: v.status,
        barcode: v.barcode,
        notes: v.note,
        updatedAt: v.updated_at,
        createdAt: v.created_at,
    }));

    return {
        variantGroupId: joined.variant_group_id,
        productName: joined.product_name,
        category: joined.category,
        types: uniqueTypes,
        damages: uniqueDamages,
        sealing: uniqueSealing,
        totalQuantity: joined.totalQuantity,
        variants: aggregatedVariants,
    };
}

/**
 * 配列を一括変換
 */
export function joinedArrayToAggregated(joined: JoinedProduct[]): AggregatedProduct[] {
    return joined.map(joinedToAggregated);
}

/**
 * 逆変換: AggregatedProduct → JoinedProduct（書き込み時用）
 */
export function aggregatedToJoined(aggregated: AggregatedProduct): JoinedProduct {
    const joinedVariants: JoinedVariant[] = aggregated.variants.map(v => ({
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

    return {
        docid: '', // 必要に応じて設定
        variant_group_id: aggregated.variantGroupId,
        product_name: aggregated.productName,
        category: aggregated.category,
        totalQuantity: aggregated.totalQuantity,
        variants: joinedVariants,
    };
}
