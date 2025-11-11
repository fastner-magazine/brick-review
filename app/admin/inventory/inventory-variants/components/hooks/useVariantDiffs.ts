/**
 * 商品とバリアントの編集差分を検出するカスタムフック
 * 
 * 機能:
 * - 現在のデータ（AggregatedProduct）と編集ドラフト（ProductDraft/VariantDraft）を比較
 * - 変更されたフィールドを検出（productName, category, types, damages, sealing, quantity, etc.）
 * - バリアントごとの差分を Map で管理
 * 
 * 返り値:
 * - productDiffFields: 商品レベルで変更されたフィールド名の配列
 * - variantDiffMap: バリアントキー → VariantDiff のマップ
 * - variantDiffs: 変更があるバリアントの VariantDiff 配列
 * 
 * 用途:
 * - 「保存」ボタンの有効化判定
 * - 変更内容のプレビュー表示
 * - 変更箇所のハイライト表示
 * - Firestore 更新時の差分のみ送信
 */

import { useMemo } from 'react';
import type {
    AggregatedProduct,
    ProductDraft,
    VariantDraft,
    VariantDiff,
} from '../types';
import { diffProduct, diffVariant } from '../logic/diffs';
import { getVariantKey } from '../keys';

export function useVariantDiffs(
    activeGroup: AggregatedProduct | null,
    productDraft: ProductDraft | null,
    variantDrafts: Record<string, VariantDraft>
) {
    const productDiffFields = useMemo(() => {
        if (!activeGroup || !productDraft) return [] as string[];
        return diffProduct(activeGroup, productDraft);
    }, [activeGroup, productDraft]);

    const variantDiffMap = useMemo(() => {
        const map = new Map<string, VariantDiff>();
        if (!activeGroup) return map;
        const groupIdChanged = !!productDraft && (productDraft.variantGroupId || '').trim() !== activeGroup.variantGroupId;
        activeGroup.variants.forEach((variant) => {
            const key = getVariantKey(variant);
            const draft = variantDrafts[key];
            if (!draft) return;
            const diff = diffVariant(variant, draft, groupIdChanged);
            if (diff) map.set(key, diff);
        });

        const propagateFields = productDiffFields.filter((field) => field === 'productName' || field === 'category');
        if (propagateFields.length > 0) {
            activeGroup.variants.forEach((variant) => {
                const key = getVariantKey(variant);
                const existing = map.get(key);
                const draft = variantDrafts[key];
                if (!draft) return;
                const combined = existing ? [...existing.changedFields] : [];
                propagateFields.forEach((field) => {
                    if (!combined.includes(field)) combined.push(field);
                });
                if (combined.length > 0) {
                    map.set(key, {
                        key,
                        original: variant,
                        draft,
                        changedFields: combined,
                    });
                }
            });
        }

        return map;
    }, [activeGroup, variantDrafts, productDiffFields, productDraft]);

    const variantDiffs = useMemo(() => Array.from(variantDiffMap.values()), [variantDiffMap]);

    return { productDiffFields, variantDiffMap, variantDiffs };
}

const useVariantDiffsExports = { useVariantDiffs };
export default useVariantDiffsExports;
