/**
 * 商品編集カード - 商品情報のみを編集（バリアントは別途編集）
 * ProductInfoSection, MergePanel を統合
 */

import React from 'react';
import { CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProductInfoSection } from './ProductInfoSection';
import { MergePanel } from './MergePanel';
import type { AggregatedProduct, ProductDraft } from '../types';
import type { TaxonomyOption } from '../hooks/useTaxonomies';
import type { MergeContext } from '../types';

type ProductEditCardProps = {
    group: AggregatedProduct;
    productDraft: ProductDraft;
    productDiffFields: string[];
    isUploading: boolean;
    categoryOptions: TaxonomyOption[];
    mergeContext: MergeContext | null;
    mergeIsProcessing: boolean;
    mergeStatusMessage: string;
    onProductChange: (_patch: Partial<ProductDraft>) => void;
    onReset: () => void;
    onSave: () => void;
    onExecuteMerge: () => void;
    onCancelMerge: () => void;
    onForceDeleteVariant?: (_variantSku: string) => void;
};

export function ProductEditCard({
    group,
    productDraft,
    productDiffFields,
    isUploading,
    categoryOptions,
    mergeContext,
    mergeIsProcessing,
    mergeStatusMessage,
    onProductChange,
    onReset,
    onSave,
    onExecuteMerge,
    onCancelMerge,
    onForceDeleteVariant,
}: ProductEditCardProps) {
    return (
        <CardContent>
            <div className="rounded-lg border-2 border-blue-300 bg-linear-to-br from-blue-50 via-white to-blue-50 p-6 space-y-6 shadow-sm">
                {/* ヘッダー */}
                <div className="flex justify-between items-center flex-wrap gap-3 pb-4 border-b-2 border-blue-200">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-linear-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-md">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">編集モード</h3>
                            <p className="text-sm text-gray-600">フィールドを編集して保存してください</p>
                        </div>
                    </div>
                    {productDiffFields.length > 0 && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 border border-amber-300">
                            📝 変更予定: {productDiffFields.join(', ')}
                        </Badge>
                    )}
                </div>

                {/* 商品情報入力 */}
                <ProductInfoSection
                    groupId={group.variantGroupId}
                    draft={productDraft}
                    onChange={onProductChange}
                    categoryOptions={categoryOptions}
                />

                {/* マージパネル */}
                {mergeContext && (
                    <MergePanel
                        context={mergeContext}
                        isProcessing={mergeIsProcessing}
                        statusMessage={mergeStatusMessage}
                        onExecute={onExecuteMerge}
                        onCancel={onCancelMerge}
                        onForceDeleteVariant={onForceDeleteVariant}
                    />
                )}

                {/* アクションボタン */}
                <div className="flex gap-3 flex-wrap justify-end pt-4 border-t-2 border-blue-200">
                    <Button
                        onClick={onReset}
                        disabled={isUploading}
                        variant="outline"
                        size="lg"
                        className="gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        編集内容をリセット
                    </Button>
                    <Button
                        onClick={onSave}
                        disabled={isUploading}
                        size="lg"
                        className="gap-2 bg-linear-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 shadow-md"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {isUploading ? '保存中...' : '今すぐ保存'}
                    </Button>
                </div>
            </div>
        </CardContent>
    );
}
