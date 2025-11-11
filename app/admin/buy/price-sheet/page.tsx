'use client';

import React, { useState, useRef, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firestoreClient';

interface PriceItem {
  id: string;
  productName: string;
  variantName: string;
  price: number;
  categoryLabel?: string;
  typeLabel?: string;
}

export default function PriceSheetPage() {
  const [priceItems, setPriceItems] = useState<PriceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.7);
  const [columns, setColumns] = useState(3);
  const [fontSize, setFontSize] = useState(16);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredItems, setFilteredItems] = useState<PriceItem[]>([]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 1200, height: 800 });

  // 買取価格マスタを取得
  const fetchPrices = async () => {
    setLoading(true);
    try {
      const db = getFirestoreClient();
      if (!db) {
        alert('Firestoreの初期化に失敗しました');
        return;
      }
      
      const q = query(
        collection(db, 'buypricesMaster'),
        orderBy('price', 'desc'),
        limit(100)
      );
      
      const snapshot = await getDocs(q);
      const items: PriceItem[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          productName: data.productName || '',
          variantName: data.variantName || '',
          price: data.price || 0,
          categoryLabel: data.categoryLabel,
          typeLabel: data.typeLabel,
        };
      });
      
      setPriceItems(items);
      setFilteredItems(items);
    } catch (error) {
      console.error('価格取得エラー:', error);
      alert('価格データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 画像選択
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setImageDimensions({ width: img.width, height: img.height });
        setSelectedImage(event.target?.result as string);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // 検索フィルター
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredItems(priceItems);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    const filtered = priceItems.filter(item => 
      item.productName.toLowerCase().includes(query) ||
      item.variantName.toLowerCase().includes(query) ||
      item.categoryLabel?.toLowerCase().includes(query) ||
      item.typeLabel?.toLowerCase().includes(query)
    );
    setFilteredItems(filtered);
  }, [searchQuery, priceItems]);

  // キャンバスに描画
  useEffect(() => {
    if (!selectedImage || !canvasRef.current || filteredItems.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // キャンバスサイズを画像に合わせる
      canvas.width = imageDimensions.width;
      canvas.height = imageDimensions.height;

      // 背景画像を描画
      ctx.globalAlpha = backgroundOpacity;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1.0;

      // グリッドレイアウトで価格表を描画
      const padding = 40;
      const itemsPerRow = columns;
      const itemWidth = (canvas.width - padding * 2) / itemsPerRow;
      const itemHeight = fontSize * 4; // 商品名 + バリアント名 + 価格 + 余白

      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;

      filteredItems.forEach((item, index) => {
        const row = Math.floor(index / itemsPerRow);
        const col = index % itemsPerRow;
        const x = padding + col * itemWidth;
        const y = padding + row * itemHeight;

        // 背景ボックス
        ctx.fillRect(x, y, itemWidth - 10, itemHeight - 10);
        ctx.strokeRect(x, y, itemWidth - 10, itemHeight - 10);

        // テキスト描画
        ctx.fillStyle = '#ffffff';
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'left';
        
        // 商品名（トリミング）
        const maxWidth = itemWidth - 30;
        let productName = item.productName;
        if (ctx.measureText(productName).width > maxWidth) {
          while (ctx.measureText(productName + '...').width > maxWidth && productName.length > 0) {
            productName = productName.slice(0, -1);
          }
          productName += '...';
        }
        ctx.fillText(productName, x + 10, y + fontSize + 5);

        // バリアント名
        ctx.font = `${fontSize * 0.8}px sans-serif`;
        ctx.fillStyle = '#cccccc';
        let variantName = item.variantName;
        if (ctx.measureText(variantName).width > maxWidth) {
          while (ctx.measureText(variantName + '...').width > maxWidth && variantName.length > 0) {
            variantName = variantName.slice(0, -1);
          }
          variantName += '...';
        }
        ctx.fillText(variantName, x + 10, y + fontSize * 2 + 5);

        // 価格
        ctx.font = `bold ${fontSize * 1.2}px sans-serif`;
        ctx.fillStyle = '#ffeb3b';
        ctx.fillText(`¥${item.price.toLocaleString()}`, x + 10, y + fontSize * 3.5 + 5);
      });
    };
    img.src = selectedImage;
  }, [selectedImage, filteredItems, backgroundOpacity, columns, fontSize, imageDimensions]);

  // ダウンロード
  const handleDownload = () => {
    if (!canvasRef.current) return;
    
    const link = document.createElement('a');
    link.download = `price-sheet-${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">買取価格表 自動発行</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 左側: コントロールパネル */}
          <div className="lg:col-span-1 space-y-6">
            {/* 背景画像選択 */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">背景画像</h2>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              <button
                onClick={() => imageInputRef.current?.click()}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                画像を選択
              </button>
              {selectedImage && (
                <div className="mt-4">
                  <img src={selectedImage} alt="Selected" className="w-full rounded border" />
                  <p className="text-sm text-gray-500 mt-2">
                    {imageDimensions.width} × {imageDimensions.height}
                  </p>
                </div>
              )}
            </div>

            {/* 価格データ取得 */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">価格データ</h2>
              <button
                onClick={fetchPrices}
                disabled={loading}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? '取得中...' : '価格データを取得'}
              </button>
              <p className="mt-2 text-sm text-gray-600">
                取得件数: {priceItems.length}件
              </p>
            </div>

            {/* 検索フィルター */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">検索フィルター</h2>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="商品名、バリアント名で検索"
                className="w-full px-4 py-2 border rounded-lg"
              />
              <p className="mt-2 text-sm text-gray-600">
                表示件数: {filteredItems.length}件
              </p>
            </div>

            {/* 表示設定 */}
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
              <h2 className="text-xl font-bold mb-4">表示設定</h2>
              
              {/* 背景不透明度 */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  背景不透明度: {(backgroundOpacity * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={backgroundOpacity}
                  onChange={(e) => setBackgroundOpacity(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* 列数 */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  列数: {columns}
                </label>
                <input
                  type="range"
                  min="1"
                  max="6"
                  step="1"
                  value={columns}
                  onChange={(e) => setColumns(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* フォントサイズ */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  フォントサイズ: {fontSize}px
                </label>
                <input
                  type="range"
                  min="12"
                  max="32"
                  step="2"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            {/* ダウンロード */}
            <div className="bg-white rounded-lg shadow p-6">
              <button
                onClick={handleDownload}
                disabled={!selectedImage || filteredItems.length === 0}
                className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                PNG でダウンロード
              </button>
            </div>
          </div>

          {/* 右側: プレビュー */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">プレビュー</h2>
              <div className="border rounded-lg overflow-auto" style={{ maxHeight: '800px' }}>
                <canvas
                  ref={canvasRef}
                  className="w-full"
                />
              </div>
              {!selectedImage && (
                <div className="text-center py-12 text-gray-400">
                  背景画像を選択してください
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
