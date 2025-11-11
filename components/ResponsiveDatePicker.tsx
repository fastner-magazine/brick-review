import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';

type ResponsiveDatePickerProps = {
    value?: string;
    onChange: (value: string) => void;
    minDate?: string;
    maxDate?: string;
    required?: boolean;
};

type DateParts = {
    year: number;
    month: number;
    day: number;
};

function pad2(input: number) {
    return input.toString().padStart(2, '0');
}

function parseIsoDate(input?: string): Date | null {
    if (!input) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return null;
    }
    return date;
}

function toIsoDate({ year, month, day }: DateParts) {
    return `${year}-${pad2(month)}-${pad2(day)}`;
}

function clampDate(target: Date, min: Date, max: Date) {
    if (target < min) return new Date(min);
    if (target > max) return new Date(max);
    return target;
}

function getDaysInMonth(year: number, month: number) {
    return new Date(year, month, 0).getDate();
}

export default function ResponsiveDatePicker({
    value,
    onChange,
    minDate,
    maxDate,
    required,
}: ResponsiveDatePickerProps) {
    const resolvedMin = useMemo(() => {
        const parsed = parseIsoDate(minDate);
        if (parsed) return parsed;
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), today.getDate());
    }, [minDate]);

    const resolvedMax = useMemo(() => {
        const parsed = parseIsoDate(maxDate);
        if (parsed) return parsed;
        const base = new Date(resolvedMin);
        base.setFullYear(base.getFullYear() + 1);
        base.setMonth(11);
        base.setDate(31);
        return base;
    }, [maxDate, resolvedMin]);

    const [parts, setParts] = useState<DateParts>(() => {
        const parsedValue = parseIsoDate(value);
        const start = parsedValue ? clampDate(parsedValue, resolvedMin, resolvedMax) : resolvedMin;
        return {
            year: start.getFullYear(),
            month: start.getMonth() + 1,
            day: start.getDate(),
        };
    });

    useEffect(() => {
        const parsedValue = parseIsoDate(value);
        const next = parsedValue ? clampDate(parsedValue, resolvedMin, resolvedMax) : resolvedMin;
        const nextParts: DateParts = {
            year: next.getFullYear(),
            month: next.getMonth() + 1,
            day: next.getDate(),
        };
        setParts(current => {
            if (
                current.year === nextParts.year &&
                current.month === nextParts.month &&
                current.day === nextParts.day
            ) {
                return current;
            }
            return nextParts;
        });
    }, [value, resolvedMin, resolvedMax]);

    const minYear = resolvedMin.getFullYear();
    const maxYear = resolvedMax.getFullYear();

    const availableYears = useMemo(() => {
        const years: number[] = [];
        for (let year = minYear; year <= maxYear; year += 1) {
            years.push(year);
        }
        return years;
    }, [minYear, maxYear]);

    const availableMonths = useMemo(() => {
        const months: number[] = [];
        const startMonth = parts.year === minYear ? resolvedMin.getMonth() + 1 : 1;
        const endMonth = parts.year === maxYear ? resolvedMax.getMonth() + 1 : 12;
        for (let month = startMonth; month <= endMonth; month += 1) {
            months.push(month);
        }
        return months;
    }, [parts.year, minYear, maxYear, resolvedMin, resolvedMax]);

    const availableDays = useMemo(() => {
        const days: number[] = [];
        const daysInMonth = getDaysInMonth(parts.year, parts.month);
        let startDay = 1;
        let endDay = daysInMonth;
        if (parts.year === minYear && parts.month === resolvedMin.getMonth() + 1) {
            startDay = resolvedMin.getDate();
        }
        if (parts.year === maxYear && parts.month === resolvedMax.getMonth() + 1) {
            endDay = resolvedMax.getDate();
        }
        for (let day = startDay; day <= endDay; day += 1) {
            if (day > 0 && day <= daysInMonth) {
                days.push(day);
            }
        }
        return days;
    }, [parts.year, parts.month, minYear, maxYear, resolvedMin, resolvedMax]);

    const emitChange = useCallback((next: DateParts) => {
        const iso = toIsoDate(next);
        onChange(iso);
    }, [onChange]);

    const handleYearChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
        const nextYear = Number(event.target.value);
        const monthsForYear = (() => {
            const months: number[] = [];
            const startMonth = nextYear === minYear ? resolvedMin.getMonth() + 1 : 1;
            const endMonth = nextYear === maxYear ? resolvedMax.getMonth() + 1 : 12;
            for (let month = startMonth; month <= endMonth; month += 1) {
                months.push(month);
            }
            return months;
        })();
        if (monthsForYear.length === 0) {
            return;
        }
        let nextMonth = monthsForYear.includes(parts.month) ? parts.month : monthsForYear[0];
        const daysInMonth = getDaysInMonth(nextYear, nextMonth);
        let startDay = 1;
        let endDay = daysInMonth;
        if (nextYear === minYear && nextMonth === resolvedMin.getMonth() + 1) {
            startDay = resolvedMin.getDate();
        }
        if (nextYear === maxYear && nextMonth === resolvedMax.getMonth() + 1) {
            endDay = resolvedMax.getDate();
        }
        let nextDay = parts.day;
        if (nextDay < startDay || nextDay > endDay) {
            nextDay = startDay;
        }
        setParts({ year: nextYear, month: nextMonth, day: nextDay });
        emitChange({ year: nextYear, month: nextMonth, day: nextDay });
    }, [parts.month, parts.day, emitChange, minYear, maxYear, resolvedMin, resolvedMax]);

    const handleMonthChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
        const nextMonth = Number(event.target.value);
        const daysInMonth = getDaysInMonth(parts.year, nextMonth);
        let startDay = 1;
        let endDay = daysInMonth;
        if (parts.year === minYear && nextMonth === resolvedMin.getMonth() + 1) {
            startDay = resolvedMin.getDate();
        }
        if (parts.year === maxYear && nextMonth === resolvedMax.getMonth() + 1) {
            endDay = resolvedMax.getDate();
        }
        let nextDay = parts.day;
        if (nextDay < startDay || nextDay > endDay) {
            nextDay = startDay;
        }
        setParts({ year: parts.year, month: nextMonth, day: nextDay });
        emitChange({ year: parts.year, month: nextMonth, day: nextDay });
    }, [parts.year, parts.day, emitChange, minYear, maxYear, resolvedMin, resolvedMax]);

    const handleDayChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
        const nextDay = Number(event.target.value);
        setParts({ year: parts.year, month: parts.month, day: nextDay });
        emitChange({ year: parts.year, month: parts.month, day: nextDay });
    }, [parts.year, parts.month, emitChange]);

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
            <select
                value={parts.year}
                onChange={handleYearChange}
                required={required}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '0.95rem' }}
            >
                {availableYears.map(year => (
                    <option key={year} value={year}>
                        {year}
                    </option>
                ))}
            </select>
            <select
                value={parts.month}
                onChange={handleMonthChange}
                required={required}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '0.95rem' }}
            >
                {availableMonths.map(month => (
                    <option key={month} value={month}>
                        {month}
                    </option>
                ))}
            </select>
            <select
                value={parts.day}
                onChange={handleDayChange}
                required={required}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '0.95rem' }}
            >
                {availableDays.map(day => (
                    <option key={day} value={day}>
                        {day}
                    </option>
                ))}
            </select>
        </div>
    );
}
