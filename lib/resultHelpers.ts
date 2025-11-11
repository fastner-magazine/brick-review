import type { MultiSkuEntry, RawBox } from '../types/result';
import type { Box } from './box-calculator';

export const toFiniteNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export const resolveSetting = (
  directValue: unknown,
  overrideValue: unknown,
  defaultValue: unknown,
  fallback: number
): number => {
  const direct = toFiniteNumber(directValue);
  if (direct !== undefined) return direct;
  const override = toFiniteNumber(overrideValue);
  if (override !== undefined) return override;
  const defaultVal = toFiniteNumber(defaultValue);
  if (defaultVal !== undefined) return defaultVal;
  return fallback;
};

export const resolveOptionalSetting = (
  directValue: unknown,
  overrideValue: unknown,
  defaultValue: unknown
): number | undefined => {
  const direct = toFiniteNumber(directValue);
  if (direct !== undefined) return direct;
  const override = toFiniteNumber(overrideValue);
  if (override !== undefined) return override;
  const defaultVal = toFiniteNumber(defaultValue);
  if (defaultVal !== undefined) return defaultVal;
  return undefined;
};

export const resolveBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return fallback;
};

export const createEntry = (record: Record<string, unknown>): MultiSkuEntry | null => {
  const dimsRaw = record.dims;
  const dims = dimsRaw && typeof dimsRaw === 'object' ? dimsRaw as Record<string, unknown> : record;
  const w = toFiniteNumber(dims.w);
  const d = toFiniteNumber(dims.d);
  const h = toFiniteNumber(dims.h);
  const quantity = toFiniteNumber(record.quantity);
  if (w === undefined || d === undefined || h === undefined || quantity === undefined) return null;
  const maxLayers = toFiniteNumber(record.maxStackLayers);
  return {
    skuId: typeof record.skuId === 'string' && record.skuId ? record.skuId : undefined,
    name: typeof record.name === 'string' ? record.name : undefined,
    quantity: Math.max(1, Math.floor(quantity)),
    dims: { w, d, h },
    keepUpright: resolveBoolean(record.keepUpright),
    sideMargin: toFiniteNumber(record.sideMargin),
    frontMargin: toFiniteNumber(record.frontMargin),
    topMargin: toFiniteNumber(record.topMargin),
    gapXY: toFiniteNumber(record.gapXY),
    gapZ: toFiniteNumber(record.gapZ),
    maxStackLayers: maxLayers !== undefined && maxLayers > 0 ? Math.floor(maxLayers) : undefined,
    unitWeightKg: toFiniteNumber(record.unitWeightKg),
  };
};

export const parseEntriesParam = (raw: string): MultiSkuEntry[] => {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries: MultiSkuEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const entry = createEntry(item as Record<string, unknown>);
      if (entry) entries.push(entry);
    }
    return entries;
  } catch {
    return [];
  }
};

export function normalizeBoxesInput(boxes: RawBox[]): Box[] {
  return boxes.map((box) => {
    if ('inner' in box) {
      return { id: box.id, inner: box.inner, maxWeightKg: box.maxWeightKg, boxWeightKg: box.boxWeightKg };
    }
    const { id, W, D, H, maxWeightKg, boxWeightKg } = box;
    return { id, inner: { W, D, H }, maxWeightKg, boxWeightKg };
  });
}

export const formatOrientation = ([a, b, c]: [number, number, number]) => `${a} × ${b} × ${c} mm`;

export const formatVoidRatio = (ratio: number) => `${Math.round(ratio * 1000) / 10}%`;

export const describeLayerColumns = (pattern: { columns: { orientation: [number, number, number]; count: number; rows: number }[] }): string => {
  return pattern.columns
    .map((col) => {
      const orientation = formatOrientation(col.orientation);
      return `${orientation} を ${col.count} 列 × 奥行 ${col.rows} 列`;
    })
    .join(' ／ ');
};

export const describeLayerType = (pattern: { type: 'uniform' | 'mixed' }): string => (
  pattern.type === 'uniform' ? '均等配置' : '混在配置'
);
