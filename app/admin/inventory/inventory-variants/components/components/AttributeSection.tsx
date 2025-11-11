/**
 * 属性選択セクション（カテゴリ、types、damages、sealing、storage）
 * 全バリアントに適用される共通属性を選択
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProductDraft } from '../types';
import type { TaxonomyOption } from '../hooks/useTaxonomies';

type AttributeSectionProps = {
    groupId: string;
    draft: ProductDraft;
    onChange: (patch: Partial<ProductDraft>) => void;
    categoryOptions: TaxonomyOption[];
    typeOptions: TaxonomyOption[];
    damageOptions: TaxonomyOption[];
    sealingOptions: TaxonomyOption[];
    storageOptions: TaxonomyOption[];
};

export function AttributeSection({
    groupId,
    draft,
    onChange,
    categoryOptions,
    typeOptions,
    damageOptions,
    sealingOptions,
    storageOptions,
}: AttributeSectionProps) {
    return (
        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200 space-y-4">
            <div className="flex items-center gap-2 mb-3">
                <span className="text-base font-semibold text-gray-900">🏷️ 属性設定</span>
                <span className="text-xs text-gray-500">（全バリアントに適用）</span>
            </div>
            
            {/* カテゴリは常に1列 */}
            <div className="grid gap-3">
                <div className="grid gap-2">
                    <Label htmlFor={`category-${groupId}`}>
                        category <span className="text-red-500">*</span>
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
            </div>

            {/* Types, Damages, Sealing, Storage を2列グリッド */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <Label htmlFor={`types-${groupId}`}>
                        types <span className="text-red-500">*</span>
                    </Label>
                    <Select
                        value={draft.typesInput || '__none__'}
                        onValueChange={(value) => onChange({ typesInput: value === '__none__' ? '' : value })}
                    >
                        <SelectTrigger id={`types-${groupId}`}>
                            <SelectValue placeholder="タイプを選択" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px] overflow-y-auto">
                            <SelectItem value="__none__">（未選択）</SelectItem>
                            {typeOptions.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor={`damages-${groupId}`}>
                        damages <span className="text-red-500">*</span>
                    </Label>
                    <Select
                        value={draft.damagesInput || '__none__'}
                        onValueChange={(value) => onChange({ damagesInput: value === '__none__' ? '' : value })}
                    >
                        <SelectTrigger id={`damages-${groupId}`}>
                            <SelectValue placeholder="ダメージを選択" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px] overflow-y-auto">
                            <SelectItem value="__none__">（未選択）</SelectItem>
                            {damageOptions.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor={`sealing-${groupId}`}>
                        sealing <span className="text-red-500">*</span>
                    </Label>
                    <Select
                        value={draft.sealingInput || '__none__'}
                        onValueChange={(value) => onChange({ sealingInput: value === '__none__' ? '' : value })}
                    >
                        <SelectTrigger id={`sealing-${groupId}`}>
                            <SelectValue placeholder="シーリングを選択" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px] overflow-y-auto">
                            <SelectItem value="__none__">（未選択）</SelectItem>
                            {sealingOptions.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor={`storage-${groupId}`}>
                        storage location
                    </Label>
                    <Select
                        value={draft.storageInput || '__none__'}
                        onValueChange={(value) => onChange({ storageInput: value === '__none__' ? '' : value })}
                    >
                        <SelectTrigger id={`storage-${groupId}`}>
                            <SelectValue placeholder="保管場所を選択" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px] overflow-y-auto">
                            <SelectItem value="__none__">（未選択）</SelectItem>
                            {storageOptions.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>
    );
}
