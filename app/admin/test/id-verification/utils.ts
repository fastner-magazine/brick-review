/**
 * 身分証動画撮影システムのユーティリティ関数
 */

import type { DeviceInfo, RecordingStep, StepGuide } from './types';

/**
 * ランダムなチャレンジコードを生成（8文字の英数字）
 */
export function generateChallengeCode(): string {
 const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 混同しやすい文字を除外
 let code = '';
 for (let i = 0; i < 8; i++) {
  code += chars.charAt(Math.floor(Math.random() * chars.length));
 }
 return code;
}

/**
 * 端末情報を取得
 */
export function getDeviceInfo(): DeviceInfo {
 const nav = navigator as any;

 return {
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  screenResolution: `${screen.width}x${screen.height}`,
  deviceMemory: nav.deviceMemory,
  hardwareConcurrency: navigator.hardwareConcurrency,
  connectionType: nav.connection?.effectiveType,
  language: navigator.language,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
 };
}

/**
 * ISO 8601形式のタイムスタンプを取得（JST）
 */
export function getTimestamp(): string {
 return new Date().toISOString();
}

/**
 * セッションIDを生成
 */
export function generateSessionId(): string {
 return `id_verification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 各ステップのガイド情報
 */
export const stepGuides: Record<RecordingStep, StepGuide> = {
 front: {
  step: 'front',
  title: '身分証の表面を撮影',
  description: '身分証の表面全体が映るように、ゆっくりと左右に傾けて撮影してください',
  icon: '📄',
  instructions: [
   '身分証を画面中央に配置',
   '文字がはっきり読めることを確認',
   'ゆっくりと左右に傾けて光沢を確認',
   '準備ができたらシャッターボタンを押す',
  ],
 },
 back: {
  step: 'back',
  title: '身分証の裏面を撮影',
  description: '身分証を裏返して、裏面全体を撮影してください',
  icon: '�',
  instructions: [
   '身分証を裏返す',
   '裏面全体を画面中央に',
   '文字や記載事項が読める明るさで',
   'ゆっくりと左右に傾ける',
  ],
 },
 thickness: {
  step: 'thickness',
  title: '身分証の厚みを撮影',
  description: '身分証を斜めに持って、厚みと側面を確認できるようにしてください',
  icon: '�',
  instructions: [
   '身分証を斜めに持つ',
   '側面の厚みが見えるように',
   'ゆっくりと回転させる',
   '厚みが確認できたらシャッター',
  ],
 },
 selfie: {
  step: 'selfie',
  title: 'セルフィー＆身分証ショット',
  description: 'インカメラに切り替わります。あなたの顔と身分証の表面を同時に撮影してください',
  icon: '🤳',
  instructions: [
   '顔と身分証を同時にフレームに',
   '顔全体がはっきり映るように',
   '身分証の文字も読めるように',
   '正面を向いて準備ができたらシャッター',
  ],
 },
};

/**
 * 動画の長さを検証（最小・最大時間）
 */
export function validateVideoDuration(duration: number): boolean {
 const minDuration = 15; // 最低15秒
 const maxDuration = 120; // 最大2分

 return duration >= minDuration && duration <= maxDuration;
}

/**
 * Blobから動画の長さを取得
 */
export async function getVideoDuration(blob: Blob): Promise<number> {
 return new Promise((resolve, reject) => {
  const video = document.createElement('video');
  video.preload = 'metadata';

  video.onloadedmetadata = () => {
   window.URL.revokeObjectURL(video.src);
   resolve(video.duration);
  };

  video.onerror = () => {
   reject(new Error('動画のメタデータ読み込みに失敗しました'));
  };

  video.src = URL.createObjectURL(blob);
 });
}
