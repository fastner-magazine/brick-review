import type { Sku, ShipmentPlan, ExtendedPlan, LayerColumnPattern, Box } from './box-calculator';
import type { ArrangementOffsets, ArrangementGeometry, ExtendedItemPosition, TabGroup } from '../types/result';

// SKUごとの色を定義（グローバル）
export const SKU_COLOR_PALETTE = ['#00bcd4', '#ff9800', '#4caf50', '#e91e63', '#9c27b0', '#3f51b5'];

export const SKU_COLOR_SETS = [
  { front: '#00acc1', right: '#006064', top: '#4dd0e1' }, // 青系
  { front: '#ff9800', right: '#e65100', top: '#ffb74d' }, // オレンジ系
  { front: '#4caf50', right: '#1b5e20', top: '#81c784' }, // 緑系
  { front: '#e91e63', right: '#880e4f', top: '#f06292' }, // ピンク系
  { front: '#9c27b0', right: '#4a148c', top: '#ba68c8' }, // 紫系
  { front: '#3f51b5', right: '#1a237e', top: '#7986cb' }, // インディゴ系
];

export function groupShipments(shipments: ShipmentPlan[]): { tabGroups: TabGroup[]; totalBoxes: number } {
  const allPlans = shipments.map(({ plan, quantity }) => ({
    boxId: plan.boxId,
    plan,
    quantityPerBox: quantity,
    totalQuantity: quantity,
    boxCount: 1
  }));
  const tabGroups: TabGroup[] = [];
  let currentGroup: TabGroup | null = null;
  for (let index = 0; index < allPlans.length; index++) {
    const plan = allPlans[index];
    if (currentGroup && currentGroup.boxId === plan.boxId) {
      currentGroup.endIndex = index;
      currentGroup.plans.push(plan);
    } else {
      if (currentGroup) {
        tabGroups.push(currentGroup);
      }
      currentGroup = {
        startIndex: index,
        endIndex: index,
        boxId: plan.boxId,
        plans: [plan]
      };
    }
  }
  if (currentGroup) {
    tabGroups.push(currentGroup);
  }
  const totalBoxes = allPlans.length;
  return { tabGroups, totalBoxes };
}

export function computeArrangementOffsets(params: { plan: ShipmentPlan['plan']; sku: Sku; boxPadding: number; boxInner?: Box['inner'] }): ArrangementOffsets | null {
  const { plan, sku, boxPadding, boxInner } = params;
  if (!boxInner) return null;
  const [a, b, c] = plan.orientation;
  const gapXY = sku.gapXY ?? 0;
  const gapZ = sku.gapZ ?? 0;

  const usedWidth = plan.nx > 0 ? plan.nx * a + (plan.nx - 1) * gapXY : 0;
  const usedDepth = plan.ny > 0 ? plan.ny * b + (plan.ny - 1) * gapXY : 0;
  const usedHeight = plan.layers > 0 ? plan.layers * c + (plan.layers - 1) * gapZ : 0;

  console.log('[computeArrangementOffsets] 計算詳細:', {
    boxId: plan.boxId,
    orientation: plan.orientation,
    'a(orientation[0])': a,
    'b(orientation[1])': b,
    'c(orientation[2])': c,
    nx: plan.nx,
    ny: plan.ny,
    layers: plan.layers,
    gapXY,
    gapZ,
    '計算式_usedWidth': `${plan.nx} * ${a} + (${plan.nx} - 1) * ${gapXY} = ${usedWidth}`,
    usedWidth,
    '計算式_usedDepth': `${plan.ny} * ${b} + (${plan.ny} - 1) * ${gapXY} = ${usedDepth}`,
    usedDepth,
    '計算式_usedHeight': `${plan.layers} * ${c} + (${plan.layers} - 1) * ${gapZ} = ${usedHeight}`,
    usedHeight,
    'boxInner.W': boxInner.W,
    'boxInner.D': boxInner.D,
    'boxInner.H': boxInner.H,
    '適合チェック': {
      'usedWidth <= boxInner.W': `${usedWidth} <= ${boxInner.W} = ${usedWidth <= boxInner.W}`,
      'usedDepth <= boxInner.D': `${usedDepth} <= ${boxInner.D} = ${usedDepth <= boxInner.D}`,
      'usedHeight <= boxInner.H': `${usedHeight} <= ${boxInner.H} = ${usedHeight <= boxInner.H}`,
    }
  });

  const paddingX = sku.sideMargin + boxPadding;
  const paddingY = sku.frontMargin + boxPadding;
  const paddingZ = sku.topMargin + boxPadding;

  const leftoverWidth = Math.max(0, boxInner.W - 2 * paddingX - usedWidth);
  const leftoverDepth = Math.max(0, boxInner.D - 2 * paddingY - usedDepth);
  const leftoverHeight = Math.max(0, boxInner.H - 2 * paddingZ - usedHeight);

  return {
    offsetX: paddingX + leftoverWidth / 2,
    offsetY: paddingY + leftoverDepth / 2,
    offsetZ: paddingZ + leftoverHeight / 2,
    usedWidth,
    usedDepth,
    usedHeight,
  };
}

export function calculatePackedPositions(plan: ShipmentPlan['plan'], quantity: number): { layer: number; row: number; column: number; index: number }[] {
  const positions: { layer: number; row: number; column: number; index: number }[] = [];
  if (plan.nx <= 0 || plan.ny <= 0 || plan.layers <= 0 || quantity <= 0) return positions;

  const perLayer = plan.nx * plan.ny;
  const fullLayers = Math.floor(quantity / perLayer);
  const remainder = quantity % perLayer;

  let globalIndex = 0;

  for (let layer = 0; layer < plan.layers; layer++) {
    let itemsInLayer: number;
    if (layer < fullLayers) {
      itemsInLayer = perLayer;
    } else if (layer === fullLayers) {
      itemsInLayer = remainder;
    } else {
      continue;
    }

    if (itemsInLayer === 0) continue;

    const rowsNeeded = Math.ceil(itemsInLayer / plan.nx);
    const rowStart = Math.floor((plan.ny - rowsNeeded) / 2);

    let itemIndex = 0;
    for (let row = rowStart; row < rowStart + rowsNeeded && itemIndex < itemsInLayer; row++) {
      const colsInThisRow = Math.min(plan.nx, itemsInLayer - itemIndex);
      const colStart = Math.floor((plan.nx - colsInThisRow) / 2);

      for (let col = colStart; col < colStart + colsInThisRow && itemIndex < itemsInLayer; col++) {
        positions.push({
          layer,
          row,
          column: col,
          index: globalIndex++
        });
        itemIndex++;
      }
    }
  }

  return positions;
}

export function iteratePackedPositions(plan: ShipmentPlan['plan'], quantity: number, callback: (_pos: { layer: number; row: number; column: number; index: number }) => void) {
  const positions = calculatePackedPositions(plan, quantity);
  for (const pos of positions) {
    callback(pos);
  }
}

export function pushColumnPositions(params: {
  column: LayerColumnPattern;
  gapXY: number;
  offsetY: number;
  layerBaseZ: number;
  columnOffsetX: number;
  maxItems: number;
  nextIndex: number;
  positions: ExtendedItemPosition[];
}): { placed: number; nextIndex: number } {
  const { column, gapXY, offsetY, layerBaseZ, columnOffsetX, maxItems, positions } = params;
  let { nextIndex } = params;
  let placed = 0;
  const [a, b, c] = column.orientation;
  const strideX = a + gapXY;
  const strideY = b + gapXY;

  for (let col = 0; col < column.count && placed < maxItems; col += 1) {
    for (let row = 0; row < column.rows && placed < maxItems; row += 1) {
      const x0 = columnOffsetX + col * strideX;
      const y0 = offsetY + row * strideY;
      positions.push({ index: nextIndex, x0, y0, z0: layerBaseZ, dims: [a, b, c] });
      placed += 1;
      nextIndex += 1;
    }
  }

  return { placed, nextIndex };
}

export function collectExtendedPositions(params: {
  plan: ExtendedPlan;
  quantity: number;
  sku: Sku | Sku[];
  offsets: ArrangementOffsets;
}): ExtendedItemPosition[] {
  const { plan, quantity, sku, offsets } = params;
  const skus = Array.isArray(sku) ? sku : [sku];
  const primarySku = skus[0];
  const gapXY = primarySku.gapXY ?? 0;
  const gapZ = primarySku.gapZ ?? 0;
  const positions: ExtendedItemPosition[] = [];
  let remaining = quantity;
  let layerBaseZ = offsets.offsetZ;
  let globalIndex = 0;

  for (const layerPattern of plan.layers) {
    if (remaining <= 0) break;
    const itemsInLayer = Math.min(layerPattern.perLayerCapacity, remaining);
    if (itemsInLayer <= 0) {
      layerBaseZ += layerPattern.height + gapZ;
      continue;
    }

    let placed = 0;
    // この層に配置された商品の実際の最大高さを追跡
    let actualLayerHeight = layerPattern.height;

    // placedItemsが存在する場合（複数SKUの場合）
    if (layerPattern.placedItems && layerPattern.placedItems.length > 0) {
      for (const rect of layerPattern.placedItems) {
        if (placed >= itemsInLayer) break;

        // 実際の商品高さを取得（rectに高さ情報がある場合はそれを使用）
        const itemHeight = rect.h ?? layerPattern.height;
        actualLayerHeight = Math.max(actualLayerHeight, itemHeight);

        positions.push({
          index: globalIndex,
          x0: offsets.offsetX + rect.x,
          y0: offsets.offsetY + rect.y,
          z0: layerBaseZ,
          dims: [rect.w, rect.d, itemHeight],
          skuIdx: rect.skuIdx,
        });
        placed++;
        globalIndex++;
      }
    } else {
      // columnsを使用（単一SKUの場合）
      let columnOffsetX = offsets.offsetX;
      for (const column of layerPattern.columns) {
        const result = pushColumnPositions({
          column,
          gapXY,
          offsetY: offsets.offsetY,
          layerBaseZ,
          columnOffsetX,
          maxItems: itemsInLayer - placed,
          nextIndex: globalIndex,
          positions,
        });
        placed += result.placed;
        globalIndex = result.nextIndex;
        columnOffsetX += column.usedWidth + gapXY;
        if (placed >= itemsInLayer) break;
      }
      // 単一SKUの場合は列の向きから高さを取得
      if (layerPattern.columns.length > 0 && layerPattern.columns[0].orientation) {
        actualLayerHeight = Math.max(actualLayerHeight, layerPattern.columns[0].orientation[2]);
      }
    }

    remaining -= itemsInLayer;
    // 実際の層の高さを使用して次の層の基準位置を計算
    layerBaseZ += actualLayerHeight + gapZ;
  }

  return positions;
}

/**
 * 拡張プランから単一層の2D配置情報を取得（平面図用）
 */
export function collectExtendedLayerPositions2D(params: {
  layerPattern: ExtendedPlan['layers'][0];
  quantity: number;
  sku: Sku | Sku[];
  offsets: { offsetX: number; offsetY: number };
}): Array<{ x: number; y: number; w: number; d: number; skuIdx: number }> {
  const { layerPattern, quantity, sku, offsets } = params;
  const skus = Array.isArray(sku) ? sku : [sku];
  const primarySku = skus[0];
  const gapXY = primarySku.gapXY ?? 0;
  const positions: Array<{ x: number; y: number; w: number; d: number; skuIdx: number }> = [];

  let placed = 0;
  const itemsInLayer = Math.min(layerPattern.perLayerCapacity, quantity);

  // placedItemsが存在する場合（複数SKUの場合）
  if (layerPattern.placedItems && layerPattern.placedItems.length > 0) {
    for (const rect of layerPattern.placedItems) {
      if (placed >= itemsInLayer) break;
      positions.push({
        x: offsets.offsetX + rect.x,
        y: offsets.offsetY + rect.y,
        w: rect.w,
        d: rect.d,
        skuIdx: rect.skuIdx,
      });
      placed++;
    }
  } else {
    // columnsを使用（単一SKUの場合）
    let columnOffsetX = offsets.offsetX;
    for (const column of layerPattern.columns) {
      const [a, b] = column.orientation;
      const stepX = a + gapXY;
      const stepY = b + gapXY;

      for (let col = 0; col < column.count; col++) {
        for (let row = 0; row < column.rows; row++) {
          if (placed >= itemsInLayer) break;
          const xMm = columnOffsetX + col * stepX;
          const yMm = offsets.offsetY + row * stepY;
          positions.push({
            x: xMm,
            y: yMm,
            w: a,
            d: b,
            skuIdx: 0, // 単一SKUの場合は常に0
          });
          placed++;
        }
        if (placed >= itemsInLayer) break;
      }
      columnOffsetX += column.usedWidth + gapXY;
      if (placed >= itemsInLayer) break;
    }
  }

  return positions;
}

export function computeStandardArrangement(params: {
  plan: ShipmentPlan['plan'];
  sku: Sku;
  boxPadding: number;
  boxInner?: { W: number; D: number; H: number };
}): ArrangementGeometry {
  const { plan, sku, boxPadding, boxInner } = params;
  const unit = {
    a: plan.orientation[0],
    b: plan.orientation[1],
    c: plan.orientation[2],
  };
  const offsets = computeArrangementOffsets({ plan, sku, boxPadding, boxInner });
  const usedWidth = offsets ? offsets.usedWidth : plan.nx * unit.a;
  const usedDepth = offsets ? offsets.usedDepth : plan.ny * unit.b;
  const usedHeight = offsets ? offsets.usedHeight : plan.layers * unit.c;
  const offsetX = offsets ? offsets.offsetX : 0;
  const offsetY = offsets ? offsets.offsetY : 0;
  const offsetZ = offsets ? offsets.offsetZ : 0;

  return {
    unit,
    usedWidth,
    usedDepth,
    usedHeight,
    offsetX,
    offsetY,
    offsetZ,
    standardPlan: plan,
  };
}

export function computeExtendedArrangement(params: {
  plan: ExtendedPlan;
  sku: Sku | Sku[];
  boxPadding: number;
  boxInner?: { W: number; D: number; H: number };
  gapZ: number;
}): ArrangementGeometry | null {
  const { plan, sku, boxPadding, boxInner, gapZ } = params;
  const skus = Array.isArray(sku) ? sku : [sku];
  const primarySku = skus[0];

  if (!plan.layers || plan.layers.length === 0) {
    return null;
  }

  const baseLayer = plan.layers[0];
  const firstColumn = baseLayer.columns[0];
  const fallbackA = firstColumn?.orientation[0] ?? primarySku.dims.w ?? baseLayer.usedWidth ?? 1;
  const fallbackB = firstColumn?.orientation[1] ?? primarySku.dims.d ?? baseLayer.usedDepth ?? 1;
  const fallbackC = firstColumn?.orientation[2] ?? baseLayer.height ?? primarySku.dims.h ?? 1;

  const unit = { a: fallbackA, b: fallbackB, c: fallbackC };

  const pseudoPlan: ShipmentPlan['plan'] = {
    boxId: plan.boxId,
    orientation: [
      plan.usedWidth || baseLayer.usedWidth || unit.a,
      plan.usedDepth || baseLayer.usedDepth || unit.b,
      baseLayer.height || unit.c,
    ],
    nx: 1,
    ny: 1,
    layers: plan.layers.length,
    capacity: plan.totalCapacity,
    fits: plan.fits,
    lastLayerCount: plan.layers.at(-1)?.perLayerCapacity ?? 0,
    voidRatio: plan.voidRatio,
  };

  const offsets = computeArrangementOffsets({ plan: pseudoPlan, sku: primarySku, boxPadding, boxInner });
  const fallbackHeight = plan.usedHeight || plan.layers.reduce((sum, layer, index) => {
    const gap = index === 0 ? 0 : gapZ;
    return sum + layer.height + gap;
  }, 0);

  return {
    unit,
    usedWidth: offsets ? offsets.usedWidth : plan.usedWidth,
    usedDepth: offsets ? offsets.usedDepth : plan.usedDepth,
    usedHeight: offsets ? offsets.usedHeight : fallbackHeight,
    offsetX: offsets ? offsets.offsetX : 0,
    offsetY: offsets ? offsets.offsetY : 0,
    offsetZ: offsets ? offsets.offsetZ : 0,
    extendedPlan: plan,
  };
}
