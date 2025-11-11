'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Order, Product, PackingLayer, ProductSource, PackingSummary } from '@/types/order';
import { useOrder } from '@/lib/useFirestore';
import { saveOrder, deleteOrder } from '@/lib/firestoreClient';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBoxes, useGeneralSettings, useSkuOverrides, useSkus } from '@/lib/useFirestore';
import type { GeneralSettingsData, SkuData, SkuOverrideData } from '@/lib/firestoreClient';
import {
  chooseBoxesForMultiSkuExtended,
  chooseBoxesForQuantityExtended,
  type Box as CalculatorBox,
  type Sku as CalculatorSku,
} from '@/lib/box-calculator';

type ProductFormState = {
  source: ProductSource;
  skuId?: string;
  name: string;
  quantity: number;
  shelfLocation: string;
  width: string;
  depth: string;
  height: string;
  keepUpright: boolean;
};

const createInitialProductForm = (): ProductFormState => ({
  source: 'custom',
  skuId: undefined,
  name: '',
  quantity: 1,
  shelfLocation: '',
  width: '',
  depth: '',
  height: '',
  keepUpright: false,
});

export default function EditOrderPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const orderId = params.id as string;

  const { order: firestoreOrder, loading: orderLoading } = useOrder(orderId);
  // compatibility aliases used by the existing UI code
  const originalOrder = firestoreOrder;
  const loading = orderLoading;
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [boxSize, setBoxSize] = useState('AUTO');
  const [products, setProducts] = useState<Product[]>([]);
  const [productForm, setProductForm] = useState<ProductFormState>(createInitialProductForm);

  const { skus: firestoreSkus, loading: skusLoading, error: skusError } = useSkus();
  const { boxes, loading: boxesLoading, error: boxesError } = useBoxes();
  const { settings: generalSettings } = useGeneralSettings();
  const { overrides: skuOverrides } = useSkuOverrides();

  const skuMap = useMemo(() => {
    const map = new Map<string, SkuData>();
    firestoreSkus.forEach((sku) => map.set(sku.id, sku));
    return map;
  }, [firestoreSkus]);

  const overridesMap = useMemo(() => {
    const map = new Map<string, SkuOverrideData>();
    skuOverrides.forEach((entry) => map.set(entry.skuId, entry));
    return map;
  }, [skuOverrides]);

  const normalizedBoxes = useMemo<CalculatorBox[]>(() => {
    return boxes.map((box) => ({
      id: box.id,
      inner: box.inner,
      maxWeightKg: box.maxWeightKg,
      boxWeightKg: box.boxWeightKg,
    }));
  }, [boxes]);

  const defaultSettings = useMemo(() => {
    const settings: GeneralSettingsData | null = generalSettings ?? null;
    return {
      sideMargin: settings?.defaultSideMargin ?? 0,
      frontMargin: settings?.defaultFrontMargin ?? 0,
      topMargin: settings?.defaultTopMargin ?? 0,
      gapXY: settings?.defaultGapXY ?? 0,
      gapZ: settings?.defaultGapZ ?? 0,
      maxStackLayers: settings?.defaultMaxStackLayers,
      boxPadding: settings?.defaultBoxPadding ?? 0,
      keepUpright: settings?.keepUpright,
      unitWeightKg: settings?.unitWeightKg,
    };
  }, [generalSettings]);

  const hasMasterData = firestoreSkus.length > 0;

  useEffect(() => {
    if (!firestoreOrder) return;

    const order = { ...firestoreOrder, status: firestoreOrder.status as Order['status'] };
    setCustomerName(order.customerName);
    setCustomerAddress(order.customerAddress);
    setBoxSize(order.boxSize);
    // 既存の注文から全商品を抽出
    const allProducts = order.layers.flatMap((layer) => layer.products);
    setProducts(allProducts);
  }, [firestoreOrder]);

  const parsePositiveNumber = (raw: string): number | null => {
    if (raw === '') return null;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  };

  const buildProductSnapshot = (form: ProductFormState) => {
    const capturedAt = new Date().toISOString();

    if (form.source === 'master' && form.skuId) {
      const sku = skuMap.get(form.skuId);
      if (!sku) {
        return { success: false as const, message: '選択された商品マスタが見つかりませんでした。' };
      }
      const override = overridesMap.get(form.skuId);
      const sideMargin = override?.sideMargin ?? defaultSettings.sideMargin;
      const frontMargin = override?.frontMargin ?? defaultSettings.frontMargin;
      const topMargin = override?.topMargin ?? defaultSettings.topMargin;
      const gapXY = override?.gapXY ?? defaultSettings.gapXY;
      const gapZ = override?.gapZ ?? defaultSettings.gapZ;
      const maxStackLayers = override?.maxStackLayers ?? defaultSettings.maxStackLayers;
      const keepUpright = override?.keepUpright ?? defaultSettings.keepUpright ?? false;
      const unitWeightKg = override?.unitWeightKg ?? sku.unitWeightKg ?? defaultSettings.unitWeightKg;

      return {
        success: true as const,
        data: {
          name: sku.name,
          skuId: sku.id,
          source: 'master' as ProductSource,
          dimensions: { w: sku.w, d: sku.d, h: sku.h },
          keepUpright,
          sideMargin,
          frontMargin,
          topMargin,
          gapXY,
          gapZ,
          maxStackLayers,
          unitWeightKg,
          capturedAt,
        },
      };
    }

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      return { success: false as const, message: '商品名を入力してください。' };
    }
    const width = parsePositiveNumber(form.width);
    const depth = parsePositiveNumber(form.depth);
    const height = parsePositiveNumber(form.height);
    if (width === null || depth === null || height === null) {
      return { success: false as const, message: '幅・奥行・高さに正の数値を入力してください。' };
    }

    return {
      success: true as const,
      data: {
        name: trimmedName,
        skuId: undefined,
        source: 'custom' as ProductSource,
        dimensions: { w: width, d: depth, h: height },
        keepUpright: form.keepUpright,
        sideMargin: defaultSettings.sideMargin,
        frontMargin: defaultSettings.frontMargin,
        topMargin: defaultSettings.topMargin,
        gapXY: defaultSettings.gapXY,
        gapZ: defaultSettings.gapZ,
        maxStackLayers: defaultSettings.maxStackLayers,
        unitWeightKg: defaultSettings.unitWeightKg,
        capturedAt,
      },
    };
  };

  const addProduct = () => {
    const trimmedShelf = productForm.shelfLocation.trim();
    if (!trimmedShelf) {
      alert('棚場所を入力してください');
      return;
    }

    const snapshot = buildProductSnapshot(productForm);
    if (!snapshot.success) {
      alert(snapshot.message);
      return;
    }

    const safeQuantity = Number.isFinite(productForm.quantity) && productForm.quantity > 0
      ? Math.floor(productForm.quantity)
      : 1;

    const newProduct: Product = {
      id: `product-${crypto.randomUUID()}`,
      name: snapshot.data.name,
      quantity: safeQuantity,
      shelfLocation: trimmedShelf,
      source: snapshot.data.source,
      skuId: snapshot.data.skuId,
      dimensions: snapshot.data.dimensions,
      keepUpright: snapshot.data.keepUpright,
      sideMargin: snapshot.data.sideMargin,
      frontMargin: snapshot.data.frontMargin,
      topMargin: snapshot.data.topMargin,
      gapXY: snapshot.data.gapXY,
      gapZ: snapshot.data.gapZ,
      maxStackLayers: snapshot.data.maxStackLayers,
      unitWeightKg: snapshot.data.unitWeightKg,
      capturedAt: snapshot.data.capturedAt,
    };

    setProducts([...products, newProduct]);

    setProductForm((prev) => {
      if (prev.source === 'master') {
        return {
          ...prev,
          quantity: 1,
          shelfLocation: '',
        };
      }
      return createInitialProductForm();
    });
  };

  const removeProduct = (productId: string) => {
    setProducts(products.filter((p) => p.id !== productId));
  };

  const computePackingResult = (currentProducts: Product[]) => {
    if (currentProducts.length === 0) {
      return { status: 'pending' as Order['packingStatus'], error: '箱計算対象の商品がありません。' };
    }

    if (boxesLoading) {
      return { status: 'pending' as Order['packingStatus'], error: '箱情報を取得中のため計算を保留しました。' };
    }

    if (normalizedBoxes.length === 0) {
      return { status: 'pending' as Order['packingStatus'], error: '利用可能な箱マスタが見つかりませんでした。' };
    }

    const aggregates = new Map<string, { sku: CalculatorSku; quantity: number }>();

    for (const product of currentProducts) {
      if (!product.dimensions) {
        return { status: 'pending' as Order['packingStatus'], error: '商品寸法が不足しているため箱計算を保留しました。' };
      }

      const dims = product.dimensions;
      const sideMargin = product.sideMargin ?? defaultSettings.sideMargin;
      const frontMargin = product.frontMargin ?? defaultSettings.frontMargin;
      const topMargin = product.topMargin ?? defaultSettings.topMargin;
      const gapXY = product.gapXY ?? defaultSettings.gapXY;
      const gapZ = product.gapZ ?? defaultSettings.gapZ;
      const maxStackLayers = product.maxStackLayers ?? defaultSettings.maxStackLayers;
      const unitWeightKg = product.unitWeightKg ?? defaultSettings.unitWeightKg;
      const keepUpright = product.keepUpright ?? false;

      const key = [
        product.skuId ?? product.name,
        dims.w,
        dims.d,
        dims.h,
        sideMargin,
        frontMargin,
        topMargin,
        gapXY,
        gapZ,
        maxStackLayers ?? 'none',
        keepUpright ? 'upright' : 'free',
      ].join('|');

      if (!aggregates.has(key)) {
        aggregates.set(key, {
          sku: {
            dims: { w: dims.w, d: dims.d, h: dims.h },
            keepUpright,
            sideMargin,
            frontMargin,
            topMargin,
            gapXY,
            gapZ,
            maxStackLayers,
            unitWeightKg,
          },
          quantity: 0,
        });
      }

      const entry = aggregates.get(key)!;
      entry.quantity += product.quantity;
    }

    if (aggregates.size === 0) {
      return { status: 'pending' as Order['packingStatus'], error: '箱計算対象の商品がありません。' };
    }

    const skusForCalc: CalculatorSku[] = [];
    const quantitiesForCalc: number[] = [];
    aggregates.forEach(({ sku, quantity }) => {
      skusForCalc.push(sku);
      quantitiesForCalc.push(quantity);
    });

    try {
      if (skusForCalc.length === 1) {
        const singleSku = skusForCalc[0];
        const singleQuantity = quantitiesForCalc[0];

        const result = chooseBoxesForQuantityExtended(
          normalizedBoxes,
          singleSku,
          singleQuantity,
          { boxPadding: defaultSettings.boxPadding }
        );

        const selections = result.shipments.map((shipment) => ({
          boxId: shipment.plan.boxId,
          quantity: shipment.quantity,
          totalCapacity: shipment.plan.totalCapacity,
          voidRatio: shipment.plan.voidRatio,
        }));

        const summary: PackingSummary = {
          computedAt: new Date().toISOString(),
          boxPadding: defaultSettings.boxPadding,
          leftover: result.leftover,
          selections,
        };

        const status: Order['packingStatus'] = result.shipments.length === 0 || result.leftover > 0 ? 'failed' : 'success';
        const primaryBoxId = selections[0]?.boxId;
        const error = status === 'failed' ? 'すべての商品を箱に収められませんでした。' : undefined;

        return { summary, status, primaryBoxId, error };
      } else {
        const result = chooseBoxesForMultiSkuExtended(normalizedBoxes, skusForCalc, quantitiesForCalc, {
          boxPadding: defaultSettings.boxPadding,
        });

        const selections = result.shipments.map((shipment) => ({
          boxId: shipment.plan.boxId,
          quantity: shipment.quantity,
          totalCapacity: shipment.plan.totalCapacity,
          voidRatio: shipment.plan.voidRatio,
        }));

        const summary: PackingSummary = {
          computedAt: new Date().toISOString(),
          boxPadding: defaultSettings.boxPadding,
          leftover: result.leftover,
          selections,
        };

        const status: Order['packingStatus'] = result.shipments.length === 0 || result.leftover > 0 ? 'failed' : 'success';
        const primaryBoxId = selections[0]?.boxId;
        const error = status === 'failed' ? 'すべての商品を箱に収められませんでした。' : undefined;

        return { summary, status, primaryBoxId, error };
      }
    } catch (error) {
      console.error('箱計算に失敗しました', error);
      return { status: 'failed' as Order['packingStatus'], error: '箱計算中にエラーが発生しました。' };
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!originalOrder) return;

    if (!customerName.trim() || !customerAddress.trim()) {
      alert('顧客名と住所を入力してください');
      return;
    }

    if (products.length === 0) {
      alert('最低1つの商品を追加してください');
      return;
    }

    const packingResult = computePackingResult(products);
    const resolvedBoxSize = packingResult.primaryBoxId != null ? String(packingResult.primaryBoxId) : boxSize;

    // box-calculatorが段を計算するため、全商品を1段目に配置
    const layers: PackingLayer[] = [
      {
        layerNumber: 1,
        products,
      },
    ];

    const updatedOrder: Order = {
      ...(firestoreOrder as Order),
      customerName: customerName.trim(),
      customerAddress: customerAddress.trim(),
      boxSize: resolvedBoxSize,
      layers,
      primaryBoxId: packingResult.primaryBoxId,
      packingStatus: packingResult.status,
      packingSummary: packingResult.summary,
      packingError: packingResult.error,
      updatedAt: new Date().toISOString(),
    };

    // Firestoreへ保存
    try {
      await saveOrder(updatedOrder);
      if (packingResult.status === 'success') {
        alert(`注文 #${firestoreOrder?.orderNumber} を更新しました`);
      } else if (packingResult.status === 'pending') {
        alert(`注文 #${firestoreOrder?.orderNumber} を更新しました（箱計算は保留状態です）`);
      } else {
        alert(`注文 #${firestoreOrder?.orderNumber} を更新しました（箱計算で未収容が発生しています）`);
      }
    } catch (err) {
      console.error('Failed to save order to Firestore', err);
      alert('注文の保存に失敗しました。もう一度お試しください。');
      return;
    }

    router.push(`/orders/${orderId}`);
  };

  const handleDelete = async () => {
    if (!originalOrder) return;

    const confirmed = confirm(
      `注文 #${originalOrder.orderNumber} - ${originalOrder.customerName} を削除してもよろしいですか？\n\n` +
      `※注意: 削除しても注文番号 #${originalOrder.orderNumber} は欠番として残り、再利用されません。`
    );

    if (!confirmed) return;

    try {
      await deleteOrder(orderId);
      alert(`注文 #${originalOrder.orderNumber} を削除しました（番号は欠番として保持されます）`);
      router.push('/orders');
    } catch (err) {
      console.error('Failed to delete order from Firestore', err);
      alert('注文の削除に失敗しました。もう一度お試しください。');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-xl text-gray-600">読み込み中...</p>
      </div>
    );
  }

  if (!originalOrder) {
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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">注文編集</h1>
            <p className="text-sm text-gray-500 mt-1">
              注文番号 #{originalOrder.orderNumber} （この番号は変更できません）
            </p>
          </div>
          <div className="flex gap-3">
            <Button asChild variant="outline">
              <Link href={`/orders/${orderId}`}>キャンセル</Link>
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              注文を削除
            </Button>
          </div>
        </div>

        <form onSubmit={handleUpdate}>
          <Card>
            <CardHeader>
              <CardTitle>顧客情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customerName">顧客名 *</Label>
                <Input
                  id="customerName"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerAddress">住所 *</Label>
                <Textarea
                  id="customerAddress"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  rows={3}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="boxSize">ダンボールサイズ</Label>
                <Select value={boxSize} onValueChange={setBoxSize}>
                  <SelectTrigger id="boxSize">
                    <SelectValue placeholder="サイズを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTO">自動選定（推奨）</SelectItem>
                    <SelectItem value="S">S (小)</SelectItem>
                    <SelectItem value="M">M (中)</SelectItem>
                    <SelectItem value="L">L (大)</SelectItem>
                    <SelectItem value="XL">XL (特大)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>商品情報</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                商品を追加してください。段の配置はbox-calculatorが自動で最適化します。
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 登録済み商品一覧 */}
              {products.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-gray-700">登録済み商品 ({products.length})</h3>
                  {products.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between bg-blue-50 p-3 rounded"
                    >
                      <div className="text-sm">
                        <span className="font-medium text-gray-800">{product.name}</span>
                        <span className="ml-2 text-gray-700">×{product.quantity}</span>
                        <span className="ml-2 text-gray-600">棚 {product.shelfLocation}</span>
                        {product.dimensions ? (
                          <span className="ml-2 text-gray-500">
                            {product.dimensions.w}×{product.dimensions.d}×{product.dimensions.h}mm
                          </span>
                        ) : null}
                        {product.source === 'custom' ? (
                          <span className="ml-2 text-emerald-600 text-xs">カスタム</span>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        onClick={() => removeProduct(product.id)}
                        variant="destructive"
                        size="sm"
                      >
                        削除
                      </Button>
                    </div>
                  ))}
                  <Separator className="my-4" />
                </div>
              )}

              {/* 商品追加フォーム */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-700">商品を追加</h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="product-sku">商品マスタ</Label>
                    <Select
                      value={productForm.source === 'master' && productForm.skuId ? productForm.skuId : 'custom'}
                      onValueChange={(value) => {
                        if (value === 'custom') {
                          setProductForm((prev) => {
                            const base = createInitialProductForm();
                            return {
                              ...base,
                              quantity: prev.quantity,
                              shelfLocation: prev.shelfLocation,
                            };
                          });
                          return;
                        }
                        const sku = skuMap.get(value);
                        if (!sku) {
                          alert('選択した商品マスタを取得できませんでした');
                          return;
                        }
                        setProductForm((prev) => ({
                          ...prev,
                          source: 'master',
                          skuId: sku.id,
                          name: sku.name,
                          width: String(sku.w),
                          depth: String(sku.d),
                          height: String(sku.h),
                        }));
                      }}
                      disabled={!hasMasterData}
                    >
                      <SelectTrigger id="product-sku">
                        <SelectValue placeholder={hasMasterData ? '商品を選択' : 'カスタム入力のみ'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">カスタム入力</SelectItem>
                        {firestoreSkus.map((sku) => (
                          <SelectItem key={sku.id} value={sku.id}>
                            {sku.name} ({sku.w}×{sku.d}×{sku.h}mm)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {skusError && (
                      <p className="text-xs text-amber-600">商品マスタ取得エラー: {skusError}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="product-quantity">数量</Label>
                    <Input
                      id="product-quantity"
                      type="number"
                      min={1}
                      value={productForm.quantity}
                      onChange={(e) =>
                        setProductForm((prev) => ({
                          ...prev,
                          quantity: Number.parseInt(e.target.value, 10) || 1,
                        }))
                      }
                    />
                  </div>
                </div>

                {productForm.source === 'custom' ? (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2 space-y-2">
                      <Label htmlFor="custom-name">商品名</Label>
                      <Input
                        id="custom-name"
                        type="text"
                        placeholder="商品名"
                        value={productForm.name}
                        onChange={(e) =>
                          setProductForm((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="custom-width">幅 (mm)</Label>
                      <Input
                        id="custom-width"
                        type="number"
                        min={1}
                        value={productForm.width}
                        onChange={(e) =>
                          setProductForm((prev) => ({
                            ...prev,
                            width: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="custom-depth">奥行 (mm)</Label>
                      <Input
                        id="custom-depth"
                        type="number"
                        min={1}
                        value={productForm.depth}
                        onChange={(e) =>
                          setProductForm((prev) => ({
                            ...prev,
                            depth: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="custom-height">高さ (mm)</Label>
                      <Input
                        id="custom-height"
                        type="number"
                        min={1}
                        value={productForm.height}
                        onChange={(e) =>
                          setProductForm((prev) => ({
                            ...prev,
                            height: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-gray-600 bg-gray-50 p-3 rounded">
                    <div>
                      <span className="font-semibold">名称:</span> {productForm.name || '未選択'}
                    </div>
                    <div>
                      <span className="font-semibold">寸法:</span>{' '}
                      {productForm.width && productForm.depth && productForm.height
                        ? `${productForm.width} × ${productForm.depth} × ${productForm.height} mm`
                        : '---'}
                    </div>
                    <div>
                      <span className="font-semibold">SKU:</span> {productForm.skuId ?? '---'}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="product-shelf">棚場所 *</Label>
                    <Input
                      id="product-shelf"
                      type="text"
                      placeholder="棚番号など"
                      value={productForm.shelfLocation}
                      onChange={(e) =>
                        setProductForm((prev) => ({
                          ...prev,
                          shelfLocation: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      onClick={addProduct}
                      className="w-full"
                      size="lg"
                    >
                      ➕ 商品を追加
                    </Button>
                  </div>
                </div>

                {!hasMasterData && !skusLoading && (
                  <p className="text-xs text-amber-600">
                    Firestoreに接続できないため、商品はカスタム入力として保存されます。
                  </p>
                )}
                {boxesError && (
                  <p className="text-xs text-amber-600">箱マスタ取得エラー: {boxesError}</p>
                )}
                {!boxesLoading && !boxesError && normalizedBoxes.length === 0 && (
                  <p className="text-xs text-amber-600">箱マスタが未登録のため箱計算は保留されます。</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 更新ボタン */}
          <div className="flex gap-4 mt-6">
            <Button
              type="submit"
              className="flex-1"
              size="lg"
            >
              変更を保存
            </Button>
            <Link href={`/orders/${orderId}`} className="flex-1">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                size="lg"
              >
                キャンセル
              </Button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
