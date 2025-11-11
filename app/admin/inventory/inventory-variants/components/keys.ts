import type { AggregatedVariant } from "./types";

// Pure key generator - inventoryIdを優先（必ずユニーク）
export function getVariantKey(variant: AggregatedVariant): string {
    // inventoryIdを優先的に使用（必ずユニーク）
    const id = String(variant.inventoryId || '').trim();
    if (id) return id;

    // fallback: variant_sku
    const sku = (variant.variantSku || '').trim();
    if (sku) return sku;

    return 'unknown-inventory-row';
}
