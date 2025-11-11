/**
 * Product Schema（商品スキーマ）在庫データ取得フック
 * 
 * Product Schema とは:
 * - productsMaster: 商品グループの基本情報（商品名、カテゴリ）
 * - variantsMaster: バリエーション定義（type, sealing）
 * - inventoriesMaster: 在庫実体（数量、場所、状態）
 * 
 * 機能:
 * - /api/inventory-variants から集約済みデータを取得（サーバー側で3テーブルJOIN済み）
 * - 検索・フィルタリング・ページネーション
 * 
 * データフロー:
 * 1. API から AggregatedProduct[] を取得（すでに結合済み）
 * 2. 内部形式（JoinedProduct）にマッピング
 * 3. フィルタリング・ソート・ページネーション適用
 * 
 * 用途: inventory-variants ページで商品一覧を表示・編集する際のデータソース
 */

import { useEffect, useMemo, useState } from 'react';
import type { AggregatedProduct } from '../types';

/**
 * Product Schema 在庫データを取得し、フィルタリングするフック
 * 
 * 初期読み込み最適化:
 * - 検索文字列が空の場合は最初の50件のみ取得
 * - 検索開始時に全データを取得（検索ベース）
 */
export function useProductSchema() {
    const [joinedData, setJoinedData] = useState<AggregatedProduct[]>([]);

    const [generatedAt, setGeneratedAt] = useState('');
    const [loading, setLoading] = useState(false); // 初期状態ではloading=false
    const [error, setError] = useState<string | null>(null);

    // サーバー側ページネーション用の状態
    const [serverTotalPages, setServerTotalPages] = useState(1);
    const [serverTotalItems, setServerTotalItems] = useState(0);

    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');

    const [showAll, setShowAll] = useState(false); // 全件表示フラグ

    const [displayCount, setDisplayCount] = useState<number | 'all'>(50);
    const [currentPage, setCurrentPage] = useState(1);

    // リロード用のトリガー
    const [reloadTrigger, setReloadTrigger] = useState(0);
    const reload = () => setReloadTrigger(prev => prev + 1);

    // データを直接 /api/inventory-variants から取得
    // 初期状態では何も取得しない。検索またはshowAllが必要
    useEffect(() => {
        let cancelled = false;

        // 検索もshowAllもカテゴリーもない場合は何もしない
        if (!search.trim() && !showAll && categoryFilter === 'all') {
            setJoinedData([]);
            setLoading(false);
            return;
        }

        (async () => {
            try {
                setLoading(true);
                setError(null);

                // URLパラメータを構築
                const params = new URLSearchParams();

                // ページネーションパラメータ
                params.set('page', String(currentPage));
                params.set('limit', String(displayCount === 'all' ? 1000 : displayCount));

                // カテゴリーフィルターをクエリパラメータとして追加
                if (categoryFilter && categoryFilter !== 'all') {
                    params.set('category', categoryFilter);
                }

                // 検索文字列をクエリパラメータとして追加
                if (search.trim()) {
                    params.set('search', search.trim());
                }

                // 全件表示フラグ
                if (showAll) {
                    params.set('showAll', 'true');
                }

                // listOnly: 商品リストのみ取得（variants/inventory不要で高速化）
                params.set('listOnly', 'true');

                const url = `/api/inventory-variants?${params.toString()}`;

                const res = await fetch(url);

                if (!res.ok) {
                    const errorText = await res.text();
                    console.error('[useProductSchema] API error response:', errorText);
                    throw new Error(`API error: ${res.status} ${res.statusText} - ${errorText}`);
                }

                const payload = await res.json();

                if (cancelled) return;

                // サーバー側ページネーション情報を更新
                setServerTotalPages(payload.totalPages || 1);
                setServerTotalItems(payload.totalGroups || 0);

                // AggregatedProduct[] を直接受け取る（variantsは空配列で初期化）
                const aggregatedData = payload.items || [];
                setJoinedData(aggregatedData.map((item: any) => ({
                    docid: item.docid,
                    variantGroupId: item.variantGroupId,
                    // 表示名に必要なフィールドを通す
                    seriesId: item.seriesId,
                    productName: item.productName,
                    vol: item.vol,
                    displayName: item.displayName,
                    releaseDate: item.releaseDate,
                    // その他フィルタ用フィールド
                    category: item.category,
                    types: item.types,
                    damages: item.damages,
                    sealing: item.sealing,
                    totalQuantity: item.totalQuantity || 0,
                    // listOnly=trueの場合variantsは空配列、展開時に個別取得する
                    variants: (item.variants || []).map((v: any) => ({
                        inventoryId: v.inventoryId,
                        variantSku: v.variantSku,
                        types: v.types,
                        damages: v.damages,
                        sealing: v.sealing,
                        storageLocation: v.storageLocation,
                        quantity: v.quantity,
                        unitPrice: v.unitPrice,
                        statusTokens: v.statusTokens,
                        barcode: v.barcode,
                        notes: v.notes,
                        updatedAt: v.updatedAt,
                        createdAt: v.createdAt,
                    })),
                })));

                setGeneratedAt(payload.generatedAt || new Date().toISOString());
                console.log('[useProductSchema] ✅ Data loaded successfully');

            } catch (err) {
                console.error('[useProductSchema] ❌ Failed to fetch data:', err);
                if (!cancelled) setError(err instanceof Error ? err.message : String(err));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [search, categoryFilter, showAll, currentPage, displayCount, reloadTrigger]);

    const typeOptions = useMemo(() => {
        const set = new Set<string>();
        joinedData.forEach((item) => {
            item.variants.forEach((v) => { if (v.types) set.add(v.types); });
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
    }, [joinedData]);

    // サーバー側でページネーションしているので、フィルタリングのみ実行
    const filtered = useMemo(() => {
        return joinedData
            .filter((group) => {
                // typeフィルターのみクライアント側で処理（サーバー側実装が複雑なため）
                if (typeFilter !== 'all' && !group.variants.some((v) => v.types === typeFilter)) return false;

                // カテゴリーと検索はサーバー側で処理済み
                return true;
            });
    }, [joinedData, typeFilter]);

    // サーバー側でページネーション済みなので、データをそのまま使用
    const totalPages = useMemo(() => {
        // サーバーから取得した実際のtotalPagesを使用
        return serverTotalPages;
    }, [serverTotalPages]);

    const paginatedData = useMemo(() => {
        // サーバー側でページネーション済みなので、filteredデータをそのまま返す
        return filtered;
    }, [filtered]);

    // ページ変更時に範囲外にならないよう調整
    useEffect(() => {
        if (displayCount !== 'all' && currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages);
        }
    }, [totalPages, currentPage, displayCount]);

    return {
        // 結合データ
        data: joinedData,
        setData: setJoinedData,
        generatedAt,
        loading,
        error,
        reload, // リロード関数を追加

        // フィルタリング
        search, setSearch,
        categoryFilter, setCategoryFilter,
        typeFilter, setTypeFilter,
        typeOptions,
        filtered,

        // 全件表示
        showAll, setShowAll,

        // ページネーション
        displayCount, setDisplayCount,
        currentPage, setCurrentPage,
        totalPages,
        paginatedData,

        // サーバー側ページネーション情報
        serverTotalItems,
    };
}