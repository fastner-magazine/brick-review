import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    // 認証チェック（ヘッダーからトークン取得）
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decodedToken = await adminAuth.verifyIdToken(token);

    // Admin権限チェック
    if (!decodedToken.admin) {
      return NextResponse.json({ error: 'Forbidden: Admin権限が必要です' }, { status: 403 });
    }

    // 全ユーザーを取得
    const listUsersResult = await adminAuth.listUsers(1000);

    const googleUsers = listUsersResult.users
      .filter(user =>
        user.providerData.some(provider => provider.providerId === 'google.com')
      )
      .map(user => ({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        isAdmin: user.customClaims?.admin === true,
        disabled: user.disabled,
        createdAt: user.metadata.creationTime,
      }));

    return NextResponse.json({
      success: true,
      users: googleUsers,
    });
  } catch (error: any) {
    console.error('Error listing users:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
