'use client';

/**
 * ProductSelector
 * 
 * 汎用商品選択コンポーネント
 * - オートコンプリートサジェスト
 * - 買取価格・カテゴリ・タイプ表示
 * - Strategy パターンで検索ロジック切替可能
 */

import { useState, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SearchStrategy, ProductOption } from '../types';

export type ProductSelectorProps = {
 // 現在の入力値
 value: string;

 // フィルタ値
 categoryId?: string;
 typeId?: string;

 // 検索戦略
 strategy: SearchStrategy<ProductOption>;

 // イベントハンドラ
 onProductSelect?: (_productName: string, _categoryId?: string, _categoryLabel?: string) => void;
 onAdvancedSelect?: (_product: ProductOption) => void;
 onCategoryChange?: (_categoryId: string, _categoryLabel: string) => void;
 onTypeChange?: (_typeId: string, _typeLabel: string, _price?: number) => void;

 // UI設定
 placeholder?: string;
 showCategorySelector?: boolean;
 showTypeSelector?: boolean;
 showPrice?: boolean;

 // カテゴリ・タイプオプション
 categoryOptions?: Array<{ id: string; label: string; order?: number }>;
 typeOptions?: Array<{ id: string; label: string; order?: number; price?: number }>;
 allTypeOptions?: Array<{ id: string; label: string; order?: number; price?: number }>;
 sealingOptions?: Array<{ id: string; label: string; order?: number }>;
 onTypeOptionsChange?: (_options: Array<{ id: string; label: string; price?: number }>) => void;
 // currently selected type label for UI hint shown to the right of the product input
 selectedTypeLabel?: string;
 // currently selected buy price for UI hint
 selectedBuyPrice?: number | null;
};

export function ProductSelector({
 value,
 categoryId,
 typeId,
 strategy,
 onProductSelect,
 onAdvancedSelect,
 onCategoryChange,
 onTypeChange,
 onTypeOptionsChange,
 placeholder = '商品名',
 showCategorySelector = true,
 showTypeSelector = false,
 showPrice = true,
 categoryOptions = [],
 typeOptions = [],
 allTypeOptions = [],
 sealingOptions = [],
 selectedTypeLabel,
 selectedBuyPrice,
}: ProductSelectorProps) {
 const [productSuggestions, setProductSuggestions] = useState<ProductOption[]>([]);
 const [showSuggestions, setShowSuggestions] = useState(false);
 const [loading, setLoading] = useState(false);
 const [isFocused, setIsFocused] = useState(false);
 const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

 const groupedSuggestions = useMemo(() => {
  const map = new Map<string, ProductOption[]>();
  for (const p of productSuggestions) {
   const key = p.productName || '';
   if (!map.has(key)) map.set(key, []);
   map.get(key)!.push(p);
  }

  return Array.from(map.entries()).map(([name, items]) => {
   const categoryLabels = Array.from(new Set(items.flatMap(i => i.categoryLabels || [])));

   // Build type info with prices: Map<typeLabel, maxPrice>
   const typeInfoMap = new Map<string, number>();
   items.forEach(item => {
    const labels = item.typeLabels || [];
    const price = typeof (item as any).buyPrice === 'number' ? (item as any).buyPrice : null;
    labels.forEach(label => {
     if (price !== null) {
      const existing = typeInfoMap.get(label);
      typeInfoMap.set(label, existing !== undefined ? Math.max(existing, price) : price);
     } else if (!typeInfoMap.has(label)) {
      typeInfoMap.set(label, -Infinity); // Mark as "no price"
     }
    });
   });

   const typeInfo = Array.from(typeInfoMap.entries()).map(([label, price]) => ({
    label,
    price: isFinite(price) ? price : undefined
   }));

   // Build sealing info: unique sealing labels
   const sealingLabels = Array.from(new Set(items.flatMap(i => i.sealingLabels || [])));

   const maxBuyPrice = items.reduce((acc, it) => {
    const price = (it as any).buyPrice;
    if (typeof price === 'number') return Math.max(acc, price);
    return acc;
   }, 0);
   return {
    name,
    items,
    categoryLabels,
    typeInfo,
    sealingLabels,
    maxBuyPrice: maxBuyPrice || undefined,
   } as {
    name: string;
    items: ProductOption[];
    categoryLabels: string[];
    typeInfo: Array<{ label: string; price?: number }>;
    sealingLabels: string[];
    maxBuyPrice?: number;
   };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
 }, [productSuggestions]);

 const categoryMap = useMemo(() => new Map(categoryOptions.map((opt) => [opt.id, opt.label])), [categoryOptions]);
 const typeCatalog = useMemo(() => (allTypeOptions.length > 0 ? allTypeOptions : typeOptions), [allTypeOptions, typeOptions]);
 const typeMap = useMemo(() => new Map(typeCatalog.map((opt) => [opt.id, opt.label])), [typeCatalog]);
 const sealingMap = useMemo(() => {
  const map = new Map(sealingOptions.map((opt) => [opt.id, opt.label]));
  if (sealingOptions.length > 0) {
   console.log('[ProductSelector] sealingMap created:', Array.from(map.entries()));
  }
  return map;
 }, [sealingOptions]);
 const typeLabelToIdMap = useMemo(() => {
  const map = new Map<string, string>();
  typeCatalog.forEach((opt) => {
   const key = opt.label.trim().toLowerCase();
   if (!map.has(key)) {
    map.set(key, opt.id);
   }
  });
  return map;
 }, [typeCatalog]);

 const calcTypeOptionsFromItems = useCallback(
  (items: ProductOption[]) => {
   const results = new Map<string, { id: string; label: string; price?: number }>();

   const addOption = (rawId: string | undefined | null, labelHint?: string, priceHint?: number) => {
    if (typeof rawId !== 'string') return;
    const trimmed = rawId.trim();
    if (!trimmed) return;
    const normalized = trimmed.toLowerCase();
    const mappedId = typeMap.has(trimmed) ? trimmed : typeLabelToIdMap.get(normalized);
    if (mappedId) {
     const resolvedLabel = typeMap.get(mappedId) || labelHint || trimmed;
     const existing = results.get(mappedId);
     const mergedPrice = Math.max(existing?.price ?? -Infinity, typeof priceHint === 'number' ? priceHint : -Infinity);
     if (!results.has(mappedId)) {
      results.set(mappedId, { id: mappedId, label: resolvedLabel, price: isFinite(mergedPrice) ? mergedPrice : undefined });
     } else if (isFinite(mergedPrice)) {
      results.set(mappedId, { ...existing!, price: mergedPrice });
     }
     return;
    }
    if (!results.has(trimmed)) {
     results.set(trimmed, { id: trimmed, label: labelHint || trimmed, price: typeof priceHint === 'number' ? priceHint : undefined });
    } else if (typeof priceHint === 'number') {
     const existing = results.get(trimmed)!;
     const mergedPrice = Math.max(existing?.price ?? -Infinity, priceHint);
     results.set(trimmed, { ...existing, price: isFinite(mergedPrice) ? mergedPrice : existing.price });
    }
   };

   const addLabelOnly = (labelValue: string | undefined | null) => {
    if (typeof labelValue !== 'string') return;
    const trimmed = labelValue.trim();
    if (!trimmed) return;
    const normalized = trimmed.toLowerCase();
    const mappedId = typeLabelToIdMap.get(normalized);
    if (mappedId) {
     const resolvedLabel = typeMap.get(mappedId) || trimmed;
     if (!results.has(mappedId)) {
      results.set(mappedId, { id: mappedId, label: resolvedLabel });
     }
     return;
    }
    if (!results.has(trimmed)) {
     results.set(trimmed, { id: trimmed, label: trimmed });
    }
   };

   items.forEach((item) => {
    const toArray = (value: unknown): string[] => {
     if (Array.isArray(value)) {
      return value
       .map((v) => (typeof v === 'string' ? v : String(v ?? '')).trim())
       .filter(Boolean);
     }
     if (value === undefined || value === null) return [];
     return [typeof value === 'string' ? value.trim() : String(value).trim()].filter(Boolean);
    };

    const typeIds = [
     ...toArray((item as any).types),
     ...toArray((item as any).type),
     ...toArray((item as any).typeId),
     ...toArray((item as any).type_id),
     ...toArray((item as any).typeIds),
     ...toArray((item as any).variantTypes),
     ...toArray((item as any).variant_types),
    ];

    const typeLabels = [
     ...toArray((item as any).typeLabels),
     ...toArray((item as any).typeLabel),
     ...toArray((item as any).type_label),
     ...toArray((item as any).typeDisplayName),
    ];

    // Collect price hint per variant
    const priceVal = typeof (item as any).buyPrice === 'number' ? (item as any).buyPrice : undefined;
    typeIds.forEach((rawTypeId) => addOption(rawTypeId, undefined, priceVal));
    typeLabels.forEach((label) => addLabelOnly(label));

    if (typeIds.length && typeLabels.length) {
     typeIds.forEach((rawTypeId, idx) => {
      const labelHint = typeLabels[idx] || typeLabels[typeLabels.length - 1];
      addOption(rawTypeId, labelHint, priceVal);
     });
    }

    if (!typeIds.length && typeLabels.length) {
     typeLabels.forEach((label) => addOption(label, label));
    }
   });

   return Array.from(results.values());
  },
  [typeLabelToIdMap, typeMap]
 );

 const searchProducts = useCallback(
  async (searchText: string, catId?: string, typeFilter?: string) => {
   console.log('[ProductSelector] searchProducts called:', { searchText, catId, typeFilter });
   if (!searchText || searchText.length < 2) {
    setProductSuggestions([]);
    return;
   }

   setLoading(true);
   try {
    const result = await strategy.search(searchText, {
     categoryId: catId,
     typeId: typeFilter,
    });

    console.log('[ProductSelector] Search result:', result);
    setProductSuggestions(result.items);
    setShowSuggestions(result.items.length > 0);
   } catch (err) {
    console.error('[ProductSelector] 商品検索エラー:', err);
    setProductSuggestions([]);
   } finally {
    setLoading(false);
   }
  },
  [strategy]
 );

 const handleInputChange = (text: string) => {
  console.log('[ProductSelector] handleInputChange:', { text, categoryId, typeId });
  setExpandedGroup(null);
  onTypeOptionsChange?.([]);
  const categoryLabel = categoryMap.get(categoryId || '');
  if (onProductSelect) {
   onProductSelect(text, categoryId, categoryLabel);
  }

  if (text.trim() && text.trim().length >= 2) {
   console.log('[ProductSelector] Starting search...');
   searchProducts(text, categoryId, typeId);
  } else {
   console.log('[ProductSelector] Text too short, clearing suggestions');
   setProductSuggestions([]);
   setShowSuggestions(false);
  }
 };

 const handleSelectProduct = (product: ProductOption) => {
  onProductSelect?.(product.productName, categoryId, categoryMap.get(categoryId || '') || '');
  onAdvancedSelect?.(product);
  setShowSuggestions(false);
  setProductSuggestions([]);
  setExpandedGroup(null);
  const options = calcTypeOptionsFromItems([product]);
  onTypeOptionsChange?.(options);
 };

 const handleCategorySelect = (catId: string) => {
  if (!onCategoryChange) return;
  if (catId === '__none__') {
   onCategoryChange('', '');
   setProductSuggestions([]);
   setShowSuggestions(false);
   setExpandedGroup(null);
   onTypeOptionsChange?.([]);
   return;
  }
  const label = categoryMap.get(catId) || catId;
  onCategoryChange(catId, label);
  onTypeOptionsChange?.([]);
  if (value.trim()) {
   searchProducts(value, catId, typeId);
  }
 };

 const handleTypeSelect = (newTypeId: string) => {
  if (!onTypeChange) return;
  if (newTypeId === '__none__') {
   onTypeChange('', '');
   setProductSuggestions([]);
   setShowSuggestions(false);
   return;
  }
  const label = typeMap.get(newTypeId) || newTypeId;
  // Attempt to find a representative price for this type from the current suggestions
  const priceCandidates = productSuggestions
   .flatMap(p => {
    const ids = (p as any).types || (p as any).typeIds || [];
    return ids && Array.isArray(ids) ? ids.map((id: any) => ({ id: String(id), price: (p as any).buyPrice })) : [];
   })
   .filter((i) => i.id === newTypeId && typeof i.price === 'number')
   .map((i) => i.price as number);
  if (priceCandidates.length > 0) {
   const maxPrice = Math.max(...priceCandidates);
   onTypeChange(newTypeId, label, maxPrice);
  } else {
   onTypeChange(newTypeId, label, undefined);
  }
  if (value.trim()) {
   searchProducts(value, categoryId, newTypeId);
  }
 };

 return (
  <div className="grid gap-3">
   {showCategorySelector && categoryOptions.length > 0 && (
    <div className="grid gap-1.5">
     <Label>カテゴリ</Label>
     <Select value={categoryId || '__none__'} onValueChange={handleCategorySelect}>
      <SelectTrigger>
       <SelectValue placeholder="カテゴリを選択" />
      </SelectTrigger>
      <SelectContent>
       <SelectItem value="__none__">選択してください</SelectItem>
       {categoryOptions.map((cat) => (
        <SelectItem key={cat.id} value={cat.id}>
         {cat.label}
        </SelectItem>
       ))}
      </SelectContent>
     </Select>
    </div>
   )}

   <div className="grid gap-1.5 relative">
    <Label>商品名</Label>
    <Input
     value={value}
     onChange={(e) => handleInputChange(e.target.value)}
     onFocus={() => {
      setIsFocused(true);
      if (productSuggestions.length > 0) {
       setShowSuggestions(true);
      }
     }}
     onBlur={() => {
      setTimeout(() => {
       setIsFocused(false);
       setShowSuggestions(false);
      }, 150);
     }}
     placeholder={placeholder}
    />

    {loading && (
     <div className="absolute right-3 top-9 text-gray-400 text-sm">検索中...</div>
    )}

    {/* Display type/price hint to the right when input is not focused and a selected type label exists */}
    {(!isFocused && selectedTypeLabel) && (
     <div className="absolute right-3 top-9 text-gray-500 text-sm select-none" style={{ pointerEvents: 'none' }}>
      {selectedTypeLabel}{selectedBuyPrice !== undefined && selectedBuyPrice !== null ? ` — ¥${selectedBuyPrice.toLocaleString()}` : ''}
     </div>
    )}

    {showSuggestions && productSuggestions.length > 0 && (
     <div
      className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-blue-500 rounded-md shadow-xl z-50 max-h-96 overflow-y-auto"
      style={{
       animation: 'slideDown 0.2s ease-out'
      }}
     >
      <div className="sticky top-0 bg-linear-to-r from-blue-50 to-indigo-50 px-4 py-2 border-b border-blue-200">
       <div className="text-sm font-semibold text-blue-700">
        {groupedSuggestions.length}件の商品が見つかりました
       </div>
      </div>
      {groupedSuggestions.map((group) => (
       <div key={group.name} className="border-b last:border-b-0">
        <div className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-all hover:shadow-md flex items-start justify-between gap-3 cursor-pointer"
         onMouseDown={(e) => e.preventDefault()}
         onClick={() => {
          if (group.items.length === 1) {
           handleSelectProduct(group.items[0]);
          } else {
           const nextExpanded = expandedGroup === group.name ? null : group.name;
           setExpandedGroup(nextExpanded);
           // Notify parent of available types for this group when expanded, clear when collapsed
           if (nextExpanded) {
            const opts = calcTypeOptionsFromItems(group.items);
            onTypeOptionsChange?.(opts);
           } else {
            onTypeOptionsChange?.([]);
           }
          }
         }}
        >
         <div className="flex-1 min-w-0">
          <div className="font-bold text-base text-gray-900 mb-1 truncate">{group.name}</div>
          <div className="flex flex-wrap gap-2 text-xs">
           {group.categoryLabels.length > 0 && (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
             <span>{group.categoryLabels.join(' / ')}</span>
            </div>
           )}
           {group.typeInfo.length > 0 && (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full flex-wrap">
             {group.typeInfo.map((ti, idx) => (
              <span key={idx}>
               {ti.label}
               {ti.price !== undefined && <span className="text-green-700 font-semibold ml-1">¥{ti.price.toLocaleString()}</span>}
               {idx < group.typeInfo.length - 1 && ' / '}
              </span>
             ))}
            </div>
           )}
          </div>
         </div>
         {showPrice && group.maxBuyPrice !== undefined && (
          <div className="shrink-0 text-right">
           <div className="text-lg font-bold text-green-600 whitespace-nowrap">¥{group.maxBuyPrice!.toLocaleString()}</div>
           <div className="text-xs text-gray-500">最高買取価格</div>
          </div>
         )}
        </div>

        {expandedGroup === group.name && group.items.length > 1 && (
         <div className="px-4 py-2 bg-gray-50">
          {group.items.map((variant) => {
           // Build display labels for the variant (prefer taxonomy labels, fall back to type ids)
           const variantLabelsArray = Array.from(new Set([
            ...(variant.typeLabels || []),
            ...((variant.types || []).map((id: string) => typeMap.get(String(id)) || String(id)))
           ])).filter(Boolean as any);
           const typeLabel = variantLabelsArray.length > 0 ? variantLabelsArray.join(' / ') : 'タイプ未設定';

           // Get sealing labels for this variant
           // First try sealingLabels, then fallback to mapping sealings IDs to labels
           let variantSealingLabels = variant.sealingLabels || [];
           if (variantSealingLabels.length === 0 && variant.sealings && variant.sealings.length > 0) {
             // Map sealing IDs to labels using sealingMap
             console.log('[ProductSelector] Mapping sealing IDs:', variant.sealings, 'sealingMap size:', sealingMap.size);
             variantSealingLabels = variant.sealings
               .map((id: string) => {
                 const label = sealingMap.get(String(id));
                 console.log(`[ProductSelector] Sealing ID "${id}" -> Label "${label}"`);
                 return label || String(id);
               })
               .filter(Boolean as any);
             console.log('[ProductSelector] Final sealing labels:', variantSealingLabels);
           }

           // Determine a price to display for this type row: prefer variant.buyPrice, else lookup aggregated price for matching type label
           let displayPrice: number | undefined;
           if (typeof (variant as any).buyPrice === 'number') {
            displayPrice = (variant as any).buyPrice as number;
           } else if (group.typeInfo && group.typeInfo.length) {
            // Try to find a price for one of the variant's labels
            for (const lbl of variantLabelsArray) {
             const found = group.typeInfo.find((ti) => ti.label === lbl && typeof ti.price === 'number');
             if (found && typeof found.price === 'number') { displayPrice = found.price; break; }
            }
           }
           return (
            <button
             key={variant.id}
             type="button"
             onMouseDown={(event) => event.preventDefault()}
             onClick={() => handleSelectProduct(variant)}
             className="w-full text-left px-3 py-2 hover:bg-white border-b last:border-b-0 transition-colors"
            >
             <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
               <div className="text-sm text-gray-700 truncate">{typeLabel}</div>
               {variantSealingLabels.length > 0 && (
                <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs shrink-0">
                 <span>{variantSealingLabels.join(' / ')}</span>
                </div>
               )}
              </div>
              {showPrice && typeof displayPrice === 'number' && (
               <div className="text-sm font-semibold text-green-600 shrink-0">¥{displayPrice!.toLocaleString()}</div>
              )}
             </div>
            </button>
           );
          })}
         </div>
        )}
       </div>
      ))}
     </div>
    )}
   </div>

   {showTypeSelector && typeOptions.length > 0 && (
    <div className="grid gap-1.5">
     <Label>タイプ</Label>
     <Select value={typeId || '__none__'} onValueChange={handleTypeSelect}>
      <SelectTrigger>
       <SelectValue placeholder="タイプを選択" />
      </SelectTrigger>
      <SelectContent>
       <SelectItem value="__none__">選択してください</SelectItem>
       {typeOptions.map((type) => (
        <SelectItem key={type.id} value={type.id}>
         <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
          <span>{type.label}</span>
            {typeof type.price === 'number' && (
             <span className="text-sm font-semibold text-green-600">¥{type.price.toLocaleString()}</span>
          )}
         </div>
        </SelectItem>
       ))}
      </SelectContent>
     </Select>
    </div>
   )}
  </div>
 );
}
