/**
 * Firebase設定診断ページ
 * 認証・App Check・Firestoreの設定状態を確認
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getFirebaseApp } from '@/lib/firebaseClient';
import { isFirestoreInitialized, getAllSkus, getAllBoxes } from '@/lib/firestoreClient';
import { getCurrentUser, isAuthInitialized } from '@/lib/siteAuth';
import { isAppCheckInitialized } from '@/lib/appCheck';

export default function Diagnostics() {
  const router = useRouter();
  const [state, setState] = useState({
    firebaseApp: false,
    appCheck: false,
    auth: false,
    authUser: null as any,
    firestore: false,
    envVars: {
      apiKey: false,
      authDomain: false,
      projectId: false,
      recaptchaKey: false,
    },
  });
  const [firestoreData, setFirestoreData] = useState({
    skuCount: 0,
    boxCount: 0,
    loading: true,
  });
  const [localStorageData, setLocalStorageData] = useState({
    skuCount: 0,
    boxCount: 0,
  });

  useEffect(() => {
    const checkState = () => {
      const app = getFirebaseApp();
      const user = getCurrentUser();
      
      setState({
        firebaseApp: app !== null,
        appCheck: isAppCheckInitialized(),
        auth: isAuthInitialized(),
        authUser: user ? { uid: user.uid, isAnonymous: user.isAnonymous } : null,
        firestore: isFirestoreInitialized(),
        envVars: {
          apiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          recaptchaKey: !!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY,
        },
      });

      // localStorageのデータ数を確認
      try {
        const localSkus = localStorage.getItem('skus');
        const localBoxes = localStorage.getItem('boxes');
        setLocalStorageData({
          skuCount: localSkus ? JSON.parse(localSkus).length : 0,
          boxCount: localBoxes ? JSON.parse(localBoxes).length : 0,
        });
      } catch (err) {
        console.warn('localStorage check failed', err);
      }
    };

    // 初回チェック
    checkState();

    // 1秒後に再チェック（認証完了を待つ）
    const timer = setTimeout(checkState, 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const loadFirestoreData = async () => {
      setFirestoreData(prev => ({ ...prev, loading: true }));
      try {
        const [skus, boxes] = await Promise.all([getAllSkus(), getAllBoxes()]);
        setFirestoreData({
          skuCount: skus.length,
          boxCount: boxes.length,
          loading: false,
        });
      } catch (err) {
        console.error('Firestore data load error', err);
        setFirestoreData({ skuCount: 0, boxCount: 0, loading: false });
      }
    };

    if (state.firestore) {
      loadFirestoreData();
    }
  }, [state.firestore]);

  const getStatusIcon = (ok: boolean) => (ok ? '✅' : '❌');
  const getStatusColor = (ok: boolean) => (ok ? '#4caf50' : '#f44336');

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>🔍 Firebase設定診断</h1>
      
      <div style={{ marginTop: 24 }}>
        <h2>環境変数</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th>状態</th>
              <th>変数名</th>
              <th>値</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{getStatusIcon(state.envVars.apiKey)}</td>
              <td>NEXT_PUBLIC_FIREBASE_API_KEY</td>
              <td style={{ color: getStatusColor(state.envVars.apiKey) }}>
                {state.envVars.apiKey ? '設定済み' : '未設定'}
              </td>
            </tr>
            <tr>
              <td>{getStatusIcon(state.envVars.authDomain)}</td>
              <td>NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN</td>
              <td style={{ color: getStatusColor(state.envVars.authDomain) }}>
                {state.envVars.authDomain ? '設定済み' : '未設定'}
              </td>
            </tr>
            <tr>
              <td>{getStatusIcon(state.envVars.projectId)}</td>
              <td>NEXT_PUBLIC_FIREBASE_PROJECT_ID</td>
              <td style={{ color: getStatusColor(state.envVars.projectId) }}>
                {state.envVars.projectId ? '設定済み' : '未設定'}
              </td>
            </tr>
            <tr>
              <td>{getStatusIcon(state.envVars.recaptchaKey)}</td>
              <td>NEXT_PUBLIC_RECAPTCHA_SITE_KEY</td>
              <td style={{ color: getStatusColor(state.envVars.recaptchaKey) }}>
                {state.envVars.recaptchaKey ? '設定済み' : '未設定（App Check無効）'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>Firebase SDK</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th>状態</th>
              <th>サービス</th>
              <th>ステータス</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{getStatusIcon(state.firebaseApp)}</td>
              <td>Firebase App</td>
              <td style={{ color: getStatusColor(state.firebaseApp) }}>
                {state.firebaseApp ? '初期化済み' : '初期化失敗'}
              </td>
            </tr>
            <tr>
              <td>{getStatusIcon(state.firestore)}</td>
              <td>Firestore</td>
              <td style={{ color: getStatusColor(state.firestore) }}>
                {state.firestore ? '接続可能' : '接続不可'}
              </td>
            </tr>
            <tr>
              <td>{getStatusIcon(state.appCheck)}</td>
              <td>App Check</td>
              <td style={{ color: getStatusColor(state.appCheck) }}>
                {state.appCheck ? '有効' : '無効（開発中は任意）'}
              </td>
            </tr>
            <tr>
              <td>{getStatusIcon(state.auth)}</td>
              <td>Authentication</td>
              <td style={{ color: getStatusColor(state.auth) }}>
                {state.auth ? '初期化済み' : '初期化中...'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>認証状態</h2>
        {state.authUser ? (
          <div style={{ padding: 12, background: '#e8f5e9', borderRadius: 4 }}>
            <p style={{ margin: 0 }}>✅ 匿名ユーザーとしてログイン済み</p>
            <p style={{ margin: '8px 0 0 0', fontSize: 12, color: '#666' }}>
              UID: {state.authUser.uid}
            </p>
          </div>
        ) : (
          <div style={{ padding: 12, background: '#ffebee', borderRadius: 4 }}>
            <p style={{ margin: 0 }}>❌ 未認証</p>
            <p style={{ margin: '8px 0 0 0', fontSize: 12 }}>
              Firebaseコンソールで匿名認証を有効化してください
            </p>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>Firestoreデータ</h2>
        {firestoreData.loading ? (
          <div style={{ padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
            <p style={{ margin: 0 }}>🔄 読み込み中...</p>
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>コレクション</th>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>Firestore</th>
                <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>localStorage</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid #ddd', padding: 8 }}>商品マスタ (skus)</td>
                <td style={{ border: '1px solid #ddd', padding: 8, fontWeight: 'bold', color: '#1976d2' }}>
                  {firestoreData.skuCount} 件
                </td>
                <td style={{ border: '1px solid #ddd', padding: 8, color: '#666' }}>
                  {localStorageData.skuCount} 件
                </td>
              </tr>
              <tr>
                <td style={{ border: '1px solid #ddd', padding: 8 }}>箱マスタ (boxes)</td>
                <td style={{ border: '1px solid #ddd', padding: 8, fontWeight: 'bold', color: '#1976d2' }}>
                  {firestoreData.boxCount} 件
                </td>
                <td style={{ border: '1px solid #ddd', padding: 8, color: '#666' }}>
                  {localStorageData.boxCount} 件
                </td>
              </tr>
            </tbody>
          </table>
        )}
        {firestoreData.skuCount !== localStorageData.skuCount && (
          <div style={{ marginTop: 12, padding: 12, background: '#fff3cd', borderRadius: 4 }}>
            <p style={{ margin: 0, fontSize: 14 }}>
              ⚠️ FirestoreとlocalStorageでデータ数が異なります。
              <br />
              <a href="/migrate-to-firestore" style={{ color: '#1976d2', textDecoration: 'underline' }}>
                localStorageからFirestoreへ移行
              </a>
            </p>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, padding: 16, background: '#fff3cd', borderRadius: 4 }}>
        <h3 style={{ marginTop: 0 }}>⚠️ エラーが出ている場合</h3>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>
            <strong>auth/configuration-not-found</strong>
            <br />
            → Firebaseコンソールで匿名認証を有効化
            <br />
            <a
              href="https://console.firebase.google.com/project/brick-test-af673/authentication/providers"
              target="_blank"
              rel="noopener noreferrer"
            >
              https://console.firebase.google.com/.../authentication/providers
            </a>
          </li>
          <li style={{ marginTop: 8 }}>
            <strong>App Check無効</strong>
            <br />
            → 開発中は任意ですが、本番では必須
            <br />
            詳細: <code>FIRESTORE_SECURITY.md</code>
          </li>
        </ol>
      </div>

      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          onClick={() => router.push('/calculator')}
          style={{ padding: '8px 16px', cursor: 'pointer' }}
        >
          メインページに戻る
        </button>
        <button
          type="button"
          onClick={() => globalThis.location?.reload()}
          style={{ padding: '8px 16px', marginLeft: 8, cursor: 'pointer' }}
        >
          再読み込み
        </button>
      </div>

      <div style={{ marginTop: 24, fontSize: 12, color: '#999' }}>
        <p>詳細ドキュメント:</p>
        <ul>
          <li><code>QUICKSTART.md</code> - 匿名認証エラーの修正手順</li>
          <li><code>FIRESTORE_SECURITY.md</code> - セキュリティ設定の詳細</li>
          <li><code>FIREBASE_SETUP.md</code> - Firebase初期セットアップ</li>
        </ul>
      </div>
    </div>
  );
}
