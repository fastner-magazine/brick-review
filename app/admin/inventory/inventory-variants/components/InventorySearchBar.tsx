/**
 * InventorySearchBar（新版）
 * /lib/search を使用した実装
 */

'use client';

import { SearchBar } from '@/lib/search';

export type InventorySearchBarProps = {
 // Category filter
 categoryFilter: string;
 setCategoryFilter: (_value: string) => void;
 categoryOptions: string[] | { id: string; label: string }[];

 // Type filter
 typeFilter: string;
 setTypeFilter: (_value: string) => void;
 typeOptions: string[];

 // Free text search
 search: string;
 setSearch: (_value: string) => void;

 // Optional: Display count control (pagination)
 enablePagination?: boolean;
 displayCount?: number | 'all';
 setDisplayCount?: (_value: number | 'all') => void;
 currentPage?: number;
 setCurrentPage?: (_value: number) => void;
 totalPages?: number;
 totalResults?: number;
 filteredResults?: number;
};

export function InventorySearchBar({
 categoryFilter,
 setCategoryFilter,
 categoryOptions,
 typeFilter,
 setTypeFilter,
 typeOptions,
 search,
 setSearch,
 enablePagination = false,
 displayCount,
 setDisplayCount,
 currentPage,
 setCurrentPage,
 totalPages,
 totalResults,
 filteredResults,
}: InventorySearchBarProps) {
 return (
  <SearchBar
   searchValue={search}
   onSearchChange={setSearch}
   searchLabel="商品名検索（series_id / productName / vol）"
   searchPlaceholder="商品名の一部を入力（2文字以上）"
   minSearchLength={2}
   debounceDelay={500}
   filters={[
    {
     id: 'category-filter',
     label: 'カテゴリ',
     value: categoryFilter,
     onChange: setCategoryFilter,
     options: categoryOptions,
     defaultValue: 'all',
    },
    {
     id: 'type-filter',
     label: 'タイプ (types)',
     value: typeFilter,
     onChange: setTypeFilter,
     options: typeOptions,
     defaultValue: 'all',
    },
   ]}
   enablePagination={enablePagination}
   displayCount={displayCount}
   onDisplayCountChange={setDisplayCount}
   currentPage={currentPage}
   onPageChange={setCurrentPage}
   totalPages={totalPages}
   totalResults={totalResults}
   filteredResults={filteredResults}
  />
 );
}
