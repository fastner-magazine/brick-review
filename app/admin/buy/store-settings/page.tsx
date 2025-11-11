'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getStoreSettings, saveStoreSettings, type StoreSettings } from '@/lib/firestoreClient';

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const dayLabels: Record<DayKey, string> = {
  mon: '月',
  tue: '火',
  wed: '水',
  thu: '木',
  fri: '金',
  sat: '土',
  sun: '日',
};

export default function StoreSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const [enabled, setEnabled] = useState<boolean>(true);
  const [businessHours, setBusinessHours] = useState<StoreSettings['businessHours']>({});
  const [slotMinutes, setSlotMinutes] = useState<number>(30);
  const [intervalMinutes, setIntervalMinutes] = useState<number>(30);
  const [maxDaysAhead, setMaxDaysAhead] = useState<number>(14);
  const [minHoursBefore, setMinHoursBefore] = useState<number>(2);
  const [closedDates, setClosedDates] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const s = await getStoreSettings('default');
        if (s) {
          setEnabled(Boolean(s.enabled ?? true));
          setBusinessHours(s.businessHours || {});
          setSlotMinutes(s.visitSettings?.slotMinutes || 30);
          setIntervalMinutes(s.visitSettings?.intervalMinutes || s.visitSettings?.slotMinutes || 30);
          setMaxDaysAhead(s.visitSettings?.maxDaysAhead ?? 14);
          setMinHoursBefore(s.visitSettings?.minHoursBefore ?? 2);
          setClosedDates(s.closedDates || []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const setDay = (day: DayKey, open: string, close: string, breakStart?: string, breakEnd?: string) => {
    console.log('setDay called:', { day, open, close, breakStart, breakEnd });
    setBusinessHours((prev) => {
      // open か close が空でも、入力中の値を保持する
      const newHours = {
        ...prev,
        [day]: (open || close || breakStart || breakEnd)
          ? { open, close, breakStart, breakEnd }
          : null,
      };
      console.log('New businessHours:', newHours);
      return newHours;
    });
  };

  const removeClosedDate = (date: string) => {
    setClosedDates((prev) => prev.filter((d) => d !== date));
  };

  const addClosedDate = (date: string) => {
    if (!date) return;
    setClosedDates((prev) => (prev.includes(date) ? prev : [...prev, date]));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('保存中…');
    setError('');
    try {
      // 保存前にバリデーション: open と close が両方ある場合のみ保持
      const validatedBusinessHours: StoreSettings['businessHours'] = {};
      for (const [day, hours] of Object.entries(businessHours)) {
        if (hours && hours.open && hours.close) {
          validatedBusinessHours[day as DayKey] = hours;
        }
      }

      const payload: StoreSettings = {
        storeId: 'default',
        enabled,
        businessHours: validatedBusinessHours,
        visitSettings: {
          slotMinutes: Number(slotMinutes) || 30,
          intervalMinutes: Number(intervalMinutes) || Number(slotMinutes) || 30,
          maxDaysAhead: Number(maxDaysAhead) || 14,
          minHoursBefore: Number(minHoursBefore) || 0,
        },
        closedDates,
      };
      await saveStoreSettings(payload);
      setMessage('保存しました');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMessage('');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 1500);
    }
  };

  const dayKeys: DayKey[] = useMemo(() => ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], []);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-800">来店予約 設定</h1>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-blue-600 underline">ホーム</Link>
            <Link href="/buy/booking" className="text-blue-600 underline">予約ページ</Link>
          </div>
        </div>

        {loading && <div className="text-sm text-gray-500">読み込み中…</div>}
        {error && <div className="text-sm text-rose-600">{error}</div>}
        {message && <div className="text-sm text-emerald-700">{message}</div>}

        <section className="bg-white border rounded p-4">
          <div className="flex items-center gap-3 mb-4">
            <label className="font-medium">予約受付</label>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span className="text-sm text-gray-600">有効/無効</span>
          </div>

          <div className="space-y-3">
            <h2 className="font-semibold">営業時間（曜日ごと）</h2>
            {dayKeys.map((k) => {
              const v = businessHours[k] || null;
              const open = v?.open ?? '';
              const close = v?.close ?? '';
              const breakStart = v?.breakStart ?? '';
              const breakEnd = v?.breakEnd ?? '';
              return (
                <div key={k} className="space-y-2 p-3 bg-gray-50 rounded border">
                  <div className="grid grid-cols-[2rem_1fr_1fr_auto] items-center gap-2">
                    <div className="text-sm w-8 font-medium">{dayLabels[k]}</div>
                    <input
                      type="text"
                      className="border rounded px-2 py-1 text-sm bg-white"
                      placeholder="開店例 10:00"
                      value={open}
                      onChange={(e) => {
                        e.stopPropagation();
                        setDay(k, e.target.value, close, breakStart, breakEnd);
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      onKeyPress={(e) => e.stopPropagation()}
                      onKeyUp={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                    />
                    <input
                      type="text"
                      className="border rounded px-2 py-1 text-sm bg-white"
                      placeholder="閉店例 19:00"
                      value={close}
                      onChange={(e) => {
                        e.stopPropagation();
                        setDay(k, open, e.target.value, breakStart, breakEnd);
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      onKeyPress={(e) => e.stopPropagation()}
                      onKeyUp={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDay(k, '', '', '', '');
                      }}
                      className="text-xs text-gray-500 underline"
                    >クリア</button>
                  </div>
                  <div className="grid grid-cols-[2rem_1fr_1fr_auto] items-center gap-2">
                    <div className="text-xs w-8 text-gray-500">休憩</div>
                    <input
                      type="text"
                      className="border rounded px-2 py-1 text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                      placeholder="開始 15:00"
                      value={breakStart}
                      onChange={(e) => {
                        e.stopPropagation();
                        setDay(k, open, close, e.target.value, breakEnd);
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      onKeyPress={(e) => e.stopPropagation()}
                      onKeyUp={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                      disabled={!open || !close}
                    />
                    <input
                      type="text"
                      className="border rounded px-2 py-1 text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                      placeholder="終了 16:00"
                      value={breakEnd}
                      onChange={(e) => {
                        e.stopPropagation();
                        setDay(k, open, close, breakStart, e.target.value);
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      onKeyPress={(e) => e.stopPropagation()}
                      onKeyUp={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                      disabled={!open || !close}
                    />
                    <div className="w-12"></div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 space-y-3">
            <h2 className="font-semibold">来店可能時間 設定</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">1枠の長さ（分）
                <input type="number" className="mt-1 w-full border rounded px-2 py-1"
                  value={slotMinutes}
                  onChange={(e) => setSlotMinutes(Number(e.target.value))}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </label>
              <label className="text-sm">枠の間隔（分）
                <input type="number" className="mt-1 w-full border rounded px-2 py-1"
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </label>
              <label className="text-sm">予約可の上限（日）
                <input type="number" className="mt-1 w-full border rounded px-2 py-1"
                  value={maxDaysAhead}
                  onChange={(e) => setMaxDaysAhead(Number(e.target.value))}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </label>
              <label className="text-sm">直前締切（時間前まで）
                <input type="number" className="mt-1 w-full border rounded px-2 py-1"
                  value={minHoursBefore}
                  onChange={(e) => setMinHoursBefore(Number(e.target.value))}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </label>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <h2 className="font-semibold">休業日（個別日付）</h2>
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="border rounded px-2 py-1 text-sm"
                id="closedDatePicker"
                onKeyDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
              />
              <button
                onClick={() => {
                  const el = document.getElementById('closedDatePicker') as HTMLInputElement | null;
                  if (el?.value) addClosedDate(el.value);
                }}
                className="text-sm text-blue-600 underline"
              >追加</button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {closedDates.map((d) => (
                <span key={d} className="inline-flex items-center gap-2 border rounded px-2 py-1 text-xs">
                  {d}
                  <button onClick={() => removeClosedDate(d)} className="text-rose-600">×</button>
                </span>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <Button onClick={handleSave} disabled={saving} variant="default">
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}

