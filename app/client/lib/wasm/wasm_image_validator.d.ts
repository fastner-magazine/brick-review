/* tslint:disable */
/* eslint-disable */
/**
 * Base64エンコードされた画像データから品質を判定
 */
export function validate_image_quality(base64_data: string): ImageQualityResult;
export function init(): void;
/**
 * 画像品質判定結果
 */
export class ImageQualityResult {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * JSON文字列として取得
   */
  to_json(): string;
  /**
   * ブレ検出スコア（高いほどシャープ、低いほどブレている）
   */
  blur_score: number;
  /**
   * ブレているかどうか（true = ブレている）
   */
  is_blurry: boolean;
  /**
   * 明るさスコア（0-1の範囲、0.5が適切）
   */
  brightness: number;
  /**
   * 暗すぎるかどうか
   */
  is_too_dark: boolean;
  /**
   * 明るすぎるかどうか
   */
  is_too_bright: boolean;
  /**
   * 全体的に品質が良いかどうか
   */
  is_good_quality: boolean;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_get_imagequalityresult_blur_score: (a: number) => number;
  readonly __wbg_get_imagequalityresult_brightness: (a: number) => number;
  readonly __wbg_get_imagequalityresult_is_blurry: (a: number) => number;
  readonly __wbg_get_imagequalityresult_is_good_quality: (a: number) => number;
  readonly __wbg_get_imagequalityresult_is_too_bright: (a: number) => number;
  readonly __wbg_get_imagequalityresult_is_too_dark: (a: number) => number;
  readonly __wbg_imagequalityresult_free: (a: number, b: number) => void;
  readonly __wbg_set_imagequalityresult_blur_score: (a: number, b: number) => void;
  readonly __wbg_set_imagequalityresult_brightness: (a: number, b: number) => void;
  readonly __wbg_set_imagequalityresult_is_blurry: (a: number, b: number) => void;
  readonly __wbg_set_imagequalityresult_is_good_quality: (a: number, b: number) => void;
  readonly __wbg_set_imagequalityresult_is_too_bright: (a: number, b: number) => void;
  readonly __wbg_set_imagequalityresult_is_too_dark: (a: number, b: number) => void;
  readonly imagequalityresult_to_json: (a: number) => [number, number, number, number];
  readonly init: () => void;
  readonly validate_image_quality: (a: number, b: number) => [number, number, number];
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
