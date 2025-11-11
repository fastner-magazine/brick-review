'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSkus } from '@/lib/useFirestore';

type SkuLineItem = {
  id: string;
  skuId?: string;
  name: string;
  dims: { w: number; d: number; h: number };
  keepUpright: boolean;
  quantity: number;
  sideMargin: number;
  frontMargin: number;
  topMargin: number;
  gapXY: number;
  gapZ: number;
  maxStackLayers?: number;
  unitWeightKg?: number;
};

export default function Home() {
  const [sku, setSku] = useState<any>({
    w: '',
    d: '',
    h: '',
    keepUpright: false,
    sideMargin: 0,
    frontMargin: 0,
    topMargin: 0,
    gapXY: 0,
    gapZ: 0,
    maxStackLayers: undefined,
    unitWeightKg: undefined,
  });
  const [quantity, setQuantity] = useState(1);
  const router = useRouter();
  const { skus: firestoreSkus, loading: skusLoading } = useSkus();
  const [selectedSkuId, setSelectedSkuId] = useState('');
  const [lineItems, setLineItems] = useState<SkuLineItem[]>([]);
  const [inputMode, setInputMode] = useState<'select' | 'custom'>('select');

  const skus = useMemo(() => {
    const converted = firestoreSkus.map(sku => ({
      id: sku.id,
      name: sku.name,
      w: sku.w,
      d: sku.d,
      h: sku.h,
      unitWeightKg: sku.unitWeightKg,
    }));
    if (converted.length > 0) {
      console.log(`📦 商品マスタ: ${converted.length} 件読み込み`, converted);
    }
    return converted;
  }, [firestoreSkus]);

  const selectedSku = useMemo(() => skus.find((s) => s.id === selectedSkuId), [selectedSkuId, skus]);

  const generateEntryId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `item-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  useEffect(() => {
    try {
      const last = sessionStorage.getItem('lastInput');
      if (last) {
        const obj = JSON.parse(last);
        if (obj.sku) setSku((prev: any) => ({ ...prev, ...obj.sku }));
        if (obj.quantity) setQuantity(obj.quantity);
        if (obj.selectedSkuId !== undefined) setSelectedSkuId(obj.selectedSkuId);
        if (Array.isArray(obj.lineItems)) {
          const restored: SkuLineItem[] = obj.lineItems
            .map((item: any) => {
              if (!item || typeof item !== 'object') return null;
              const id = typeof item.id === 'string' && item.id ? item.id : generateEntryId();
              const w = Number(item.dims?.w ?? item.w);
              const d = Number(item.dims?.d ?? item.d);
              const h = Number(item.dims?.h ?? item.h);
              if (!Number.isFinite(w) || !Number.isFinite(d) || !Number.isFinite(h)) return null;
              const qty = Number(item.quantity);
              const maxLayersRaw = Number(item.maxStackLayers);
              const unitWeightRaw = Number(item.unitWeightKg);
              return {
                id,
                skuId: typeof item.skuId === 'string' && item.skuId ? item.skuId : undefined,
                name: typeof item.name === 'string' && item.name ? item.name : `カスタム(${w}×${d}×${h})`,
                dims: { w, d, h },
                keepUpright: !!item.keepUpright,
                quantity: Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1,
                sideMargin: Number(item.sideMargin) || 0,
                frontMargin: Number(item.frontMargin) || 0,
                topMargin: Number(item.topMargin) || 0,
                gapXY: Number(item.gapXY) || 0,
                gapZ: Number(item.gapZ) || 0,
                maxStackLayers: Number.isFinite(maxLayersRaw) && maxLayersRaw > 0 ? Math.floor(maxLayersRaw) : undefined,
                unitWeightKg: Number.isFinite(unitWeightRaw) && unitWeightRaw > 0 ? unitWeightRaw : undefined,
              } as SkuLineItem;
            })
            .filter((entry: SkuLineItem | null): entry is SkuLineItem => entry !== null);
          if (restored.length > 0) {
            setLineItems(restored);
          }
        }
      }
    } catch {
      // session storageエラーは無視
    }
  }, []);

  useEffect(() => {
    if (selectedSkuId) {
      const found = skus.find((s) => s.id === selectedSkuId);
      if (found) {
        setSku((prev: any) => ({ ...prev, w: found.w, d: found.d, h: found.h, unitWeightKg: found.unitWeightKg }));
      }
    }
  }, [selectedSkuId, skus]);

  const buildLineItemFromForm = (): SkuLineItem | null => {
    const w = Number(sku.w);
    const d = Number(sku.d);
    const h = Number(sku.h);
    if (!Number.isFinite(w) || !Number.isFinite(d) || !Number.isFinite(h) || w <= 0 || d <= 0 || h <= 0) {
      alert('幅・奥行・高さを入力してください。');
      return null;
    }
    const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
    const name = selectedSku ? selectedSku.name : `カスタム(${w}×${d}×${h})`;
    return {
      id: generateEntryId(),
      skuId: selectedSkuId || undefined,
      name,
      dims: { w, d, h },
      keepUpright: !!sku.keepUpright,
      quantity: safeQuantity,
      sideMargin: sku.sideMargin,
      frontMargin: sku.frontMargin,
      topMargin: sku.topMargin,
      gapXY: sku.gapXY,
      gapZ: sku.gapZ,
      maxStackLayers: sku.maxStackLayers,
      unitWeightKg: sku.unitWeightKg,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      sessionStorage.setItem('lastInput', JSON.stringify({ sku, quantity, lineItems, selectedSkuId }));
    } catch {
      // session storageエラーは無視
    }

    const sourceItems = lineItems.length > 0 ? lineItems : (() => {
      const single = buildLineItemFromForm();
      return single ? [single] : [];
    })();

    if (sourceItems.length === 0) {
      return;
    }

    const payload = sourceItems.map((item) => {
      // id を取り除いたオブジェクトを返す（未使用の変数を作らないため）
      const copy = { ...item } as Record<string, unknown>;
      delete copy.id;
      return copy;
    });

    // URLではなくsession storageに計算エントリを保存
    try {
      sessionStorage.setItem('calculationEntries', JSON.stringify(payload));
    } catch {
      // session storageエラーは無視
    }

    router.push('/calculator/result');
  };

  const handleShowQuantityPlan = () => {
    if (!sku.w || !sku.d || !sku.h) {
      alert('幅・奥行・高さを入力してください。');
      return;
    }
    try {
      sessionStorage.setItem('lastInput', JSON.stringify({ sku, quantity, lineItems, selectedSkuId }));
    } catch {
      // session storageエラーは無視
    }
    const rangeUpper = quantity && quantity > 0 ? Math.max(quantity, 20) : 20;
    const params = new URLSearchParams({
      w: String(sku.w),
      d: String(sku.d),
      h: String(sku.h),
      keepUpright: String(sku.keepUpright),
      maxQuantity: String(rangeUpper),
    });
    if (selectedSkuId) params.append('skuId', selectedSkuId);
    if (quantity) params.append('highlightQuantity', String(quantity));
    router.push(`/calculator/quantity-plan?${params.toString()}`);
  };

  useEffect(() => {
    try {
      sessionStorage.setItem('lastInput', JSON.stringify({ sku, quantity, lineItems, selectedSkuId }));
    } catch {
      // session storageエラーは無視
    }
  }, [sku, quantity, lineItems, selectedSkuId]);

  const handleAddLineItem = () => {
    const item = buildLineItemFromForm();
    if (!item) return;
    setLineItems((prev) => [...prev, item]);
  };

  const handleRemoveLineItem = (id: string) => {
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleChangeLineItemQuantity = (id: string, nextQuantity: number) => {
    setLineItems((prev) => prev.map((item) => {
      if (item.id !== id) return item;
      const safe = Number.isFinite(nextQuantity) && nextQuantity > 0 ? Math.floor(nextQuantity) : 1;
      return { ...item, quantity: safe };
    }));
  };

  const handleClearLineItems = () => {
    if (typeof globalThis !== 'undefined' && typeof globalThis.confirm === 'function') {
      const confirmed = globalThis.confirm('追加済みの商品リストをすべて削除しますか？');
      if (!confirmed) return;
    }
    setLineItems([]);
  };

  const totalQueuedQuantity = useMemo(() => lineItems.reduce((sum, item) => sum + item.quantity, 0), [lineItems]);

  const handleExportCsv = () => {
    if (lineItems.length === 0) {
      alert('出力するデータがありません。');
      return;
    }

    const csvHeader = '名称,幅 (mm),奥行 (mm),高さ (mm),点数,固定方向\n';
    const csvRows = lineItems.map(item => {
      const orientation = item.keepUpright ? '平積み固定' : 'なし';
      return `"${item.name.replaceAll('"', '""')}",${item.dims.w},${item.dims.d},${item.dims.h},${item.quantity},"${orientation}"`;
    }).join('\n');

    const csvContent = csvHeader + csvRows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `商品リスト_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  if (skusLoading) {
    return (
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <button type="button" onClick={() => router.push('/calculator/sku-settings')}>
            商品サイズマスタ設定
          </button>
          <button type="button" onClick={() => router.push('/calculator/box-settings')}>
            箱情報設定
          </button>
          <button type="button" onClick={() => router.push('/calculator/general-settings')}>
            各種設定
          </button>
        </div>
        <h1>商品情報入力</h1>
        <p>商品マスタを読み込み中...</p>
      </div>
    );
  }

  return (
    <div style={{
      padding: '16px',
      maxWidth: '1200px',
      margin: '0 auto',
      minHeight: '100vh',
      background: '#f5f7fa'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => router.push('/calculator/sku-settings')} style={{ padding: '6px 12px', fontSize: 13 }}>
            商品マスタ
          </button>
          <button type="button" onClick={() => router.push('/calculator/box-settings')} style={{ padding: '6px 12px', fontSize: 13 }}>
            箱情報
          </button>
          <button type="button" onClick={() => router.push('/calculator/general-settings')} style={{ padding: '6px 12px', fontSize: 13 }}>
            各種設定
          </button>
        </div>
        <button type="button" onClick={() => router.push('/')} style={{ padding: '6px 12px', fontSize: 13, background: '#6c757d', color: '#fff', border: 'none', borderRadius: 4 }}>
          メインページへ戻る
        </button>
      </div>

      <h1 style={{ fontSize: 22, margin: '0 0 16px 0', fontWeight: 600 }}>商品情報入力</h1>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(350px, 450px) 1fr',
        gap: 16,
        alignItems: 'start'
      }}>
        {/* 左カラム: 入力フォーム */}
        <form onSubmit={handleSubmit}
          style={{
            display: 'grid',
            gap: 12,
            background: '#fff',
            padding: 16,
            borderRadius: 8,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
          <div>
            <label htmlFor="sku-select" style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>
              商品マスタから選択
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                id="sku-select"
                value={selectedSkuId}
                onChange={(e) => setSelectedSkuId(e.target.value)}
                disabled={inputMode === 'custom'}
                style={{ width: '100%', padding: '8px', fontSize: 13, borderRadius: 4 }}
              >
                <option value="">--選択してください--</option>
                {skus.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}({candidate.w}×{candidate.d}×{candidate.h}mm)
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 6 }}>
                {inputMode === 'select' ? (
                  <button type="button" onClick={() => { setInputMode('custom'); setSelectedSkuId(''); }} style={{ padding: '6px 8px', fontSize: 12 }}>カスタム入力</button>
                ) : (
                  <button type="button" onClick={() => { setInputMode('select'); }} style={{ padding: '6px 8px', fontSize: 12 }}>選択に戻す</button>
                )}
              </div>
            </div>
          </div>

          {inputMode === 'select' && selectedSkuId ? (
            <div style={{ background: '#f0f8ff', padding: 12, borderRadius: 6, border: '1px solid #b3d9ff' }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: '#0066cc', fontSize: 13 }}>選択中の商品サイズ</div>
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                <div>幅: {sku.w} mm</div>
                <div>奥行: {sku.d} mm</div>
                <div>高さ: {sku.h} mm</div>
              </div>
            </div>
          ) : (
            <>
              {/* カスタム入力は明示的に切り替えた場合に表示 */}
              {inputMode === 'custom' ? (
                <>
                  <div style={{ background: '#fff9e6', padding: 8, borderRadius: 6, border: '1px solid #ffd966', fontSize: 12 }}>
                    📝 カスタムサイズを入力してください
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div>
                      <label htmlFor="width-input" style={{ fontSize: 12, fontWeight: 600 }}>幅 (mm)</label>
                      <input
                        id="width-input"
                        type="number"
                        value={sku.w}
                        onChange={(e) => setSku({ ...sku, w: e.target.value === '' ? '' : Number(e.target.value) })}
                        required
                        style={{ width: '100%', padding: '6px', fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label htmlFor="depth-input" style={{ fontSize: 12, fontWeight: 600 }}>奥行 (mm)</label>
                      <input
                        id="depth-input"
                        type="number"
                        value={sku.d}
                        onChange={(e) => setSku({ ...sku, d: e.target.value === '' ? '' : Number(e.target.value) })}
                        required
                        style={{ width: '100%', padding: '6px', fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label htmlFor="height-input" style={{ fontSize: 12, fontWeight: 600 }}>高さ (mm)</label>
                      <input
                        id="height-input"
                        type="number"
                        value={sku.h}
                        onChange={(e) => setSku({ ...sku, h: e.target.value === '' ? '' : Number(e.target.value) })}
                        required
                        style={{ width: '100%', padding: '6px', fontSize: 13 }}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ background: '#fff9e6', padding: 8, borderRadius: 6, border: '1px solid #ffd966', fontSize: 12 }}>
                  商品を選択してください（または「カスタム入力」をクリックして寸法を直接入力）
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="keep-upright"
              type="checkbox"
              checked={sku.keepUpright}
              onChange={(e) => setSku({ ...sku, keepUpright: e.target.checked })}
            />
            <label htmlFor="keep-upright" style={{ fontSize: 12 }}>平積みで固定(縦積み禁止)</label>
          </div>

          <div>
            <label htmlFor="quantity-input" style={{ fontSize: 12, fontWeight: 600 }}>点数</label>
            <input
              id="quantity-input"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              required
              min={1}
              style={{ width: '100%', padding: '6px', fontSize: 13 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              onClick={handleShowQuantityPlan}
              style={{ padding: '8px 12px', fontSize: 12, whiteSpace: 'nowrap' }}
            >
              数量別一覧
            </button>
            <button
              type="submit"
              style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, background: '#007bff', color: '#fff', border: 'none', borderRadius: 4 }}
            >
              計算実行
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleAddLineItem}
              style={{ padding: '6px 10px', fontSize: 12, flex: 1 }}
            >
              リストに追加
            </button>
            {lineItems.length > 0 && (
              <button
                type="button"
                onClick={handleClearLineItems}
                style={{ padding: '6px 10px', fontSize: 12, background: '#f5f5f5' }}
              >
                クリア
              </button>
            )}
          </div>
        </form>

        {/* 右カラム: 追加済み商品リスト */}
        <div style={{
          background: '#fff',
          padding: 16,
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          minHeight: '400px'
        }}>
          {lineItems.length > 0 ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>追加済みの商品</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#555' }}>合計 {totalQueuedQuantity} 個</span>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    style={{ padding: '4px 8px', fontSize: 11 }}
                  >
                    CSV出力
                  </button>
                </div>
              </div>
              <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                      <th style={{ border: '1px solid #ddd', padding: 6, textAlign: 'left', fontSize: 11 }}>名称</th>
                      <th style={{ border: '1px solid #ddd', padding: 6, textAlign: 'left', fontSize: 11 }}>寸法 (mm)</th>
                      <th style={{ border: '1px solid #ddd', padding: 6, width: 80, fontSize: 11 }}>点数</th>
                      <th style={{ border: '1px solid #ddd', padding: 6, width: 60, fontSize: 11 }}>削除</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item) => (
                      <tr key={item.id}>
                        <td style={{ border: '1px solid #ddd', padding: 6 }}>{item.name}</td>
                        <td style={{ border: '1px solid #ddd', padding: 6 }}>
                          {item.dims.w} × {item.dims.d} × {item.dims.h}
                          {item.keepUpright ? <span style={{ marginLeft: 4, color: '#007bff', fontSize: 10 }}>(平積み)</span> : null}
                        </td>
                        <td style={{ border: '1px solid #ddd', padding: 4 }}>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(event) => handleChangeLineItemQuantity(item.id, Number(event.target.value))}
                            style={{ width: '100%', padding: '4px', fontSize: 12 }}
                          />
                        </td>
                        <td style={{ border: '1px solid #ddd', padding: 4, textAlign: 'center' }}>
                          <button type="button" onClick={() => handleRemoveLineItem(item.id)} style={{ padding: '4px 8px', fontSize: 11 }}>
                            削除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: '#555' }}>
                ※リストが空の場合は、左側の入力内容({quantity} 個)がそのまま計算対象になります。
              </div>
            </>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '300px',
              color: '#999',
              fontSize: 13
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
                <div>商品を追加すると、ここにリスト表示されます</div>
                <div style={{ fontSize: 11, marginTop: 8 }}>左側のフォームから「リストに追加」をクリック</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          div[style*="gridTemplateColumns"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
