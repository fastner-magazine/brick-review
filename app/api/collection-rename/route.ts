import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const maxDuration = 300; // 5分のタイムアウト

export async function POST(request: NextRequest) {
 const startTime = Date.now();

 try {
  const { sourceCollection, targetCollection, batchSize = 500 } = await request.json();

  if (!sourceCollection || !targetCollection) {
   return NextResponse.json(
    { error: 'sourceCollection と targetCollection は必須です' },
    { status: 400 }
   );
  }

  if (sourceCollection === targetCollection) {
   return NextResponse.json(
    { error: '同じコレクション名は指定できません' },
    { status: 400 }
   );
  }

  console.log(`[collection-rename] 開始: ${sourceCollection} → ${targetCollection}`);
  console.log(`[collection-rename] バッチサイズ: ${batchSize}`);

  let processedCount = 0;
  let hasMore = true;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  while (hasMore) {
   // ソースコレクションからバッチ取得
   let query = adminDb.collection(sourceCollection).limit(batchSize);

   if (lastDoc) {
    query = query.startAfter(lastDoc);
   }

   const snapshot = await query.get();

   if (snapshot.empty) {
    hasMore = false;
    break;
   }

   // バッチ書き込み用
   const batch = adminDb.batch();

   snapshot.docs.forEach((doc) => {
    const targetDocRef = adminDb.collection(targetCollection).doc(doc.id);
    batch.set(targetDocRef, doc.data());
   });

   // バッチコミット
   await batch.commit();

   processedCount += snapshot.docs.length;
   lastDoc = snapshot.docs[snapshot.docs.length - 1];

   console.log(`[collection-rename] 進行中: ${processedCount}件処理済み`);

   // 次のバッチがあるかチェック
   if (snapshot.docs.length < batchSize) {
    hasMore = false;
   }
  }

  const duration = Date.now() - startTime;

  console.log(`[collection-rename] 完了: ${processedCount}件を${duration}msで処理`);

  return NextResponse.json({
   success: true,
   processed: processedCount,
   sourceCollection,
   targetCollection,
   duration,
  });

 } catch (error) {
  console.error('[collection-rename] CRITICAL ERROR:', error);
  console.error('[collection-rename] Error stack:', error instanceof Error ? error.stack : 'No stack trace');

  return NextResponse.json(
   {
    error: 'コレクション名変更に失敗しました',
    details: error instanceof Error ? error.message : String(error)
   },
   { status: 500 }
  );
 }
}
