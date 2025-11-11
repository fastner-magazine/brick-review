'use client';

import { useState, useEffect } from 'react';
import { VerificationSession } from './types';
import VideoRecorder from './components/VideoRecorder';
import { saveVerificationSession } from '@/lib/idVerificationStorage';

export default function IdVerificationTestPage() {
 const [isStarted, setIsStarted] = useState(false);
 const [completedSession, setCompletedSession] = useState<VerificationSession | null>(null);
 const [videoUrls, setVideoUrls] = useState<string[]>([]);
 const [snapshotUrls, setSnapshotUrls] = useState<Record<string, string>>({});
 const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
 const [uploadError, setUploadError] = useState<string | null>(null);

 // 撮影準備のチェック項目
 const [checkBrightPlace, setCheckBrightPlace] = useState(false);
 const [checkHideMyNumber, setCheckHideMyNumber] = useState(false);
 const [checkShowFullId, setCheckShowFullId] = useState(false);

 const allChecked = checkBrightPlace && checkHideMyNumber && checkShowFullId;

 const handleStart = () => {
  setIsStarted(true);
  setCompletedSession(null);
  // チェック状態をリセット
  setCheckBrightPlace(false);
  setCheckHideMyNumber(false);
  setCheckShowFullId(false);
 };

 const handleComplete = async (session: VerificationSession) => {
  console.log('=== HANDLE COMPLETE START ===');
  console.log('受信したセッション:', session);
  console.log('動画数:', session.videoBlobs.length);
  console.log('動画詳細:', session.videoBlobs.map((blob, i) => ({
   index: i,
   size: blob.size,
   type: blob.type,
   isValidSize: blob.size > 1000
  })));
  console.log('ステップマーカー数:', session.stepMarkers.length);
  console.log('ステップマーカー詳細:', session.stepMarkers.map((m, i) => ({
   index: i,
   step: m.step,
   hasSnapshot: !!m.snapshot,
   snapshotLength: m.snapshot?.length
  })));
  console.log('=== HANDLE COMPLETE SESSION DATA ===');

  setCompletedSession(session);
  setIsStarted(false);

  // 動画のBlobからURLを生成（プレビュー用、複数）
  console.log('動画URL生成開始...');
  const urls = session.videoBlobs.map((blob, i) => {
   const url = URL.createObjectURL(blob);
   console.log(`動画${i + 1}のURL生成:`, url, 'サイズ:', blob.size);
   return url;
  });
  setVideoUrls(urls);
  console.log('生成されたURL数:', urls.length);

  // Firebase Storageに保存
  setUploadStatus('uploading');
  setUploadError(null);

  try {
   console.log('[handleComplete] Firebase Storageへアップロード開始');
   const result = await saveVerificationSession(session);

   if (result.success) {
    console.log('[handleComplete] アップロード成功:', {
     videoUrls: result.videoUrls,
     snapshotUrls: result.snapshotUrls,
     metadataUrl: result.metadataUrl,
    });
    setUploadStatus('success');
    if (result.snapshotUrls) {
     setSnapshotUrls(result.snapshotUrls);
    }
   } else {
    throw new Error(result.error || 'アップロードに失敗しました');
   }
  } catch (error) {
   console.error('[handleComplete] アップロードエラー:', error);
   setUploadStatus('error');
   setUploadError(error instanceof Error ? error.message : String(error));
  }
 };

 const handleCancel = () => {
  setIsStarted(false);
 };

 // クリーンアップ: コンポーネントのアンマウント時にvideoUrlsを解放
 useEffect(() => {
  return () => {
   videoUrls.forEach(url => URL.revokeObjectURL(url));
  };
 }, [videoUrls]);

 if (isStarted) {
  return <VideoRecorder onComplete={handleComplete} onCancel={handleCancel} />;
 }

 return (
  <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
   <div className="container mx-auto px-4 py-12">
    <div className="max-w-3xl mx-auto">
     <h1 className="text-4xl font-bold text-center mb-4 text-gray-800">
      身分証動画撮影システム（テスト）
     </h1>
     <p className="text-center text-gray-600 mb-8">
      古物商法対応版 - カメラのみ使用、チャレンジコード付き
     </p>

     {!completedSession ? (
      <div className="bg-white rounded-xl shadow-lg p-8">
       <div className="text-6xl text-center mb-6">📹</div>

       <h2 className="text-2xl font-bold mb-4 text-center">撮影の流れ</h2>

       <div className="space-y-4 mb-8">
        <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg">
         <span className="text-3xl">📄</span>
         <div>
          <h3 className="font-bold mb-1">1. 身分証の表面</h3>
          <p className="text-sm text-gray-600">録画開始後、表面全体をゆっくり左右に傾けて撮影</p>
         </div>
        </div>

        <div className="flex items-start gap-4 p-4 bg-green-50 rounded-lg">
         <span className="text-3xl">�</span>
         <div>
          <h3 className="font-bold mb-1">2. 身分証の裏面</h3>
          <p className="text-sm text-gray-600">裏返して裏面全体を撮影</p>
         </div>
        </div>

        <div className="flex items-start gap-4 p-4 bg-amber-50 rounded-lg">
         <span className="text-3xl">�</span>
         <div>
          <h3 className="font-bold mb-1">3. 身分証の厚み</h3>
          <p className="text-sm text-gray-600">斜めに持って厚みと側面を撮影</p>
         </div>
        </div>

        <div className="flex items-start gap-4 p-4 bg-purple-50 rounded-lg">
         <span className="text-3xl">🤳</span>
         <div>
          <h3 className="font-bold mb-1">4. セルフィー＆身分証</h3>
          <p className="text-sm text-gray-600">インカメラに切り替わり、顔と身分証を同時に撮影</p>
         </div>
        </div>
       </div>

       {/* 撮影準備チェックリスト */}
       <div className="bg-yellow-50 border-3 border-yellow-400 rounded-xl p-6 mb-8 min-h-[280px]">
        <h3 className="font-bold text-yellow-900 mb-4 text-lg flex items-center gap-2">
         <span className="text-2xl">⚠️</span>
         撮影前の確認事項
        </h3>
        <div className="space-y-5">
         <label className="flex items-start gap-4 cursor-pointer group">
          <input
           type="checkbox"
           checked={checkBrightPlace}
           onChange={(e) => setCheckBrightPlace(e.target.checked)}
           className="mt-1 w-6 h-6 rounded border-2 border-yellow-600 text-yellow-600 focus:ring-2 focus:ring-yellow-500 cursor-pointer"
          />
          <div className="flex-1">
           <div className="font-bold text-yellow-900 text-base group-hover:text-yellow-700 transition-colors">
            💡 明るい場所で撮影します
           </div>
           <div className="text-sm text-yellow-800 mt-1">
            照明が十分な場所を選び、文字がはっきり読めることを確認してください
           </div>
          </div>
         </label>

         <label className="flex items-start gap-4 cursor-pointer group">
          <input
           type="checkbox"
           checked={checkHideMyNumber}
           onChange={(e) => setCheckHideMyNumber(e.target.checked)}
           className="mt-1 w-6 h-6 rounded border-2 border-red-600 text-red-600 focus:ring-2 focus:ring-red-500 cursor-pointer"
          />
          <div className="flex-1">
           <div className="font-bold text-red-900 text-base group-hover:text-red-700 transition-colors">
            🚫 マイナンバー（12桁）を隠します
           </div>
           <div className="text-sm text-red-800 mt-1">
            裏面撮影時は必ずマイナンバーを付箋や指で完全に隠してください
           </div>
          </div>
         </label>

         <label className="flex items-start gap-4 cursor-pointer group">
          <input
           type="checkbox"
           checked={checkShowFullId}
           onChange={(e) => setCheckShowFullId(e.target.checked)}
           className="mt-1 w-6 h-6 rounded border-2 border-blue-600 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
          />
          <div className="flex-1">
           <div className="font-bold text-blue-900 text-base group-hover:text-blue-700 transition-colors">
            🪪 身分証の四隅全体を枠内に収めます
           </div>
           <div className="text-sm text-blue-800 mt-1">
            文字や写真がぼやけないよう、ピントを合わせてください
           </div>
          </div>
         </label>
        </div>
       </div>

       {/* 撮影開始ボタン（中央配置） */}
       <div className="flex justify-center">
        <button
         onClick={handleStart}
         disabled={!allChecked}
         className={`px-12 py-4 rounded-lg font-bold text-xl transition-all transform shadow-lg ${allChecked
          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white hover:scale-[1.02] cursor-pointer'
          : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
          }`}
        >
         {allChecked ? '✓ 撮影を開始' : '⚠️ 上記をすべて確認してください'}
        </button>
       </div>

       {!allChecked && (
        <p className="text-center text-sm text-gray-500 mt-3">
         すべての項目にチェックを入れると撮影を開始できます
        </p>
       )}
      </div>
     ) : (
      <div className="bg-white rounded-xl shadow-lg p-8">
       <div className="text-6xl text-center mb-6">✅</div>

       <h2 className="text-2xl font-bold mb-4 text-center text-green-600">
        撮影完了
       </h2>

       {/* アップロード状態表示 */}
       {uploadStatus === 'uploading' && (
        <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4 mb-6">
         <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <div>
           <div className="font-bold text-blue-800">Firebase Storageへアップロード中...</div>
           <div className="text-sm text-blue-600">動画とスナップショットを保存しています</div>
          </div>
         </div>
        </div>
       )}

       {uploadStatus === 'success' && (
        <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4 mb-6">
         <div className="font-bold text-green-800 mb-2">✅ Firebase Storageへの保存完了</div>
         <div className="text-sm text-green-600">
          動画とスナップショットが正常に保存されました
         </div>
        </div>
       )}

       {uploadStatus === 'error' && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-6">
         <div className="font-bold text-red-800 mb-2">❌ アップロードエラー</div>
         <div className="text-sm text-red-600">{uploadError}</div>
        </div>
       )}

       <div className="bg-gray-50 rounded-lg p-6 mb-6">
        <h3 className="font-bold mb-3">セッション情報</h3>
        <div className="space-y-2 text-sm">
         <div className="flex justify-between">
          <span className="text-gray-600">セッションID:</span>
          <span className="font-mono text-xs">{completedSession.sessionId}</span>
         </div>
         <div className="flex justify-between">
          <span className="text-gray-600">開始時刻:</span>
          <span>{new Date(completedSession.startedAt).toLocaleString('ja-JP')}</span>
         </div>
         <div className="flex justify-between">
          <span className="text-gray-600">総録画時間:</span>
          <span>{completedSession.totalDuration}秒</span>
         </div>
         <div className="flex justify-between">
          <span className="text-gray-600">録画動画数:</span>
          <span className="font-bold text-blue-600">{completedSession.videoBlobs.length}本</span>
         </div>
         <div className="flex justify-between">
          <span className="text-gray-600">ステップマーカー:</span>
          <span>{completedSession.stepMarkers.length}件</span>
         </div>
        </div>
       </div>

       <div className="space-y-3 mb-6">
        <h3 className="font-bold">記録されたステップ</h3>
        {completedSession.stepMarkers.map((marker, index) => {
         console.log(`Marker ${index}:`, {
          step: marker.step,
          hasSnapshot: !!marker.snapshot,
          hasStorageUrl: !!snapshotUrls[marker.step],
          snapshotPreview: marker.snapshot?.substring(0, 30)
         });

         // Firebase StorageのURLがあればそれを優先、なければBase64を使用
         const imageUrl = snapshotUrls[marker.step] || marker.snapshot;

         return (
          <div key={index} className="p-3 bg-green-50 rounded-lg">
           <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">✓</span>
            <div className="flex-1">
             <div className="font-semibold">{marker.step}</div>
             <div className="text-xs text-gray-600">
              コード: {marker.challengeCode} | {(marker.timestampMs / 1000).toFixed(1)}秒時点
              {imageUrl && (
               <span className="ml-2 text-green-600">
                📸 {snapshotUrls[marker.step] ? 'Storage保存済み' : 'スナップあり'}
               </span>
              )}
             </div>
            </div>
           </div>
           {imageUrl ? (
            <div className="mt-2">
             {/* eslint-disable-next-line */}
             <img
              src={imageUrl}
              alt={`${marker.step} スナップショット`}
              className="w-full rounded border-2 border-green-300"
              onError={(e) => {
               console.error('画像読み込みエラー:', marker.step, e);
               e.currentTarget.style.display = 'none';
              }}
              onLoad={() => {
               console.log('画像読み込み成功:', marker.step);
              }}
             />
            </div>
           ) : (
            <div className="mt-2 text-xs text-red-600">
             ⚠️ スナップショットがありません
            </div>
           )}
          </div>
         );
        })}
       </div>

       {videoUrls.length > 0 && (
        <div className="mb-6">
         <h3 className="font-bold mb-3">録画された動画（{videoUrls.length}本）</h3>
         <div className="space-y-4">
          {videoUrls.map((url, index) => (
           <div key={index} className="border-2 border-blue-300 rounded-lg p-4 bg-blue-50">
            <div className="font-semibold mb-2 text-blue-800">
             {index === 0 ? '📹 動画1: 外カメラ（表面・裏面・厚み）' : '📹 動画2: インカメラ（セルフィー）'}
            </div>
            <video
             src={url}
             controls
             className="w-full rounded-lg border-2 border-gray-300 bg-black"
            >
             <track kind="captions" />
            </video>
           </div>
          ))}
         </div>
        </div>
       )}

       <div className="mb-6">
        <h3 className="font-bold mb-3">記録されたステップマーカー</h3>
        <div className="space-y-3">
         {completedSession.stepMarkers.map((marker, index) => {
          const storageUrl = snapshotUrls[marker.step];
          const base64Snapshot = marker.snapshot;
          const imageUrl = storageUrl || base64Snapshot;

          return (
           <div key={index} className="border-2 border-green-300 rounded-lg p-4 bg-green-50">
            <div className="flex items-center gap-3 mb-2">
             <span className="text-2xl">✓</span>
             <div className="flex-1">
              <div className="font-semibold">{marker.step}</div>
              <div className="text-xs text-gray-600">
               コード: {marker.challengeCode} | {(marker.timestampMs / 1000).toFixed(1)}秒時点
               {imageUrl && (
                <span className="ml-2 text-green-600">
                 📸 {storageUrl ? 'Storage保存済み' : 'スナップあり'}
                </span>
               )}
              </div>
             </div>
            </div>
            {imageUrl && (
             <div className="mt-2">
              {/* eslint-disable-next-line */}
              <img
               src={imageUrl}
               alt={`${marker.step} スナップショット`}
               className="w-full rounded border-2 border-green-300"
              />
             </div>
            )}
           </div>
          );
         })}
        </div>
       </div>

       <button
        onClick={() => {
         setCompletedSession(null);
         setSnapshotUrls({});
         setUploadStatus('idle');
         setUploadError(null);
         handleStart();
        }}
        className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors"
       >
        再度撮影する
       </button>
      </div>
     )}
    </div>
   </div>
  </main>
 );
}
