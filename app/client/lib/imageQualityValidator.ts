/**
 * 画像品質判定モジュール（WASM）
 * ブレ検出と明るさ判定を高速に実行
 */

import init, { validate_image_quality, ImageQualityResult } from './wasm/wasm_image_validator';

// WASMの初期化状態を管理
let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;

/**
 * WASMモジュールを初期化（一度だけ実行）
 */
async function ensureWasmInitialized(): Promise<void> {
  if (wasmInitialized) {
    return;
  }

  if (wasmInitPromise) {
    return wasmInitPromise;
  }

  wasmInitPromise = init().then(() => {
    wasmInitialized = true;
    console.log('[ImageQualityValidator] WASM module initialized');
  });

  return wasmInitPromise;
}

/**
 * 画像品質の判定結果
 */
export interface ImageQuality {
  /** ブレスコア（高いほどシャープ） */
  blurScore: number;
  /** ブレているか */
  isBlurry: boolean;
  /** 明るさ（0-1） */
  brightness: number;
  /** 暗すぎるか */
  isTooDark: boolean;
  /** 明るすぎるか */
  isTooBright: boolean;
  /** 全体的に品質が良いか */
  isGoodQuality: boolean;
}

/**
 * Base64エンコードされた画像の品質を判定
 * @param base64Data Base64エンコードされた画像データ（data:image/jpeg;base64,プレフィックス付きでもOK）
 * @returns 画像品質の判定結果
 */
export async function validateImageQuality(base64Data: string): Promise<ImageQuality> {
  // WASMを初期化
  await ensureWasmInitialized();

  try {
    // WASM関数を呼び出し
    const result: ImageQualityResult = validate_image_quality(base64Data);

    return {
      blurScore: result.blur_score,
      isBlurry: result.is_blurry,
      brightness: result.brightness,
      isTooDark: result.is_too_dark,
      isTooBright: result.is_too_bright,
      isGoodQuality: result.is_good_quality,
    };
  } catch (error) {
    console.error('[ImageQualityValidator] Error validating image:', error);
    throw error;
  }
}

/**
 * 画像品質の判定結果を人間が読める形式で取得
 */
export function getQualityMessage(quality: ImageQuality): string {
  if (quality.isGoodQuality) {
    return '✅ 画質良好';
  }

  const issues: string[] = [];

  if (quality.isBlurry) {
    issues.push('ブレています');
  }

  if (quality.isTooDark) {
    issues.push('暗すぎます');
  }

  if (quality.isTooBright) {
    issues.push('明るすぎます');
  }

  return `⚠️ ${issues.join('、')}`;
}

/**
 * 画像品質の詳細メッセージを取得
 */
export function getDetailedQualityInfo(quality: ImageQuality): {
  message: string;
  suggestions: string[];
} {
  if (quality.isGoodQuality) {
    return {
      message: '画質は良好です',
      suggestions: [],
    };
  }

  const suggestions: string[] = [];

  if (quality.isBlurry) {
    suggestions.push('カメラを安定させて、もう一度撮影してください');
  }

  if (quality.isTooDark) {
    suggestions.push('明るい場所で撮影してください');
  }

  if (quality.isTooBright) {
    suggestions.push('照明を調整して、もう一度撮影してください');
  }

  const issues: string[] = [];
  if (quality.isBlurry) issues.push('ブレ');
  if (quality.isTooDark) issues.push('暗すぎ');
  if (quality.isTooBright) issues.push('明るすぎ');

  return {
    message: `画質に問題があります: ${issues.join('、')}`,
    suggestions,
  };
}
