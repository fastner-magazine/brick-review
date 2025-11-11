import { NextResponse } from 'next/server';
import { KeyManagementServiceClient } from '@google-cloud/kms';

// KMSクライアントの初期化（Base64認証情報対応）
function initKmsClient() {
 const base64Cred = process.env.ADMIN_CREDENTIAL_BASE64 || process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;

 if (base64Cred) {
  try {
   const credentials = JSON.parse(Buffer.from(base64Cred, 'base64').toString('utf8'));
   return new KeyManagementServiceClient({ credentials });
  } catch (error) {
   console.error('[KMS] Failed to parse base64 credentials:', error);
  }
 }

 // フォールバック: GOOGLE_APPLICATION_CREDENTIALS または ADC
 return new KeyManagementServiceClient();
}

const kmsClient = initKmsClient();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * サーバのRSA公開鍵を配布
 * - KMSから非対称鍵の公開鍵を取得
 * - SRI用のハッシュも返す
 * - キャッシュヘッダーを設定して配信効率化
 */
export async function GET() {
 try {
  console.log('[PublicKey API] Request received');

    const projectId =
     process.env.GOOGLE_CLOUD_PROJECT ||
     process.env.GCLOUD_PROJECT_ID ||
     process.env.KMS_PROJECT_ID ||
     process.env.PROJECT_ID;
  const location = process.env.KMS_LOCATION || 'asia-northeast2';
  const keyring = process.env.KMS_KEYRING || 'bank-data-keyring';
  const keyName = process.env.KMS_ECDH_KEY || 'bank-ecdh-kek';

  console.log('[PublicKey API] Environment:', {
   hasProjectId: !!projectId,
   location,
   keyring,
   keyName,
   nodeEnv: process.env.NODE_ENV,
  });

  // KMSが設定されていない場合のみモックを返す（NODE_ENVに依存しない）
  const isDevelopment = !projectId;

  if (isDevelopment) {
   console.warn('[DEV MODE] Using mock public key (KMS not configured)');

   // 開発用のモック公開鍵（実際のアプリケーションでは使用されない）
   // RSA-OAEP with SHA-256用の有効なテスト鍵
   const mockJwk: JsonWebKey = {
    kty: 'RSA',
    n: '1u2lDPGbeMbSEHdI22Oaxk-0Vl9T8fh6Z1Z78v2TEHePSZivwu_4omXeXO2kTsVQg8dACxbnMsVLDWjOe2JguRayd5RQMPnMEvUY1KoNBMb9cYQ2WVRThjm8mVZ9Mt7OaXtfB5cCgaIE-hYOqwPPhiR-mBmaXZP4bFApq2iICZakldyPxudyIbz9ucxWfOICadGAy0g9p0uvOGjWnHwVKNvAajonyjmEnw3Xoc2TF_UqAYxMEagkFhrl5toLjYHDGsaV9lYhd69U5Dsv17RyjIF5Dpy_e2_MHwXHFOcQBfjkaLglsn-Q7pe-I_EukHDXhEQ0-AdP5oPktEGDellG3Q',
    e: 'AQAB',
    alg: 'RSA-OAEP-256',
    ext: true,
   };

   const jwkString = JSON.stringify(mockJwk);
   const crypto = await import('crypto');
   const hash = crypto.createHash('sha384').update(jwkString).digest('base64');
   const integrity = `sha384-${hash}`;

   console.log('[DEV MODE] Returning mock public key');

   return NextResponse.json(
    {
     publicKey: mockJwk,
     integrity,
     algorithm: 'RSA-OAEP-2048-SHA256',
     version: 1,
     isDevelopmentMode: true,
    },
    {
     headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
     },
    }
   );
  }

    if (!projectId) {
     console.error('[PublicKey API] Project ID environment variable not configured');
   return NextResponse.json(
    {
     error: 'Server configuration error',
         details: 'GCLOUD_PROJECT_ID などのプロジェクトID環境変数が設定されていません',
    },
    { status: 500 }
   );
  }

  // KMSから公開鍵を取得（有効なバージョンを使用）
  const keyVersionName = `projects/${projectId}/locations/${location}/keyRings/${keyring}/cryptoKeys/${keyName}/cryptoKeyVersions/2`;

  console.log('[PublicKey API] Fetching from KMS:', keyVersionName);

  const [publicKey] = await kmsClient.getPublicKey({
   name: keyVersionName,
  });

  if (!publicKey.pem) {
   console.error('[PublicKey API] Public key PEM not found in KMS response');
   throw new Error('Public key PEM not found');
  }

  console.log('[PublicKey API] Public key fetched from KMS');

  // PEM形式をJWK形式に変換
  const jwk = await pemToJwk(publicKey.pem);

  // SRI（Subresource Integrity）ハッシュを生成
  const jwkString = JSON.stringify(jwk);

  // SHA-384 ハッシュを生成（Node.js環境）
  const crypto = await import('crypto');
  const hash = crypto.createHash('sha384').update(jwkString).digest('base64');
  const integrity = `sha384-${hash}`;

  console.log('[PublicKey API] Returning public key successfully');

  return NextResponse.json(
   {
    publicKey: jwk,
    integrity,
    algorithm: 'RSA-OAEP-2048-SHA256',
    version: 2,
   },
   {
    headers: {
     'Content-Type': 'application/json',
     'Cache-Control': 'public, max-age=3600, immutable',
     'Content-Security-Policy': "default-src 'none'",
     'X-Content-Type-Options': 'nosniff',
    },
   }
  );
 } catch (error) {
  console.error('[PublicKey API] Error:', error);
  console.error('[PublicKey API] Error details:', {
   name: error instanceof Error ? error.name : 'Unknown',
   message: error instanceof Error ? error.message : String(error),
   stack: error instanceof Error ? error.stack : undefined,
  });

  return NextResponse.json(
   {
    error: 'Failed to fetch public key',
    details: error instanceof Error ? error.message : 'Unknown error',
   },
   { status: 500 }
  );
 }
}

/**
 * PEM形式の公開鍵をJWK形式に変換
 */
async function pemToJwk(pem: string): Promise<JsonWebKey> {
 try {
  const crypto = await import('crypto');

  // PEM形式からバイナリに変換
  const pemContents = pem
   .replace(/-----BEGIN PUBLIC KEY-----/, '')
   .replace(/-----END PUBLIC KEY-----/, '')
   .replace(/\s/g, '');

  const binaryDer = Buffer.from(pemContents, 'base64');

  // Node.jsのcryptoを使用して鍵をインポート
  const publicKey = crypto.createPublicKey({
   key: binaryDer,
   format: 'der',
   type: 'spki',
  });

  // JWK形式にエクスポート
  const jwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;

  return jwk;
 } catch (error) {
  console.error('PEM to JWK conversion error:', error);
  throw new Error('Failed to convert PEM to JWK');
 }
}
