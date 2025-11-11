'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

type ExportOptions = {
    collectionName: string;
    includeSubcollections: boolean;
    prettyPrint: boolean;
    exportLimit?: number | null; // 0/空なら全件
    selectedIdsText?: string; // 改行/カンマ/空白区切り
};

type ExportState = 'idle' | 'counting' | 'confirming' | 'exporting' | 'completed' | 'cancelled' | 'previewing';

export default function FirestoreExportPage() {
    const [collections, setCollections] = useState<string[]>([]);
    const [options, setOptions] = useState<ExportOptions>({
        collectionName: '',
        includeSubcollections: true,
        prettyPrint: true,
        exportLimit: null,
        selectedIdsText: '',
    });
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState<'success' | 'error' | 'info' | 'warning'>('info');
    const [state, setState] = useState<ExportState>('idle');
    const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
    const [documentCount, setDocumentCount] = useState<number>(0);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const cancelRef = useRef<boolean>(false);
    const LARGE_DATASET_THRESHOLD = 1000; // 1000件以上で警告

    // コレクション一覧を取得
    useEffect(() => {
        const fetchCollections = async () => {
            try {
                const response = await fetch('/api/firestore-export?action=collections');
                if (response.ok) {
                    const data = await response.json();
                    setCollections(data.collections);
                }
            } catch (error) {
                console.error('Failed to fetch collections:', error);
            }
        };
        fetchCollections();
    }, []);

    // プレビューデータを取得
    useEffect(() => {
        const fetchPreview = async () => {
            if (!options.collectionName.trim()) {
                setPreviewData([]);
                setDocumentCount(0);
                return;
            }

            try {
                setState('previewing');
                setPreviewData([]);
                setDocumentCount(0);

                // プレビューとカウントを並行取得
                const [previewRes, countRes] = await Promise.all([
                    fetch(`/api/firestore-export?action=preview&collection=${encodeURIComponent(options.collectionName)}`),
                    fetch(`/api/firestore-export?action=count&collection=${encodeURIComponent(options.collectionName)}`),
                ]);

                if (previewRes.ok) {
                    const previewData = await previewRes.json();
                    setPreviewData(previewData.preview || []);
                }

                if (countRes.ok) {
                    const countData = await countRes.json();
                    setDocumentCount(countData.count);
                }

                setState('idle');
            } catch (error) {
                console.error('Preview error:', error);
                setState('idle');
            }
        };

        fetchPreview();
    }, [options.collectionName]);

    // 入力欄のIDsを配列化（重複排除）
    const parseSelectedIds = (): string[] => {
        const raw = options.selectedIdsText ?? '';
        if (!raw.trim()) return [];
        const ids = raw
            .split(/[\n,\s]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        // ユニーク化
        return Array.from(new Set(ids));
    };

    // JSONエクスポート開始
    const handleExportJSON = async () => {
        if (!options.collectionName.trim()) {
            setMessage('コレクション名を選択してください');
            setMessageType('error');
            return;
        }

        const selectedIds = parseSelectedIds();
        const targetCount = selectedIds.length > 0 
            ? selectedIds.length 
            : ((options.exportLimit ?? 0) > 0 ? Math.min(options.exportLimit as number, documentCount) : documentCount);

        if (targetCount >= LARGE_DATASET_THRESHOLD) {
            setState('confirming');
            setMessage(`⚠️ ${targetCount}件のドキュメントをJSONエクスポートします。続行しますか？`);
            setMessageType('warning');
        } else {
            await handleExportToJSON(targetCount, selectedIds);
        }
    };

    // CSVエクスポート開始
    const handleExportCSV = async () => {
        if (!options.collectionName.trim()) {
            setMessage('コレクション名を選択してください');
            setMessageType('error');
            return;
        }

        const selectedIds = parseSelectedIds();
        const targetCount = selectedIds.length > 0 
            ? selectedIds.length 
            : ((options.exportLimit ?? 0) > 0 ? Math.min(options.exportLimit as number, documentCount) : documentCount);

        if (targetCount >= LARGE_DATASET_THRESHOLD) {
            setState('confirming');
            setMessage(`⚠️ ${targetCount}件のドキュメントをCSVエクスポートします。続行しますか？`);
            setMessageType('warning');
        } else {
            await handleExportToCSV(targetCount, selectedIds);
        }
    };

    // JSONエクスポート実行
    const handleExportToJSON = async (totalCount?: number, selectedIdsParam?: string[]) => {
        try {
            setState('exporting');
            cancelRef.current = false;

            const selectedIds = Array.isArray(selectedIdsParam) ? selectedIdsParam : parseSelectedIds();
            const usingSelected = selectedIds.length > 0;

            const targetCountBase = usingSelected ? selectedIds.length : (totalCount ?? documentCount);
            const desiredLimit = usingSelected ? 0 : ((options.exportLimit ?? 0) > 0 ? (options.exportLimit as number) : 0);
            const targetCount = desiredLimit > 0 ? Math.min(desiredLimit, targetCountBase) : targetCountBase;
            setExportProgress({ current: 0, total: targetCount });

            const allDocuments: Record<string, any> = {};
            const batchSize = usingSelected ? 100 : 500;
            let offset = 0; // for paging mode

            if (usingSelected) {
                // 選択IDモード: ID配列をバッチ処理
                let processed = 0;
                const limitedIds = selectedIds.slice(0, targetCount);
                for (let i = 0; i < limitedIds.length; i += batchSize) {
                    if (cancelRef.current) {
                        setState('cancelled');
                        setMessage('エクスポートがキャンセルされました');
                        setMessageType('info');
                        setExportProgress({ current: 0, total: 0 });
                        return;
                    }

                    const batchIds = limitedIds.slice(i, i + batchSize);
                    const response = await fetch('/api/firestore-export', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            collectionName: options.collectionName,
                            includeSubcollections: options.includeSubcollections,
                            ids: batchIds,
                        }),
                    });

                    if (!response.ok) {
                        throw new Error('エクスポートに失敗しました');
                    }

                    const data = await response.json();
                    Object.assign(allDocuments, data.documents);
                    processed += batchIds.length;
                    setExportProgress({ current: Math.min(processed, targetCount), total: targetCount });
                }
            } else {
                while (offset < targetCount) {
                    // キャンセルチェック
                    if (cancelRef.current) {
                        setState('cancelled');
                        setMessage('エクスポートがキャンセルされました');
                        setMessageType('info');
                        setExportProgress({ current: 0, total: 0 });
                        return;
                    }

                    const response = await fetch('/api/firestore-export', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            collectionName: options.collectionName,
                            includeSubcollections: options.includeSubcollections,
                            offset,
                            limit: Math.min(batchSize, Math.max(1, targetCount - offset)),
                        }),
                    });

                    if (!response.ok) {
                        throw new Error('エクスポートに失敗しました');
                    }

                    const data = await response.json();
                    Object.assign(allDocuments, data.documents);

                    offset += data.count;
                    setExportProgress({ current: Math.min(offset, targetCount), total: targetCount });

                    if (!data.hasMore) break;
                    if (offset >= targetCount) break;
                }
            }

            const exportData = {
                _metadata: {
                    collection: options.collectionName,
                    exportedAt: new Date().toISOString(),
                    documentCount: Object.keys(allDocuments).length,
                    includesSubcollections: options.includeSubcollections,
                },
                documents: allDocuments,
            };

            // 自動ダウンロード（常に整形して出力）
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `firestore_${options.collectionName}_${new Date().getTime()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setMessage(`${Object.keys(allDocuments).length}件のドキュメントをJSONでエクスポートしました`);
            setMessageType('success');
            setState('completed');
            setExportProgress({ current: 0, total: 0 });
        } catch (error) {
            console.error('Export error:', error);
            setMessage(`エクスポートエラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
            setMessageType('error');
            setState('idle');
        }
    };

    // CSVエクスポート実行
    const handleExportToCSV = async (totalCount?: number, selectedIdsParam?: string[]) => {
        try {
            setState('exporting');
            cancelRef.current = false;

            const selectedIds = Array.isArray(selectedIdsParam) ? selectedIdsParam : parseSelectedIds();
            const usingSelected = selectedIds.length > 0;

            const targetCountBase = usingSelected ? selectedIds.length : (totalCount ?? documentCount);
            const desiredLimit = usingSelected ? 0 : ((options.exportLimit ?? 0) > 0 ? (options.exportLimit as number) : 0);
            const targetCount = desiredLimit > 0 ? Math.min(desiredLimit, targetCountBase) : targetCountBase;
            setExportProgress({ current: 0, total: targetCount });

            const allDocuments: Record<string, any> = {};
            const batchSize = usingSelected ? 100 : 500;
            let offset = 0;

            if (usingSelected) {
                let processed = 0;
                const limitedIds = selectedIds.slice(0, targetCount);
                for (let i = 0; i < limitedIds.length; i += batchSize) {
                    if (cancelRef.current) {
                        setState('cancelled');
                        setMessage('エクスポートがキャンセルされました');
                        setMessageType('info');
                        setExportProgress({ current: 0, total: 0 });
                        return;
                    }

                    const batchIds = limitedIds.slice(i, i + batchSize);
                    const response = await fetch('/api/firestore-export', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            collectionName: options.collectionName,
                            includeSubcollections: options.includeSubcollections,
                            ids: batchIds,
                        }),
                    });

                    if (!response.ok) {
                        throw new Error('エクスポートに失敗しました');
                    }

                    const data = await response.json();
                    Object.assign(allDocuments, data.documents);
                    processed += batchIds.length;
                    setExportProgress({ current: Math.min(processed, targetCount), total: targetCount });
                }
            } else {
                while (offset < targetCount) {
                    if (cancelRef.current) {
                        setState('cancelled');
                        setMessage('エクスポートがキャンセルされました');
                        setMessageType('info');
                        setExportProgress({ current: 0, total: 0 });
                        return;
                    }

                    const response = await fetch('/api/firestore-export', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            collectionName: options.collectionName,
                            includeSubcollections: options.includeSubcollections,
                            offset,
                            limit: Math.min(batchSize, Math.max(1, targetCount - offset)),
                        }),
                    });

                    if (!response.ok) {
                        throw new Error('エクスポートに失敗しました');
                    }

                    const data = await response.json();
                    Object.assign(allDocuments, data.documents);

                    offset += data.count;
                    setExportProgress({ current: Math.min(offset, targetCount), total: targetCount });

                    if (!data.hasMore) break;
                    if (offset >= targetCount) break;
                }
            }

            // CSV変換
            const documents = Object.values(allDocuments);
            if (documents.length === 0) {
                throw new Error('エクスポートするドキュメントがありません');
            }

            // すべてのキーを収集
            const allKeys = new Set<string>();
            documents.forEach(doc => {
                Object.keys(doc).forEach(key => allKeys.add(key));
            });
            const headers = Array.from(allKeys);

            // CSVヘッダー
            let csvContent = headers.map(h => `"${h}"`).join(',') + '\n';

            // CSVボディ
            documents.forEach(doc => {
                const row = headers.map(header => {
                    const value = doc[header];
                    if (value === null || value === undefined) return '';
                    if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
                    return `"${String(value).replace(/"/g, '""')}"`;
                });
                csvContent += row.join(',') + '\n';
            });

            // 自動ダウンロード
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `firestore_${options.collectionName}_${new Date().getTime()}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setMessage(`${documents.length}件のドキュメントをCSVでエクスポートしました`);
            setMessageType('success');
            setState('completed');
            setExportProgress({ current: 0, total: 0 });
        } catch (error) {
            console.error('Export error:', error);
            setMessage(`エクスポートエラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
            setMessageType('error');
            setState('idle');
        }
    };

    // エクスポートをキャンセル
    const handleCancel = () => {
        cancelRef.current = true;
        setMessage('キャンセル中...');
        setMessageType('info');
    };

    // 確認後にエクスポート続行（JSONまたはCSV）
    const handleConfirmExport = () => {
        const ids = parseSelectedIds();
        // messageに「JSON」が含まれていればJSON、「CSV」が含まれていればCSV
        if (message.includes('JSON')) {
            if (ids.length > 0) {
                handleExportToJSON(ids.length, ids);
            } else {
                handleExportToJSON();
            }
        } else if (message.includes('CSV')) {
            if (ids.length > 0) {
                handleExportToCSV(ids.length, ids);
            } else {
                handleExportToCSV();
            }
        }
    };

    // 確認キャンセル
    const handleCancelConfirm = () => {
        setState('idle');
        setMessage('エクスポートをキャンセルしました');
        setMessageType('info');
    };

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
            <div style={{ marginBottom: '20px' }}>
                <Link href="/" style={{ color: '#007bff', textDecoration: 'underline' }}>
                    ← トップページに戻る
                </Link>
            </div>

            <h1 style={{ fontSize: '2rem', marginBottom: '24px' }}>📤 Firestore エクスポート</h1>

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
                                    : messageType === 'warning'
                                        ? '#fff3cd'
                                        : '#d1ecf1',
                        border: `1px solid ${messageType === 'success'
                            ? '#c3e6cb'
                            : messageType === 'error'
                                ? '#f5c6cb'
                                : messageType === 'warning'
                                    ? '#ffeaa7'
                                    : '#bee5eb'
                            }`,
                        borderRadius: '6px',
                        color:
                            messageType === 'success'
                                ? '#155724'
                                : messageType === 'error'
                                    ? '#721c24'
                                    : messageType === 'warning'
                                        ? '#856404'
                                        : '#0c5460',
                    }}
                >
                    {message}
                </div>
            )}

            {/* エクスポート設定 */}
            <div style={{
                padding: '24px',
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #dee2e6',
                marginBottom: '24px',
            }}>
                <h2 style={{ fontSize: '1.3rem', marginBottom: '16px' }}>エクスポート設定</h2>

                {/* コレクション名（入力欄 + プルダウン併用） */}
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                        コレクション名 *
                    </label>
                    <div style={{ position: 'relative', maxWidth: '400px' }}>
                        <input
                            type="text"
                            value={options.collectionName}
                            onChange={(e) => setOptions({ ...options, collectionName: e.target.value })}
                            placeholder="その他（直接入力）"
                            list="collection-list"
                            style={{
                                width: '100%',
                                padding: '10px',
                                paddingRight: '40px',
                                border: '1px solid #ced4da',
                                borderRadius: '6px',
                                fontSize: '14px',
                            }}
                        />
                        <datalist id="collection-list">
                            {collections.map((col) => (
                                <option key={col} value={col} />
                            ))}
                        </datalist>
                        {options.collectionName && (
                            <button
                                onClick={() => setOptions({ ...options, collectionName: '' })}
                                style={{
                                    position: 'absolute',
                                    right: '8px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '18px',
                                    color: '#6c757d',
                                    padding: '0 4px',
                                }}
                                title="クリア"
                            >
                                ×
                            </button>
                        )}
                    </div>
                    {collections.length > 0 && (
                        <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#6b7280' }}>
                            💡 プルダウンから選択するか直接入力してください（{collections.length}件のコレクション）
                        </div>
                    )}
                    {documentCount > 0 && (
                        <div style={{ marginTop: '8px', fontSize: '0.9rem', color: '#6b7280' }}>
                            📊 {documentCount.toLocaleString()}件のドキュメント
                        </div>
                    )}
                </div>

                {/* プレビュー（3件） */}
                {previewData.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                        <h3 style={{ fontSize: '1rem', marginBottom: '12px', fontWeight: '600' }}>
                            🔍 データプレビュー（最初の3件）
                        </h3>
                        <div style={{
                            maxHeight: '300px',
                            overflow: 'auto',
                            backgroundColor: '#f8f9fa',
                            border: '1px solid #dee2e6',
                            borderRadius: '6px',
                            padding: '12px',
                        }}>
                            {previewData.map((doc, idx) => (
                                <details key={idx} style={{ marginBottom: '8px' }}>
                                    <summary style={{ cursor: 'pointer', fontWeight: '600', padding: '4px' }}>
                                        📄 {doc._id}
                                    </summary>
                                    <pre style={{
                                        marginTop: '8px',
                                        padding: '8px',
                                        backgroundColor: 'white',
                                        border: '1px solid #dee2e6',
                                        borderRadius: '4px',
                                        fontSize: '12px',
                                        overflow: 'auto',
                                    }}>
                                        {JSON.stringify(doc, null, 2)}
                                    </pre>
                                </details>
                            ))}
                        </div>
                    </div>
                )}


                {/* オプション */}
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={options.includeSubcollections}
                            onChange={(e) => setOptions({ ...options, includeSubcollections: e.target.checked })}
                            style={{ marginRight: '8px', cursor: 'pointer' }}
                        />
                        <span style={{ fontWeight: '500' }}>サブコレクションを含める（Admin SDK使用）</span>
                    </label>

                    {/* 出力件数の上限（任意）*/}
                    <div style={{ marginTop: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>出力件数（任意）</label>
                        <input
                            type="number"
                            min={1}
                            placeholder="空欄または0で全件"
                            value={options.exportLimit ?? ''}
                            onChange={(e) => {
                                const v = e.target.value;
                                const n = Number(v);
                                setOptions({ ...options, exportLimit: v === '' ? null : (Number.isFinite(n) ? n : null) });
                            }}
                            style={{
                                width: '100%',
                                maxWidth: '240px',
                                padding: '10px',
                                border: '1px solid #ced4da',
                                borderRadius: '6px',
                                fontSize: '14px',
                                appearance: 'textfield',
                            }}
                        />
                        <div style={{ marginTop: '6px', color: '#6b7280', fontSize: '12px' }}>
                            空欄または0のままにすると全件を出力します。
                        </div>
                    </div>

                    {/* ドキュメントID 指定（任意）*/}
                    <div style={{ marginTop: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>ドキュメントID（任意・改行/カンマ/空白で区切り）</label>
                        <textarea
                            placeholder={`例:\nabc123\nxyz789`}
                            value={options.selectedIdsText}
                            onChange={(e) => setOptions({ ...options, selectedIdsText: e.target.value })}
                            rows={4}
                            style={{
                                width: '100%',
                                maxWidth: '600px',
                                padding: '10px',
                                border: '1px solid #ced4da',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                            }}
                        />
                        <div style={{ marginTop: '6px', color: '#6b7280', fontSize: '12px' }}>
                            ここにIDを入力すると、そのIDのドキュメントのみをエクスポートします（件数上限は無視されます）。
                        </div>
                    </div>
                </div>

                {/* エクスポート実行 */}
                <div>
                    {state === 'confirming' && (
                        <div style={{
                            padding: '16px',
                            backgroundColor: '#fff3cd',
                            border: '1px solid #ffeaa7',
                            borderRadius: '6px',
                            marginBottom: '16px',
                        }}>
                            <p style={{ marginBottom: '12px', fontWeight: '600', color: '#856404' }}>
                                ⚠️ 大量のデータが検出されました
                            </p>
                            <p style={{ marginBottom: '16px', color: '#856404' }}>
                                {documentCount}件のドキュメントをエクスポートします。
                                {options.includeSubcollections && ' サブコレクションも含まれるため、さらに時間がかかる可能性があります。'}
                            </p>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button
                                    onClick={handleConfirmExport}
                                    style={{
                                        flex: 1,
                                        padding: '12px',
                                        backgroundColor: '#ffc107',
                                        color: '#000',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                    }}
                                >
                                    続行する
                                </button>
                                <button
                                    onClick={handleCancelConfirm}
                                    style={{
                                        flex: 1,
                                        padding: '12px',
                                        backgroundColor: '#6c757d',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                    }}
                                >
                                    キャンセル
                                </button>
                            </div>
                        </div>
                    )}

                    {exportProgress.total > 0 && state === 'exporting' && (
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{
                                width: '100%',
                                height: '24px',
                                backgroundColor: '#e9ecef',
                                borderRadius: '12px',
                                overflow: 'hidden',
                            }}>
                                <div style={{
                                    width: `${(exportProgress.current / exportProgress.total) * 100}%`,
                                    height: '100%',
                                    backgroundColor: '#007bff',
                                    transition: 'width 0.3s',
                                }}></div>
                            </div>
                            <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '8px', textAlign: 'center' }}>
                                {exportProgress.current} / {exportProgress.total} 件処理中...
                            </p>
                            <button
                                onClick={handleCancel}
                                style={{
                                    width: '100%',
                                    marginTop: '12px',
                                    padding: '10px',
                                    backgroundColor: '#dc3545',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: '600',
                                }}
                            >
                                キャンセル
                            </button>
                        </div>
                    )}

                    {(state === 'idle' || state === 'completed' || state === 'cancelled' || state === 'previewing') && (
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={handleExportJSON}
                                disabled={!options.collectionName.trim() || state === 'previewing'}
                                style={{
                                    flex: 1,
                                    padding: '14px',
                                    backgroundColor: !options.collectionName.trim() || state === 'previewing' ? '#6c757d' : '#28a745',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: !options.collectionName.trim() || state === 'previewing' ? 'not-allowed' : 'pointer',
                                    fontSize: '16px',
                                    fontWeight: '600',
                                }}
                            >
                                📥 JSONでエクスポート
                            </button>
                            <button
                                onClick={handleExportCSV}
                                disabled={!options.collectionName.trim() || state === 'previewing'}
                                style={{
                                    flex: 1,
                                    padding: '14px',
                                    backgroundColor: !options.collectionName.trim() || state === 'previewing' ? '#6c757d' : '#17a2b8',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: !options.collectionName.trim() || state === 'previewing' ? 'not-allowed' : 'pointer',
                                    fontSize: '16px',
                                    fontWeight: '600',
                                }}
                            >
                                📊 CSVでエクスポート
                            </button>
                        </div>
                    )}

                    {state === 'counting' && (
                        <button
                            disabled
                            style={{
                                width: '100%',
                                padding: '14px',
                                backgroundColor: '#6c757d',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'not-allowed',
                                fontSize: '16px',
                                fontWeight: '600',
                            }}
                        >
                            ドキュメント数を確認中...
                        </button>
                    )}
                </div>
            </div>

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
                    <li>エクスポートしたいコレクション名をプルダウンから選択（またはその他で直接入力）</li>
                    <li>データプレビューで最初の3件を確認</li>
                    <li>オプションを選択（サブコレクション含む、件数制限など）</li>
                    <li>「JSONでエクスポート」または「CSVでエクスポート」ボタンをクリック</li>
                    <li>ファイルが自動的にダウンロードされます（JSONは常に整形済み）</li>
                </ol>

                <h3 style={{ fontSize: '1rem', marginTop: '20px', marginBottom: '12px', fontWeight: '600' }}>
                    💡 エクスポート形式
                </h3>
                <ul style={{ marginLeft: '20px', lineHeight: 1.8 }}>
                    <li><strong>JSON形式</strong>: メタデータ付き、階層構造を保持、サブコレクション対応（常に整形済み）</li>
                    <li><strong>CSV形式</strong>: 表計算ソフトで開ける、フラットな構造、オブジェクトはJSON文字列化</li>
                    <li>各ドキュメントには<strong>_id</strong>と<strong>_path</strong>が含まれます</li>
                    <li>サブコレクションは<strong>_subcollections</strong>に格納されます（JSONのみ）</li>
                </ul>

                <h3 style={{ fontSize: '1rem', marginTop: '20px', marginBottom: '12px', fontWeight: '600' }}>
                    ⚠️ 注意事項
                </h3>
                <ul style={{ marginLeft: '20px', lineHeight: 1.8 }}>
                    <li>1000件以上のドキュメントがある場合、確認ダイアログが表示されます</li>
                    <li>エクスポート中はキャンセルボタンでいつでも中断できます</li>
                    <li>大量のドキュメントがある場合、エクスポートに時間がかかります</li>
                    <li>Firestoreの読み取り課金が発生します</li>
                    <li>ブラウザのメモリ制限により、非常に大きなコレクションは失敗する可能性があります</li>
                    <li>サブコレクションのエクスポートにはFirebase Admin SDKを使用しています（完全対応）</li>
                </ul>
            </div>
        </div>
    );
}
