/**
 * サイト専用認証管理
 * Firebase Anonymous Auth + App Check による安全なFirestoreアクセス
 */

import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { getFirebaseApp } from './firebaseClient';

let currentUser: User | null = null;
let authInitialized = false;

/**
 * サイトの認証状態を初期化（匿名ログイン）
 * アプリ起動時に一度だけ呼び出す
 */
export async function initSiteAuth(): Promise<User | null> {
  if (authInitialized) {
    return currentUser;
  }

  const app = getFirebaseApp();
  if (!app) {
    console.error('Firebase app not initialized for auth');
    return null;
  }

  const auth = getAuth(app);

  return new Promise((resolve) => {
    // 既にログイン済みかチェック
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUser = user;
        authInitialized = true;
        console.log('Site auth: already signed in anonymously');
        unsubscribe();
        resolve(user);
      } else {
        // 匿名ログイン実行
        try {
          const credential = await signInAnonymously(auth);
          currentUser = credential.user;
          authInitialized = true;
          console.log('Site auth: signed in anonymously');
          unsubscribe();
          resolve(credential.user);
        } catch (error) {
          console.error('Anonymous sign-in failed:', error);
          authInitialized = true;
          unsubscribe();
          resolve(null);
        }
      }
    });
  });
}

/**
 * 現在の認証済みユーザーを取得
 */
export function getCurrentUser(): User | null {
  return currentUser;
}

/**
 * 認証状態が初期化済みかチェック
 */
export function isAuthInitialized(): boolean {
  return authInitialized;
}
