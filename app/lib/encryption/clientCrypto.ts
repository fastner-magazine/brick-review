/**
 * クライアント側暗号化ユーティリティ
 * Web Crypto API を使用してブラウザ側で銀行情報を暗号化
 */

/**
 * Uint8ArrayをBase64に変換（大きな配列でもスタックオーバーフローしない）
 */
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192; // 8KBずつ処理

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export interface BankData {
 bankName: string;
 bankCode: string;
 branchName: string;
 branchCode: string;
 accountNumber: string;
 accountNameKana: string;
 // Firebase Storage関連（オプショナル）
 idFrontUrl?: string;
 idBackUrl?: string;
 tempStorageId?: string;
 // 身分証動画セッション情報（オプショナル）
 verificationSession?: {
  sessionId: string;
  videoUrls: string[];
  stepMarkers: Array<{
   step: string;
   challengeCode: string;
   timestamp: string;
   timestampMs: number;
   snapshot?: string;
  }>;
  deviceInfo: {
   userAgent: string;
   platform: string;
   screenResolution: string;
   language: string;
   timezone: string;
  };
 };
}

export interface EncryptedPayload {
 ciphertext: string; // Base64
 iv: string; // Base64
 authTag: string; // Base64
}

export interface ServerPublicKey {
 publicKey: JsonWebKey;
 integrity: string;
 algorithm: string;
}

/**
 * サーバから公開鍵を取得
 */
export async function fetchServerPublicKey(): Promise<ServerPublicKey> {
 try {
  console.log('[ClientCrypto] Fetching public key from server...');

  const response = await fetch('/api/crypto/public-key', {
   method: 'GET',
   headers: {
    'Accept': 'application/json',
   },
  });

  console.log('[ClientCrypto] Public key response status:', response.status);

  if (!response.ok) {
   const errorText = await response.text().catch(() => 'Unknown error');
   console.error('[ClientCrypto] Public key fetch failed:', {
    status: response.status,
    statusText: response.statusText,
    error: errorText,
   });
   throw new Error(`公開鍵の取得に失敗しました (ステータス: ${response.status})\n詳細: ${errorText}`);
  }

  const data = await response.json();
  console.log('[ClientCrypto] Public key response:', {
   hasPublicKey: !!data.publicKey,
   hasIntegrity: !!data.integrity,
   algorithm: data.algorithm,
   isDevelopmentMode: data.isDevelopmentMode,
  });

  // SRI検証（簡易版）
  if (!data.publicKey || !data.integrity) {
   console.error('[ClientCrypto] Invalid public key response:', data);
   throw new Error('無効な公開鍵レスポンスです');
  }

  console.log('[ClientCrypto] Public key fetched successfully');
  return data;
 } catch (error) {
  console.error('[ClientCrypto] fetchServerPublicKey error:', error);
  throw error;
 }
}

/**
 * RSA-OAEP でランダムなAES鍵を暗号化
 * サーバの公開鍵でラップして送信
 */
export async function encryptSessionKey(
 sessionKey: CryptoKey,
 serverPublicKeyJwk: JsonWebKey
): Promise<string> {
 // サーバ公開鍵をインポート
 const serverPublicKey = await crypto.subtle.importKey(
  'jwk',
  serverPublicKeyJwk,
  {
   name: 'RSA-OAEP',
   hash: 'SHA-256',
  },
  false,
  ['encrypt']
 );

 // セッション鍵をエクスポート（raw形式）
 const rawSessionKey = await crypto.subtle.exportKey('raw', sessionKey);

 // RSA-OAEPで暗号化
 const encryptedKey = await crypto.subtle.encrypt(
  {
   name: 'RSA-OAEP',
  },
  serverPublicKey,
  rawSessionKey
 );

 return arrayBufferToBase64(encryptedKey);
}

/**
 * ランダムなAES-256-GCMセッション鍵を生成
 */
export async function generateSessionKey(): Promise<CryptoKey> {
 return await crypto.subtle.generateKey(
  {
   name: 'AES-GCM',
   length: 256,
  },
  true, // extractable
  ['encrypt']
 );
}

/**
 * セッション鍵で銀行データを暗号化
 */
export async function encryptBankData(
 sessionKey: CryptoKey,
 bankData: BankData
): Promise<EncryptedPayload> {
 // ランダムなIV（12バイト）を生成
 const iv = crypto.getRandomValues(new Uint8Array(12));

 // データをJSON文字列に変換
 const encoder = new TextEncoder();
 const plaintext = encoder.encode(JSON.stringify(bankData));

 // AES-GCMで暗号化
 const encrypted = await crypto.subtle.encrypt(
  {
   name: 'AES-GCM',
   iv: iv,
   tagLength: 128, // 16バイトの認証タグ
  },
  sessionKey,
  plaintext
 );

 const encryptedArray = new Uint8Array(encrypted);

 // 認証タグは末尾16バイト
 const authTag = encryptedArray.slice(-16);
 const ciphertext = encryptedArray.slice(0, -16);

 return {
  ciphertext: arrayBufferToBase64(ciphertext),
  iv: arrayBufferToBase64(iv),
  authTag: arrayBufferToBase64(authTag),
 };
}

/**
 * 銀行データの完全な暗号化フロー
 * 1. セッション鍵生成
 * 2. サーバ公開鍵取得
 * 3. セッション鍵を公開鍵で暗号化
 * 4. 銀行データをセッション鍵で暗号化
 */
export async function encryptBankDataForServer(
 bankData: BankData
): Promise<{
 encryptedSessionKey: string;
 encryptedData: EncryptedPayload;
 keyInfo: {
  algorithm: string;
  keySize: number;
 };
}> {
 // 1. サーバ公開鍵を取得
 const serverKey = await fetchServerPublicKey();

 // 2. セッション鍵を生成
 const sessionKey = await generateSessionKey();

 // 3. セッション鍵をサーバ公開鍵で暗号化
 const encryptedSessionKey = await encryptSessionKey(
  sessionKey,
  serverKey.publicKey
 );

 // 4. 銀行データをセッション鍵で暗号化
 const encryptedData = await encryptBankData(sessionKey, bankData);

 return {
  encryptedSessionKey,
  encryptedData,
  keyInfo: {
   algorithm: 'AES-256-GCM',
   keySize: 256,
  },
 };
}

/**
 * 暗号化対応の確認
 */
export function isEncryptionSupported(): boolean {
 return (
  typeof crypto !== 'undefined' &&
  typeof crypto.subtle !== 'undefined' &&
  typeof crypto.subtle.encrypt === 'function' &&
  typeof crypto.subtle.generateKey === 'function'
 );
}

/**
 * セキュアコンテキストの確認
 * Web Crypto API は HTTPS または localhost でのみ動作
 */
export function isSecureContext(): boolean {
 if (typeof window === 'undefined') {
  // サーバーサイドではtrueを返す（実際の確認はクライアントで行う）
  return true;
 }
 return window.isSecureContext || false;
}
