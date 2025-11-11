'use client';

import { useState } from 'react';

export default function CryptoDebugPage() {
  const [debugInfo, setDebugInfo] = useState<any>(null);
 const [publicKeyInfo, setPublicKeyInfo] = useState<any>(null);
 const [encryptionTest, setEncryptionTest] = useState<any>(null);
 const [loading, setLoading] = useState(false);

 const checkDebugInfo = async () => {
  setLoading(true);
  try {
   const response = await fetch('/api/crypto/debug');
   const data = await response.json();
   setDebugInfo(data);
  } catch (error) {
   console.error('Debug info fetch error:', error);
   setDebugInfo({ error: String(error) });
  } finally {
   setLoading(false);
  }
 };

 const checkPublicKey = async () => {
  setLoading(true);
  try {
   const response = await fetch('/api/crypto/public-key');
   const data = await response.json();
   setPublicKeyInfo({
    status: response.status,
    ok: response.ok,
    data,
   });
  } catch (error) {
   console.error('Public key fetch error:', error);
   setPublicKeyInfo({ error: String(error) });
  } finally {
   setLoading(false);
  }
 };

 const testEncryption = async () => {
  setLoading(true);
  try {
   const { encryptBankDataForServer } = await import('@/lib/encryption/clientCrypto');

   const testData = {
    bankName: 'テスト銀行',
    bankCode: '0001',
    branchName: 'テスト支店',
    branchCode: '001',
    accountNumber: '1234567',
    accountNameKana: 'テストタロウ',
   };

   const encrypted = await encryptBankDataForServer(testData);

   setEncryptionTest({
    success: true,
    hasEncryptedSessionKey: !!encrypted.encryptedSessionKey,
    hasEncryptedData: !!encrypted.encryptedData,
    hasCiphertext: !!encrypted.encryptedData.ciphertext,
    hasIv: !!encrypted.encryptedData.iv,
    hasAuthTag: !!encrypted.encryptedData.authTag,
    keyInfo: encrypted.keyInfo,
   });
  } catch (error) {
   console.error('Encryption test error:', error);
   setEncryptionTest({
    success: false,
    error: error instanceof Error ? error.message : String(error),
   });
  } finally {
   setLoading(false);
  }
 };

 return (
  <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
   <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '20px' }}>
    🔐 暗号化システムデバッグ
   </h1>

   <p style={{ marginBottom: '30px', color: '#666' }}>
    暗号化システムの動作確認とデバッグ用のページです。
   </p>

   <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
    {/* ブラウザ環境チェック */}
    <div style={{
     padding: '20px',
     border: '1px solid #ddd',
     borderRadius: '8px',
     background: '#f9f9f9'
    }}>
     <h2 style={{ fontSize: '1.3rem', fontWeight: 'bold', marginBottom: '15px' }}>
      1. ブラウザ環境チェック
     </h2>
     <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px', fontSize: '0.95rem' }}>
      <strong>セキュアコンテキスト:</strong>
      <span style={{ color: typeof window !== 'undefined' && window.isSecureContext ? 'green' : 'red' }}>
       {typeof window !== 'undefined' && window.isSecureContext ? '✓ HTTPS/localhost' : '✗ 非セキュア'}
      </span>

      <strong>Web Crypto API:</strong>
      <span style={{ color: typeof crypto !== 'undefined' && crypto.subtle ? 'green' : 'red' }}>
       {typeof crypto !== 'undefined' && crypto.subtle ? '✓ 利用可能' : '✗ 利用不可'}
      </span>

      <strong>User Agent:</strong>
      <span style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>
       {typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}
      </span>
     </div>
    </div>

    {/* サーバー環境チェック */}
    <div style={{
     padding: '20px',
     border: '1px solid #ddd',
     borderRadius: '8px',
     background: '#f9f9f9'
    }}>
     <h2 style={{ fontSize: '1.3rem', fontWeight: 'bold', marginBottom: '15px' }}>
      2. サーバー環境チェック
     </h2>
     <button
      onClick={checkDebugInfo}
      disabled={loading}
      style={{
       padding: '10px 20px',
       background: '#007bff',
       color: 'white',
       border: 'none',
       borderRadius: '6px',
       cursor: loading ? 'not-allowed' : 'pointer',
       opacity: loading ? 0.6 : 1,
      }}
     >
      {loading ? '確認中...' : 'サーバー環境を確認'}
     </button>

     {debugInfo && (
      <pre style={{
       marginTop: '15px',
       padding: '15px',
       background: '#fff',
       border: '1px solid #ddd',
       borderRadius: '6px',
       overflow: 'auto',
       fontSize: '0.85rem',
      }}>
       {JSON.stringify(debugInfo, null, 2)}
      </pre>
     )}
    </div>

    {/* 公開鍵取得テスト */}
    <div style={{
     padding: '20px',
     border: '1px solid #ddd',
     borderRadius: '8px',
     background: '#f9f9f9'
    }}>
     <h2 style={{ fontSize: '1.3rem', fontWeight: 'bold', marginBottom: '15px' }}>
      3. 公開鍵取得テスト
     </h2>
     <button
      onClick={checkPublicKey}
      disabled={loading}
      style={{
       padding: '10px 20px',
       background: '#28a745',
       color: 'white',
       border: 'none',
       borderRadius: '6px',
       cursor: loading ? 'not-allowed' : 'pointer',
       opacity: loading ? 0.6 : 1,
      }}
     >
      {loading ? '取得中...' : '公開鍵を取得'}
     </button>

     {publicKeyInfo && (
      <pre style={{
       marginTop: '15px',
       padding: '15px',
       background: '#fff',
       border: '1px solid #ddd',
       borderRadius: '6px',
       overflow: 'auto',
       fontSize: '0.85rem',
      }}>
       {JSON.stringify(publicKeyInfo, null, 2)}
      </pre>
     )}
    </div>

    {/* 暗号化テスト */}
    <div style={{
     padding: '20px',
     border: '1px solid #ddd',
     borderRadius: '8px',
     background: '#f9f9f9'
    }}>
     <h2 style={{ fontSize: '1.3rem', fontWeight: 'bold', marginBottom: '15px' }}>
      4. 暗号化テスト
     </h2>
     <button
      onClick={testEncryption}
      disabled={loading}
      style={{
       padding: '10px 20px',
       background: '#ffc107',
       color: '#000',
       border: 'none',
       borderRadius: '6px',
       cursor: loading ? 'not-allowed' : 'pointer',
       opacity: loading ? 0.6 : 1,
      }}
     >
      {loading ? 'テスト中...' : 'テストデータを暗号化'}
     </button>

     {encryptionTest && (
      <pre style={{
       marginTop: '15px',
       padding: '15px',
       background: '#fff',
       border: '1px solid #ddd',
       borderRadius: '6px',
       overflow: 'auto',
       fontSize: '0.85rem',
      }}>
       {JSON.stringify(encryptionTest, null, 2)}
      </pre>
     )}
    </div>

    {/* 診断結果 */}
    {(debugInfo || publicKeyInfo || encryptionTest) && (
     <div style={{
      padding: '20px',
      border: '2px solid #007bff',
      borderRadius: '8px',
      background: '#e7f3ff'
     }}>
      <h2 style={{ fontSize: '1.3rem', fontWeight: 'bold', marginBottom: '15px' }}>
       💡 診断結果
      </h2>
      <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
       {debugInfo && debugInfo.allConfigured === false && (
        <li style={{ color: '#dc3545' }}>
         ⚠️ サーバー環境変数が不足しています。KMS設定を確認してください。
        </li>
       )}
       {publicKeyInfo && !publicKeyInfo.ok && (
        <li style={{ color: '#dc3545' }}>
         ⚠️ 公開鍵の取得に失敗しました。サーバーログを確認してください。
        </li>
       )}
       {encryptionTest && !encryptionTest.success && (
        <li style={{ color: '#dc3545' }}>
         ⚠️ 暗号化テストに失敗しました: {encryptionTest.error}
        </li>
       )}
       {encryptionTest && encryptionTest.success && (
        <li style={{ color: '#28a745' }}>
         ✓ 暗号化が正常に動作しています!
        </li>
       )}
      </ul>
     </div>
    )}
   </div>
  </div>
 );
}
