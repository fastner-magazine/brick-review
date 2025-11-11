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

    const { uid, disabled } = await request.json();

    if (!uid || typeof disabled !== 'boolean') {
      return NextResponse.json(
        { error: 'UIDとdisabled(boolean)が必要です' },
        { status: 400 }
      );
    }

    // ユーザーの有効化/無効化
    await adminAuth.updateUser(uid, { disabled });
    const user = await adminAuth.getUser(uid);

    return NextResponse.json({
      success: true,
      message: `ユーザー ${user.email} を${disabled ? '無効化' : '有効化'}しました`,
      uid: uid,
    });
  } catch (error: any) {
    console.error('Error updating user disabled status:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
