import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { getAppCheck } from "firebase-admin/app-check";

export async function POST(request: Request) {
 try {
  const { token } = (await request.json()) as { token?: string };

  if (!token) {
   return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  console.log('[App Check Verify] Starting verification...');
  console.log('[App Check Verify] Environment check:', {
   hasFirebaseAdminCredentialBase64: !!process.env.FIREBASE_ADMIN_CREDENTIAL_BASE64,
   hasAdminCredentialBase64: !!process.env.ADMIN_CREDENTIAL_BASE64,
   nodeEnv: process.env.NODE_ENV,
  });

  // getAdmin() で初期化を確実に実行
  let admin;
  try {
   admin = getAdmin();
   console.log('[App Check Verify] getAdmin() succeeded, apps count:', admin.apps.length);
  } catch (initError) {
   console.error('[App Check Verify] getAdmin() failed:', initError);
   throw initError;
  }

  // デフォルトアプリを明示的に取得
  const app = admin.apps[0];
  if (!app) {
   throw new Error("Firebase Admin app not initialized");
  }

  console.log('[App Check Verify] Getting App Check instance...');
  const appCheck = getAppCheck(app);

  console.log('[App Check Verify] Verifying token...');
  const decoded = await appCheck.verifyToken(token);

  const audience = Array.isArray(decoded.token.aud) ? decoded.token.aud : [decoded.token.aud];
  const expiresAt = new Date(decoded.token.exp * 1000);
  const issuedAt = new Date(decoded.token.iat * 1000);

  return NextResponse.json({
   ok: true,
   result: {
    appId: decoded.appId,
    aud: audience,
    tokenId: decoded.token.jti ?? null,
    expireTime: expiresAt.toISOString(),
    issuedAt: issuedAt.toISOString(),
    alreadyConsumed: decoded.alreadyConsumed ?? false,
   },
  });
 } catch (error) {
  console.error("[App Check Verify]", error);
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
 }
}
