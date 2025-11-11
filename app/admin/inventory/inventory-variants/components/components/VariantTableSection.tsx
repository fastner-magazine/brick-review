/**
 * バリアント編集テーブルセクション
 * 各バリアント行ごとに編集モードを切り替え可能
 */

import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { VariantRow } from './VariantRow';
import { getVariantKey } from '../keys';
import type { AggregatedVariant, VariantDraft, VariantDiff } from '../types';
import type { TaxonomyOption } from '../hooks/useTaxonomies';
import type { TaxonomyResolver } from '@/lib/taxonomyResolver';

type VariantTableSectionProps = {
    variants: AggregatedVariant[];
    variantDrafts: Record<string, VariantDraft>;
    variantDiffs: VariantDiff[];
    columnLabels: Record<string, string>;
    editColumns?: string[]; // optional, not used but kept for compatibility
    readColumns: string[];
    onVariantChange: (_key: string, _patch: Partial<VariantDraft>) => void;
    onSaveVariant?: (_inventoryId: string) => void;
    taxonomy: TaxonomyResolver;
    typeOptions: TaxonomyOption[];
    damageOptions: TaxonomyOption[];
    sealingOptions: TaxonomyOption[];
    storageOptions: TaxonomyOption[];
    storageIdToLabel: Map<string, string>;
    resetKey?: number; // 保存後にリセットするためのキー
};

export function VariantTableSection({
    variants,
    variantDrafts,
    variantDiffs,
    columnLabels,
    readColumns,
    onVariantChange,
    onSaveVariant,
    taxonomy,
    typeOptions,
    damageOptions,
    sealingOptions,
    storageOptions,
    storageIdToLabel,
    resetKey = 0,
}: VariantTableSectionProps) {
    // 各行の編集状態を管理（inventoryId -> boolean）
    const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});
    const changedVariantCount = variantDiffs.length;

    // resetKeyが変わったら編集行をクリア
    useEffect(() => {
        if (resetKey > 0) {
            console.log('[VariantTableSection] Clearing editing rows due to save');
            setEditingRows({});
        }
    }, [resetKey]);

    const toggleRowEdit = (variant: AggregatedVariant) => {
        const key = getVariantKey(variant);
        console.log('[VariantTableSection] toggleRowEdit called:', {
            inventoryId: variant.inventoryId,
            key,
            currentDraftKeys: Object.keys(variantDrafts),
            hasDraftForThis: !!variantDrafts[key],
        });

        // Draft creation is now handled in handleVariantDraftChange when first onChange is called

        setEditingRows(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    return (
        <div className="mt-4">
            <div className="flex justify-between items-center flex-wrap gap-3 mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-gray-900">📊 バリアント一覧</span>
                    <Badge variant="outline" className="text-sm">
                        {variants.length}件
                    </Badge>
                </div>
                {changedVariantCount > 0 && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 border border-amber-300">
                        📝 変更予定: {changedVariantCount}件
                    </Badge>
                )}
            </div>
            <div className="overflow-x-auto border border-gray-200 rounded">
                <table className="min-w-[980px] w-full border-collapse text-sm">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="px-2.5 py-2.5 text-left text-sm font-semibold text-gray-700 border-b border-gray-300 w-20">
                                操作
                            </th>
                            {readColumns.map((col) => (
                                <th
                                    key={col}
                                    className="px-2.5 py-2.5 text-left text-sm font-semibold text-gray-700 border-b border-gray-300"
                                >
                                    {columnLabels[col] || col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {variants.map((variant) => {
                            const key = getVariantKey(variant);
                            const draft = variantDrafts[key];
                            const diff = variantDiffs.find((d) => d.draft === draft) || null;
                            const isEditing = editingRows[key] || false;

                            console.log('[VariantTableSection] Rendering variant:', {
                                inventoryId: variant.inventoryId,
                                variantSku: variant.variantSku,
                                key,
                                hasDraft: !!draft,
                                draftKeys: Object.keys(variantDrafts),
                            });

                            return (
                                <VariantRow
                                    key={key}
                                    variant={variant}
                                    draft={draft}
                                    diff={diff}
                                    mode={isEditing ? "edit" : "read"}
                                    isEditing={isEditing}
                                    onToggleEdit={() => toggleRowEdit(variant)}
                                    onChange={(patch) => onVariantChange(key, patch)}
                                    onSave={onSaveVariant ? () => onSaveVariant(key) : undefined}
                                    taxonomy={taxonomy}
                                    typeOptions={typeOptions}
                                    damageOptions={damageOptions}
                                    sealingOptions={sealingOptions}
                                    storageOptions={storageOptions}
                                    storageIdToLabel={storageIdToLabel}
                                />
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
