'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Order, OrderStatus, Product, PackingLayer, ProductSource, PackingSummary } from '@/types/order';
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
import { useBoxes, useGeneralSettings, useNextOrderNumber } from '@/lib/useFirestore';
import { saveOrder } from '@/lib/firestoreClient';
import type { GeneralSettingsData } from '@/lib/firestoreClient';
import {
  chooseBoxesForMultiSkuExtended,
  chooseBoxesForQuantityExtended,
  type Box as CalculatorBox,
  type Sku as CalculatorSku,
} from '@/lib/box-calculator';

type ProductFormState = {
  // master選択時に使うID（variantGroupId等）
  skuId?: string;
  // 表示用/入力用の商品名
  name: string;
  categoryId?: string;
  categoryLabel?: string;
  typeId?: string;
  typeLabel?: string;
  quantity: number;
  width: string;
  depth: string;
  height: string;
  unitWeightKg?: number;
  source: ProductSource;
  keepUpright: boolean;
  // 棚場所などの入力フィールド
  shelfLocation?: string;
};

const createInitialProductForm = (keepUpright = false): ProductFormState => ({
  skuId: undefined,
  name: '',
  categoryId: undefined,
  categoryLabel: undefined,
  typeId: undefined,
  typeLabel: undefined,
  quantity: 1,
  width: '',
  depth: '',
  height: '',
  unitWeightKg: undefined,
  source: 'custom',
  keepUpright,
  shelfLocation: '',
});

export default function NewOrderPage() {
  const router = useRouter();
  const { fetchNextOrderNumber } = useNextOrderNumber();

  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [boxSize, setBoxSize] = useState('AUTO');
  const [products, setProducts] = useState<Product[]>([]);
  const [productForm, setProductForm] = useState<ProductFormState>(() => createInitialProductForm());
  const { boxes, loading: boxesLoading, error: boxesError } = useBoxes();
  const { settings: generalSettings } = useGeneralSettings();

  // --- プレースホルダ: 商品マスタ / 在庫データの接続がこのファイルで未定義のため
  // 一時的に���低限の変数を定義して型エラーを回避します。
  // 本来は適切なフック(useProductsMaster 等)から取得する想定です。
  const combinedProductsMap: Map<string, any> = new Map();
  const hasMasterData = false;
  const productsMasterError: string | undefined = undefined;
  const inventoryError: string | undefined = undefined;
  const productsMasterLoading = false;
  const inventoryLoading = false;

  const defaultSettings = useMemo(() => {
    const settings: GeneralSettingsData | null = generalSettings ?? null;
    return {
      sideMargin: settings?.defaultSideMargin ?? settings?.sideMargin ?? 0,
      frontMargin: settings?.defaultFrontMargin ?? settings?.frontMargin ?? 0,
      topMargin: settings?.defaultTopMargin ?? settings?.topMargin ?? 0,
      gapXY: settings?.defaultGapXY ?? settings?.gapXY ?? 0,
      gapZ: settings?.defaultGapZ ?? settings?.gapZ ?? 0,
      maxStackLayers: settings?.defaultMaxStackLayers ?? settings?.maxStackLayers ?? undefined,
      boxPadding: settings?.defaultBoxPadding ?? settings?.boxPadding ?? 0,
      keepUpright: settings?.keepUpright ?? false,
      unitWeightKg: settings?.unitWeightKg ?? 0,
    };
  }, [generalSettings]);

  const normalizedBoxes = useMemo<CalculatorBox[]>(() => {
    return boxes.map((box) => ({
      id: box.id,
      inner: box.inner,
      maxWeightKg: box.maxWeightKg,
      boxWeightKg: box.boxWeightKg,
    }));
  }, [boxes]);

  const parsePositiveNumber = (raw: string): number | null => {
    if (raw === '') return null;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  };

  const buildProductSnapshot = (form: ProductFormState) => {
    const capturedAt = new Date().toISOString();
    const width = parsePositiveNumber(form.width);
    const depth = parsePositiveNumber(form.depth);
    const height = parsePositiveNumber(form.height);

    if (form.skuId) {
      if (!form.name.trim()) {
        return { success: false as const, message: '商品名を選択してください。' };
      }
      if (width === null || depth === null || height === null) {
        return { success: false as const, message: '商品マスタに有効な寸法が登録されていません。' };
      }
      return {
        success: true as const,
        data: {
          name: form.name.trim(),
          productId: form.skuId,
          source: 'master' as ProductSource,
          dimensions: { w: width, d: depth, h: height },
          keepUpright: defaultSettings.keepUpright,
          sideMargin: defaultSettings.sideMargin,
          frontMargin: defaultSettings.frontMargin,
          topMargin: defaultSettings.topMargin,
          gapXY: defaultSettings.gapXY,
          gapZ: defaultSettings.gapZ,
          maxStackLayers: defaultSettings.maxStackLayers,
          unitWeightKg: form.unitWeightKg ?? defaultSettings.unitWeightKg,
          capturedAt,
        },
      };
    }

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      return { success: false as const, message: '商品名を入力してください。' };
    }
    if (width === null || depth === null || height === null) {
      return { success: false as const, message: '幅・奥行・高さに正の数値を入力してください。' };
    }

    return {
      success: true as const,
      data: {
        name: trimmedName,
        productId: undefined,
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
      shelfLocation: '',
      source: snapshot.data.source,
      skuId: snapshot.data.productId,
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

    setProducts((prev) => [...prev, newProduct]);
    setProductForm(createInitialProductForm(defaultSettings.keepUpright));
  };

  const removeProduct = (productId: string) => {
    setProducts(products.filter((p) => p.id !== productId));
  };

  const computePackingResult = (currentProducts: Product[]) => {
    console.log('🔍 [computePackingResult] 開始');
    console.log('  商品数:', currentProducts.length);
    console.log('  商品:', currentProducts.map(p => ({ name: p.name, qty: p.quantity, dims: p.dimensions })));

    if (currentProducts.length === 0) {
      return { status: 'pending' as Order['packingStatus'], error: '箱計算対象の商品がありません。' };
    }

    if (boxesLoading) {
      return { status: 'pending' as Order['packingStatus'], error: '箱情報を取得中のため計算を保留しました。' };
    }

    console.log('  箱マスタ数:', normalizedBoxes.length);
    console.log('  箱マスタ:', normalizedBoxes.map(b => ({ id: b.id, inner: b.inner })));

    if (normalizedBoxes.length === 0) {
      return { status: 'pending' as Order['packingStatus'], error: '利用可能な箱マスタが見つかりませんでした。' };
    }

    const aggregates = new Map<string, { sku: CalculatorSku; quantity: number }>();

    for (const product of currentProducts) {
      if (!product.dimensions) {
        return { status: 'pending' as Order['packingStatus'], error: '商品寸法が不足しているため箱計算を保留しまし���。' };
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

    console.log('  集計済みSKU数:', skusForCalc.length);
    console.log('  SKUs:', skusForCalc.map((s, i) => ({
      dims: s.dims,
      qty: quantitiesForCalc[i],
      keepUpright: s.keepUpright,
      margins: { side: s.sideMargin, front: s.frontMargin, top: s.topMargin },
      gaps: { xy: s.gapXY, z: s.gapZ },
      maxStack: s.maxStackLayers,
      weight: s.unitWeightKg,
    })));
    console.log('  defaultSettings:', defaultSettings);

    try {
      // 集約結果が1種類（単一SKU）なら単一SKU用計算、2��類以上なら複数SKU用計算を使用
      if (skusForCalc.length === 1) {
        console.log('  -> 単一SKU用計算を使用');
        const singleSku = skusForCalc[0];
        const singleQuantity = quantitiesForCalc[0];

        const result = chooseBoxesForQuantityExtended(
          normalizedBoxes,
          singleSku,
          singleQuantity,
          { boxPadding: defaultSettings.boxPadding }
        );

        console.log('  計算結果:', {
          shipments: result.shipments.length,
          leftover: result.leftover,
          selections: result.shipments.map(s => ({ boxId: s.plan.boxId, qty: s.quantity, void: s.plan.voidRatio })),
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
      } else {
        console.log('  -> 複数SKU用計算を使用');
        const result = chooseBoxesForMultiSkuExtended(normalizedBoxes, skusForCalc, quantitiesForCalc, {
          boxPadding: defaultSettings.boxPadding,
        });

        console.log('  計算結果:', {
          shipments: result.shipments.length,
          leftover: result.leftover,
          selections: result.shipments.map(s => ({ boxId: s.plan.boxId, qty: s.quantity, void: s.plan.voidRatio })),
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerName.trim() || !customerAddress.trim()) {
      alert('顧客名と住所を入力してください');
      return;
    }

    if (products.length === 0) {
      alert('最低1つの商品を追加してください');
      return;
    }

    const packingResult = computePackingResult(products);
    const nowIso = new Date().toISOString();
    const orderDate = nowIso.split('T')[0];
    const resolvedBoxSize = packingResult.primaryBoxId != null ? String(packingResult.primaryBoxId) : boxSize;

    try {
      const orderNumber = await fetchNextOrderNumber();
      // 生成された注文ID（YYYYMMDD-###）
      const orderId = `${orderDate.replace(/-/g, '')}-${String(orderNumber).padStart(3, '0')}`;

      // box-calculatorが段を計算するため、全商品を1段目に配置
      const layers: PackingLayer[] = [
        {
          layerNumber: 1,
          products,
        },
      ];

      const newOrder: Order = {
        id: orderId,
        orderNumber,
        customerName: customerName.trim(),
        customerAddress: customerAddress.trim(),
        orderDate,
        status: OrderStatus.PENDING,
        boxSize: resolvedBoxSize,
        layers,
        primaryBoxId: packingResult.primaryBoxId,
        packingStatus: packingResult.status,
        packingSummary: packingResult.summary,
        packingError: packingResult.error,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await saveOrder(newOrder);
      if (packingResult.status === 'success') {
        alert('注文を登録しました');
      } else if (packingResult.status === 'pending') {
        alert('注文を登録しました（箱計算は保留状態です。接続・マスタ情報を確認してください）');
      } else {
        alert('注文を登録しました（箱計算で未収容が発生しています）');
      }
      router.push('/orders');
    } catch (error) {
      console.error('注文の保存に失敗しました:', error);
      alert('注��の保存に失敗しました。もう一度お試しください。');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">注文作成</h1>
              <p className="text-sm text-gray-600">顧客情報と商品を入力し、箱選定を確認した上で注文を登録します。</p>
            </div>
            <div className="flex items-center gap-3">
              <Button asChild variant="outline">
                <Link href="/">ホーム</Link>
              </Button>
              <Link href="/orders">
                <Button variant="white">注文一覧へ</Button>
              </Link>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 左: 顧客情報 */}
          <div className="lg:col-span-4">
            <Card>
              <CardHeader>
                <CardTitle>顧客情報</CardTitle>
                <p className="text-sm text-gray-500 mt-1">配送先や連絡先を入力します。</p>
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
                    rows={4}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="boxSize">指定ダンボールサイズ</Label>
                  <Select value={boxSize} onValueChange={setBoxSize}>
                    <SelectTrigger id="boxSize">
                      <SelectValue placeholder="自動 or 手動で選択" />
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

                <div className="pt-2 border-t border-gray-100">
                  <h4 className="text-sm font-medium text-gray-700">クイック操作</h4>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => { alert('下書き保存は未実装'); }} className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      下書き保存
                    </button>
                    <button type="button" onClick={() => { setCustomerName(''); setCustomerAddress(''); }} className="inline-flex items-center justify-center rounded-md bg-gradient-to-br from-[#f3f4f6] to-[#e5e7eb] px-3 py-2 text-sm text-gray-700 hover:brightness-95">
                      フォームをリセット
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle>箱マスタ</CardTitle>
                <p className="text-sm text-gray-500 mt-1">システムに登録された箱情報を基に自動判定します。</p>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-700">
                  <div>箱マスタ数: <strong>{normalizedBoxes.length}</strong></div>
                  {boxesLoading && <div className="text-xs text-gray-500">取得中...</div>}
                  {boxesError && <div className="text-xs text-amber-600">取得エラー: {boxesError}</div>}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 中央: 商品リストと追加フォーム */}
          <div className="lg:col-span-5">
            <Card>
              <CardHeader>
                <CardTitle>商品情報</CardTitle>
                <p className="text-sm text-gray-500 mt-1">商品を追加して、箱計算の対象にします。</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 登録済み商品一覧 */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-gray-700">登録済み商品</h3>
                    <span className="text-xs text-gray-500">{products.length} 件</span>
                  </div>

                  {products.length === 0 ? (
                    <div className="text-sm text-gray-500">商品がまだ追加されていません。</div>
                  ) : (
                    <ul className="space-y-2">
                      {products.map((product) => (
                        <li key={product.id} className="flex items-center justify-between gap-3 p-3 bg-white border rounded">
                          <div className="min-w-0">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 flex-shrink-0 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-medium">{(product.name || '?').slice(0, 1)}</div>
                              <div className="truncate">
                                <div className="text-sm font-medium text-gray-800 truncate">{product.name}</div>
                                <div className="text-xs text-gray-500">棚: {product.shelfLocation || '—'} • 数量: {product.quantity}</div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-xs text-gray-500">{product.dimensions ? `${product.dimensions.w}×${product.dimensions.d}×${product.dimensions.h} mm` : '寸法なし'}</div>
                            <Button type="button" variant="destructive" size="sm" onClick={() => removeProduct(product.id)}>削除</Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <Separator />

                {/* 商品追加フォーム */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">商品を追加</h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
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
                          const product = combinedProductsMap.get(value);
                          if (product && product.w && product.d && product.h) {
                            setProductForm((prev) => ({
                              ...prev,
                              source: 'master',
                              skuId: product.variantGroupId,
                              name: product.productName,
                              width: String(product.w),
                              depth: String(product.d),
                              height: String(product.h),
                            }));
                            return;
                          }
                          alert('選択した商品マスタを取得できませんでした');
                        }}
                        disabled={!hasMasterData}
                      >
                        <SelectTrigger id="product-sku">
                          <SelectValue placeholder={hasMasterData ? '商品を選択' : 'カスタム入力のみ'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">カスタム入力</SelectItem>
                          {Array.from(combinedProductsMap.values()).map((product) => {
                            if (!product.w || !product.d || !product.h) return null;
                            return (
                              <SelectItem key={product.variantGroupId} value={product.variantGroupId}>
                                {product.productName} ({product.w}×{product.d}×{product.h}mm) [在庫: {product.availableStock}]
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
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
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
                      <div className="sm:col-span-2">
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
                      <div>
                        <Label htmlFor="custom-width">幅 (mm)</Label>
                        <Input id="custom-width" type="number" min={1} value={productForm.width} onChange={(e) => setProductForm((prev) => ({ ...prev, width: e.target.value }))} />
                      </div>
                      <div>
                        <Label htmlFor="custom-depth">奥行 (mm)</Label>
                        <Input id="custom-depth" type="number" min={1} value={productForm.depth} onChange={(e) => setProductForm((prev) => ({ ...prev, depth: e.target.value }))} />
                      </div>
                      <div>
                        <Label htmlFor="custom-height">高さ (mm)</Label>
                        <Input id="custom-height" type="number" min={1} value={productForm.height} onChange={(e) => setProductForm((prev) => ({ ...prev, height: e.target.value }))} />
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 p-3 rounded mt-3 text-sm text-gray-600">
                      <div><span className="font-semibold">名称:</span> {productForm.name || '未選択'}</div>
                      <div><span className="font-semibold">寸法:</span> {productForm.width && productForm.depth && productForm.height ? `${productForm.width} × ${productForm.depth} × ${productForm.height} mm` : '---'}</div>
                      <div><span className="font-semibold">SKU:</span> {productForm.skuId ?? '---'}</div>
                      {productForm.skuId && combinedProductsMap.has(productForm.skuId) && (
                        <div className="mt-2 text-sm text-green-600 font-bold">現在庫: {combinedProductsMap.get(productForm.skuId)!.availableStock} 個</div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <div>
                      <Label htmlFor="product-shelf">棚場所 *</Label>
                      <Input id="product-shelf" type="text" placeholder="棚番号など" value={productForm.shelfLocation} onChange={(e) => setProductForm((prev) => ({ ...prev, shelfLocation: e.target.value }))} />
                    </div>
                    <div className="flex items-end">
                      <Button type="button" onClick={addProduct} className="w-full" size="lg">➕ 商品を追加</Button>
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-amber-600">
                    {!hasMasterData && !productsMasterLoading && !inventoryLoading && (
                      <p>Firestoreに接続できないため、商品はカスタム入力として保存されます。</p>
                    )}
                    {(productsMasterLoading || inventoryLoading) && (
                      <p>商品マ��タと在庫情報を読み込み中...</p>
                    )}
                    {boxesError && (
                      <p>箱マスタ取得エラー: {boxesError}</p>
                    )}
                    {!boxesLoading && !boxesError && normalizedBoxes.length === 0 && (
                      <p>箱マスタが未登録のため箱計算は保留されます。</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 右: 箱計算サマリ + アクション */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>箱計算サマリ</CardTitle>
                <p className="text-sm text-gray-500 mt-1">現在の登録商品から推定される最適箱情報を表示します。</p>
              </CardHeader>
              <CardContent>
                {(() => {
                  const result = computePackingResult(products);
                  return (
                    <div className="space-y-3 text-sm text-gray-700">
                      <div>状態: <strong className={`${result.status === 'success' ? 'text-emerald-600' : result.status === 'failed' ? 'text-rose-600' : 'text-amber-600'}`}>{result.status}</strong></div>
                      <div>主箱: <strong>{result.primaryBoxId ?? boxSize}</strong></div>
                      <div>残余: <strong>{result.summary?.leftover ?? '—'}</strong></div>
                      {result.error && <div className="text-xs text-amber-600">エラー: {result.error}</div>}

                      <div className="pt-2">
                        <h4 className="text-sm font-medium">選択ボックス</h4>
                        <ul className="mt-2 space-y-2">
                          {result.summary?.selections?.map((s) => (
                            <li key={s.boxId} className="flex items-center justify-between bg-white p-2 border rounded text-xs">
                              <div className="truncate">{s.boxId}</div>
                              <div className="text-xs text-gray-500">個数: {s.quantity}</div>
                            </li>
                          ))}
                          {!result.summary?.selections?.length && <li className="text-xs text-gray-500">選択されたボックスはありません。</li>}
                        </ul>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            <div className="mt-4 sticky bottom-6">
              <div className="flex flex-col gap-3">
                <Button type="submit" size="lg">注文登録</Button>
                <Link href="/orders">
                  <Button type="button" variant="outline" size="lg">キャンセル</Button>
                </Link>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
