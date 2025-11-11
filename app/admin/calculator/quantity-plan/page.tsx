'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, Suspense } from 'react';
import { Box, Plan, Sku, chooseBoxesForQuantity, chooseBoxesForQuantityExtended, ExtendedPlan } from '@/lib/box-calculator';
import { useBoxes, useGeneralSettings, useSkuOverrides } from '@/lib/useFirestore';

type RawBox =
  | Box
  | (Box & { W?: number; D?: number; H?: number })
  | { id: number; W: number; D: number; H: number; maxWeightKg?: number };

type QuantityGroup = {
  key: string;
  start: number;
  end: number;
  plan: Plan | null;
  box?: Box;
};

type ExtendedQuantityGroup = {
  key: string;
  start: number;
  end: number;
  plan: ExtendedPlan | null;
  box?: Box;
};

const formatOrientation = ([a, b, c]: [number, number, number]) => `${a} × ${b} × ${c} mm`;

const buildExtendedPlanKey = (plan: ExtendedPlan): string => {
  const layerSignature = plan.layers
    .map((layer) => layer.columns
      .map((col) => `${col.orientation.join('x')}:${col.count}:${col.rows}`)
      .sort((a, b) => a.localeCompare(b))
      .join('+'))
    .join('__');
  return `box-${plan.boxId}-${plan.layers.length}-${layerSignature}`;
};

const describeExtendedLayer = (layer: ExtendedPlan['layers'][number]): string => {
  const columns = layer.columns
    .map((col) => `${formatOrientation(col.orientation)} / 列 ${col.count} × 奥行 ${col.rows}`)
    .join(' ／ ');
  return `${layer.type === 'uniform' ? '均等' : '混在'}: ${columns}`;
};

const DEFAULT_MAX_QUANTITY = 20;
const MAX_ALLOWED_QUANTITY = 500;

function normalizeBoxesInput(boxes: RawBox[]): Box[] {
  return boxes.map((box) => {
    if ('inner' in box) {
      return { id: box.id, inner: box.inner, maxWeightKg: box.maxWeightKg };
    }
    const { id, W, D, H, maxWeightKg } = box;
    return { id, inner: { W, D, H }, maxWeightKg };
  });
}

function parseNumberParam(value: string | string[] | undefined): number | undefined {
  if (Array.isArray(value)) {
    return parseNumberParam(value[0]);
  }
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function QuantityPlan() {
  return (
    <Suspense fallback={<div style={{ padding: '20px' }}>データを読み込み中...</div>}>
      <QuantityPlanInner />
    </Suspense>
  );
}

function QuantityPlanInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // クエリパラメータを取得
  const query = useMemo(() => {
    const params: Record<string, string | string[]> = {};
    const sp = searchParams ?? new URLSearchParams();
    sp.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }, [searchParams]);

  const { boxes: firestoreBoxes, loading: boxesLoading } = useBoxes();
  const { settings: firestoreSettings, loading: settingsLoading } = useGeneralSettings();
  const { overrides: firestoreOverrides, loading: overridesLoading } = useSkuOverrides();
  
  const [boxPadding, setBoxPadding] = useState<number>(0);
  const [maxQuantity, setMaxQuantity] = useState<number>(DEFAULT_MAX_QUANTITY);

  // Firestoreから取得したデータを使用
  const generalSettings = useMemo(() => firestoreSettings || null, [firestoreSettings]);
  const skuOverrides = useMemo(() => firestoreOverrides || [], [firestoreOverrides]);

  // 箱側パディングの初期値をFirestore設定から取得
  useEffect(() => {
    if (firestoreSettings?.defaultBoxPadding !== undefined) {
      setBoxPadding(firestoreSettings.defaultBoxPadding);
    }
  }, [firestoreSettings]);

  useEffect(() => {
    const qp = parseNumberParam(query.maxQuantity);
    if (qp && qp > 0) {
      setMaxQuantity(Math.min(Math.floor(qp), MAX_ALLOWED_QUANTITY));
    }
  }, [query.maxQuantity]);

  useEffect(() => {
    const qp = parseNumberParam(query.boxPadding);
    if (qp !== undefined && qp >= 0) {
      setBoxPadding(qp);
    }
  }, [query.boxPadding]);

  const normalizedBoxes = useMemo(() => normalizeBoxesInput(firestoreBoxes), [firestoreBoxes]);

  const currentSkuId = query.skuId as string | undefined;

  const skuOverride = useMemo(() => {
    if (!currentSkuId) return null;
    return skuOverrides.find((o: any) => o.skuId === currentSkuId) ?? null;
  }, [currentSkuId, skuOverrides]);

  const applySetting = (
    queryValue: any,
    overrideValue: any,
    defaultValue: any,
    fallback: any
  ) => {
    if (queryValue !== undefined && queryValue !== null && queryValue !== '') {
      return typeof queryValue === 'string' ? Number(queryValue) : queryValue;
    }
    if (overrideValue !== undefined && overrideValue !== null) {
      return overrideValue;
    }
    if (defaultValue !== undefined && defaultValue !== null) {
      return defaultValue;
    }
    return fallback;
  };

  const sku: Sku | null = useMemo(() => {
    const qW = parseNumberParam(query.w);
    const qD = parseNumberParam(query.d);
    const qH = parseNumberParam(query.h);
    if (!qW || !qD || !qH) return null;

    const gapXYDefault = generalSettings?.defaultGapXY;
    const gapZDefault = generalSettings?.defaultGapZ;

    return {
      dims: { w: qW, d: qD, h: qH },
      keepUpright: (Array.isArray(query.keepUpright) ? query.keepUpright[0] : query.keepUpright) === 'true',
      sideMargin: applySetting(
        query.sideMargin ?? query.sidePadding,
        skuOverride?.sideMargin,
        generalSettings?.defaultSideMargin,
        0
      ),
      frontMargin: applySetting(
        query.frontMargin ?? query.frontPadding,
        skuOverride?.frontMargin,
        generalSettings?.defaultFrontMargin,
        0
      ),
      topMargin: applySetting(
        query.topMargin ?? query.topPadding,
        skuOverride?.topMargin,
        generalSettings?.defaultTopMargin,
        0
      ),
      gapXY: applySetting(query.gapXY, skuOverride?.gapXY, gapXYDefault, 0),
      gapZ: applySetting(query.gapZ, skuOverride?.gapZ, gapZDefault, 0),
      maxStackLayers: applySetting(
        query.maxStackLayers,
        skuOverride?.maxStackLayers,
        generalSettings?.defaultMaxStackLayers,
        undefined
      ),
      unitWeightKg: parseNumberParam(query.unitWeightKg),
    };
  }, [query, skuOverride, generalSettings]);

  const selectedQuantity = useMemo(() => {
    const parsed = parseNumberParam(query.highlightQuantity ?? query.quantity);
    return parsed && parsed > 0 ? parsed : undefined;
  }, [query.highlightQuantity, query.quantity]);

  const boxMap = useMemo(() => {
    const map = new Map<number, Box>();
    for (const box of normalizedBoxes) {
      map.set(box.id, box);
    }
    return map;
  }, [normalizedBoxes]);

  const quantityGroups = useMemo<QuantityGroup[]>(() => {
    if (!sku || normalizedBoxes.length === 0) return [];
    const limit = Math.max(1, Math.min(maxQuantity, MAX_ALLOWED_QUANTITY));
    const groups: QuantityGroup[] = [];
    let current: QuantityGroup | null = null;

    for (let q = 1; q <= limit; q += 1) {
      // chooseBoxesForQuantityを使用して、result.tsxと同じロジックで計算
      const result = chooseBoxesForQuantity(normalizedBoxes, sku, q, { boxPadding });
      // 1箱で収容できる場合のみプランを採用
      const plan = (result.shipments.length === 1 && result.leftover === 0) ? result.shipments[0].plan : null;
      const box = plan ? boxMap.get(plan.boxId) : undefined;
      const key = plan
        ? `box-${plan.boxId}-${plan.orientation.join('x')}-${plan.nx}-${plan.ny}-${plan.layers}`
        : 'none';

      if (current && current.key === key) {
        current.end = q;
      } else {
        if (current) groups.push(current);
        current = { key, start: q, end: q, plan, box };
      }
    }

    if (current) groups.push(current);
    return groups;
  }, [sku, normalizedBoxes, maxQuantity, boxPadding, boxMap]);

  const extendedQuantityGroups = useMemo<ExtendedQuantityGroup[]>(() => {
    if (!sku || normalizedBoxes.length === 0) return [];
    const limit = Math.max(1, Math.min(maxQuantity, MAX_ALLOWED_QUANTITY));
    const groups: ExtendedQuantityGroup[] = [];
    let current: ExtendedQuantityGroup | null = null;

    for (let q = 1; q <= limit; q += 1) {
      // chooseBoxesForQuantityExtendedを使用して、result.tsxと同じロジックで計算
      const result = chooseBoxesForQuantityExtended(normalizedBoxes, sku, q, { boxPadding });
      // 1箱で収容できる場合のみプランを採用
      const plan = (result.shipments.length === 1 && result.leftover === 0) ? result.shipments[0].plan : null;
      const box = plan ? boxMap.get(plan.boxId) : undefined;
      const key = plan ? buildExtendedPlanKey(plan) : 'none';

      if (current && current.key === key) {
        current.end = q;
      } else {
        if (current) groups.push(current);
        current = { key, start: q, end: q, plan, box };
      }
    }

    if (current) groups.push(current);
    return groups;
  }, [sku, normalizedBoxes, maxQuantity, boxPadding, boxMap]);

  const handleBack = () => {
    router.push('/calculator');
  };

  const handleExportCsv = () => {
    console.log('CSV出力開始 - quantityGroups:', quantityGroups);
    if (quantityGroups.length === 0) {
      alert('出力するデータがありません。');
      return;
    }

    const csvHeader = '数量範囲,推奨箱ID,箱サイズ(mm),配置,商品向き(mm),1箱最大収容数,空間効率,備考\n';
    const csvRows = quantityGroups.map(group => {
      console.log('CSV行生成:', group);
      const rangeLabel = group.start === group.end ? `${group.start}個` : `${group.start}～${group.end}個`;
      
      if (!group.plan || !group.box) {
        return `"${rangeLabel}","該当なし","","","","","","箱マスタや余白設定を見直してください"`;
      }

      const boxSize = `${group.box.inner.W}×${group.box.inner.D}×${group.box.inner.H}`;
      const arrangement = `${group.plan.nx}×${group.plan.ny}×${group.plan.layers}`;
      const orientation = `${group.plan.orientation[0]}×${group.plan.orientation[1]}×${group.plan.orientation[2]}`;
      const capacity = group.plan.nx * group.plan.ny * group.plan.layers;
      const efficiency = `${Math.round((1 - group.plan.voidRatio) * 1000) / 10}%`;

      return `"${rangeLabel}","${group.box.id}","${boxSize}","${arrangement}","${orientation}","${capacity}","${efficiency}",""`;
    }).join('\n');

    const csvContent = csvHeader + csvRows;
    console.log('CSVコンテンツ:', csvContent);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `数量別推奨箱一覧_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    link.remove();
    console.log('CSV出力完了');
  };

  // ローディング中の表示
  if (boxesLoading || settingsLoading || overridesLoading) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>数量別の推奨箱一覧</h1>
        <p>データを読み込み中...</p>
      </div>
    );
  }

  if (normalizedBoxes.length === 0) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>数量別の推奨箱一覧</h1>
        <p>箱情報が登録されていません。先に箱情報を設定してください。</p>
        <button onClick={() => router.push('/calculator/box-settings')}>箱情報設定ページへ</button>
      </div>
    );
  }

  if (!sku) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>数量別の推奨箱一覧</h1>
        <p>商品情報が不足しています。トップページから商品情報を入力してください。</p>
        <button onClick={handleBack}>トップページへ戻る</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <button type="button" onClick={handleBack}>
          ← 商品入力に戻る
        </button>
        <button type="button" onClick={() => router.push('/calculator/general-settings')}>
          各種設定を確認する
        </button>
      </div>

      <h1>数量別の推奨箱一覧</h1>

      <section style={{ padding: 16, border: '1px solid #ddd', borderRadius: 6 }}>
        <h2 style={{ marginTop: 0 }}>対象商品の情報</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 14 }}>
          <div>
            <div>寸法: {sku.dims.w} × {sku.dims.d} × {sku.dims.h} mm</div>
            <div>平積み固定: {sku.keepUpright ? 'はい' : 'いいえ'}</div>
          </div>
          <div>
            <div>マージン(側/前/上): {sku.sideMargin} / {sku.frontMargin} / {sku.topMargin} mm</div>
            <div>ギャップ(XY/Z): {sku.gapXY ?? 0} / {sku.gapZ ?? 0} mm</div>
          </div>
          {sku.maxStackLayers !== undefined && sku.maxStackLayers !== null && (
            <div>最大積み上げ段数: {sku.maxStackLayers} 段</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>一覧上限（個数）</span>
            <input
              type="number"
              min={1}
              max={MAX_ALLOWED_QUANTITY}
              value={maxQuantity}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next) && next > 0) {
                  setMaxQuantity(Math.min(Math.floor(next), MAX_ALLOWED_QUANTITY));
                }
              }}
              style={{ width: 100 }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>箱側パディング (mm)</span>
            <input
              type="number"
              min={0}
              value={boxPadding}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (!Number.isNaN(next) && next >= 0) {
                  setBoxPadding(next);
                }
              }}
              style={{ width: 80 }}
            />
          </label>
        </div>
        <p style={{ marginTop: 8, fontSize: 12, color: '#555' }}>
          箱側パディングは「箱の内壁と商品群の間に確保する余白」です。必要に応じて調整してください（全体設定の値を初期値として読み込みます）。
        </p>
      </section>

      <section style={{ padding: 16, border: '1px solid #ddd', borderRadius: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>数量別 推奨ボックス</h2>
          <button
            type="button"
            onClick={handleExportCsv}
            style={{ padding: '6px 12px', fontSize: 14 }}
          >
            CSV出力
          </button>
        </div>
        {quantityGroups.length === 0 ? (
          <p>指定した個数範囲では該当する箱が見つかりませんでした。</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>数量範囲</th>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>推奨箱</th>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>配置</th>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>1箱最大収容数</th>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>備考</th>
              </tr>
            </thead>
            <tbody>
              {quantityGroups.map((group) => {
                const isHighlighted =
                  selectedQuantity !== undefined &&
                  selectedQuantity >= group.start &&
                  selectedQuantity <= group.end;
                const rangeLabel = group.start === group.end ? `${group.start} 個` : `${group.start} ～ ${group.end} 個`;

                if (!group.plan || !group.box) {
                  return (
                    <tr
                      key={`${group.key}-${group.start}`}
                      style={{ background: isHighlighted ? '#ffebee' : undefined }}
                    >
                      <td style={{ border: '1px solid #ddd', padding: 8 }}>{rangeLabel}</td>
                      <td style={{ border: '1px solid #ddd', padding: 8 }}>該当する箱なし</td>
                      <td style={{ border: '1px solid #ddd', padding: 8 }}>-</td>
                      <td style={{ border: '1px solid #ddd', padding: 8 }}>-</td>
                      <td style={{ border: '1px solid #ddd', padding: 8 }}>箱マスタや余白設定を見直してください。</td>
                    </tr>
                  );
                }

                const { plan, box } = group;
                const arrangement = `${plan.nx} × ${plan.ny} × ${plan.layers}`;
                const orientation = `${plan.orientation[0]} × ${plan.orientation[1]} × ${plan.orientation[2]} mm`;
                const voidRatio = `${Math.round(plan.voidRatio * 1000) / 10}%`;

                return (
                  <tr
                    key={`${group.key}-${group.start}`}
                    style={{ background: isHighlighted ? '#e8f5e9' : undefined }}
                  >
                    <td style={{ border: '1px solid #ddd', padding: 8 }}>{rangeLabel}</td>
                    <td style={{ border: '1px solid #ddd', padding: 8 }}>
                      <div>箱ID {plan.boxId}</div>
                      <div style={{ fontSize: 12, color: '#555' }}>
                        内寸: {box.inner.W} × {box.inner.D} × {box.inner.H} mm
                      </div>
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: 8 }}>
                      <div>列×行×層: {arrangement}</div>
                      <div style={{ fontSize: 12, color: '#555' }}>向き: {orientation}</div>
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: 8 }}>{plan.capacity} 個</td>
                    <td style={{ border: '1px solid #ddd', padding: 8 }}>
                      <div>空隙率: {voidRatio}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ padding: 16, border: '1px solid #ddd', borderRadius: 6 }}>
        <h2 style={{ marginTop: 0 }}>数量別 拡張ボックス案（試験機能）</h2>
        <p style={{ fontSize: 12, color: '#555', marginTop: 4, marginBottom: 12 }}>
          列ごとに向きを混在させる配置や、層ごとに別パターンを採用した場合の候補です。実際に採用する際は作業性・安全性をご確認ください。
        </p>
        {extendedQuantityGroups.length === 0 ? (
          <p>拡張ロジックでは該当する箱が見つかりませんでした。</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>数量範囲</th>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>推奨箱</th>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>層別構成</th>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>1箱最大収容数</th>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>備考</th>
              </tr>
            </thead>
            <tbody>
              {extendedQuantityGroups.map((group) => {
                const isHighlighted =
                  selectedQuantity !== undefined &&
                  selectedQuantity >= group.start &&
                  selectedQuantity <= group.end;
                const rangeLabel = group.start === group.end ? `${group.start} 個` : `${group.start} ～ ${group.end} 個`;

                if (!group.plan || !group.box) {
                  return (
                    <tr
                      key={`${group.key}-${group.start}`}
                      style={{ background: isHighlighted ? '#ffebee' : undefined }}
                    >
                      <td style={{ border: '1px solid #ddd', padding: 8 }}>{rangeLabel}</td>
                      <td style={{ border: '1px solid #ddd', padding: 8 }}>該当する箱なし</td>
                      <td style={{ border: '1px solid #ddd', padding: 8 }}>-</td>
                      <td style={{ border: '1px solid #ddd', padding: 8 }}>-</td>
                      <td style={{ border: '1px solid #ddd', padding: 8 }}>拡張ロジックでも適合しませんでした。</td>
                    </tr>
                  );
                }

                const { plan, box } = group;
                const voidRatio = `${Math.round(plan.voidRatio * 1000) / 10}%`;
                const layerSummary = plan.layers
                  .map((layer, index) => `第${index + 1}層: ${describeExtendedLayer(layer)} / ${layer.perLayerCapacity} 個`)
                  .join('\n');

                return (
                  <tr
                    key={`${group.key}-${group.start}`}
                    style={{ background: isHighlighted ? '#e3f2fd' : undefined }}
                  >
                    <td style={{ border: '1px solid #ddd', padding: 8 }}>{rangeLabel}</td>
                    <td style={{ border: '1px solid #ddd', padding: 8 }}>
                      <div>箱ID {plan.boxId}</div>
                      <div style={{ fontSize: 12, color: '#555' }}>
                        内寸: {box.inner.W} × {box.inner.D} × {box.inner.H} mm
                      </div>
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: 8, whiteSpace: 'pre-wrap', fontSize: 12 }}>
                      {layerSummary}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: 8 }}>{plan.totalCapacity} 個</td>
                    <td style={{ border: '1px solid #ddd', padding: 8 }}>
                      <div>空隙率: {voidRatio}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
