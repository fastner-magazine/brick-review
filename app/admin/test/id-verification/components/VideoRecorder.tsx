'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { RecordingStep, StepMarker, VerificationSession } from '../types';
import { generateChallengeCode, getDeviceInfo, getTimestamp, stepGuides, generateSessionId } from '../utils';

interface VideoRecorderProps {
  onComplete: (_session: VerificationSession) => void;
  onCancel: () => void;
}

const STEP_ORDER: RecordingStep[] = ['front', 'back', 'thickness', 'selfie'];

export default function VideoRecorder({ onComplete, onCancel }: VideoRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const completedVideosRef = useRef<Blob[]>([]); // 完成した動画を格納（外カメラ1本 + インカメラ1本）
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const stepMarkersRef = useRef<StepMarker[]>([]); // 最新のstepMarkersを保持

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparing, setIsPreparing] = useState(true);
  const [challengeCode, setChallengeCode] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stepMarkers, setStepMarkers] = useState<StepMarker[]>([]);
  const [sessionId] = useState(generateSessionId());
  const [sessionStartTime] = useState(new Date().toISOString());

  // 撮影準備のチェック項目
  const [checkBrightPlace, setCheckBrightPlace] = useState(false);
  const [checkHideMyNumber, setCheckHideMyNumber] = useState(false);
  const [checkShowFullId, setCheckShowFullId] = useState(false);

  const allChecked = checkBrightPlace && checkHideMyNumber && checkShowFullId;

  const currentStep = STEP_ORDER[currentStepIndex];
  const guide = stepGuides[currentStep];
  const isLastStep = currentStepIndex === STEP_ORDER.length - 1;

  // カメラ初期化（ステップに応じて背面/前面カメラを切り替える）
  const requestCamera = useCallback(async (facingMode: 'environment' | 'user' = 'environment') => {
    try {
      // 既存のストリームを停止
      if (streamRef.current) {
        console.log('[requestCamera] 既存ストリームを停止します');
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      // セキュアコンテキストでない場合やホスト名により制約があることをユーザーに伝える
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        // localhost と 127.0.0.1 は例外として扱われるが、リモートIPでアクセスしている場合は注意を促す
        const host = window.location.hostname;
        if (host !== 'localhost' && host !== '127.0.0.1') {
          throw new Error('セキュアな接続(HTTPS または localhost)でアクセスしてください。');
        }
      }

      console.log('[requestCamera] カメラを初期化します:', { facingMode });

      // facingModeに応じてカメラを起動
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: facingMode, // 引数で指定されたカメラを使用
        },
        audio: false,
      });

      streamRef.current = stream;
      console.log('[requestCamera] ストリーム取得成功:', stream.getVideoTracks()[0].getSettings());

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // ビデオのメタデータがロードされるまで待つ
        await new Promise<void>((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              console.log('[requestCamera] ビデオメタデータロード完了:', {
                videoWidth: videoRef.current?.videoWidth,
                videoHeight: videoRef.current?.videoHeight
              });
              resolve();
            };
          } else {
            resolve();
          }
        });
      }

      // 新しいチャレンジコード生成
      setChallengeCode(generateChallengeCode());
      setIsPreparing(false);
      setError(null);
    } catch (err: any) {
      console.error('Camera initialization error:', err);
      // エラーメッセージをより具体的に
      if (err && err.name === 'NotAllowedError') {
        setError('カメラへのアクセスが拒否されました。ブラウザのサイト設定でカメラ許可を有効にしてください。');
      } else if (err && err.name === 'NotFoundError') {
        setError('カメラが見つかりません。デバイスにカメラが搭載されているか確認してください。');
      } else {
        setError(String(err?.message ?? 'カメラの初期化中にエラーが発生しました。'));
      }
    }
  }, []);

  // 初回マウント時のみカメラを起動
  useEffect(() => {
    setIsPreparing(true);
    requestCamera();

    return () => {
      // アンマウント時にストリームを停止
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [requestCamera]);

  // ステップ変更時: ステップ4(selfie)ならインカメラに切り替え、それ以外は新しいチャレンジコード生成
  useEffect(() => {
    if (currentStepIndex > 0 && isRecording) {
      const nextStep = STEP_ORDER[currentStepIndex];
      console.log('[useEffect stepChange] ステップ変更:', {
        currentStepIndex,
        nextStep,
        isRecording,
        mediaRecorderState: mediaRecorderRef.current?.state,
        hasStream: !!streamRef.current,
      });

      if (nextStep === 'selfie') {
        // ステップ4(selfie)ならインカメラに切り替え
        console.log('[useEffect stepChange] セルフィーステップ: インカメラに切り替えます');
        console.log('[useEffect stepChange] 切り替え前のcompletedVideos:', {
          length: completedVideosRef.current.length,
          sizes: completedVideosRef.current.map(b => b.size)
        });
        setIsPreparing(true);

        // MediaRecorderを停止して外カメラ録画を確定
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          console.log('[useEffect stepChange] 古いMediaRecorder（外カメラ）を停止します');
          console.log('[useEffect stepChange] 古いRecorderの状態:', {
            state: mediaRecorderRef.current.state,
            hasOnstop: !!mediaRecorderRef.current.onstop,
          });

          const oldRecorder = mediaRecorderRef.current;

          // 本来のonstopハンドラを保存
          const originalOnstop = oldRecorder.onstop;

          // 停止時に発火するondataavailableは維持する必要がある
          oldRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              console.log('[useEffect stepChange] 古いRecorderから最終データチャンク:', event.data.size);
              chunksRef.current.push(event.data);
            }
          };

          // 停止時に外カメラ動画を完成させる
          oldRecorder.onstop = () => {
            console.log('[useEffect stepChange] *** 外カメラ録画完了処理開始 ***');
            console.log('[useEffect stepChange] chunksRef.current.length:', chunksRef.current.length);
            console.log('[useEffect stepChange] chunks詳細:', chunksRef.current.map((c, i) => ({ index: i, size: c.size })));

            const videoBlob = new Blob(chunksRef.current, { type: 'video/webm' });
            console.log('[useEffect stepChange] 作成された外カメラ動画:', {
              size: videoBlob.size,
              type: videoBlob.type,
              isValid: videoBlob.size > 1000
            });

            console.log('[useEffect stepChange] push前のcompletedVideos:', {
              length: completedVideosRef.current.length,
              sizes: completedVideosRef.current.map(b => b.size)
            });

            completedVideosRef.current.push(videoBlob);

            console.log('[useEffect stepChange] push後のcompletedVideos:', {
              length: completedVideosRef.current.length,
              sizes: completedVideosRef.current.map(b => b.size)
            });
            console.log('[useEffect stepChange] 動画1本目サイズ:', videoBlob.size, 'bytes');
            console.log('[useEffect stepChange] 現在のcompletedVideos詳細:', completedVideosRef.current.map((b, i) => ({
              index: i,
              size: b.size,
              type: b.type
            })));

            // chunksをクリアして次の動画用に準備
            chunksRef.current = [];
            console.log('[useEffect stepChange] chunksをクリア、2本目録画用に準備');
            console.log('[useEffect stepChange] *** 外カメラ録画完了処理終了 ***');

            // 外カメラ録画完了後にインカメラへ切り替え
            console.log('[useEffect stepChange] インカメラへの切り替えを開始します');
            requestCamera('user')
              .then(() => {
                console.log('[useEffect stepChange] インカメラ切り替え完了');

                // 新しいストリームでMediaRecorderを再作成
                if (streamRef.current) {
                  console.log('[useEffect stepChange] 新しいストリームで録画を継続します');

                  // 新しいMediaRecorderを作成
                  const newMediaRecorder = new MediaRecorder(streamRef.current, {
                    mimeType: 'video/webm;codecs=vp9',
                  });

                  newMediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                      chunksRef.current.push(event.data);
                      console.log('[useEffect stepChange] データチャンク追加:', event.data.size);
                    }
                  };

                  // 本来のonstopハンドラを新しいRecorderに設定
                  newMediaRecorder.onstop = originalOnstop;
                  console.log('[useEffect stepChange] 新しいRecorderにonstopを設定しました');

                  // MediaRecorderを置き換えて録画開始
                  mediaRecorderRef.current = newMediaRecorder;
                  newMediaRecorder.start();
                  console.log('[useEffect stepChange] 新しいMediaRecorderで録画継続中:', {
                    state: newMediaRecorder.state,
                    chunksCount: chunksRef.current.length,
                  });

                  // 少し遅延させてから有効化（ユーザーがカメラ切り替えを認識できるように）
                  setTimeout(() => {
                    console.log('[useEffect stepChange] ボタンを有効化します');
                    setIsPreparing(false);
                  }, 1000);
                } else {
                  console.error('[useEffect stepChange] streamがnullです');
                  setError('カメラストリームの取得に失敗しました。');
                  setIsPreparing(false);
                }
              })
              .catch(err => {
                console.error('[useEffect stepChange] インカメラ切り替えエラー:', err);
                setError('インカメラへの切り替えに失敗しました。');
                setIsPreparing(false);
              });
          };

          // MediaRecorderを停止（これが oldRecorder.onstop を呼び出す）
          oldRecorder.stop();
          console.log('[useEffect stepChange] oldRecorder.stop() 実行完了');
        } else {
          console.warn('[useEffect stepChange] MediaRecorderが録画状態ではありません:', {
            state: mediaRecorderRef.current?.state
          });
        }
      } else {
        // それ以外は新しいチャレンジコードを生成するだけ
        console.log('[useEffect stepChange] 通常ステップ: チャレンジコード生成のみ');
        setChallengeCode(generateChallengeCode());
      }
    } else {
      console.log('[useEffect stepChange] スキップ:', { currentStepIndex, isRecording });
    }
  }, [currentStepIndex, isRecording, requestCamera]);

  // クリーンアップ（コンポーネントアンマウント時）
  useEffect(() => {
    const currentStream = streamRef.current;
    const currentVideo = videoRef.current;

    return () => {
      console.log('[useEffect cleanup] コンポーネントアンマウント、カメラを停止します');
      if (currentStream) {
        const tracks = currentStream.getTracks();
        tracks.forEach(track => {
          console.log('[useEffect cleanup] トラック停止:', track.kind, track.label);
          track.stop();
        });
      }
      if (currentVideo) {
        currentVideo.srcObject = null;
      }
    };
  }, []);

  // 録画時間カウント
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  // 録画開始
  const startRecording = () => {
    if (!streamRef.current) return;

    console.log('[startRecording] 録画開始、完成動画を初期化します');
    chunksRef.current = [];
    completedVideosRef.current = []; // 録画開始時に初期化
    recordingStartTimeRef.current = Date.now();

    console.log('[startRecording] completedVideosRef初期化後:', {
      length: completedVideosRef.current.length
    });

    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: 'video/webm;codecs=vp9',
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      // 最後の動画（インカメラ）を完成させる
      console.log('[mediaRecorder.onstop] *** 最終録画停止処理開始 ***');
      console.log('[mediaRecorder.onstop] 停止前のcompletedVideos:', {
        length: completedVideosRef.current.length,
        sizes: completedVideosRef.current.map(b => b.size)
      });
      console.log('[mediaRecorder.onstop] chunksRef.current.length:', chunksRef.current.length);
      console.log('[mediaRecorder.onstop] chunks詳細:', chunksRef.current.map((chunk, i) => ({ index: i, size: chunk.size })));

      const finalBlob = new Blob(chunksRef.current, { type: 'video/webm' });
      console.log('[mediaRecorder.onstop] 2本目動画作成:', {
        size: finalBlob.size,
        type: finalBlob.type,
        isValid: finalBlob.size > 1000
      });

      console.log('[mediaRecorder.onstop] push前のcompletedVideos（2本目追加前）:', {
        length: completedVideosRef.current.length,
        sizes: completedVideosRef.current.map(b => b.size)
      });

      completedVideosRef.current.push(finalBlob);

      console.log('[mediaRecorder.onstop] push後のcompletedVideos（最終）:', {
        length: completedVideosRef.current.length,
        sizes: completedVideosRef.current.map(b => b.size)
      });
      console.log('[mediaRecorder.onstop] 全録画完了');
      console.log('[mediaRecorder.onstop] 完成動画数:', completedVideosRef.current.length);
      console.log('[mediaRecorder.onstop] 動画サイズ:', completedVideosRef.current.map(b => b.size));
      console.log('[mediaRecorder.onstop] 動画詳細:', completedVideosRef.current.map((b, i) => ({
        index: i,
        size: b.size,
        type: b.type,
        isValid: b.size > 1000 // 1KB以上なら有効とみなす
      })));      // カメラストリームを確実に停止
      console.log('[mediaRecorder.onstop] カメラストリームを停止します');
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks();
        console.log('[mediaRecorder.onstop] 停止するトラック数:', tracks.length);
        tracks.forEach(track => {
          console.log('[mediaRecorder.onstop] トラック停止:', track.kind, track.label);
          track.stop();
        });
        streamRef.current = null;
      }

      // refから最新のstepMarkersを取得
      const finalStepMarkers = stepMarkersRef.current;
      console.log('[mediaRecorder.onstop] 最終的なstepMarkers:', {
        count: finalStepMarkers.length,
        markers: finalStepMarkers.map(m => ({ step: m.step, hasSnapshot: !!m.snapshot }))
      });

      const session: VerificationSession = {
        sessionId,
        startedAt: sessionStartTime,
        completedAt: getTimestamp(),
        videoBlobs: [...completedVideosRef.current], // 2本の動画
        totalDuration: recordingTime,
        stepMarkers: finalStepMarkers, // refから取得した最新の値を使用
        deviceInfo: getDeviceInfo(),
        completed: true,
      };

      console.log('[mediaRecorder.onstop] セッション完了情報:', {
        sessionId: session.sessionId,
        videoBlobsCount: session.videoBlobs.length,
        videoBlobsSizes: session.videoBlobs.map(b => b.size),
        stepMarkersCount: session.stepMarkers.length,
        stepMarkersSteps: session.stepMarkers.map(m => m.step)
      });
      console.log('[mediaRecorder.onstop] onCompleteを呼び出します');
      onComplete(session);
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setIsRecording(true);
    setRecordingTime(0);
  };

  // シャッターボタン押下（ステップマーカー記録）
  // 
  // 【設計】
  // - 1回目押下: 録画開始のみ（ステップ1の画面のまま）
  // - 2回目押下: ステップ1のマーカー記録 + スナップショット + ステップ2へ進む
  // - 3回目押下: ステップ2のマーカー記録 + スナップショット + ステップ3へ進む
  // - 4回目押下: ステップ3のマーカー記録 + スナップショット + ステップ4へ進む
  // - 5回目押下: ステップ4のマーカー記録 + スナップショット + 録画停止・完了
  //
  // つまり、録画開始後は「現在のステップのスナップショット撮影 + マーカーを記録して次へ進む」が基本動作
  const handleShutter = () => {
    console.log('[handleShutter] 押下:', {
      isRecording,
      currentStep,
      currentStepIndex: currentStepIndex + 1,
      isLastStep,
      markersCount: stepMarkers.length
    });

    if (!isRecording) {
      // 初回押下: 録画を開始するのみ
      console.log('[handleShutter] 録画を開始します');
      startRecording();
      return;
    }

    // 録画中: スナップショットを撮影
    let snapshot: string | undefined;
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const context = canvas.getContext('2d', { willReadFrequently: false });

        if (context) {
          // ビデオの実際のサイズを取得
          const width = video.videoWidth;
          const height = video.videoHeight;

          if (width > 0 && height > 0) {
            // canvasのサイズを設定
            canvas.width = width;
            canvas.height = height;

            // ビデオフレームを描画
            context.drawImage(video, 0, 0, width, height);

            try {
              // JPEGとして高品質でエンコード
              snapshot = canvas.toDataURL('image/jpeg', 0.92);
              console.log('[handleShutter] スナップショット撮影完了:', {
                width,
                height,
                dataUrlLength: snapshot.length,
                preview: snapshot.substring(0, 50)
              });
            } catch (err) {
              console.error('[handleShutter] toDataURL エラー:', err);
            }
          } else {
            console.warn('[handleShutter] ビデオサイズが不正:', { width, height });
          }
        }
      } else {
        console.warn('[handleShutter] ビデオの準備が完了していません:', video.readyState);
      }
    }

    // 現在のステップのマーカーを記録
    const marker: StepMarker = {
      step: currentStep,
      challengeCode,
      timestamp: getTimestamp(),
      timestampMs: Date.now() - recordingStartTimeRef.current,
      snapshot,
    };

    console.log('[handleShutter] マーカー記録:', {
      step: marker.step,
      hasSnapshot: !!snapshot,
      snapshotLength: snapshot?.length,
      snapshotPreview: snapshot?.substring(0, 100),
      nextAction: isLastStep ? '→ 録画停止' : '→ 次のステップへ'
    });

    // stateとrefの両方を更新
    setStepMarkers(prev => {
      const updated = [...prev, marker];
      stepMarkersRef.current = updated; // refも同時に更新
      return updated;
    });

    if (isLastStep) {
      // 最後のステップなら録画停止（カメラ停止は mediaRecorder.onstop で行う）
      console.log('[handleShutter] 最終ステップ完了、録画を停止します');

      // MediaRecorderを停止（これが mediaRecorder.onstop を呼び出し、そこでカメラも停止される）
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        console.log('[handleShutter] MediaRecorder.stop() を呼び出します');
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      } else {
        console.warn('[handleShutter] MediaRecorder が既に停止しています');
      }
    } else {
      // 次のステップへ進む（カメラはそのまま、UIだけ変更）
      console.log('[handleShutter] 次のステップへ進みます:', {
        currentStepIndex,
        nextStepIndex: currentStepIndex + 1,
        nextStep: STEP_ORDER[currentStepIndex + 1],
        isRecording,
        mediaRecorderState: mediaRecorderRef.current?.state,
      });
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <div className="text-6xl mb-4">⚠️</div>
        <h2 className="text-2xl font-bold mb-4">エラー</h2>
        <p className="text-center mb-8">{error}</p>
        <button
          onClick={onCancel}
          className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold"
        >
          戻る
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* ビデオプレビュー */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        crossOrigin="anonymous"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* スナップショット撮影用のcanvas（非表示） */}
      <canvas ref={canvasRef} className="hidden" width="1920" height="1080" />

      {/* オーバーレイガイド */}
      <div className="absolute inset-0 pointer-events-none">
        {/* 撮影ガイド枠（録画中のみ表示） */}
        {isRecording && (
          <div className="absolute inset-0 flex items-center justify-center">
            {currentStep === 'selfie' ? (
              // 顔撮影: 縦長の楕円形（小さめ）
              <div className="relative w-48 h-64 border-4 border-white/50 rounded-full">
                <div className="absolute inset-0 border-4 border-red-500 rounded-full animate-pulse" />
              </div>
            ) : currentStep === 'thickness' ? (
              // 傾け撮影: 台形（高さを低く）
              <div className="relative w-[80%] max-w-md h-48 flex items-end justify-center">
                <svg
                  viewBox="0 0 400 200"
                  className="w-full h-full"
                  style={{ filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.3))' }}
                >
                  {/* 台形の枠線 */}
                  <path
                    d="M 100 0 L 300 0 L 400 200 L 0 200 Z"
                    fill="none"
                    stroke="rgba(255,255,255,0.5)"
                    strokeWidth="4"
                  />
                  <path
                    d="M 100 0 L 300 0 L 400 200 L 0 200 Z"
                    fill="none"
                    stroke="rgb(239,68,68)"
                    strokeWidth="4"
                    className="animate-pulse"
                  />
                </svg>
              </div>
            ) : (
              // 表面・裏面: 長方形
              <div className="relative w-[80%] max-w-md aspect-3/2 border-4 border-white/50 rounded-lg">
                <div className="absolute inset-0 border-4 border-red-500 rounded-lg animate-pulse" />
              </div>
            )}
          </div>
        )}

        {/* ステップガイド（中央上部配置） */}
        <div className="absolute top-8 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-6 py-6 rounded-xl w-[calc(100%-2rem)] max-w-2xl pointer-events-auto">
          {!isRecording ? (
            // 録画前: 撮影準備の注意事項を表示（チェックボックス付き）
            <>
              <div className="mb-4">
                <h3 className="text-xl font-bold text-center">撮影準備</h3>
                <div className="text-sm opacity-70 text-center">開始前の確認</div>
              </div>
              <div className="space-y-4">
                <label className="flex items-center gap-4 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={checkBrightPlace}
                      onChange={(e) => setCheckBrightPlace(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-6 h-6 rounded-lg border-2 transition-all duration-300 flex items-center justify-center ${checkBrightPlace
                      ? 'bg-yellow-400 border-yellow-400 shadow-lg shadow-yellow-400/50'
                      : 'border-yellow-400/60 bg-black/30 group-hover:border-yellow-400 group-hover:bg-yellow-400/10'
                      }`}>
                      {checkBrightPlace && (
                        <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4 group-hover:bg-yellow-500/30 group-hover:border-yellow-500/70 transition-all duration-300 shadow-lg backdrop-blur-sm">
                    <div className="font-bold text-yellow-300 mb-1 text-lg">💡 明るい場所で撮影</div>
                    <div className="text-sm text-yellow-100/90">照明が十分な場所を選んでください</div>
                  </div>
                </label>

                <label className="flex items-center gap-4 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={checkHideMyNumber}
                      onChange={(e) => setCheckHideMyNumber(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-6 h-6 rounded-lg border-2 transition-all duration-300 flex items-center justify-center ${checkHideMyNumber
                      ? 'bg-red-400 border-red-400 shadow-lg shadow-red-400/50'
                      : 'border-red-400/60 bg-black/30 group-hover:border-red-400 group-hover:bg-red-400/10'
                      }`}>
                      {checkHideMyNumber && (
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 bg-red-500/20 border border-red-500/50 rounded-lg p-4 group-hover:bg-red-500/30 group-hover:border-red-500/70 transition-all duration-300 shadow-lg backdrop-blur-sm">
                    <div className="font-bold text-red-300 mb-1 text-lg">🚫 マイナンバーを隠す</div>
                    <div className="text-sm text-red-100/90">裏面撮影時は必ず12桁を隠してください</div>
                  </div>
                </label>

                <label className="flex items-center gap-4 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={checkShowFullId}
                      onChange={(e) => setCheckShowFullId(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-6 h-6 rounded-lg border-2 transition-all duration-300 flex items-center justify-center ${checkShowFullId
                      ? 'bg-blue-400 border-blue-400 shadow-lg shadow-blue-400/50'
                      : 'border-blue-400/60 bg-black/30 group-hover:border-blue-400 group-hover:bg-blue-400/10'
                      }`}>
                      {checkShowFullId && (
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 bg-blue-500/20 border border-blue-500/50 rounded-lg p-4 group-hover:bg-blue-500/30 group-hover:border-blue-500/70 transition-all duration-300 shadow-lg backdrop-blur-sm">
                    <div className="font-bold text-blue-300 mb-1 text-lg">🪪 身分証全体を映す</div>
                    <div className="text-sm text-blue-100/90">四隅が枠内に収まるようにしてください</div>
                  </div>
                </label>
              </div>

              {!allChecked && (
                <div className="mt-4 text-center text-sm text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2">
                  ⚠️ すべての項目にチェックを入れてください
                </div>
              )}
            </>
          ) : isPreparing && currentStep === 'selfie' ? (
            // インカメラ切り替え中
            <>
              <div className="mb-3">
                <h3 className="text-lg font-bold text-center">📱 インカメラに切り替え中...</h3>
                <div className="text-xs opacity-70 text-center">しばらくお待ちください</div>
              </div>
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              </div>
            </>
          ) : (
            // 録画中: 現在のステップガイドを表示
            <>
              <div className="mb-3">
                <div className="text-xs opacity-70 text-center">
                  ステップ {currentStepIndex + 1}/{STEP_ORDER.length}
                </div>
                <h3 className="text-lg font-bold text-center">{guide.title}</h3>
              </div>
              <p className="text-sm mb-3 opacity-90">{guide.description}</p>
              <ul className="text-xs space-y-1 opacity-80">
                {guide.instructions.map((instruction, index) => (
                  <li key={index}>• {instruction}</li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* 録画時間表示（説明と重ならないよう下側へ移動） */}
        {isRecording && (
          <div className="absolute bottom-28 left-8 bg-red-600 text-white px-4 py-2 rounded-full font-mono font-bold flex items-center gap-2 z-30">
            <span className="w-3 h-3 bg-white rounded-full animate-pulse" />
            {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
          </div>
        )}
      </div>

      {/* コントロールボタン */}
      {/* 
        シャッターボタンの動作:
        - 未録画時: 「開始」→ 録画開始のみ
        - 録画中(ステップ1-3): 「撮影N」→ 現在ステップのマーカー記録 + 次へ
        - 録画中(最終ステップ4): 「完了」→ ステップ4マーカー記録 + 録画停止
        
        合計5回押下が必要: 開始(1) + 撮影1(2) + 撮影2(3) + 撮影3(4) + 完了(5)
      */}
      <div className="absolute bottom-8 left-0 right-0 px-4 z-40">
        {/* ステップインジケーター（録画中のみ表示） */}
        {isRecording && (
          <div className="flex justify-center mb-4">
            <div className="bg-black/70 px-6 py-3 rounded-full flex items-center gap-3">
              {STEP_ORDER.map((step, idx) => (
                <div
                  key={step}
                  className={`w-3 h-3 rounded-full transition-all ${stepMarkers.some(m => m.step === step)
                    ? 'bg-green-500'
                    : idx === currentStepIndex
                      ? 'bg-blue-500 animate-pulse'
                      : 'bg-gray-500'
                    }`}
                  title={stepGuides[step].title}
                />
              ))}
            </div>
          </div>
        )}

        {/* ボタンエリア */}
        <div className="flex justify-center items-center gap-4">
          {!isRecording && (
            <button
              onClick={onCancel}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
            >
              キャンセル
            </button>
          )}

          <button
            onClick={handleShutter}
            disabled={isPreparing || (!isRecording && !allChecked)}
            aria-label="シャッターボタン"
            className={`w-24 h-24 rounded-full flex flex-col items-center justify-center shadow-2xl transition-transform transform disabled:opacity-50 disabled:scale-100 ${!isRecording
              ? allChecked
                ? 'bg-red-600 hover:scale-105 text-white cursor-pointer'
                : 'bg-gray-600 text-gray-300 cursor-not-allowed'
              : isLastStep
                ? 'bg-green-600 hover:scale-105 text-white'
                : 'bg-blue-500 hover:scale-105 text-white'
              }`}
          >
            <div className="text-3xl">
              {!isRecording ? (allChecked ? '🎬' : '⚠️') : isLastStep ? '✅' : '📸'}
            </div>
            <div className="text-xs font-bold mt-1">
              {!isRecording
                ? allChecked ? '開始' : '確認中'
                : isLastStep
                  ? '完了'
                  : `撮影${currentStepIndex + 1}`}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
