'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSkus } from '@/lib/useFirestore';
import { isFirestoreInitialized } from '@/lib/firestoreClient';
import { getCurrentUser } from '@/lib/siteAuth';

export default function SkuSettings() {
  const { skus, loading, error, addSku, removeSku } = useSkus();
  const [newSku, setNewSku] = useState({ id: '', name: '', w: 0, d: 0, h: 0, unitWeightKg: 0 });
  const router = useRouter();

  useEffect(() => {
    console.log('[SKU Settings Debug]', {
      firestoreInitialized: isFirestoreInitialized(),
      currentUser: getCurrentUser(),
      skusCount: skus.length,
      loading,
      error,
    });
  }, [skus, loading, error]);

  const handleAddSku = async () => {
    if (!newSku.id || !newSku.name || !newSku.w || !newSku.d || !newSku.h) {
      alert('すべての項目を入力してください');
      return;
    }
    
    try {
      await addSku(newSku);
      setNewSku({ id: '', name: '', w: 0, d: 0, h: 0, unitWeightKg: 0 });
      alert('商品を追加しました');
    } catch (err) {
      alert('商品の追加に失敗しました: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDeleteSku = async (id: string) => {
    if (!confirm(`商品 ID: ${id} を削除しますか?`)) {
      return;
    }
    
    try {
      await removeSku(id);
      alert('商品を削除しました');
    } catch (err) {
      alert('商品の削除に失敗しました: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>商品サイズマスタ設定</h1>
        <p>読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>商品サイズマスタ設定</h1>
        <p style={{ color: 'red' }}>エラー: {error}</p>
        <button onClick={() => router.push('/calculator')}>メインページに戻る</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>商品サイズマスタ設定(Firestore版)</h1>
      <div style={{ marginBottom: 16, padding: 12, background: '#e3f2fd', borderRadius: 4 }}>
        <p style={{ margin: 0, fontSize: 14 }}>
          📊 登録件数: <strong>{skus.length}</strong> 件
        </p>
        <p style={{ margin: '8px 0 0 0', fontSize: 12, color: '#666' }}>
          Firestore: {isFirestoreInitialized() ? '✅ 接続済み' : '❌ 未接続'} | 
          認証: {getCurrentUser() ? '✅ ログイン済み' : '❌ 未認証'}
        </p>
        {skus.length === 0 && !loading && (
          <p style={{ margin: '8px 0 0 0', fontSize: 12, color: '#f44336' }}>
            ⚠️ データが読み込めていません。ブラウザのコンソール(F12)でエラーを確認してください。
          </p>
        )}
      </div>
      <div>
        <label htmlFor="sku-id">SKU ID: </label>
        <input
          id="sku-id"
          type="text"
          value={newSku.id}
          onChange={(e) => setNewSku({ ...newSku, id: e.target.value })}
        />
        <label htmlFor="sku-name">商品名: </label>
        <input
          id="sku-name"
          type="text"
          value={newSku.name}
          onChange={(e) => setNewSku({ ...newSku, name: e.target.value })}
        />
        <label htmlFor="sku-w">幅 (mm): </label>
        <input
          id="sku-w"
          type="number"
          value={newSku.w}
          onChange={(e) => setNewSku({ ...newSku, w: Number(e.target.value) })}
        />
        <label htmlFor="sku-d">奥行 (mm): </label>
        <input
          id="sku-d"
          type="number"
          value={newSku.d}
          onChange={(e) => setNewSku({ ...newSku, d: Number(e.target.value) })}
        />
        <label htmlFor="sku-h">高さ (mm): </label>
        <input
          id="sku-h"
          type="number"
          value={newSku.h}
          onChange={(e) => setNewSku({ ...newSku, h: Number(e.target.value) })}
        />
        <label htmlFor="sku-unit-weight">単品重量 (kg): </label>
        <input
          id="sku-unit-weight"
          type="number"
          step="0.001"
          value={newSku.unitWeightKg}
          onChange={(e) => setNewSku({ ...newSku, unitWeightKg: Number(e.target.value) })}
        />
        <button onClick={handleAddSku}>追加</button>
      </div>
      <h2>登録済みの商品</h2>
      <ul>
        {skus.map((sku) => (
          <li key={sku.id}>
            ID: {sku.id}, 名称: {sku.name}, 幅: {sku.w}mm, 奥行: {sku.d}mm, 高さ: {sku.h}mm, 単品重量: {sku.unitWeightKg || 0}kg
            <button onClick={() => handleDeleteSku(sku.id)}>削除</button>
          </li>
        ))}
      </ul>
      <button onClick={() => router.push('/calculator')}>メインページに戻る</button>
    </div>
  );
}
