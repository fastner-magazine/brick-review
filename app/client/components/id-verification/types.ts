/**
 * 身分証動画撮影システムの型定義
 * 古物商法対応: カメラのみ使用、連続録画、チャレンジコード付き
 */

export type RecordingStep =
  | 'front'      // 身分証表面
  | 'back'       // 身分証裏面
  | 'thickness'  // 身分証厚み
  | 'selfie';    // セルフィー＆身分証ショット

export interface StepMarker {
  step: RecordingStep;
  challengeCode: string;
  timestamp: string; // ISO 8601
  timestampMs: number; // 録画開始からの経過ミリ秒
  snapshot?: string; // ボタン押下時の静止画（base64 data URL）
}

export interface DeviceInfo {
  userAgent: string;
  platform: string;
  screenResolution: string;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connectionType?: string;
  language: string;
  timezone: string;
}

export interface VerificationSession {
  sessionId: string;
  startedAt: string;
  completedAt?: string;
  videoBlobs: Blob[]; // 録画動画（外カメラ用1本 + インカメラ用1本 = 計2本）
  totalDuration: number; // 総録画時間（秒）
  stepMarkers: StepMarker[]; // 各ステップのタイムスタンプマーカー
  deviceInfo: DeviceInfo;
  completed: boolean;
  clientIp?: string;
}

export interface StepGuide {
  step: RecordingStep;
  title: string;
  description: string;
  icon: string;
  instructions: string[];
}
