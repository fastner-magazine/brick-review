'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Order, OrderStatus } from '@/types/order';
import { useOrders } from '@/lib/useFirestore';

// ステータスバッジコンポーネント
type StatusBadgeProps = Readonly<{ status: OrderStatus }>;
function StatusBadge({ status }: StatusBadgeProps) {
  const statusConfig = {
    [OrderStatus.PENDING]: { label: '梱包待ち', variant: 'pending' as const },
    [OrderStatus.PICKING]: { label: '商品準備中', variant: 'picking' as const },
    [OrderStatus.PACKING]: { label: '梱包中', variant: 'packing' as const },
    [OrderStatus.COMPLETED]: { label: '完了', variant: 'completed' as const },
  };

  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// ピッキング情報コンポーネント
type PickingInfoProps = Readonly<{ order: Order }>;
function PickingInfo({ order }: PickingInfoProps) {
  if (order.status !== OrderStatus.PICKING || !order.pickingBy) return null;

  const time = order.pickingStartedAt
    ? new Date(order.pickingStartedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <span className="text-sm text-gray-700">
      {order.pickingBy}{time ? ` · ${time}` : ''}
    </span>
  );
}

// 商品合計数コンポーネント
type OrderStatsProps = Readonly<{ order: Order }>;
function OrderStats({ order }: OrderStatsProps) {
  const totalProducts = order.layers.reduce(
    (total, layer) =>
      total + layer.products.reduce((sum, product) => sum + product.quantity, 0),
    0
  );

  let primaryBoxLabel: string;
  if (order.primaryBoxId != null) {
    primaryBoxLabel = `箱ID ${order.primaryBoxId}`;
  } else if (order.boxSize === 'AUTO') {
    primaryBoxLabel = '自動選定';
  } else {
    primaryBoxLabel = order.boxSize;
  }
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
  const leftover = order.packingSummary?.leftover ?? 0;

  return (
    <div className="flex gap-4 text-sm text-gray-500">
      <span>📅 {order.orderDate}</span>
      <span>📦 箱: {primaryBoxLabel}</span>
      <span>🔢 商品数: {totalProducts}点</span>
      <span>📚 段数: {order.layers.length}段</span>
      <span>⚙️ 箱計算: {packingStatusLabel}</span>
      {typeof primaryVoidRatio === "number" ? (
        <span>🧮 空隙率: {(primaryVoidRatio * 100).toFixed(1)}%</span>
      ) : null}
      {leftover > 0 ? <span>⚠️ 未収容: {leftover}個</span> : null}
    </div>
  );
}

// 注文カードコンポーネント
type OrderCardProps = Readonly<{ order: Order }>;
function OrderCard({ order }: OrderCardProps) {
  const displayTitle = order.orderNumber
    ? `#${order.orderNumber} - ${order.customerName}`
    : order.customerName;

  return (
    <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-blue-500">
      <CardHeader>
        <div className="flex items-start justify-between">
          <Link href={`/orders/${order.id}`} className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-bold text-gray-800">
                {displayTitle}
              </h2>
              <PickingInfo order={order} />
              <StatusBadge status={order.status} />
            </div>
            <p className="text-gray-600 mb-2">{order.customerAddress}</p>
            <OrderStats order={order} />
          </Link>
          {order.status === OrderStatus.PENDING && (
            <Button asChild size="sm" variant="outline" onClick={(e) => e.stopPropagation()}>
              <Link href={`/orders/${order.id}/edit`}>✏️ 編集</Link>
            </Button>
          )}
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="pt-4">
        <Link href={`/orders/${order.id}`}>
          <div className="text-sm text-gray-600">
            <span className="font-semibold">商品:</span>
            {order.layers.map((layer) =>
              layer.products.map((product) => (
                <span key={product.id} className="ml-2">
                  {product.name} ×{product.quantity}
                </span>
              ))
            )}
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}

// 統計カードコンポーネント
type StatCardProps = Readonly<{ label: string; value: number; valueColor?: string }>;
function StatCard({ label, value, valueColor }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-gray-500 text-sm">{label}</div>
        <div className={`text-2xl font-bold ${valueColor || 'text-gray-800'}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export default function OrdersPage() {
  const [showCompleted, setShowCompleted] = useState(false);
  const { orders, loading, error } = useOrders();

  // OrderDataをOrder型に変換
  const typedOrders: Order[] = orders.map(o => ({
    ...o,
    status: o.status as OrderStatus,
  }));

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4 max-w-6xl">
          <p className="text-center text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4 max-w-6xl">
          <p className="text-center text-red-500">エラー: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-800">注文一覧</h1>
          <div className="flex gap-3">
            <Button variant="default" asChild>
              <Link href="/orders/new-order">+ 新規注文</Link>
            </Button>
            <Button asChild>
              <Link href="/">ホームに戻る</Link>
            </Button>
          </div>
        </div>

        {typedOrders.length === 0 ? (
          <Card className="text-center">
            <CardContent className="p-12">
              <p className="text-gray-500 text-lg mb-4">注文がありません</p>
              <Button variant="default" size="lg" asChild>
                <Link href="/orders/new-order">最初の注文を作成する</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 完了済み切替（カード表示） */}
            <div className="mb-4">
              <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                <CardContent className="p-2">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={showCompleted}
                    onClick={() => setShowCompleted((s) => !s)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setShowCompleted((s) => !s);
                      }
                    }}
                    className="flex items-center justify-between"
                  >
                    <div className="text-sm text-gray-700 pl-2">
                      {showCompleted ? '完了済みを非表示' : `完了済みを表示 (${typedOrders.filter(o => o.status === OrderStatus.COMPLETED).length})`}
                    </div>
                    <div className="pr-2">
                      {/* 右端の矢印（回転で開閉を表現） */}
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className={`transform transition-transform duration-200 ${showCompleted ? 'rotate-90' : ''}`}
                        aria-hidden
                      >
                        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" fill="currentColor" />
                      </svg>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 完了済みリスト（折りたたみ表示） */}
            {showCompleted && (
              <div className="grid gap-3 mb-6">
                {typedOrders
                  .filter((o) => o.status === OrderStatus.COMPLETED)
                  .map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
              </div>
            )}

            {/* アクティブ注文（完了以外） */}
            <div className="grid gap-4">
              {typedOrders
                .filter((o) => o.status !== OrderStatus.COMPLETED)
                .map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
            </div>
          </>
        )}

        {/* 統計情報 */}
        {typedOrders.length > 0 && (
          <div className="mt-8 grid md:grid-cols-5 gap-4">
            <StatCard label="全注文" value={typedOrders.length} />
            <StatCard
              label="梱包待ち"
              value={typedOrders.filter((o) => o.status === OrderStatus.PENDING).length}
            />
            <StatCard
              label="商品準備中"
              value={typedOrders.filter((o) => o.status === OrderStatus.PICKING).length}
            />
            <StatCard
              label="梱包中"
              value={typedOrders.filter((o) => o.status === OrderStatus.PACKING).length}
              valueColor="text-blue-600"
            />
            <StatCard
              label="完了"
              value={typedOrders.filter((o) => o.status === OrderStatus.COMPLETED).length}
              valueColor="text-green-600"
            />
          </div>
        )}
      </div>
    </div>
  );
}


