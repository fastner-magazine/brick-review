'use client';

import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import {
  chooseBoxesForQuantity,
  chooseBoxesForQuantityExtended,
  ShipmentPlan,
  ExtendedShipmentPlan,
  Sku,
  EPSILON,
  chooseBoxMultiSkuExtended,
  chooseBoxesForMultiSku,
  chooseBoxesForMultiSkuExtended,
  enableCalculationLogging,
  getCalculationLogs,
  clearCalculationLogs,
} from '@/lib/box-calculator';
import { useEffect, useMemo, useState, Suspense } from 'react';
// unused legacy types from ../../../types/result were removed
import {
  resolveSetting,
  resolveOptionalSetting,
  parseEntriesParam,
  normalizeBoxesInput,
  formatVoidRatio,
  describeLayerColumns,
  describeLayerType,
} from '@/lib/resultHelpers';
import { useBoxes, useGeneralSettings, useSkuOverrides } from '@/lib/useFirestore';
import SingleSkuResultSection from '@/components/result/SingleSkuResultSection';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import ArrangementDiagram from '@/components/result/ArrangementDiagram';
import ArrangementIsometricCommon from '@/components/result/ArrangementIsometricCommon';
import ArrangementDiagramExtended from '@/components/result/ArrangementDiagramExtended';



// SKUごとの色を定義（グローバル） - lib/arrangementCalculators.tsxから統一
// const SKU_COLORS = ['#00bcd4', '#ff9800', '#4caf50', '#e91e63', '#9c27b0', '#3f51b5'];

type OrientationMode = 'auto' | 'vertical' | 'stacked' | 'flat';

export default function Result() {
  return (
    <Suspense fallback={<div style={{ padding: '20px' }}>データを読み込み中...</div>}>
      <ResultInner />
    </Suspense>
  );
}

function ResultInner() {
  const { boxes: firestoreBoxes, loading: boxesLoading, reload: reloadBoxes } = useBoxes();
  const { settings: firestoreSettings, loading: settingsLoading, reload: reloadSettings } = useGeneralSettings();
  const { overrides: firestoreOverrides, loading: overridesLoading, reload: reloadOverrides } = useSkuOverrides();

  const [selectedBoxId, setSelectedBoxId] = useState<string>('');
  const [boxPadding, setBoxPadding] = useState<number>(0); // 箱側パディング(mm)
  const [selectedMultiSkuExtendedLayers, setSelectedMultiSkuExtendedLayers] = useState<number[]>([]);
  const [selectedMultiSkuStandardLayers, setSelectedMultiSkuStandardLayers] = useState<number[]>([]);
  const [selectedMultiSkuSingleBoxLayers, setSelectedMultiSkuSingleBoxLayers] = useState<number[]>([]);
  const [arrangementTab, setArrangementTab] = useState<'standard' | 'extended' | 'single-box'>('standard');
  // SKUごとの向きモード管理
  const [skuOrientationOverrides, setSkuOrientationOverrides] = useState<Map<number, OrientationMode>>(new Map());
  const [calculationLogs, setCalculationLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState<boolean>(false);
  const [windowWidth, setWindowWidth] = useState<number>(1024); // デフォルト値を固定してhydrationエラーを防ぐ
  const router = useRouter();
  const searchParams = useSearchParams();

  const [forceShow, setForceShow] = useState(false);

  // マルチSKU表示用のニュートラルSKU（拡張図でMargin/Gapの影響を避ける）
  const neutralSku: Sku = useMemo(() => ({
    dims: { w: 1, d: 1, h: 1 },
    keepUpright: false,
    sideMargin: 0,
    frontMargin: 0,
    topMargin: 0,
    gapXY: 0,
    gapZ: 0,
  }), []);

  // クライアント側であることを確認
  useEffect(() => {
    setWindowWidth(window.innerWidth);
  }, []);

  // レスポンシブなスタイル値を計算（windowWidthが変わったときのみ再計算）
  const responsiveStyles = useMemo(() => {
    const isMobile = windowWidth < 768;
    const isTablet = windowWidth >= 768 && windowWidth < 1024;

    return {
      padding: isMobile ? '8px' : isTablet ? '16px' : '24px',
      maxWidth: isMobile ? '100%' : isTablet ? '900px' : '1400px',
    };
  }, [windowWidth]);

  // クエリパラメータを取得
  const query = useMemo(() => {
    const params: Record<string, string | string[]> = {};
    const sp = searchParams ?? new URLSearchParams();
    sp.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }, [searchParams]);

  // Firestoreから取得したデータをRawBox形式に変換
  const boxes = useMemo(() => {
    return firestoreBoxes.map(box => ({
      id: box.id,
      name: `箱${box.id}`,
      W: box.inner.W,
      D: box.inner.D,
      H: box.inner.H,
      maxWeightKg: box.maxWeightKg,
      boxWeightKg: box.boxWeightKg,
    }));
  }, [firestoreBoxes]);

  // ウィンドウサイズの監視
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 箱側パディングの初期値をFirestore設定から取得
  useEffect(() => {
    if (firestoreSettings?.defaultBoxPadding !== undefined) {
      setBoxPadding(firestoreSettings.defaultBoxPadding);
    }
  }, [firestoreSettings]);

  const normalizedBoxes = useMemo(() => normalizeBoxesInput(boxes), [boxes]);

  // 各種設定をFirestoreから読み込む
  const generalSettings = useMemo(() => {
    return firestoreSettings || null;
  }, [firestoreSettings]);

  const skuOverrides = useMemo(() => {
    return firestoreOverrides || [];
  }, [firestoreOverrides]);

  // 複数SKUエントリをパース
  const multiSkuEntries = useMemo(() => {
    // URLのentriesパラメータをチェック（後方互換性のため）
    const entriesParam = query.entries as string | undefined;
    if (entriesParam) {
      return parseEntriesParam(entriesParam);
    }

    // session storageから読み込み
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('calculationEntries');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      } catch (err) {
        // session storage読み込みエラーは無視（開発時のみ表示）
        if (process.env.NODE_ENV === 'development') {
          console.warn('Failed to load calculation entries from session storage', err);
        }
      }
    }

    // データがない場合は空配列
    return [];
  }, [query]);

  // デバッグ: 箱のデータを確認（開発時のみ）



  // 各SKUの計算結果
  const skuResults = useMemo(() => {
    // 箱が設定されていない場合は計算をスキップ
    if (normalizedBoxes.length === 0) {
      return [];
    }

    const targetBoxId = selectedBoxId ? Number(selectedBoxId) : undefined;
    return multiSkuEntries.map((entry, index) => {
      const orientationMode = skuOrientationOverrides.get(index) || 'auto';

      // 各モードに基づき向き制御を決定
      let keepUpright = entry.keepUpright ?? false;
      let preferVertical = entry.preferVertical ?? false;
      const prefersStacking = orientationMode === 'stacked';

      if (orientationMode === 'flat') {
        keepUpright = true;
        preferVertical = false;
      } else if (orientationMode === 'vertical') {
        keepUpright = false;
        preferVertical = true;
      } else if (orientationMode === 'stacked') {
        keepUpright = false;
        preferVertical = true;
      }

      const sku: Sku = {
        dims: entry.dims,
        keepUpright,
        preferVertical,
        sideMargin: resolveSetting(entry.sideMargin, entry.skuId ? skuOverrides.find(o => o.skuId === entry.skuId)?.sideMargin : undefined, generalSettings?.defaultSideMargin, 0),
        frontMargin: resolveSetting(entry.frontMargin, entry.skuId ? skuOverrides.find(o => o.skuId === entry.skuId)?.frontMargin : undefined, generalSettings?.defaultFrontMargin, 0),
        topMargin: resolveSetting(entry.topMargin, entry.skuId ? skuOverrides.find(o => o.skuId === entry.skuId)?.topMargin : undefined, generalSettings?.defaultTopMargin, 0),
        gapXY: resolveSetting(entry.gapXY, entry.skuId ? skuOverrides.find(o => o.skuId === entry.skuId)?.gapXY : undefined, generalSettings?.defaultGapXY, 0),
        gapZ: resolveSetting(entry.gapZ, entry.skuId ? skuOverrides.find(o => o.skuId === entry.skuId)?.gapZ : undefined, generalSettings?.defaultGapZ, 0),
        maxStackLayers: resolveOptionalSetting(entry.maxStackLayers, entry.skuId ? skuOverrides.find(o => o.skuId === entry.skuId)?.maxStackLayers : undefined, generalSettings?.defaultMaxStackLayers),
        unitWeightKg: entry.unitWeightKg,
      };

      const calculationResult = chooseBoxesForQuantity(normalizedBoxes, sku, entry.quantity, { boxId: targetBoxId, boxPadding, allowPartial: true });
      const extendedCalculationResult = chooseBoxesForQuantityExtended(normalizedBoxes, sku, entry.quantity, { boxId: targetBoxId, boxPadding });

      // 1箱詰め用の計算: 箱サイズを大きい順にソートして、全量が入る最小の箱を見つける
      const singleBoxResult = (() => {
        // 箱を大きい順にソート
        const sortedBoxes = [...normalizedBoxes].sort((a, b) => {
          const volA = a.inner.W * a.inner.D * a.inner.H;
          const volB = b.inner.W * b.inner.D * b.inner.H;
          return volB - volA; // 大きい順
        });

        // 各箱で全量が入るか試す
        for (const box of sortedBoxes) {
          const result = chooseBoxesForQuantity([box], sku, entry.quantity, { boxPadding, allowPartial: false });
          if (result.shipments.length > 0 && result.leftover === 0) {
            return result;
          }
        }

        // どの箱にも入らない場合は空
        return { shipments: [], leftover: entry.quantity };
      })();

      return {
        entry,
        sku,
        calculationResult,
        extendedCalculationResult,
        singleBoxResult,
        orientationMode,
        prefersStacking,
      };
    });
  }, [multiSkuEntries, normalizedBoxes, selectedBoxId, boxPadding, skuOverrides, generalSettings, skuOrientationOverrides]);

  // 全体の統計
  const overallStats = useMemo(() => {
    let totalQuantity = 0;
    let totalBoxes = 0;
    let totalLeftover = 0;
    for (const result of skuResults) {
      if (result.calculationResult) {
        totalQuantity += result.entry.quantity;
        totalBoxes += result.calculationResult.shipments.length;
        totalLeftover += result.calculationResult.leftover;
      }
    }
    return { totalQuantity, totalBoxes, totalLeftover };
  }, [skuResults]);

  const combinedTotalQuantity = useMemo(() => {
    return multiSkuEntries.reduce((sum, entry) => sum + entry.quantity, 0);
  }, [multiSkuEntries]);

  // 複数SKUをまとめて入れる計算結果
  const multiSkuCalculation = useMemo(() => {
    // 箱が設定されていない場合は計算をスキップ
    if (normalizedBoxes.length === 0) {
      return {
        result: null as null | {
          standard?: { shipments: ShipmentPlan[]; leftover: number; totalQuantity: number };
          extended?: { shipments: ExtendedShipmentPlan[]; leftover: number; totalQuantity: number };
          singleBox?: {
            shipments: ExtendedShipmentPlan[];
            leftover: number;
            totalQuantity: number;
            variantLabel: string;
          };
        },
        logs: [] as string[],
      };
    }

    if (multiSkuEntries.length <= 1) {
      return {
        result: null,
        logs: [] as string[],
      };
    }
    if (skuResults.length !== multiSkuEntries.length) {
      return {
        result: null,
        logs: [] as string[],
      };
    }

    const shouldCaptureLogs = showLogs;
    if (shouldCaptureLogs) {
      enableCalculationLogging(true);
      clearCalculationLogs();
    } else {
      enableCalculationLogging(false);
      clearCalculationLogs();
    }

    type SingleBoxOption = {
      shipments: ExtendedShipmentPlan[];
      leftover: number;
      totalQuantity: number;
      variantLabel: string;
    };

    type MultiSkuCalcResult = {
      standard?: { shipments: ShipmentPlan[]; leftover: number; totalQuantity: number };
      extended?: { shipments: ExtendedShipmentPlan[]; leftover: number; totalQuantity: number };
      singleBox?: SingleBoxOption;
      fallbackMode?: string;
    };

    const quantities = multiSkuEntries.map((entry) => entry.quantity);
    const targetBoxId = selectedBoxId ? Number(selectedBoxId) : undefined;

    const computeResultForSkus = (skusForCalc: Sku[], variantLabel: string): MultiSkuCalcResult => {
      const calc: MultiSkuCalcResult = {};

      const standardRes = chooseBoxesForMultiSku(normalizedBoxes, skusForCalc, quantities, {
        boxId: targetBoxId,
        boxPadding,
      });
      calc.standard = { ...standardRes, totalQuantity: combinedTotalQuantity };

      const extendedRes = chooseBoxesForMultiSkuExtended(normalizedBoxes, skusForCalc, quantities, {
        boxId: targetBoxId,
        boxPadding,
      });
      calc.extended = { ...extendedRes, totalQuantity: combinedTotalQuantity };

      const singleBoxPlan = chooseBoxMultiSkuExtended(
        normalizedBoxes,
        skusForCalc,
        quantities,
        targetBoxId,
        boxPadding
      );
      if (singleBoxPlan) {
        calc.singleBox = {
          shipments: [{ plan: singleBoxPlan, quantity: combinedTotalQuantity }],
          leftover: 0,
          totalQuantity: combinedTotalQuantity,
          variantLabel,
        };
      } else {
        calc.singleBox = {
          shipments: [],
          leftover: combinedTotalQuantity,
          totalQuantity: combinedTotalQuantity,
          variantLabel,
        };
      }

      return calc;
    };

    const boxVolumeCache = new Map<number, number>();
    const getBoxVolume = (boxId: number) => {
      if (boxVolumeCache.has(boxId)) {
        return boxVolumeCache.get(boxId)!;
      }
      const boxInfo = normalizedBoxes.find((b) => b.id === boxId);
      const volume = boxInfo ? boxInfo.inner.W * boxInfo.inner.D * boxInfo.inner.H : Number.POSITIVE_INFINITY;
      boxVolumeCache.set(boxId, volume);
      return volume;
    };

    const computeMinBoxVolume = (calc: MultiSkuCalcResult) => {
      let minVolume = Number.POSITIVE_INFINITY;
      if (calc.standard) {
        for (const shipment of calc.standard.shipments) {
          const plan = (shipment as any).multiSkuPlan ?? shipment.plan;
          if (plan?.boxId !== undefined) {
            minVolume = Math.min(minVolume, getBoxVolume(plan.boxId));
          }
        }
      }
      if (calc.extended) {
        for (const shipment of calc.extended.shipments) {
          const plan = shipment.plan;
          if (plan?.boxId !== undefined) {
            minVolume = Math.min(minVolume, getBoxVolume(plan.boxId));
          }
        }
      }
      return minVolume;
    };

    const evaluateScore = (calc: MultiSkuCalcResult) => {
      const standardLeftover = calc.standard ? calc.standard.leftover : Number.POSITIVE_INFINITY;
      const extendedLeftover = calc.extended ? calc.extended.leftover : Number.POSITIVE_INFINITY;
      const minLeftover = Math.min(standardLeftover, extendedLeftover);

      const standardShipments = calc.standard ? calc.standard.shipments.length : Number.POSITIVE_INFINITY;
      const extendedShipments = calc.extended ? calc.extended.shipments.length : Number.POSITIVE_INFINITY;
      const minShipments = Math.min(standardShipments, extendedShipments);

      const minBoxVolume = computeMinBoxVolume(calc);

      return { minLeftover, minShipments, minBoxVolume };
    };

    const pickBetterSingleBox = (
      current: SingleBoxOption | undefined,
      candidate: SingleBoxOption | undefined
    ): SingleBoxOption | undefined => {
      if (!candidate || candidate.leftover > 0 || candidate.shipments.length === 0) {
        return current;
      }
      if (!current || current.leftover > 0 || current.shipments.length === 0) {
        return candidate;
      }
      const currentPlan = current.shipments[0]?.plan;
      const candidatePlan = candidate.shipments[0]?.plan;
      if (!currentPlan || !candidatePlan) return current;

      const currentVolume = getBoxVolume(currentPlan.boxId);
      const candidateVolume = getBoxVolume(candidatePlan.boxId);
      if (candidateVolume + EPSILON < currentVolume) {
        return candidate;
      }
      if (Math.abs(candidateVolume - currentVolume) <= EPSILON) {
        if (candidatePlan.voidRatio + EPSILON < currentPlan.voidRatio) {
          return candidate;
        }
        if (Math.abs(candidatePlan.voidRatio - currentPlan.voidRatio) <= EPSILON) {
          if (candidatePlan.boxId < currentPlan.boxId) {
            return candidate;
          }
        }
      }
      return current;
    };
    const baseSkus = skuResults.map((result) => result.sku);
    const baseResult = computeResultForSkus(baseSkus, 'base');
    const baseScore = evaluateScore(baseResult);

    let finalResult: MultiSkuCalcResult = { ...baseResult, fallbackMode: 'base' };
    let finalScore = baseScore;
    let bestSingleBox = baseResult.singleBox;


    const autoIndices = skuResults.reduce<number[]>((acc, info, idx) => {
      if (info.orientationMode === 'auto') acc.push(idx);
      return acc;
    }, []);
    const stackedIndices = skuResults.reduce<number[]>((acc, info, idx) => {
      if (info.prefersStacking) acc.push(idx);
      return acc;
    }, []);

    if (autoIndices.length > 0 || stackedIndices.length > 0) {
      type VariantDescriptor = { label: string; indices: number[] };
      const variants: VariantDescriptor[] = [];
      const seen = new Set<string>();

      const addVariant = (label: string, indices: number[]) => {
        if (indices.length === 0) return;
        const sorted = [...indices].sort((a, b) => a - b);
        const key = sorted.join(',');
        if (seen.has(key)) return;
        seen.add(key);
        variants.push({ label, indices: sorted });
      };

      if (autoIndices.length > 0) {
        addVariant('vertical-all-auto', autoIndices);
        autoIndices.forEach((idx) => {
          addVariant(`vertical-auto-${idx}`, [idx]);
        });

        if (autoIndices.length <= 3) {
          for (let i = 0; i < autoIndices.length; i += 1) {
            for (let j = i + 1; j < autoIndices.length; j += 1) {
              addVariant(`vertical-auto-${autoIndices[i]}-${autoIndices[j]}`, [autoIndices[i], autoIndices[j]]);
            }
          }
          if (autoIndices.length === 3) {
            addVariant(`vertical-auto-${autoIndices.join('-')}`, [autoIndices[0], autoIndices[1], autoIndices[2]]);
          }
        }
      }

      const applyVariant = (label: string, indices: number[]) => {
        if (indices.length === 0 && stackedIndices.length === 0) return;
        const indicesSet = new Set<number>([...indices, ...stackedIndices]);
        const variantSkus = baseSkus.map((sku, idx) => {
          if (autoIndices.includes(idx)) {
            return { ...sku, preferVertical: indicesSet.has(idx) };
          }
          if (stackedIndices.includes(idx)) {
            return { ...sku, preferVertical: true };
          }
          return sku;
        });

        const variantResult = computeResultForSkus(variantSkus, label);
        const variantScore = evaluateScore(variantResult);
        bestSingleBox = pickBetterSingleBox(bestSingleBox, variantResult.singleBox);

        const isBetter =
          variantScore.minLeftover < finalScore.minLeftover ||
          (variantScore.minLeftover === finalScore.minLeftover &&
            variantScore.minShipments < finalScore.minShipments) ||
          (variantScore.minLeftover === finalScore.minLeftover &&
            variantScore.minShipments === finalScore.minShipments &&
            variantScore.minBoxVolume < finalScore.minBoxVolume);

        if (isBetter) {
          finalResult = { ...variantResult, fallbackMode: label };
          finalScore = variantScore;
        }
      };

      if (stackedIndices.length > 0) {
        applyVariant('vertical-stacked-base', []);
      }

      for (const variant of variants) {
        applyVariant(variant.label, variant.indices);
      }
    }

    const mergedSingleBox = pickBetterSingleBox(bestSingleBox, finalResult.singleBox);
    if (mergedSingleBox) {
      finalResult = { ...finalResult, singleBox: mergedSingleBox };
    } else if (bestSingleBox || finalResult.singleBox) {
      finalResult = { ...finalResult, singleBox: bestSingleBox ?? finalResult.singleBox };
    }

    const logs = shouldCaptureLogs ? getCalculationLogs() : [];
    if (shouldCaptureLogs) {
      enableCalculationLogging(false);
    }

    return { result: finalResult, logs };
  }, [multiSkuEntries, skuResults, selectedBoxId, normalizedBoxes, boxPadding, combinedTotalQuantity, showLogs]);

  useEffect(() => {
    const logs = multiSkuCalculation.logs ?? [];
    setCalculationLogs((prev) => {
      if (prev.length === logs.length && prev.every((value, index) => value === logs[index])) {
        return prev;
      }
      return logs;
    });
  }, [multiSkuCalculation.logs]);

  const standardShipmentsKey = useMemo(() => {
    const shipments = multiSkuCalculation.result?.standard?.shipments;
    if (!shipments || shipments.length === 0) return 'none';
    return shipments
      .map((shipment) => {
        const planForKey = shipment.multiSkuPlan ?? shipment.plan;
        const capacity = 'totalCapacity' in planForKey ? planForKey.totalCapacity : planForKey.capacity;
        const voidRatio = 'voidRatio' in planForKey ? planForKey.voidRatio : shipment.plan.voidRatio;
        return `${planForKey.boxId}:${shipment.quantity}:${capacity}:${voidRatio}`;
      })
      .join('|');
  }, [multiSkuCalculation.result?.standard]);

  useEffect(() => {
    const shipments = multiSkuCalculation.result?.standard?.shipments;
    if (!shipments || shipments.length === 0) {
      if (selectedMultiSkuStandardLayers.length > 0) {
        setSelectedMultiSkuStandardLayers([]);
      }
      return;
    }
    setSelectedMultiSkuStandardLayers(Array(shipments.length).fill(0));
  }, [standardShipmentsKey, multiSkuCalculation.result?.standard?.shipments, selectedMultiSkuStandardLayers.length]);

  const extendedShipmentsKey = useMemo(() => {
    const shipments = multiSkuCalculation.result?.extended?.shipments;
    if (!shipments || shipments.length === 0) return 'none';
    return shipments
      .map((shipment) => `${shipment.plan.boxId}:${shipment.quantity}:${shipment.plan.totalCapacity}:${shipment.plan.voidRatio}`)
      .join('|');
  }, [multiSkuCalculation.result?.extended]);

  useEffect(() => {
    const shipments = multiSkuCalculation.result?.extended?.shipments;
    if (!shipments || shipments.length === 0) {
      if (selectedMultiSkuExtendedLayers.length > 0) {
        setSelectedMultiSkuExtendedLayers([]);
      }
      return;
    }
    setSelectedMultiSkuExtendedLayers(Array(shipments.length).fill(0));
  }, [extendedShipmentsKey, multiSkuCalculation.result?.extended?.shipments, selectedMultiSkuExtendedLayers.length]);

  const singleBoxShipmentsKey = useMemo(() => {
    const shipments = multiSkuCalculation.result?.singleBox?.shipments;
    if (!shipments || shipments.length === 0) return 'none';
    return shipments
      .map((shipment) => `${shipment.plan.boxId}:${shipment.quantity}:${shipment.plan.totalCapacity}:${shipment.plan.voidRatio}`)
      .join('|');
  }, [multiSkuCalculation.result?.singleBox]);

  useEffect(() => {
    const shipments = multiSkuCalculation.result?.singleBox?.shipments;
    if (!shipments || shipments.length === 0) {
      if (selectedMultiSkuSingleBoxLayers.length > 0) {
        setSelectedMultiSkuSingleBoxLayers([]);
      }
      return;
    }
    setSelectedMultiSkuSingleBoxLayers(Array(shipments.length).fill(0));
  }, [singleBoxShipmentsKey, multiSkuCalculation.result?.singleBox?.shipments, selectedMultiSkuSingleBoxLayers.length]);

  const multiSkuResult = multiSkuCalculation.result;

  const multiFitsAll = Boolean(
    (multiSkuResult?.standard && multiSkuResult.standard.leftover === 0) ||
    (multiSkuResult?.extended && multiSkuResult.extended.leftover === 0) ||
    (multiSkuResult?.singleBox && multiSkuResult.singleBox.leftover === 0)
  );

  const handleToggleSkuOrientation = (skuIndex: number) => {
    setSkuOrientationOverrides(prev => {
      const updated = new Map(prev);
      const currentMode: OrientationMode = prev.get(skuIndex) || 'auto';

      // auto -> vertical -> stacked -> flat -> auto
      let nextMode: OrientationMode;
      if (currentMode === 'auto') {
        nextMode = 'vertical';
      } else if (currentMode === 'vertical') {
        nextMode = 'stacked';
      } else if (currentMode === 'stacked') {
        nextMode = 'flat';
      } else {
        nextMode = 'auto';
      }

      updated.set(skuIndex, nextMode);
      return updated;
    });
  };

  // データロード中の表示
  if ((boxesLoading || settingsLoading || overridesLoading) && !forceShow) {
    return (
      <div style={{
        padding: responsiveStyles.padding,
        maxWidth: responsiveStyles.maxWidth,
        margin: '0 auto',
        background: '#f5f7fa',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Card className="max-w-md mx-auto">
          <CardContent className="text-center p-8">
            <div className="text-5xl mb-4">⏳</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              データを読み込み中...
            </h1>
            <p className="text-gray-600">
              Firestoreからデータを取得しています。
            </p>
            <div className="mt-6 flex gap-3 justify-center">
              <Button variant="outline" onClick={() => router.back()}>戻る</Button>
              <Button variant="outline" onClick={() => { if (reloadBoxes) reloadBoxes(); if (reloadSettings) reloadSettings(); if (reloadOverrides) reloadOverrides(); }}>再読み込み</Button>
              <Button variant="gradient" onClick={() => setForceShow(true)}>強制表示</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (normalizedBoxes.length === 0) {
    return (
      <div style={{
        padding: responsiveStyles.padding,
        maxWidth: responsiveStyles.maxWidth,
        margin: '0 auto',
        background: '#f5f7fa',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Card className="max-w-md mx-auto">
          <CardContent className="text-center p-8">
            <div className="text-5xl mb-4">📦</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              箱情報が設定されていません
            </h1>
            <p className="text-gray-600 mb-6">
              計算を開始するには、まず箱情報を設定してください。
            </p>
            <Button onClick={() => router.push('/calculator/box-settings')}>
              箱情報設定ページへ
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (multiSkuEntries.length === 0) {
    return (
      <div style={{
        padding: responsiveStyles.padding,
        maxWidth: responsiveStyles.maxWidth,
        margin: '0 auto',
        background: '#f5f7fa',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Card className="max-w-md mx-auto">
          <CardContent className="text-center p-8">
            <div className="text-5xl mb-4">🔎</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              選択してください
            </h1>
            <p className="text-gray-600 mb-4">
              SKUや数量が指定されていません。リストからSKUを選択するか、数量入力ページでエントリを作成してください。
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => router.push('/calculator/quantity-plan')}>数量入力ページへ</Button>
              <Button variant="gradient" onClick={() => router.push('/calculator/sku-settings')}>SKU選択ページへ</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div style={{
      padding: responsiveStyles.padding,
      maxWidth: responsiveStyles.maxWidth,
      margin: '0 auto',
      background: '#f5f7fa',
      minHeight: '100vh',
    }}>
      <Button variant="outline" onClick={() => router.push('/calculator')} className="mb-3">
        トップへ戻る
      </Button>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            📦 段ボール計算結果
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 rounded-lg p-3 border">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex-1 min-w-72">
                <label htmlFor="box-select" className="block text-xs font-semibold text-gray-700 mb-1.5">
                  🎯 箱を指定して判定
                </label>
                <select
                  id="box-select"
                  value={selectedBoxId}
                  onChange={(e) => setSelectedBoxId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white cursor-pointer outline-none transition-all"
                >
                  <option value="">自動選択（最適な箱を探す）</option>
                  {normalizedBoxes.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      ID {b.id}: {b.inner.W} × {b.inner.D} × {b.inner.H} mm
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-52">
                <label htmlFor="box-padding" className="block text-xs font-semibold text-gray-700 mb-1.5">
                  📏 箱側パディング
                </label>
                <div className="flex items-center gap-2 min-w-28">
                  <input
                    type="number"
                    id="box-padding"
                    min={0}
                    value={boxPadding}
                    onChange={(e) => setBoxPadding(Number(e.target.value) || 0)}
                    className="flex-1 px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm outline-none transition-all"
                  />
                  <span className="text-sm text-gray-600 font-medium">mm</span>
                </div>
              </div>
            </div>

            {/* 箱指定時のクイックアクセス */}
            {selectedBoxId && (
              <>
                <Separator className="my-4" />
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-2">
                    🔄 他の箱サイズで試す
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {normalizedBoxes
                      .filter(b => String(b.id) !== selectedBoxId)
                      .map((b) => (
                        <Button
                          key={b.id}
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedBoxId(String(b.id))}
                        >
                          ID {b.id}: {b.inner.W}×{b.inner.D}×{b.inner.H}
                        </Button>
                      ))}
                    <Button
                      variant="gradient"
                      size="sm"
                      onClick={() => setSelectedBoxId('')}
                    >
                      自動選択に戻す
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 合計商品数・使用段ボール数の表示は省略します。未収容（leftover）のみ該当箇所で表示されます。 */}

      {multiSkuResult && arrangementTab === 'standard' && multiSkuResult.standard && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>複数SKUをまとめて入れる計算結果</CardTitle>
          </CardHeader>
          <CardContent>
            {/* 複数SKUの合計表示は非表示にしました（箱ごとの詳細は下に表示されます） */}
            {multiSkuResult.standard.shipments.map((shipment, index) => {
              const box = normalizedBoxes.find((b) => b.id === shipment.plan.boxId);

              return (
                <div key={`multi-sku-${shipment.plan.boxId}-${index}`} className="mb-4 p-3 border rounded-lg">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    箱ID <span className="text-blue-600 text-xl">{shipment.plan.boxId}</span> <span className="text-sm font-medium text-gray-500">({index + 1}箱目)</span> × {shipment.quantity} 個
                  </h3>
                  {box && (
                    <p className="text-xs mb-1">
                      内寸: {box.inner.W} × {box.inner.D} × {box.inner.H} mm
                    </p>
                  )}
                  <p className="text-xs mb-1">
                    空隙率: <strong>{formatVoidRatio(shipment.plan.voidRatio)}</strong>
                  </p>
                  {box && (
                    <div className="mt-3">
                      {('multiSkuPlan' in shipment && (shipment as any).multiSkuPlan) ? (
                        <>
                          <ArrangementDiagramExtended
                            plan={(shipment as any).multiSkuPlan}
                            quantity={shipment.quantity}
                            sku={neutralSku}
                            boxPadding={boxPadding}
                            boxInner={box.inner}
                            selectedLayer={selectedMultiSkuStandardLayers[index] ?? 0}
                            totalLayers={(shipment as any).multiSkuPlan.layers.length}
                            onLayerChange={(newLayer) => {
                              setSelectedMultiSkuStandardLayers((prev) => {
                                const copy = [...prev];
                                copy[index] = newLayer;
                                return copy;
                              });
                            }}
                          />
                          <ArrangementIsometricCommon
                            plan={(shipment as any).multiSkuPlan}
                            quantity={shipment.quantity}
                            sku={neutralSku}
                            boxPadding={boxPadding}
                            boxInner={box.inner}
                            isExtended
                          />
                        </>
                      ) : (
                        <>
                          <ArrangementDiagram
                            plan={shipment.plan}
                            quantity={shipment.quantity}
                            sku={neutralSku}
                            boxPadding={boxPadding}
                            boxInner={box.inner}
                            selectedLayer={selectedMultiSkuStandardLayers[index] ?? 0}
                            totalLayers={shipment.plan.layers}
                            onLayerChange={(newLayer) => {
                              setSelectedMultiSkuStandardLayers((prev) => {
                                const copy = [...prev];
                                copy[index] = newLayer;
                                return copy;
                              });
                            }}
                          />
                          <ArrangementIsometricCommon
                            plan={shipment.plan}
                            quantity={shipment.quantity}
                            sku={neutralSku}
                            boxPadding={boxPadding}
                            boxInner={box.inner}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {multiSkuResult.standard.leftover > 0 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-red-700 mt-3">
                上記の段ボールでは {multiSkuResult.standard.leftover} 個を収容できませんでした。この箱では全量を収容できません。
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {multiSkuResult && arrangementTab === 'single-box' && multiSkuResult.singleBox && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>複数SKUを1箱にまとめる計算結果</CardTitle>
          </CardHeader>
          <CardContent>
            {multiSkuResult.singleBox.shipments.length > 0 ? (
              <>
                <div className="text-xs text-gray-500 mb-3">
                  算出モード: {(() => {
                    const label = multiSkuResult.singleBox?.variantLabel ?? 'base';
                    if (label === 'base') return '標準設定';
                    if (label === 'vertical-stacked-base') return '多段積み優先';
                    if (label.startsWith('vertical-all-auto')) return '全SKU縦優先';
                    if (label.startsWith('vertical-auto-')) return `SKU調整 (${label.replace('vertical-auto-', '').split('-').map((v) => `#${Number(v) + 1}`).join(', ')})`;
                    return label;
                  })()}
                </div>
                {multiSkuResult.singleBox.shipments.map((shipment, index) => {
                  const box = normalizedBoxes.find((b) => b.id === shipment.plan.boxId);
                  return (
                    <div
                      key={`multi-singlebox-${shipment.plan.boxId}`}
                      className="border border-gray-200 rounded-lg p-4 mb-4 shadow-sm bg-white"
                    >
                      <h3 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                        <span>箱ID</span>
                        <span className="text-blue-600 text-xl">{shipment.plan.boxId}</span>
                        <span className="text-sm font-medium text-gray-500">（1箱案）</span>
                      </h3>
                      {box && (
                        <p className="text-xs mb-1">
                          内寸: {box.inner.W} × {box.inner.D} × {box.inner.H} mm
                        </p>
                      )}
                      <p className="text-xs mb-1">
                        空隙率: <strong>{formatVoidRatio(shipment.plan.voidRatio)}</strong>
                      </p>
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="border border-gray-300 p-2 text-left">層</th>
                            <th className="border border-gray-300 p-2 text-left">レイアウトタイプ</th>
                            <th className="border border-gray-300 p-2 text-left">配置内容</th>
                            <th className="border border-gray-300 p-2 text-left">1層あたり数量</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shipment.plan.layers.map((layer, layerIndex) => (
                            <tr key={`multi-singlebox-${shipment.plan.boxId}-layer-${layerIndex}`}>
                              <td className="border border-gray-300 p-2">第 {layerIndex + 1} 層</td>
                              <td className="border border-gray-300 p-2">{describeLayerType(layer)}</td>
                              <td className="border border-gray-300 p-2">{describeLayerColumns(layer)}</td>
                              <td className="border border-gray-300 p-2">{layer.perLayerCapacity} 個</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {box && (
                        <div className="mt-3">
                          <ArrangementDiagramExtended
                            plan={shipment.plan}
                            quantity={shipment.quantity}
                            sku={neutralSku}
                            boxPadding={boxPadding}
                            boxInner={box.inner}
                            selectedLayer={selectedMultiSkuSingleBoxLayers[index] ?? 0}
                            totalLayers={shipment.plan.layers.length}
                            onLayerChange={(newLayer) => {
                              setSelectedMultiSkuSingleBoxLayers((prev) => {
                                const copy = [...prev];
                                copy[index] = newLayer;
                                return copy;
                              });
                            }}
                          />
                          <ArrangementIsometricCommon
                            plan={shipment.plan}
                            quantity={shipment.quantity}
                            sku={neutralSku}
                            boxPadding={boxPadding}
                            boxInner={box.inner}
                            isExtended
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-red-700">
                1箱での収容案は見つかりませんでした。
              </div>
            )}
            {multiSkuResult.singleBox.leftover > 0 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-red-700 mt-3">
                1箱案でも {multiSkuResult.singleBox.leftover} 個を収容できませんでした。
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {multiSkuResult && arrangementTab === 'extended' && multiSkuResult.extended && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>複数SKUをまとめて入れる計算結果（拡張モード）</CardTitle>
          </CardHeader>
          <CardContent>
            {/* 複数SKU（拡張）の合計表示は非表示にしました */}
            {multiSkuResult.extended.shipments.map((shipment, index) => {
              const box = normalizedBoxes.find((b) => b.id === shipment.plan.boxId);

              return (
                <div key={`multi-sku-extended-${shipment.plan.boxId}-${index}`} className="mb-4 p-3 border rounded-lg">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    箱ID <span className="text-blue-600 text-xl">{shipment.plan.boxId}</span> <span className="text-sm font-medium text-gray-500">({index + 1}箱目)</span> × {shipment.quantity} 個（最大 {shipment.plan.totalCapacity} 個）
                  </h3>
                  {box && (
                    <p className="text-xs mb-1">
                      内寸: {box.inner.W} × {box.inner.D} × {box.inner.H} mm
                    </p>
                  )}
                  <p className="text-xs mb-1">
                    空隙率: <strong>{formatVoidRatio(shipment.plan.voidRatio)}</strong>
                  </p>
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-300 p-2 text-left">層</th>
                        <th className="border border-gray-300 p-2 text-left">レイアウトタイプ</th>
                        <th className="border border-gray-300 p-2 text-left">配置内容</th>
                        <th className="border border-gray-300 p-2 text-left">1層あたり数量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipment.plan.layers.map((layer, layerIndex) => (
                        <tr key={`multi-extended-${shipment.plan.boxId}-layer-${layerIndex}`}>
                          <td className="border border-gray-300 p-2">第 {layerIndex + 1} 層</td>
                          <td className="border border-gray-300 p-2">{describeLayerType(layer)}</td>
                          <td className="border border-gray-300 p-2">{describeLayerColumns(layer)}</td>
                          <td className="border border-gray-300 p-2">{layer.perLayerCapacity} 個</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {box && (
                    <div className="mt-3">
                      <ArrangementDiagramExtended
                        plan={shipment.plan}
                        quantity={shipment.quantity}
                        sku={neutralSku}
                        boxPadding={boxPadding}
                        boxInner={box.inner}
                        selectedLayer={selectedMultiSkuExtendedLayers[index] ?? 0}
                        totalLayers={shipment.plan.layers.length}
                        onLayerChange={(newLayer) => {
                          setSelectedMultiSkuExtendedLayers((prev) => {
                            const copy = [...prev];
                            copy[index] = newLayer;
                            return copy;
                          });
                        }}
                      />
                      <ArrangementIsometricCommon
                        plan={shipment.plan}
                        quantity={shipment.quantity}
                        sku={neutralSku}
                        boxPadding={boxPadding}
                        boxInner={box.inner}
                        isExtended
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {multiSkuResult.extended.leftover > 0 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-red-700 mt-3">
                上記の段ボールでは {multiSkuResult.extended.leftover} 個を収容できませんでした。この箱では全量を収容できません。
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {multiSkuEntries.length > 1 && arrangementTab === 'extended' && !multiSkuResult?.extended && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>複数SKUの拡張モード詰め合わせ</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-sm">
              合計 {combinedTotalQuantity} 個を対象にした拡張ロジックでの同梱計算は現在調整中です。
            </p>
            <p className="text-xs text-gray-600">
              標準モードでの組み合わせ結果を基に、拡張ロジック用の層構成を検証できるよう随時更新予定です。
            </p>
          </CardContent>
        </Card>
      )}

      {/* 表示モード切り替え */}
      <div className="mb-6">
        <div className="text-sm font-semibold text-gray-700 mb-2">
          🚆 表示モード（ルート選択）
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'standard' as const, label: '📊 通常ルート（複数箱OK）' },
            { id: 'single-box' as const, label: '🎯 1箱優先ルート' },
            { id: 'extended' as const, label: '🧪 拡張ルート' },
          ].map((tab) => {
            const isActive = arrangementTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setArrangementTab(tab.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-150 border ${isActive
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
                  }`}
                type="button"
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {!multiFitsAll && skuResults.map((result, index) => (
        <SingleSkuResultSection
          key={`${result.entry.skuId || 'custom'}-${index}`}
          sku={result.sku}
          quantity={result.entry.quantity}
          normalizedBoxes={normalizedBoxes}
          calculationResult={result.calculationResult}
          extendedCalculationResult={result.extendedCalculationResult}
          singleBoxResult={result.singleBoxResult}
          arrangementTab={arrangementTab}
          selectedBoxId={selectedBoxId}
          boxPadding={boxPadding}
          onResetSelectedBox={() => setSelectedBoxId('')}
          skuLabel={result.entry.name || `商品 ${index + 1}`}
          skuIndex={multiSkuEntries.length > 1 ? index : undefined}
          onToggleOrientation={multiSkuEntries.length > 1 ? handleToggleSkuOrientation : undefined}
          orientationMode={result.orientationMode}
          packagingMaterialWeightMultiplier={generalSettings?.packagingMaterialWeightMultiplier ?? 0.01}
          windowWidth={windowWidth}
        />
      ))}

      {/* SKU向き設定 */}
      {multiSkuEntries.length > 1 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>🔄 SKUの向き設定</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {multiSkuEntries.map((entry, index) => {
                const result = skuResults[index];
                const orientationMode = result?.orientationMode || 'auto';

                const modeConfig: Record<OrientationMode, { label: string; color: string; bgColor: string; desc: string }> = {
                  auto: { label: '自動', color: '#3b82f6', bgColor: '#eff6ff', desc: '標準ロジック' },
                  vertical: { label: '縦優先', color: '#f59e0b', bgColor: '#fef3c7', desc: '縦向き固定' },
                  stacked: { label: '重ね優先', color: '#8b5cf6', bgColor: '#ede9fe', desc: '縦積み＋多段検証' },
                  flat: { label: '横固定', color: '#10b981', bgColor: '#d1fae5', desc: '横置き固定' },
                };

                const config = modeConfig[orientationMode];

                return (
                  <div key={`sku-orientation-${index}`} className="flex items-center gap-3 p-3.5 bg-gray-50 rounded-lg border">
                    <div className="flex-1">
                      <div className="font-semibold text-sm text-gray-900 mb-1">
                        {entry.name}
                      </div>
                      <div className="text-xs text-gray-600">
                        {entry.dims.w} × {entry.dims.d} × {entry.dims.h} mm ({entry.quantity}個)
                      </div>
                    </div>
                    <Button
                      onClick={() => handleToggleSkuOrientation(index)}
                      style={{ backgroundColor: config.color, color: '#fff' }}
                      className="min-w-24"
                    >
                      {config.label}
                    </Button>
                    <div className="px-3 py-1 rounded-lg text-xs font-medium min-w-20 text-center" style={{ backgroundColor: config.bgColor, color: config.color }}>
                      {config.desc}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3.5 text-xs text-gray-400">
              💡 クリックで切り替え: 自動配置 → 縦積み優先 → 平積み固定 → 自動配置...
            </div>
          </CardContent>
        </Card>
      )}

      {/* 計算ログ表示 */}
      {multiSkuEntries.length > 1 && (
        <Card className="mb-6">
          <CardHeader>
            <div
              className="flex items-center justify-between cursor-pointer select-none"
              onClick={() => setShowLogs(!showLogs)}
            >
              <CardTitle>📋 計算ログ</CardTitle>
              <div className="text-2xl text-gray-500 transition-transform" style={{ transform: showLogs ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                ▼
              </div>
            </div>
          </CardHeader>
          {showLogs && (
            <CardContent>
              <div className="bg-gray-50 border rounded-lg p-4 max-h-96 overflow-y-auto font-mono text-xs leading-relaxed">
                {calculationLogs.length === 0 ? (
                  <div className="text-gray-400 text-center py-4">
                    ログがありません
                  </div>
                ) : (
                  calculationLogs.map((log, index) => (
                    <div key={index} className={log.startsWith('[') ? 'text-blue-600' : 'text-gray-900'}>
                      {log}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          )}
          <div className="px-6 pb-4 text-xs text-gray-400">
            💡 クリックでログの表示/非表示を切り替えます
          </div>
        </Card>
      )}

      {overallStats.totalLeftover > 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-red-700">
          上記の段ボールでは {overallStats.totalLeftover} 個を収容できませんでした。この箱では全量を収容できません。
        </div>
      )}
    </div>
  );
}
