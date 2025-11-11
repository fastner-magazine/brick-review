"use client";
import React from 'react';
import type { AggregatedVariant, VariantDraft, VariantDiff } from '../types';
import type { TaxonomyOption } from '../hooks/useTaxonomies';
import type { TaxonomyResolver, TaxonomyType } from '@/lib/taxonomyResolver';
import { getVariantKey } from '../keys';
import { formatNumber } from '../utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export type VariantRowProps = {
    variant: AggregatedVariant;
    draft?: VariantDraft;
    diff?: VariantDiff | null;
    mode: 'edit' | 'read';
    isEditing?: boolean;
    onToggleEdit?: () => void;
    onChange?: (_patch: Partial<VariantDraft>) => void;
    onSave?: () => void;
    taxonomy?: TaxonomyResolver;
    typeOptions?: TaxonomyOption[];
    damageOptions?: TaxonomyOption[];
    sealingOptions?: TaxonomyOption[];
    storageOptions?: TaxonomyOption[];
    storageIdToLabel?: Map<string, string>;
};

export function VariantRow({
    variant,
    draft,
    diff,
    isEditing = false,
    onToggleEdit,
    onChange,
    onSave,
    taxonomy,
    typeOptions = [],
    damageOptions = [],
    sealingOptions = [],
    storageOptions = [],
    storageIdToLabel,
}: VariantRowProps) {
    const key = getVariantKey(variant);

    const getStorageLabel = (storageId: string): string => {
        if (!storageId || storageId === '__none__') return '—';
        return storageIdToLabel?.get(storageId) || storageId;
    };

    const formatTaxonomyValue = (value: string, type: TaxonomyType): string => {
        if (!value) return '—';

        if (taxonomy) {
            const tokens = value.split('|').map((token) => token.trim()).filter(Boolean);
            if (tokens.length === 0) return '—';
            return tokens.map((token) => taxonomy.getLabel(token, type)).join(' / ');
        }

        const tokens = value.split('|').map((token) => token.trim()).filter(Boolean);
        if (tokens.length === 0) return '—';
        return tokens.join(' / ');
    };

    // draft が存在する場合はそれを優先、なければ variant のデータを使用
    // 値は taxonomy ID (例: "box", "damaged") を直接扱う
    const currentTypes = draft?.types ?? variant.types ?? '';
    const currentDamages = draft?.damages ?? variant.damages ?? '';
    const currentSealing = draft?.sealing ?? variant.sealing ?? '';
    const currentStorageLocation = draft?.storageLocation ?? variant.storageLocation ?? '';
    const currentQuantity = draft?.quantity ?? variant.quantity ?? 0;
    const currentUnitPrice = draft?.unitPrice ?? variant.unitPrice ?? 0;
    const currentStatusTokens = draft?.statusTokens ?? variant.statusTokens ?? '';
    const currentBarcode = draft?.barcode ?? variant.barcode ?? '';
    const currentNotes = draft?.notes ?? variant.notes ?? '';

    // Select の value として使用（taxonomy ID または '__none__'）
    const selectTypeValue = currentTypes || '__none__';
    const selectDamageValue = currentDamages || '__none__';
    const selectSealingValue = currentSealing || '__none__';
    const selectStorageValue = currentStorageLocation || '__none__';

    // デバッグログ（編集時のみ）
    if (isEditing) {
        console.log('[VariantRow] Editing state:', {
            inventoryId: variant.inventoryId,
            key,
            hasDraft: !!draft,
            hasOnChange: !!onChange,
            draft,
            selectTypeValue,
            currentTypes,
        });
    }

    return (
        <>
            <tr key={key} className={isEditing ? 'bg-blue-50' : ''}>
                <td className="px-2.5 py-2 border-b border-slate-200 align-top">
                    {onToggleEdit && (
                        <button
                            onClick={onToggleEdit}
                            className="p-1.5 hover:bg-blue-100 rounded transition-colors"
                            title={isEditing ? "閉じる" : "編集"}
                        >
                            {isEditing ? (
                                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            )}
                        </button>
                    )}
                </td>
                <td className="px-2.5 py-2 border-b border-slate-200 align-top font-mono text-sm">{variant.variantSku || '—'}</td>
                <td className="px-2.5 py-2 border-b border-slate-200 align-top font-mono text-sm">{variant.inventoryId}</td>
                <td className="px-2.5 py-2 border-b border-slate-200 align-top text-sm">{formatTaxonomyValue(variant.types, 'types')}</td>
                <td className="px-2.5 py-2 border-b border-slate-200 align-top text-sm">{formatTaxonomyValue(variant.damages, 'damages')}</td>
                <td className="px-2.5 py-2 border-b border-slate-200 align-top text-sm">{formatTaxonomyValue(variant.sealing, 'sealings')}</td>
                <td className="px-2.5 py-2 border-b border-slate-200 align-top text-sm">{getStorageLabel(variant.storageLocation || '')}</td>
                <td className="px-2.5 py-2 border-b border-slate-200 align-top text-sm">{formatNumber(variant.quantity)}</td>
                <td className="px-2.5 py-2 border-b border-slate-200 align-top text-sm">{formatNumber(variant.unitPrice)}</td>
                <td className="px-2.5 py-2 border-b border-slate-200 align-top text-sm">{variant.statusTokens || '—'}</td>
                <td className="px-2.5 py-2 border-b border-slate-200 align-top text-sm">{variant.barcode || '—'}</td>
                <td className="px-2.5 py-2 border-b border-slate-200 align-top text-sm">
                    <div>{variant.updatedAt || '—'}</div>
                    <div className="text-slate-400 text-xs">created: {variant.createdAt || '—'}</div>
                </td>
            </tr>
            {isEditing && (
                <tr>
                    <td colSpan={12} className="p-0 border-b border-slate-200">
                        <Card className="m-3 border-blue-200 bg-blue-50/50">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="text-sm font-semibold text-gray-900">✏️ バリアント編集</span>
                                    {diff && (
                                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 border border-amber-300 text-xs">
                                            変更あり
                                        </Badge>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* タイプ */}
                                    <div className="grid gap-1.5">
                                        <Label htmlFor={`type-${key}`}>タイプ</Label>
                                        <Select
                                            value={selectTypeValue}
                                            onValueChange={(value) => {
                                                const newValue = value === '__none__' ? '' : value;
                                                console.log('[VariantRow] Type changed:', {
                                                    key,
                                                    value,
                                                    newValue,
                                                    hasOnChange: !!onChange,
                                                });
                                                onChange?.({ types: newValue });
                                            }}
                                        >
                                            <SelectTrigger id={`type-${key}`}>
                                                <SelectValue placeholder="選択してください" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">（未選択）</SelectItem>
                                                {typeOptions.map((option) => (
                                                    <SelectItem key={option.id} value={option.id}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* ダメージ */}
                                    <div className="grid gap-1.5">
                                        <Label htmlFor={`damage-${key}`}>ダメージ</Label>
                                        <Select
                                            value={selectDamageValue}
                                            onValueChange={(value) => {
                                                const newValue = value === '__none__' ? '' : value;
                                                onChange?.({ damages: newValue });
                                            }}
                                        >
                                            <SelectTrigger id={`damage-${key}`}>
                                                <SelectValue placeholder="選択してください" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">（未選択）</SelectItem>
                                                {damageOptions.map((option) => (
                                                    <SelectItem key={option.id} value={option.id}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* シーリング */}
                                    <div className="grid gap-1.5">
                                        <Label htmlFor={`sealing-${key}`}>シーリング</Label>
                                        <Select
                                            value={selectSealingValue}
                                            onValueChange={(value) => {
                                                const newValue = value === '__none__' ? '' : value;
                                                onChange?.({ sealing: newValue });
                                            }}
                                        >
                                            <SelectTrigger id={`sealing-${key}`}>
                                                <SelectValue placeholder="選択してください" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">（未選択）</SelectItem>
                                                {sealingOptions.map((option) => (
                                                    <SelectItem key={option.id} value={option.id}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* 保管場所 */}
                                    <div className="grid gap-1.5">
                                        <Label htmlFor={`storage-${key}`}>保管場所</Label>
                                        <Select
                                            value={selectStorageValue}
                                            onValueChange={(value) => {
                                                const newValue = value === '__none__' ? '' : value;
                                                onChange?.({ storageLocation: newValue });
                                            }}
                                        >
                                            <SelectTrigger id={`storage-${key}`}>
                                                <SelectValue placeholder="選択してください" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">（未選択）</SelectItem>
                                                {storageOptions.map((option) => (
                                                    <SelectItem key={option.id} value={option.id}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* 在庫数 */}
                                    <div className="grid gap-1.5">
                                        <Label htmlFor={`quantity-${key}`}>在庫数</Label>
                                        <Input
                                            id={`quantity-${key}`}
                                            type="number"
                                            value={currentQuantity}
                                            onChange={(e) => {
                                                const val = e.target.value.trim();
                                                const num = val === '' ? 0 : Number(val);
                                                if (!isNaN(num)) {
                                                    onChange?.({ quantity: num });
                                                }
                                            }}
                                        />
                                    </div>

                                    {/* 単価 */}
                                    <div className="grid gap-1.5">
                                        <Label htmlFor={`unitPrice-${key}`}>単価</Label>
                                        <Input
                                            id={`unitPrice-${key}`}
                                            type="number"
                                            value={currentUnitPrice}
                                            onChange={(e) => {
                                                const val = e.target.value.trim();
                                                const num = val === '' ? 0 : Number(val);
                                                if (!isNaN(num)) {
                                                    onChange?.({ unitPrice: num });
                                                }
                                            }}
                                        />
                                    </div>

                                    {/* ステータストークン */}
                                    <div className="grid gap-1.5">
                                        <Label htmlFor={`statusTokens-${key}`}>ステータストークン</Label>
                                        <Input
                                            id={`statusTokens-${key}`}
                                            value={currentStatusTokens}
                                            onChange={(e) => onChange?.({ statusTokens: e.target.value })}
                                        />
                                    </div>

                                    {/* バーコード */}
                                    <div className="grid gap-1.5">
                                        <Label htmlFor={`barcode-${key}`}>バーコード</Label>
                                        <Input
                                            id={`barcode-${key}`}
                                            value={currentBarcode}
                                            onChange={(e) => onChange?.({ barcode: e.target.value })}
                                        />
                                    </div>

                                    {/* 備考 */}
                                    <div className="grid gap-1.5 md:col-span-2">
                                        <Label htmlFor={`notes-${key}`}>備考</Label>
                                        <Textarea
                                            id={`notes-${key}`}
                                            value={currentNotes}
                                            onChange={(e) => onChange?.({ notes: e.target.value })}
                                            rows={3}
                                        />
                                    </div>
                                </div>

                                {/* 保存ボタン */}
                                {onSave && (
                                    <div className="mt-4 flex justify-end gap-2">
                                        <Button
                                            onClick={onSave}
                                            size="sm"
                                            className="bg-blue-600 hover:bg-blue-700 text-white"
                                        >
                                            💾 保存
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </td>
                </tr>
            )}
        </>
    );
}
