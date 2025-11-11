'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getFirestoreClient } from '@/lib/firestoreClient';
import { initAppCheck } from '@/lib/appCheck';
import { useAdminAuthContext } from '@/contexts/AdminAuthContext';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  doc,
} from 'firebase/firestore';

type ItemEntry = {
  category: string;
  item: string;
  subcategory?: string;
  count: number;
  buyPrice?: number | null;
  // ダメージ用語ごとの個数割当（例: { dent: 1, scratch: 2 }）
  damageBreakdown?: Record<string, number>;
};

type VerificationSessionData = {
  sessionId: string;
  videoUrls: string[];
  stepMarkers: {
    step: string;
    challengeCode: string;
    timestamp: string;
    timestampMs: number;
    snapshot?: string;
  }[];
  deviceInfo: {
    userAgent: string;
    platform: string;
    screenResolution: string;
    language: string;
    timezone: string;
  };
};

type BuyRequest = {
  id: string;
  receptionNumber?: string;
  inboundSerial?: number;
  name: string;
  address: string;
  birthdate: string;
  lineName: string;
  idFrontName?: string;
  idBackName?: string;
  idFrontUrl?: string;
  idBackUrl?: string;
  verificationSession?: VerificationSessionData;
  bankName: string;
  bankCode: string;
  branchName: string;
  branchCode: string;
  accountNumber: string;
  accountNameKana?: string;
  preferredDateTime: string;
  items: ItemEntry[];
  consent: boolean;
  status?: string;
  inspectionStatus?: 'not_started' | 'sender_confirmed' | 'video_recorded' | 'content_confirmed' | 'completed' | 'on_hold';
  inspectionResult?: 'completed' | 'on_hold';
  inspectionNotes?: string;
  videoRecordedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  onHoldStatus?: 'on_hold' | 'waiting_contact';
};

type InspectionStep = 'sender_info' | 'video_recording' | 'consent_check' | 'content_check' | 'final_decision';

type CheckClientProps = {
  initialFilter?: 'pending' | 'completed' | 'on_hold';
};

export default function CheckClient({ initialFilter = 'pending' }: CheckClientProps) {
  const { loading: authLoading, isAdmin, error: authError } = useAdminAuthContext();
  const [requests, setRequests] = useState<BuyRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<InspectionStep>('sender_info');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'completed' | 'on_hold'>(initialFilter);
  const [damageTerms, setDamageTerms] = useState<{ id: string; label: string; order?: number }[]>([]);
  const [openEditors, setOpenEditors] = useState<Record<number, boolean>>({});
  const [docsConfirmed, setDocsConfirmed] = useState(false);
  const [docsMissingNotes, setDocsMissingNotes] = useState('');
  const [holdMode, setHoldMode] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [releaseReason, setReleaseReason] = useState('');
  const [reclassifying, setReclassifying] = useState(false);

  // JST (+09:00) helpers
  const nowJstIso = () => {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    // create date in UTC then add 9h
    const t = Date.UTC(y, m, day, d.getUTCHours() + 9, d.getUTCMinutes(), d.getUTCSeconds());
    const jd = new Date(t);
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = `${jd.getUTCFullYear()}-${pad(jd.getUTCMonth() + 1)}-${pad(jd.getUTCDate())}T${pad(jd.getUTCHours())}:${pad(jd.getUTCMinutes())}:${pad(jd.getUTCSeconds())}+09:00`;
    return iso;
  };
  const formatJst = (s?: string) => {
    try {
      if (!s) return '';
      return new Date(s).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    } catch { return s || ''; }
  };

  const active = useMemo(() => requests.find((r) => r.id === activeId) ?? null, [requests, activeId]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const db = getFirestoreClient();
      if (!db) throw new Error('Firestore not initialized');
      const baseRef = collection(db, 'buy_requests');
      // フィルタに応じたクエリ（status フィールドを参照）
      let q;
      if (filter === 'pending') {
        q = query(baseRef, where('status', '==', 'pending'), orderBy('createdAt', 'desc'));
      } else if (filter === 'completed') {
        q = query(baseRef, where('status', '==', 'completed'), orderBy('createdAt', 'desc'));
      } else {
        // 保留中ビューでは、保留中 + 連絡待ちの両方を取得
        q = query(baseRef, where('status', 'in', ['on_hold', 'waiting_contact']), orderBy('createdAt', 'desc'));
      }
      const snap = await getDocs(q);
      const rows: BuyRequest[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setRequests(rows);
      if (!activeId && rows.length > 0) {
        setActiveId(rows[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // App Check初期化
  useEffect(() => {
    initAppCheck();
  }, []);

  useEffect(() => {
    // フィルター変更時は検品ステートを初期化
    setCurrentStep('sender_info');
    setInspectionNotes('');
    setOpenEditors({});
    setDocsConfirmed(false);
    setDocsMissingNotes('');
    setIsRecording(false);
    
    // 認証完了後にのみデータ取得
    if (!authLoading && isAdmin) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, authLoading, isAdmin]);

  // タクソノミー（damages/terms）の読み込み
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

  useEffect(() => {
    if (activeId) {
      setCurrentStep('sender_info');
      setInspectionNotes('');
      setOpenEditors({});
      setDocsConfirmed(false);
      setDocsMissingNotes('');
      setIsRecording(false);
    }
  }, [activeId]);

  const handleNextStep = () => {
    if (currentStep === 'sender_info') setCurrentStep('video_recording');
    else if (currentStep === 'video_recording') setCurrentStep('consent_check');
    else if (currentStep === 'consent_check') setCurrentStep('content_check');
    else if (currentStep === 'content_check') setCurrentStep('final_decision');
  };

  const handleFinalDecision = async (decision: 'completed' | 'on_hold') => {
    if (!active) return;
    setSaving(true);
    setMessage(decision === 'completed' ? '完了として保存しています…' : '保留として保存しています…');
    try {
      const db = getFirestoreClient();
      if (!db) throw new Error('Firestore not initialized');

      const payload = {
        status: decision === 'completed' ? 'completed' : 'on_hold',
        inspectionStatus: decision === 'completed' ? 'completed' : 'on_hold',
        inspectionNotes,
        inspectedAt: nowJstIso(),
        updatedAt: nowJstIso(),
        // items の damageBreakdown を含め保存
        items: active.items || [],
      };

      await updateDoc(doc(db, 'buy_requests', active.id), payload as any);
      setMessage(decision === 'completed' ? '検品完了しました。' : '保留として記録しました。連絡をお願いします。');
      // 楽観的に一覧から除外（未検品ビューから消す）
      setRequests((prev) => prev.filter((r) => r.id !== active.id));
      setActiveId(null);
      setCurrentStep('sender_info');
      setInspectionNotes('');
      setOpenEditors({});
      setDocsConfirmed(false);
      setDocsMissingNotes('');
      setIsRecording(false);
      // リスト再読み込み（検品済みは一覧から消える）
      setTimeout(() => {
        load();
        setMessage('');
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMessage('');
    } finally {
      setSaving(false);
    }
  };

  const holdDueToDocuments = async () => {
    if (!active) return;
    setSaving(true);
    setMessage('書類不足で保留を記録しています…');
    try {
      const db = getFirestoreClient();
      if (!db) throw new Error('Firestore not initialized');
      const extra = docsMissingNotes?.trim() ? `\n[書類不足] ${docsMissingNotes.trim()}` : '\n[書類不足] 理由未記載';
      const payload = {
        status: 'on_hold' as const,
        inspectionStatus: 'on_hold' as const,
        inspectionNotes: (inspectionNotes || '') + extra,
        updatedAt: nowJstIso(),
      };
      await updateDoc(doc(db, 'buy_requests', active.id), payload as any);
      setMessage('書類不足により保留を記録しました');
      // 楽観的に未検品一覧から除外
      setRequests((prev) => prev.filter((r) => r.id !== active.id));
      setActiveId(null);
      setCurrentStep('sender_info');
      setInspectionNotes('');
      setOpenEditors({});
      setDocsConfirmed(false);
      setDocsMissingNotes('');
      setIsRecording(false);
      // バックグラウンドで再読込
      load();
    } catch {
      setMessage('保留の記録に失敗しました');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 1500);
    }
  };

  const holdWithReason = async () => {
    if (!active) return;
    setSaving(true);
    setMessage('保留を記録しています…');
    try {
      const db = getFirestoreClient();
      if (!db) throw new Error('Firestore not initialized');
      const extra = holdReason?.trim() ? `\n[保留理由] ${holdReason.trim()}` : '\n[保留理由] 理由未記載';
      const payload = {
        status: 'on_hold' as const,
        inspectionStatus: 'on_hold' as const,
        inspectionNotes: (inspectionNotes || '') + extra,
        updatedAt: nowJstIso(),
      };
      await updateDoc(doc(db, 'buy_requests', active.id), payload as any);
      setMessage('保留を記録しました');
      // 楽観的更新で未検品から除外
      setRequests((prev) => prev.filter((r) => r.id !== active.id));
      setActiveId(null);
      setCurrentStep('sender_info');
      setInspectionNotes('');
      setOpenEditors({});
      setDocsConfirmed(false);
      setDocsMissingNotes('');
      setIsRecording(false);
      setHoldMode(false);
      setHoldReason('');
      load();
    } catch {
      setMessage('保留の記録に失敗しました');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 1500);
    }
  };

  const reclassifyFromCompleted = async (next: 'on_hold' | 'returned') => {
    if (!active) return;
    setReclassifying(true);
    setMessage('完了を解除して更新しています…');
    try {
      const db = getFirestoreClient();
      if (!db) throw new Error('Firestore not initialized');
      const extra = releaseReason?.trim()
        ? `\n[再分類理由] ${releaseReason.trim()}`
        : '\n[再分類理由] 理由未記載';
      await updateDoc(doc(db, 'buy_requests', active.id), {
        status: next,
        inspectionNotes: (inspectionNotes || '') + extra + `\n[再分類] completed → ${next}`,
        updatedAt: nowJstIso(),
      } as any);

      // 表示上の即時反映
      if (filter === 'completed') {
        setRequests((prev) => prev.filter((r) => r.id !== active.id));
        setActiveId(null);
      } else if (filter === 'on_hold') {
        // on_hold ビューの場合は、保留にした時のみ残し、返送は除外
        if (next === 'returned') {
          setRequests((prev) => prev.filter((r) => r.id !== active.id));
          setActiveId(null);
        } else {
          setRequests((prev) => prev.map((r) => (r.id === active.id ? { ...r, status: 'on_hold' } : r)));
        }
      }
      setReleaseReason('');
      setMessage('更新しました');
      setTimeout(() => setMessage(''), 1500);
      load();
    } catch {
      setMessage('更新に失敗しました');
      setTimeout(() => setMessage(''), 1500);
    } finally {
      setReclassifying(false);
    }
  };

  // 認証チェック：ローディング中
  if (authLoading) {
    return (
      <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium text-gray-700">認証確認中...</div>
        </div>
      </main>
    );
  }

  // 認証チェック：未認証または匿名ユーザー
  if (!isAdmin || authError) {
    return (
      <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="max-w-md w-full bg-white border rounded-lg p-8 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">アクセス制限</h1>
          <p className="text-gray-600 mb-6">
            {authError || '管理者権限が必要です'}
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href="/login"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              ログインページへ
            </Link>
            <Link
              href="/"
              className="text-gray-600 hover:text-gray-800 underline"
            >
              トップページへ
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-800">買取 検品</h1>
          <Link href="/buy" className="text-blue-600 underline">ホームへ</Link>
        </div>

        <div className="flex items-center gap-3 justify-between flex-wrap">
          {loading && <span className="text-sm text-gray-500">読み込み中…</span>}
          {error && <span className="text-sm text-rose-600">{error}</span>}
          {message && <span className="text-sm text-emerald-700">{message}</span>}
          <div className="flex items-center gap-2 text-sm ml-auto">
            <label className="font-medium">表示:</label>
            <select
              className="border rounded px-2 py-1"
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
            >
              <option value="pending">未検品</option>
              <option value="on_hold">保留中</option>
              <option value="completed">完了</option>
            </select>
          </div>
        </div>

        {filter !== 'on_hold' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <aside className={`md:col-span-1 border rounded bg-white ${active ? 'hidden md:block' : ''}`}>
              <div className="px-3 py-2 border-b text-sm font-semibold bg-slate-50">{filter === 'pending' ? '未検品の申込一覧' : filter === 'completed' ? '完了の申込一覧' : '申込一覧'}</div>
              <div className="max-h-[60vh] overflow-auto divide-y">
                {requests.length === 0 && (
                  <div className="p-3 text-sm text-gray-500">表示対象の申込はありません</div>
                )}
                {requests.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setActiveId(r.id);
                      setCurrentStep('sender_info');
                      setInspectionNotes('');
                      setOpenEditors({});
                      setDocsConfirmed(false);
                      setDocsMissingNotes('');
                      setIsRecording(false);
                    }}
                    className={`w-full text-left p-3 text-sm ${activeId === r.id ? 'bg-blue-50' : ''}`}
                  >
                    <div className="font-medium text-gray-900">{r.name || '—'}</div>
                    {r.lineName && (
                      <div className="text-xs text-gray-700">LINE: {r.lineName}</div>
                    )}
                    <div className="text-xs text-gray-500">受付番号: {r.receptionNumber || r.id.slice(0, 8)}</div>
                    <div className="text-gray-600 text-xs">{formatJst(r.createdAt)}</div>
                  </button>
                ))}
              </div>
            </aside>

            <section className={`md:col-span-2 border rounded bg-white ${active ? '' : 'hidden md:block'}`}>
              {active ? (
                <div className="p-4 flex flex-col gap-4">
                  {/* Mobile back to list */}
                  <div className="md:hidden flex items-center justify-between">
                    <button
                      onClick={() => {
                        setActiveId(null);
                        setCurrentStep('sender_info');
                        setInspectionNotes('');
                        setOpenEditors({});
                        setDocsConfirmed(false);
                        setDocsMissingNotes('');
                        setIsRecording(false);
                      }}
                      className="px-3 py-1.5 text-sm rounded border bg-white"
                    >
                      ← 一覧へ戻る
                    </button>
                  </div>
                  {/* ステップインジケーター（完了ビューでは非表示） */}
                  {filter !== 'completed' && (
                    <div style={{
                      marginBottom: '16px',
                      padding: '12px',
                      background: '#f8f9fa',
                      borderRadius: '8px'
                    }}>
                      {(() => {
                        const steps = [
                          { key: 'sender_info', label: '送り主情報確認' },
                          { key: 'video_recording', label: '動画撮影' },
                          { key: 'consent_check', label: '同意書確認' },
                          { key: 'content_check', label: '内容確認' },
                          { key: 'final_decision', label: '完了/保留' },
                        ] as const;
                        const idx = steps.findIndex(s => s.key === currentStep);
                        const prev = idx > 0 ? { num: idx, label: steps[idx - 1].label } : null;
                        const curr = { num: idx + 1, label: steps[idx]?.label || '' };
                        const next = idx < steps.length - 1 ? { num: idx + 2, label: steps[idx + 1].label } : null;
                        const pct = ((idx + 1) / steps.length) * 100;
                        return (
                          <>
                            <div style={{ textAlign: 'center', fontSize: '0.9rem', color: '#666', marginBottom: 8, fontWeight: 500 }}>
                              {curr.num} / {steps.length}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', gap: 8, alignItems: 'stretch', minHeight: 60 }}>
                              <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#999', padding: '8px 4px' }}>
                                {prev && (
                                  <>
                                    <div style={{ fontSize: '0.7rem', marginBottom: 2 }}>前</div>
                                    <div style={{ fontWeight: 600, color: '#28a745' }}>{prev.num}</div>
                                    <div style={{ fontSize: '0.7rem', marginTop: 2, lineHeight: 1.2 }}>{prev.label}</div>
                                  </>
                                )}
                              </div>
                              <div style={{ textAlign: 'center', background: '#007bff', color: '#fff', borderRadius: 8, padding: '12px 8px', boxShadow: '0 2px 8px rgba(0,123,255,0.3)' }}>
                                <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 4 }}>{curr.num}</div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.3 }}>{curr.label}</div>
                              </div>
                              <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#999', padding: '8px 4px' }}>
                                {next && (
                                  <>
                                    <div style={{ fontSize: '0.7rem', marginBottom: 2 }}>次</div>
                                    <div style={{ fontWeight: 600, color: '#666' }}>{next.num}</div>
                                    <div style={{ fontSize: '0.7rem', marginTop: 2, lineHeight: 1.2 }}>{next.label}</div>
                                  </>
                                )}
                              </div>
                            </div>
                            <div style={{ marginTop: 8, height: 4, background: '#e0e0e0', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(to right, #28a745, #007bff)', transition: 'width 0.3s ease' }} />
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* Step 1: 送り主情報確認 */}
                  {filter === 'completed' ? (
                    <div className="flex flex-col gap-4">
                      <h2 className="text-lg font-semibold">完了詳細</h2>
                      <div className="grid md:grid-cols-2 gap-3 text-sm">
                        <div className="p-3 border rounded">
                          <div className="font-semibold mb-2">申込情報</div>
                          <div>受付番号: {active.receptionNumber || active.id.slice(0, 12)}</div>
                          <div>氏名: {active.name}</div>
                          {active.lineName && (<div>LINE名: {active.lineName}</div>)}
                          <div>作成: {formatJst(active.createdAt)}</div>
                          <div>更新: {formatJst(active.updatedAt)}</div>
                        </div>
                        <div className="p-3 border rounded">
                          <div className="font-semibold mb-2">買取希望品</div>
                          <ul className="list-disc pl-5">
                            {(active.items || []).map((it, i) => (
                              <li key={i} className="text-sm">{it.item} × {it.count}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : currentStep === 'sender_info' && (
                    <div className="flex flex-col gap-4">
                      <h2 className="text-lg font-semibold">送り主情報の確認</h2>
                      <p className="text-sm text-gray-600">受付番号: {active.receptionNumber || active.id.slice(0, 12)}</p>
                      <div className="grid md:grid-cols-2 gap-3 text-sm">
                        <div className="p-3 border rounded">
                          <div className="font-semibold mb-2">本人情報</div>
                          <div>氏名: {active.name}</div>
                          <div>住所: {active.address}</div>
                          <div>生年月日: {active.birthdate}</div>
                          <div>LINE名: {active.lineName}</div>
                        </div>
                        {/* 身分証画像 */}
                        <div className="p-3 border rounded">
                          <div className="font-semibold mb-2">身分証明書</div>
                          <div className="grid grid-cols-2 gap-2">
                            {active.idFrontUrl && (
                              <div>
                                <div className="text-xs text-gray-600 mb-1">表面</div>
                                <a href={active.idFrontUrl} target="_blank" rel="noopener noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={active.idFrontUrl}
                                    alt="身分証表面"
                                    className="w-full h-auto border rounded cursor-pointer hover:opacity-80"
                                  />
                                </a>
                              </div>
                            )}
                            {active.idBackUrl && (
                              <div>
                                <div className="text-xs text-gray-600 mb-1">裏面</div>
                                <a href={active.idBackUrl} target="_blank" rel="noopener noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={active.idBackUrl}
                                    alt="身分証裏面"
                                    className="w-full h-auto border rounded cursor-pointer hover:opacity-80"
                                  />
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 身分証動画 */}
                      {active.verificationSession && active.verificationSession.videoUrls && active.verificationSession.videoUrls.length > 0 && (
                        <div className="p-3 border rounded">
                          <div className="font-semibold mb-2">身分証動画</div>
                          <div className="text-xs text-gray-600 mb-2">
                            セッションID: {active.verificationSession.sessionId}
                          </div>
                          <div className="grid md:grid-cols-2 gap-3">
                            {active.verificationSession.videoUrls.map((url, idx) => (
                              <div key={idx}>
                                <div className="text-xs text-gray-600 mb-1">
                                  動画 {idx + 1} {idx === 0 ? '(外カメラ)' : '(インカメラ)'}
                                </div>
                                <video
                                  src={url}
                                  controls
                                  className="w-full border rounded"
                                  preload="metadata"
                                />
                              </div>
                            ))}
                          </div>
                          {/* ステップマーカー情報 */}
                          {active.verificationSession.stepMarkers && active.verificationSession.stepMarkers.length > 0 && (
                            <div className="mt-3">
                              <div className="text-xs font-semibold mb-1">撮影ステップ</div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {active.verificationSession.stepMarkers.map((marker, idx) => (
                                  <div key={idx} className="text-xs border rounded p-2">
                                    <div className="font-medium">
                                      {marker.step === 'front' ? '表面' :
                                       marker.step === 'back' ? '裏面' :
                                       marker.step === 'thickness' ? '厚み' : 'セルフィー'}
                                    </div>
                                    <div className="text-gray-600">
                                      {(marker.timestampMs / 1000).toFixed(1)}秒時点
                                    </div>
                                    {marker.snapshot && (
                                      <a href={marker.snapshot} target="_blank" rel="noopener noreferrer">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={marker.snapshot}
                                          alt={`${marker.step}スナップ`}
                                          className="w-full mt-1 border rounded cursor-pointer hover:opacity-80"
                                        />
                                      </a>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* PDF同意書 */}
                      {active.receptionNumber && (
                        <div className="p-3 border rounded">
                          <div className="font-semibold mb-2">買取同意書PDF</div>
                          <div className="text-xs text-gray-600 mb-2">
                            受付番号: {active.receptionNumber}
                          </div>
                          <div className="flex flex-col gap-2">
                            <a
                              href={`https://firebasestorage.googleapis.com/v0/b/kyoto-brick.firebasestorage.app/o/buyback-agreements%2F${active.receptionNumber}%2Fagreement.pdf?alt=media`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                              PDFを開く
                            </a>
                            <iframe
                              src={`https://firebasestorage.googleapis.com/v0/b/kyoto-brick.firebasestorage.app/o/buyback-agreements%2F${active.receptionNumber}%2Fagreement.pdf?alt=media`}
                              className="w-full border rounded"
                              style={{ height: '500px' }}
                              title="買取同意書PDF"
                            />
                          </div>
                        </div>
                      )}

                      {/* 完了後の再分類（完了解除） */}
                      {(active as any)?.status === 'completed' && (
                        <div className="mt-2 p-3 border rounded bg-white">
                          <div className="text-sm font-semibold mb-2">完了解除して別ステータスへ</div>
                          <label className="block text-sm mb-1">理由（任意）</label>
                          <textarea
                            className="w-full border rounded px-3 py-2 text-sm"
                            rows={2}
                            placeholder="例）お客様からの連絡で不備判明 など"
                            value={releaseReason}
                            onChange={(e) => setReleaseReason(e.target.value)}
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => reclassifyFromCompleted('on_hold')}
                              disabled={reclassifying}
                              className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded text-sm disabled:bg-gray-400"
                            >
                              保留にする
                            </button>
                            <button
                              onClick={() => reclassifyFromCompleted('returned')}
                              disabled={reclassifying}
                              className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-sm disabled:bg-gray-400"
                            >
                              返送にする
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="p-3 border rounded">
                        <div className="font-semibold mb-2">買取希望品</div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-2">カテゴリ</th>
                              <th className="text-left p-2">商品名</th>
                              <th className="text-center p-2">数量</th>
                              <th className="text-right p-2">買取価格</th>
                              <th className="text-right p-2">小計</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(active.items || []).map((it, idx) => (
                              <tr key={`sender-${idx}`} className="border-b">
                                <td className="p-2">{it.category || '—'}</td>
                                <td className="p-2">{it.item || '—'}</td>
                                <td className="p-2 text-center">{it.count}</td>
                                <td className="p-2 text-right">
                                  {it.buyPrice !== null && it.buyPrice !== undefined
                                    ? `¥${it.buyPrice.toLocaleString('ja-JP')}`
                                    : '—'}
                                </td>
                                <td className="p-2 text-right">
                                  {it.buyPrice !== null && it.buyPrice !== undefined
                                    ? `¥${(it.buyPrice * it.count).toLocaleString('ja-JP')}`
                                    : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 bg-gray-50 font-semibold">
                              <td colSpan={4} className="p-2 text-right">合計金額（参考）</td>
                              <td className="p-2 text-right text-blue-600">
                                ¥{(active.items || []).reduce((sum, item) => {
                                  const price = item.buyPrice !== null && item.buyPrice !== undefined ? item.buyPrice : 0;
                                  return sum + (price * item.count);
                                }, 0).toLocaleString('ja-JP')}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={handleNextStep}
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm sm:text-base whitespace-nowrap"
                        >
                          次へ（動画撮影）
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 2: 動画撮影 */}
                  {currentStep === 'video_recording' && (
                    <div className="flex flex-col gap-4">
                      <h2 className="text-lg font-semibold">動画撮影</h2>
                      <p className="text-sm text-gray-600">
                        商品の状態を記録するため、動画を撮影してください。撮影完了後「次へ」をクリックしてください。
                      </p>
                      <div className="p-6 border-2 border-dashed rounded bg-gray-50 text-center">
                        <div>
                          <div className="text-4xl mb-4">📹</div>
                          <label
                            htmlFor="video-upload"
                            className="inline-block px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded cursor-pointer font-medium"
                          >
                            撮影・ファイルを選択
                          </label>
                          <input
                            id="video-upload"
                            type="file"
                            accept="video/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setIsRecording(true);
                                setMessage(`動画を選択しました: ${file.name}`);
                                setTimeout(() => {
                                  setIsRecording(false);
                                  setMessage('');
                                }, 2000);
                              }
                            }}
                          />
                          {isRecording && (
                            <div className="mt-4">
                              <div className="text-emerald-600 font-medium">✓ 動画を選択しました</div>
                            </div>
                          )}
                          <p className="text-xs text-gray-500 mt-3">iPadのカメラで撮影、または既存のファイルを選択できます</p>
                        </div>
                      </div>

                      <div className="flex justify-between gap-2 flex-wrap">
                        <button
                          onClick={() => setCurrentStep('sender_info')}
                          className="px-4 sm:px-6 py-2 bg-gray-400 hover:bg-gray-500 text-white rounded text-sm sm:text-base"
                        >
                          戻る
                        </button>
                        <button onClick={handleNextStep} className="px-4 sm:px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm sm:text-base">
                          次へ（同意書確認）
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: 同意書確認 */}
                  {currentStep === 'consent_check' && (
                    <div className="flex flex-col gap-4">
                      <h2 className="text-lg font-semibold">同意書・身分証 確認</h2>
                      <p className="text-sm text-gray-600">必要書類が揃っているか確認してください。足りない場合は内容を記入のうえ保留にできます。</p>
                      <div className="p-3 border rounded bg-white">
                        <div className="flex items-start gap-3">
                          <input id="docsConfirmed" type="checkbox" className="mt-1" checked={docsConfirmed} onChange={(e) => setDocsConfirmed(e.target.checked)} />
                          <label htmlFor="docsConfirmed" className="text-sm">同意書、身分証など必要書類を確認しました</label>
                        </div>
                        {!docsConfirmed && (
                          <div className="mt-3">
                            <label className="block text-sm font-medium mb-1">不足/不備の内容（任意）</label>
                            <textarea className="w-full border rounded px-3 py-2 text-sm" rows={2} placeholder="例）同意書未提出、身分証コピー不鮮明 など" value={docsMissingNotes} onChange={(e) => setDocsMissingNotes(e.target.value)} />
                            <div className="mt-2">
                              <button onClick={holdDueToDocuments} disabled={saving} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded text-sm disabled:bg-gray-400">書類不足として保留にする</button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-between gap-2 flex-wrap">
                        <button onClick={() => setCurrentStep('video_recording')} className="px-4 sm:px-6 py-2 bg-gray-400 hover:bg-gray-500 text-white rounded text-sm sm:text-base">戻る</button>
                        <button onClick={handleNextStep} className="px-4 sm:px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm sm:text-base">次へ（内容確認）</button>
                      </div>
                    </div>
                  )}

                  {/* Step 4: 内容確認 */}
                  {currentStep === 'content_check' && (
                    <div className="flex flex-col gap-4">
                      <h2 className="text-lg font-semibold">内容確認</h2>
                      <p className="text-sm text-gray-600">
                        買取品が申込内容と一致しているか確認してください。
                      </p>
                      <div className="p-3 border rounded">
                        <div className="font-semibold mb-2">買取希望品リスト</div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-gray-50">
                              <th className="text-left p-2">カテゴリ</th>
                              <th className="text-left p-2">商品名</th>
                              <th className="text-center p-2">申込数量</th>
                              <th className="text-left p-2">状態割当</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(active.items || []).map((it, idx) => {
                              const sumAssigned = Object.values(it.damageBreakdown || {}).reduce((a: number, b: number) => a + (b || 0), 0);
                              const remainder = Math.max(0, (it.count || 0) - sumAssigned);
                              return (
                                <tr key={`verify-${idx}`} className="border-b align-top">
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
                                                      const next = { ...active } as BuyRequest;
                                                      const items = [...(next.items || [])];
                                                      const cur = { ...(items[idx] || {}) } as ItemEntry;
                                                      const map = { ...(cur.damageBreakdown || {}) } as Record<string, number>;
                                                      const v = (map[t.id] || 0) - 1;
                                                      map[t.id] = Math.max(0, v);
                                                      cur.damageBreakdown = map;
                                                      items[idx] = cur;
                                                      setRequests((prev) => prev.map((r) => (r.id === next.id ? { ...next, items } : r)));
                                                    }}
                                                  >
                                                    −
                                                  </button>
                                                  <span className="text-xs w-6 text-center">{curVal}</span>
                                                  <button
                                                    className={`px-2 py-0.5 text-xs rounded ${canInc ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-400'}`}
                                                    disabled={!canInc}
                                                    onClick={() => {
                                                      const next = { ...active } as BuyRequest;
                                                      const items = [...(next.items || [])];
                                                      const cur = { ...(items[idx] || {}) } as ItemEntry;
                                                      const map = { ...(cur.damageBreakdown || {}) } as Record<string, number>;
                                                      map[t.id] = (map[t.id] || 0) + 1;
                                                      const total = Object.values(map).reduce((a: number, b: number) => a + (b || 0), 0);
                                                      if (total > (cur.count || 0)) {
                                                        map[t.id] = (map[t.id] || 1) - 1;
                                                      }
                                                      cur.damageBreakdown = map;
                                                      items[idx] = cur;
                                                      setRequests((prev) => prev.map((r) => (r.id === next.id ? { ...next, items } : r)));
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
                      <div>
                        <label htmlFor="inspection-notes" className="block text-sm font-semibold mb-2">検品メモ（任意）</label>
                        <textarea
                          id="inspection-notes"
                          className="w-full border rounded px-3 py-2"
                          rows={3}
                          value={inspectionNotes}
                          onChange={(e) => setInspectionNotes(e.target.value)}
                          placeholder="キズ、凹み、付属品不足など気になる点があれば記入"
                        />
                      </div>
                      <div className="flex justify-between gap-2 flex-wrap">
                        <button onClick={() => setCurrentStep('consent_check')} className="px-4 sm:px-6 py-2 bg-gray-400 hover:bg-gray-500 text-white rounded text-sm sm:text-base">戻る</button>
                        <button
                          onClick={handleNextStep}
                          className="px-4 sm:px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm sm:text-base"
                        >
                          次へ（最終判断）
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 4: 最終判断（完了/保留） */}
                  {currentStep === 'final_decision' && (
                    <div className="flex flex-col gap-4">
                      <h2 className="text-lg font-semibold">最終判断</h2>
                      <p className="text-sm text-gray-600">
                        検品を完了するか、問題があるため保留にするかを選択してください。
                      </p>
                      <div className="p-4 border rounded bg-blue-50">
                        <p className="text-sm mb-2"><strong>受付番号:</strong> {active.receptionNumber || active.id.slice(0, 12)}</p>
                        <p className="text-sm mb-2"><strong>申込者:</strong> {active.name}</p>
                        <p className="text-sm"><strong>検品メモ:</strong> {inspectionNotes || '（なし）'}</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <button
                          onClick={() => handleFinalDecision('completed')}
                          disabled={saving}
                          className="px-4 sm:px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold disabled:bg-gray-400 text-sm sm:text-base"
                        >
                          ✓ 検品完了（問題なし）
                        </button>
                        {!holdMode ? (
                          <button
                            onClick={() => setHoldMode(true)}
                            disabled={saving}
                            className="px-4 sm:px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold disabled:bg-gray-400 text-sm sm:text-base"
                          >
                            ⚠ 保留（理由入力）
                          </button>
                        ) : (
                          <div className="col-span-1 sm:col-span-1 flex flex-col gap-2">
                            <label className="text-sm font-medium">保留理由</label>
                            <textarea
                              className="w-full border rounded px-3 py-2 text-sm"
                              rows={2}
                              placeholder="例）同意書不足、本人確認不備 など"
                              value={holdReason}
                              onChange={(e) => setHoldReason(e.target.value)}
                            />
                            <button
                              onClick={holdWithReason}
                              disabled={saving}
                              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded text-sm disabled:bg-gray-400"
                            >
                              保留として保存
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-start">
                        <button
                          onClick={() => setCurrentStep('content_check')}
                          disabled={saving}
                          className="px-4 sm:px-6 py-2 bg-gray-400 hover:bg-gray-500 text-white rounded disabled:bg-gray-300 text-sm sm:text-base"
                        >
                          戻る
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 text-sm text-gray-500">左の一覧から申込を選択してください。</div>
              )}
            </section>
          </div>
        ) : (
          // 保留中UI: 保留中/連絡待ちを同時に表示（on-holdページ相当を貼り付け）
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
                      {requests.filter((r) => r.status === 'on_hold').length === 0 && (
                        <tr><td colSpan={5} className="p-3 text-gray-500">保留中の申込はありません</td></tr>
                      )}
                      {requests.filter((r) => r.status === 'on_hold').map((r) => (
                        <tr key={r.id} className="border-b align-top">
                          <td className="p-2">{r.receptionNumber || r.id.slice(0, 12)}</td>
                          <td className="p-2">{r.name}</td>
                          <td className="p-2">{r.lineName}</td>
                          <td className="p-2 whitespace-pre-wrap">{r.inspectionNotes || '—'}</td>
                          <td className="p-2">
                            <button onClick={async () => {
                              const db = getFirestoreClient(); if (!db) return;
                              await updateDoc(doc(db, 'buy_requests', r.id), {
                                status: 'waiting_contact',
                                inspectionNotes: (r.inspectionNotes || '') + '\n[連絡済み] 店舗より連絡完了',
                                updatedAt: new Date().toISOString(),
                              } as any);
                              setRequests((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: 'waiting_contact', inspectionNotes: (r.inspectionNotes || '') + '\n[連絡済み] 店舗より連絡完了' } : x)));
                              setMessage('連絡済みに更新しました');
                              setTimeout(() => setMessage(''), 1500);
                            }} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded">連絡済みにする</button>
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
                      {requests.filter((r) => r.status === 'waiting_contact').length === 0 && (
                        <tr><td colSpan={5} className="p-3 text-gray-500">連絡待ちの申込はありません</td></tr>
                      )}
                      {requests.filter((r) => r.status === 'waiting_contact').map((r) => (
                        <tr key={r.id} className="border-b align-top">
                          <td className="p-2">{r.receptionNumber || r.id.slice(0, 12)}</td>
                          <td className="p-2">{r.name}</td>
                          <td className="p-2">{r.lineName}</td>
                          <td className="p-2 whitespace-pre-wrap">{r.inspectionNotes || '—'}</td>
                          <td className="p-2 flex gap-2">
                            <button onClick={async () => {
                              const db = getFirestoreClient(); if (!db) return;
                              await updateDoc(doc(db, 'buy_requests', r.id), {
                                status: 'returned',
                                inspectionStatus: 'returned',
                                inspectionNotes: (r.inspectionNotes || '') + '\n[処理] 返送対応',
                                updatedAt: new Date().toISOString(),
                              } as any);
                              setRequests((prev) => prev.filter((x) => x.id !== r.id));
                              setMessage('返送として処理しました');
                              setTimeout(() => setMessage(''), 1500);
                            }} className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded">返送</button>
                            <button onClick={async () => {
                              const db = getFirestoreClient(); if (!db) return;
                              await updateDoc(doc(db, 'buy_requests', r.id), {
                                status: 'completed',
                                inspectionStatus: 'completed',
                                inspectionNotes: (r.inspectionNotes || '') + '\n[処理] 修正同意済み',
                                updatedAt: new Date().toISOString(),
                              } as any);
                              setRequests((prev) => prev.filter((x) => x.id !== r.id));
                              setMessage('修正同意済みとして完了しました');
                              setTimeout(() => setMessage(''), 1500);
                            }} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded">修正同意済み</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
