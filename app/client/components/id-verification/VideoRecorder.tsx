'use client';

import React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { RecordingStep, StepMarker, VerificationSession } from './types';
import { generateChallengeCode, getDeviceInfo, getTimestamp, stepGuides, generateSessionId } from './utils';
import { validateImageQuality, getDetailedQualityInfo, type ImageQuality } from '../../lib/imageQualityValidator';

interface VideoRecorderProps {
  onComplete: (_session: VerificationSession) => void;
  onCancel: () => void;
}

const STEP_ORDER: RecordingStep[] = ['front', 'back', 'thickness', 'selfie'];

// Thickness step SVG paths (16:10 aspect ratio: 400x250)
// Note: use inner rectangle coords (inset 6px) so path doesn't occlude outer white frame
const THICKNESS_START_PATH = 'M 6 6 L 394 6 L 394 244 L 6 244 Z'; // Rectangle (inner rect)
// Top edge narrowed from full width to (80..320) offset by inset: 80+6=86, 320+6=326
const THICKNESS_FINAL_PATH = 'M 86 6 L 326 6 L 394 244 L 6 244 Z'; // Trapezoid (narrowed top)
// Outer paths (white frame) should follow the inner morph but with outer coords (0..400)
const OUTER_START_PATH = 'M 0 0 L 400 0 L 400 250 L 0 250 Z';
const OUTER_FINAL_PATH = 'M 80 0 L 320 0 L 400 250 L 0 250 Z';

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
  const [stepTransition, setStepTransition] = useState<'flip' | 'tilt' | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showSelfieConfirmation, setShowSelfieConfirmation] = useState(false);
  const [thicknessPath, setThicknessPath] = useState(THICKNESS_START_PATH);
  const [outerThicknessPath, setOuterThicknessPath] = useState(OUTER_START_PATH);
  const thicknessAnimationFrame = useRef<number | null>(null);
  const prevStepRef = useRef<RecordingStep | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const rotationFinishedRef = useRef(false);
  const pendingStepTransitionRef = useRef(false); // 回転完了後にステップ遷移するフラグ
  const startAnimRef = useRef<(_reverse?: boolean) => void>(() => {});

  // Helper: parse a simple M/L SVG path into array of [x,y]
  const parsePathPoints = (path: string): number[][] => {
    const nums = path.match(/-?\d+\.?\d*/g);
    if (!nums) return [];
    const pts: number[][] = [];
    for (let i = 0; i < nums.length; i += 2) {
      pts.push([parseFloat(nums[i]), parseFloat(nums[i + 1])]);
    }
    return pts;
  };

  const buildPathFromPoints = (pts: number[][]) => {
    if (!pts || pts.length === 0) return THICKNESS_START_PATH;
    const parts = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`);
    return `${parts.join(' ')} Z`;
  };

  // 撮影準備のチェック項目
  const [checkBrightPlace, setCheckBrightPlace] = useState(false);
  const [checkHideMyNumber, setCheckHideMyNumber] = useState(false);
  const [checkShowFullId, setCheckShowFullId] = useState(false);

  // 画像品質判定
  const [currentImageQuality, setCurrentImageQuality] = useState<ImageQuality | null>(null);
  const [isValidatingQuality, setIsValidatingQuality] = useState(false);
  const [lastQualityCheck, setLastQualityCheck] = useState<Date | null>(null);

  const allChecked = checkBrightPlace && checkHideMyNumber && checkShowFullId;

  const currentStep = STEP_ORDER[currentStepIndex];
  const guide = stepGuides[currentStep];
  const isLastStep = currentStepIndex === STEP_ORDER.length - 1;

  // カメラ初期化（ステップに応じて背面/前面カメラを切り替える）
  const requestCamera = useCallback(async (facingMode: 'environment' | 'user' = 'environment') => {
    try {
      // 既存のストリームを停止
      if (streamRef.current) {
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

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // ビデオのメタデータがロードされるまで待つ
        await new Promise<void>((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
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

  // インカメラ切り替え処理
  const switchToSelfieCamera = useCallback(() => {
    console.log('[switchToSelfieCamera] インカメラ切り替え開始');
    setIsPreparing(true);
    setShowSelfieConfirmation(false);

    // MediaRecorderを停止して外カメラ録画を確定
    if (mediaRecorderRef.current) {
      console.log('[switchToSelfieCamera] MediaRecorder state:', mediaRecorderRef.current.state);

      // 録画中でない場合は、直接カメラ切り替えを行う
      if (mediaRecorderRef.current.state !== 'recording') {
        console.log('[switchToSelfieCamera] MediaRecorderが録画中でないため、直接カメラ切り替えを実行');

        // 現在のchunksから外カメラ動画を完成させる
        if (chunksRef.current.length > 0) {
          const videoBlob = new Blob(chunksRef.current, { type: 'video/webm' });
          completedVideosRef.current.push(videoBlob);
          chunksRef.current = [];
        }

        // インカメラへ切り替え
        requestCamera('user')
          .then(() => {
            console.log('[switchToSelfieCamera] インカメラ切り替え完了');

            if (streamRef.current) {
              // 新しいMediaRecorderを作成
              const newMediaRecorder = new MediaRecorder(streamRef.current, {
                mimeType: 'video/webm;codecs=vp9',
              });

              newMediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                  chunksRef.current.push(event.data);
                }
              };

              // 停止時に最後の動画を完成させる
              newMediaRecorder.onstop = async () => {
                const finalBlob = new Blob(chunksRef.current, { type: 'video/webm' });
                completedVideosRef.current.push(finalBlob);

                if (streamRef.current) {
                  streamRef.current.getTracks().forEach(track => track.stop());
                  streamRef.current = null;
                }

                setShowConfirmation(true);
              };

              mediaRecorderRef.current = newMediaRecorder;
              newMediaRecorder.start();
              console.log('[switchToSelfieCamera] 新しいMediaRecorderで録画開始');

              // ステップを進める
              setCurrentStepIndex(prev => prev + 1);

              setTimeout(() => {
                setIsPreparing(false);
              }, 1000);
            } else {
              console.error('[switchToSelfieCamera] カメラストリームの取得に失敗');
              setError('カメラストリームの取得に失敗しました。');
              setIsPreparing(false);
            }
          })
          .catch((err) => {
            console.error('[switchToSelfieCamera] インカメラ切り替えエラー:', err);
            setError('インカメラへの切り替えに失敗しました。');
            setIsPreparing(false);
          });

        return;
      }

      const oldRecorder = mediaRecorderRef.current;

      // 本来のonstopハンドラを保存
      const originalOnstop = oldRecorder.onstop;

      // 停止時に発火するondataavailableは維持する必要がある
      oldRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // 停止時に外カメラ動画を完成させる
      oldRecorder.onstop = () => {
        console.log('[switchToSelfieCamera] oldRecorder.onstop: 外カメラ録画停止');
        const videoBlob = new Blob(chunksRef.current, { type: 'video/webm' });

        completedVideosRef.current.push(videoBlob);

        // chunksをクリアして次の動画用に準備
        chunksRef.current = [];

        // 外カメラ録画完了後にインカメラへ切り替え
        requestCamera('user')
          .then(() => {
            console.log('[switchToSelfieCamera] インカメラ切り替え完了');

            // 新しいストリームでMediaRecorderを再作成
            if (streamRef.current) {
              console.log('[switchToSelfieCamera] 新しいストリームで録画を継続します');

              // 新しいMediaRecorderを作成
              const newMediaRecorder = new MediaRecorder(streamRef.current, {
                mimeType: 'video/webm;codecs=vp9',
              });

              newMediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                  chunksRef.current.push(event.data);
                }
              };

              // 本来のonstopハンドラを新しいRecorderに設定
              newMediaRecorder.onstop = originalOnstop;

              // MediaRecorderを置き換えて録画開始
              mediaRecorderRef.current = newMediaRecorder;
              newMediaRecorder.start();

              // ステップを進める
              setCurrentStepIndex(prev => prev + 1);

              // 少し遅延させてから有効化（ユーザーがカメラ切り替えを認識できるように）
              setTimeout(() => {
                setIsPreparing(false);
              }, 1000);
            } else {
              console.error('[switchToSelfieCamera] カメラストリームの取得に失敗');
              setError('カメラストリームの取得に失敗しました。');
              setIsPreparing(false);
            }
          })
          .catch((err) => {
            console.error('[switchToSelfieCamera] インカメラ切り替えエラー:', err);
            setError('インカメラへの切り替えに失敗しました。');
            setIsPreparing(false);
          });
      };

      // MediaRecorderを停止（これが oldRecorder.onstop を呼び出す）
      oldRecorder.stop();
      console.log('[switchToSelfieCamera] MediaRecorder停止命令を送信');
    } else {
      console.error('[switchToSelfieCamera] mediaRecorderRefが存在しません');
      setError('録画エラー: MediaRecorderが見つかりません。');
      setIsPreparing(false);
    }
  }, [requestCamera]);

  // ステップ変更時: それ以外のステップでは新しいチャレンジコード生成
  useEffect(() => {
    if (currentStepIndex > 0 && isRecording) {
      const nextStep = STEP_ORDER[currentStepIndex];

      // selfieステップへの遷移は手動で行うため、ここでは何もしない
      if (nextStep !== 'selfie') {
        // それ以外は新しいチャレンジコードを生成するだけ
        setChallengeCode(generateChallengeCode());
      }
    }
  }, [currentStepIndex, isRecording]);

  // クリーンアップ（コンポーネントアンマウント時）
  useEffect(() => {
    const currentStream = streamRef.current;
    const currentVideo = videoRef.current;

    return () => {
      if (currentStream) {
        const tracks = currentStream.getTracks();
        tracks.forEach(track => {
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

    chunksRef.current = [];
    completedVideosRef.current = []; // 録画開始時に初期化
    recordingStartTimeRef.current = Date.now();

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
      const finalBlob = new Blob(chunksRef.current, { type: 'video/webm' });

      completedVideosRef.current.push(finalBlob);

      // カメラストリームを確実に停止
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks();
        tracks.forEach(track => {
          track.stop();
        });
        streamRef.current = null;
      }

      // 確認画面を表示
      setShowConfirmation(true);
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
    if (!isRecording) {
      // 初回押下: 録画を開始するのみ
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

              // 画像品質判定を非同期で実行（ユーザーフローはブロックしない）
              if (snapshot) {
                setIsValidatingQuality(true);
                validateImageQuality(snapshot)
                  .then((quality) => {
                    setCurrentImageQuality(quality);
                    setLastQualityCheck(new Date());
                    setIsValidatingQuality(false);

                    const qualityInfo = getDetailedQualityInfo(quality);
                    console.log('[VideoRecorder] Image quality:', qualityInfo);

                    // 品質が悪い場合は警告を表示（オプション）
                    if (!quality.isGoodQuality) {
                      console.warn('[VideoRecorder] Quality issues detected:', qualityInfo.message);
                    }
                  })
                  .catch((err) => {
                    console.error('[VideoRecorder] Quality validation error:', err);
                    setIsValidatingQuality(false);
                  });
              }
            } catch {
              // Encoding error - snapshot will remain undefined
            }
          }
        }
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

    // stateとrefの両方を更新
    setStepMarkers(prev => {
      const updated = [...prev, marker];
      stepMarkersRef.current = updated; // refも同時に更新
      return updated;
    });

    if (isLastStep) {
      // 最後のステップなら録画停止（カメラ停止は mediaRecorder.onstop で行う）

      // MediaRecorderを停止（これが mediaRecorder.onstop を呼び出し、そこでカメラも停止される）
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    } else {
      // 次のステップへ進む前にアニメーションをトリガー
      const nextStep = STEP_ORDER[currentStepIndex + 1];

      // front→back: flip（裏面への回転のみ）
      if (currentStep === 'front' && nextStep === 'back') {
        setStepTransition('flip');
        rotationFinishedRef.current = false; // リセット

        // アニメーション後にステップを進める
        setTimeout(() => {
          setCurrentStepIndex(prev => prev + 1);
          setStepTransition(null);
        }, 1400);
      } else if (currentStep === 'back' && nextStep === 'thickness') {
        // back→thickness: 回転→台形化（ステップ遷移後）
        setStepTransition('flip'); // 再度回転（裏面を見せる）
        rotationFinishedRef.current = false; // リセット
        pendingStepTransitionRef.current = true; // ステップ遷移を予約

        // 回転完了後にステップ遷移し、その後currentStep=thicknessでモーフアニメーション自動開始
      } else if (currentStep === 'thickness' && nextStep === 'selfie') {
        // thickness→selfie: インカメラ切り替えはuseEffectで自動実行されるので、即座にステップを進める
        setCurrentStepIndex(prev => prev + 1);
      } else {
        // それ以外は即座にステップを進める
        setCurrentStepIndex(prev => prev + 1);
      }
    }
  };

  // Listen for transitionend on frameRef to detect rotation completion
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const handleTransitionEnd = (e: TransitionEvent) => {
      // Only respond to transform transitions on the frame element itself
      if (e.target === frame && e.propertyName === 'transform') {
        console.log('[transitionend] Rotation animation completed');
        rotationFinishedRef.current = true;

        // If we have a pending step transition (back→thickness flow), advance step
        if (pendingStepTransitionRef.current) {
          console.log('[transitionend] Advancing to thickness step after rotation');
          pendingStepTransitionRef.current = false;
          setCurrentStepIndex(prev => prev + 1);
          setStepTransition(null);
          // モーフアニメーションはcurrentStepがthicknessになったときのuseEffectで自動開始される
        }
      }
    };

    frame.addEventListener('transitionend', handleTransitionEnd);

    return () => {
      frame.removeEventListener('transitionend', handleTransitionEnd);
    };
  }, []);

  // Thickness trapezoid morph animation when entering/exiting thickness step
  useEffect(() => {
  const startPts = parsePathPoints(THICKNESS_START_PATH);
  const finalPts = parsePathPoints(THICKNESS_FINAL_PATH);
  const outerStartPts = parsePathPoints(OUTER_START_PATH);
  const outerFinalPts = parsePathPoints(OUTER_FINAL_PATH);
    if (startPts.length === 0 || finalPts.length === 0 || startPts.length !== finalPts.length) return;
  if (outerStartPts.length === 0 || outerFinalPts.length === 0 || outerStartPts.length !== outerFinalPts.length) return;

    const duration = 500; // ms
    let startTime: number | null = null;

  const step = (timestamp: number, reverse = false) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const t = Math.min(1, elapsed / duration);
      const prog = reverse ? 1 - t : t;
  const pts = startPts.map((sp, i) => {
        const fp = finalPts[i];
        const x = sp[0] + (fp[0] - sp[0]) * prog;
        const y = sp[1] + (fp[1] - sp[1]) * prog;
        return [x, y];
      });
      setThicknessPath(buildPathFromPoints(pts));
      const outerPts = outerStartPts.map((sp, i) => {
        const fp = outerFinalPts[i];
        const x = sp[0] + (fp[0] - sp[0]) * prog;
        const y = sp[1] + (fp[1] - sp[1]) * prog;
        return [x, y];
      });
      setOuterThicknessPath(buildPathFromPoints(outerPts));
      if (t < 1) {
        thicknessAnimationFrame.current = requestAnimationFrame((ts) => step(ts, reverse));
      } else {
        thicknessAnimationFrame.current = null;
        console.log('[Morph animation] Completed');
        // ステップ遷移は transitionend で既に実行済み
      }
    };

  const delayTimer: ReturnType<typeof setTimeout> | null = null;
    const startAnim = (reverse = false) => {
      if (thicknessAnimationFrame.current) cancelAnimationFrame(thicknessAnimationFrame.current);
      thicknessAnimationFrame.current = requestAnimationFrame((ts) => step(ts, reverse));
    };
    startAnimRef.current = startAnim;

  if (currentStep === 'thickness') {
      // thicknessステップに入ったら即座にモーフアニメーション開始
      // (back→thicknessの場合、既にtransitionendで回転完了済み)
      console.log('[Thickness useEffect] Starting morph animation');
      startAnim(false);
    } else {
      // reverse morph immediately when leaving thickness
      if (thicknessAnimationFrame.current) cancelAnimationFrame(thicknessAnimationFrame.current);
      startAnim(true);
    }

    return () => {
      if (thicknessAnimationFrame.current) cancelAnimationFrame(thicknessAnimationFrame.current);
      thicknessAnimationFrame.current = null;
      if (delayTimer) clearTimeout(delayTimer);
    };
  }, [currentStep]);

  // Update prevStepRef to track previous step after others run
  useEffect(() => {
    prevStepRef.current = currentStep;
  }, [currentStep]);

  // 確認画面の送信処理
  const handleConfirmAndSubmit = () => {
    // refから最新のstepMarkersを取得
    const finalStepMarkers = stepMarkersRef.current;

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

    onComplete(session);
  };

  // 確認画面でやり直す
  const handleRetake = () => {
    setShowConfirmation(false);
    setShowSelfieConfirmation(false);
    setCurrentStepIndex(0);
    setIsRecording(false);
    setStepMarkers([]);
    stepMarkersRef.current = [];
    completedVideosRef.current = [];
    chunksRef.current = [];
    setIsPreparing(true);
    requestCamera();
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

  // インカメラ切り替え確認画面
  if (showSelfieConfirmation) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <div className="max-w-2xl w-full">
          <div className="bg-gradient-to-br from-blue-900/50 to-purple-900/50 backdrop-blur-sm rounded-2xl p-8 border-2 border-blue-500/30 shadow-2xl">
            <div className="text-center mb-8">
              <div className="text-8xl mb-6 animate-bounce">🤳</div>
              <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                次は自撮り撮影です
              </h2>
              <p className="text-xl text-gray-300 mb-6">
                インカメラに切り替えて自撮りを撮影します
              </p>
            </div>

            <div className="bg-black/30 rounded-xl p-6 mb-8 border border-blue-500/20">
              <h3 className="text-lg font-bold mb-4 text-yellow-300 flex items-center gap-2">
                <span className="text-2xl">📋</span>
                撮影のポイント
              </h3>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <span className="text-green-400 text-xl flex-shrink-0">✓</span>
                  <span>顔全体がはっきり映るようにしてください</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-400 text-xl flex-shrink-0">✓</span>
                  <span>身分証を顔の横に持って一緒に撮影してください</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-400 text-xl flex-shrink-0">✓</span>
                  <span>明るい場所で撮影してください</span>
                </li>
              </ul>
            </div>

            <button
              onClick={switchToSelfieCamera}
              disabled={isPreparing}
              className="w-full py-5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl font-bold text-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
            >
              {isPreparing ? (
                <span className="flex items-center justify-center gap-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  切り替え中...
                </span>
              ) : (
                '📸 インカメラで撮影を開始'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 確認画面の表示
  if (showConfirmation) {
    const frontSnapshot = stepMarkers.find(m => m.step === 'front')?.snapshot;
    const backSnapshot = stepMarkers.find(m => m.step === 'back')?.snapshot;

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <div className="max-w-4xl w-full">
          <h2 className="text-2xl font-bold mb-6 text-center">撮影内容の確認</h2>
          <p className="text-center mb-8 text-gray-300">表面と裏面の画像を確認してください</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* 表面 */}
            <div className="bg-gray-800 rounded-xl p-4 border-2 border-red-500/50">
              <h3 className="text-lg font-bold mb-3 text-center text-yellow-300">【表面】</h3>
              {frontSnapshot ? (
                <div
                  className="relative w-full overflow-hidden rounded-lg"
                  style={{
                    paddingTop: '62.5%', // 黄金比 (1:1.6 = 5:8)
                    border: '3px solid rgba(255, 255, 255, 0.5)',
                    boxShadow: 'inset 0 0 0 2px rgb(239, 68, 68)'
                  }}
                >
                  <img
                    src={frontSnapshot}
                    alt="表面"
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{
                      objectPosition: 'center center',
                    }}
                  />
                </div>
              ) : (
                <div
                  className="w-full bg-gray-700 rounded-lg flex items-center justify-center text-gray-400"
                  style={{ paddingTop: '62.5%' }}
                >
                  画像なし
                </div>
              )}
            </div>

            {/* 裏面 */}
            <div className="bg-gray-800 rounded-xl p-4 border-2 border-blue-500/50">
              <h3 className="text-lg font-bold mb-3 text-center text-yellow-300">【裏面】</h3>
              {backSnapshot ? (
                <div
                  className="relative w-full overflow-hidden rounded-lg"
                  style={{
                    paddingTop: '62.5%', // 黄金比 (1:1.6 = 5:8)
                    border: '3px solid rgba(255, 255, 255, 0.5)',
                    boxShadow: 'inset 0 0 0 2px rgb(59, 130, 246)'
                  }}
                >
                  <img
                    src={backSnapshot}
                    alt="裏面"
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{
                      objectPosition: 'center center',
                    }}
                  />
                </div>
              ) : (
                <div
                  className="w-full bg-gray-700 rounded-lg flex items-center justify-center text-gray-400"
                  style={{ paddingTop: '62.5%' }}
                >
                  画像なし
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-4 justify-center">
            <button
              onClick={handleRetake}
              className="px-8 py-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
            >
              やり直す
            </button>
            <button
              onClick={handleConfirmAndSubmit}
              className="px-8 py-4 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold transition-colors"
            >
              この内容で送信
            </button>
          </div>
        </div>
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
              // セルフィー: 顔を上下反転し、身分証を左下に重ねて配置
              <div className="relative flex items-center justify-center">
                {/* 顔の形の楕円（上下反転: 上部が細く下部が丸い） */}
                <div className="relative w-40 h-52 border-4 border-white/50" style={{ borderRadius: '50% 50% 50% 50% / 40% 40% 60% 60%' }}>
                  <div className="absolute inset-0 border-4 border-green-500 animate-pulse" style={{ borderRadius: '50% 50% 50% 50% / 40% 40% 60% 60%' }} />
                  <div className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold opacity-70">
                    顔
                  </div>
                </div>
                {/* 身分証のカード型矩形（顔の左下に重ねて配置、さらに左へ） */}
                <div className="absolute bottom-2 -left-20 w-32 h-20 border-4 border-white/50 rounded-lg">
                  <div className="absolute inset-0 border-4 border-yellow-500 rounded-lg animate-pulse" />
                  <div className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold opacity-70">
                    身分証
                  </div>
                </div>
              </div>
            ) : (
              // 表面・裏面・厚み: 長方形の枠
              <div
                ref={frameRef}
                className="relative w-[80%] max-w-md"
                style={{
                  aspectRatio: '16/10',
                  transition: 'transform 0.8s ease-in-out',
                  // フロント→バック遷移時だけ回転アニメーションを行い、
                  // バックに到達後は回転状態(180deg)を維持して二重回転を防ぐ
                  transform:
                    stepTransition === 'flip' || currentStep === 'back'
                      ? 'rotateY(180deg)'
                      : 'rotateY(0deg)',
                  transformStyle: 'preserve-3d',
                }}
              >
                {/* 長方形の枠（角丸付き） */}
                <svg viewBox="0 0 400 250" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                  {/* 白の外枠（台形対応） */}
                  {currentStep === 'thickness' ? (
                    <path
                      d={outerThicknessPath}
                      fill="none"
                      stroke="rgba(255,255,255,0.5)"
                      strokeWidth="6"
                    />
                  ) : (
                    <rect
                      x="0"
                      y="0"
                      width="400"
                      height="250"
                      rx="12"
                      ry="12"
                      fill="none"
                      stroke="rgba(255,255,255,0.5)"
                      strokeWidth="6"
                    />
                  )}
                  {/* カラーの内枠（パルス・角丸） */}
                    {(() => {
                      const strokeColor = currentStep === 'back' ? 'rgb(59,130,246)' : 'rgb(239,68,68)';
                      return currentStep === 'thickness' ? (
                        <path
                          d={thicknessPath}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth="4"
                          className="animate-pulse"
                          style={{ transition: 'stroke 0.7s ease-in-out' }}
                        />
                      ) : (
                        <rect
                          x="6"
                          y="6"
                          width="388"
                          height="238"
                          rx="10"
                          ry="10"
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth="4"
                          className="animate-pulse"
                          style={{ transition: 'stroke 0.7s ease-in-out' }}
                        />
                      );
                    })()}
                </svg>
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
                <h3 className="text-lg font-bold text-center">
                  {guide.title.split('【').map((part, i) => {
                    if (i === 0) return part;
                    const [highlight, rest] = part.split('】');
                    return (
                      <React.Fragment key={i}>
                        <span className={`text-xl px-2 py-1 rounded ${currentStep === 'front'
                          ? 'text-red-300 bg-red-500/30'
                          : currentStep === 'back'
                            ? 'text-blue-300 bg-blue-500/30'
                            : 'text-yellow-300 bg-yellow-500/30'
                          }`}>
                          {highlight}
                        </span>
                        {rest}
                      </React.Fragment>
                    );
                  })}
                </h3>
              </div>
              <p className="text-sm mb-3 opacity-90">{guide.description}</p>
              <ul className="text-xs space-y-1 opacity-80">
                {guide.instructions.map((instruction, index) => (
                  <li key={index}>{instruction}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* コントロールボタン */}
      {/* 
        シャッターボタンの動作:
        - 未録画時: 「開始」→ 録画開始のみ
        - 録画中(ステップ1-3): 「撮影N」→ 現在ステップのマーカー記録 + 次へ
        - 録画中(最終ステップ4): 「完了」→ ステップ4マーカー記録 + 録画停止
        
        合計5回押下が必要: 開始(1) + 撮影1(2) + 撮影2(3) + 撮影3(4) + 完了(5)
      */}
      <div className="absolute bottom-0 left-0 right-0 px-4 z-40 pb-8" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
        {/* 画像品質フィードバック（録画中のみ表示） */}
        {isRecording && currentImageQuality && lastQualityCheck && (
          <div className="flex justify-center mb-3">
            <div className={`px-4 py-2 rounded-lg backdrop-blur-sm border-2 transition-all ${
              currentImageQuality.isGoodQuality
                ? 'bg-green-900/70 border-green-500/50'
                : 'bg-yellow-900/70 border-yellow-500/50'
            }`}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                {isValidatingQuality ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span className="text-white">品質チェック中...</span>
                  </>
                ) : currentImageQuality.isGoodQuality ? (
                  <>
                    <span className="text-green-300">✓</span>
                    <span className="text-white">品質良好</span>
                  </>
                ) : (
                  <>
                    <span className="text-yellow-300">⚠</span>
                    <span className="text-white">
                      {currentImageQuality.isBlurry && 'ブレ検出'}
                      {currentImageQuality.isTooDark && '暗い'}
                      {currentImageQuality.isTooBright && '明るすぎ'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

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
            disabled={isPreparing || (!isRecording && !allChecked) || stepTransition !== null || showSelfieConfirmation || (isRecording && stepMarkers.some(m => m.step === currentStep))}
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
