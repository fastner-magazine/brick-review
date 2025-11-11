'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';

type BirthdateSelectProps = {
    value: string;
    onChange: (next: string) => void;
    minYear?: number;
    maxYear?: number;
};

const pad = (n: number) => n.toString().padStart(2, '0');
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

export default function BirthdateSelect({
    value,
    onChange,
    minYear,
    maxYear,
}: BirthdateSelectProps) {
    const currentYear = new Date().getFullYear();
    const resolvedMaxYear = maxYear ?? currentYear;
    const resolvedMinYear = minYear ?? currentYear - 110;

    const [year, setYear] = useState<number | ''>('');
    const [month, setMonth] = useState<number | ''>('');
    const [day, setDay] = useState<number | ''>('');

    useEffect(() => {
        if (!value) {
            setYear('');
            setMonth('');
            setDay('');
            return;
        }

        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            setYear('');
            setMonth('');
            setDay('');
            return;
        }

        setYear(parsed.getUTCFullYear());
        setMonth(parsed.getUTCMonth() + 1);
        setDay(parsed.getUTCDate());
    }, [value]);

    const yearOptions = useMemo(() => {
        const years: number[] = [];
        for (let y = resolvedMaxYear; y >= resolvedMinYear; y -= 1) {
            years.push(y);
        }
        return years;
    }, [resolvedMaxYear, resolvedMinYear]);

    const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, idx) => idx + 1), []);

    const maxDayForSelection = useMemo(() => {
        if (typeof year === 'number' && typeof month === 'number') {
            return daysInMonth(year, month);
        }
        return 31;
    }, [year, month]);

    const dayOptions = useMemo(
        () => Array.from({ length: maxDayForSelection }, (_, idx) => idx + 1),
        [maxDayForSelection]
    );

    const emit = (nextYear: number | '', nextMonth: number | '', nextDay: number | '') => {
        if (
            typeof nextYear === 'number' &&
            typeof nextMonth === 'number' &&
            typeof nextDay === 'number'
        ) {
            const safeDay = Math.min(nextDay, daysInMonth(nextYear, nextMonth));
            if (safeDay !== nextDay) {
                setDay(safeDay);
            }
            onChange(`${nextYear}-${pad(nextMonth)}-${pad(safeDay)}`);
        } else {
            onChange('');
        }
    };

    const handleYearChange = (event: ChangeEvent<HTMLSelectElement>) => {
        const nextYear = event.target.value ? Number(event.target.value) : '';
        setYear(nextYear);
        const updatedDay =
            typeof nextYear === 'number' && typeof month === 'number' && typeof day === 'number'
                ? Math.min(day, daysInMonth(nextYear, month))
                : day;
        if (typeof nextYear === 'number' && typeof month === 'number' && typeof updatedDay === 'number') {
            if (updatedDay !== day) {
                setDay(updatedDay);
            }
            emit(nextYear, month, updatedDay);
        } else {
            onChange('');
        }
    };

    const handleMonthChange = (event: ChangeEvent<HTMLSelectElement>) => {
        const nextMonth = event.target.value ? Number(event.target.value) : '';
        setMonth(nextMonth);
        const updatedDay =
            typeof year === 'number' && typeof nextMonth === 'number' && typeof day === 'number'
                ? Math.min(day, daysInMonth(year, nextMonth))
                : day;
        if (typeof year === 'number' && typeof nextMonth === 'number' && typeof updatedDay === 'number') {
            if (updatedDay !== day) {
                setDay(updatedDay);
            }
            emit(year, nextMonth, updatedDay);
        } else {
            onChange('');
        }
    };

    const handleDayChange = (event: ChangeEvent<HTMLSelectElement>) => {
        const nextDay = event.target.value ? Number(event.target.value) : '';
        setDay(nextDay);
        if (typeof year === 'number' && typeof month === 'number' && typeof nextDay === 'number') {
            emit(year, month, nextDay);
        } else {
            onChange('');
        }
    };

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '8px',
                width: '100%',
            }}
        >
            <select
                value={year === '' ? '' : String(year)}
                onChange={handleYearChange}
                className="form-input"
                style={{ padding: '10px', fontSize: '16px' }}
            >
                <option value="">年</option>
                {yearOptions.map((y) => (
                    <option key={y} value={y}>
                        {y}年
                    </option>
                ))}
            </select>
            <select
                value={month === '' ? '' : String(month)}
                onChange={handleMonthChange}
                className="form-input"
                style={{ padding: '10px', fontSize: '16px' }}
            >
                <option value="">月</option>
                {monthOptions.map((m) => (
                    <option key={m} value={m}>
                        {m}月
                    </option>
                ))}
            </select>
            <select
                value={day === '' ? '' : String(day)}
                onChange={handleDayChange}
                className="form-input"
                style={{ padding: '10px', fontSize: '16px' }}
            >
                <option value="">日</option>
                {dayOptions.map((d) => (
                    <option key={d} value={d}>
                        {d}日
                    </option>
                ))}
            </select>
        </div>
    );
}
