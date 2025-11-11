import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

/**
 * GET: 買取同意テキストを取得
 */
export async function GET() {
  try {
    const docRef = adminDb.collection('settings').doc('buyback_consent');
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({
        success: false,
        error: 'Consent text not found'
      }, { status: 404 });
    }

    const data = doc.data();

    return NextResponse.json({
      success: true,
      text: data?.text || ''
    });
  } catch (error) {
    console.error('[buyback-consent GET] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

/**
 * POST: 買取同意テキストを設定（管理者のみ）
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'text is required and must be a string'
      }, { status: 400 });
    }

    const docRef = adminDb.collection('settings').doc('buyback_consent');
    await docRef.set({
      text,
      updatedAt: new Date().toISOString()
    });

    console.log('[buyback-consent POST] ✅ Consent text updated');

    return NextResponse.json({
      success: true,
      message: 'Consent text updated successfully'
    });
  } catch (error) {
    console.error('[buyback-consent POST] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
