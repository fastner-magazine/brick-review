/* eslint-disable */
'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Order, OrderStatus } from '@/types/order';
import { useOrder } from '@/lib/useFirestore';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export default function OrderDetailPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const orderId = params.id as string;

  const { order: firestoreOrder, updateOrder: updateFirestoreOrder } = useOrder(orderId);
  const [currentLayer, setCurrentLayer] = useState(0);
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [pickerName, setPickerName] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Firestoreから読み込んだデータをOrder型に変換
  const order: Order | null = firestoreOrder ? {
    ...firestoreOrder,
    status: firestoreOrder.status as OrderStatus,
  } : null;

  useEffect(() => {
    if (!order) return;

    setNotes(order.notes || '');
    setWeight(order.totalWeight?.toString() || '');

    // 既存の画像を読み込む
    const images = order.layers
      .map((layer) => layer.imageUrl)
      .filter((url): url is string => !!url);
    setCapturedImages(images);
  }, [order]);

  // ステータスバッジコンポーネント
  const StatusBadge = ({ status }: { status: OrderStatus }) => {
    const statusConfig = {
      [OrderStatus.PENDING]: { label: '注文入力済み', variant: 'pending' as const },
      [OrderStatus.PICKING]: { label: 'ピッキング中', variant: 'picking' as const },
      [OrderStatus.PACKING]: { label: '梱包中', variant: 'packing' as const },
      [OrderStatus.COMPLETED]: { label: '完了', variant: 'completed' as const },
    };

    const config = statusConfig[status];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  // カメラを起動（詳細エラーハンドリングと再試行を提供）
  const requestStartCamera = async () => {
    try {
      setCameraError(null);

      if (typeof window !== 'undefined' && !window.isSecureContext) {
        const host = window.location.hostname;
        if (host !== 'localhost' && host !== '127.0.0.1') {
          throw new Error('セキュアな接続(HTTPS または localhost)でアクセスしてください。');
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    } catch (err: any) {
      console.error('カメラの起動に失敗しました:', err);
      if (err && err.name === 'NotAllowedError') {
        setCameraError('カメラへのアクセスが拒否されました。サイト設定でカメラ許可を有効にしてください。');
      } else if (err && err.name === 'NotFoundError') {
        setCameraError('カメラが見つかりません。デバイスにカメラが搭載されているか確認してください。');
      } else {
        setCameraError(String(err?.message ?? 'カメラの起動に失敗しました。'));
      }
      // ユーザーにすぐ分かるようにアラートも出すが、UIにも表示する
      alert('カメラの起動に失敗しました。ブラウザの設定や接続方法(HTTPS / localhost)を確認してください。');
    }
  };

  // カメラを停止
  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      for (const track of stream.getTracks()) {
        track.stop();
      }
      videoRef.current.srcObject = null;
      setIsCameraActive(false);
    }
  };

  // 写真を撮影
  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !order) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL('image/jpeg');

    // 画像を保存
    const updatedLayers = [...order.layers];
    updatedLayers[currentLayer].imageUrl = imageData;

    await updateFirestoreOrder({ layers: updatedLayers });

    setCapturedImages([...capturedImages, imageData]);
    stopCamera();

    alert(`${currentLayer + 1}段目の撮影が完了しました`);
  };

  // ファイル選択から画像を読み込んで保存
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !order) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const imageData = String(reader.result ?? '');
      const updatedLayers = [...order.layers];
      updatedLayers[currentLayer] = { ...updatedLayers[currentLayer], imageUrl: imageData };

      await updateFirestoreOrder({ layers: updatedLayers });
      setCapturedImages((prev) => [...prev, imageData]);

      alert(`${currentLayer + 1}段目の画像アップロードが完了しました`);
    };
    reader.readAsDataURL(file);

    // input をクリアして同じファイルを再選択できるようにする
    e.currentTarget.value = '';
  };

  // ステータスを更新
  const updateStatus = async (newStatus: OrderStatus) => {
    if (!order) return;
    await updateFirestoreOrder({ status: newStatus });
  };

  // ピッキング開始
  const startPicking = async () => {
    if (!order) return;
    if (!pickerName || pickerName.trim() === '') {
      alert('ピッキング担当者名を入力してください');
      return;
    }

    const startedAt = new Date().toISOString();

    // Firestoreに担当者名と開始時間を保存してステータスを更新
    await updateFirestoreOrder({
      status: OrderStatus.PICKING,
      pickingBy: pickerName.trim(),
      pickingStartedAt: startedAt,
    });

    alert('ピッキングを開始しました');
  };

  // 梱包開始
  const startPacking = async () => {
    await updateStatus(OrderStatus.PACKING);
    alert('梱包を開始しました');
  };

  // 次の段へ
  const nextLayer = () => {
    if (!order) return;

    if (currentLayer < order.layers.length - 1) {
      setCurrentLayer(currentLayer + 1);
      alert(`${currentLayer + 2}段目の梱包に進みます`);
    } else {
      alert('全ての段の梱包が完了しました。重量と記入事項を入力してください。');
    }
  };

  // 作業完了
  const completeOrder = async () => {
    if (!order) return;

    if (!weight) {
      alert('重量を入力してください');
      return;
    }

    // 全ての段に画像があるか確認
    const allLayersHaveImages = order.layers.every((layer) => layer.imageUrl);
    if (!allLayersHaveImages) {
      alert('全ての段の撮影を完了してください');
      return;
    }

    await updateFirestoreOrder({
      status: OrderStatus.COMPLETED,
      totalWeight: Number.parseFloat(weight),
      notes,
    });

    alert('作業が完了しました!');
    router.push('/orders');
  };

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="text-center max-w-md">
          <CardContent className="p-12">
            <p className="text-xl text-gray-600 mb-4">注文が見つかりません</p>
            <Button asChild variant="outline">
              <Link href="/orders">注文一覧に戻る</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentLayerData = order.layers[currentLayer];
  const primaryBoxLabel = order.primaryBoxId != null
    ? `箱ID ${order.primaryBoxId}`
    : order.boxSize === 'AUTO'
      ? '自動選定'
      : order.boxSize;
  const packingStatusLabel = (() => {
    switch (order.packingStatus) {
      case 'success':
        return '計算完了';
      case 'failed':
        return '要確認';
      case 'pending':
        return '保留';
      default:
        return '未計算';
    }
  })();
  const primaryVoidRatio = order.packingSummary?.selections?.[0]?.voidRatio;
  const leftoverItems = order.packingSummary?.leftover ?? 0;
  const displayTitle = order.orderNumber
    ? `#${order.orderNumber} - ${order.customerName}`
    : order.customerName;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-800">注文詳細 & 梱包作業</h1>
          <div className="flex gap-3">
            {order.status === OrderStatus.PENDING && (
              <Button asChild>
                <Link href={`/orders/${orderId}/edit`}>✏️ 注文を編集</Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/orders">注文一覧に戻る</Link>
            </Button>
          </div>
        </div>

        {/* 注文情報 */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl">{displayTitle}</CardTitle>
              <StatusBadge status={order.status} />
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            <div className="grid md:grid-cols-2 gap-4 text-gray-700">
              <div>
                <strong>住所:</strong> {order.customerAddress}
              </div>
              <div>
                <strong>注文日:</strong> {order.orderDate}
              </div>
              <div>
                <strong>推奨箱:</strong> {primaryBoxLabel}
              </div>
              <div>
                <strong>箱計算:</strong> {packingStatusLabel}
                {primaryVoidRatio !== undefined ? (
                  <span className="ml-2 text-sm text-gray-500">
                    空隙率 {(primaryVoidRatio * 100).toFixed(1)}%
                  </span>
                ) : null}
                {leftoverItems > 0 ? (
                  <span className="ml-2 text-sm text-red-600">未収容 {leftoverItems} 個</span>
                ) : null}
              </div>
              <div>
                <strong>段数:</strong> {order.layers.length}段
              </div>
            </div>
            {order.packingError ? (
              <p className="mt-3 text-sm text-red-600">箱計算メモ: {order.packingError}</p>
            ) : null}
          </CardContent>
        </Card>

        {/* ステータスアクション */}
        {order.status === OrderStatus.PENDING && (
          <Card className="bg-yellow-50 border-yellow-200 mb-6">
            <CardHeader>
              <CardTitle className="text-lg text-yellow-800">
                ピッキングを開始してください
              </CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4 space-y-4">
              <div>
                <Label htmlFor="pickerName">ピッキング担当者名</Label>
                <Input
                  id="pickerName"
                  type="text"
                  value={pickerName}
                  onChange={(e) => setPickerName(e.target.value)}
                  placeholder="担当者名を入力"
                />
              </div>
              <Button
                onClick={startPicking}
                disabled={!pickerName.trim()}
                className="w-full"
              >
                ピッキング開始
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 全商品リスト（ピッキング用） */}
        {order.status === OrderStatus.PICKING && (
          <Card className="bg-blue-50 border-blue-200 mb-6">
            <CardHeader>
              <CardTitle className="text-lg text-blue-800">
                ピッキングリスト（全商品）
              </CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4 space-y-3">
              {order.layers.map((layer) => (
                <div key={`layer-${layer.layerNumber}`}>
                  <div className="font-semibold text-gray-700 mb-2">
                    {layer.layerNumber}段目
                  </div>
                  {layer.products.map((product) => (
                    <Card key={product.id} className="mb-2">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold text-lg">{product.name}</span>
                            <span className="ml-3 text-gray-600">
                              × {product.quantity}
                            </span>
                            {product.dimensions ? (
                              <div className="text-gray-500 text-sm mt-1">
                                寸法: {product.dimensions.w} × {product.dimensions.d} × {product.dimensions.h} mm
                              </div>
                            ) : null}
                          </div>
                          <Badge variant="packing">
                            棚: {product.shelfLocation}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ))}
              <Button
                onClick={startPacking}
                className="w-full"
              >
                ピッキング完了 → 梱包開始
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 梱包作業エリア */}
        {order.status === OrderStatus.PACKING && (
          <div className="space-y-6">
            {/* 現在の段の情報 */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {currentLayerData.layerNumber}段目の梱包
                </CardTitle>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4 space-y-6">
                <div className="space-y-3">
                  {currentLayerData.products.map((product) => (
                    <Card key={product.id} className="bg-gray-50">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-bold text-lg">{product.name}</div>
                            <div className="text-gray-600">数量: {product.quantity}</div>
                            {product.dimensions ? (
                              <div className="text-gray-500 text-sm">
                                寸法: {product.dimensions.w} × {product.dimensions.d} × {product.dimensions.h} mm
                              </div>
                            ) : null}
                          </div>
                          <Badge variant="completed">
                            棚: {product.shelfLocation}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* 撮影エリア */}
                <div>
                  <h4 className="font-bold mb-3">
                    {currentLayerData.layerNumber}段目の撮影
                  </h4>

                  {currentLayerData.imageUrl ? (
                    <div className="mb-4">
                      {/* eslint-disable-next-line */}
                      <img
                        src={currentLayerData.imageUrl}
                        alt={`${currentLayerData.layerNumber}段目`}
                        className="max-w-md rounded-lg shadow"
                      />
                      <p className="text-green-600 font-bold mt-2">✓ 撮影済み</p>
                    </div>
                  ) : (
                    <div>
                      {isCameraActive ? (
                        <div className="space-y-3">
                          <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            className="w-full max-w-md rounded-lg border"
                          >
                            <track kind="captions" />
                          </video>
                          <div className="flex gap-3">
                            <Button
                              onClick={capturePhoto}
                            >
                              📸 撮影
                            </Button>
                            <Button
                              onClick={stopCamera}
                            >
                              キャンセル
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                          <Button
                            onClick={requestStartCamera}
                          >
                            📷 カメラを起動
                          </Button>
                          {cameraError && (
                            <div className="mt-2 text-sm text-red-600">
                              <p>{cameraError}</p>
                              <div className="mt-2 flex gap-2">
                                <Button onClick={requestStartCamera} variant="outline">再試行</Button>
                                <Button onClick={() => setCameraError(null)} variant="ghost">閉じる</Button>
                              </div>
                            </div>
                          )}
                          <div>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/*"
                              onChange={handleFileChange}
                              className="hidden"
                            />
                            <Button
                              onClick={() => fileInputRef.current?.click()}
                            >
                              ⬆️ 画像をアップロード
                            </Button>
                          </div>
                        </div>
                      )}
                      <canvas ref={canvasRef} className="hidden" />
                    </div>
                  )}

                  {/* 次の段へ / 完了 */}
                  {currentLayerData.imageUrl && (
                    <div className="mt-4">
                      {currentLayer < order.layers.length - 1 ? (
                        <Button
                          onClick={nextLayer}
                          className="w-full"
                        >
                          次の段へ ({currentLayer + 2}段目)
                        </Button>
                      ) : (
                        <Card className="bg-green-50 border-green-200">
                          <CardContent className="p-4">
                            <p className="text-green-800 font-bold mb-4">
                              全ての段の梱包が完了しました!
                            </p>
                            <p className="text-sm text-gray-700">
                              重量計測とダンボールへの記入を行ってください
                            </p>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 最終確認エリア（全段完了後） */}
            {order.layers.every((layer) => layer.imageUrl) && (
              <Card>
                <CardHeader>
                  <CardTitle>最終確認・出荷準備</CardTitle>
                </CardHeader>
                <Separator />
                <CardContent className="pt-4 space-y-4">
                  <div>
                    <Label htmlFor="weight">重量 (kg) *</Label>
                    <Input
                      id="weight"
                      type="number"
                      step="0.01"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="例: 2.5"
                    />
                  </div>

                  <div>
                    <Label htmlFor="notes">記入事項(配送伝票など)</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={4}
                      placeholder="配送伝票番号、注意事項など"
                    />
                  </div>

                  <Button
                    onClick={completeOrder}
                    size="lg"
                    className="w-full"
                  >
                    ✓ 作業完了
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* 完了済み表示 */}
        {order.status === OrderStatus.COMPLETED && (
          <Card className="bg-green-50 border-green-200">
            <CardHeader>
              <CardTitle className="text-green-800">✓ 作業完了</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4 space-y-6">
              <div className="space-y-2 text-gray-700">
                <p>
                  <strong>重量:</strong> {order.totalWeight} kg
                </p>
                {order.notes && (
                  <p>
                    <strong>記入事項:</strong> {order.notes}
                  </p>
                )}
              </div>

              <div>
                <h4 className="font-bold mb-3">撮影済み画像</h4>
                <div className="grid md:grid-cols-3 gap-4">
                  {order.layers.map((layer) =>
                    layer.imageUrl ? (
                      <div key={`completed-layer-${layer.layerNumber}`}>
                        {/* eslint-disable-next-line */}
                        <img
                          src={layer.imageUrl}
                          alt={`${layer.layerNumber}段目`}
                          className="rounded-lg shadow"
                        />
                        <p className="text-center mt-2 text-sm text-gray-600">
                          {layer.layerNumber}段目
                        </p>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
