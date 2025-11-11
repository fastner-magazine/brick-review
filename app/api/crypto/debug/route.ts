import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 暗号化システムのデバッグ情報を返す（開発環境のみ）
 * 本番環境では環境変数の存在のみを確認し、値は返さない
 */
export async function GET() {
 const isDevelopment = process.env.NODE_ENV === 'development';

 // 本番環境では詳細情報を返さない
 if (!isDevelopment) {
  const envCheck = {
   hasProjectId: !!(process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT_ID || process.env.KMS_PROJECT_ID),
   hasLocation: !!process.env.KMS_LOCATION,
   hasKeyring: !!process.env.KMS_KEYRING,
   hasKeyName: !!process.env.KMS_ECDH_KEY,
   nodeEnv: process.env.NODE_ENV,
  };

  return NextResponse.json({
   environment: 'production',
   message: '環境変数の存在チェック',
   checks: envCheck,
   allConfigured: Object.values(envCheck).every(v => v === true || v === 'production'),
  });
 }

 // 開発環境では詳細情報を返す
 const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT_ID ||
  process.env.KMS_PROJECT_ID ||
  process.env.PROJECT_ID;
 const location = process.env.KMS_LOCATION || 'asia-northeast2';
 const keyring = process.env.KMS_KEYRING || 'bank-data-keyring';
 const keyName = process.env.KMS_ECDH_KEY || 'bank-ecdh-kek';

 const keyVersionName = projectId
  ? `projects/${projectId}/locations/${location}/keyRings/${keyring}/cryptoKeys/${keyName}/cryptoKeyVersions/1`
  : 'NOT_CONFIGURED';

 const recommendations =
  projectId
    ? ['KMS設定が正しく読み込まれています']
    : [
     '環境変数が設定されていません',
     'GCLOUD_PROJECT_ID または KMS_PROJECT_ID を設定してください',
     'firebase deploy後はfirebase functionsの環境変数を確認してください',
    ];

 return NextResponse.json({
  environment: 'development',
  message: 'デバッグ情報（開発環境のみ）',
  config: {
   projectId: projectId || 'NOT_SET',
   location,
   keyring,
   keyName,
   keyVersionName,
  },
  envVars: {
   GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT ? 'SET' : 'NOT_SET',
   GCLOUD_PROJECT_ID: process.env.GCLOUD_PROJECT_ID ? 'SET' : 'NOT_SET',
   KMS_PROJECT_ID: process.env.KMS_PROJECT_ID ? 'SET' : 'NOT_SET',
   KMS_LOCATION: process.env.KMS_LOCATION ? 'SET' : 'NOT_SET',
   KMS_KEYRING: process.env.KMS_KEYRING ? 'SET' : 'NOT_SET',
   KMS_ECDH_KEY: process.env.KMS_ECDH_KEY ? 'SET' : 'NOT_SET',
   NODE_ENV: process.env.NODE_ENV,
  },
  recommendations,
 });
}
