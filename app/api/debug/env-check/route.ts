import { NextResponse } from 'next/server';

/**
 * 環境変数の設定状況を診断するエンドポイント
 * ⚠️ 本番環境では削除またはアクセス制限を追加すること
 */
export async function GET() {
 try {
  const resolvedProjectId =
   process.env.GOOGLE_CLOUD_PROJECT ||
   process.env.GCLOUD_PROJECT_ID ||
   process.env.KMS_PROJECT_ID ||
   process.env.PROJECT_ID ||
   null;

  const envCheck = {
   nodeEnv: process.env.NODE_ENV,
   hasFirebaseAdminCredentialJson: !!process.env.FIREBASE_ADMIN_CREDENTIAL_JSON,
   hasAdminCredentialBase64: !!process.env.ADMIN_CREDENTIAL_BASE64,
   hasGoogleServiceAccountBase64: !!process.env.GOOGLE_SERVICE_ACCOUNT_BASE64,
   hasGoogleApplicationCredentials: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
   hasGoogleCloudProject: !!process.env.GOOGLE_CLOUD_PROJECT,
   hasGcloudProjectId: !!process.env.GCLOUD_PROJECT_ID,
   hasKmsProjectId: !!process.env.KMS_PROJECT_ID,
   googleCloudProjectValue: process.env.GOOGLE_CLOUD_PROJECT
    ? `${process.env.GOOGLE_CLOUD_PROJECT.slice(0, 10)}...`
    : null,
   gcloudProjectIdValue: process.env.GCLOUD_PROJECT_ID
    ? `${process.env.GCLOUD_PROJECT_ID.slice(0, 10)}...`
    : null,
   resolvedProjectId,
   // Firestore Emulator
   hasFirestoreEmulatorHost: !!process.env.FIRESTORE_EMULATOR_HOST,
   // KMS設定
   kmsLocation: process.env.KMS_LOCATION,
   kmsKeyring: process.env.KMS_KEYRING,
   kmsEcdhKey: process.env.KMS_ECDH_KEY,
  };

  return NextResponse.json({
   status: 'ok',
   environment: envCheck,
   timestamp: new Date().toISOString(),
  });
 } catch (error) {
  console.error('[ENV Check] Error:', error);
  return NextResponse.json(
   {
    status: 'error',
    error: error instanceof Error ? error.message : 'Unknown error',
   },
   { status: 500 }
  );
 }
}
