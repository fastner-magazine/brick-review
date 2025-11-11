'use client';

import { useEffect, useMemo, useState } from 'react';
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

type InventoryDraftEntry = {
  productName: string;
  category?: string;
  quantity: number;
  types?: string;
  notes?: string;
  source?: string;
};

type Submission = {
  id: string;
  receptionNumber?: string;
  inboundSerial?: number;
  name: string;
  address: string;
  birthdate: string;
  lineName: string;
  bankName: string;
  bankCode: string;
  branchName: string;
  branchCode: string;
  accountNumber: string;
  accountNameKana?: string;
  items?: ItemEntry[];
  inventoryDraft?: InventoryDraftEntry[];
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

type PayoutDraft = {
  amount: string;
  operator: string;
  transferAt: string; // YYYY-MM-DDTHH:mm
  note: string;
};

export default function BuyPayoutPage() {
  const { loading: authLoading, isAdmin } = useAdminAuthContext();
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PayoutDraft>({ amount: '', operator: '', transferAt: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const active = useMemo(() => rows.find((r) => r.id === activeId) ?? null, [rows, activeId]);

  // JST helpers
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

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const db = getFirestoreClient();
      if (!db) throw new Error('Firestore not initialized');
      // 検品完了（振込待ち対象）を buy_requests から取得
      const baseRef = collection(db, 'buy_requests');
      const q = query(baseRef, where('status', '==', 'completed'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list: Submission[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setRows(list);
      if (!activeId && list.length > 0) setActiveId(list[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 認証完了後にのみデータ取得
    if (!authLoading && isAdmin) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAdmin]);

  const canSubmit = useMemo(() => {
    if (!active) return false;
    const okAmount = draft.amount.trim() !== '' && Number(draft.amount) >= 0;
    const okOp = draft.operator.trim() !== '';
    const okDate = draft.transferAt.trim() !== '';
    return okAmount && okOp && okDate;
  }, [active, draft]);

  const completePayout = async () => {
    if (!active) return;
    setSaving(true);
    setMessage('振込情報を保存しています…');
    try {
      const db = getFirestoreClient();
      if (!db) throw new Error('Firestore not initialized');
      const payload = {
        status: 'paid',
        updatedAt: nowJstIso(),
        payout: {
          amount: Number(draft.amount),
          operator: draft.operator.trim(),
          transferAt: draft.transferAt,
          note: draft.note.trim(),
          paidAt: nowJstIso(),
        },
      } as const;
      await updateDoc(doc(db, 'buy_requests', active.id), payload as any);
      setMessage('振込完了として記録しました。');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMessage('');
    } finally {
      setSaving(false);
    }
  };

  const transferDisplay = (s: Submission) => {
    const rn = s.receptionNumber || s.id.slice(0, 8);
    // 受付番号 LINE名 氏名 の順で連結
    return `${rn} ${s.lineName || ''} ${s.name || ''}`.trim();
  };

  const copyTransfer = async (s: Submission) => {
    const text = transferDisplay(s);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // フォールバック
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setMessage('振込名義をコピーしました');
      setTimeout(() => { setMessage(''); }, 1500);
    } catch {
      setError('クリップボードにコピーできませんでした');
      setTimeout(() => setError(null), 1500);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-800">買取 振込処理</h1>
          <div className="flex items-center gap-4">
            <Link href="/buy/check" className="text-blue-600 underline">検品へ</Link>
            <Link href="/buy" className="text-blue-600 underline">ホームへ</Link>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {loading && <span className="text-gray-500">読み込み中…</span>}
          {error && <span className="text-rose-600">{error}</span>}
          {message && <span className="text-emerald-700">{message}</span>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <aside className="md:col-span-1 border rounded bg-white">
            <div className="px-3 py-2 border-b text-sm font-semibold bg-slate-50">検品完了（振込待ち）</div>
            <div className="max-h-[60vh] overflow-auto divide-y">
              {rows.length === 0 && (
                <div className="p-3 text-sm text-gray-500">対象の申込がありません</div>
              )}
              {rows.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setActiveId(r.id)}
                  className={`w-full text-left p-3 text-sm ${activeId === r.id ? 'bg-blue-50' : ''}`}
                >
                  <div className="font-medium text-gray-900">{r.name || '—'}</div>
                  {r.lineName && <div className="text-xs text-gray-700">LINE: {r.lineName}</div>}
                  <div className="text-gray-600 text-xs">{formatJst(r.createdAt)}</div>
                </button>
              ))}
            </div>
          </aside>

          <section className="md:col-span-2 border rounded bg-white">
            {!active ? (
              <div className="p-6 text-sm text-gray-500">左の一覧から申込を選択してください。</div>
            ) : (
              <div className="p-4 flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold">申込 #{active.receptionNumber || active.id.slice(0, 12)}</h2>
                  <div className="text-sm text-gray-700">氏名: {active.name}</div>
                  {active.lineName && <div className="text-sm text-gray-500">LINE名: {active.lineName}</div>}
                  {typeof active.inboundSerial === 'number' && (
                    <div className="text-sm text-gray-500">入庫連番: {active.inboundSerial}</div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <div className="text-xs text-gray-600">振込名義: {transferDisplay(active)}</div>
                    <button onClick={() => copyTransfer(active)} className="px-2 py-1 text-xs rounded border bg-white hover:bg-gray-50">コピー</button>
                  </div>
                  <span className="text-xs text-gray-500">status: {active.status}</span>
                </div>

                <div className="grid md:grid-cols-2 gap-3 text-sm">
                  <div className="p-3 border rounded">
                    <div className="font-semibold mb-2">振込先</div>
                    <div>銀行: {active.bankName} ({active.bankCode || '—'})</div>
                    <div>支店: {active.branchName} ({active.branchCode || '—'})</div>
                    <div>口座番号: {active.accountNumber}</div>
                    {active.accountNameKana && <div>名義カナ: {active.accountNameKana}</div>}
                  </div>
                  <div className="p-3 border rounded">
                    <div className="font-semibold mb-2">入荷予定（検品結果）</div>
                    {active.inventoryDraft && active.inventoryDraft.length > 0 ? (
                      <ul className="list-disc pl-5 space-y-1">
                        {active.inventoryDraft.map((i, idx) => (
                          <li key={idx} className="text-sm">
                            {i.productName} / {i.category || '—'} × {i.quantity} {i.types ? `(${i.types})` : ''}
                            {i.notes ? ` — ${i.notes}` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-gray-500 text-sm">検品データがありません</div>
                    )}
                  </div>
                </div>

                <div className="p-3 border rounded">
                  <div className="font-semibold mb-3">振込入力</div>
                  <div className="grid md:grid-cols-2 gap-3 text-sm">
                    <label className="flex items-center gap-2">
                      金額(円)
                      <input
                        type="number"
                        className="border rounded px-2 py-1 w-full"
                        min={0}
                        value={draft.amount}
                        onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      振込日時
                      <input
                        type="datetime-local"
                        className="border rounded px-2 py-1 w-full"
                        value={draft.transferAt}
                        onChange={(e) => setDraft({ ...draft, transferAt: e.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      担当者
                      <input
                        type="text"
                        className="border rounded px-2 py-1 w-full"
                        value={draft.operator}
                        onChange={(e) => setDraft({ ...draft, operator: e.target.value })}
                        placeholder="担当者名"
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      メモ
                      <input
                        type="text"
                        className="border rounded px-2 py-1 w-full"
                        value={draft.note}
                        onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                        placeholder="備考"
                      />
                    </label>
                  </div>
                  <div className="flex justify-end mt-3">
                    <button
                      onClick={completePayout}
                      disabled={!canSubmit || saving}
                      className={`px-4 py-2 rounded text-white ${canSubmit ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-400'}`}
                    >
                      振込完了として記録
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
