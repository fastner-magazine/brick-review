import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function Filters({
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    typeFilter,
    setTypeFilter,
    categoryOptions,
    typeOptions,
    filteredLength,
    dataLength,
    styles,
    pageSize,
    setPageSize,
    pageIndex,
    setPageIndex,
}: any) {
    return (
        <section style={styles.card}>
            <div style={{ display: 'grid', gap: '16px' }}>
                <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                    <label style={{ display: 'grid', gap: '6px', fontSize: '0.85rem', color: '#4b5563' }}>
                        フリーテキスト検索
                        <Input style={styles.input as React.CSSProperties} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="商品名 / variant_group_id / SKU など" />
                    </label>
                    <label style={{ display: 'grid', gap: '6px', fontSize: '0.85rem', color: '#4b5563' }}>
                        カテゴリ
                        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} style={styles.input}>
                            <option value="all">すべて</option>
                            {categoryOptions.map((option: string) => (
                                <option key={option} value={option}>
                                    {option || '(未設定)'}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label style={{ display: 'grid', gap: '6px', fontSize: '0.85rem', color: '#4b5563' }}>
                        タイプ (types)
                        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} style={styles.input}>
                            <option value="all">すべて</option>
                            {typeOptions.map((option: string) => (
                                <option key={option} value={option}>
                                    {option || '(未設定)'}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ fontSize: '0.9rem', color: '#475569' }}>
                        表示件数: {filteredLength.toLocaleString('ja-JP')} / {dataLength.toLocaleString('ja-JP')} グループ
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <label style={{ display: 'grid', gap: '6px', fontSize: '0.85rem', color: '#4b5563' }}>
                            表示数
                            <select
                                value={String(pageSize)}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    const n = v === '0' ? 0 : Number(v);
                                    setPageSize(n);
                                    setPageIndex(0);
                                }}
                                style={styles.input}
                            >
                                <option value="10">10 件</option>
                                <option value="25">25 件</option>
                                <option value="50">50 件</option>
                                <option value="100">100 件</option>
                                <option value="0">全件</option>
                            </select>
                        </label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <Button variant="default" size="sm" onClick={() => setPageIndex(Math.max(0, pageIndex - 1))} disabled={pageIndex <= 0}>
                                前へ
                            </Button>
                            <Button variant="default" size="sm" onClick={() => setPageIndex(pageIndex + 1)} disabled={pageSize > 0 ? pageIndex >= Math.ceil(filteredLength / pageSize) - 1 : true}>
                                次へ
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
