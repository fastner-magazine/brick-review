'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import PriceMasterSearchBar from './components/PriceMasterSearchBar';

type PriceMasterItem = {
    id: string;
    variantIdRef: string;
    product_name: string;
    category: string;
    type?: string;
    sealing?: string;
    price: number | null;
    status?: string;
    priority?: number;
    image?: string;
    notes?: string;
    createdAt?: any;
    updatedAt?: any;
};

type AggregatedProduct = {
    variantGroupId: string;
    productName: string;
    category: string;
    totalQuantity: number;
};

export default function PriceMasterPage() {
    const [products, setProducts] = useState<AggregatedProduct[]>([]);
    const [priceMaster, setPriceMaster] = useState<Map<string, PriceMasterItem>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    // フィルタリング
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [priceFilter, setPriceFilter] = useState<'all' | 'set' | 'unset'>('all');

    // 編集中の価格（一時保存）
    const [editingPrices, setEditingPrices] = useState<Map<string, string>>(new Map());

    // 商品データを取得
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                setLoading(true);
                setError(null);

                console.log('[PriceMaster] Fetching products from /api/inventory-variants...');
                const res = await fetch('/api/inventory-variants');

                if (!res.ok) {
                    throw new Error(`API error: ${res.status} ${res.statusText}`);
                }

                const payload = await res.json();
                const items = payload.items || [];
                setProducts(items);

                console.log('[PriceMaster] Loaded products:', items.length);
            } catch (err) {
                console.error('[PriceMaster] Failed to fetch products:', err);
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, []);

    // 価格マスターを取得
    useEffect(() => {
        const fetchPriceMaster = async () => {
            try {
                console.log('[PriceMaster] Fetching price master from Firestore...');
                const res = await fetch('/api/price-master');

                if (!res.ok) {
                    console.warn('[PriceMaster] Price master not found or error, starting fresh');
                    return;
                }

                const data = await res.json();
                const priceMap = new Map<string, PriceMasterItem>();

                if (data.items && Array.isArray(data.items)) {
                    data.items.forEach((item: PriceMasterItem) => {
                        priceMap.set(item.variantIdRef, item);
                    });
                }

                setPriceMaster(priceMap);
                console.log('[PriceMaster] Loaded price master:', priceMap.size, 'items');
            } catch (err) {
                console.error('[PriceMaster] Failed to fetch price master:', err);
            }
        };

        fetchPriceMaster();
    }, []);

    // カテゴリ一覧
    const categories = useMemo(() => {
        const set = new Set<string>();
        products.forEach(p => {
            if (p.category) set.add(p.category);
        });
        return Array.from(set).sort();
    }, [products]);

    // フィルタリング済み商品
    const filteredProducts = useMemo(() => {
        return products.filter(product => {
            // カテゴリフィルタ
            if (categoryFilter !== 'all' && product.category !== categoryFilter) {
                return false;
            }

            // 価格設定フィルタ
            if (priceFilter === 'set') {
                const priceItem = priceMaster.get(product.variantGroupId);
                if (!priceItem || priceItem.price === null) return false;
            } else if (priceFilter === 'unset') {
                const priceItem = priceMaster.get(product.variantGroupId);
                if (priceItem && priceItem.price !== null) return false;
            }

            // 検索フィルタ
            if (search) {
                const searchLower = search.toLowerCase();
                const haystack = [
                    product.productName,
                    product.variantGroupId,
                    product.category,
                ].join(' ').toLowerCase();

                if (!haystack.includes(searchLower)) return false;
            }

            return true;
        });
    }, [products, search, categoryFilter, priceFilter, priceMaster]);

    // 価格入力の変更
    const handlePriceChange = (variantGroupId: string, value: string) => {
        const newMap = new Map(editingPrices);
        newMap.set(variantGroupId, value);
        setEditingPrices(newMap);
    };

    // 個別保存
    const handleSavePrice = async (product: AggregatedProduct) => {
        const priceStr = editingPrices.get(product.variantGroupId);
        const price = priceStr ? parseFloat(priceStr) : null;

        if (price !== null && (isNaN(price) || price < 0)) {
            setStatusMessage(`❌ 無効な価格: ${priceStr}`);
            return;
        }

        try {
            setSaving(true);
            setStatusMessage('保存中...');

            const item: PriceMasterItem = {
                id: product.variantGroupId,
                variantIdRef: product.variantGroupId,
                product_name: product.productName,
                category: product.category,
                price: price,
                updatedAt: { _seconds: Math.floor(Date.now() / 1000), _nanoseconds: 0 },
            };

            const res = await fetch('/api/price-master', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: [item] }),
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`保存失敗: ${errorText}`);
            }

            // ローカル状態を更新
            const newPriceMaster = new Map(priceMaster);
            newPriceMaster.set(product.variantGroupId, item);
            setPriceMaster(newPriceMaster);

            // 編集中の価格をクリア
            const newEditingPrices = new Map(editingPrices);
            newEditingPrices.delete(product.variantGroupId);
            setEditingPrices(newEditingPrices);

            setStatusMessage(`✅ ${product.productName} の価格を保存しました`);
            setTimeout(() => setStatusMessage(''), 3000);
        } catch (err) {
            console.error('[PriceMaster] Save failed:', err);
            setStatusMessage(`❌ ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setSaving(false);
        }
    };

    // 一括保存
    const handleSaveAll = async () => {
        const itemsToSave: PriceMasterItem[] = [];

        editingPrices.forEach((priceStr, variantGroupId) => {
            const product = products.find(p => p.variantGroupId === variantGroupId);
            if (!product) return;

            const price = priceStr ? parseFloat(priceStr) : null;
            if (price !== null && (isNaN(price) || price < 0)) {
                return; // スキップ
            }

            itemsToSave.push({
                id: variantGroupId,
                variantIdRef: variantGroupId,
                product_name: product.productName,
                category: product.category,
                price: price,
                updatedAt: { _seconds: Math.floor(Date.now() / 1000), _nanoseconds: 0 },
            });
        });

        if (itemsToSave.length === 0) {
            setStatusMessage('保存する変更がありません');
            return;
        }

        try {
            setSaving(true);
            setStatusMessage(`${itemsToSave.length}件を保存中...`);

            const res = await fetch('/api/price-master', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: itemsToSave }),
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`保存失敗: ${errorText}`);
            }

            // ローカル状態を更新
            const newPriceMaster = new Map(priceMaster);
            itemsToSave.forEach(item => {
                newPriceMaster.set(item.variantIdRef, item);
            });
            setPriceMaster(newPriceMaster);

            // 編集中の価格をクリア
            setEditingPrices(new Map());

            setStatusMessage(`✅ ${itemsToSave.length}件の価格を保存しました`);
            setTimeout(() => setStatusMessage(''), 3000);
        } catch (err) {
            console.error('[PriceMaster] Batch save failed:', err);
            setStatusMessage(`❌ ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setSaving(false);
        }
    };

    // 表示用の価格を取得
    const getDisplayPrice = (product: AggregatedProduct): string => {
        const editing = editingPrices.get(product.variantGroupId);
        if (editing !== undefined) return editing;

        const priceItem = priceMaster.get(product.variantGroupId);
        if (priceItem && priceItem.price !== null) {
            return String(priceItem.price);
        }

        return '';
    };

    // 変更されているか
    const hasChanges = (product: AggregatedProduct): boolean => {
        const editing = editingPrices.get(product.variantGroupId);
        if (editing === undefined) return false;

        const priceItem = priceMaster.get(product.variantGroupId);
        const currentPrice = priceItem?.price ?? null;
        const newPrice = editing ? parseFloat(editing) : null;

        return currentPrice !== newPrice;
    };

    return (
        <main className="min-h-screen px-6 py-8 bg-gray-50">
            <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
                {/* ヘッダー */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex justify-between items-start gap-4 flex-wrap">
                            <div className="flex flex-col gap-1.5">
                                <h1 className="text-2xl font-bold text-gray-900 m-0">買取価格マスター</h1>
                                <p className="text-sm text-gray-600 m-0">
                                    商品ごとの買取価格を設定・管理します。在庫データから商品を読み込み、価格を登録していきます。
                                </p>
                                <div className="text-xs text-gray-500 mt-1">
                                    総商品数: {products.length.toLocaleString('ja-JP')} /
                                    価格設定済み: {priceMaster.size.toLocaleString('ja-JP')} /
                                    表示中: {filteredProducts.length.toLocaleString('ja-JP')}
                                </div>
                            </div>
                            <Link href="/buy">
                                <Button variant="outline">
                                    ← 買取メニューに戻る
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>

                {/* フィルタ */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="grid gap-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-semibold">フィルタ</h3>
                                <Link href="/buy/price-master/import">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                    >
                                        CSV インポート
                                    </Button>
                                </Link>
                            </div>

                            <PriceMasterSearchBar
                                search={search}
                                setSearch={setSearch}
                                categoryFilter={categoryFilter}
                                setCategoryFilter={setCategoryFilter}
                                categoryOptions={categories}
                                priceFilter={priceFilter}
                                setPriceFilter={setPriceFilter}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* ステータスメッセージ */}
                {statusMessage && (
                    <Card className="border-blue-200 bg-blue-50">
                        <CardContent className="pt-4">
                            <div className="text-sm text-blue-900">{statusMessage}</div>
                        </CardContent>
                    </Card>
                )}

                {/* 一括保存ボタン */}
                {editingPrices.size > 0 && (
                    <Card className="border-green-200 bg-green-50">
                        <CardContent className="pt-4">
                            <div className="flex justify-between items-center gap-4">
                                <div className="text-sm text-green-900">
                                    {editingPrices.size}件の変更があります
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => setEditingPrices(new Map())}
                                        variant="outline"
                                        size="sm"
                                        disabled={saving}
                                    >
                                        変更を破棄
                                    </Button>
                                    <Button
                                        onClick={handleSaveAll}
                                        size="sm"
                                        disabled={saving}
                                        className="bg-green-600 hover:bg-green-700"
                                    >
                                        {saving ? '保存中...' : 'すべて保存'}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* ローディング */}
                {loading && (
                    <Card>
                        <CardContent className="pt-6">
                            <div className="text-gray-600">読み込み中...</div>
                        </CardContent>
                    </Card>
                )}

                {/* エラー */}
                {error && !loading && (
                    <Card className="border-red-200 bg-red-50">
                        <CardContent className="pt-6">
                            <div className="text-red-600 font-semibold">データの取得に失敗しました: {error}</div>
                        </CardContent>
                    </Card>
                )}

                {/* 商品リスト */}
                {!loading && !error && filteredProducts.map((product) => {
                    const priceItem = priceMaster.get(product.variantGroupId);
                    const displayPrice = getDisplayPrice(product);
                    const changed = hasChanges(product);

                    return (
                        <Card key={product.variantGroupId} className={changed ? 'border-yellow-300' : ''}>
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-start gap-4 flex-wrap">
                                    <div className="flex-1">
                                        <CardTitle className="text-lg">
                                            {product.productName}
                                        </CardTitle>
                                        <div className="flex gap-3 flex-wrap text-xs text-gray-600 mt-2">
                                            <span>ID: {product.variantGroupId}</span>
                                            <span>カテゴリ: {product.category}</span>
                                            <span>在庫数: {product.totalQuantity}</span>
                                        </div>
                                    </div>
                                    {priceItem && (
                                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                                            登録済み
                                        </Badge>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-end gap-3 flex-wrap">
                                    <div className="flex-1 min-w-[200px] max-w-[300px]">
                                        <Label htmlFor={`price-${product.variantGroupId}`}>
                                            買取価格（円）
                                        </Label>
                                        <Input
                                            id={`price-${product.variantGroupId}`}
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={displayPrice}
                                            onChange={(e) => handlePriceChange(product.variantGroupId, e.target.value)}
                                            placeholder="価格を入力"
                                            className={changed ? 'border-yellow-400 bg-yellow-50' : ''}
                                        />
                                    </div>
                                    <Button
                                        onClick={() => handleSavePrice(product)}
                                        disabled={saving || !changed}
                                        size="sm"
                                        className={changed ? 'bg-green-600 hover:bg-green-700' : ''}
                                    >
                                        {changed ? '保存' : '変更なし'}
                                    </Button>
                                    {priceItem && priceItem.updatedAt && (
                                        <div className="text-xs text-gray-500 ml-auto">
                                            最終更新: {new Date((priceItem.updatedAt._seconds || priceItem.updatedAt.seconds || 0) * 1000).toLocaleString('ja-JP')}
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}

                {/* 商品なし */}
                {!loading && !error && filteredProducts.length === 0 && (
                    <Card>
                        <CardContent className="pt-6">
                            <div className="text-gray-500 text-center py-8">
                                条件に一致する商品が見つかりませんでした
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </main>
    );
}
