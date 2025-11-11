import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function QueuePanel({
    pendingDocs,
    queueCounts,
    statusMessage,
    handleRemovePendingDoc,
    uploadQueue,
    copyQueue,
    downloadQueue,
    handleClearQueue,
    isUploading,
    queueJson,
    styles,
    editStyles,
}: any) {
    return (
        <section style={styles.card}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#1f2937' }}>Firestore 書き込みキュー</h2>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                        ドキュメント数: {pendingDocs.length} 件
                        {Object.keys(queueCounts).length > 0 && (
                            <span>
                                {' '}
                                / 内訳:{' '}
                                {Object.entries(queueCounts)
                                    .map(([collection, count]) => `${collection}: ${count}`)
                                    .join(' / ')}
                            </span>
                        )}
                    </div>
                </div>
                {statusMessage && (
                    <Badge>{statusMessage}</Badge>
                )}
            </header>

            {pendingDocs.length === 0 ? (
                <div style={{ marginTop: '12px', color: '#64748b', fontSize: '0.9rem' }}>
                    追加されたドキュメントはありません。編集したグループで「変更をキューへ追加」を押してください。
                </div>
            ) : (
                <div style={{ marginTop: '16px', display: 'grid', gap: '8px' }}>
                    <div style={editStyles.queueList}>
                        {pendingDocs.map((item: any, index: number) => (
                            <div
                                key={`${item.collection}-${item.doc.id ?? 'no-id'}-${index}`}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(148,163,184,0.3)',
                                    backgroundColor: '#f8fafc',
                                    fontSize: '0.85rem',
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <span style={{ fontWeight: 600, color: '#1f2937' }}>{item.summary}</span>
                                    <span style={{ color: '#475569' }}>
                                        doc id:{' '}
                                        <code style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{item.doc.id ?? '(auto)'}</code>
                                    </span>
                                </div>
                                <Button type="button" onClick={() => handleRemovePendingDoc(index)} variant="outline" size="sm">
                                    削除
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ marginTop: '18px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Button type="button" onClick={uploadQueue} variant="gradient" size="md" disabled={isUploading || pendingDocs.length === 0}>
                    Firestore へ書き込み
                </Button>
                <Button type="button" onClick={copyQueue} variant="outline" size="md" disabled={!queueJson}>
                    JSON をコピー
                </Button>
                <Button type="button" onClick={downloadQueue} variant="outline" size="md" disabled={!queueJson}>
                    JSON をダウンロード
                </Button>
                <Button type="button" onClick={handleClearQueue} variant="destructive" size="md" disabled={pendingDocs.length === 0}>
                    キューをクリア
                </Button>
            </div>

            <pre
                style={{
                    marginTop: '18px',
                    background: '#0f172a',
                    color: '#e2e8f0',
                    padding: '16px',
                    borderRadius: '12px',
                    maxHeight: '360px',
                    overflow: 'auto',
                    fontSize: '0.8rem',
                }}
            >
                {queueJson || '// キューが空です。'}
            </pre>
        </section>
    );
}
