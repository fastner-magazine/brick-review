'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

type ImportedRecord = {
    buyback_price_id: string;
    variantIdRef: string;
    variantGroupIdRef: string;
    productName: string;  // CSVではproductNameにリネーム済み
    category: string;
    type: string;
    sealing: string;
    priority: string;
    amount: string;
    status: string;
    needsMapping?: boolean;
    suggestedProducts?: any[];
    selectedVariantGroupId?: string;
    selectedVariantId?: string;
    selectedProductName?: string;
    inventoryData?: {
        inventory_id: string;
        variant_id: string;
        variant_group_id: string;
        productName: string;
        category: string;
        types: string;
        sealing: string;
        location: string;
        quantity: number;
        barcode: string;
    } | null;
    productMasterData?: {
        variant_group_id: string;
        product_name: string;
        displayName?: string;
        category: string;
    } | null;
};

type Product = {
    variant_group_id: string;
    series_id?: string;
    product_name: string;
    vol?: string;
    displayName?: string;
    category: string;
};

type Variant = {
    variant_id: string;
    variantGroupIdRef: string;
    type: string;
    sealing: string;
};

export default function PriceMasterImportPage() {
    // ドキュメントIDの扱い
    const [useCsvDocId, setUseCsvDocId] = useState(true);
    const [docIdColumn, setDocIdColumn] = useState<string>('buyback_price_id');
    const [availableColumns, setAvailableColumns] = useState<string[]>([]);

    const [file, setFile] = useState<File | null>(null);
    const [records, setRecords] = useState<ImportedRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState<any>(null);
    const [importing, setImporting] = useState(false);

    // ページネーション
    const [pageSize, setPageSize] = useState(10);
    const [currentPage, setCurrentPage] = useState(0);

    // 商品選択ダイアログ（レコードごと）
    const [selectingRecordIndex, setSelectingRecordIndex] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [searching, setSearching] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [variants, setVariants] = useState<Variant[]>([]);
    const [loadingVariants, setLoadingVariants] = useState(false);

    // 手動バリアント入力
    const [manualType, setManualType] = useState('');
    const [manualSealing, setManualSealing] = useState('');
    const [showManualInput, setShowManualInput] = useState(false);

    // Taxonomies データ
    const [taxonomies, setTaxonomies] = useState<any>(null);
    const [loadingTaxonomies, setLoadingTaxonomies] = useState(false);

    // Taxonomies を取得
    const loadTaxonomies = async () => {
        try {
            setLoadingTaxonomies(true);
            const res = await fetch('/api/taxonomies');
            if (!res.ok) throw new Error('Taxonomies取得失敗');
            const data = await res.json();
            setTaxonomies(data.documents);
        } catch (err) {
            console.error('[Import] Load taxonomies error:', err);
        } finally {
            setLoadingTaxonomies(false);
        }
    };

    // 初回ロード時にtaxonomiesを取得
    useEffect(() => {
        loadTaxonomies();
    }, []);

    // CSV ファイル読み込み
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setError(null);
        }
    };

    // CSV パース
    const parseCSV = async (file: File): Promise<ImportedRecord[]> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const text = event.target?.result as string;
                    const lines = text.split('\n').filter(line => line.trim());

                    if (lines.length < 2) {
                        reject(new Error('CSV ファイルが空です'));
                        return;
                    }

                    // ヘッダー行を解析（引用符を考慮）
                    const headers = parseCSVLine(lines[0]);

                    // データ行を解析
                    const records: ImportedRecord[] = [];
                    for (let i = 1; i < lines.length; i++) {
                        const values = parseCSVLine(lines[i]);
                        if (values.length === headers.length) {
                            const record: any = {};
                            headers.forEach((header, index) => {
                                record[header] = values[index];
                            });
                            records.push(record as ImportedRecord);
                        }
                    }

                    resolve(records);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
            reader.readAsText(file, 'utf-8');
        });
    };

    // CSV 行のパース（引用符とカンマを考慮）
    const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);

        return result;
    };

    // CSV アップロードと解析
    const handleUpload = async () => {
        if (!file) return;

        try {
            setLoading(true);
            setError(null);

            // CSV をパース
            const parsedRecords = await parseCSV(file);

            // ヘッダーから列名を取得
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target?.result as string;
                const lines = text.split('\n').filter(line => line.trim());
                if (lines.length > 0) {
                    const headers = parseCSVLine(lines[0]);
                    setAvailableColumns(headers);
                }
            };
            reader.readAsText(file, 'utf-8');

            // API に送信して処理
            const res = await fetch('/api/price-master/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: parsedRecords }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `API error: ${res.status}`);
            }

            const data = await res.json();
            setRecords(data.records);
            setStats(data.stats);
            setCurrentPage(0);

            console.log('[Import] Processed records:', data.stats);
        } catch (err) {
            console.error('[Import] Error:', err);
            setError(err instanceof Error ? err.message : 'アップロードに失敗しました');
        } finally {
            setLoading(false);
        }
    };

    // レコードごとに商品検索
    const handleSearchForRecord = async (recordIndex: number) => {
        const record = records[recordIndex];
        if (!record) return;

        // 前回の選択状態をクリア
        setSelectedProduct(null);
        setVariants([]);
        setShowManualInput(false);
        setManualType('');
        setManualSealing('');

        try {
            setSearching(true);
            const params = new URLSearchParams({
                action: 'search-products',
                query: searchQuery || record.productName,
            });

            const res = await fetch(`/api/price-master/import?${params}`);
            if (!res.ok) throw new Error('検索に失敗しました');

            const data = await res.json();
            setSearchResults(data.products);
        } catch (err) {
            console.error('[Import] Search error:', err);
        } finally {
            setSearching(false);
        }
    };

    // 商品選択
    const handleSelectProduct = async (product: Product) => {
        setSelectedProduct(product);
        setLoadingVariants(true);
        setShowManualInput(false); // リセット

        try {
            const params = new URLSearchParams({
                action: 'get-variants',
                variantGroupId: product.variant_group_id,
            });

            const res = await fetch(`/api/price-master/import?${params}`);
            if (!res.ok) throw new Error('バリアント取得に失敗しました');

            const data = await res.json();
            setVariants(data.variants);
        } catch (err) {
            console.error('[Import] Get variants error:', err);
        } finally {
            setLoadingVariants(false);
        }
    };

    // バリアント選択（商品名を上書き）
    const handleSelectVariant = (variant: Variant) => {
        if (selectingRecordIndex === null) return;

        const productDisplayName = selectedProduct?.displayName || selectedProduct?.product_name || '';

        const updatedRecords = records.map((r, idx) => {
            if (idx === selectingRecordIndex) {
                return {
                    ...r,
                    variantGroupIdRef: variant.variantGroupIdRef,
                    variantIdRef: variant.variant_id,
                    selectedVariantGroupId: variant.variantGroupIdRef,
                    selectedVariantId: variant.variant_id,
                    selectedProductName: productDisplayName,
                    product_name: productDisplayName,
                    needsMapping: false,
                };
            }
            return r;
        });

        setRecords(updatedRecords);
        setSelectingRecordIndex(null);
        setSelectedProduct(null);
        setVariants([]);
        setSearchQuery('');
        setSearchResults([]);
        setManualType('');
        setManualSealing('');
        setShowManualInput(false);
    };

    // 手動でバリアント情報を設定（バリアントが存在しない場合）
    const handleManualVariantAssign = () => {
        if (selectingRecordIndex === null || !selectedProduct) return;

        // 既存の variant_group_id から vg_XXXXXX の部分を取得
        // variant_group_id は既に "vg_" で始まっているので、そのまま使用
        const variantGroupIdBase = selectedProduct.variant_group_id;

        // type + sealing のハッシュ部分だけを生成
        const suffixInput = `${manualType || 'default'}_${manualSealing || ''}`;
        let suffixHash = 0;
        for (let i = 0; i < suffixInput.length; i++) {
            const char = suffixInput.charCodeAt(i);
            suffixHash = ((suffixHash << 5) - suffixHash) + char;
            suffixHash = suffixHash & suffixHash;
        }

        // 16進数10文字
        const suffix = Math.abs(suffixHash).toString(16).padStart(10, '0').slice(0, 10);

        // variant_group_id + suffix で新しいバリアントIDを生成
        const newVariantId = `${variantGroupIdBase}_${suffix}`;

        const productDisplayName = selectedProduct.displayName || selectedProduct.product_name;

        const updatedRecords = records.map((r, idx) => {
            if (idx === selectingRecordIndex) {
                return {
                    ...r,
                    variantGroupIdRef: selectedProduct.variant_group_id,
                    variantIdRef: newVariantId,
                    selectedVariantGroupId: selectedProduct.variant_group_id,
                    selectedVariantId: newVariantId,
                    selectedProductName: productDisplayName,
                    product_name: productDisplayName,
                    type: manualType || r.type,
                    sealing: manualSealing || r.sealing,
                    needsMapping: false,
                };
            }
            return r;
        });

        setRecords(updatedRecords);
        setSelectingRecordIndex(null);
        setSelectedProduct(null);
        setVariants([]);
        setSearchQuery('');
        setSearchResults([]);
        setManualType('');
        setManualSealing('');
        setShowManualInput(false);
    };

    // マッピング済みのレコードを計算
    const mappedRecords = records.filter(r => !r.needsMapping);
    const mappedCount = mappedRecords.length;

    // inventory_idで再検索
    const handleRefreshInventory = async (recordIndex: number) => {
        const record = records[recordIndex];
        const inventoryId = (record as any).inventory_id;

        if (!inventoryId) {
            alert('inventory_idがありません');
            return;
        }

        try {
            const params = new URLSearchParams({
                action: 'get-inventory',
                inventoryId: inventoryId,
            });

            const res = await fetch(`/api/price-master/import?${params}`);
            if (!res.ok) throw new Error('在庫データの取得に失敗しました');

            const data = await res.json();

            // レコードを更新
            const updatedRecords = records.map((r, idx) => {
                if (idx === recordIndex) {
                    return {
                        ...r,
                        inventoryData: data.inventory,
                    };
                }
                return r;
            });

            setRecords(updatedRecords);
            alert('在庫データを再取得しました');
        } catch (err) {
            console.error('[Import] Refresh inventory error:', err);
            alert('在庫データの取得に失敗しました');
        }
    };

    // CSVエクスポート関数（未マッピングのレコード用）
    const exportUnmappedToCSV = () => {
        const unmapped = records.filter(r => r.needsMapping);
        if (unmapped.length === 0) {
            alert('未マッピングのレコードがありません');
            return;
        }

        // CSVヘッダー
        const headers = [
            'buyback_price_id',
            'variantIdRef',
            'variantGroupIdRef',
            'product_name',
            'category',
            'type',
            'sealing',
            'priority',
            'amount',
            'status'
        ];

        // CSV行を生成
        const csvRows = [headers.join(',')];

        unmapped.forEach(record => {
            const row = headers.map(header => {
                const value = record[header as keyof ImportedRecord] || '';
                // カンマや改行を含む場合は引用符で囲む
                if (String(value).includes(',') || String(value).includes('\n') || String(value).includes('"')) {
                    return `"${String(value).replace(/"/g, '""')}"`;
                }
                return String(value);
            });
            csvRows.push(row.join(','));
        });

        // BlobとしてCSVを生成
        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

        // ダウンロード
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `unmapped_records_${Date.now()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // インポート実行（マッピング済みのみを送信）
    const handleImport = async () => {
        const unmapped = records.filter(r => r.needsMapping);
        if (mappedCount === 0) {
            setError('マッピング済みのレコードがありません。少なくとも1件はマッピングしてください');
            return;
        }

        try {
            setImporting(true);

            // マッピング済みのレコードのみを送信
            const payloadRecords = mappedRecords;

            const res = await fetch('/api/buyback-prices/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    records: payloadRecords,
                    useCsvId: Boolean(useCsvDocId),
                    docIdColumn: useCsvDocId ? docIdColumn : undefined
                }),
            });

            if (!res.ok) throw new Error('インポートに失敗しました');

            // 成功した数をユーザーへ通知
            alert(`${payloadRecords.length}件を buyback_prices に保存しました（未マッピング ${unmapped.length} 件は除外されました）`);

            // マッピング済みは削除して、未マッピングだけ残す
            const remaining = records.filter(r => r.needsMapping);
            setRecords(remaining);

            // stats を残件数ベースで更新（簡易）
            setStats({ total: remaining.length, mapped: 0, needsMapping: remaining.length });

            // ファイルは継続して扱いたければクリアしない。全て処理済みならリセット
            if (remaining.length === 0) {
                setFile(null);
                setCurrentPage(0);
            } else {
                setCurrentPage(0);
            }
        } catch (err) {
            console.error('[Import] Import error:', err);
            setError(err instanceof Error ? err.message : 'インポートに失敗しました');
        } finally {
            setImporting(false);
        }
    };

    // ページネーション計算
    const totalPages = Math.ceil(records.length / pageSize);
    const startIndex = currentPage * pageSize;
    const endIndex = Math.min(startIndex + pageSize, records.length);
    const currentRecords = records.slice(startIndex, endIndex);

    return (
        <main className="min-h-screen px-6 py-8 bg-gray-50">
            <Card className="max-w-7xl mx-auto">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>買取価格マスター - インポート</CardTitle>
                        <Link href="/buy/price-master">
                            <Button variant="outline">← 戻る</Button>
                        </Link>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* ドキュメントID設定 */}
                    <div className="space-y-2">
                        <Label>ドキュメントIDの扱い</Label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="useCsvDocId"
                                    checked={useCsvDocId}
                                    onChange={() => setUseCsvDocId(true)}
                                    className="w-4 h-4"
                                />
                                <span className="text-sm">CSVの列を使う</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="useCsvDocId"
                                    checked={!useCsvDocId}
                                    onChange={() => setUseCsvDocId(false)}
                                    className="w-4 h-4"
                                />
                                <span className="text-sm">自動生成 (timestamp+商品名)</span>
                            </label>
                        </div>
                        {useCsvDocId && availableColumns.length > 0 && (
                            <div className="mt-2">
                                <Label htmlFor="docIdColumn" className="text-sm">ドキュメントID列を選択</Label>
                                <select
                                    id="docIdColumn"
                                    value={docIdColumn}
                                    onChange={(e) => setDocIdColumn(e.target.value)}
                                    className="w-full border rounded px-3 py-2 mt-1 text-sm"
                                >
                                    {availableColumns.map((col) => (
                                        <option key={col} value={col}>
                                            {col}
                                        </option>
                                    ))}
                                </select>
                                <div className="text-xs text-gray-500 mt-1">
                                    選択した列の値がFirestoreのドキュメントIDとして使用されます
                                </div>
                            </div>
                        )}
                    </div>

                    {/* CSVファイル選択 */}
                    <div>
                        <Label htmlFor="csv-file">buyback_prices_normalized.csv</Label>
                        <Input
                            id="csv-file"
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                            className="mt-1"
                        />
                    </div>

                    <Button onClick={handleUpload} disabled={!file || loading}>
                        {loading ? 'アップロード中...' : 'アップロード'}
                    </Button>

                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
                            {error}
                        </div>
                    )}

                    {stats && (
                        <div className="text-sm space-y-1 bg-blue-50 p-3 rounded">
                            <div>総レコード数: {stats.total}</div>
                            <div className="text-green-700">マッピング済み: {stats.mapped}</div>
                            <div className="text-orange-700">要マッピング: {stats.needsMapping}</div>
                        </div>
                    )}

                    {records.length > 0 && (
                        <>
                            <Card>
                                <CardHeader>
                                    <div className="flex justify-between items-center">
                                        <CardTitle>インポートプレビュー ({records.length}件)</CardTitle>
                                        <div className="flex gap-2 items-center">
                                            <Label className="text-sm font-normal">表示件数:</Label>
                                            <select
                                                value={pageSize}
                                                onChange={(e) => {
                                                    setPageSize(Number(e.target.value));
                                                    setCurrentPage(0);
                                                }}
                                                className="border rounded px-2 py-1 text-sm"
                                            >
                                                <option value={10}>10件</option>
                                                <option value={50}>50件</option>
                                                <option value={100}>100件</option>
                                            </select>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2 max-h-[600px] overflow-y-auto">
                                        {currentRecords.map((record, displayIndex) => {
                                            const actualIndex = startIndex + displayIndex;
                                            const inv = record.inventoryData;

                                            // データの不一致チェック
                                            const productNameMatch = !inv || record.productName === inv.productName;
                                            const categoryMatch = !inv || record.category === inv.category;
                                            const typeMatch = !inv || record.type === inv.types || (record as any).types === inv.types;
                                            const sealingMatch = !inv || record.sealing === inv.sealing || (record as any).buyback_sealing === inv.sealing;
                                            const allMatch = productNameMatch && categoryMatch && typeMatch && sealingMatch;

                                            return (
                                                <div
                                                    key={actualIndex}
                                                    className={`p-3 border rounded text-sm ${record.needsMapping
                                                        ? 'bg-orange-50 border-orange-300'
                                                        : allMatch
                                                            ? 'bg-green-50 border-green-300'
                                                            : 'bg-yellow-50 border-yellow-300'
                                                        }`}
                                                >
                                                    <div className="space-y-2">
                                                        {/* ヘッダー：ID表示 */}
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                {(record as any).inventory_id && (
                                                                    <>
                                                                        <Badge variant="outline" className="text-xs">
                                                                            inv:{(record as any).inventory_id}
                                                                        </Badge>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            onClick={() => handleRefreshInventory(actualIndex)}
                                                                            className="h-6 px-2 text-xs"
                                                                            title="inventories_masterから再検索"
                                                                        >
                                                                            🔄
                                                                        </Button>
                                                                    </>
                                                                )}
                                                                {(record as any).buyback_price_id && (
                                                                    <Badge variant="outline" className="text-xs">
                                                                        bp:{(record as any).buyback_price_id}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {record.needsMapping ? (
                                                                    <>
                                                                        <Badge variant="destructive">要マッピング</Badge>
                                                                        <Button
                                                                            size="sm"
                                                                            onClick={() => {
                                                                                setSelectingRecordIndex(actualIndex);
                                                                                setSearchQuery('');
                                                                                setSearchResults([]);
                                                                                handleSearchForRecord(actualIndex);
                                                                            }}
                                                                        >
                                                                            商品を選択
                                                                        </Button>
                                                                    </>
                                                                ) : allMatch ? (
                                                                    <Badge className="bg-green-600">✓ 一致</Badge>
                                                                ) : (
                                                                    <Badge className="bg-yellow-600">⚠ 不一致</Badge>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* 対比表 */}
                                                        <div className="grid grid-cols-2 gap-4">
                                                            {/* 左側：CSVデータ */}
                                                            <div className="space-y-1 border-r pr-4">
                                                                <div className="font-semibold text-xs text-gray-500 mb-2">📄 CSVデータ</div>
                                                                <div className={`text-sm font-semibold ${!productNameMatch ? 'text-red-600' : ''}`}>
                                                                    {record.productName}
                                                                    {!productNameMatch && <span className="ml-1">⚠</span>}
                                                                </div>
                                                                <div className="text-xs space-y-0.5">
                                                                    <div className={!categoryMatch ? 'text-red-600' : ''}>
                                                                        カテゴリ: {record.category}
                                                                        {!categoryMatch && <span className="ml-1">⚠</span>}
                                                                    </div>
                                                                    <div className={!typeMatch ? 'text-red-600' : ''}>
                                                                        Type: {record.type || (record as any).types || '-'}
                                                                        {!typeMatch && <span className="ml-1">⚠</span>}
                                                                    </div>
                                                                    <div className={!sealingMatch ? 'text-red-600' : ''}>
                                                                        Sealing: {record.sealing || (record as any).buyback_sealing || '-'}
                                                                        {!sealingMatch && <span className="ml-1">⚠</span>}
                                                                    </div>
                                                                    {(record as any).location && (
                                                                        <div>
                                                                            保管場所(CSV): {(record as any).location}
                                                                        </div>
                                                                    )}
                                                                    {((record as any).buyback_amount || record.amount) && (
                                                                        <div className="font-semibold text-green-700">
                                                                            買取価格: ¥{parseInt((record as any).buyback_amount || record.amount).toLocaleString('ja-JP')}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* 右側：productsMasterデータ */}
                                                            <div className="space-y-1 pl-4">
                                                                <div className="font-semibold text-xs text-gray-500 mb-2">🗄️ productsMaster</div>
                                                                {record.productMasterData ? (
                                                                    <>
                                                                        <div className="text-sm font-semibold">
                                                                            {record.productMasterData.displayName || record.productMasterData.product_name}
                                                                        </div>
                                                                        <div className="text-xs space-y-0.5">
                                                                            <div>
                                                                                カテゴリ: {record.productMasterData.category}
                                                                            </div>
                                                                            <div className="text-gray-500">
                                                                                variant_group_id: {record.productMasterData.variant_group_id}
                                                                            </div>
                                                                        </div>
                                                                    </>
                                                                ) : inv ? (
                                                                    <>
                                                                        <div className={`text-sm font-semibold ${!productNameMatch ? 'text-red-600' : ''}`}>
                                                                            {inv.productName}
                                                                            {!productNameMatch && <span className="ml-1">⚠</span>}
                                                                        </div>
                                                                        <div className="text-xs space-y-0.5">
                                                                            <div className={!categoryMatch ? 'text-red-600' : ''}>
                                                                                カテゴリ: {inv.category}
                                                                                {!categoryMatch && <span className="ml-1">⚠</span>}
                                                                            </div>
                                                                            <div className={!typeMatch ? 'text-red-600' : ''}>
                                                                                Type: {inv.types || '-'}
                                                                                {!typeMatch && <span className="ml-1">⚠</span>}
                                                                            </div>
                                                                            <div className={!sealingMatch ? 'text-red-600' : ''}>
                                                                                Sealing: {inv.sealing || '-'}
                                                                                {!sealingMatch && <span className="ml-1">⚠</span>}
                                                                            </div>
                                                                            <div className="font-semibold text-blue-700">
                                                                                保管場所: {inv.location || '-'}
                                                                            </div>
                                                                            <div>在庫数: {inv.quantity}</div>
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    <div className="text-xs text-gray-400 italic">
                                                                        マスターデータなし
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Variant ID情報 */}
                                                        <div className="text-xs text-gray-500 pt-2 border-t space-y-0.5">
                                                            {record.selectedVariantId && (
                                                                <div>✓ Variant ID: {record.selectedVariantId}</div>
                                                            )}
                                                            {(record as any).variant_id && !record.selectedVariantId && (
                                                                <div>Variant ID: {(record as any).variant_id}</div>
                                                            )}
                                                            {(record as any).variant_group_id && (
                                                                <div>Group ID: {(record as any).variant_group_id}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* ページネーションコントロール */}
                                    <div className="mt-4 flex justify-between items-center">
                                        <div className="text-sm text-gray-600">
                                            {startIndex + 1} - {endIndex} / {records.length}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setCurrentPage(0)}
                                                disabled={currentPage === 0}
                                            >
                                                最初
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                                                disabled={currentPage === 0}
                                            >
                                                前へ
                                            </Button>
                                            <div className="px-3 py-1 text-sm border rounded bg-white">
                                                {currentPage + 1} / {totalPages}
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                                                disabled={currentPage >= totalPages - 1}
                                            >
                                                次へ
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setCurrentPage(totalPages - 1)}
                                                disabled={currentPage >= totalPages - 1}
                                            >
                                                最後
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="mt-4 flex gap-2">
                                        <Button
                                            onClick={handleImport}
                                            disabled={importing || mappedCount === 0}
                                            className="bg-green-600 hover:bg-green-700"
                                        >
                                            {importing ? (
                                                'アップロード中...'
                                            ) : (
                                                mappedCount === records.length
                                                    ? `${mappedCount}件をアップロード`
                                                    : `${mappedCount}件をアップロード（未マッピング ${records.length - mappedCount} 件は除外）`
                                            )}
                                        </Button>
                                        {records.filter(r => r.needsMapping).length > 0 && (
                                            <Button
                                                variant="outline"
                                                onClick={exportUnmappedToCSV}
                                                className="border-orange-500 text-orange-700 hover:bg-orange-50"
                                            >
                                                未マッピング {records.filter(r => r.needsMapping).length}件をCSV保存
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                setRecords([]);
                                                setStats(null);
                                                setFile(null);
                                                setCurrentPage(0);
                                            }}
                                        >
                                            キャンセル
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}

                    {/* 商品選択ダイアログ */}
                    <Dialog open={selectingRecordIndex !== null} onOpenChange={(open) => {
                        if (!open) {
                            // ダイアログを閉じるときに全ての選択状態をリセット
                            setSelectingRecordIndex(null);
                            setSelectedProduct(null);
                            setVariants([]);
                            setSearchQuery('');
                            setSearchResults([]);
                            setShowManualInput(false);
                            setManualType('');
                            setManualSealing('');
                        }
                    }}>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-white">
                            <DialogHeader>
                                <DialogTitle>商品を選択</DialogTitle>
                                <DialogDescription asChild>
                                    {selectingRecordIndex !== null && (() => {
                                        const record = records[selectingRecordIndex];
                                        return (
                                            <div className="space-y-1 text-sm text-muted-foreground">
                                                <div className="font-semibold">{record?.productName} に対応する商品を選択してください</div>
                                                <div className="text-xs text-gray-600 mt-2">
                                                    <div>カテゴリ: {record?.category || '-'}</div>
                                                    <div>Type: {record?.type || '-'}</div>
                                                    {record?.sealing && <div>Sealing: {record.sealing}</div>}
                                                    {record?.amount && <div>価格: ¥{parseInt(record.amount).toLocaleString('ja-JP')}</div>}
                                                    {record?.priority && <div>優先度: {record.priority}</div>}
                                                    {record?.status && <div>ステータス: {record.status}</div>}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4">
                                <div>
                                    <Label>商品名で検索</Label>
                                    <div className="flex gap-2 mt-1">
                                        <Input
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder={selectingRecordIndex !== null ? records[selectingRecordIndex]?.productName : ''}
                                        />
                                        <Button onClick={() => selectingRecordIndex !== null && handleSearchForRecord(selectingRecordIndex)} disabled={searching}>
                                            {searching ? '検索中...' : '検索'}
                                        </Button>
                                    </div>
                                </div>

                                {selectingRecordIndex !== null && records[selectingRecordIndex]?.suggestedProducts && records[selectingRecordIndex].suggestedProducts!.length > 0 && !searchQuery && (
                                    <div>
                                        <Label>候補商品</Label>
                                        <div className="space-y-2 mt-2">
                                            {records[selectingRecordIndex].suggestedProducts!.map((product: Product) => (
                                                <div
                                                    key={product.variant_group_id}
                                                    className="p-3 border rounded hover:bg-gray-50 cursor-pointer"
                                                    onClick={() => handleSelectProduct(product)}
                                                >
                                                    <div className="font-semibold">{product.displayName || product.product_name}</div>
                                                    <div className="text-xs text-gray-600">{product.category}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {searchResults.length > 0 && (
                                    <div>
                                        <Label>検索結果</Label>
                                        <div className="space-y-2 mt-2">
                                            {searchResults.map((product) => (
                                                <div
                                                    key={product.variant_group_id}
                                                    className="p-3 border rounded hover:bg-gray-50 cursor-pointer"
                                                    onClick={() => handleSelectProduct(product)}
                                                >
                                                    <div className="font-semibold">{product.displayName || product.product_name}</div>
                                                    <div className="text-xs text-gray-600">{product.category}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedProduct && (
                                    <div>
                                        <Label>バリアントを選択: {selectedProduct.displayName || selectedProduct.product_name}</Label>
                                        {loadingVariants ? (
                                            <div className="text-sm text-gray-600">読み込み中...</div>
                                        ) : (
                                            <div className="space-y-3 mt-2">
                                                {variants.length > 0 && (
                                                    <div className="space-y-2">
                                                        {variants.map((variant) => (
                                                            <div
                                                                key={variant.variant_id}
                                                                className="p-3 border rounded hover:bg-blue-50 cursor-pointer"
                                                                onClick={() => handleSelectVariant(variant)}
                                                            >
                                                                <div className="text-sm">
                                                                    <span className="font-semibold">Type:</span> {variant.type}
                                                                    {variant.sealing && (
                                                                        <span className="ml-2">
                                                                            <span className="font-semibold">Sealing:</span> {variant.sealing}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="text-xs text-gray-500 mt-1">ID: {variant.variant_id}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* 手動追加ボタン（常に表示） */}
                                                {!showManualInput ? (
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => setShowManualInput(true)}
                                                        className="w-full"
                                                    >
                                                        {variants.length > 0 ? '該当するバリアントがない場合は手動で追加' : '手動でバリアントを追加'}
                                                    </Button>
                                                ) : (
                                                    <div className="space-y-3 p-4 border-2 border-amber-300 bg-amber-50 rounded">
                                                        <div className="text-sm font-semibold text-amber-800">
                                                            新しいバリアントを追加
                                                        </div>
                                                        <div className="space-y-2">
                                                            <div>
                                                                <Label htmlFor="manual-type">Type *</Label>
                                                                {loadingTaxonomies ? (
                                                                    <div className="text-xs text-gray-500">読み込み中...</div>
                                                                ) : taxonomies?.type_variant?._subcollections?.terms ? (
                                                                    <select
                                                                        id="manual-type"
                                                                        value={manualType}
                                                                        onChange={(e) => setManualType(e.target.value)}
                                                                        className="w-full border rounded px-3 py-2 mt-1"
                                                                    >
                                                                        <option value="">選択してください</option>
                                                                        {Object.entries(taxonomies.type_variant._subcollections.terms).map(([id, term]: [string, any]) => (
                                                                            <option key={id} value={term.label || id}>
                                                                                {term.label || id}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                ) : (
                                                                    <Input
                                                                        id="manual-type"
                                                                        value={manualType}
                                                                        onChange={(e) => setManualType(e.target.value)}
                                                                        placeholder="例: 初版"
                                                                        className="mt-1"
                                                                    />
                                                                )}
                                                            </div>
                                                            <div>
                                                                <Label htmlFor="manual-sealing">Sealing</Label>
                                                                {loadingTaxonomies ? (
                                                                    <div className="text-xs text-gray-500">読み込み中...</div>
                                                                ) : taxonomies?.sealing_variant?._subcollections?.terms ? (
                                                                    <select
                                                                        id="manual-sealing"
                                                                        value={manualSealing}
                                                                        onChange={(e) => setManualSealing(e.target.value)}
                                                                        className="w-full border rounded px-3 py-2 mt-1"
                                                                    >
                                                                        <option value="">選択してください</option>
                                                                        {Object.entries(taxonomies.sealing_variant._subcollections.terms).map(([id, term]: [string, any]) => (
                                                                            <option key={id} value={term.label || id}>
                                                                                {term.label || id}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                ) : (
                                                                    <Input
                                                                        id="manual-sealing"
                                                                        value={manualSealing}
                                                                        onChange={(e) => setManualSealing(e.target.value)}
                                                                        placeholder="例: 未開封"
                                                                        className="mt-1"
                                                                    />
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-gray-600 bg-white p-2 rounded border border-blue-200">
                                                                <div className="font-semibold text-blue-800 mb-1">生成されるバリアントID:</div>
                                                                <div className="font-mono text-blue-600 break-all">
                                                                    {selectedProduct.variant_group_id}_[{manualType || 'default'}_{manualSealing || ''}のハッシュ]
                                                                </div>
                                                                <div className="text-xs text-gray-500 mt-2 space-y-1">
                                                                    <div>✓ 既存の variant_group_id を使用: <span className="font-mono">{selectedProduct.variant_group_id}</span></div>
                                                                    <div>✓ type+sealing の組み合わせから10桁のハッシュを生成して追加</div>
                                                                    <div>✓ 同じ商品グループのバリアントとしてまとまります</div>
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <Button
                                                                    onClick={handleManualVariantAssign}
                                                                    disabled={!manualType.trim()}
                                                                    className="flex-1"
                                                                >
                                                                    追加して割り当て
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    onClick={() => {
                                                                        setShowManualInput(false);
                                                                        setManualType('');
                                                                        setManualSealing('');
                                                                    }}
                                                                >
                                                                    キャンセル
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </DialogContent>
                    </Dialog>
                </CardContent>
            </Card>
        </main>
    );
}
