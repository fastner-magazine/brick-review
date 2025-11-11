'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBoxes } from '@/lib/useFirestore';
import type { BoxData } from '@/lib/firestoreClient';

type EditableBox = {
  id: number;
  innerW: number;
  innerD: number;
  innerH: number;
  outerW?: number;
  outerD?: number;
  outerH?: number;
};

export default function BoxSettings() {
  const router = useRouter();
  const { boxes, loading, error, addBox, updateBox, removeBox, reload } = useBoxes();
  const [newBox, setNewBox] = useState({ id: 0, W: 0, D: 0, H: 0, outerW: 0, outerD: 0, outerH: 0 });
  const [editForms, setEditForms] = useState<Record<number, EditableBox>>({});
  const [pending, setPending] = useState(false);

  const sortedBoxes = useMemo(() => boxes.slice().sort((a, b) => a.id - b.id), [boxes]);

  useEffect(() => {
    setEditForms({});
  }, [boxes]);

  const resetNewForm = () => {
    setNewBox({ id: 0, W: 0, D: 0, H: 0, outerW: 0, outerD: 0, outerH: 0 });
  };

  const handleAddBox = async () => {
    if (!newBox.id || !newBox.W || !newBox.D || !newBox.H) {
      alert('IDと内寸(W/D/H)をすべて入力してください。');
      return;
    }
    if (sortedBoxes.some((b) => b.id === newBox.id)) {
      alert('同じIDの箱が既に存在します。別のIDを指定してください。');
      return;
    }

    const payload: BoxData = {
      id: newBox.id,
      inner: { W: newBox.W, D: newBox.D, H: newBox.H },
    };

    if (newBox.outerW || newBox.outerD || newBox.outerH) {
      payload.outer = {
        W: newBox.outerW,
        D: newBox.outerD,
        H: newBox.outerH,
      };
    }

    try {
      setPending(true);
      await addBox(payload);
      resetNewForm();
    } catch (err) {
      console.error('Failed to add box', err);
      alert('箱の追加に失敗しました。Firebase 設定を確認してください。');
    } finally {
      setPending(false);
    }
  };

  const startEdit = (box: BoxData) => {
    setEditForms((prev) => ({
      ...prev,
      [box.id]: {
        id: box.id,
        innerW: box.inner.W,
        innerD: box.inner.D,
        innerH: box.inner.H,
        outerW: box.outer?.W,
        outerD: box.outer?.D,
        outerH: box.outer?.H,
      },
    }));
  };

  const cancelEdit = (id: number) => {
    setEditForms((prev) => {
      // 明示的な未使用変数を作らずに対象キーを削除して新しいオブジェクトを返す
      const copy = { ...prev } as Record<number, EditableBox>;
      delete copy[id];
      return copy;
    });
  };

  const updateEditField = (id: number, field: keyof EditableBox, value: number) => {
    setEditForms((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  };

  const saveEdit = async (originalId: number) => {
    const form = editForms[originalId];
    if (!form) return;

    const nextId = Number(form.id);
    if (!Number.isInteger(nextId) || nextId <= 0) {
      alert('有効なID(正の整数)を入力してください。');
      return;
    }
    if (nextId !== originalId && sortedBoxes.some((b) => b.id === nextId)) {
      alert('そのIDは既に使用されています。別のIDを指定してください。');
      return;
    }

    const payload: BoxData = {
      id: nextId,
      inner: {
        W: Number(form.innerW),
        D: Number(form.innerD),
        H: Number(form.innerH),
      },
    };

    if (form.outerW || form.outerD || form.outerH) {
      payload.outer = {
        W: Number(form.outerW) || 0,
        D: Number(form.outerD) || 0,
        H: Number(form.outerH) || 0,
      };
    }

    try {
      setPending(true);
      await updateBox(payload, originalId);
      cancelEdit(originalId);
    } catch (err) {
      console.error('Failed to update box', err);
      alert('箱の更新に失敗しました。もう一度お試しください。');
    } finally {
      setPending(false);
    }
  };

  const handleDeleteBox = async (id: number) => {
    const ok = typeof window !== 'undefined' ? window.confirm('この箱を削除しますか?') : true;
    if (!ok) return;
    try {
      setPending(true);
      await removeBox(id);
    } catch (err) {
      console.error('Failed to delete box', err);
      alert('箱の削除に失敗しました。');
    } finally {
      setPending(false);
    }
  };

  if (loading && boxes.length === 0) {
    return (
      <div style={{ padding: '20px' }}>
        <p>箱情報を読み込み中です…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px' }}>
        <p style={{ color: '#d32f2f' }}>箱情報の取得に失敗しました: {error}</p>
        <button type="button" onClick={reload} style={{ marginRight: 8 }}>
          再読み込み
        </button>
        <button type="button" onClick={() => router.push('/calculator')}>メインページに戻る</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>箱情報設定</h1>

      <div>
        <label htmlFor="box-id">ID:</label>
        <input
          id="box-id"
          type="number"
          value={newBox.id || ''}
          onChange={(e) => setNewBox({ ...newBox, id: Number(e.target.value) })}
          style={{ width: 80, marginLeft: 4, marginRight: 12 }}
        />
        <label htmlFor="box-d">長さ (D, mm):</label>
        <input
          id="box-d"
          type="number"
          value={newBox.D || ''}
          onChange={(e) => setNewBox({ ...newBox, D: Number(e.target.value) })}
          style={{ width: 100, marginLeft: 4, marginRight: 12 }}
        />
        <label htmlFor="box-w">幅 (W, mm):</label>
        <input
          id="box-w"
          type="number"
          value={newBox.W || ''}
          onChange={(e) => setNewBox({ ...newBox, W: Number(e.target.value) })}
          style={{ width: 100, marginLeft: 4, marginRight: 12 }}
        />
        <label htmlFor="box-h">高さ (H, mm):</label>
        <input
          id="box-h"
          type="number"
          value={newBox.H || ''}
          onChange={(e) => setNewBox({ ...newBox, H: Number(e.target.value) })}
          style={{ width: 100, marginLeft: 4, marginRight: 12 }}
        />
        <div style={{ marginTop: 8 }}>
          <strong>外寸(任意)</strong>
          <label htmlFor="box-outer-d" style={{ marginLeft: 8 }}>長さ:</label>
          <input
            id="box-outer-d"
            type="number"
            value={newBox.outerD || ''}
            onChange={(e) => setNewBox({ ...newBox, outerD: Number(e.target.value) })}
            style={{ width: 100, marginLeft: 4, marginRight: 12 }}
          />
          <label htmlFor="box-outer-w">幅:</label>
          <input
            id="box-outer-w"
            type="number"
            value={newBox.outerW || ''}
            onChange={(e) => setNewBox({ ...newBox, outerW: Number(e.target.value) })}
            style={{ width: 100, marginLeft: 4, marginRight: 12 }}
          />
          <label htmlFor="box-outer-h">高さ:</label>
          <input
            id="box-outer-h"
            type="number"
            value={newBox.outerH || ''}
            onChange={(e) => setNewBox({ ...newBox, outerH: Number(e.target.value) })}
            style={{ width: 100, marginLeft: 4 }}
          />
        </div>
        <button type="button" onClick={handleAddBox} disabled={pending} style={{ marginTop: 8 }}>
          追加
        </button>
      </div>

      <h2 style={{ marginTop: 24 }}>登録済みの箱(mm単位)</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {sortedBoxes.map((box) => {
          const form = editForms[box.id];
          if (form) {
            return (
              <li key={box.id} style={{ marginBottom: 12, border: '1px solid #eee', padding: 12, borderRadius: 6 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <label>
                    ID:
                    <input
                      type="number"
                      value={form.id}
                      onChange={(e) => updateEditField(box.id, 'id', Number(e.target.value))}
                      style={{ width: 80, marginLeft: 4 }}
                    />
                  </label>
                  <label>
                    長さ (D):
                    <input
                      type="number"
                      value={form.innerD}
                      onChange={(e) => updateEditField(box.id, 'innerD', Number(e.target.value))}
                      style={{ width: 100, marginLeft: 4 }}
                    />
                  </label>
                  <label>
                    幅 (W):
                    <input
                      type="number"
                      value={form.innerW}
                      onChange={(e) => updateEditField(box.id, 'innerW', Number(e.target.value))}
                      style={{ width: 100, marginLeft: 4 }}
                    />
                  </label>
                  <label>
                    高さ (H):
                    <input
                      type="number"
                      value={form.innerH}
                      onChange={(e) => updateEditField(box.id, 'innerH', Number(e.target.value))}
                      style={{ width: 100, marginLeft: 4 }}
                    />
                  </label>
                </div>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <strong>外寸</strong>
                  <label>
                    長さ:
                    <input
                      type="number"
                      value={form.outerD ?? ''}
                      onChange={(e) => updateEditField(box.id, 'outerD', Number(e.target.value))}
                      style={{ width: 100, marginLeft: 4 }}
                    />
                  </label>
                  <label>
                    幅:
                    <input
                      type="number"
                      value={form.outerW ?? ''}
                      onChange={(e) => updateEditField(box.id, 'outerW', Number(e.target.value))}
                      style={{ width: 100, marginLeft: 4 }}
                    />
                  </label>
                  <label>
                    高さ:
                    <input
                      type="number"
                      value={form.outerH ?? ''}
                      onChange={(e) => updateEditField(box.id, 'outerH', Number(e.target.value))}
                      style={{ width: 100, marginLeft: 4 }}
                    />
                  </label>
                </div>
                <div style={{ marginTop: 8 }}>
                  <button type="button" onClick={() => saveEdit(box.id)} disabled={pending} style={{ marginRight: 8 }}>
                    保存
                  </button>
                  <button type="button" onClick={() => cancelEdit(box.id)} disabled={pending}>
                    キャンセル
                  </button>
                </div>
              </li>
            );
          }

          return (
            <li key={box.id} style={{ marginBottom: 12, border: '1px solid #eee', padding: 12, borderRadius: 6 }}>
              <strong>ID: {box.id}</strong>
              <span style={{ marginLeft: 8 }}>
                内寸: {box.inner.D} × {box.inner.W} × {box.inner.H} mm
              </span>
              {box.outer && (
                <span style={{ marginLeft: 8, color: '#666' }}>
                  外寸: {box.outer.D} × {box.outer.W} × {box.outer.H} mm
                </span>
              )}
              <div style={{ marginTop: 8 }}>
                <button type="button" onClick={() => startEdit(box)} style={{ marginRight: 8 }}>
                  編集
                </button>
                <button type="button" onClick={() => handleDeleteBox(box.id)} disabled={pending}>
                  削除
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {boxes.length > 0 && (
        <div style={{ marginTop: 16, color: '#c00' }}>
          ※異常なサイズの箱が登録されていないかご確認ください
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <button type="button" onClick={() => router.push('/calculator')}>メインページに戻る</button>
      </div>
    </div>
  );
}
