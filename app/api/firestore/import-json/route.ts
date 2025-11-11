import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { convertJsonToFirestoreWrites } from '@/lib/json-import-utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jsonData } = body;

    if (!jsonData) {
      return NextResponse.json(
        { error: 'JSONデータが必要です' },
        { status: 400 }
      );
    }

    // JSONデータをFirestore書き込み構造に変換
    const writes = convertJsonToFirestoreWrites(jsonData);

    if (writes.length === 0) {
      return NextResponse.json(
        { error: '有効なFirestore構造が見つかりませんでした' },
        { status: 400 }
      );
    }

    // Firestoreに書き込み
    const results = await writeToFirestore(writes);

    return NextResponse.json({
      success: true,
      message: `${results.documentsWritten}件のドキュメントを保存しました`,
      stats: results,
    });
  } catch (error) {
    console.error('JSON import error:', error);
    return NextResponse.json(
      {
        error: 'インポート中にエラーが発生しました',
        details: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 }
    );
  }
}

/**
 * Firestoreに再帰的に書き込み
 */
async function writeToFirestore(writes: any[]) {
  let documentsWritten = 0;
  let collectionsWritten = new Set<string>();

  for (const write of writes) {
    if (write.type === 'document') {
      // パスを解析
      const pathParts = write.path.split('/');
      if (pathParts.length < 2) continue;

      // ドキュメント参照を作成
      let ref = adminDb.collection(pathParts[0]);
      collectionsWritten.add(pathParts[0]);

      for (let i = 1; i < pathParts.length; i++) {
        if (i % 2 === 1) {
          // ドキュメントID
          ref = ref.doc(pathParts[i]) as any;
        } else {
          // サブコレクション
          ref = (ref as any).collection(pathParts[i]);
          collectionsWritten.add(pathParts.slice(0, i + 1).join('/'));
        }
      }

      // データを書き込み
      if (write.data && Object.keys(write.data).length > 0) {
        // Timestampオブジェクトを変換
        const processedData = processDataForAdmin(write.data);
        await (ref as any).set(processedData, { merge: true });
        documentsWritten++;
      }

      // サブコレクションを再帰的に処理
      if (write.subcollections && write.subcollections.length > 0) {
        const subResults = await writeToFirestore(write.subcollections);
        documentsWritten += subResults.documentsWritten;
        subResults.collectionsWritten.forEach(col => collectionsWritten.add(col));
      }
    }
  }

  return {
    documentsWritten,
    collectionsWritten: Array.from(collectionsWritten),
  };
}

/**
 * クライアント側のTimestampをAdmin SDKのTimestampに変換
 */
function processDataForAdmin(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  // Timestampオブジェクトの場合（クライアント側から送られてきた場合）
  if (data && typeof data === 'object' && 'seconds' in data && 'nanoseconds' in data) {
    const { Timestamp } = require('firebase-admin/firestore');
    return new Timestamp(data.seconds, data.nanoseconds);
  }

  // 配列の場合
  if (Array.isArray(data)) {
    return data.map(item => processDataForAdmin(item));
  }

  // オブジェクトの場合
  if (typeof data === 'object') {
    const processed: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      processed[key] = processDataForAdmin(value);
    }
    return processed;
  }

  return data;
}
