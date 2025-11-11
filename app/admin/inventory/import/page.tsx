'use client';

import { useState, useMemo } from 'react';
import { getFirestoreClient, refreshFirestoreAuth } from '@/lib/firestoreClient';
import { collection, doc, getDocs, writeBatch, Timestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileText, AlertCircle, CheckCircle2, Trash2, Database } from 'lucide-react';
import { EncodingConverter } from './components/EncodingConverter';
import { DateConverter } from './components/DateConverter';
import { FirestoreStructurePreview } from '@/components/FirestoreStructurePreview';
import { parseFirestoreStructure, convertJsonToFirestoreWrites } from '@/lib/json-import-utils';

const DEFAULT_COLLECTION_NAME = '';
const BATCH_SIZE = 500;

type FileFormat = 'csv' | 'json' | null;

export default function ImportPage() {
    const [fileFormat, setFileFormat] = useState<FileFormat>(null);
    const [fileText, setFileText] = useState('');
    const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [existingCount, setExistingCount] = useState(0);
    const [collectionName, setCollectionName] = useState<string>(DEFAULT_COLLECTION_NAME);
    const [docIdField, setDocIdField] = useState<string>('');
    const [fileName, setFileName] = useState<string>('');
    const [isDragging, setIsDragging] = useState(false);

    // CSVパース関数
    const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                const cleaned = current.trim().replace(/^["']+|["']+$/g, '');
                result.push(cleaned);
                current = '';
            } else {
                current += char;
            }
        }
        const cleaned = current.trim().replace(/^["']+|["']+$/g, '');
        result.push(cleaned);
        return result;
    };

    // CSVパースデータ
    const parsedCsvData = useMemo(() => {
        if (fileFormat !== 'csv' || !fileText) return { headers: [], rows: [] };

        const lines = fileText.trim().split('\n').filter(line => line.trim());
        if (lines.length < 2) return { headers: [], rows: [] };

        const headers = parseCSVLine(lines[0]);
        const rows = lines.slice(1).map((line) => {
            const values = parseCSVLine(line);
            const obj: Record<string, any> = {};
            headers.forEach((header, index) => {
                const value = values[index] || '';
                const numValue = Number(value);
                obj[header] = (!isNaN(numValue) && value.trim() !== '') ? numValue : value;
            });
            return obj;
        });

        return { headers, rows };
    }, [fileText, fileFormat]);

    // JSONパース
    const parsedJson = useMemo(() => {
        if (fileFormat !== 'json' || !fileText) return null;
        try {
            return JSON.parse(fileText);
        } catch {
            return null;
        }
    }, [fileText, fileFormat]);

    // Firestore構造解析（JSON用）
    const firestoreStructure = useMemo(() => {
        if (!parsedJson) return [];
        return parseFirestoreStructure(parsedJson);
    }, [parsedJson]);

    // JSON統計情報
    const jsonStats = useMemo(() => {
        if (!parsedJson) return { collections: 0, documents: 0, fields: 0 };

        const writes = convertJsonToFirestoreWrites(parsedJson);
        const collections = new Set<string>();
        let documents = 0;
        let fields = 0;

        const countWrites = (writeList: any[]) => {
            for (const write of writeList) {
                if (write.type === 'document') {
                    documents++;
                    const pathParts = write.path.split('/');
                    collections.add(pathParts[0]);
                    if (write.data) {
                        fields += Object.keys(write.data).length;
                    }
                    if (write.subcollections) {
                        countWrites(write.subcollections);
                    }
                }
            }
        };

        countWrites(writes);
        return { collections: collections.size, documents, fields };
    }, [parsedJson]);

    const detectFileFormat = (filename: string, content: string): FileFormat => {
        if (filename.endsWith('.json')) return 'json';
        if (filename.endsWith('.csv')) return 'csv';

        // 内容から推測
        try {
            JSON.parse(content);
            return 'json';
        } catch {
            return 'csv';
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const format = detectFileFormat(file.name, text);
            setFileFormat(format);
            setFileText(text);

            if (format === 'json') {
                try {
                    JSON.parse(text);
                    setMessage(`${file.name} を読み込みました（JSON形式）`);
                    setImportStatus('idle');
                } catch {
                    setMessage('JSONのパースに失敗しました');
                    setImportStatus('error');
                }
            } else {
                setMessage(`${file.name} を読み込みました（CSV形式）`);
                setImportStatus('idle');
            }
        };
        reader.readAsText(file, 'UTF-8');
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement | HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement | HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement | HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const file = e.dataTransfer.files?.[0];
        if (!file) return;

        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const format = detectFileFormat(file.name, text);
            setFileFormat(format);
            setFileText(text);

            if (format === 'json') {
                try {
                    JSON.parse(text);
                    setMessage(`${file.name} を読み込みました（JSON形式）`);
                    setImportStatus('idle');
                } catch {
                    setMessage('JSONのパースに失敗しました');
                    setImportStatus('error');
                }
            } else {
                setMessage(`${file.name} を読み込みました（CSV形式）`);
                setImportStatus('idle');
            }
        };
        reader.readAsText(file, 'UTF-8');
    };

    const isDateLike = (value: string): boolean => {
        if (!value || typeof value !== 'string') return false;
        const datePatterns = [
            /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/,
            /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{1,2}:\d{2}(:\d{2})?$/,
            /^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/,
            /^\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\s+\d{1,2}:\d{2}(:\d{2})?$/,
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
        ];
        return datePatterns.some(pattern => pattern.test(value));
    };

    const convertToFirestoreTimestamp = (dateStr: string): Timestamp | string => {
        try {
            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateStr)) {
                const date = new Date(dateStr);
                if (!isNaN(date.getTime())) return Timestamp.fromDate(date);
            }
            if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{1,2}:\d{2}(:\d{2})?$/.test(dateStr)) {
                const normalized = dateStr.replace(/\//g, '-');
                const date = new Date(normalized + '+09:00');
                if (!isNaN(date.getTime())) return Timestamp.fromDate(date);
            }
            if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/.test(dateStr)) {
                const normalized = dateStr.replace(/\//g, '-');
                const date = new Date(normalized + 'T00:00:00+09:00');
                if (!isNaN(date.getTime())) return Timestamp.fromDate(date);
            }
            if (/^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/.test(dateStr)) {
                const parts = dateStr.split(/[-\/]/);
                const date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00+09:00`);
                if (!isNaN(date.getTime())) return Timestamp.fromDate(date);
            }
            return dateStr;
        } catch {
            return dateStr;
        }
    };

    const handleCsvImport = async () => {
        if (!fileText) {
            setMessage('CSVデータがありません');
            return;
        }

        if (!docIdField) {
            setMessage('ドキュメントID列を選択してください');
            return;
        }

        setImportStatus('importing');
        setMessage('インポート中...');

        try {
            await refreshFirestoreAuth();
            const db = getFirestoreClient();
            if (!db) throw new Error('Firestoreの初期化に失敗しました');

            const { rows } = parsedCsvData;
            if (rows.length === 0) throw new Error('CSVデータのパースに失敗しました');

            const collectionRef = collection(db, collectionName);
            let totalCount = 0;
            let batchCount = 0;

            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = writeBatch(db);
                const chunk = rows.slice(i, i + BATCH_SIZE);
                let chunkCount = 0;

                for (const item of chunk) {
                    const rawDocId = String(item[docIdField] || '').trim();
                    const docId = rawDocId.replace(/^["'_]+|["'_]+$/g, '');

                    if (!docId) {
                        console.warn('Document ID is empty for row:', item);
                        continue;
                    }

                    const processedItem: Record<string, any> = {};
                    for (const [key, value] of Object.entries(item)) {
                        if (typeof value === 'string' && isDateLike(value)) {
                            processedItem[key] = convertToFirestoreTimestamp(value);
                        } else {
                            processedItem[key] = value;
                        }
                    }

                    const docRef = doc(collectionRef, docId);
                    batch.set(docRef, {
                        ...processedItem,
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now(),
                    });

                    chunkCount++;
                }

                if (chunkCount > 0) {
                    await batch.commit();
                    batchCount++;
                    totalCount += chunkCount;
                    setMessage(`インポート中... ${totalCount} / ${rows.length} 件 (バッチ ${batchCount})`);
                }
            }

            setImportStatus('success');
            setMessage(`${totalCount}件のデータをインポートしました（${batchCount}バッチ）`);
        } catch (error) {
            console.error('Import error:', error);
            setImportStatus('error');
            setMessage(`エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
        }
    };

    const handleJsonImport = async () => {
        if (!fileText || !parsedJson) {
            setMessage('JSONデータがありません');
            setImportStatus('error');
            return;
        }

        if (!window.confirm('Firestoreにデータをインポートしますか？\n既存のドキュメントは上書きされます。')) {
            return;
        }

        setImportStatus('importing');
        setMessage('インポート中...');

        try {
            const response = await fetch('/api/firestore/import-json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonData: parsedJson }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'インポートに失敗しました');
            }

            setImportStatus('success');
            setMessage(result.message || 'インポートが完了しました');
        } catch (error) {
            console.error('Import error:', error);
            setImportStatus('error');
            setMessage(`エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
        }
    };

    const handleCheckExisting = async () => {
        try {
            await refreshFirestoreAuth();
            const db = getFirestoreClient();
            if (!db) throw new Error('Firestoreの初期化に失敗しました');

            const collectionRef = collection(db, collectionName);
            const snapshot = await getDocs(collectionRef);

            setExistingCount(snapshot.size);
            setMessage(`現在 ${snapshot.size} 件のデータが登録されています`);
        } catch (error) {
            console.error('Check error:', error);
            setMessage(`エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
        }
    };

    const handleDeleteAll = async () => {
        if (!window.confirm(`本当に「${collectionName}」コレクションのすべてのドキュメントを削除しますか？`)) {
            return;
        }

        setImportStatus('importing');
        setMessage('削除中...');

        try {
            await refreshFirestoreAuth();
            const db = getFirestoreClient();
            if (!db) throw new Error('Firestoreの初期化に失敗しました');

            const collectionRef = collection(db, collectionName);
            const snapshot = await getDocs(collectionRef);

            if (snapshot.empty) {
                setImportStatus('success');
                setMessage('削除するドキュメントがありません');
                return;
            }

            const totalDocs = snapshot.docs.length;
            let totalCount = 0;
            let batchCount = 0;

            for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
                const batch = writeBatch(db);
                const chunk = snapshot.docs.slice(i, i + BATCH_SIZE);

                for (const docSnapshot of chunk) {
                    batch.delete(docSnapshot.ref);
                }

                await batch.commit();
                batchCount++;
                totalCount += chunk.length;
                setMessage(`削除中... ${totalCount} / ${totalDocs} 件 (バッチ ${batchCount})`);
            }

            setImportStatus('success');
            setMessage(`${totalCount}件のドキュメントを削除しました（${batchCount}バッチ）`);
        } catch (error) {
            console.error('Delete error:', error);
            setImportStatus('error');
            setMessage(`エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
        }
    };

    const previewData = parsedCsvData.rows.slice(0, 5);

    return (
        <div className="container mx-auto max-w-6xl p-6">
            {/* ヘッダー */}
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900">データインポート</h1>
                <p className="text-gray-600 mt-2">CSV/JSONファイルをFirestoreにインポートします</p>
                {fileFormat && (
                    <Badge className="mt-2" variant={fileFormat === 'json' ? 'default' : 'secondary'}>
                        {fileFormat === 'json' ? 'JSON形式' : 'CSV形式'}
                    </Badge>
                )}
            </div>

            {/* 1. ファイル選択 */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Upload className="w-5 h-5" />
                        1. ファイルを選択
                    </CardTitle>
                    <CardDescription>
                        CSV/JSONファイルを選択するか、テキストエリアに直接データを貼り付けます（自動判別）
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div>
                            <Label
                                htmlFor="file-upload"
                                className="cursor-pointer"
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                            >
                                <div className={`flex items-center justify-center w-full h-32 border-2 border-dashed rounded-lg transition-colors ${
                                    isDragging ? 'border-blue-600 bg-blue-100' : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                                }`}>
                                    <div className="text-center">
                                        {fileName ? (
                                            <div className="flex flex-col items-center gap-2">
                                                <FileText className="w-10 h-10 text-blue-600" />
                                                <span className="text-sm font-medium text-gray-900">{fileName}</span>
                                                <span className="text-xs text-gray-500">クリックして変更</span>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center gap-2">
                                                <Upload className="w-10 h-10 text-gray-400" />
                                                <span className="text-sm font-medium text-gray-700">CSV/JSONファイルを選択</span>
                                                <span className="text-xs text-gray-500">または、ここにドラッグ&ドロップ</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Label>
                            <Input
                                id="file-upload"
                                type="file"
                                accept=".csv,.json"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                        </div>

                        <div>
                            <Label htmlFor="file-text">または、データを直接入力</Label>
                            <textarea
                                id="file-text"
                                value={fileText}
                                onChange={(e) => {
                                    const text = e.target.value;
                                    setFileText(text);
                                    if (text) {
                                        const format = detectFileFormat('', text);
                                        setFileFormat(format);
                                        if (format === 'json') {
                                            try {
                                                JSON.parse(text);
                                                setImportStatus('idle');
                                                setMessage('');
                                            } catch {
                                                setImportStatus('error');
                                                setMessage('JSONのパースに失敗しました');
                                            }
                                        }
                                    }
                                }}
                                placeholder='CSV: "name","email"\n"田中","tanaka@example.com"\n\nJSON: {"users": {"user1": {"name": "田中"}}}'
                                className="w-full h-48 p-3 border border-gray-300 rounded-lg font-mono text-sm resize-vertical focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* CSV用: データ変換機能 */}
            {fileFormat === 'csv' && fileText && (
                <div className="space-y-4 mb-6">
                    <EncodingConverter
                        csvText={fileText}
                        onConvert={(convertedText) => {
                            setFileText(convertedText);
                            setMessage('文字エンコーディングをUTF-8に変換しました');
                        }}
                    />
                    <DateConverter
                        csvText={fileText}
                        onConvert={(convertedText) => {
                            setFileText(convertedText);
                            setMessage('日付フィールドをTimestamp形式に変換しました');
                        }}
                    />
                </div>
            )}

            {/* JSON用: 統計情報 */}
            {fileFormat === 'json' && parsedJson && (
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Database className="w-5 h-5" />
                            2. データ統計
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                                <div className="text-sm font-medium text-yellow-700">コレクション</div>
                                <div className="text-2xl font-bold text-yellow-900 mt-1">{jsonStats.collections}</div>
                            </div>
                            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                                <div className="text-sm font-medium text-blue-700">ドキュメント</div>
                                <div className="text-2xl font-bold text-blue-900 mt-1">{jsonStats.documents}</div>
                            </div>
                            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                                <div className="text-sm font-medium text-green-700">フィールド（合計）</div>
                                <div className="text-2xl font-bold text-green-900 mt-1">{jsonStats.fields}</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* CSV用: コレクション設定 */}
            {fileFormat === 'csv' && (
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Database className="w-5 h-5" />
                            2. コレクション設定
                        </CardTitle>
                        <CardDescription>
                            インポート先のコレクション名とドキュメントID列を指定します
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="collection-name">コレクション名</Label>
                                <Input
                                    id="collection-name"
                                    type="text"
                                    value={collectionName}
                                    onChange={(e) => setCollectionName(e.target.value)}
                                    placeholder="例: inventoriesMaster"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="doc-id-field">ドキュメントID列</Label>
                                <Select value={docIdField} onValueChange={setDocIdField}>
                                    <SelectTrigger id="doc-id-field">
                                        <SelectValue placeholder="列を選択..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {parsedCsvData.headers.map((header) => (
                                            <SelectItem key={header} value={header}>
                                                {header}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div>
                                <div className="text-sm font-medium text-gray-700">
                                    コレクション: <code className="px-2 py-1 bg-white rounded text-xs">{collectionName || '未設定'}</code>
                                </div>
                                <div className="text-sm text-gray-600 mt-1">
                                    既存データ: <Badge variant="secondary">{existingCount} 件</Badge>
                                </div>
                            </div>
                            <Button onClick={handleCheckExisting} variant="outline" size="sm" disabled={!collectionName}>
                                件数を確認
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* JSON用: Firestore構造プレビュー */}
            {fileFormat === 'json' && firestoreStructure.length > 0 && (
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5" />
                            3. Firestore保存構造プレビュー
                        </CardTitle>
                        <CardDescription>
                            日付フィールドは自動的にJST Timestampに変換されます
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <FirestoreStructurePreview structure={firestoreStructure} />
                    </CardContent>
                </Card>
            )}

            {/* CSV用: プレビュー */}
            {fileFormat === 'csv' && previewData.length > 0 && (
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5" />
                            3. プレビュー（最初の5件）
                        </CardTitle>
                        <CardDescription>
                            全 {parsedCsvData.rows.length} 件のデータをインポート可能
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-sm">
                                <thead>
                                    <tr className="bg-gray-50 border-b-2 border-gray-200">
                                        {parsedCsvData.headers.map((header) => (
                                            <th key={header} className="px-4 py-2 text-left font-semibold text-gray-700">
                                                {header}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewData.map((item, index) => (
                                        <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                                            {parsedCsvData.headers.map((header) => (
                                                <td key={header} className="px-4 py-2 text-gray-700">
                                                    {String(item[header] ?? '')}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* 実行ボタン */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>{fileFormat === 'csv' ? '4' : '4'}. 実行</CardTitle>
                    <CardDescription>
                        データをFirestoreにインポートまたは削除します
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="flex gap-3">
                            {fileFormat === 'csv' && (
                                <Button
                                    onClick={handleCsvImport}
                                    disabled={!fileText || !collectionName || !docIdField || importStatus === 'importing'}
                                    className="flex-1 bg-green-600 hover:bg-green-700"
                                    size="lg"
                                >
                                    {importStatus === 'importing' ? (
                                        <>インポート中...</>
                                    ) : (
                                        <>
                                            <Upload className="w-4 h-4 mr-2" />
                                            Firestoreにインポート
                                        </>
                                    )}
                                </Button>
                            )}
                            {fileFormat === 'json' && (
                                <Button
                                    onClick={handleJsonImport}
                                    disabled={!fileText || !parsedJson || importStatus === 'importing'}
                                    className="flex-1 bg-green-600 hover:bg-green-700"
                                    size="lg"
                                >
                                    {importStatus === 'importing' ? (
                                        <>インポート中...</>
                                    ) : (
                                        <>
                                            <Upload className="w-4 h-4 mr-2" />
                                            Firestoreにインポート
                                        </>
                                    )}
                                </Button>
                            )}
                            {fileFormat === 'csv' && (
                                <Button
                                    onClick={handleDeleteAll}
                                    variant="destructive"
                                    size="lg"
                                    disabled={!collectionName || importStatus === 'importing'}
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    全データ削除
                                </Button>
                            )}
                        </div>

                        {message && (
                            <div
                                className={`flex items-center gap-2 p-4 rounded-lg ${
                                    importStatus === 'success'
                                        ? 'bg-green-50 border border-green-200 text-green-800'
                                        : importStatus === 'error'
                                        ? 'bg-red-50 border border-red-200 text-red-800'
                                        : 'bg-blue-50 border border-blue-200 text-blue-800'
                                }`}
                            >
                                {importStatus === 'success' && <CheckCircle2 className="w-5 h-5" />}
                                {importStatus === 'error' && <AlertCircle className="w-5 h-5" />}
                                <span className="text-sm font-medium">{message}</span>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* ヘルプ */}
            <Card>
                <CardHeader>
                    <CardTitle>使い方と対応形式</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div>
                            <h3 className="font-semibold text-gray-900 mb-2">CSV形式</h3>
                            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                                <li>ヘッダー行必須（1行目がフィールド名）</li>
                                <li>コレクション名とドキュメントID列を指定</li>
                                <li>日付は自動的にJST Timestampに変換</li>
                            </ul>
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900 mb-2">JSON形式</h3>
                            <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
{`{
  "コレクション名": {
    "ドキュメントID": {
      "field": "value",
      "date": "2025-01-15 10:30:00",
      "サブコレクション": {
        "サブドキュメントID": { "field": "value" }
      }
    }
  }
}`}
                            </pre>
                            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 mt-2">
                                <li>サブコレクション自動認識</li>
                                <li>日付文字列を自動的にJST Timestampに変換</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
