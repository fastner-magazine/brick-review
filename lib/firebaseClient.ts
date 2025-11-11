import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import type { Analytics } from 'firebase/analytics';

// Analytics を遅延初期化するために getAnalytics を動的 import する
let analyticsInstance: Analytics | null = null;
let firebaseApp: FirebaseApp | null = null;
let authInstance: Auth | null = null;

function readClientConfig() {
  // Next.js 環境ではブラウザに露出してよい変数は NEXT_PUBLIC_ で始める
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

  if (!apiKey || !projectId || !appId) return null;

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    measurementId,
  };
}

export function getFirebaseApp(): FirebaseApp | null {
  if (firebaseApp) return firebaseApp;
  const cfg = readClientConfig();
  if (!cfg) return null;
  try {
    // 既に初期化済みならそれを再利用
    if (getApps().length > 0) {
      firebaseApp = getApp();
    } else {
      firebaseApp = initializeApp(cfg);
    }
    return firebaseApp;
  } catch (err) {
    // 初期化失敗は無視して null を返す。呼び出し側でエラーハンドリングを。
    // eslint-disable-next-line no-console
    console.error('Firebase init error', err);
    return null;
  }
}

export async function initAnalytics(): Promise<Analytics | null> {
  // Analytics はクライアントでのみ動作
  if (!globalThis.window) return null;
  if (analyticsInstance) return analyticsInstance;
  const app = getFirebaseApp();
  if (!app) return null;

  try {
    const { getAnalytics } = await import('firebase/analytics');
    analyticsInstance = getAnalytics(app);
    return analyticsInstance;
  } catch (err) {
    // 動的 import の失敗は Analytics の非利用と見なす
    // eslint-disable-next-line no-console
    console.warn('Analytics not available', err);
    return null;
  }
}

// Firebase Storage を取得
export function getFirebaseStorage() {
  const app = getFirebaseApp();
  if (!app) return null;
  return getStorage(app);
}

// Firebase Auth を取得
export function getFirebaseAuth(): Auth | null {
  if (authInstance) return authInstance;
  const app = getFirebaseApp();
  if (!app) return null;
  try {
    authInstance = getAuth(app);
    return authInstance;
  } catch (err) {
    console.error('Firebase Auth initialization error', err);
    return null;
  }
}

export default getFirebaseApp;
