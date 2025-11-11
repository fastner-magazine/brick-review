'use client';

import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export type InventorySearchBarProps = {
    // Category filter
    categoryFilter: string;
    setCategoryFilter: (value: string) => void;
    categoryOptions: string[];

    // Type filter
    typeFilter: string;
    setTypeFilter: (value: string) => void;
    typeOptions: string[];

    // Free text search
    search: string;
    setSearch: (value: string) => void;

    // Optional: Display count control (pagination)
    enablePagination?: boolean;
    displayCount?: number | 'all';
    setDisplayCount?: (value: number | 'all') => void;
    currentPage?: number;
    setCurrentPage?: (value: number) => void;
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
        <div className="grid gap-4">
            <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
                {/* カテゴリフィルタ */}
                <div className="grid gap-1.5">
                    <Label htmlFor="category-filter">カテゴリ</Label>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                        <SelectTrigger id="category-filter">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">すべて</SelectItem>
                            {categoryOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                    {option || '(未設定)'}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* タイプフィルタ */}
                <div className="grid gap-1.5">
                    <Label htmlFor="type-filter">タイプ (types)</Label>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger id="type-filter">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">すべて</SelectItem>
                            {typeOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                    {option || '(未設定)'}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* フリーテキスト検索 */}
                <div className="grid gap-1.5">
                    <Label htmlFor="search-text">フリーテキスト検索</Label>
                    <Input
                        id="search-text"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="商品名 / variant_group_id / SKU など"
                    />
                </div>
            </div>

            {/* ページネーション制御（オプション） */}
            {enablePagination && setDisplayCount && displayCount !== undefined && (
                <div className="flex flex-wrap items-center gap-4">
                    <div className="grid gap-1.5">
                        <Label htmlFor="display-count">表示件数</Label>
                        <Select
                            value={String(displayCount)}
                            onValueChange={(value) => {
                                setDisplayCount(value === 'all' ? 'all' : Number(value));
                                if (setCurrentPage) setCurrentPage(1);
                            }}
                        >
                            <SelectTrigger id="display-count" className="w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="10">10件</SelectItem>
                                <SelectItem value="25">25件</SelectItem>
                                <SelectItem value="50">50件</SelectItem>
                                <SelectItem value="100">100件</SelectItem>
                                <SelectItem value="all">全件</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="text-sm text-gray-600 flex-1">
                        表示:{' '}
                        {displayCount === 'all'
                            ? filteredResults || 0
                            : `${currentPage && typeof displayCount === 'number' ? (currentPage - 1) * displayCount + 1 : 1} - ${Math.min(
                                (currentPage || 1) * (typeof displayCount === 'number' ? displayCount : 10),
                                filteredResults || 0
                            )}`}{' '}
                        / {filteredResults?.toLocaleString('ja-JP') || 0}{' '}
                        {totalResults !== undefined && totalResults !== filteredResults && (
                            <>（総数: {totalResults.toLocaleString('ja-JP')}）</>
                        )}
                    </div>
                </div>
            )}

            {/* ページネーションボタン（オプション） */}
            {enablePagination && displayCount !== 'all' && totalPages && totalPages > 1 && setCurrentPage && currentPage !== undefined && (
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 text-sm border rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        最初
                    </button>
                    <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 text-sm border rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        前へ
                    </button>
                    <span className="text-sm text-gray-600 px-2">
                        ページ {currentPage} / {totalPages}
                    </span>
                    <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 text-sm border rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        次へ
                    </button>
                    <button
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 text-sm border rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        最後
                    </button>
                </div>
            )}
        </div>
    );
}
