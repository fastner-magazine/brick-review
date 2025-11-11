'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { getFirestoreClient } from '@/lib/firestoreClient';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

type CategoryStats = {
    category: string;
    count: number;
};

type SyncResult = {
    category: string;
    status: 'success' | 'error';
    message?: string;
};

type TaxonomyCategory = {
    id: string;
    value: string;
    label: string;
    order: number;
    enabled: boolean;
    updatedAt: string;
    createdAt: string;
};

export default function CategorySyncPage() {
    const [categories, setCategories] = useState<CategoryStats[]>([]);
    const [taxonomyCategories, setTaxonomyCategories] = useState<TaxonomyCategory[]>([]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [primaryCategory, setPrimaryCategory] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [merging, setMerging] = useState(false);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');
    const [syncResults, setSyncResults] = useState<SyncResult[]>([]);
    const [mergeResults, setMergeResults] = useState<SyncResult[]>([]);

    // inventory_master からカテゴリーを取得
    const loadCategories = async () => {
        setLoading(true);
        setMessage('');
        setSyncResults([]);

        try {
            const db = getFirestoreClient();
            if (!db) {
                setMessage('Firestore に接続できません');
                setMessageType('error');
                return;
            }

            const inventoryRef = collection(db, 'inventory_master');
            const snapshot = await getDocs(inventoryRef);

            const categoryMap = new Map<string, number>();

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                // inventory_master には category フィールドがないため、variantSku から推定
                // 実際のデータ構造に応じて調整が必要
                const variantSku = data.variantSku || '';

                // variantSku から category を推定（例: "pokemon-box-001" → "pokemon"）
                // または、関連する products_master から取得する必要がある場合もある
                const category = variantSku.split('-')[0] || 'unknown';

                if (category) {
                    categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
                }
            });

            const stats: CategoryStats[] = Array.from(categoryMap.entries())
                .map(([category, count]) => ({ category, count }))
                .sort((a, b) => b.count - a.count);

            setCategories(stats);
            setMessage(`${stats.length} 件のカテゴリーを検出しました（${snapshot.size} 件の在庫から）`);
            setMessageType('success');
        } catch (error) {
            console.error('Load error:', error);
            setMessage(`読み込みエラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
            setMessageType('error');
        } finally {
            setLoading(false);
        }
    };

    // products_master からカテゴリーを取得（より正確）
    const loadCategoriesFromProducts = async () => {
        setLoading(true);
        setMessage('');
        setSyncResults([]);
        setMergeResults([]);

        try {
            const db = getFirestoreClient();
            if (!db) {
                setMessage('Firestore に接続できません');
                setMessageType('error');
                return;
            }

            const productsRef = collection(db, 'products_master');
            const snapshot = await getDocs(productsRef);

            const categoryMap = new Map<string, number>();

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const category = data.category || '';

                if (category && category.trim()) {
                    const trimmed = category.trim();
                    categoryMap.set(trimmed, (categoryMap.get(trimmed) || 0) + 1);
                }
            });

            const stats: CategoryStats[] = Array.from(categoryMap.entries())
                .map(([category, count]) => ({ category, count }))
                .sort((a, b) => b.count - a.count);

            setCategories(stats);
            setMessage(`${stats.length} 件のカテゴリーを検出しました（${snapshot.size} 件の商品から）`);
            setMessageType('success');
        } catch (error) {
            console.error('Load error:', error);
            setMessage(`読み込みエラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
            setMessageType('error');
        } finally {
            setLoading(false);
        }
    };

    // taxonomies/categories/terms からカテゴリーを取得
    const loadCategoriesFromTaxonomies = async () => {
        setLoading(true);
        setMessage('');
        setSyncResults([]);
        setMergeResults([]);

        try {
            const db = getFirestoreClient();
            if (!db) {
                setMessage('Firestore に接続できません');
                setMessageType('error');
                return;
            }

            const termsRef = collection(db, 'taxonomies', 'categories', 'terms');
            const snapshot = await getDocs(termsRef);

            const taxonomyCats: TaxonomyCategory[] = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                taxonomyCats.push({
                    id: docSnap.id,
                    value: data.value || docSnap.id,
                    label: data.label || data.value || docSnap.id,
                    order: data.order || 0,
                    enabled: data.enabled !== false,
                    updatedAt: data.updatedAt || '',
                    createdAt: data.createdAt || '',
                });
            });

            // order でソート
            taxonomyCats.sort((a, b) => a.order - b.order);

            setTaxonomyCategories(taxonomyCats);
            setMessage(`${taxonomyCats.length} 件のカテゴリーを taxonomies から読み込みました`);
            setMessageType('success');
        } catch (error) {
            console.error('Load taxonomy error:', error);
            setMessage(`読み込みエラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
            setMessageType('error');
        } finally {
            setLoading(false);
        }
    };

    // taxonomies/categories/terms サブコレクションに同期
    const syncToTaxonomies = async () => {
        if (categories.length === 0) {
            setMessage('カテゴリーが読み込まれていません');
            setMessageType('error');
            return;
        }

        setSyncing(true);
        setMessage('');
        const results: SyncResult[] = [];

        try {
            const db = getFirestoreClient();
            if (!db) {
                setMessage('Firestore に接続できません');
                setMessageType('error');
                return;
            }

            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < categories.length; i++) {
                const { category } = categories[i];

                try {
                    // taxonomies/categories/terms/{category} に書き込み
                    const termDocRef = doc(db, 'taxonomies', 'categories', 'terms', category);

                    await setDoc(termDocRef, {
                        value: category,
                        order: i + 1,
                        enabled: true,
                        fieldType: 'string',
                        label: category,
                        updatedAt: new Date().toISOString(),
                        createdAt: new Date().toISOString(),
                    }, { merge: true });

                    results.push({
                        category,
                        status: 'success',
                    });
                    successCount++;
                } catch (error) {
                    results.push({
                        category,
                        status: 'error',
                        message: error instanceof Error ? error.message : '不明なエラー',
                    });
                    errorCount++;
                }
            }

            setSyncResults(results);
            setMessage(`同期完了: 成功 ${successCount} 件 / 失敗 ${errorCount} 件`);
            setMessageType(errorCount > 0 ? 'error' : 'success');
        } catch (error) {
            console.error('Sync error:', error);
            setMessage(`同期エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
            setMessageType('error');
        } finally {
            setSyncing(false);
        }
    };

    // カテゴリー統合処理
    const mergeCategories = async () => {
        if (selectedCategories.length < 2) {
            setMessage('統合するには2つ以上のカテゴリーを選択してください');
            setMessageType('error');
            return;
        }

        if (!primaryCategory) {
            setMessage('優先するカテゴリーを選択してください');
            setMessageType('error');
            return;
        }

        if (!selectedCategories.includes(primaryCategory)) {
            setMessage('優先カテゴリーは選択されたカテゴリーの中から選んでください');
            setMessageType('error');
            return;
        }

        setMerging(true);
        setMessage('');
        const results: SyncResult[] = [];

        try {
            const db = getFirestoreClient();
            if (!db) {
                setMessage('Firestore に接続できません');
                setMessageType('error');
                return;
            }

            // 優先カテゴリー以外を削除
            const categoriesToDelete = selectedCategories.filter(cat => cat !== primaryCategory);

            for (const categoryToDelete of categoriesToDelete) {
                try {
                    const termDocRef = doc(db, 'taxonomies', 'categories', 'terms', categoryToDelete);
                    await deleteDoc(termDocRef);
                    results.push({
                        category: categoryToDelete,
                        status: 'success',
                        message: '削除済み',
                    });
                } catch (error) {
                    results.push({
                        category: categoryToDelete,
                        status: 'error',
                        message: `削除失敗: ${error instanceof Error ? error.message : '不明なエラー'}`,
                    });
                }
            }

            // 優先カテゴリーの順序を更新
            try {
                const primaryDocRef = doc(db, 'taxonomies', 'categories', 'terms', primaryCategory);
                await setDoc(primaryDocRef, {
                    updatedAt: new Date().toISOString(),
                }, { merge: true });

                results.push({
                    category: primaryCategory,
                    status: 'success',
                    message: '優先カテゴリーとして保持',
                });
            } catch (error) {
                results.push({
                    category: primaryCategory,
                    status: 'error',
                    message: `更新失敗: ${error instanceof Error ? error.message : '不明なエラー'}`,
                });
            }

            setMergeResults(results);
            const successCount = results.filter(r => r.status === 'success').length;
            const errorCount = results.filter(r => r.status === 'error').length;
            setMessage(`統合完了: 成功 ${successCount} 件 / 失敗 ${errorCount} 件`);
            setMessageType(errorCount > 0 ? 'error' : 'success');

            // 統合後にリストを更新
            await loadCategoriesFromTaxonomies();
            setSelectedCategories([]);
            setPrimaryCategory('');
        } catch (error) {
            console.error('Merge error:', error);
            setMessage(`統合エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
            setMessageType('error');
        } finally {
            setMerging(false);
        }
    };

    // カテゴリー選択の切り替え
    const toggleCategorySelection = (categoryId: string) => {
        setSelectedCategories(prev =>
            prev.includes(categoryId)
                ? prev.filter(id => id !== categoryId)
                : [...prev, categoryId]
        );
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="container mx-auto px-4 max-w-6xl">
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-3xl font-bold text-gray-800">カテゴリー同期ツール</h1>
                    <Link href="/test">
                        <Button variant="outline">← テストメニューに戻る</Button>
                    </Link>
                </div>

                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>概要</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-gray-600 mb-4">
                            このツールは、<code className="bg-gray-100 px-2 py-1 rounded">products_master</code> または{' '}
                            <code className="bg-gray-100 px-2 py-1 rounded">inventory_master</code> から
                            カテゴリーを抽出し、<code className="bg-gray-100 px-2 py-1 rounded">taxonomies/categories/terms</code>{' '}
                            サブコレクションに同期します。また、既存のカテゴリーを統合することもできます。
                        </p>
                        <div className="flex gap-3 flex-wrap">
                            <Button
                                onClick={loadCategoriesFromProducts}
                                disabled={loading || syncing || merging}
                                variant="default"
                            >
                                {loading ? '読み込み中...' : 'products_master から読み込み'}
                            </Button>
                            <Button
                                onClick={loadCategories}
                                disabled={loading || syncing || merging}
                                variant="outline"
                            >
                                {loading ? '読み込み中...' : 'inventory_master から読み込み'}
                            </Button>
                            <Button
                                onClick={loadCategoriesFromTaxonomies}
                                disabled={loading || syncing || merging}
                                variant="outline"
                            >
                                {loading ? '読み込み中...' : 'taxonomies からフェッチ'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {message && (
                    <Card className="mb-6">
                        <CardContent className="pt-6">
                            <div
                                className={`p-4 rounded-lg ${messageType === 'success'
                                    ? 'bg-green-50 text-green-800 border border-green-200'
                                    : messageType === 'error'
                                        ? 'bg-red-50 text-red-800 border border-red-200'
                                        : 'bg-blue-50 text-blue-800 border border-blue-200'
                                    }`}
                            >
                                {message}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {categories.length > 0 && (
                    <>
                        <Card className="mb-6">
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle>検出されたカテゴリー ({categories.length} 件)</CardTitle>
                                    <Button
                                        onClick={syncToTaxonomies}
                                        disabled={syncing || merging}
                                        className="bg-green-600 hover:bg-green-700"
                                    >
                                        {syncing ? '同期中...' : 'taxonomies に同期'}
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {categories.map(({ category, count }) => (
                                        <div
                                            key={category}
                                            className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200"
                                        >
                                            <span className="font-medium text-gray-800">{category}</span>
                                            <Badge variant="secondary">{count} 件</Badge>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}

                {taxonomyCategories.length > 0 && (
                    <Card className="mb-6">
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle>既存カテゴリー ({taxonomyCategories.length} 件)</CardTitle>
                                {selectedCategories.length >= 2 && (
                                    <Button
                                        onClick={mergeCategories}
                                        disabled={merging || !primaryCategory}
                                        className="bg-orange-600 hover:bg-orange-700"
                                    >
                                        {merging ? '統合中...' : '選択カテゴリーを統合'}
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            {selectedCategories.length >= 2 && (
                                <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                                    <Label className="text-sm font-medium text-orange-800 mb-2 block">
                                        優先するカテゴリーを選択してください（統合後はこのカテゴリーのみが残ります）
                                    </Label>
                                    <div className="flex gap-2 flex-wrap">
                                        {selectedCategories.map(categoryId => (
                                            <label key={categoryId} className="flex items-center gap-2">
                                                <input
                                                    type="radio"
                                                    name="primaryCategory"
                                                    value={categoryId}
                                                    checked={primaryCategory === categoryId}
                                                    onChange={(e) => setPrimaryCategory(e.target.value)}
                                                    className="text-orange-600"
                                                />
                                                <span className="text-sm">{categoryId}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {taxonomyCategories.map((taxCategory) => (
                                    <div
                                        key={taxCategory.id}
                                        className={`flex items-center justify-between bg-white p-3 rounded-lg border ${selectedCategories.includes(taxCategory.id)
                                            ? 'border-orange-300 bg-orange-50'
                                            : 'border-gray-200'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedCategories.includes(taxCategory.id)}
                                                onChange={() => toggleCategorySelection(taxCategory.id)}
                                                className="text-orange-600"
                                            />
                                            <div>
                                                <span className="font-medium text-gray-800">{taxCategory.label}</span>
                                                <div className="text-xs text-gray-500">
                                                    順序: {taxCategory.order}
                                                </div>
                                            </div>
                                        </div>
                                        <Badge variant={taxCategory.enabled ? 'default' : 'secondary'}>
                                            {taxCategory.enabled ? '有効' : '無効'}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {syncResults.length > 0 && (
                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle>同期結果</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {syncResults.map((result, index) => (
                                    <div
                                        key={index}
                                        className={`flex items-center justify-between p-3 rounded-lg border ${result.status === 'success'
                                            ? 'bg-green-50 border-green-200'
                                            : 'bg-red-50 border-red-200'
                                            }`}
                                    >
                                        <div>
                                            <span className="font-medium text-gray-800">{result.category}</span>
                                            {result.message && (
                                                <p className="text-sm text-gray-600 mt-1">{result.message}</p>
                                            )}
                                        </div>
                                        <Badge variant={result.status === 'success' ? 'default' : 'destructive'}>
                                            {result.status === 'success' ? '成功' : '失敗'}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {mergeResults.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>統合結果</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {mergeResults.map((result, index) => (
                                    <div
                                        key={index}
                                        className={`flex items-center justify-between p-3 rounded-lg border ${result.status === 'success'
                                            ? 'bg-green-50 border-green-200'
                                            : 'bg-red-50 border-red-200'
                                            }`}
                                    >
                                        <div>
                                            <span className="font-medium text-gray-800">{result.category}</span>
                                            {result.message && (
                                                <p className="text-sm text-gray-600 mt-1">{result.message}</p>
                                            )}
                                        </div>
                                        <Badge variant={result.status === 'success' ? 'default' : 'destructive'}>
                                            {result.status === 'success' ? '成功' : '失敗'}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
