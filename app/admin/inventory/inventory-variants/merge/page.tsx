'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import { useProductSchema } from '../components/hooks/useProductSchema';
import { useTaxonomies } from '../components/hooks/useTaxonomies';
import type { AggregatedProduct } from '../components/types';

export default function ForceMergePage() {
    const {
        data,
        loading,
        error,
        reload,
        setData,
        search, setSearch,
        categoryFilter, setCategoryFilter,
        typeFilter, setTypeFilter,
        typeOptions,
        filtered,
        displayCount, setDisplayCount,
        currentPage, setCurrentPage,
        totalPages,
        paginatedData,
    } = useProductSchema();

    const { categories: taxonomyCategories } = useTaxonomies();

    // カテゴリーオプションをTaxonomiesから取得
    const categoryOptions = useMemo(() => {
        return taxonomyCategories.map(cat => ({ id: cat.id, label: cat.label }));
    }, [taxonomyCategories]);

    const [sourceGroupId, setSourceGroupId] = useState<string>('');
    const [targetGroupId, setTargetGroupId] = useState<string>('');
    const [isMerging, setIsMerging] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    // 統合元グループ
    const sourceGroup = useMemo(() => {
        return data.find(g => g.variantGroupId === sourceGroupId) || null;
    }, [data, sourceGroupId]);

    // 統合先グループ
    const targetGroup = useMemo(() => {
        return data.find(g => g.variantGroupId === targetGroupId) || null;
    }, [data, targetGroupId]);

    const handleSelectGroup = (groupId: string) => {
        if (!sourceGroupId) {
            // 最初のクリックは統合元として設定
            setSourceGroupId(groupId);
            setTargetGroupId('');
            setStatusMessage('');
        } else if (sourceGroupId === groupId) {
            // 同じものをクリックしたら選択解除
            setSourceGroupId('');
            setTargetGroupId('');
            setStatusMessage('');
        } else if (!targetGroupId) {
            // 2回目のクリックは統合先として設定
            setTargetGroupId(groupId);
            setStatusMessage('');
        } else if (targetGroupId === groupId) {
            // 統合先を解除
            setTargetGroupId('');
            setStatusMessage('');
        } else {
            // 3つ目をクリックしたら統合先を変更
            setTargetGroupId(groupId);
            setStatusMessage('');
        }
    };

    const handleForceMerge = async () => {
        if (!sourceGroup || !targetGroup) {
            setStatusMessage('統合元と統合先の両方を選択してください');
            return;
        }

        const confirmed = confirm(
            `本当に統合しますか？\n\n` +
            `統合元: ${sourceGroup.displayName || sourceGroup.productName} (${sourceGroup.variantGroupId})\n` +
            `統合先: ${targetGroup.displayName || targetGroup.productName} (${targetGroup.variantGroupId})\n\n` +
            `統合元のバリアント ${sourceGroup.variants.length}件が統合先に移動し、統合元は削除されます。`
        );

        if (!confirmed) return;

        setIsMerging(true);
        setStatusMessage('統合処理を実行中...');

        try {
            const docs: any[] = [];

            // 1. 統合元をアーカイブ
            docs.push({
                collection: 'products_master_archive',
                doc: {
                    id: sourceGroup.variantGroupId,
                    data: {
                        variant_group_id: sourceGroup.variantGroupId,
                        product_name: sourceGroup.productName,
                        category: sourceGroup.category,
                        types: sourceGroup.types,
                        damages: sourceGroup.damages,
                        sealing: sourceGroup.sealing,
                        mergedInto: targetGroup.variantGroupId,
                        archivedAt: new Date().toISOString(),
                        originalData: {
                            variant_skus: sourceGroup.variants.map(v => v.variantSku || v.inventoryId),
                            totalQuantity: sourceGroup.totalQuantity,
                        },
                    },
                },
            });

            // 2. 統合元を削除
            docs.push({
                collection: 'products_master',
                doc: {
                    id: sourceGroup.variantGroupId,
                    data: {
                        _deleteDoc: true,
                    },
                },
            });

            // 3. variants_master の全レコードを更新（variantGroupIdRef と variant_id を変更）
            sourceGroup.variants.forEach((variant) => {
                const typesPart = variant.types || 'unknown';
                const oldVariantId = variant.variantSku || `${sourceGroup.variantGroupId}_${typesPart}`;
                
                // 既存の variant_id から suffix（ハッシュ部分）を抽出
                const suffixMatch = oldVariantId.match(/_([a-f0-9]+)$/);
                const suffix = suffixMatch ? suffixMatch[1] : '03d2ee826b'; // デフォルトハッシュ
                const newVariantIdWithSuffix = `${targetGroup.variantGroupId}_${suffix}`;
                
                docs.push({
                    collection: 'variants_master',
                    doc: {
                        id: oldVariantId, // 既存のvariant_idで更新
                        data: {
                            variantGroupIdRef: targetGroup.variantGroupId,
                            variant_id: newVariantIdWithSuffix,
                            type: variant.types || 'default',
                            sealing: variant.sealing || '',
                        },
                    },
                });
            });

            // 4. inventory_master の全レコードを更新（全フィールド保持 + variantIdRef更新）
            sourceGroup.variants.forEach((variant) => {
                const typesPart = variant.types || 'unknown';
                const oldVariantId = variant.variantSku || `${sourceGroup.variantGroupId}_${typesPart}`;
                
                // 既存の variant_id から suffix（ハッシュ部分）を抽出
                const suffixMatch = oldVariantId.match(/_([a-f0-9]+)$/);
                const suffix = suffixMatch ? suffixMatch[1] : '03d2ee826b';
                const newVariantIdWithSuffix = `${targetGroup.variantGroupId}_${suffix}`;
                const newVariantSku = `${targetGroup.variantGroupId}_${typesPart}`;
                
                docs.push({
                    collection: 'inventory_master',
                    doc: {
                        id: variant.inventoryId,
                        data: {
                            // 既存フィールドを全て保持
                            types: variant.types,
                            damages: variant.damages,
                            sealing: variant.sealing,
                            storageLocation: variant.storageLocation,
                            quantity: variant.quantity,
                            unitPrice: variant.unitPrice,
                            statusTokens: variant.statusTokens,
                            barcode: variant.barcode,
                            notes: variant.notes,
                            createdAt: variant.createdAt,
                            // 統合先への参照を更新
                            variantIdRef: newVariantIdWithSuffix, // ⭐ variants_master への参照を更新
                            groupIdRef: targetGroup.variantGroupId,
                            productNameRef: targetGroup.productName,
                            variant_sku: newVariantSku,
                            previous_variant_group_id: sourceGroup.variantGroupId,
                            updated_at: new Date().toISOString(),
                        },
                    },
                });
            });

            // Firestoreに書き込み
            const grouped = docs.reduce<Record<string, any[]>>((acc, item) => {
                if (!acc[item.collection]) acc[item.collection] = [];
                acc[item.collection].push(item.doc);
                return acc;
            }, {});

            let totalWritten = 0;
            const failures: any[] = [];

            for (const [collection, payload] of Object.entries(grouped)) {
                try {
                    const res = await fetch('/api/products-import/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ collection, docs: payload }),
                    });

                    if (!res.ok) {
                        const text = await res.text();
                        failures.push({ collection, reason: text });
                        continue;
                    }

                    const result = await res.json();
                    totalWritten += Number(result?.written || 0);
                } catch (error) {
                    failures.push({ collection, reason: error instanceof Error ? error.message : String(error) });
                }
            }

            if (failures.length > 0) {
                const detail = failures.map(f => `${f.collection}: ${f.reason}`).join(', ');
                throw new Error(`一部の書き込みに失敗しました: ${detail}`);
            }

            // ローカルデータを更新
            setData((prevData) => {
                const filteredData = prevData.filter(g => 
                    g.variantGroupId !== sourceGroup.variantGroupId && 
                    g.variantGroupId !== targetGroup.variantGroupId
                );
                return filteredData;
            });

            setStatusMessage(`✅ 統合が完了しました（${totalWritten}件の書き込み）`);
            setSourceGroupId('');
            setTargetGroupId('');

            // データを再読み込み
            setTimeout(() => {
                reload();
            }, 1000);

        } catch (error) {
            console.error('[ForceMerge] Error:', error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`❌ エラー: ${errorMsg}`);
        } finally {
            setIsMerging(false);
        }
    };

    const renderProductRow = (group: AggregatedProduct) => {
        const displayName = group.displayName || group.productName;
        const isSource = group.variantGroupId === sourceGroupId;
        const isTarget = group.variantGroupId === targetGroupId;
        
        let bgColor = '';
        if (isSource) bgColor = 'bg-red-100 border-red-500';
        else if (isTarget) bgColor = 'bg-blue-100 border-blue-500';

        return (
            <tr
                key={group.variantGroupId}
                className={`border-b hover:bg-gray-50 cursor-pointer ${bgColor}`}
                onClick={() => handleSelectGroup(group.variantGroupId)}
            >
                <td className="px-3 py-2">
                    {isSource && <Badge className="bg-red-600 text-white">統合元</Badge>}
                    {isTarget && <Badge className="bg-blue-600 text-white">統合先</Badge>}
                </td>
                <td className="px-3 py-2 text-sm">
                    <div className="font-semibold">{displayName}</div>
                    {group.seriesId && <div className="text-xs text-gray-500">シリーズID: {group.seriesId}</div>}
                </td>
                <td className="px-3 py-2 text-xs font-mono text-gray-600">{group.variantGroupId}</td>
                <td className="px-3 py-2 text-sm">{group.category}</td>
                <td className="px-3 py-2 text-sm">{group.types?.join(', ') || '-'}</td>
                <td className="px-3 py-2 text-sm text-right">{group.variants.length}</td>
                <td className="px-3 py-2 text-sm text-right">{group.totalQuantity}</td>
            </tr>
        );
    };

    return (
        <main className="min-h-screen px-6 py-8 bg-gray-50">
            <div className="max-w-[1600px] mx-auto flex flex-col gap-6">
                {/* ヘッダー */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex justify-between gap-4 flex-wrap items-center">
                            <div className="flex flex-col gap-1.5">
                                <h1 className="text-2xl font-bold text-gray-900 m-0">強制統合モード</h1>
                                <p className="text-sm text-gray-600 m-0 max-w-3xl">
                                    一覧から2つの商品グループを選択して統合します。最初のクリックが統合元、2回目のクリックが統合先になります。
                                </p>
                            </div>
                            <Link href="/inventory/inventory-variants">
                                <Button variant="outline">← 在庫管理に戻る</Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>

                {/* 検索・フィルター */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <Label>検索</Label>
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="商品名、variant_group_id、シリーズID"
                                    className="mt-2"
                                />
                            </div>
                            <div>
                                <Label>カテゴリ</Label>
                                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                    <SelectTrigger className="mt-2">
                                        <SelectValue placeholder="全て" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[300px] overflow-y-auto">
                                        <SelectItem value="all">全て</SelectItem>
                                        {categoryOptions.map(opt => (
                                            <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>タイプ</Label>
                                <Select value={typeFilter} onValueChange={setTypeFilter}>
                                    <SelectTrigger className="mt-2">
                                        <SelectValue placeholder="全て" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[300px] overflow-y-auto">
                                        <SelectItem value="all">全て</SelectItem>
                                        {typeOptions.map(opt => (
                                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>表示件数</Label>
                                <Select value={String(displayCount)} onValueChange={(v) => setDisplayCount(v === 'all' ? 'all' : Number(v))}>
                                    <SelectTrigger className="mt-2">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[300px] overflow-y-auto">
                                        <SelectItem value="25">25件</SelectItem>
                                        <SelectItem value="50">50件</SelectItem>
                                        <SelectItem value="100">100件</SelectItem>
                                        <SelectItem value="200">200件</SelectItem>
                                        <SelectItem value="500">500件</SelectItem>
                                        <SelectItem value="all">全件表示</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* ステータスメッセージ */}
                {statusMessage && (
                    <Card>
                        <CardContent className="pt-6">
                            <Badge
                                variant={statusMessage.includes('✅') ? 'default' : 'destructive'}
                                className="text-sm"
                            >
                                {statusMessage}
                            </Badge>
                        </CardContent>
                    </Card>
                )}

                {/* 統合ボタン */}
                {sourceGroup && targetGroup && (
                    <Card className="border-2 border-green-500">
                        <CardContent className="pt-6">
                            <div className="flex justify-between items-center gap-4">
                                <div className="flex-1">
                                    <div className="text-sm font-semibold mb-2">統合プレビュー</div>
                                    <div className="text-sm space-y-1">
                                        <div>
                                            <span className="text-red-600 font-semibold">統合元:</span> {sourceGroup.displayName || sourceGroup.productName} ({sourceGroup.variants.length}件)
                                        </div>
                                        <div>
                                            <span className="text-blue-600 font-semibold">統合先:</span> {targetGroup.displayName || targetGroup.productName} ({targetGroup.variants.length}件)
                                        </div>
                                        <div className="text-gray-600">
                                            → 統合後: {targetGroup.variants.length + sourceGroup.variants.length}件のバリアント
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setSourceGroupId('');
                                            setTargetGroupId('');
                                            setStatusMessage('');
                                        }}
                                    >
                                        キャンセル
                                    </Button>
                                    <Button
                                        onClick={handleForceMerge}
                                        disabled={isMerging}
                                        className="bg-red-600 hover:bg-red-700"
                                    >
                                        {isMerging ? '統合中...' : '🔥 強制統合を実行'}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {loading && (
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                                <div className="text-gray-600">データを読み込み中...</div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {error && (
                    <Card>
                        <CardContent className="pt-6">
                            <div className="text-red-600 font-semibold">エラー: {error}</div>
                        </CardContent>
                    </Card>
                )}

                {/* 商品一覧 */}
                {!loading && !error && (
                    <Card>
                        <CardContent className="pt-6">
                            <div className="mb-4 text-sm text-gray-600">
                                {filtered.length}件中 {((currentPage - 1) * Number(displayCount)) + 1}〜{Math.min(currentPage * Number(displayCount), filtered.length)}件を表示
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="border-b-2 bg-gray-100">
                                            <th className="px-3 py-2 text-left text-sm font-semibold">選択</th>
                                            <th className="px-3 py-2 text-left text-sm font-semibold">商品名</th>
                                            <th className="px-3 py-2 text-left text-sm font-semibold">variant_group_id</th>
                                            <th className="px-3 py-2 text-left text-sm font-semibold">カテゴリ</th>
                                            <th className="px-3 py-2 text-left text-sm font-semibold">タイプ</th>
                                            <th className="px-3 py-2 text-right text-sm font-semibold">バリアント数</th>
                                            <th className="px-3 py-2 text-right text-sm font-semibold">総在庫数</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedData.map(group => renderProductRow(group))}
                                    </tbody>
                                </table>
                            </div>

                            {/* ページネーション */}
                            {totalPages > 1 && (
                                <div className="flex justify-center gap-2 mt-4">
                                    <Button
                                        variant="outline"
                                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                        disabled={currentPage === 1}
                                    >
                                        前へ
                                    </Button>
                                    <div className="flex items-center px-4 text-sm">
                                        {currentPage} / {totalPages}
                                    </div>
                                    <Button
                                        variant="outline"
                                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                                        disabled={currentPage === totalPages}
                                    >
                                        次へ
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </main>
    );
}
