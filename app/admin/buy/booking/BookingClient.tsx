'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  getStoreSettings,
  listBookingsByDate,
  createBookingOnce,
  type StoreSettings,
  type Booking,
} from '@/lib/firestoreClient';

type Slot = { time: string; disabled?: boolean; reason?: string };

function pad2(n: number) { return n.toString().padStart(2, '0'); }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function parseHM(hm: string): { h: number; m: number } | null {
  const m = /^([0-2]?\d):([0-5]\d)$/.exec(hm?.trim() || '');
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23) return null;
  return { h, m: mm };
}

function getWeekdayKey(d: Date): 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d.getDay()] as any;
}

function addMinutes(base: Date, mins: number) {
  const d = new Date(base);
  d.setMinutes(d.getMinutes() + mins);
  return d;
}

type BookingClientProps = {
  initialDate?: string;
  initialName?: string;
};

export default function BookingClient({ initialDate, initialName }: BookingClientProps) {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState(initialName || '');
  const [contact, setContact] = useState('');
  const [date, setDate] = useState<string>(initialDate || '');
  const [booked, setBooked] = useState<Booking[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError('');
      try {
        const s = await getStoreSettings('default');
        setSettings(s);
        if (!initialDate) {
          const today = new Date();
          setDate(toDateStr(today));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [initialDate]);

  useEffect(() => {
    const f = async () => {
      if (!date) return;
      const rows = await listBookingsByDate(date, 'default');
      setBooked(rows);
    };
    f();
  }, [date]);

  const maxDate = useMemo(() => {
    if (!settings?.visitSettings?.maxDaysAhead) return undefined;
    const d = new Date();
    d.setDate(d.getDate() + (settings.visitSettings.maxDaysAhead || 14));
    return toDateStr(d);
  }, [settings?.visitSettings?.maxDaysAhead]);

  const slots: Slot[] = useMemo(() => {
    const out: Slot[] = [];
    if (!settings || !settings.enabled) return out;
    if (!date) return out;
    if (settings.closedDates?.includes(date)) return out;
    const d = new Date(date + 'T00:00:00');
    const w = getWeekdayKey(d);
    const hours = settings.businessHours?.[w];
    if (!hours || !hours.open || !hours.close) return out;
    const openHM = parseHM(hours.open);
    const closeHM = parseHM(hours.close);
    if (!openHM || !closeHM) return out;

    const start = new Date(d);
    start.setHours(openHM.h, openHM.m, 0, 0);
    const end = new Date(d);
    end.setHours(closeHM.h, closeHM.m, 0, 0);

    // 休憩時間の解析
    const breakStartHM = hours.breakStart ? parseHM(hours.breakStart) : null;
    const breakEndHM = hours.breakEnd ? parseHM(hours.breakEnd) : null;
    let breakStart: Date | null = null;
    let breakEnd: Date | null = null;
    if (breakStartHM && breakEndHM) {
      breakStart = new Date(d);
      breakStart.setHours(breakStartHM.h, breakStartHM.m, 0, 0);
      breakEnd = new Date(d);
      breakEnd.setHours(breakEndHM.h, breakEndHM.m, 0, 0);
    }

    const interval = settings.visitSettings?.intervalMinutes || settings.visitSettings?.slotMinutes || 30;
    const slotLen = settings.visitSettings?.slotMinutes || 30;

    // 既存予約のマップ化
    const bookedSet = new Set<string>(booked.filter(b => b.status === 'booked').map(b => b.slot));

    for (let t = new Date(start); t < end; t = addMinutes(t, interval)) {
      const slotStart = new Date(t);
      const slotEnd = addMinutes(slotStart, slotLen);
      if (slotEnd > end) break;

      // 休憩時間中のスロットはスキップ
      if (breakStart && breakEnd && slotStart < breakEnd && slotEnd > breakStart) {
        continue;
      }

      const label = `${pad2(slotStart.getHours())}:${pad2(slotStart.getMinutes())}`;
      let disabled = false;
      let reason = '';
      if (bookedSet.has(label)) {
        disabled = true; reason = '予約済み';
      }
      // 直前締切
      if (settings.visitSettings?.minHoursBefore) {
        const now = new Date();
        const minTs = addMinutes(now, (settings.visitSettings.minHoursBefore || 0) * 60);
        if (slotStart <= minTs && toDateStr(now) === date) {
          disabled = true; reason = '直前締切';
        }
      }
      out.push({ time: label, disabled, reason });
    }
    return out;
  }, [settings, date, booked]);

  const canSubmit = name.trim().length > 0 && date && slots.some(s => !s.disabled);

  const handleBook = async (slot: string) => {
    if (!name.trim()) return;
    setSaving(true);
    setMessage('予約中…');
    try {
      const res = await createBookingOnce({ date, slot, customerName: name, customerContact: contact, storeId: 'default' });
      if (res.ok) {
        setMessage('予約を受け付けました');
        // 予約済み状態を反映
        const rows = await listBookingsByDate(date, 'default');
        setBooked(rows);
      } else {
        setMessage(res.reason || '予約できませんでした');
      }
    } catch (e) {
      setMessage('予約処理でエラーが発生しました');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 1500);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-800">来店予約</h1>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-blue-600 underline">ホーム</Link>
            <Link href="/buy/store-settings" className="text-blue-600 underline">設定</Link>
          </div>
        </div>

        {loading && <div className="text-sm text-gray-500">読み込み中…</div>}
        {error && <div className="text-sm text-rose-600">{error}</div>}
        {message && <div className="text-sm text-emerald-700">{message}</div>}

        <section className="bg-white border rounded p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">お名前
              <input className="mt-1 w-full border rounded px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="text-sm">ご連絡先（任意）
              <input className="mt-1 w-full border rounded px-2 py-1" value={contact} onChange={(e) => setContact(e.target.value)} />
            </label>
            <label className="text-sm">日付
              <input
                type="date"
                className="mt-1 w-full border rounded px-2 py-1"
                value={date}
                min={toDateStr(new Date())}
                max={maxDate}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-4">
            <h2 className="font-semibold mb-2">空き時間</h2>
            {(!settings || !settings.enabled) && <div className="text-sm text-gray-500">現在、予約は無効です</div>}
            {settings && settings.enabled && slots.length === 0 && (
              <div className="text-sm text-gray-500">予約可能な時間がありません</div>
            )}
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <button
                  key={s.time}
                  disabled={s.disabled || saving}
                  onClick={() => handleBook(s.time)}
                  className={`px-3 py-1 rounded text-sm border ${s.disabled ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                  title={s.reason || ''}
                >
                  {s.time}{s.disabled && s.reason ? `（${s.reason}）` : ''}
                </button>
              ))}
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
