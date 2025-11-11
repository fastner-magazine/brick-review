/**
 * 在庫データの取得とフィルタリングを行うカスタムフック（旧2テーブル構造用・非推奨）
 * 
 * 機能:
 * - /api/inventory-variants から集約済みデータを取得
 * - 検索（商品名・カテゴリ・variant_sku）のデバウンス処理
 * - カテゴリ・タイプによるフィルタリング
 * - ページネーション処理
 * 
 * 注意: このフックは旧データ構造用です。新システムでは useInventoryDataNormalized を使用してください。
 */

import { useEffect, useMemo, useState } from 'react';
import type { AggregatedProduct, ApiResponse } from '../types';

export function useInventoryData() {
    const [data, setData] = useState<AggregatedProduct[]>([]);
    const [generatedAt, setGeneratedAt] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');

    const [displayCount, setDisplayCount] = useState<number | 'all'>(10);
    const [currentPage, setCurrentPage] = useState(1);

    // 検索文字列のdebounce（500ms遅延）
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
        }, 500);

        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const res = await fetch('/api/inventory-variants');
                if (!res.ok) throw new Error(`API error: ${res.status}`);
                const payload: ApiResponse = await res.json();
                if (!cancelled) {
                    setData(payload.items);
                    setGeneratedAt(payload.generatedAt);
                }
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : String(err));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const categoryOptions = useMemo(() => {
        const set = new Set<string>();
        data.forEach((item) => { if (item.category) set.add(item.category); });
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
    }, [data]);

    const typeOptions = useMemo(() => {
        const set = new Set<string>();
        data.forEach((item) => { item.types.forEach((t) => { if (t) set.add(t); }); });
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
    }, [data]);

    const filtered = useMemo(() => {
        const searchTerm = debouncedSearch.trim().toLowerCase();
        const hasSearchTerm = searchTerm.length > 0;

        return data
            .filter((group) => {
                if (categoryFilter !== 'all' && group.category !== categoryFilter) return false;
                if (typeFilter !== 'all' && !group.types.some((t) => t === typeFilter)) return false;
                if (!searchTerm) return true;
                const haystack = [
                    group.productName, group.variantGroupId, group.category,
                    ...group.types, ...group.damages,
                    ...group.variants.flatMap((v) => [v.inventoryId, v.variantSku, v.storageLocation, v.barcode, v.statusTokens])
                ].join(' ').toLowerCase();
                return haystack.includes(searchTerm);
            })
            .sort((a, b) => {
                // フリーテキスト検索時は総在庫数の多い順
                if (hasSearchTerm) {
                    const quantityDiff = b.totalQuantity - a.totalQuantity;
                    if (quantityDiff !== 0) return quantityDiff;
                }
                // デフォルトは商品名順
                return a.productName.localeCompare(b.productName, 'ja');
            });
    }, [data, debouncedSearch, categoryFilter, typeFilter]);

    const totalPages = useMemo(() => {
        if (displayCount === 'all') return 1;
        return Math.ceil(filtered.length / displayCount);
    }, [filtered.length, displayCount]);

    const paginatedData = useMemo(() => {
        if (displayCount === 'all') return filtered;
        const start = (currentPage - 1) * displayCount;
        const end = start + displayCount;
        return filtered.slice(start, end);
    }, [filtered, currentPage, displayCount]);

    // ページ変更時に範囲外にならないよう調整
    useEffect(() => {
        if (displayCount !== 'all' && currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages);
        }
    }, [totalPages, currentPage, displayCount]);

    return {
        data, setData, generatedAt, loading, error,
        search, setSearch,
        categoryFilter, setCategoryFilter,
        typeFilter, setTypeFilter,
        categoryOptions, typeOptions,
        filtered,
        displayCount, setDisplayCount,
        currentPage, setCurrentPage,
        totalPages,
        paginatedData,
    };
}
