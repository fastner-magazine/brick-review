'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getFirestoreClient } from '@/lib/firestoreClient';
import { collection, getDocs, query, where, orderBy, updateDoc, doc, limit, startAfter, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';

type ItemEntry = {
  category: string;
  item: string;
  subcategory?: string;
  count: number;
  damageBreakdown?: Record<string, number>;
};

type BuyRequest = {
  id: string;
  receptionNumber?: string;
  inboundSerial?: number;
  name: string;
  lineName?: string;
  status?: string;
  items: ItemEntry[];
  createdAt?: string;
  updatedAt?: string;
};

export default function InventoryInboundPage() {
  const [rows, setRows] = useState<BuyRequest[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<number | 'all'>(10);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [damageTerms, setDamageTerms] = useState<{ id: string; label: string; order?: number }[]>([]);
  const [openEditors, setOpenEditors] = useState<Record<number, boolean>>({});
  const [photo1, setPhoto1] = useState<string | null>(null); // 必須
  const [photo2, setPhoto2] = useState<string | null>(null); // 任意

  const active = useMemo(() => rows.find((r) => r.id === activeId) ?? null, [rows, activeId]);

  const nowJstIso = () => {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    const t = Date.UTC(y, m, day, d.getUTCHours() + 9, d.getUTCMinutes(), d.getUTCSeconds());
    const jd = new Date(t);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${jd.getUTCFullYear()}-${pad(jd.getUTCMonth() + 1)}-${pad(jd.getUTCDate())}T${pad(jd.getUTCHours())}:${pad(jd.getUTCMinutes())}:${pad(jd.getUTCSeconds())}+09:00`;
  };
  const formatJst = (s?: string) => {
    try { return s ? new Date(s).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : ''; } catch { return s || ''; }
  };

  const load = async (reset = true) => {
    setLoading(true);
    setError(null);
    try {
      const db = getFirestoreClient();
      if (!db) throw new Error('Firestore not initialized');
      const baseRef = collection(db, 'buy_requests');
      const parts: any[] = [where('status', '==', 'completed'), orderBy('createdAt', 'desc')];
      if (pageSize !== 'all') {
        parts.push(limit(pageSize));
      }
      const qy = query(baseRef, ...parts);
      const snap = await getDocs(qy);
      const list: BuyRequest[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setRows(list);
      setCursor(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
      setHasMore(pageSize !== 'all' ? snap.docs.length === pageSize : false);
      if (reset) setActiveId(list.length > 0 ? list[0].id : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  const loadMore = async () => {
    if (loading || pageSize === 'all' || !cursor) return;
    setLoading(true);
    try {
      const db = getFirestoreClient();
      if (!db) throw new Error('Firestore not initialized');
      const baseRef = collection(db, 'buy_requests');
      const qy = query(
        baseRef,
        where('status', '==', 'completed'),
        orderBy('createdAt', 'desc'),
        startAfter(cursor),
        limit(pageSize as number)
      );
      const snap = await getDocs(qy);
      const list: BuyRequest[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setRows((prev) => [...prev, ...list]);
      setCursor(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
      setHasMore(snap.docs.length === (pageSize as number));
    } finally {
      setLoading(false);
    }
  };

  // カメラ利用は廃止（ファイル入力に統合）

  // load taxonomies damages/terms
  useEffect(() => {
    const fetchTax = async () => {
      try {
        const res = await fetch('/api/taxonomies');
        if (!res.ok) return;
        const json = await res.json();
        const terms = json?.documents?.damages?._subcollections?.terms || {};
        const arr = Object.values(terms).map((t: any) => ({ id: t._id, label: t.label, order: t.order }));
        arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setDamageTerms(arr);
      } catch {
        // ignore
      }
    };
    fetchTax();
  }, []);

  const saveItems = async () => {
    if (!active) return;
    setSaving(true);
    setMessage('入庫用の状態割当を保存しています…');
    try {
      const db = getFirestoreClient();
      if (!db) throw new Error('Firestore not initialized');
      await updateDoc(doc(db, 'buy_requests', active.id), {
        items: active.items,
        updatedAt: nowJstIso(),
      } as any);
      setMessage('保存しました');
      setTimeout(() => setMessage(''), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // カメラ操作ロジックは削除

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>, slot: 'photo1' | 'photo2') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      if (slot === 'photo1') setPhoto1(url);
      else setPhoto2(url);
    };
    reader.readAsDataURL(file);
  };

  const savePhotos = async () => {
    if (!active) return;
    if (!photo1) {
      setError('1枚目の写真は必須です');
      setTimeout(() => setError(null), 1500);
      return;
    }
    setSaving(true);
    setMessage('写真を保存しています…');
    try {
      const db = getFirestoreClient();
      if (!db) throw new Error('Firestore not initialized');
      await updateDoc(doc(db, 'buy_requests', active.id), {
        inboundPhotos: { photo1, photo2: photo2 || null },
        updatedAt: nowJstIso(),
      } as any);
      setMessage('写真を保存しました');
      setTimeout(() => setMessage(''), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-800">入庫処理（検品完了）</h1>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/buy/check" className="text-blue-600 underline">検品へ</Link>
            <Link href="/inventory" className="text-blue-600 underline">ホームへ</Link>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          {loading && <span className="text-gray-500">読み込み中…</span>}
          {error && <span className="text-rose-600">{error}</span>}
          {message && <span className="text-emerald-700">{message}</span>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <aside className={`md:col-span-1 border rounded bg-white ${active ? 'hidden md:block' : ''}`}>
            <div className="px-3 py-2 border-b text-sm font-semibold bg-slate-50 flex items-center justify-between">
              <span>検品完了（入庫待ち）</span>
              <div className="flex items-center gap-2 text-xs">
                <label>表示件数:</label>
                <select
                  className="border rounded px-1 py-0.5"
                  value={pageSize === 'all' ? 'all' : String(pageSize)}
                  onChange={(e) => {
                    const v = e.target.value === 'all' ? 'all' : Number(e.target.value);
                    setPageSize(v as any);
                  }}
                >
                  <option value="10">10件</option>
                  <option value="all">全件</option>
                </select>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-auto divide-y">
              {rows.length === 0 && (
                <div className="p-3 text-sm text-gray-500">対象の申込がありません</div>
              )}
              {rows.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setActiveId(r.id); setOpenEditors({}); }}
                  className={`w-full text-left p-3 text-sm ${activeId === r.id ? 'bg-blue-50' : ''}`}
                >
                  <div className="font-medium text-gray-900">{r.name || '—'}</div>
                  {r.lineName && <div className="text-xs text-gray-700">LINE: {r.lineName}</div>}
                  <div className="text-gray-600 text-xs">{formatJst(r.createdAt)}</div>
                </button>
              ))}
              {hasMore && (
                <div className="p-3">
                  <button
                    onClick={loadMore}
                    disabled={loading}
                    className="w-full text-center px-3 py-2 text-sm rounded border bg-white hover:bg-gray-50"
                  >
                    さらに読み込む
                  </button>
                </div>
              )}
            </div>
          </aside>

          <section className={`md:col-span-2 border rounded bg-white ${active ? '' : 'hidden md:block'}`}>
            {!active ? (
              <div className="p-6 text-sm text-gray-500">左の一覧から選択してください。</div>
            ) : (
              <div className="p-4 flex flex-col gap-4">
                <div className="md:hidden flex items-center justify-between">
                  <button
                    onClick={() => setActiveId(null)}
                    className="px-3 py-1.5 text-sm rounded border bg-white"
                  >
                    ← 一覧へ戻る
                  </button>
                </div>

                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold">申込 {active.receptionNumber || active.id.slice(0, 12)}</h2>
                  <div className="text-sm">氏名: {active.name}</div>
                  {active.lineName && <div className="text-sm text-gray-600">LINE名: {active.lineName}</div>}
                  {typeof active.inboundSerial === 'number' && (
                    <div className="text-sm text-gray-600">入庫連番: {active.inboundSerial}</div>
                  )}
                </div>

                <div className="p-3 border rounded">
                  <div className="font-semibold mb-2">写真撮影（1枚目必須・2枚目任意）</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="border rounded p-2">
                      <div className="text-sm font-medium mb-1">写真1（必須）</div>
                      <div className="aspect-video bg-gray-100 border rounded flex items-center justify-center overflow-hidden">
                        {photo1 ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photo1} alt="photo1" className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-xs text-gray-500">未撮影</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <label className="px-3 py-1.5 text-xs rounded border bg-white hover:bg-gray-50 cursor-pointer">
                          ファイル選択・撮影
                          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPickFile(e, 'photo1')} />
                        </label>
                      </div>
                    </div>
                    <div className="border rounded p-2">
                      <div className="text-sm font-medium mb-1">写真2（任意）</div>
                      <div className="aspect-video bg-gray-100 border rounded flex items-center justify-center overflow-hidden">
                        {photo2 ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photo2} alt="photo2" className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-xs text-gray-500">未撮影</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <label className="px-3 py-1.5 text-xs rounded border bg-white hover:bg-gray-50 cursor-pointer">
                          ファイル選択・撮影（任意）
                          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPickFile(e, 'photo2')} />
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end mt-3">
                    <button onClick={savePhotos} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded">写真を保存</button>
                  </div>
                </div>

                {/* カメラモーダルは廃止（モバイルは capture 属性で対応） */}

                <div className="p-3 border rounded">
                  <div className="font-semibold mb-2">入庫前の状態割当（品目ごと）</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">カテゴリ</th>
                        <th className="text-left p-2">商品名</th>
                        <th className="text-center p-2">数量</th>
                        <th className="text-left p-2">状態割当</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(active.items || []).map((it, idx) => {
                        const sumAssigned = Object.values(it.damageBreakdown || {}).reduce((a: number, b: number) => a + (b || 0), 0);
                        const remainder = Math.max(0, (it.count || 0) - sumAssigned);
                        return (
                          <tr key={`inbound-${idx}`} className="border-b align-top">
                            <td className="p-2">{it.category || '—'}</td>
                            <td className="p-2">{it.item || '—'}</td>
                            <td className="p-2 text-center">{it.count}</td>
                            <td className="p-2">
                              <div className="flex items-center gap-2 mb-2">
                                <button
                                  className="px-2 py-1 text-xs border rounded bg-white hover:bg-gray-50"
                                  onClick={() => setOpenEditors((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                                >
                                  状態を割当
                                </button>
                                <span className="text-xs text-gray-600 hidden md:inline">割当合計: {sumAssigned} / {it.count}（未割当 {remainder}）</span>
                              </div>
                              {openEditors[idx] && (
                                <div className="border rounded p-2 bg-gray-50">
                                  <div className="grid md:grid-cols-2 gap-2">
                                    {damageTerms.map((t) => {
                                      const curVal = (it.damageBreakdown || {})[t.id] || 0;
                                      const canInc = sumAssigned < (it.count || 0);
                                      const canDec = curVal > 0;
                                      return (
                                        <div key={t.id} className="flex items-center justify-between gap-2 bg-white border rounded px-2 py-1">
                                          <span className="text-xs">{t.label}</span>
                                          <div className="flex items-center gap-1">
                                            <button
                                              className={`px-2 py-0.5 text-xs rounded ${canDec ? 'bg-gray-200 hover:bg-gray-300' : 'bg-gray-100 text-gray-400'}`}
                                              disabled={!canDec}
                                              onClick={() => {
                                                const rowsCopy = [...rows];
                                                const rIndex = rowsCopy.findIndex(r => r.id === active.id);
                                                if (rIndex >= 0) {
                                                  const items = [...(rowsCopy[rIndex].items || [])];
                                                  const cur = { ...(items[idx] || {}) } as ItemEntry;
                                                  const map = { ...(cur.damageBreakdown || {}) } as Record<string, number>;
                                                  const v = (map[t.id] || 0) - 1;
                                                  map[t.id] = Math.max(0, v);
                                                  cur.damageBreakdown = map;
                                                  items[idx] = cur;
                                                  rowsCopy[rIndex] = { ...rowsCopy[rIndex], items };
                                                  setRows(rowsCopy);
                                                }
                                              }}
                                            >
                                              −
                                            </button>
                                            <span className="text-xs w-6 text-center">{curVal}</span>
                                            <button
                                              className={`px-2 py-0.5 text-xs rounded ${canInc ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-400'}`}
                                              disabled={!canInc}
                                              onClick={() => {
                                                const rowsCopy = [...rows];
                                                const rIndex = rowsCopy.findIndex(r => r.id === active.id);
                                                if (rIndex >= 0) {
                                                  const items = [...(rowsCopy[rIndex].items || [])];
                                                  const cur = { ...(items[idx] || {}) } as ItemEntry;
                                                  const map = { ...(cur.damageBreakdown || {}) } as Record<string, number>;
                                                  map[t.id] = (map[t.id] || 0) + 1;
                                                  const total = Object.values(map).reduce((a: number, b: number) => a + (b || 0), 0);
                                                  if (total > (cur.count || 0)) {
                                                    map[t.id] = (map[t.id] || 1) - 1;
                                                  }
                                                  cur.damageBreakdown = map;
                                                  items[idx] = cur;
                                                  rowsCopy[rIndex] = { ...rowsCopy[rIndex], items };
                                                  setRows(rowsCopy);
                                                }
                                              }}
                                            >
                                              ＋
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              <div className="mt-2 text-xs text-gray-600">
                                {Object.entries(it.damageBreakdown || {}).filter(([, v]) => (v || 0) > 0).length === 0
                                  ? <span>割当なし</span>
                                  : (
                                    <span>
                                      {Object.entries(it.damageBreakdown || {})
                                        .filter(([, v]) => (v || 0) > 0)
                                        .map(([k, v]) => {
                                          const label = damageTerms.find((t) => t.id === k)?.label || k;
                                          return `${label}:${v}`;
                                        })
                                        .join(' / ')}
                                    </span>
                                  )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={saveItems}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                  >
                    保存
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
