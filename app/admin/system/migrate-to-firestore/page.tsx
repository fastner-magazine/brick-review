'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { migrateLocalStorageToFirestore, isFirestoreInitialized } from '@/lib/firestoreClient';

/**
 * localStorageからFirestoreへのデータ移行ページ
 * 
 * 使い方:
 * 1. このページにアクセス
 * 2. 「移行を実行」ボタンをクリック
 * 3. 既存のlocalStorageデータがFirestoreにコピーされます
 * 4. 移行後は既存のページを Firestore版に切り替えてください
 */
export default function MigrateToFirestore() {
  const [status, setStatus] = useState<'idle' | 'migrating' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const router = useRouter();

  // ページ読み込み時にFirebase設定状態を確認
  useEffect(() => {
    const checkConfig = () => {
      const configured = isFirestoreInitialized();
      setIsConfigured(configured);
      // デバッグ用: 環境変数の状態をログ出力
      // eslint-disable-next-line no-console
      console.log('Firebase configured:', configured);
      // eslint-disable-next-line no-console
      console.log('Environment variables:', {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '✓' : '✗',
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? '✓' : '✗',
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ? '✓' : '✗',
      });
    };
    checkConfig();
  }, []);

  const handleMigrate = async () => {
    // 事前チェック: Firestore が初期化されているか
    if (!isFirestoreInitialized()) {
      setStatus('error');
      setMessage(
        'Firebase の設定が完了していません。.env.local ファイルに Firebase の設定値を記入してください。詳細は FIREBASE_SETUP.md を参照してください。'
      );
      return;
    }

    setStatus('migrating');
    setMessage('移行中...');
    try {
      await migrateLocalStorageToFirestore();
      setStatus('success');
      setMessage('移行が完了しました! localStorageのデータがFirestoreにコピーされました。');
    } catch (err) {
      console.error('Migration failed:', err);
      setStatus('error');
      setMessage('移行に失敗しました: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>データ移行ツール</h1>
      <p>
        このページでは、localStorageに保存されているデータを Firebase Firestore に移行できます。
      </p>

      {/* Firebase 設定状態の表示 */}
      <div
        style={{
          background: isConfigured ? '#d4edda' : '#f8d7da',
          padding: '15px',
          marginBottom: '20px',
          borderRadius: '5px',
          border: `1px solid ${isConfigured ? '#c3e6cb' : '#f5c6cb'}`,
          color: isConfigured ? '#155724' : '#721c24',
        }}
      >
        <h3>📡 Firebase 設定状態</h3>
        {isConfigured ? (
          <p>✅ Firebase の設定が完了しています。移行を実行できます。</p>
        ) : (
          <div>
            <p>❌ Firebase の設定が完了していません。</p>
            <p>
              <strong>対処方法:</strong>
            </p>
            <ol>
              <li>
                <code>.env.local</code> ファイルをプロジェクトルートに作成
              </li>
              <li>Firebase Console から設定値を取得</li>
              <li>
                <code>NEXT_PUBLIC_FIREBASE_*</code> の環境変数を設定
              </li>
              <li>開発サーバーを再起動</li>
            </ol>
            <p>
              詳細は{' '}
              <a
                href="/FIREBASE_SETUP.md"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#007bff' }}
              >
                FIREBASE_SETUP.md
              </a>{' '}
              を参照してください。
            </p>
          </div>
        )}
      </div>

      <div style={{ background: '#f0f0f0', padding: '15px', marginBottom: '20px', borderRadius: '5px' }}>
        <h2>移行されるデータ</h2>
        <ul>
          <li>箱マスタ (boxes)</li>
          <li>SKUマスタ (skus)</li>
          <li>全体設定 (generalSettings)</li>
          <li>SKU個別設定 (skuOverrides)</li>
        </ul>
      </div>

      <div style={{ background: '#fff3cd', padding: '15px', marginBottom: '20px', borderRadius: '5px', border: '1px solid #ffc107' }}>
        <h3>⚠️ 注意事項</h3>
        <ul>
          <li>この操作は既存のFirestoreデータを<strong>上書き</strong>します</li>
          <li>移行後も localStorage のデータは削除されません</li>
          <li>移行は何度でも実行できます（最新のlocalStorageデータで上書きされます）</li>
          <li>Firebaseの設定が正しく完了していることを確認してください</li>
        </ul>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button
          type="button"
          onClick={handleMigrate}
          disabled={status === 'migrating' || !isConfigured}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor:
              status === 'migrating' || !isConfigured ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: status === 'migrating' || !isConfigured ? 'not-allowed' : 'pointer',
          }}
        >
          {status === 'migrating' ? '移行中...' : '移行を実行'}
        </button>
        {!isConfigured && (
          <p style={{ color: '#856404', marginTop: '10px' }}>
            ⚠️ 移行を実行するには、まず Firebase の設定を完了してください。
          </p>
        )}
      </div>

      {message && (
        <div
          style={{
            padding: '15px',
            marginBottom: '20px',
            borderRadius: '5px',
            backgroundColor:
              status === 'success' ? '#d4edda' : status === 'error' ? '#f8d7da' : '#d1ecf1',
            color: status === 'success' ? '#155724' : status === 'error' ? '#721c24' : '#0c5460',
            border:
              status === 'success'
                ? '1px solid #c3e6cb'
                : status === 'error'
                  ? '1px solid #f5c6cb'
                  : '1px solid #bee5eb',
          }}
        >
          {message}
        </div>
      )}

      {status === 'success' && (
        <div style={{ background: '#e7f3ff', padding: '15px', marginBottom: '20px', borderRadius: '5px' }}>
          <h3>次のステップ</h3>
          <ol>
            <li>Firestoreコンソールでデータが正しく移行されたか確認</li>
            <li>
              <a href="/box-settings-firestore" style={{ color: '#007bff' }}>
                Firestore版の箱設定ページ
              </a>{' '}
              で動作確認
            </li>
            <li>問題なければ、既存ページをFirestore版に置き換え</li>
          </ol>
        </div>
      )}

      <div style={{ marginTop: '30px' }}>
        <button
          type="button"
          onClick={() => router.push('/calculator')}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
          }}
        >
          トップへ戻る
        </button>
      </div>
    </div>
  );
}
