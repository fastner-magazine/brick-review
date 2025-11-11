/**
 * 商品情報セクション
 * series_id, productName, vol, category, release_date, variant_group_id を編集
 */

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProductDraft } from '../types';
import type { TaxonomyOption } from '../hooks/useTaxonomies';

type ProductInfoSectionProps = {
    groupId: string;
    draft: ProductDraft;
    onChange: (_patch: Partial<ProductDraft>) => void;
    categoryOptions: TaxonomyOption[];
};

export function ProductInfoSection({ groupId, draft, onChange, categoryOptions }: ProductInfoSectionProps) {
    return (
        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200 space-y-4">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-base font-semibold text-gray-900">📦 商品情報</span>
            </div>

            {/* 3列グリッド: series_id, productName, vol */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="grid gap-2">
                    <Label htmlFor={`series-id-${groupId}`}>
                        シリーズID <span className="text-red-500">*</span>
                    </Label>
                    <Input
                        id={`series-id-${groupId}`}
                        value={draft.seriesId || ''}
                        onChange={(e) => onChange({ seriesId: e.target.value })}
                        placeholder="例: ONE_PIECE"
                        className="font-mono text-sm"
                    />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor={`product-name-${groupId}`}>
                        商品名 <span className="text-red-500">*</span>
                    </Label>
                    <Input
                        id={`product-name-${groupId}`}
                        value={draft.productName}
                        onChange={(e) => onChange({ productName: e.target.value })}
                        placeholder="例: ワンピース"
                        className="text-base font-medium"
                    />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor={`vol-${groupId}`}>
                        巻数
                    </Label>
                    <Input
                        id={`vol-${groupId}`}
                        value={draft.vol || ''}
                        onChange={(e) => onChange({ vol: e.target.value })}
                        placeholder="例: 第1巻, Vol.1"
                        className="text-sm"
                    />
                </div>
            </div>

            {/* カテゴリ、発売日、variant_group_id */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="grid gap-2">
                    <Label htmlFor={`category-${groupId}`}>
                        カテゴリ <span className="text-red-500">*</span>
                    </Label>
                    <Select
                        value={draft.categoryInput || '__none__'}
                        onValueChange={(value) => onChange({ categoryInput: value === '__none__' ? '' : value })}
                    >
                        <SelectTrigger id={`category-${groupId}`}>
                            <SelectValue placeholder="カテゴリを選択" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px] overflow-y-auto">
                            <SelectItem value="__none__">（未選択）</SelectItem>
                            {categoryOptions.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor={`release-date-${groupId}`}>
                        発売日
                    </Label>
                    <Input
                        id={`release-date-${groupId}`}
                        type="date"
                        value={draft.releaseDate || ''}
                        onChange={(e) => onChange({ releaseDate: e.target.value })}
                        className="text-sm"
                    />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor={`variant-group-id-${groupId}`}>
                        バリアントグループID <span className="text-xs text-gray-500">(統合時に変更)</span>
                    </Label>
                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-medium text-gray-700 min-h-10 flex items-center">
                        {draft.variantGroupId || groupId}
                    </div>
                </div>
            </div>
        </div>
    );
}
