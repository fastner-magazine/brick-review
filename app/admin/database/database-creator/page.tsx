'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { getFirestoreClient } from '@/lib/firestoreClient';
import { doc, writeBatch } from 'firebase/firestore';

type ColumnMapping = {
    csvColumn: string; // CSV列名
    firestoreField: string; // Firestore フィールド名
    fieldType: 'string' | 'number' | 'boolean' | 'timestamp' | 'array' | 'map';
    isDocumentId: boolean; // ドキュメントIDとして使用するか
    isSubCollection: boolean; // サブコレクションとして配置するか
    subCollectionName?: string; // サブコレクション名
    arrayDelimiter?: string; // array型の場合の区切り文字
    skipEmpty: boolean; // 空の値をスキップするか
};

type DocumentIdStrategy = {
    type: 'column' | 'uuid' | 'ulid' | 'substring' | 'composite' | 'auto-increment';
    columnName?: string; // column/substring/compositeの場合
    startIndex?: number; // substringの場合の開始位置
    length?: number; // substringの場合の長さ
    compositeColumns?: string[]; // compositeの場合の複数列
    compositeSeparator?: string; // compositeの区切り文字
    prefix?: string; // プレフィックス
    suffix?: string; // サフィックス
};

type ImportConfig = {
    collectionName: string;
    mappings: ColumnMapping[];
    primaryKey: string; // ドキュメントIDとして使用する列（column/substring/compositeの場合）
    documentIdStrategy: DocumentIdStrategy;
};

export default function DatabaseCreatorPage() {
    const [csvData, setCsvData] = useState<string[][]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [config, setConfig] = useState<ImportConfig>({
        collectionName: '',
        mappings: [],
        primaryKey: '',
        documentIdStrategy: {
            type: 'column',
            prefix: '',
            suffix: '',
        },
    });
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');
    const [loading, setLoading] = useState(false);
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
    const fileInputRef = useRef<HTMLInputElement>(null);

    // CSVファイルを読み込み
    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const rows = text.split('\n').map(row => {
                // CSVパース（簡易版）
                const result: string[] = [];
                let current = '';
                let inQuotes = false;

                for (let i = 0; i < row.length; i++) {
                    const char = row[i];

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
            }).filter(row => row.some(cell => cell.length > 0));

            if (rows.length > 0) {
                const headerRow = rows[0];
                const dataRows = rows.slice(1);

                setHeaders(headerRow);
                setCsvData(dataRows);

                // 初期マッピングを作成
                const initialMappings: ColumnMapping[] = headerRow.map(header => ({
                    csvColumn: header,
                    firestoreField: header.toLowerCase().replace(/\s+/g, '_'),
                    fieldType: 'string',
                    isDocumentId: false,
                    isSubCollection: false,
                    arrayDelimiter: ',',
                    skipEmpty: true,
                }));

                setConfig({
                    collectionName: 'imported_data',
                    mappings: initialMappings,
                    primaryKey: headerRow[0] || '',
                    documentIdStrategy: {
                        type: 'column',
                        columnName: headerRow[0] || '',
                        prefix: '',
                        suffix: '',
                    },
                });

                setMessage(`${dataRows.length}件のデータを読み込みました`);
                setMessageType('success');
            }
        };

        reader.readAsText(file, 'UTF-8');
    };

    // マッピング更新
    const handleUpdateMapping = (index: number, updates: Partial<ColumnMapping>) => {
        const newMappings = [...config.mappings];
        newMappings[index] = { ...newMappings[index], ...updates };

        // ドキュメントIDとして選択された場合、他のisDocumentIdをfalseに
        if (updates.isDocumentId) {
            newMappings.forEach((mapping, i) => {
                if (i !== index) mapping.isDocumentId = false;
            });
            setConfig({
                ...config,
                mappings: newMappings,
                primaryKey: newMappings[index].csvColumn,
                documentIdStrategy: {
                    ...config.documentIdStrategy,
                    columnName: newMappings[index].csvColumn,
                }
            });
        } else {
            setConfig({ ...config, mappings: newMappings });
        }
    };

    // ドキュメントID生成
    const generateDocumentId = (row: string[], rowIndex: number): string => {
        const strategy = config.documentIdStrategy;
        let baseId = '';

        // ULID generator (simple, compact implementation)
        const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
        const generateULID = (time = Date.now()): string => {
            // time: milliseconds since epoch -> encode to 10 chars (48 bits)
            let t = time;
            let timeChars = '';
            for (let i = 0; i < 10; i++) {
                const mod = t % 32;
                timeChars = ENCODING.charAt(mod) + timeChars;
                t = Math.floor(t / 32);
            }

            // 16 chars of randomness (80 bits)
            let randChars = '';
            for (let i = 0; i < 16; i++) {
                const r = Math.floor(Math.random() * 32);
                randChars += ENCODING.charAt(r);
            }

            return (timeChars + randChars).slice(0, 26);
        };

        switch (strategy.type) {
            case 'ulid':
                baseId = generateULID();
                break;
            case 'uuid':
                // 簡易UUID生成（実際はライブラリ使用推奨）
                baseId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${rowIndex}`;
                break;

            case 'substring':
                if (strategy.columnName) {
                    const columnIndex = headers.indexOf(strategy.columnName);
                    if (columnIndex !== -1) {
                        const value = row[columnIndex] || '';
                        const start = strategy.startIndex || 0;
                        const length = strategy.length;
                        baseId = length ? value.substring(start, start + length) : value.substring(start);
                    }
                }
                break;

            case 'composite':
                if (strategy.compositeColumns && strategy.compositeColumns.length > 0) {
                    const values = strategy.compositeColumns.map(colName => {
                        const idx = headers.indexOf(colName);
                        return idx !== -1 ? (row[idx] || '') : '';
                    });
                    baseId = values.join(strategy.compositeSeparator || '_');
                }
                break;

            case 'auto-increment':
                baseId = (rowIndex + 1).toString().padStart(6, '0');
                break;

            case 'column':
            default:
                if (strategy.columnName) {
                    const columnIndex = headers.indexOf(strategy.columnName);
                    if (columnIndex !== -1) {
                        baseId = row[columnIndex] || '';
                    }
                }
                break;
        }

        // プレフィックス・サフィックスを追加
        const prefix = strategy.prefix || '';
        const suffix = strategy.suffix || '';
        return `${prefix}${baseId}${suffix}`.trim();
    };

    // 値を型変換
    const convertValue = (value: string, fieldType: ColumnMapping['fieldType'], arrayDelimiter?: string): any => {
        if (!value || value.trim() === '') return null;

        switch (fieldType) {
            case 'number':
                const num = Number(value);
                return isNaN(num) ? null : num;
            case 'boolean':
                return value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
            case 'timestamp':
                try {
                    return new Date(value).toISOString();
                } catch {
                    return null;
                }
            case 'array':
                return value.split(arrayDelimiter || ',').map(v => v.trim()).filter(v => v.length > 0);
            case 'map':
                try {
                    return JSON.parse(value);
                } catch {
                    return null;
                }
            case 'string':
            default:
                return value;
        }
    };

    // Firestoreにインポート
    const handleImport = async () => {
        if (!config.collectionName.trim()) {
            setMessage('コレクション名を入力してください');
            setMessageType('error');
            return;
        }

        const needsColumn = ['column', 'substring', 'composite'].includes(config.documentIdStrategy.type);
        if (needsColumn && !config.primaryKey) {
            setMessage('ドキュメントID生成に必要な列を選択してください');
            setMessageType('error');
            return;
        }

        try {
            setLoading(true);
            const db = getFirestoreClient();
            if (!db) throw new Error('Firestoreの初期化に失敗しました');

            // サブコレクションとルートフィールドに分ける
            const rootMappings = config.mappings.filter(m => !m.isSubCollection);
            const subCollectionGroups = config.mappings
                .filter(m => m.isSubCollection && m.subCollectionName)
                .reduce((acc, mapping) => {
                    const name = mapping.subCollectionName!;
                    if (!acc[name]) acc[name] = [];
                    acc[name].push(mapping);
                    return acc;
                }, {} as Record<string, ColumnMapping[]>);

            setImportProgress({ current: 0, total: csvData.length });

            // バッチ処理（500件ずつ）
            const batchSize = 500;
            for (let i = 0; i < csvData.length; i += batchSize) {
                const batch = writeBatch(db);
                const chunk = csvData.slice(i, Math.min(i + batchSize, csvData.length));

                for (let chunkIndex = 0; chunkIndex < chunk.length; chunkIndex++) {
                    const row = chunk[chunkIndex];
                    const rowIndex = i + chunkIndex;

                    // ドキュメントIDを生成
                    const docId = generateDocumentId(row, rowIndex);
                    if (!docId || docId.trim() === '') continue;

                    // ルートドキュメントのデータを構築
                    const docData: Record<string, any> = {
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    };

                    rootMappings.forEach(mapping => {
                        const columnIndex = headers.indexOf(mapping.csvColumn);
                        if (columnIndex === -1) return;

                        const value = convertValue(row[columnIndex], mapping.fieldType, mapping.arrayDelimiter);
                        if (value !== null || !mapping.skipEmpty) {
                            docData[mapping.firestoreField] = value;
                        }
                    });

                    const docRef = doc(db, config.collectionName, docId.trim());
                    batch.set(docRef, docData);

                    // サブコレクションのデータを処理
                    for (const [subColName, subMappings] of Object.entries(subCollectionGroups)) {
                        subMappings.forEach(mapping => {
                            const columnIndex = headers.indexOf(mapping.csvColumn);
                            if (columnIndex === -1) return;

                            const value = convertValue(row[columnIndex], mapping.fieldType, mapping.arrayDelimiter);
                            if (value === null && mapping.skipEmpty) return;

                            // サブコレクションのドキュメントID（フィールド名を使用）
                            const subDocId = mapping.firestoreField;
                            const subDocRef = doc(db, config.collectionName, docId.trim(), subColName, subDocId);

                            batch.set(subDocRef, {
                                value: value,
                                fieldType: mapping.fieldType,
                                sourceColumn: mapping.csvColumn,
                                updatedAt: new Date().toISOString(),
                            });
                        });
                    }

                    setImportProgress({ current: i + chunk.indexOf(row) + 1, total: csvData.length });
                }

                await batch.commit();
            }

            setMessage(`${csvData.length}件のデータをFirestoreにインポートしました`);
            setMessageType('success');
            setImportProgress({ current: 0, total: 0 });
        } catch (error) {
            console.error('Import error:', error);
            setMessage(`インポートエラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
            setMessageType('error');
        } finally {
            setLoading(false);
        }
    };

    // プレビュー表示（最初の5行）
    const previewData = csvData.slice(0, 5);

    return (
        <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '20px' }}>
            <div style={{ marginBottom: '20px' }}>
                <Link href="/" style={{ color: '#007bff', textDecoration: 'underline' }}>
                    ← トップページに戻る
                </Link>
            </div>

            <h1 style={{ fontSize: '2rem', marginBottom: '24px' }}>🗄️ データベースクリエイター</h1>

            {/* メッセージ表示 */}
            {message && (
                <div
                    style={{
                        padding: '12px',
                        marginBottom: '20px',
                        backgroundColor:
                            messageType === 'success'
                                ? '#d4edda'
                                : messageType === 'error'
                                    ? '#f8d7da'
                                    : '#d1ecf1',
                        border: `1px solid ${messageType === 'success'
                            ? '#c3e6cb'
                            : messageType === 'error'
                                ? '#f5c6cb'
                                : '#bee5eb'
                            }`,
                        borderRadius: '6px',
                        color:
                            messageType === 'success'
                                ? '#155724'
                                : messageType === 'error'
                                    ? '#721c24'
                                    : '#0c5460',
                    }}
                >
                    {message}
                </div>
            )}

            {/* CSVアップロード */}
            <div style={{
                padding: '24px',
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #dee2e6',
                marginBottom: '24px',
            }}>
                <h2 style={{ fontSize: '1.3rem', marginBottom: '16px' }}>1. CSVファイルをアップロード</h2>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    style={{
                        padding: '10px',
                        border: '1px solid #ced4da',
                        borderRadius: '6px',
                        fontSize: '14px',
                    }}
                />
                <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '8px' }}>
                    商品名、カテゴリー、数量、バーコードなどが記録されたCSVファイルを選択してください
                </p>
            </div>

            {/* プレビュー */}
            {csvData.length > 0 && (
                <div style={{
                    padding: '24px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    border: '1px solid #dee2e6',
                    marginBottom: '24px',
                }}>
                    <h2 style={{ fontSize: '1.3rem', marginBottom: '16px' }}>2. データプレビュー（最初の5行）</h2>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '14px',
                        }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f8f9fa' }}>
                                    {headers.map((header, i) => (
                                        <th key={i} style={{
                                            padding: '10px',
                                            border: '1px solid #dee2e6',
                                            textAlign: 'left',
                                            fontWeight: '600',
                                        }}>
                                            {header}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {previewData.map((row, i) => (
                                    <tr key={i}>
                                        {row.map((cell, j) => (
                                            <td key={j} style={{
                                                padding: '10px',
                                                border: '1px solid #dee2e6',
                                            }}>
                                                {cell}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '12px' }}>
                        合計: {csvData.length}行
                    </p>
                </div>
            )}

            {/* マッピング設定 */}
            {csvData.length > 0 && (
                <div style={{
                    padding: '24px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    border: '1px solid #dee2e6',
                    marginBottom: '24px',
                }}>
                    <h2 style={{ fontSize: '1.3rem', marginBottom: '16px' }}>3. インポート設定</h2>

                    {/* コレクション名 */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                            コレクション名 *
                        </label>
                        <input
                            type="text"
                            value={config.collectionName}
                            onChange={(e) => setConfig({ ...config, collectionName: e.target.value })}
                            placeholder="例: products, items"
                            style={{
                                width: '100%',
                                maxWidth: '400px',
                                padding: '10px',
                                border: '1px solid #ced4da',
                                borderRadius: '6px',
                                fontSize: '14px',
                            }}
                        />
                    </div>

                    {/* ドキュメントID設計 */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                            ドキュメントID設計
                        </label>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <select
                                value={config.documentIdStrategy.type}
                                onChange={(e) => setConfig({
                                    ...config,
                                    documentIdStrategy: {
                                        ...config.documentIdStrategy,
                                        type: e.target.value as DocumentIdStrategy['type'],
                                    }
                                })}
                                style={{ padding: '8px', border: '1px solid #ced4da', borderRadius: '6px' }}
                            >
                                <option value="column">列の値を使用</option>
                                <option value="uuid">UUID</option>
                                <option value="ulid">ULID</option>
                                <option value="substring">部分抽出</option>
                                <option value="composite">複数列を組み合わせ</option>
                                <option value="auto-increment">連番</option>
                            </select>

                            {/* 列を使うタイプで列選択 */}
                            {['column', 'substring'].includes(config.documentIdStrategy.type) && (
                                <select
                                    value={config.documentIdStrategy.columnName || ''}
                                    onChange={(e) => setConfig({
                                        ...config,
                                        documentIdStrategy: { ...config.documentIdStrategy, columnName: e.target.value },
                                        primaryKey: e.target.value,
                                    })}
                                    style={{ padding: '8px', border: '1px solid #ced4da', borderRadius: '6px' }}
                                >
                                    <option value="">-- 列を選択 --</option>
                                    {headers.map((h, i) => (
                                        <option key={i} value={h}>{h}</option>
                                    ))}
                                </select>
                            )}

                            {/* 部分抽出パラメータ */}
                            {config.documentIdStrategy.type === 'substring' && (
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <input
                                        type="number"
                                        min={0}
                                        value={config.documentIdStrategy.startIndex ?? 0}
                                        onChange={(e) => setConfig({
                                            ...config,
                                            documentIdStrategy: { ...config.documentIdStrategy, startIndex: Number(e.target.value) }
                                        })}
                                        style={{ width: '90px', padding: '6px', border: '1px solid #ced4da', borderRadius: '6px' }}
                                        placeholder="開始位置"
                                    />
                                    <input
                                        type="number"
                                        min={0}
                                        value={config.documentIdStrategy.length ?? ''}
                                        onChange={(e) => setConfig({
                                            ...config,
                                            documentIdStrategy: { ...config.documentIdStrategy, length: e.target.value === '' ? undefined : Number(e.target.value) }
                                        })}
                                        style={{ width: '90px', padding: '6px', border: '1px solid #ced4da', borderRadius: '6px' }}
                                        placeholder="長さ(任意)"
                                    />
                                </div>
                            )}

                            {/* 複数列組み合わせ */}
                            {config.documentIdStrategy.type === 'composite' && (
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <select
                                        multiple
                                        value={config.documentIdStrategy.compositeColumns || []}
                                        onChange={(e) => setConfig({
                                            ...config,
                                            documentIdStrategy: { ...config.documentIdStrategy, compositeColumns: Array.from(e.target.selectedOptions).map(o => o.value) }
                                        })}
                                        style={{ padding: '6px', border: '1px solid #ced4da', borderRadius: '6px', minWidth: '200px' }}
                                    >
                                        {headers.map((h, i) => (
                                            <option key={i} value={h}>{h}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="text"
                                        value={config.documentIdStrategy.compositeSeparator || '_'}
                                        onChange={(e) => setConfig({
                                            ...config,
                                            documentIdStrategy: { ...config.documentIdStrategy, compositeSeparator: e.target.value }
                                        })}
                                        style={{ width: '90px', padding: '6px', border: '1px solid #ced4da', borderRadius: '6px' }}
                                    />
                                </div>
                            )}

                            {/* プレフィックス・サフィックス */}
                            <input
                                type="text"
                                value={config.documentIdStrategy.prefix || ''}
                                onChange={(e) => setConfig({ ...config, documentIdStrategy: { ...config.documentIdStrategy, prefix: e.target.value } })}
                                placeholder="プレフィックス (任意)"
                                style={{ padding: '8px', border: '1px solid #ced4da', borderRadius: '6px' }}
                            />
                            <input
                                type="text"
                                value={config.documentIdStrategy.suffix || ''}
                                onChange={(e) => setConfig({ ...config, documentIdStrategy: { ...config.documentIdStrategy, suffix: e.target.value } })}
                                placeholder="サフィックス (任意)"
                                style={{ padding: '8px', border: '1px solid #ced4da', borderRadius: '6px' }}
                            />
                        </div>

                        {/* プレビュー */}
                        <div style={{ marginTop: '10px', fontSize: '0.9rem', color: '#333' }}>
                            例のドキュメントID: <strong>{generateDocumentId(csvData[0] || headers.map(() => ''), 0) || '（空）'}</strong>
                        </div>
                    </div>

                    {/* 列マッピング */}
                    <div>
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', fontWeight: '600' }}>
                            列マッピング
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: '14px',
                            }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f8f9fa' }}>
                                        <th style={{ padding: '10px', border: '1px solid #dee2e6', textAlign: 'left' }}>CSV列名</th>
                                        <th style={{ padding: '10px', border: '1px solid #dee2e6', textAlign: 'left' }}>Firestoreフィールド名</th>
                                        <th style={{ padding: '10px', border: '1px solid #dee2e6', textAlign: 'left' }}>データ型</th>
                                        <th style={{ padding: '10px', border: '1px solid #dee2e6', textAlign: 'center' }}>サブコレクション</th>
                                        <th style={{ padding: '10px', border: '1px solid #dee2e6', textAlign: 'left' }}>サブコレクション名</th>
                                        <th style={{ padding: '10px', border: '1px solid #dee2e6', textAlign: 'center' }}>空をスキップ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {config.mappings.map((mapping, index) => (
                                        <tr key={index}>
                                            <td style={{ padding: '10px', border: '1px solid #dee2e6' }}>
                                                {mapping.csvColumn}
                                            </td>
                                            <td style={{ padding: '10px', border: '1px solid #dee2e6' }}>
                                                <input
                                                    type="text"
                                                    value={mapping.firestoreField}
                                                    onChange={(e) => handleUpdateMapping(index, { firestoreField: e.target.value })}
                                                    style={{
                                                        width: '100%',
                                                        padding: '6px',
                                                        border: '1px solid #ced4da',
                                                        borderRadius: '4px',
                                                        fontSize: '13px',
                                                    }}
                                                />
                                            </td>
                                            <td style={{ padding: '10px', border: '1px solid #dee2e6' }}>
                                                <select
                                                    value={mapping.fieldType}
                                                    onChange={(e) => handleUpdateMapping(index, { fieldType: e.target.value as any })}
                                                    style={{
                                                        width: '100%',
                                                        padding: '6px',
                                                        border: '1px solid #ced4da',
                                                        borderRadius: '4px',
                                                        fontSize: '13px',
                                                    }}
                                                >
                                                    <option value="string">文字列</option>
                                                    <option value="number">数値</option>
                                                    <option value="boolean">真偽値</option>
                                                    <option value="timestamp">日時</option>
                                                    <option value="array">配列</option>
                                                    <option value="map">オブジェクト</option>
                                                </select>
                                            </td>
                                            <td style={{ padding: '10px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={mapping.isSubCollection}
                                                    onChange={(e) => handleUpdateMapping(index, { isSubCollection: e.target.checked })}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                            </td>
                                            <td style={{ padding: '10px', border: '1px solid #dee2e6' }}>
                                                <input
                                                    type="text"
                                                    value={mapping.subCollectionName || ''}
                                                    onChange={(e) => handleUpdateMapping(index, { subCollectionName: e.target.value })}
                                                    disabled={!mapping.isSubCollection}
                                                    placeholder="例: details, specs"
                                                    style={{
                                                        width: '100%',
                                                        padding: '6px',
                                                        border: '1px solid #ced4da',
                                                        borderRadius: '4px',
                                                        fontSize: '13px',
                                                        backgroundColor: mapping.isSubCollection ? 'white' : '#e9ecef',
                                                    }}
                                                />
                                            </td>
                                            <td style={{ padding: '10px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={mapping.skipEmpty}
                                                    onChange={(e) => handleUpdateMapping(index, { skipEmpty: e.target.checked })}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* インポート実行 */}
            {csvData.length > 0 && (
                <div style={{
                    padding: '24px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    border: '1px solid #dee2e6',
                }}>
                    <h2 style={{ fontSize: '1.3rem', marginBottom: '16px' }}>4. インポート実行</h2>

                    {importProgress.total > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{
                                width: '100%',
                                height: '24px',
                                backgroundColor: '#e9ecef',
                                borderRadius: '12px',
                                overflow: 'hidden',
                            }}>
                                <div style={{
                                    width: `${(importProgress.current / importProgress.total) * 100}%`,
                                    height: '100%',
                                    backgroundColor: '#28a745',
                                    transition: 'width 0.3s',
                                }}></div>
                            </div>
                            <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '8px', textAlign: 'center' }}>
                                {importProgress.current} / {importProgress.total} 件処理中...
                            </p>
                        </div>
                    )}

                    <button
                        onClick={handleImport}
                        disabled={loading || !config.collectionName.trim() || !config.primaryKey}
                        style={{
                            width: '100%',
                            padding: '14px',
                            backgroundColor: loading ? '#6c757d' : '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontSize: '16px',
                            fontWeight: '600',
                        }}
                    >
                        {loading ? 'インポート中...' : 'Firestoreにインポート'}
                    </button>
                </div>
            )}

            {/* 使い方 */}
            <div style={{
                marginTop: '24px',
                padding: '24px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #dee2e6',
            }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '12px', fontWeight: '600' }}>
                    📝 使い方
                </h3>
                <ol style={{ marginLeft: '20px', lineHeight: 1.8 }}>
                    <li>CSVファイルをアップロード（UTF-8エンコーディング推奨）</li>
                    <li>データプレビューで内容を確認</li>
                    <li>コレクション名を設定</li>
                    <li>ドキュメントID設計を設定:
                        <ul style={{ marginTop: '8px', marginLeft: '20px' }}>
                            <li><strong>列の値をそのまま使用</strong>: バーコードや商品IDなど一意な列をそのまま使用</li>
                            <li><strong>UUID</strong>: 自動的にユニークなIDを生成</li>
                            <li><strong>部分抽出</strong>: バーコードの最初の8文字など、列の一部を使用</li>
                            <li><strong>複数列を組み合わせ</strong>: カテゴリー_商品名など複数の列を結合</li>
                            <li><strong>連番</strong>: 000001, 000002のように自動採番</li>
                        </ul>
                    </li>
                    <li>各CSV列のマッピングを設定:
                        <ul style={{ marginTop: '8px', marginLeft: '20px' }}>
                            <li><strong>Firestoreフィールド名</strong>: Firestore内で使用するフィールド名</li>
                            <li><strong>データ型</strong>: 保存時のデータ型</li>
                            <li><strong>サブコレクション</strong>: この列をサブコレクションに配置</li>
                            <li><strong>サブコレクション名</strong>: サブコレクションの名前</li>
                            <li><strong>空をスキップ</strong>: 空の値を保存しない</li>
                        </ul>
                    </li>
                    <li>「Firestoreにインポート」ボタンをクリック</li>
                </ol>

                <h3 style={{ fontSize: '1rem', marginTop: '20px', marginBottom: '12px', fontWeight: '600' }}>
                    💡 ドキュメントID設計例
                </h3>
                <ul style={{ marginLeft: '20px', lineHeight: 1.8 }}>
                    <li><strong>バーコードをそのまま使用</strong>: バーコード列を選択 → 例: 4901234567890</li>
                    <li><strong>バーコードの一部</strong>: バーコード列 + 開始0、文字数8 → 例: 49012345</li>
                    <li><strong>カテゴリー+商品名</strong>: 複数列組み合わせ、区切り文字「_」 → 例: トレカ_ポケモンカード</li>
                    <li><strong>プレフィックス付き連番</strong>: 連番 + プレフィックス「PROD_」 → 例: PROD_000001</li>
                    <li><strong>完全自動</strong>: UUID → 例: 1699999999999-abc123def-0</li>
                </ul>

                <h3 style={{ fontSize: '1rem', marginTop: '20px', marginBottom: '12px', fontWeight: '600' }}>
                    💡 データ配置例
                </h3>
                <ul style={{ marginLeft: '20px', lineHeight: 1.8 }}>
                    <li><strong>商品データ</strong>: 商品名、カテゴリー、価格をルートドキュメントに、詳細情報をサブコレクションに配置</li>
                    <li><strong>在庫データ</strong>: バーコードをドキュメントIDに、数量や場所をフィールドとして保存</li>
                    <li><strong>階層データ</strong>: 商品ごとに「仕様」や「レビュー」をサブコレクションとして整理</li>
                </ul>

                <h3 style={{ fontSize: '1rem', marginTop: '20px', marginBottom: '12px', fontWeight: '600' }}>
                    ⚠️ 注意事項
                </h3>
                <ul style={{ marginLeft: '20px', lineHeight: 1.8 }}>
                    <li>大量データのインポートには時間がかかる場合があります</li>
                    <li>ドキュメントIDは一意である必要があります（重複すると上書きされます）</li>
                    <li>配列型の場合、カンマ区切りで自動的に分割されます</li>
                    <li>サブコレクションに配置した列は、各ドキュメント配下に個別のサブコレクションとして作成されます</li>
                </ul>
            </div>
        </div>
    );
}
