import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
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

    const { uid } = await request.json();

    if (!uid) {
      return NextResponse.json({ error: 'UIDが必要です' }, { status: 400 });
    }

    // Admin権限を付与
    await adminAuth.setCustomUserClaims(uid, { admin: true });
    const user = await adminAuth.getUser(uid);

    return NextResponse.json({
      success: true,
      message: `ユーザー ${user.email} に管理者権限を付与しました`,
      uid: uid,
    });
  } catch (error: any) {
    console.error('Error setting admin claim:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
