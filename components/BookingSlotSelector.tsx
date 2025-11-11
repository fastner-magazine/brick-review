'use client';

import { useEffect, useState, useMemo } from 'react';
import ResponsiveDatePicker from '@/components/ResponsiveDatePicker';
import {
    getStoreSettings,
    listBookingsByDate,
    createBookingOnce,
    type StoreSettings,
    type Booking,
} from '@/lib/firestoreClient';

type Slot = {
    time: string;
    disabled?: boolean;
    reason?: string;
};

type BookingStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

type BookingSlotSelectorProps = {
    onSelect: (dateTime: string) => void;
    selectedDateTime?: string;
    customerName: string;
    customerContact?: string;
};

function pad2(n: number) {
    return n.toString().padStart(2, '0');
}

function toDateStr(d: Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function normalizeHM(input?: string | null): string | null {
    const raw = (input ?? '').trim();
    if (!raw) return null;
    if (raw.includes(':')) return raw;
    const digits = raw.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length <= 2) {
        const hours = digits.padStart(2, '0');
        return `${hours}:00`;
    }
    const hours = digits.slice(0, digits.length - 2).padStart(2, '0');
    const minutes = digits.slice(-2);
    return `${hours}:${minutes}`;
}

function parseHM(hm?: string | null): { h: number; m: number } | null {
    const normalized = normalizeHM(hm);
    if (!normalized) return null;
    const m = /^([0-2]?\d):([0-5]\d)$/.exec(normalized);
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

export default function BookingSlotSelector({
    onSelect,
    selectedDateTime,
    customerName,
    customerContact,
}: BookingSlotSelectorProps) {
    const [settings, setSettings] = useState<StoreSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [date, setDate] = useState<string>('');
    const [booked, setBooked] = useState<Booking[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<string>('');
    const [bookingStatus, setBookingStatus] = useState<BookingStatus>('idle');

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            setError('');
            try {
                const s = await getStoreSettings('default');
                console.log('[BookingSlotSelector] storeSettings loaded:', s);
                if (!s) {
                    console.warn('[BookingSlotSelector] storeSettings is null, using default values');
                    // storeSettingsが存在しない場合のデフォルト設定
                    setSettings({
                        storeId: 'default',
                        enabled: true,
                        businessHours: {
                            mon: { open: '10:00', close: '19:00' },
                            tue: { open: '10:00', close: '19:00' },
                            wed: { open: '10:00', close: '19:00' },
                            thu: { open: '10:00', close: '19:00' },
                            fri: { open: '10:00', close: '19:00' },
                            sat: { open: '10:00', close: '19:00' },
                            sun: null,
                        },
                        visitSettings: {
                            slotMinutes: 30,
                            intervalMinutes: 30,
                            maxDaysAhead: 14,
                            minHoursBefore: 2,
                        },
                        closedDates: [],
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    });
                } else {
                    setSettings(s);
                }
                const today = new Date();
                setDate(toDateStr(today));
            } catch (e) {
                console.error('[BookingSlotSelector] Error loading settings:', e);
                setError(e instanceof Error ? e.message : String(e));
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    useEffect(() => {
        const f = async () => {
            if (!date) {
                setBooked([]);
                setBookingStatus('idle');
                return;
            }
            setBookingStatus('loading');
            try {
                const rows = await listBookingsByDate(date, 'default');
                if (rows && rows.length > 0) {
                    setBooked(rows);
                    setBookingStatus('success');
                } else {
                    setBooked([]);
                    setBookingStatus('empty');
                }
            } catch (e) {
                // bookingsコレクションが存在しない場合でもスロットを表示
                console.warn('Bookings fetch failed, showing all available slots:', e);
                setBooked([]);
                setBookingStatus('error');
            }
        };
        f();
    }, [date]);

    const minDate = useMemo(() => {
        return toDateStr(new Date());
    }, []);

    const maxDate = useMemo(() => {
        if (!settings?.visitSettings?.maxDaysAhead) return undefined;
        const d = new Date();
        d.setDate(d.getDate() + (settings.visitSettings.maxDaysAhead || 14));
        return toDateStr(d);
    }, [settings?.visitSettings?.maxDaysAhead]);

    const slotPlan = useMemo(() => {
        const result: { slots: Slot[]; message?: string } = { slots: [] };
        if (!settings) {
            result.message = '来店予約の設定を読み込めませんでした。';
            return result;
        }
        if (!settings.enabled) {
            result.message = '現在、来店予約は受け付けておりません。';
            return result;
        }
        if (!date) {
            result.message = '来店希望日を選択してください。';
            return result;
        }
        if (settings.closedDates?.includes(date)) {
            result.message = '選択された日は休業日です。';
            return result;
        }

        const d = new Date(`${date}T00:00:00`);
        if (Number.isNaN(d.getTime())) {
            result.message = '日付の形式が正しくありません。';
            return result;
        }

        const w = getWeekdayKey(d);
        const hours = settings.businessHours?.[w];
        if (!hours) {
            result.message = '選択された日の営業時間が設定されていません。';
            return result;
        }

        const openHM = parseHM(hours.open);
        const closeHM = parseHM(hours.close);
        if (!openHM || !closeHM) {
            result.message = '営業時間の設定を確認してください。';
            return result;
        }

        const start = new Date(d);
        start.setHours(openHM.h, openHM.m, 0, 0);
        const end = new Date(d);
        end.setHours(closeHM.h, closeHM.m, 0, 0);
        if (end <= start) {
            result.message = '営業終了時刻が開始時刻より前に設定されています。';
            return result;
        }

        const breakStartHM = parseHM(hours.breakStart);
        const breakEndHM = parseHM(hours.breakEnd);
        let breakStart: Date | null = null;
        let breakEnd: Date | null = null;
        if (breakStartHM && breakEndHM) {
            breakStart = new Date(d);
            breakStart.setHours(breakStartHM.h, breakStartHM.m, 0, 0);
            breakEnd = new Date(d);
            breakEnd.setHours(breakEndHM.h, breakEndHM.m, 0, 0);
            if (breakEnd <= breakStart) {
                breakStart = null;
                breakEnd = null;
            }
        }

        const interval = settings.visitSettings?.intervalMinutes || settings.visitSettings?.slotMinutes || 30;
        const slotLen = settings.visitSettings?.slotMinutes || 30;

        if (interval <= 0 || slotLen <= 0) {
            result.message = '来店予約の時間間隔が正しく設定されていません。';
            return result;
        }

        const bookedSet = new Set<string>(booked.filter((b) => b.status === 'booked').map((b) => b.slot));

        for (let t = new Date(start); t < end; t = addMinutes(t, interval)) {
            const slotStart = new Date(t);
            const slotEnd = addMinutes(slotStart, slotLen);
            if (slotEnd > end) break;

            if (breakStart && breakEnd && slotStart < breakEnd && slotEnd > breakStart) {
                continue;
            }

            const label = `${pad2(slotStart.getHours())}:${pad2(slotStart.getMinutes())}`;
            let disabled = false;
            let reason = '';

            if (bookedSet.has(label)) {
                disabled = true;
                reason = '予約済み';
            }

            if (settings.visitSettings?.minHoursBefore) {
                const now = new Date();
                const minTs = addMinutes(now, (settings.visitSettings.minHoursBefore || 0) * 60);
                if (slotStart <= minTs && toDateStr(now) === date) {
                    disabled = true;
                    reason = '直前締切';
                }
            }

            result.slots.push({ time: label, disabled, reason });
        }

        if (result.slots.length === 0) {
            result.message = '予約可能な時間帯がありませんでした。設定を確認してください。';
        }

        return result;
    }, [settings, date, booked]);

    const slots = slotPlan.slots;
    const slotMessage = slotPlan.message;

    const handleSlotClick = (slot: string) => {
        if (!date) return;
        setSelectedSlot(slot);
        // ISO 8601形式で返す（datetime-local互換）
        const dateTime = `${date}T${slot}`;
        onSelect(dateTime);
    };

    if (loading) {
        return (
            <div style={{ fontSize: '0.9rem', color: '#666', padding: '16px', textAlign: 'center' }}>
                来店可能時間を読み込み中...
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ fontSize: '0.9rem', color: '#dc3545', padding: '16px', textAlign: 'center' }}>
                {error}
            </div>
        );
    }

    if (!settings?.enabled) {
        return (
            <div style={{ fontSize: '0.9rem', color: '#666', padding: '16px', textAlign: 'center' }}>
                現在、来店予約は受け付けておりません。
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
                <label style={{
                    display: 'block',
                    fontSize: 'clamp(0.9rem, 2.5vw, 1rem)',
                    fontWeight: '600',
                    color: '#333',
                    marginBottom: '8px'
                }}>
                    来店希望日を選択 *
                </label>
                <ResponsiveDatePicker
                    value={date}
                    onChange={(nextDate) => {
                        setDate(nextDate);
                        setSelectedSlot('');
                    }}
                    minDate={minDate}
                    maxDate={maxDate}
                    required
                />
            </div>

            {date && (
                <div>
                    <label style={{
                        display: 'block',
                        fontSize: 'clamp(0.9rem, 2.5vw, 1rem)',
                        fontWeight: '600',
                        color: '#333',
                        marginBottom: '8px'
                    }}>
                        来店希望時間を選択 *
                    </label>
                    {bookingStatus === 'loading' && (
                        <div style={{
                            fontSize: '0.85rem',
                            color: '#666',
                            marginBottom: '8px'
                        }}>
                            予約状況を確認しています...
                        </div>
                    )}
                    {bookingStatus === 'empty' && (
                        <div style={{
                            fontSize: '0.85rem',
                            color: '#666',
                            marginBottom: '8px'
                        }}>
                            選択された日の予約はありませんでした。
                        </div>
                    )}
                    {bookingStatus === 'error' && (
                        <div style={{
                            fontSize: '0.85rem',
                            color: '#dc3545',
                            marginBottom: '8px'
                        }}>
                            予約のデータがありませんでした。
                        </div>
                    )}
                    {slots.length === 0 ? (
                        <div style={{
                            fontSize: '0.9rem',
                            color: '#666',
                            padding: '16px',
                            textAlign: 'center',
                            background: '#f8f9fa',
                            borderRadius: '8px',
                            border: '1px solid #e0e0e0'
                        }}>
                            {slotMessage || '予約可能な時間がありません。'}
                        </div>
                    ) : (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                            gap: '8px'
                        }}>
                            {slots.map((slot) => (
                                <button
                                    key={slot.time}
                                    type="button"
                                    onClick={() => !slot.disabled && handleSlotClick(slot.time)}
                                    disabled={slot.disabled}
                                    style={{
                                        padding: '10px 12px',
                                        fontSize: '0.9rem',
                                        borderRadius: '8px',
                                        border: slot.disabled
                                            ? '1px solid #e0e0e0'
                                            : selectedSlot === slot.time
                                                ? '2px solid #007bff'
                                                : '1px solid #ccc',
                                        background: slot.disabled
                                            ? '#f5f5f5'
                                            : selectedSlot === slot.time
                                                ? '#007bff'
                                                : 'white',
                                        color: slot.disabled
                                            ? '#999'
                                            : selectedSlot === slot.time
                                                ? 'white'
                                                : '#333',
                                        cursor: slot.disabled ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s ease',
                                        fontWeight: selectedSlot === slot.time ? '600' : '400',
                                        boxShadow: selectedSlot === slot.time ? '0 2px 8px rgba(0,123,255,0.3)' : 'none'
                                    }}
                                    title={slot.reason || ''}
                                    onMouseEnter={(e) => {
                                        if (!slot.disabled && selectedSlot !== slot.time) {
                                            e.currentTarget.style.background = '#e3f2fd';
                                            e.currentTarget.style.borderColor = '#007bff';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!slot.disabled && selectedSlot !== slot.time) {
                                            e.currentTarget.style.background = 'white';
                                            e.currentTarget.style.borderColor = '#ccc';
                                        }
                                    }}
                                >
                                    {slot.time}
                                    {slot.reason && (
                                        <div style={{ fontSize: '0.7rem', marginTop: '4px', opacity: 0.75 }}>
                                            {slot.reason}
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {date && selectedSlot && (
                <div style={{
                    fontSize: '0.9rem',
                    color: '#28a745',
                    background: '#d4edda',
                    border: '1px solid #c3e6cb',
                    borderRadius: '8px',
                    padding: '12px'
                }}>
                    <strong>選択中:</strong> {date} {selectedSlot}
                </div>
            )}
        </div>
    );
}
