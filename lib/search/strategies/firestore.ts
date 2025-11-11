/**
 * Firestore検索戦略
 * 複数フィールドの前方一致検索をサポート
 */

import type {
 SearchStrategy,
 SearchResult,
 SearchOptions,
 FirestoreSearchConfig,
} from '../types';
import { normalizeText, getPrefixSearchRange } from '../normalize';

export class FirestoreSearchStrategy<T = any> implements SearchStrategy<T> {
 readonly name = 'FirestoreSearch';

 constructor(
  private readonly db: any, // Firestore instance
  private readonly config: FirestoreSearchConfig
 ) { }

 async search(
  query: string,
  filters?: Record<string, any>,
  options?: SearchOptions
 ): Promise<SearchResult<T>> {
  const startTime = performance.now();

  let baseQuery = this.db.collection(this.config.collectionName);

  // フィルタを適用
  if (filters && this.config.filterFields) {
   for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === 'all' || value === '') continue;

    const fieldConfig = this.config.filterFields[key];
    if (!fieldConfig) continue;

    baseQuery = baseQuery.where(key, fieldConfig.operator, value);
   }
  }

  // テキスト検索（複数フィールドのOR検索）
  const allDocs = new Map<string, any>();

  if (query && query.trim()) {
   const normalized = normalizeText(query.trim());
   const { start, end } = getPrefixSearchRange(normalized);

   // 並列でフィールド検索
   const searchQueries = this.config.searchFields.map((field) =>
    baseQuery
     .where(field, '>=', start)
     .where(field, '<=', end)
     .get()
     .catch(() => ({ docs: [], size: 0 }))
   );

   const results = await Promise.all(searchQueries);

   // 重複除去してマージ
   results.forEach((snapshot) => {
    snapshot.docs.forEach((doc: any) => {
     if (!allDocs.has(doc.id)) {
      allDocs.set(doc.id, { id: doc.id, ...doc.data() });
     }
    });
   });
  } else {
   // 検索クエリなしの場合は全件取得
   const snapshot = await baseQuery.get();
   snapshot.docs.forEach((doc: any) => {
    allDocs.set(doc.id, { id: doc.id, ...doc.data() });
   });
  }

  let items = Array.from(allDocs.values());

  // ソート
  if (options?.sort) {
   const { field, order } = options.sort;
   items.sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    if (aVal < bVal) return order === 'asc' ? -1 : 1;
    if (aVal > bVal) return order === 'asc' ? 1 : -1;
    return 0;
   });
  }

  const total = items.length;

  // ページング
  if (options?.pagination && options.pagination.size !== 'all') {
   const { page, size } = options.pagination;
   const start = (page - 1) * size;
   items = items.slice(start, start + size);
  }

  const duration = performance.now() - startTime;

  return {
   items,
   total,
   duration,
   metadata: {
    searchFields: this.config.searchFields,
    normalizedQuery: query ? normalizeText(query.trim()) : '',
   },
  };
 }
}
