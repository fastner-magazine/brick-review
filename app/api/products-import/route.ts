import { NextRequest } from 'next/server';
import { getAdmin } from '@/lib/firebase-admin';

type FirestoreDoc = {
  id: string;
  data: Record<string, any>;
};

function removeUndefined<T>(input: T): T {
  if (input === null || input === undefined) return input as T;
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) return (input.map((v) => removeUndefined(v)) as unknown) as T;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(input as Record<string, any>)) {
    if (v === undefined) continue;
    if (v === null) {
      out[k] = null;
      continue;
    }
    if (typeof v === 'object') {
      out[k] = removeUndefined(v);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

async function commitInBatches(collectionPath: string, docs: FirestoreDoc[]) {
  const admin = getAdmin();
  const db = admin.firestore();

  // Use smaller batch size than 500 for safety
  const BATCH_SIZE = 450;
  const RETRYABLE = new Set(['aborted', 'deadline-exceeded', 'unavailable']);

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const slice = docs.slice(i, i + BATCH_SIZE);
    let attempt = 0;
    // Exponential backoff up to ~5 attempts
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const batch = db.batch();
        for (const d of slice) {
          const ref = db.collection(collectionPath).doc(d.id);
          const payload = removeUndefined(d.data);
          batch.set(ref, payload, { merge: true });
        }
        await batch.commit();
        break;
      } catch (err: any) {
        const code: string | undefined = err?.code || err?.code?.toString?.();
        if (code && RETRYABLE.has(code.toLowerCase()) && attempt < 5) {
          const delay = Math.min(16000, 500 * Math.pow(2, attempt));
          await new Promise((r) => setTimeout(r, delay));
          attempt += 1;
          continue;
        }
        throw err;
      }
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const docs = (body?.docs ?? []) as FirestoreDoc[];
    const collectionPath = (body?.collectionPath as string) || 'products';
    if (!Array.isArray(docs) || docs.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'No docs provided' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    // quick validation
    for (const d of docs) {
      if (!d?.id || typeof d.id !== 'string') {
        return new Response(JSON.stringify({ ok: false, error: 'Each doc requires string id' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof d.data !== 'object' || d.data == null) {
        return new Response(JSON.stringify({ ok: false, error: 'Each doc requires data object' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }
    }

    await commitInBatches(collectionPath, docs);

    return new Response(JSON.stringify({ ok: true, count: docs.length }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.error('products-import POST failed:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || 'Unknown error' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';

type CsvRow = Record<string, string>;

type TaxonomyTerm = {
  id: string;
  label: string;
};

type ParsedCsv = {
  headers: string[];
  rows: CsvRow[];
};

function parseCsv(text: string): ParsedCsv {
  const headers: string[] = [];
  const rows: CsvRow[] = [];

  let currentField = '';
  const currentRow: string[] = [];
  let insideQuotes = false;
  let isFirstRow = true;

  const pushField = () => {
    currentRow.push(currentField);
    currentField = '';
  };

  const pushRow = () => {
    pushField();
    if (isFirstRow) {
      headers.push(...currentRow);
      isFirstRow = false;
    } else {
      const row: CsvRow = {};
      for (let i = 0; i < headers.length; i += 1) {
        row[headers[i]] = currentRow[i] ?? '';
      }
      rows.push(row);
    }
    currentRow.length = 0;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      pushField();
    } else if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }
      pushRow();
    } else {
      currentField += char;
    }
  }

  if (insideQuotes) {
    throw new Error('CSV parsing error: unmatched quote detected.');
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    pushRow();
  }

  return { headers, rows };
}

function mapTaxonomyTerms(collection?: Record<string, any>): TaxonomyTerm[] {
  if (!collection) return [];
  return Object.entries(collection).map(([id, value]) => ({
    id,
    label: value?.label ?? id,
  }));
}

export async function GET() {
  try {
    const csvPath = join(process.cwd(), 'normalization', 'output', 'export_complete.csv');
    const taxonomyPath = join(process.cwd(), 'normalization', 'output', 'taxonomies.json');

    const [csvContent, taxonomyContent] = await Promise.all([
      fs.readFile(csvPath, 'utf-8'),
      fs.readFile(taxonomyPath, 'utf-8'),
    ]);

    const parsedCsv = parseCsv(csvContent);
    const taxonomiesJson = JSON.parse(taxonomyContent);

    const conditionTerms = mapTaxonomyTerms(
      taxonomiesJson?.documents?.condition?._subcollections?.term,
    );
    const damageTerms = mapTaxonomyTerms(
      taxonomiesJson?.documents?.damages?._subcollections?.terms,
    );

    const products = parsedCsv.rows.map((row) => {
      const parseTermPayload = (raw: string | undefined) => {
        if (!raw) return [];
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      };

      const expandIds = (raw: string | undefined) => {
        if (!raw) return [];
        return raw
          .split('|')
          .map((token) => token.trim())
          .filter((token) => token.length > 0);
      };

      return {
        ...row,
        condition_terms: parseTermPayload(row.condition_terms),
        damage_terms: parseTermPayload(row.damage_terms),
        condition_term_ids_list: expandIds(row.condition_term_ids),
        damage_term_ids_list: expandIds(row.damage_term_ids),
      };
    });

    return NextResponse.json({
      products,
      taxonomies: {
        condition: conditionTerms,
        damages: damageTerms,
      },
    });
  } catch (error) {
    console.error('[products-import] Failed to read data:', error);
    return NextResponse.json(
      { error: 'Failed to load source data. Please ensure export_complete.csv and taxonomies.json exist.' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
