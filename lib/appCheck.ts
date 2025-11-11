/**
 * Firebase App Check 初期化
 * reCAPTCHA v3 を使用してアプリの正当性を検証
 */

import type { AppCheck } from 'firebase/app-check';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getFirebaseApp } from './firebaseClient';

let appCheckInitialized = false;
let appCheckInstance: AppCheck | null = null;

/**
 * App Check を初期化
 * 本番環境では reCAPTCHA site key を使用
 * 開発環境では debug token を使用（Firebaseコンソールで登録が必要）
 */
export function initAppCheck(): void {
  if (appCheckInitialized) {
    return;
  }

  const app = getFirebaseApp();
  if (!app) {
    console.error('Firebase app not initialized for App Check');
    return;
  }

  // 開発環境用デバッグトークン設定
  if (globalThis.window !== undefined && process.env.NODE_ENV === 'development') {
    const debugToken = process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN;
    if (debugToken) {
      (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
      console.log('App Check: using debug token from .env.local');
    } else {
      console.warn(
        'App Check: No debug token set. Set NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN in .env.local or run:\n' +
        'self.FIREBASE_APPCHECK_DEBUG_TOKEN = true\n' +
        'in browser console to generate one.'
      );
    }
  }

  const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  if (!recaptchaSiteKey) {
    console.warn(
      'NEXT_PUBLIC_RECAPTCHA_SITE_KEY not set. App Check will not be enabled. ' +
      'For local development, set self.FIREBASE_APPCHECK_DEBUG_TOKEN in the browser console.'
    );
    return;
  }

  try {
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialized = true;
    console.log('App Check initialized successfully');
  } catch (error) {
    console.error('Failed to initialize App Check:', error);
  }
}

/**
 * App Check が初期化済みかチェック
 */
export function isAppCheckInitialized(): boolean {
  return appCheckInitialized;
}

export function getAppCheckInstance(): AppCheck | null {
  return appCheckInstance;
}
