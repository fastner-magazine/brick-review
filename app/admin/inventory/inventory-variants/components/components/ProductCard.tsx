/**
 * 商品カード - 3段階表示（折りたたみ/展開/編集）
 * 1. 折りたたみ: variantGroupId + 商品名 + 展開矢印
 * 2. 展開: 商品詳細 + variants一覧 + 編集ボタン
 * 3. 編集: 編集フォーム
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProductEditCard } from './ProductEditCard';
import { VariantTableSection } from './VariantTableSection';
import type { AggregatedProduct, ProductDraft, VariantDraft, VariantDiff } from '../types';
import type { TaxonomyOption } from '../hooks/useTaxonomies';
import type { TaxonomyResolver } from '@/lib/taxonomyResolver';
import type { MergeContext } from '../types';
import { formatNumber } from '../utils';
import { ChevronRight, ChevronDown } from 'lucide-react';

type ProductCardProps = {
    group: AggregatedProduct;
    isActive: boolean;
    isExpanded: boolean;
    productDraft: ProductDraft | null;
    variantDrafts: Record<string, VariantDraft>;
    productDiffFields: string[];
    variantDiffs: VariantDiff[];
    columnLabels: Record<string, string>;
    editColumns: string[];
    readColumns: string[];
    isUploading: boolean;
    taxonomy: TaxonomyResolver;
    categoryOptions: TaxonomyOption[];
    typeOptions: TaxonomyOption[];
    damageOptions: TaxonomyOption[];
    sealingOptions: TaxonomyOption[];
    storageOptions: TaxonomyOption[];
    storageIdToLabel: Map<string, string>;
    mergeContext: MergeContext | null;
    mergeIsProcessing: boolean;
    mergeStatusMessage: string;
    resetKey?: number; // 保存後にバリアント行の編集状態をリセット
    onToggleExpand: () => void;
    onToggleEdit: () => void;
    onProductChange: (_patch: Partial<ProductDraft>) => void;
    onVariantChange: (_key: string, _patch: Partial<VariantDraft>) => void;
    onReset: () => void;
    onSave: () => void;
    onExecuteMerge: () => void;
    onCancelMerge: () => void;
    onForceDeleteVariant?: (_variantSku: string) => void;
    onSaveVariant?: (_inventoryId: string) => void;
};

export function ProductCardComponent({
    group,
    isActive,
    isExpanded,
    productDraft,
    variantDrafts,
    productDiffFields,
    variantDiffs,
    columnLabels,
    editColumns,
    readColumns,
    isUploading,
    taxonomy,
    categoryOptions,
    typeOptions,
    damageOptions,
    sealingOptions,
    storageOptions,
    storageIdToLabel,
    mergeContext,
    mergeIsProcessing,
    mergeStatusMessage,
    resetKey = 0,
    onToggleExpand,
    onToggleEdit,
    onProductChange,
    onVariantChange,
    onReset,
    onSave,
    onExecuteMerge,
    onCancelMerge,
    onForceDeleteVariant,
    onSaveVariant,
}: ProductCardProps) {
    const hasVariants = group.variants.length > 0;

    // 折りたたみ状態（展開もされていない、編集もされていない）
    if (!isExpanded && !isActive) {
        return (
            <div id={`product-card-${group.variantGroupId}`} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                <button
                    onClick={onToggleExpand}
                    className="w-full text-left flex items-center"
                >
                    {/* 展開矢印 */}
                    <div className="w-10 shrink-0 flex items-center justify-center py-3 border-r border-gray-200">
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>

                    {/* 商品名 + vol */}
                    <div className="flex-1 min-w-0 px-3 py-3 border-r border-gray-200">
                        <div className="font-medium text-gray-900 truncate text-sm">
                            {group.productName}{group.vol ? ` ${group.vol}` : ''}
                        </div>
                    </div>

                    {/* series_id */}
                    <div className="w-48 shrink-0 px-3 py-3 border-r border-gray-200">
                        <div className="text-xs text-gray-600 font-mono truncate">
                            {group.seriesId || '—'}
                        </div>
                    </div>

                    {/* カテゴリー */}
                    <div className="w-32 shrink-0 px-3 py-3">
                        <Badge variant="secondary" className="text-xs">
                            {group.category ? taxonomy.getLabel(group.category, 'categories') : '—'}
                        </Badge>
                    </div>
                </button>
            </div>
        );
    }

    // 展開状態（編集はされていない）
    if (isExpanded && !isActive) {
        return (
            <div id={`product-card-${group.variantGroupId}`} className="border-b border-gray-200 bg-white">
                <div className="border-b border-gray-200 bg-gray-50">
                    <button
                        onClick={onToggleExpand}
                        className="w-full flex items-center text-left hover:bg-gray-100 transition-colors"
                    >
                        {/* 展開矢印 */}
                        <div className="w-10 shrink-0 flex items-center justify-center py-3 border-r border-gray-200">
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                        </div>

                        {/* 商品名 + vol */}
                        <div className="flex-1 min-w-0 px-3 py-3 border-r border-gray-200">
                            <div className="font-medium text-gray-900 truncate text-sm">
                                {group.productName}{group.vol ? ` ${group.vol}` : ''}
                            </div>
                        </div>

                        {/* series_id */}
                        <div className="w-48 shrink-0 px-3 py-3 border-r border-gray-200">
                            <div className="text-xs text-gray-600 font-mono truncate">
                                {group.seriesId || '—'}
                            </div>
                        </div>

                        {/* カテゴリー */}
                        <div className="w-32 shrink-0 px-3 py-3">
                            <Badge variant="secondary" className="text-xs">
                                {group.category ? taxonomy.getLabel(group.category, 'categories') : '—'}
                            </Badge>
                        </div>

                        {/* 編集ボタン領域（クリックイベント伝播を止める） */}
                        <div className="shrink-0 px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            <div
                                onClick={onToggleEdit}
                                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-blue-600 text-white hover:bg-blue-700 h-9 px-4 py-2 cursor-pointer"
                            >
                                編集する
                            </div>
                        </div>
                    </button>
                </div>
                <div className="p-3">
                    {/* 商品詳細情報 */}
                    <div className="flex gap-4 flex-wrap text-sm text-gray-700 mb-3 pb-3 border-b">
                        <span>カテゴリ: <strong>{group.category ? taxonomy.getLabel(group.category, 'categories') : '—'}</strong></span>
                        <span>types: <strong>{group.types.length > 0 ? group.types.map(id => taxonomy.getLabel(id, 'types')).join(' / ') : '—'}</strong></span>
                        <span>damages: <strong>{group.damages.length > 0 ? group.damages.map(id => taxonomy.getLabel(id, 'damages')).join(' / ') : '—'}</strong></span>
                        <span>sealing: <strong>{(group.sealing || []).length > 0 ? (group.sealing || []).map(id => taxonomy.getLabel(id, 'sealings')).join(' / ') : '—'}</strong></span>
                        <span>総在庫数: <strong>{formatNumber(group.totalQuantity)}</strong></span>
                        {group.releaseDate && <span>発売日: <strong>{group.releaseDate}</strong></span>}
                    </div>

                    {/* バリアント一覧 */}
                    {hasVariants ? (
                        <VariantTableSection
                            variants={group.variants}
                            variantDrafts={variantDrafts}
                            variantDiffs={variantDiffs}
                            columnLabels={columnLabels}
                            editColumns={editColumns}
                            readColumns={readColumns}
                            onVariantChange={onVariantChange}
                            onSaveVariant={onSaveVariant}
                            taxonomy={taxonomy}
                            typeOptions={typeOptions}
                            damageOptions={damageOptions}
                            sealingOptions={sealingOptions}
                            storageOptions={storageOptions}
                            storageIdToLabel={storageIdToLabel}
                            resetKey={resetKey}
                        />
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            バリアント情報を読み込み中...
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // 編集モード
    // productDraft が null の場合は読み込み中を表示
    if (!productDraft) {
        return (
            <div id={`product-card-${group.variantGroupId}`} className="border-b border-gray-200 bg-blue-50">
                <div className="p-3">
                    <div className="flex items-center gap-3 py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                        <div className="text-gray-600">編集データを準備中...</div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div id={`product-card-${group.variantGroupId}`} className="border-b-2 border-blue-500 bg-white">
            <div className="bg-blue-50 border-b border-blue-200">
                <div className="flex items-center">
                    {/* 編集アイコン */}
                    <div className="w-10 shrink-0 flex items-center justify-center py-3 border-r border-blue-200">
                        <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </div>
                    </div>

                    {/* 商品名 + vol */}
                    <div className="flex-1 min-w-0 px-3 py-3 border-r border-blue-200">
                        <div className="text-base font-medium truncate">
                            {group.productName}{group.vol ? ` ${group.vol}` : ''}
                        </div>
                    </div>

                    {/* series_id */}
                    <div className="w-48 shrink-0 px-3 py-3 border-r border-blue-200">
                        <div className="text-xs text-gray-600 font-mono truncate">
                            {group.seriesId || '—'}
                        </div>
                    </div>

                    {/* カテゴリー + 変更バッジ */}
                    <div className="w-32 shrink-0 px-3 py-3 flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                            {group.category ? taxonomy.getLabel(group.category, 'categories') : '—'}
                        </Badge>
                    </div>

                    {/* 変更件数バッジ + 閉じるボタン */}
                    <div className="shrink-0 px-3 py-2 flex gap-2 items-center">
                        {productDiffFields.length > 0 && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 border border-amber-300 text-xs">
                                商品変更: {productDiffFields.length}
                            </Badge>
                        )}
                        <Button
                            onClick={onToggleEdit}
                            variant="outline"
                            size="sm"
                        >
                            閉じる
                        </Button>
                    </div>
                </div>
            </div>
            <ProductEditCard
                group={group}
                productDraft={productDraft!}
                productDiffFields={productDiffFields}
                isUploading={isUploading}
                categoryOptions={categoryOptions}
                mergeContext={mergeContext}
                mergeIsProcessing={mergeIsProcessing}
                mergeStatusMessage={mergeStatusMessage}
                onProductChange={onProductChange}
                onReset={onReset}
                onSave={onSave}
                onExecuteMerge={onExecuteMerge}
                onCancelMerge={onCancelMerge}
                onForceDeleteVariant={onForceDeleteVariant}
            />
            {/* バリアント編集セクション（編集モード時も表示） */}
            <div className="p-3">
                <VariantTableSection
                    variants={group.variants}
                    variantDrafts={variantDrafts}
                    variantDiffs={variantDiffs}
                    columnLabels={columnLabels}
                    editColumns={editColumns}
                    readColumns={readColumns}
                    onVariantChange={onVariantChange}
                    onSaveVariant={onSaveVariant}
                    taxonomy={taxonomy}
                    typeOptions={typeOptions}
                    damageOptions={damageOptions}
                    sealingOptions={sealingOptions}
                    storageOptions={storageOptions}
                    storageIdToLabel={storageIdToLabel}
                    resetKey={resetKey}
                />
            </div>
        </div>
    );
}

export const ProductCard = React.memo(ProductCardComponent);
