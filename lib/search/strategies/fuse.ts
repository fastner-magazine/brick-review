/**
 * Fuse.js検索戦略
 * ローカルデータのあいまい検索用
 */

import Fuse from 'fuse.js';
import type {
 SearchStrategy,
 SearchResult,
 SearchOptions,
 FuseSearchConfig,
} from '../types';

export class FuseSearchStrategy<T = any> implements SearchStrategy<T> {
 readonly name = 'FuseSearch';
 private fuse: Fuse<T> | null = null;
 private data: T[] = [];

 constructor(
  private readonly config: FuseSearchConfig,
  initialData?: T[]
 ) {
  if (initialData) {
   this.initialize(initialData);
  }
 }

 async initialize(data: T[]): Promise<void> {
  this.data = data;
  this.fuse = new Fuse(data, {
   keys: this.config.keys,
   threshold: this.config.threshold ?? 0.3,
   distance: this.config.distance ?? 100,
   minMatchCharLength: this.config.minMatchCharLength ?? 2,
   includeScore: true,
   useExtendedSearch: true,
  });
 }

 async search(
  query: string,
  filters?: Record<string, any>,
  options?: SearchOptions
 ): Promise<SearchResult<T>> {
  const startTime = performance.now();

  if (!this.fuse) {
   throw new Error('FuseSearchStrategy not initialized. Call initialize() first.');
  }

  let items: T[];

  // テキスト検索
  if (query && query.trim()) {
   const results = this.fuse.search(query.trim());
   items = results.map((r) => r.item);
  } else {
   items = [...this.data];
  }

  // フィルタを適用（クライアントサイド）
  if (filters) {
   items = items.filter((item: any) => {
    return Object.entries(filters).every(([key, value]) => {
     if (value === undefined || value === 'all' || value === '') return true;
     return item[key] === value;
    });
   });
  }

  // ソート
  if (options?.sort) {
   const { field, order } = options.sort;
   items.sort((a: any, b: any) => {
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
    keys: this.config.keys,
    threshold: this.config.threshold,
   },
  };
 }
}
