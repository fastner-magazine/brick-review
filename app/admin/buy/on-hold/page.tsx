'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getFirestoreClient } from '@/lib/firestoreClient';
import { collection, getDocs, query, where, orderBy, updateDoc, doc } from 'firebase/firestore';
import { useAdminAuthContext } from '@/contexts/AdminAuthContext';

type ItemEntry = {
  category: string;
  item: string;
  subcategory?: string;
  count: number;
};

type BuyRequest = {
  id: string;
  receptionNumber?: string;
  inboundSerial?: number;
  name: string;
  address: string;
  birthdate: string;
  lineName: string;
  preferredDateTime?: string;
  items: ItemEntry[];
  createdAt?: string;
  updatedAt?: string;
  inspectionNotes?: string;
  status?: string;
  onHoldStatus?: 'on_hold' | 'waiting_contact';
};

export default function OnHoldListPage() {
  const { loading: authLoading, isAdmin } = useAdminAuthContext();
  const [rows, setRows] = useState<BuyRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
  // (formatJst removed — not used in this file)

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const db = getFirestoreClient();
      if (!db) throw new Error('Firestore not initialized');
      const baseRef = collection(db, 'buy_requests');
      const q = query(baseRef, where('status', 'in', ['on_hold', 'waiting_contact']), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list: BuyRequest[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // 重要: 認証完了後にのみデータ取得を実行
  useEffect(() => {
    if (!authLoading && isAdmin) {
      console.log('[OnHoldListPage] Auth completed, loading data');
      load();
    } else {
      console.log('[OnHoldListPage] Waiting for auth:', { authLoading, isAdmin });
    }
  }, [authLoading, isAdmin]);

  const markContacted = async (r: BuyRequest) => {
    try {
      const db = getFirestoreClient();
      if (!db) throw new Error('Firestore not initialized');
      await updateDoc(doc(db, 'buy_requests', r.id), {
        status: 'waiting_contact',
        inspectionNotes: (r.inspectionNotes || '') + '\n[連絡済み] 店舗より連絡完了',
        updatedAt: nowJstIso(),
      } as any);
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: 'waiting_contact' } : x)));
      setMessage('連絡済みに更新しました');
      setTimeout(() => setMessage(null), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const markReturned = async (r: BuyRequest) => {
    try {
      const db = getFirestoreClient();
      if (!db) throw new Error('Firestore not initialized');
      await updateDoc(doc(db, 'buy_requests', r.id), {
        status: 'returned',
        inspectionStatus: 'returned',
        inspectionNotes: (r.inspectionNotes || '') + '\n[処理] 返送対応',
        updatedAt: nowJstIso(),
      } as any);
      // リストから除外（on_hold のみ表示対象）
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      setMessage('返送として処理しました');
      setTimeout(() => setMessage(null), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const markFixedAndComplete = async (r: BuyRequest) => {
    try {
      const db = getFirestoreClient();
      if (!db) throw new Error('Firestore not initialized');
      await updateDoc(doc(db, 'buy_requests', r.id), {
        status: 'completed',
        inspectionStatus: 'completed',
        inspectionNotes: (r.inspectionNotes || '') + '\n[処理] 修正同意済み',
        updatedAt: nowJstIso(),
      } as any);
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      setMessage('修正同意済みとして完了しました');
      setTimeout(() => setMessage(null), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-800">保留中の申込一覧</h1>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-blue-600 underline">ホーム</Link>
            <Link href="/buy/check" className="text-blue-600 underline">検品ページ</Link>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {loading && <span className="text-sm text-gray-500">読み込み中…</span>}
          {error && <span className="text-sm text-rose-600">{error}</span>}
          {message && <span className="text-sm text-emerald-700">{message}</span>}
        </div>

        <section className="bg-white border rounded">
          <div className="px-3 py-2 border-b text-sm font-semibold bg-slate-50">保留中 / 連絡待ち</div>
          <div className="p-3 grid grid-cols-1 gap-6">
            {/* 保留中 */}
            <div>
              <div className="text-sm font-semibold mb-2">保留中</div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">受付番号</th>
                      <th className="text-left p-2">申込者</th>
                      <th className="text-left p-2">連絡先</th>
                      <th className="text-left p-2">理由</th>
                      <th className="text-left p-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.filter((r) => (r.onHoldStatus || 'on_hold') === 'on_hold').length === 0 && (
                      <tr><td colSpan={5} className="p-3 text-gray-500">保留中の申込はありません</td></tr>
                    )}
                    {rows.filter((r) => (r.onHoldStatus || 'on_hold') === 'on_hold').map((r) => (
                      <tr key={r.id} className="border-b align-top">
                        <td className="p-2">{r.receptionNumber || r.id.slice(0, 12)}</td>
                        <td className="p-2">{r.name}</td>
                        <td className="p-2">{r.lineName}</td>
                        <td className="p-2 whitespace-pre-wrap">{r.inspectionNotes || '—'}</td>
                        <td className="p-2">
                          <button onClick={() => markContacted(r)} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded">連絡済みにする</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 連絡待ち */}
            <div>
              <div className="text-sm font-semibold mb-2">連絡待ち</div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">受付番号</th>
                      <th className="text-left p-2">申込者</th>
                      <th className="text-left p-2">連絡先</th>
                      <th className="text-left p-2">理由</th>
                      <th className="text-left p-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.filter((r) => r.onHoldStatus === 'waiting_contact').length === 0 && (
                      <tr><td colSpan={5} className="p-3 text-gray-500">連絡待ちの申込はありません</td></tr>
                    )}
                    {rows.filter((r) => r.onHoldStatus === 'waiting_contact').map((r) => (
                      <tr key={r.id} className="border-b align-top">
                        <td className="p-2">{r.receptionNumber || r.id.slice(0, 12)}</td>
                        <td className="p-2">{r.name}</td>
                        <td className="p-2">{r.lineName}</td>
                        <td className="p-2 whitespace-pre-wrap">{r.inspectionNotes || '—'}</td>
                        <td className="p-2 flex gap-2">
                          <button onClick={() => markReturned(r)} className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded">返送</button>
                          <button onClick={() => markFixedAndComplete(r)} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded">修正同意済み</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
