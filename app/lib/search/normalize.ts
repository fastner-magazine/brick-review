/**
 * テキスト正規化ユーティリティ
 * 検索時の文字列比較用
 */

import type { NormalizeOptions } from './types';

/**
 * 全角英数字を半角に変換
 */
export function toHalfWidth(text: any): string {
 // 引数の型を厳密にチェック
 if (text === null || text === undefined) {
  console.warn('[toHalfWidth] Null or undefined received');
  return '';
 }

 if (typeof text !== 'string') {
  console.warn('[toHalfWidth] Invalid type received:', typeof text, 'value:', text);
  return '';
 }

 if (text === '') return '';

 try {
  // デバッグログで実際の値を確認
  // console.log('[toHalfWidth] Input:', text, 'typeof:', typeof text, 'replaceType:', typeof (text as any).replace);
  return text.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) =>
   String.fromCharCode(char.charCodeAt(0) - 0xfee0)
  );
 } catch (err) {
  console.error('[toHalfWidth] Replace error:', err, 'text:', text);
  return text; // エラー時は元の文字列を返す
 }
}

/**
 * 記号と空白を除去
 */
export function removeSymbols(text: any): string {
 if (text === null || text === undefined) {
  console.warn('[removeSymbols] Null or undefined received');
  return '';
 }

 if (typeof text !== 'string') {
  console.warn('[removeSymbols] Invalid type received:', typeof text, 'value:', text);
  return '';
 }

 if (text === '') return '';

 try {
  return text.replace(/[-_\s]/g, '');
 } catch (err) {
  console.error('[removeSymbols] Replace error:', err, 'text:', text);
  return text;
 }
}

/**
 * テキストを検索用に正規化
 * デフォルト: 全角→半角、小文字化、記号除去
 */
export function normalizeText(
 text: any,
 options: NormalizeOptions = {}
): string {
 if (text === null || text === undefined) {
  console.warn('[normalizeText] Null or undefined received');
  return '';
 }

 if (typeof text !== 'string') {
  console.warn('[normalizeText] Invalid type received:', typeof text, 'value:', text);
  return '';
 }

 if (text === '') return '';

 try {
  let result = text;

  const {
   toHalfWidth: useHalfWidth = true,
   toLowerCase: useLowerCase = true,
   removeSymbols: useRemoveSymbols = true,
   custom,
  } = options;

  if (useHalfWidth) {
   result = toHalfWidth(result);
  }

  if (useLowerCase && result && typeof result === 'string') {
   result = result.toLowerCase();
  }

  if (useRemoveSymbols && result && typeof result === 'string') {
   result = removeSymbols(result);
  }

  if (custom && result && typeof result === 'string') {
   result = custom(result);
  }

  return result || '';
 } catch (err) {
  console.error('[normalizeText] Processing error:', err, 'text:', text);
  return '';
 }
}

/**
 * Firestore前方一致検索用の範囲クエリを生成
 */
export function getPrefixSearchRange(normalizedQuery: string): {
 start: string;
 end: string;
} {
 return {
  start: normalizedQuery,
  end: normalizedQuery + '\uf8ff', // Unicodeの最大値
 };
}
