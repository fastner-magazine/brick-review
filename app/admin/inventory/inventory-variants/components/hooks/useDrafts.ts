/**
 * 商品グループとバリアントの編集用ドラフトを生成するユーティリティ
 * 
 * 機能:
 * - AggregatedProduct → ProductDraft への変換
 * - AggregatedVariant → VariantDraft への変換
 * - グループ全体の初期化（商品＋全バリアント）
 * 
 * 用途: ユーザーが商品を編集モードにする際、現在のデータからフォーム用の編集可能オブジェクトを作成
 */

import type {
    AggregatedProduct,
    AggregatedVariant,
    ProductDraft,
    VariantDraft,
} from '../types';

// Create a ProductDraft from an AggregatedProduct
export function createProductDraft(group: AggregatedProduct): ProductDraft {
    const pickFirst = (values?: string[]) => {
        if (!values) return '';
        for (const value of values) {
            const trimmed = (value ?? '').trim();
            if (trimmed) return trimmed;
        }
        return '';
    };

    // releaseDateをYYYY-MM-DD形式に変換（ISO 8601文字列から）
    let releaseDateStr = '';
    if (group.releaseDate) {
        try {
            const date = new Date(group.releaseDate);
            if (!isNaN(date.getTime())) {
                releaseDateStr = date.toISOString().split('T')[0];
            }
        } catch (e) {
            console.warn('[createProductDraft] Failed to parse releaseDate:', group.releaseDate, e);
        }
    }

    return {
        variantGroupId: group.variantGroupId,
        seriesId: group.seriesId || '',
        productName: group.productName,
        vol: group.vol || '',
        releaseDate: releaseDateStr,
        category: group.category,
        categoryInput: group.category,
        typesInput: pickFirst(group.types),
        damagesInput: pickFirst(group.damages),
        sealingInput: pickFirst(group.sealing),
        storageInput: '',
    };
}

// Create a VariantDraft from an AggregatedVariant
export function createVariantDraft(variant: AggregatedVariant): VariantDraft {
    // inventoryIdをキーとして使用（必ずユニーク）
    const key = String(variant.inventoryId || '').trim() || 'unknown-inventory-row';
    return {
        key,
        inventoryId: variant.inventoryId,
        variantSku: variant.variantSku,
        types: variant.types || '',
        damages: variant.damages || '',
        sealing: variant.sealing || '',
        storageLocation: variant.storageLocation || '',
        quantity: variant.quantity ?? 0,
        unitPrice: variant.unitPrice ?? 0,
        statusTokens: variant.statusTokens || '',
        barcode: variant.barcode || '',
        notes: variant.notes || '',
    };
}

// Initialize drafts for a group: returns product draft + map of variant drafts
export function initDraftsFromGroup(g: AggregatedProduct) {
    const vMap: Record<string, VariantDraft> = {};
    g.variants.forEach((v) => {
        const d = createVariantDraft(v);
        vMap[d.key] = d;
    });
    return { product: createProductDraft(g), variants: vMap };
}

const useDraftsExports = {
    createProductDraft,
    createVariantDraft,
    initDraftsFromGroup,
};
export default useDraftsExports;
