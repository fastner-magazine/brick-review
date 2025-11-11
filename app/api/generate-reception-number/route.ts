import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

/**
 * 受付番号を事前生成する関数
 * 形式: BUY20251106-001
 */
async function generateReceptionNumber(): Promise<string> {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000; // 9時間のミリ秒
  const jstDate = new Date(now.getTime() + jstOffset);

  const year = jstDate.getUTCFullYear();
  const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jstDate.getUTCDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  // 今日の日付の開始と終了のタイムスタンプを取得
  const dayStartJST = new Date(jstDate.getUTCFullYear(), jstDate.getUTCMonth(), jstDate.getUTCDate());
  const dayStart = new Date(dayStartJST.getTime() - jstOffset);

  const dayEndJST = new Date(dayStartJST);
  dayEndJST.setDate(dayEndJST.getDate() + 1);
  const dayEnd = new Date(dayEndJST.getTime() - jstOffset);

  // カウンター取得
  const counterRef = adminDb.collection('counters').doc('reception_numbers');
  const counterDoc = await counterRef.get();

  let sequence = 1;
  const counterData = counterDoc.data();

  if (counterData && counterData.lastDate === dateStr) {
    sequence = (counterData.sequence || 0) + 1;
  }

  // カウンター更新
  await counterRef.set({
    lastDate: dateStr,
    sequence: sequence,
    updatedAt: new Date().toISOString()
  });

  const sequenceStr = String(sequence).padStart(3, '0');
  return `BUY${dateStr}-${sequenceStr}`;
}

/**
 * GET: 新しい受付番号を生成
 */
export async function GET() {
  try {
    const receptionNumber = await generateReceptionNumber();

    console.log('[generate-reception-number] Generated:', receptionNumber);

    return NextResponse.json({
      success: true,
      receptionNumber,
    });
  } catch (error) {
    console.error('[generate-reception-number] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
