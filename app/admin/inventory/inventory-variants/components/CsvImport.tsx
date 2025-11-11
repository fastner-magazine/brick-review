'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type CsvImportProps = {
    onImportComplete: () => void;
};

export function CsvImport({ onImportComplete }: CsvImportProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [collectionName, setCollectionName] = useState<string>('inventoriesMaster');
    const [isUploading, setIsUploading] = useState(false);
    const [message, setMessage] = useState<string>('');

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (selectedFile && selectedFile.name.endsWith('.csv')) {
            setFile(selectedFile);
            setMessage('');
        } else {
            setFile(null);
            setMessage('CSV ファイルを選択してください。');
        }
    };

    const handleUpload = async () => {
        if (!file) {
            setMessage('ファイルが選択されていません。');
            return;
        }

        if (!collectionName.trim()) {
            setMessage('コレクション名を入力してください。');
            return;
        }

        setIsUploading(true);
        setMessage('アップロード中...');

        try {
            const text = await file.text();
            const lines = text.split('\n').filter(line => line.trim());

            if (lines.length < 2) {
                setMessage('❌ エラー: CSVファイルにデータが含まれていません。');
                setIsUploading(false);
                return;
            }

            // ヘッダー行を解析（ダブルクォート対応）
            const parseCSVLine = (line: string): string[] => {
                const result: string[] = [];
                let current = '';
                let inQuotes = false;

                for (let i = 0; i < line.length; i++) {
                    const char = line[i];

                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        result.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                result.push(current.trim());
                return result;
            };

            const headers = parseCSVLine(lines[0]);

            // CSVをJSONに変換（フォーマット指定なし、そのまま変換）
            const rows = lines
                .slice(1)
                .map((line) => {
                    const values = parseCSVLine(line);
                    const obj: any = {};
                    headers.forEach((header, index) => {
                        const value = values[index] || '';
                        // 数値変換の試行
                        const numValue = Number(value);
                        obj[header] = (!isNaN(numValue) && value.trim() !== '') ? numValue : value;
                    });
                    return obj;
                });

            // 最初の行からドキュメントIDとして使用するフィールドを推測
            const idField = headers.find(h =>
                h.includes('id') || h.includes('sku') || h === 'variant_group_id'
            ) || headers[0];

            // Firestoreにアップロード
            const response = await fetch('/api/products-import/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    collection: collectionName,
                    docs: rows.map((row) => ({
                        id: String(row[idField] || ''), // 推測したフィールドをIDとして使用
                        data: row,
                    })),
                }),
            });

            const result = await response.json();

            if (response.ok) {
                setMessage(`✓ アップロード完了: ${result.written || rows.length} 件のレコードを保存しました。`);
                setFile(null);
                // ファイル入力をリセット
                const fileInput = document.getElementById('csv-file-input') as HTMLInputElement;
                if (fileInput) fileInput.value = '';
                // データ再読み込み
                setTimeout(() => {
                    onImportComplete();
                    setIsOpen(false);
                }, 2000);
            } else {
                setMessage(`❌ エラー: ${result.error || 'アップロードに失敗しました。'}`);
            }
        } catch (error) {
            setMessage(`❌ エラー: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsUploading(false);
        }
    };

    if (!isOpen) {
        return (
            <Button
                onClick={() => setIsOpen(true)}
                variant="outline"
                className="self-start"
            >
                📄 CSV インポート
            </Button>
        );
    }

    return (
        <Card className="border-2 border-blue-300">
            <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-lg">CSV インポート</CardTitle>
                    <Button
                        onClick={() => {
                            setIsOpen(false);
                            setFile(null);
                            setCollectionName('inventoriesMaster');
                            setMessage('');
                        }}
                        variant="ghost"
                        size="sm"
                    >
                        ✕
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div className="text-sm text-gray-600">
                        <p>CSV ファイルをインポートして Firestore に保存します。</p>
                        <p className="mt-2">
                            ⚠ CSVの内容がそのまま保存されます。ヘッダー行は自動的にフィールド名として使用されます。
                        </p>
                        <p className="mt-1 text-xs">
                            📌 ドキュメントIDは、ヘッダーに「id」「sku」「variant_group_id」を含むフィールドから自動判定されます。
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="collection-name-input" className="block text-sm font-medium text-gray-700">
                            コレクション名
                        </label>
                        <input
                            id="collection-name-input"
                            type="text"
                            value={collectionName}
                            onChange={(e) => setCollectionName(e.target.value)}
                            placeholder="例: inventoriesMaster, productsMaster, variantsMaster"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="csv-file-input" className="block text-sm font-medium text-gray-700">
                            CSV ファイル
                        </label>
                        <input
                            id="csv-file-input"
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                            className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                        {file && (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">
                                選択中: {file.name}
                            </Badge>
                        )}
                    </div>

                    {message && (
                        <div className={`text-sm p-3 rounded-md ${message.startsWith('✓') ? 'bg-green-50 text-green-800' :
                            message.startsWith('❌') ? 'bg-red-50 text-red-800' :
                                'bg-blue-50 text-blue-800'
                            }`}>
                            {message}
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Button
                            onClick={handleUpload}
                            disabled={!file || !collectionName.trim() || isUploading}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            {isUploading ? 'アップロード中...' : 'アップロード'}
                        </Button>
                        <Button
                            onClick={() => {
                                setIsOpen(false);
                                setFile(null);
                                setCollectionName('inventoriesMaster');
                                setMessage('');
                            }}
                            variant="outline"
                            disabled={isUploading}
                        >
                            キャンセル
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
