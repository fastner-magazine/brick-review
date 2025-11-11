'use client';

import { useRef, useState, useEffect } from 'react';

type SignatureCanvasProps = {
    onComplete: (dataUrl: string) => void;
    onClose: () => void;
};

export default function SignatureCanvas({ onComplete, onClose }: SignatureCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);
    const [isLandscape, setIsLandscape] = useState(true); // 横向きモード（デフォルト）
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

    // 初回レンダリング時にサイズを固定し、デバイスタイプで向きを判定
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            setContainerSize({ width: vw, height: vh });

            // デバイス判定: スマホ・タブレットなら横モード、PCなら縦モード
            const isMobileOrTablet = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
                || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
            setIsLandscape(isMobileOrTablet); // スマホ・タブレット=横モード(true)、PC=縦モード(false)

            // iPhoneのズーム防止
            const viewport = document.querySelector('meta[name="viewport"]');
            if (viewport) {
                viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
            }
        }

        // クリーンアップでviewportを元に戻す
        return () => {
            const viewport = document.querySelector('meta[name="viewport"]');
            if (viewport) {
                viewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
            }
        };
    }, []);

    // 背景スクロールを抑止
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const originalOverflow = document.body.style.overflow;
            const originalTouchAction = document.body.style.touchAction;
            document.body.style.overflow = 'hidden';
            document.body.style.touchAction = 'none';
            return () => {
                document.body.style.overflow = originalOverflow;
                document.body.style.touchAction = originalTouchAction;
            };
        }
        return () => { };
    }, []);

    // タッチイベントのpreventDefault処理
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleTouchStart = (e: TouchEvent) => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const x = (touch.clientX - rect.left) * scaleX;
            const y = (touch.clientY - rect.top) * scaleY;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            setIsDrawing(true);
            setHasDrawn(true);
            ctx.beginPath();
            ctx.moveTo(x, y);
        };

        const handleTouchMove = (e: TouchEvent) => {
            e.preventDefault();
            if (!isDrawing) return;

            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const x = (touch.clientX - rect.left) * scaleX;
            const y = (touch.clientY - rect.top) * scaleY;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.lineTo(x, y);
            ctx.stroke();
        };

        const handleTouchEnd = (e: TouchEvent) => {
            e.preventDefault();
            setIsDrawing(false);
        };

        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

        return () => {
            canvas.removeEventListener('touchstart', handleTouchStart);
            canvas.removeEventListener('touchmove', handleTouchMove);
            canvas.removeEventListener('touchend', handleTouchEnd);
        };
    }, [isDrawing]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || containerSize.width === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // キャンバスサイズを設定
        if (isLandscape) {
            // 横向きモード: 縦長キャンバス（横向きに書くため）
            const width = containerSize.width - 140;
            const height = containerSize.height - 60;
            canvas.width = width;
            canvas.height = height;
            // CSS表示サイズも同じに
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
        } else {
            // 縦向きモード: 横長キャンバス
            const width = Math.max(containerSize.width - 40, 600);
            const height = Math.min(containerSize.height * 0.5, 300);
            canvas.width = width;
            canvas.height = height;
            // CSS表示サイズも同じに
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
        }

        // 背景を白に
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 線のスタイル
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }, [isLandscape, containerSize]);

    const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();

        let clientX: number;
        let clientY: number;

        if ('touches' in e) {
            const touch = e.touches[0];
            clientX = touch.clientX;
            clientY = touch.clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        // キャンバスの実際のサイズと表示サイズの比率を計算
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        // スケールを考慮した座標
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY,
        };
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const coords = getCoordinates(e);
        if (!coords) return;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;

        setIsDrawing(true);
        setHasDrawn(true);
        ctx.beginPath();
        ctx.moveTo(coords.x, coords.y);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        if (!isDrawing) return;

        const coords = getCoordinates(e);
        if (!coords) return;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;

        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const clear = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setHasDrawn(false);
    };

    const toggleOrientation = () => {
        // 向きを切り替える前に現在の描画内容を保存
        const canvas = canvasRef.current;
        if (canvas && hasDrawn) {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                tempCanvas.width = canvas.width;
                tempCanvas.height = canvas.height;
                tempCtx.drawImage(canvas, 0, 0);

                // 向きを切り替え
                setIsLandscape(!isLandscape);

                // 次のレンダリング後に描画内容を復元
                setTimeout(() => {
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(tempCanvas, 0, 0);
                    }
                }, 100);
            }
        } else {
            // 描画内容がない場合は単純に切り替え
            setIsLandscape(!isLandscape);
        }
    };

    const complete = () => {
        const canvas = canvasRef.current;
        if (!canvas || !hasDrawn) return;

        // 横向きモードの場合は90度反時計回りに回転
        if (isLandscape) {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                // 回転後のサイズ（幅と高さが入れ替わる）
                tempCanvas.width = canvas.height;
                tempCanvas.height = canvas.width;

                // 中心で90度反時計回りに回転
                tempCtx.translate(0, canvas.width);
                tempCtx.rotate(-Math.PI / 2);
                tempCtx.drawImage(canvas, 0, 0);

                const dataUrl = tempCanvas.toDataURL('image/png');
                onComplete(dataUrl);
                return;
            }
        }

        const dataUrl = canvas.toDataURL('image/png');
        onComplete(dataUrl);
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100vw',
                height: '100vh',
                background: 'rgba(0, 0, 0, 0.8)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
                overflow: 'hidden',
                touchAction: 'none',
            } as React.CSSProperties}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* 縦横変更ボタン（常に右上に固定） */}
            <button
                onClick={toggleOrientation}
                style={{
                    position: 'fixed',
                    top: '16px',
                    right: '16px',
                    zIndex: 20000,
                    padding: '12px',
                    background: 'white',
                    border: '2px solid #007bff',
                    borderRadius: '8px',
                    color: '#007bff',
                    fontSize: '24px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    whiteSpace: 'nowrap',
                    width: '52px',
                    height: '52px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                {isLandscape ? '📱' : '📲'}
            </button>

            {isLandscape ? (
                /* 横向きモード: 縦に見たときのレイアウト */
                <div
                    style={{
                        width: '100vw',
                        height: '100vh',
                        display: 'flex',
                        flexDirection: 'row',
                        background: 'white',
                        overflow: 'hidden',
                        touchAction: 'none',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        WebkitTouchCallout: 'none',
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    {/* 左側: ボタン群（中央揃えで3つ並べる） */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            padding: '8px',
                            justifyContent: 'center',
                            alignItems: 'center',
                            background: '#f8f9fa',
                            minWidth: '60px',
                        }}
                    >
                        <button
                            onClick={onClose}
                            style={{
                                padding: '20px 8px',
                                background: '#6c757d',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                width: '50px',
                                height: '100px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <span style={{ transform: 'rotate(90deg)', display: 'inline-block' }}>
                                キャンセル
                            </span>
                        </button>

                        <button
                            onClick={clear}
                            style={{
                                padding: '20px 8px',
                                background: '#ffc107',
                                color: '#212529',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                width: '50px',
                                height: '100px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <span style={{ transform: 'rotate(90deg)', display: 'inline-block' }}>
                                クリア
                            </span>
                        </button>

                        <button
                            onClick={complete}
                            disabled={!hasDrawn}
                            style={{
                                padding: '20px 8px',
                                background: hasDrawn ? '#28a745' : '#dee2e6',
                                color: hasDrawn ? 'white' : '#6c757d',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: '600',
                                cursor: hasDrawn ? 'pointer' : 'not-allowed',
                                whiteSpace: 'nowrap',
                                width: '50px',
                                height: '100px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <span style={{ transform: 'rotate(90deg)', display: 'inline-block' }}>
                                ✓ 完了
                            </span>
                        </button>
                    </div>

                    {/* 中央: キャンバス（縦長） */}
                    <div
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#f8f9fa',
                            padding: '10px',
                            overflow: 'hidden',
                            position: 'relative',
                        }}
                    >
                        {/* ポインター表示 */}
                        <div
                            style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                fontSize: '24px',
                                opacity: 0.3,
                                pointerEvents: 'none',
                                zIndex: 1,
                            }}
                        >
                            ✍️
                        </div>
                        <canvas
                            ref={canvasRef}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onContextMenu={(e) => e.preventDefault()}
                            style={{
                                border: '2px solid #007bff',
                                background: 'white',
                                cursor: 'crosshair',
                                touchAction: 'none',
                                position: 'relative',
                                zIndex: 2,
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                                WebkitTouchCallout: 'none',
                            } as React.CSSProperties}
                        />
                    </div>

                    {/* 右側: 案内テキスト（文字だけ90度時計回りに傾ける） */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
                            color: 'white',
                            padding: '20px 10px',
                            fontSize: '14px',
                            fontWeight: '600',
                            width: '60px',
                            gap: '20px',
                        }}
                    >
                        <span style={{ transform: 'rotate(90deg)', display: 'inline-block', whiteSpace: 'nowrap', textAlign: 'center' }}>
                            サインを記入してください（画面を横向きにしてください）
                        </span>
                    </div>
                </div>
            ) : (
                /* 縦向きモード: 通常レイアウト */
                <div
                    style={{
                        width: '100vw',
                        height: '100vh',
                        display: 'flex',
                        flexDirection: 'column',
                        background: 'white',
                        overflow: 'hidden',
                        touchAction: 'none',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        WebkitTouchCallout: 'none',
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    {/* ヘッダー */}
                    <div
                        style={{
                            padding: '12px 16px',
                            background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
                            color: 'white',
                            fontSize: '16px',
                            fontWeight: '700',
                            textAlign: 'center',
                            flexShrink: 0,
                        }}
                    >
                        サインをご記入ください
                    </div>

                    {/* キャンバスエリア */}
                    <div
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#f8f9fa',
                            padding: '20px',
                            overflow: 'auto',
                            position: 'relative',
                        }}
                    >
                        {/* ポインター表示 */}
                        <div
                            style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                fontSize: '24px',
                                opacity: 0.3,
                                pointerEvents: 'none',
                                zIndex: 1,
                            }}
                        >
                            ✍️
                        </div>
                        <canvas
                            ref={canvasRef}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onContextMenu={(e) => e.preventDefault()}
                            style={{
                                border: '2px solid #007bff',
                                background: 'white',
                                cursor: 'crosshair',
                                touchAction: 'none',
                                position: 'relative',
                                zIndex: 2,
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                                WebkitTouchCallout: 'none',
                            } as React.CSSProperties}
                        />
                    </div>

                    {/* ボタン */}
                    <div
                        style={{
                            display: 'flex',
                            gap: '8px',
                            padding: '12px 16px',
                            background: '#f8f9fa',
                            borderTop: '1px solid #dee2e6',
                            flexShrink: 0,
                            justifyContent: 'center',
                            alignItems: 'center',
                        }}
                    >
                        <button
                            onClick={onClose}
                            style={{
                                flex: 1,
                                padding: '12px',
                                background: '#6c757d',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '16px',
                                fontWeight: '600',
                                cursor: 'pointer',
                            }}
                        >
                            キャンセル
                        </button>

                        <button
                            onClick={clear}
                            style={{
                                flex: 1,
                                padding: '12px',
                                background: '#ffc107',
                                color: '#212529',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '16px',
                                fontWeight: '600',
                                cursor: 'pointer',
                            }}
                        >
                            クリア
                        </button>

                        <button
                            onClick={complete}
                            disabled={!hasDrawn}
                            style={{
                                flex: 1,
                                padding: '12px',
                                background: hasDrawn ? '#28a745' : '#dee2e6',
                                color: hasDrawn ? 'white' : '#6c757d',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '16px',
                                fontWeight: '600',
                                cursor: hasDrawn ? 'pointer' : 'not-allowed',
                            }}
                        >
                            ✓ 完了
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
