import { Sku, Box } from './box-calculator';

/**
 * 重量計算を行う関数
 */
export function calculateWeights(
    sku: Sku,
    quantity: number,
    box: Box | undefined,
    packagingMaterialWeightMultiplier: number
) {
    console.log('[calculateWeights] 入力値:', {
        sku,
        'sku.unitWeightKg': sku.unitWeightKg,
        quantity,
        box,
        'box?.boxWeightKg': box?.boxWeightKg,
        packagingMaterialWeightMultiplier
    });

    // 商品重量 = 商品数 × 目安重量
    const productWeight = (sku.unitWeightKg || 0) * quantity;

    // 箱重量
    const boxWeight = box?.boxWeightKg || 0;

    // 梱包材重量 = 箱の体積(m³) × 乗数（内寸を使用）
    let packagingWeight = 0;
    if (box) {
        // 箱の内寸を使用（mmをmに変換）
        const innerW = box.inner.W;
        const innerD = box.inner.D;
        const innerH = box.inner.H;
        const volumeM3 = (innerW * innerD * innerH) / 1000000000; // mm³ to m³
        packagingWeight = volumeM3 * packagingMaterialWeightMultiplier;

        console.log('[calculateWeights] 計算詳細:', {
            innerW,
            innerD,
            innerH,
            volumeM3,
            packagingMaterialWeightMultiplier,
            packagingWeight
        });
    }

    // 合計重量
    const totalWeight = productWeight + boxWeight + packagingWeight;

    console.log('[calculateWeights] 結果:', {
        productWeight,
        boxWeight,
        packagingWeight,
        totalWeight
    });

    return {
        productWeight,
        boxWeight,
        packagingWeight,
        totalWeight,
    };
}