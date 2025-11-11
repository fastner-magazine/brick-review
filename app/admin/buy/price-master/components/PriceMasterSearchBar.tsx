'use client';

import { SearchBar } from '@/lib/search';

export type PriceMasterSearchBarProps = {
 // Category filter
 categoryFilter: string;
 setCategoryFilter: (_value: string) => void;
 categoryOptions: string[];

 // Price status filter
 priceFilter: 'all' | 'set' | 'unset';
 setPriceFilter: (_value: 'all' | 'set' | 'unset') => void;

 // Free text search
 search: string;
 setSearch: (_value: string) => void;
};

export default function PriceMasterSearchBar({
 categoryFilter,
 setCategoryFilter,
 categoryOptions,
 priceFilter,
 setPriceFilter,
 search,
 setSearch,
}: PriceMasterSearchBarProps) {
 // カテゴリオプションをFilterOption形式に変換
 const categoryFilterOptions = [
  { id: 'all', label: 'すべて' },
  ...categoryOptions.map(cat => ({ id: cat, label: cat }))
 ];

 // 価格設定オプション
 const priceFilterOptions = [
  { id: 'all', label: 'すべて' },
  { id: 'set', label: '価格設定済み' },
  { id: 'unset', label: '価格未設定' }
 ];

 return (
  <SearchBar
   searchValue={search}
   onSearchChange={setSearch}
   searchPlaceholder="商品名 / variant_group_id"
   filters={[
    {
     id: 'category-filter',
     label: 'カテゴリ',
     value: categoryFilter,
     onChange: setCategoryFilter,
     options: categoryFilterOptions
    },
    {
     id: 'price-filter',
     label: '価格設定',
     value: priceFilter,
     onChange: setPriceFilter as (_value: string) => void,
     options: priceFilterOptions
    }
   ]}
  />
 );
}
