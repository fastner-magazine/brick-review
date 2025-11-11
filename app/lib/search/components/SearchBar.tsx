/**
 * 汎用SearchBarコンポーネント（完全制御）
 * UI層のみ。検索ロジックは外部のStrategyに委譲
 */

'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { useSearchDebounce } from '../hooks/useSearchDebounce';
import { FilterSelect } from './FilterSelect';
import { PaginationControls } from './PaginationControls';
import type { SearchFilter } from '../types';

export type SearchBarProps = {
 // テキスト検索
 searchValue: string;
 onSearchChange: (_value: string) => void;
 searchPlaceholder?: string;
 searchLabel?: string;
 minSearchLength?: number;
 debounceDelay?: number;

 // フィルタ配列
 filters?: SearchFilter[];

 // ページネーション
 enablePagination?: boolean;
 displayCount?: number | 'all';
 onDisplayCountChange?: (_value: number | 'all') => void;
 currentPage?: number;
 onPageChange?: (_page: number) => void;
 totalPages?: number;
 totalResults?: number;
 filteredResults?: number;
 displayCountOptions?: number[];
};

export function SearchBar({
 searchValue,
 onSearchChange,
 searchPlaceholder = '検索（2文字以上）',
 searchLabel = '検索',
 minSearchLength = 2,
 debounceDelay = 500,
 filters = [],
 enablePagination = false,
 displayCount,
 onDisplayCountChange,
 currentPage,
 onPageChange,
 totalPages,
 totalResults,
 filteredResults,
 displayCountOptions = [10, 25, 50, 100],
}: SearchBarProps) {
 const {
  value: localSearch,
  setValue: setLocalSearch,
  setIsComposing,
 } = useSearchDebounce(searchValue, onSearchChange, {
  minLength: minSearchLength,
  alphanumericDelay: debounceDelay,
  otherDelay: 0,
 });

 return (
  <div className="grid gap-4">
   {/* 検索 + フィルタ */}
   <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
    {/* テキスト検索 */}
    <div className="grid gap-1.5">
     <Label htmlFor="search-text">{searchLabel}</Label>
     <div className="relative">
      <Input
       id="search-text"
       value={localSearch}
       onChange={(e) => setLocalSearch(e.target.value)}
       onCompositionStart={() => setIsComposing(true)}
       onCompositionEnd={() => setIsComposing(false)}
       placeholder={searchPlaceholder}
       className="pr-9"
      />
      {localSearch && (
       <button
        onClick={() => {
         setLocalSearch('');
         onSearchChange('');
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full transition-colors"
        aria-label="検索をクリア"
       >
        <X className="w-4 h-4 text-gray-400" />
       </button>
      )}
     </div>
    </div>

    {/* 動的フィルタ */}
    {filters.map((filter) => (
     <FilterSelect
      key={filter.id}
      id={filter.id}
      label={filter.label}
      value={filter.value}
      onChange={filter.onChange}
      options={filter.options}
      defaultValue={filter.defaultValue}
      placeholder={filter.placeholder}
      clearable={filter.clearable}
     />
    ))}
   </div>

   {/* ページネーション */}
   {enablePagination &&
    displayCount !== undefined &&
    onDisplayCountChange &&
    currentPage !== undefined &&
    onPageChange &&
    totalPages !== undefined &&
    totalResults !== undefined && (
     <PaginationControls
      displayCount={displayCount}
      onDisplayCountChange={onDisplayCountChange}
      currentPage={currentPage}
      onPageChange={onPageChange}
      totalPages={totalPages}
      totalResults={totalResults}
      filteredResults={filteredResults}
      displayCountOptions={displayCountOptions}
     />
    )}
  </div>
 );
}
