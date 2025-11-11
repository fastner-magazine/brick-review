import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseStorage } from '@/lib/firebaseClient';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export const runtime = 'nodejs';

/**
 * 身分証動画撮影ログを保存するAPI
 * 
 * 動画をFirebase Storageにアップロードし、
 * メタデータをFirestoreに保存します。
 */
export async function POST(request: NextRequest) {
 try {
  const formData = await request.formData();

  const sessionId = formData.get('sessionId') as string;
  const startedAt = formData.get('startedAt') as string;
  const completed = formData.get('completed') === 'true';
  const totalDuration = Number(formData.get('totalDuration'));
  const stepMarkersJson = formData.get('stepMarkers') as string;
  const deviceInfoJson = formData.get('deviceInfo') as string;
  const videoFile = formData.get('video') as File;

  if (!sessionId) {
   return NextResponse.json(
    { error: 'Session ID is required' },
    { status: 400 }
   );
  }

  const stepMarkers = stepMarkersJson ? JSON.parse(stepMarkersJson) : [];
  const deviceInfo = deviceInfoJson ? JSON.parse(deviceInfoJson) : {};

  // 動画をFirebase Storageにアップロード
  let videoUrl = '';

  if (videoFile) {
   try {
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (!isDevelopment) {
     const storage = getFirebaseStorage();
     if (storage) {
      const videoPath = `id-verification/${sessionId}/video_${Date.now()}.webm`;
      const storageRef = ref(storage, videoPath);

      const buffer = await videoFile.arrayBuffer();
      const blob = new Uint8Array(buffer);

      await uploadBytes(storageRef, blob, {
       contentType: 'video/webm',
      });

      videoUrl = await getDownloadURL(storageRef);
     }
    } else {
     videoUrl = `[DEV] ${videoFile.name} (${(videoFile.size / 1024 / 1024).toFixed(2)}MB)`;
    }
   } catch (uploadError) {
    console.error('Video upload error:', uploadError);
    videoUrl = '[UPLOAD_FAILED]';
   }
  }

  // Firestoreにセッション情報を保存
  const logData = {
   sessionId,
   startedAt,
   completed,
   totalDuration,
   stepMarkers,
   deviceInfo,
   videoUrl,
   videoSize: videoFile ? videoFile.size : 0,
   createdAt: new Date().toISOString(),
   clientIp: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
  };

  const isDevelopment = process.env.NODE_ENV === 'development';
  let docId = 'dev-mock-id';

  if (!isDevelopment) {
   // 本番環境でのみ Firestore に保存
   try {
    const { Firestore } = await import('@google-cloud/firestore');
    const firestore = new Firestore();
    const docRef = await firestore.collection('id_verification_logs').add(logData);
    docId = docRef.id;
    console.log('ID verification log saved to Firestore:', docId);
   } catch (firestoreError) {
    console.error('Firestore save error:', firestoreError);
    // Firestore エラーでも処理を継続（ログは残す）
   }
  } else {
   // 開発環境ではコンソールに出力のみ
   console.log('ID verification log (DEV mode, not saved to Firestore):', logData);
  }

  return NextResponse.json({
   success: true,
   logId: docId,
   stepMarkersCount: stepMarkers.length,
  });
 } catch (error) {
  console.error('ID verification log save error:', error);

  return NextResponse.json(
   {
    error: 'Failed to save verification log',
    details: error instanceof Error ? error.message : String(error),
   },
   { status: 500 }
  );
 }
}
