'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type CsvRow = Record<string, string>;

type GenericRow = {
    ulid: string;
    values: CsvRow;
    selected: boolean;
};

type FirestoreDoc = {
    id?: string;
    data: Record<string, unknown>;
};

const PAGE_SIZES = [25, 50, 100, 250];

const styles = {
    page: {
        minHeight: '100vh',
        backgroundColor: '#f4f6fb',
        padding: '32px 20px',
    } as const,
    container: {
        maxWidth: '1800px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
    } as const,
    card: {
        backgroundColor: '#ffffff',
        borderRadius: '14px',
        padding: '24px',
        boxShadow: '0 8px 20px rgba(15,23,42,0.08)',
        border: '1px solid rgba(148,163,184,0.3)',
    } as const,
    input: {
        width: '100%',
        padding: '8px 10px',
        borderRadius: '8px',
        border: '1px solid rgba(148,163,184,0.6)',
        fontSize: '0.9rem',
    } as const,
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.85rem',
        minWidth: '2400px',
    } as const,
    th: {
        textAlign: 'left' as const,
        padding: '10px',
        borderBottom: '1px solid rgba(148,163,184,0.4)',
        backgroundColor: '#eef2ff',
        position: 'sticky' as const,
        top: 0,
        zIndex: 1,
        minWidth: '120px',
        whiteSpace: 'nowrap' as const,
    },
    td: {
        padding: '8px',
        borderBottom: '1px solid rgba(226,232,240,0.8)',
        verticalAlign: 'top' as const,
        minWidth: '120px',
    },
    badge: {
        backgroundColor: '#ecfeff',
        color: '#0c4a6e',
        padding: '4px 10px',
        borderRadius: '9999px',
        fontSize: '0.8rem',
        fontWeight: 600,
    } as const,
};

const CROCKFORD32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function ensure(value?: string): string {
    return (value ?? '').trim();
}

// product-specific helpers removed for generic uploader

function generateUlid(time = Date.now()): string {
    const chars = Array<string>(10);
    let value = Math.floor(time);
    for (let index = 9; index >= 0; index -= 1) {
        chars[index] = CROCKFORD32[value % 32];
        value = Math.floor(value / 32);
    }
    const head = chars.join('');
    const random = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(random);
    } else {
        for (let i = 0; i < random.length; i += 1) {
            random[i] = Math.floor(Math.random() * 256);
        }
    }
    let tail = '';
    for (let i = 0; i < random.length; i += 1) {
        tail += CROCKFORD32[random[i] % 32];
    }
    return head + tail;
}

export default function ProductsImportPage() {
    const [rows, setRows] = useState<GenericRow[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [onlySelected, setOnlySelected] = useState(false);
    const [pageSize, setPageSize] = useState(50);
    const [currentPage, setCurrentPage] = useState(1);
    const [payloadJson, setPayloadJson] = useState('');
    const [status, setStatus] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadWritten, setUploadWritten] = useState(0);
    const [uploadTotal, setUploadTotal] = useState(0);
    const [uploadFailed, setUploadFailed] = useState(0);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [collectionName, setCollectionName] = useState('products');
    const [idColumn, setIdColumn] = useState<string>('__auto_ulid__');

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setSelectedFile(file);
        setLoading(true);
        setError(null);

        try {
            const text = await file.text();
            const parsed = parseCsv(text);
            const editable: GenericRow[] = parsed.rows.map((row) => ({
                ulid: generateUlid(),
                values: { ...row },
                selected: false,
            }));

            setHeaders(parsed.headers);
            setRows(editable);
            setStatus(`${file.name} を読み込みました (${editable.length} 件, 列 ${parsed.headers.length})`);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
        const headers: string[] = [];
        const rows: CsvRow[] = [];
        let currentField = '';
        const currentRow: string[] = [];
        let insideQuotes = false;
        let isFirstRow = true;

        const pushField = () => {
            currentRow.push(currentField);
            currentField = '';
        };

        const pushRow = () => {
            pushField();
            if (isFirstRow) {
                headers.push(...currentRow);
                isFirstRow = false;
            } else {
                const row: CsvRow = {};
                for (let i = 0; i < headers.length; i += 1) {
                    row[headers[i]] = currentRow[i] ?? '';
                }
                rows.push(row);
            }
            currentRow.length = 0;
        };

        for (let i = 0; i < text.length; i += 1) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (char === '"') {
                if (insideQuotes && nextChar === '"') {
                    currentField += '"';
                    i += 1;
                } else {
                    insideQuotes = !insideQuotes;
                }
            } else if (char === ',' && !insideQuotes) {
                pushField();
            } else if ((char === '\n' || char === '\r') && !insideQuotes) {
                if (char === '\r' && nextChar === '\n') {
                    i += 1;
                }
                pushRow();
            } else {
                currentField += char;
            }
        }

        if (insideQuotes) {
            throw new Error('CSV parsing error: unmatched quote detected.');
        }

        if (currentField.length > 0 || currentRow.length > 0) {
            pushRow();
        }

        return { headers, rows };
    }

    const filtered = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        return rows.filter((row) => {
            if (onlySelected && !row.selected) return false;
            if (!keyword) return true;
            const haystack = headers
                .map((h) => ensure(row.values[h]))
                .join(' ')
                .toLowerCase();
            return haystack.includes(keyword);
        });
    }, [rows, headers, search, onlySelected]);

    const totalPages = useMemo(
        () => Math.max(1, Math.ceil(filtered.length / pageSize)),
        [filtered.length, pageSize],
    );
    const currentPageIndex = useMemo(
        () => Math.min(Math.max(1, currentPage), totalPages),
        [currentPage, totalPages],
    );
    const paginatedRows = useMemo(() => {
        const start = (currentPageIndex - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    }, [filtered, currentPageIndex, pageSize]);
    const pageRangeStart = filtered.length === 0 ? 0 : (currentPageIndex - 1) * pageSize + 1;
    const pageRangeEnd = filtered.length === 0 ? 0 : Math.min(currentPageIndex * pageSize, filtered.length);

    useEffect(() => {
        if (currentPage !== currentPageIndex) {
            setCurrentPage(currentPageIndex);
        }
    }, [currentPage, currentPageIndex]);

    const selectedCount = useMemo(() => rows.filter((row) => row.selected).length, [rows]);
    const allPageSelected = paginatedRows.length > 0 && paginatedRows.every((row) => row.selected);

    const toggleRowSelection = (ulid: string) => {
        setRows((prev) =>
            prev.map((row) =>
                row.ulid === ulid ? { ...row, selected: !row.selected } : row,
            ),
        );
    };

    const togglePageSelection = (checked: boolean) => {
        const pageIds = new Set(paginatedRows.map((row) => row.ulid));
        setRows((prev) =>
            prev.map((row) =>
                pageIds.has(row.ulid) ? { ...row, selected: checked } : row,
            ),
        );
    };

    const updateRowField = (ulid: string, key: string, value: string) => {
        setRows((prev) =>
            prev.map((row) => {
                if (row.ulid !== ulid) return row;
                const updatedValues = { ...row.values, [key]: value };
                return { ...row, values: updatedValues };
            }),
        );
    };

    // condition / damage term assignment handled via CSV fields (labels/ids) in values

    const handlePageSizeChange = (value: number) => {
        setPageSize(value);
        setCurrentPage(1);
    };

    const goToPage = (nextPage: number) => {
        const clamped = Math.min(Math.max(1, nextPage), totalPages);
        setCurrentPage(clamped);
    };

    const goToPreviousPage = () => {
        goToPage(currentPageIndex - 1);
    };

    const goToNextPage = () => {
        goToPage(currentPageIndex + 1);
    };

    const sanitizeDocId = (v: string) => {
        // Firestore document IDs cannot contain: / \ . (at start) __
        // Replace invalid characters with underscore
        return v
            .replace(/^\.+/, '_') // leading dots
            .replace(/\/__/g, '/_') // double underscores after slash
            .replaceAll('/', '_')
            .replaceAll('\\', '_')
            .replace(/__+/g, '_') // collapse multiple underscores
            .replace(/^_+|_+$/g, ''); // trim leading/trailing underscores
    };

    const producePayload = () => {
        const prioritized = rows.filter((row) => row.selected);
        const target = prioritized.length > 0 ? prioritized : filtered;
        if (target.length === 0) {
            setStatus('対象がありません。検索または選択条件を確認してください。');
            setPayloadJson('');
            return;
        }
        const docs: FirestoreDoc[] = target.map((row) => {
            let id: string | undefined;
            if (idColumn && idColumn !== '__auto_ulid__') {
                const candidate = ensure(row.values[idColumn]);
                id = candidate ? sanitizeDocId(candidate) : undefined;
            }
            if (!id) id = generateUlid();
            return { id, data: { ...row.values } };
        });
        setPayloadJson(JSON.stringify(docs, null, 2));
        setStatus(`${docs.length} 件のドキュメントを生成しました（コレクション: ${collectionName} / ID列: ${idColumn === '__auto_ulid__' ? '自動(ULID)' : idColumn}）。`);
    };

    const copyPayload = async () => {
        if (!payloadJson) {
            setStatus('コピーするデータがありません。先にペイロードを生成してください。');
            return;
        }
        try {
            await navigator.clipboard.writeText(payloadJson);
            setStatus('クリップボードへコピーしました。');
        } catch (err) {
            setStatus('クリップボードへのコピーに失敗しました。');
            console.error('Clipboard copy failed:', err);
        }
    };

    const downloadPayload = () => {
        if (!payloadJson) {
            setStatus('ダウンロードするデータがありません。先にペイロードを生成してください。');
            return;
        }
        const blob = new Blob([payloadJson], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `firestore_${collectionName}_${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
        setStatus('JSON ファイルをダウンロードしました。');
    };

    const uploadToFirestore = async () => {
        if (!payloadJson) {
            setStatus('アップロードするデータがありません。先にペイロードを生成してください。');
            return;
        }
        let docs: FirestoreDoc[] = [];
        try {
            const parsed = JSON.parse(payloadJson);
            if (!Array.isArray(parsed)) throw new Error('生成済みペイロードが配列ではありません');
            docs = parsed as FirestoreDoc[];
        } catch (e: any) {
            setStatus(`JSON のパースに失敗しました: ${e?.message || String(e)}`);
            return;
        }

        setIsUploading(true);
        setUploadWritten(0);
        setUploadFailed(0);
        setUploadTotal(docs.length);
        setStatus('Firestore に書き込みを開始します…');

        const BATCH = 100;
        let written = 0;
        let failed = 0;
        try {
            for (let i = 0; i < docs.length; i += BATCH) {
                const slice = docs.slice(i, i + BATCH);
                const res = await fetch('/api/products-import/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ collection: collectionName, docs: slice }),
                });
                if (!res.ok) {
                    const msg = await res.text();
                    throw new Error(`API エラー (${res.status}): ${msg}`);
                }
                const result = await res.json();
                written += Number(result?.written || 0);
                failed += Array.isArray(result?.failed) ? result.failed.length : 0;
                setUploadWritten(written);
                setUploadFailed(failed);
                setStatus(`書き込み中… ${written}/${docs.length} 件 完了（失敗 ${failed}）`);
            }
            setStatus(`書き込み完了: ${written}/${docs.length} 件（失敗 ${failed}）`);
        } catch (err: any) {
            setStatus(`書き込み中にエラーが発生しました: ${err?.message || String(err)}`);
        } finally {
            setIsUploading(false);
        }
    };

    if (loading) {
        return (
            <main style={styles.page}>
                <div style={{ textAlign: 'center', marginTop: '120px', color: '#1f2a44', fontWeight: 600 }}>
                    データを読み込み中です…
                </div>
            </main>
        );
    }

    return (
        <main style={styles.page}>
            <div style={styles.container}>
                <section style={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                        <div>
                            <h1 style={{ fontSize: '1.8rem', marginBottom: '8px', color: '#1f2a44' }}>
                                Generic Collection Uploader
                            </h1>
                            <p style={{ color: '#4b5563', lineHeight: 1.7, maxWidth: '780px' }}>
                                どんな CSV でも列そのままでプレビュー・編集し、任意の Firestore コレクションに一括投入できます。
                                ドキュメントIDは任意の列または ULID 自動生成を選べます。
                            </p>
                        </div>
                        <Link
                            href="/test"
                            style={{
                                alignSelf: 'flex-start',
                                padding: '10px 16px',
                                borderRadius: '9999px',
                                border: '1px solid rgba(59,130,246,0.5)',
                                color: '#2563eb',
                                textDecoration: 'none',
                                backgroundColor: 'rgba(37,99,235,0.08)',
                                fontWeight: 600,
                            }}
                        >
                            ← テストページ一覧へ
                        </Link>
                    </div>
                </section>

                <section style={styles.card}>
                    <h2 style={{ fontSize: '1.05rem', marginBottom: '12px', color: '#1f2937' }}>CSVファイル選択</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={handleFileSelect}
                            style={{
                                padding: '8px',
                                borderRadius: '8px',
                                border: '1px solid rgba(148,163,184,0.6)',
                            }}
                        />
                        {selectedFile && (
                            <span style={{ ...styles.badge, backgroundColor: '#dbeafe', color: '#1e40af' }}>
                                {selectedFile.name}
                            </span>
                        )}
                    </div>
                </section>

                <section style={styles.card}>
                    <h2 style={{ fontSize: '1.05rem', marginBottom: '12px', color: '#1f2937' }}>アップロード先設定</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                        <label style={{ display: 'grid', gap: '6px', fontSize: '0.85rem', color: '#4b5563' }}>
                            コレクション名
                            <input
                                value={collectionName}
                                onChange={(e) => setCollectionName(e.target.value)}
                                placeholder="例: products / orders / any_collection"
                                style={styles.input}
                            />
                        </label>
                        <label style={{ display: 'grid', gap: '6px', fontSize: '0.85rem', color: '#4b5563' }}>
                            ドキュメントIDに使う列
                            <select
                                value={idColumn}
                                onChange={(e) => setIdColumn(e.target.value)}
                                style={styles.input}
                            >
                                <option value="__auto_ulid__">自動生成（ULID）</option>
                                {headers.map((h) => (
                                    <option key={h} value={h}>{h}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <p style={{ marginTop: '10px', color: '#64748b', fontSize: '0.85rem' }}>
                        ドキュメントIDに選んだ列の値が空の場合は ULID が自動採番されます。IDに含められない文字（/）は _ に置換します。
                    </p>
                </section>

                {status && (
                    <div style={{ ...styles.card, backgroundColor: '#ecfeff', color: '#0c4a6e' }}>
                        {status}
                    </div>
                )}

                {error && (
                    <div style={{ ...styles.card, backgroundColor: '#fee2e2', color: '#b91c1c' }}>
                        エラー: {error}
                    </div>
                )}

                {rows.length === 0 && !loading && (
                    <div style={{ ...styles.card, textAlign: 'center', padding: '48px', color: '#64748b' }}>
                        CSVファイルを選択して読み込んでください
                    </div>
                )}

                {rows.length > 0 && (
                    <>
                        <section style={styles.card}>
                            <h2 style={{ fontSize: '1.05rem', marginBottom: '16px', color: '#1f2937' }}>フィルター</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                                <label style={{ display: 'grid', gap: '6px', fontSize: '0.85rem', color: '#4b5563' }}>
                                    キーワード
                                    <input
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder="任意の列で検索"
                                        style={styles.input}
                                    />
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '30px', fontSize: '0.9rem', color: '#1f2a44' }}>
                                    <input
                                        type="checkbox"
                                        checked={onlySelected}
                                        onChange={(event) => setOnlySelected(event.target.checked)}
                                    />
                                    選択済みのみ表示
                                </label>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', fontSize: '0.9rem', marginTop: '14px', color: '#334155' }}>
                                <span>総件数: {rows.length}</span>
                                <span>フィルター結果: {filtered.length}</span>
                                <span>選択: {selectedCount}</span>
                                <span>ページ表示: {paginatedRows.length}</span>
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                    gap: '12px',
                                    fontSize: '0.9rem',
                                    marginTop: '12px',
                                    color: '#334155',
                                }}
                            >
                                <span>
                                    ページ {currentPageIndex} / {totalPages}
                                </span>
                                <span>
                                    表示件数:
                                    <select
                                        value={pageSize}
                                        onChange={(event) => handlePageSizeChange(Number(event.target.value))}
                                        style={{
                                            marginLeft: '8px',
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            border: '1px solid rgba(148,163,184,0.6)',
                                        }}
                                    >
                                        {PAGE_SIZES.map((size) => (
                                            <option key={size} value={size}>
                                                {size}
                                            </option>
                                        ))}
                                    </select>
                                </span>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={goToPreviousPage}
                                        disabled={currentPageIndex <= 1}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid rgba(148,163,184,0.6)',
                                            backgroundColor: currentPageIndex <= 1 ? '#e2e8f0' : '#ffffff',
                                            color: '#1f2937',
                                            cursor: currentPageIndex <= 1 ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        前へ
                                    </button>
                                    <button
                                        type="button"
                                        onClick={goToNextPage}
                                        disabled={currentPageIndex >= totalPages}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid rgba(148,163,184,0.6)',
                                            backgroundColor: currentPageIndex >= totalPages ? '#e2e8f0' : '#ffffff',
                                            color: '#1f2937',
                                            cursor: currentPageIndex >= totalPages ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        次へ
                                    </button>
                                </div>
                                <span>
                                    {filtered.length === 0
                                        ? '0 件'
                                        : `${pageRangeStart}〜${pageRangeEnd} / ${filtered.length} 件`}
                                </span>
                            </div>
                        </section>
                        <section style={styles.card}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={styles.table}>
                                    <thead>
                                        <tr>
                                            <th style={styles.th}>
                                                <input
                                                    type="checkbox"
                                                    checked={allPageSelected}
                                                    onChange={(event) => togglePageSelection(event.target.checked)}
                                                />
                                            </th>
                                            <th style={styles.th}>ULID</th>
                                            {headers.map((h) => (
                                                <th key={h} style={styles.th}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedRows.map((row, index) => {
                                            const rowShade = index % 2 === 1 ? '#f9fafb' : '#ffffff';

                                            return (
                                                <tr key={row.ulid} style={{ backgroundColor: rowShade }}>
                                                    <td style={styles.td}>
                                                        <input
                                                            type="checkbox"
                                                            checked={row.selected}
                                                            onChange={() => toggleRowSelection(row.ulid)}
                                                        />
                                                    </td>
                                                    <td style={{ ...styles.td, fontFamily: 'monospace' }}>{row.ulid}</td>
                                                    {headers.map((h) => (
                                                        <td key={h} style={styles.td}>
                                                            <input
                                                                value={row.values[h] ?? ''}
                                                                onChange={(e) => updateRowField(row.ulid, h, e.target.value)}
                                                                style={styles.input}
                                                            />
                                                        </td>
                                                    ))}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section style={styles.card}>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                <button
                                    type="button"
                                    onClick={producePayload}
                                    style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600 }}
                                >
                                    ペイロード生成
                                </button>
                                <button
                                    type="button"
                                    onClick={uploadToFirestore}
                                    disabled={isUploading}
                                    style={{
                                        padding: '10px 16px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: isUploading ? '#a78bfa' : '#7c3aed',
                                        color: '#fff',
                                        fontWeight: 600,
                                        cursor: isUploading ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {isUploading ? `書き込み中… ${uploadWritten}/${uploadTotal}` : 'Firestoreへ書き込み'}
                                </button>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (!payloadJson) {
                                            setStatus('テストアップロードするデータがありません。先にペイロードを生成してください。');
                                            return;
                                        }
                                        let docs: FirestoreDoc[] = [];
                                        try {
                                            const parsed = JSON.parse(payloadJson);
                                            if (!Array.isArray(parsed)) throw new Error('生成済みペイロードが配列ではありません');
                                            docs = parsed.slice(0, 3) as FirestoreDoc[];
                                        } catch (e: any) {
                                            setStatus(`JSON のパースに失敗しました: ${e?.message || String(e)}`);
                                            return;
                                        }

                                        setIsUploading(true);
                                        setUploadWritten(0);
                                        setUploadFailed(0);
                                        setUploadTotal(docs.length);
                                        setStatus('テストモード: 3件のみ書き込みを開始します…');

                                        try {
                                            const res = await fetch('/api/products-import/upload', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ collection: collectionName, docs }),
                                            });
                                            if (!res.ok) {
                                                const msg = await res.text();
                                                throw new Error(`API エラー (${res.status}): ${msg}`);
                                            }
                                            const result = await res.json();
                                            const written = Number(result?.written || 0);
                                            const failed = Array.isArray(result?.failed) ? result.failed.length : 0;
                                            setUploadWritten(written);
                                            setUploadFailed(failed);
                                            setStatus(`テストモード完了: ${written}/${docs.length} 件書き込み完了（失敗 ${failed}）`);
                                        } catch (err: any) {
                                            setStatus(`テストモード書き込み中にエラーが発生しました: ${err?.message || String(err)}`);
                                        } finally {
                                            setIsUploading(false);
                                        }
                                    }}
                                    disabled={isUploading}
                                    style={{
                                        padding: '10px 16px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: isUploading ? '#fbbf24' : '#f59e0b',
                                        color: '#fff',
                                        fontWeight: 600,
                                        cursor: isUploading ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    🧪 テスト書き込み (3件のみ)
                                </button>
                                <button
                                    type="button"
                                    onClick={copyPayload}
                                    style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#0ea5e9', color: '#fff', fontWeight: 600 }}
                                >
                                    クリップボードへコピー
                                </button>
                                <button
                                    type="button"
                                    onClick={downloadPayload}
                                    style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 600 }}
                                >
                                    JSON をダウンロード
                                </button>
                                {(payloadJson || isUploading) && (
                                    <span style={styles.badge}>
                                        {isUploading
                                            ? `進捗: ${uploadWritten}/${uploadTotal}（失敗 ${uploadFailed}）`
                                            : `${payloadJson.split('\n').length} 行`}
                                    </span>
                                )}
                            </div>
                            <pre
                                style={{
                                    background: '#0f172a',
                                    color: '#e2e8f0',
                                    padding: '16px',
                                    borderRadius: '12px',
                                    maxHeight: '340px',
                                    overflow: 'auto',
                                    fontSize: '0.8rem',
                                }}
                            >
                                {payloadJson || '// ペイロード未生成'}
                            </pre>
                        </section>
                    </>
                )}
            </div>
        </main>
    );
}
