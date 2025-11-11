// Pure utility functions used across the inventory variants feature

export function formatNumber(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value as any)) return '—';
    return value.toLocaleString('ja-JP');
}

export function uniqueList(values: (string | undefined | null)[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    values.forEach((raw) => {
        const trimmed = (raw ?? '').trim();
        if (!trimmed || seen.has(trimmed)) return;
        seen.add(trimmed);
        result.push(trimmed);
    });
    return result;
}

export function tokenize(raw: string, separators: RegExp): string[] {
    if (!raw) return [];
    return uniqueList(
        raw
            .split(separators)
            .map((item) => item.trim())
            .filter(Boolean),
    );
}

export const parseTypesInput = (value: string) => tokenize(value, /[,\n/|、]+/);
export const parseDamagesInput = (value: string) => tokenize(value, /[,\n|／／、]+/);
export const parseSealingInput = (value: string) => tokenize(value, /[,\n/|、]+/);
export const parseStatusTokens = (value: string) => tokenize(value, /[,\n/|、]+/);

export function listsEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    // Sort both arrays to compare content regardless of order
    const sortedA = [...a].sort((x, y) => x.localeCompare(y, 'ja'));
    const sortedB = [...b].sort((x, y) => x.localeCompare(y, 'ja'));
    return sortedA.every((value, index) => value === sortedB[index]);
}

export function numberFromInput(value: string | number | null | undefined): number | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    const trimmed = (value ?? '').trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
}
