import { getFirebaseStorage } from './firebaseClient';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { VerificationSession } from '@/app/client/components/id-verification/types';

/**
 * ID検証セッションをFirebase Storageに保存
 * 
 * 保存構造:
 * id-verification/
 *   {sessionId}/
 *     video_1.webm        - 録画動画1（外カメラ）
 *     video_2.webm        - 録画動画2（インカメラ）
 *     snapshot_front.jpg  - 表面スナップショット
 *     snapshot_back.jpg   - 裏面スナップショット
 *     snapshot_thickness.jpg - 厚みスナップショット
 *     snapshot_selfie.jpg - セルフィースナップショット
 *     metadata.json       - セッション情報
 */
export async function saveVerificationSession(session: VerificationSession): Promise<{
 success: boolean;
 videoUrls?: string[];
 snapshotUrls?: Record<string, string>;
 metadataUrl?: string;
 error?: string;
}> {
 try {
  const storage = getFirebaseStorage();
  if (!storage) {
   throw new Error('Firebase Storage が初期化されていません');
  }

  const sessionFolder = `id-verification/${session.sessionId}`;

  // 動画が存在しない場合はエラー
  if (!session.videoBlobs || session.videoBlobs.length === 0) {
   throw new Error('動画データが存在しません');
  }

  // 1. 動画をアップロード（複数）
  console.log('[idVerificationStorage] 動画をアップロード中...', session.videoBlobs.length, '本');
  const videoUrls: string[] = [];

  for (let i = 0; i < session.videoBlobs.length; i++) {
   const videoBlob = session.videoBlobs[i];
   const videoRef = ref(storage, `${sessionFolder}/video_${i + 1}.webm`);
   await uploadBytes(videoRef, videoBlob, {
    contentType: 'video/webm',
    customMetadata: {
     sessionId: session.sessionId,
     videoIndex: String(i + 1),
     uploadedAt: new Date().toISOString(),
    },
   });
   const videoUrl = await getDownloadURL(videoRef);
   videoUrls.push(videoUrl);
   console.log(`[idVerificationStorage] 動画${i + 1}アップロード完了:`, videoUrl);
  }

  // 2. 各ステップのスナップショットをアップロード
  console.log('[idVerificationStorage] スナップショットをアップロード中...');
  const snapshotUrls: Record<string, string> = {};

  for (const marker of session.stepMarkers) {
   if (marker.snapshot) {
    try {
     // Base64からBlobに変換
     const base64Data = marker.snapshot.split(',')[1];
     const mimeType = marker.snapshot.match(/data:([^;]+);/)?.[1] || 'image/jpeg';
     const byteCharacters = atob(base64Data);
     const byteNumbers = new Array(byteCharacters.length);
     for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
     }
     const byteArray = new Uint8Array(byteNumbers);
     const blob = new Blob([byteArray], { type: mimeType });

     // アップロード
     const snapshotRef = ref(storage, `${sessionFolder}/snapshot_${marker.step}.jpg`);
     await uploadBytes(snapshotRef, blob, {
      contentType: mimeType,
      customMetadata: {
       sessionId: session.sessionId,
       step: marker.step,
       challengeCode: marker.challengeCode,
       timestampMs: marker.timestampMs.toString(),
       uploadedAt: new Date().toISOString(),
      },
     });
     const snapshotUrl = await getDownloadURL(snapshotRef);
     snapshotUrls[marker.step] = snapshotUrl;
     console.log(`[idVerificationStorage] スナップショット(${marker.step})アップロード完了:`, snapshotUrl);
    } catch (err) {
     console.error(`[idVerificationStorage] スナップショット(${marker.step})のアップロードエラー:`, err);
     // 個別のスナップショット失敗は無視して続行
    }
   }
  }

  // 3. メタデータ(snapshot除外)をJSONファイルとして保存
  console.log('[idVerificationStorage] メタデータをアップロード中...');
  const metadata = {
   sessionId: session.sessionId,
   startedAt: session.startedAt,
   completedAt: session.completedAt,
   totalDuration: session.totalDuration,
   deviceInfo: session.deviceInfo,
   completed: session.completed,
   stepMarkers: session.stepMarkers.map(marker => ({
    step: marker.step,
    challengeCode: marker.challengeCode,
    timestamp: marker.timestamp,
    timestampMs: marker.timestampMs,
    // snapshot は除外（別ファイルとして保存済み）
   })),
   uploadedAt: new Date().toISOString(),
   videoUrls,
   videoCount: videoUrls.length,
   snapshotUrls,
  };

  const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], {
   type: 'application/json',
  });
  const metadataRef = ref(storage, `${sessionFolder}/metadata.json`);
  await uploadBytes(metadataRef, metadataBlob, {
   contentType: 'application/json',
   customMetadata: {
    sessionId: session.sessionId,
   },
  });
  const metadataUrl = await getDownloadURL(metadataRef);
  console.log('[idVerificationStorage] メタデータアップロード完了:', metadataUrl);

  return {
   success: true,
   videoUrls,
   snapshotUrls,
   metadataUrl,
  };
 } catch (error) {
  console.error('[idVerificationStorage] 保存エラー:', error);
  return {
   success: false,
   error: error instanceof Error ? error.message : String(error),
  };
 }
}
