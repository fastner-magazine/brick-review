/**
 * Inventory Strategy
 *
 * 在庫管理用のFirestore検索戦略
 * - inventoriesMaster + variantsMaster を結合
 * - 在庫数量フィルタ
 * - カテゴリ/タイプフィルタ（文字列・配列両対応）
 * - 正規化テキスト検索
 */

import {
 collection,
 doc,
 getDocs,
 query,
 where,
 limit as firestoreLimit,
 type Firestore,
} from 'firebase/firestore';
import type {
 SearchStrategy,
 SearchResult,
 ProductsSelectorConfig,
 ProductOption,
} from '../types';
import { normalizeText } from '../normalize';

type TaxonomyCache = {
 categories: Map<string, string>;
 types: Map<string, string>;
};

export class InventoryStrategy implements SearchStrategy<ProductOption> {
 readonly name = 'Inventory';
 private db: Firestore | null;
 private config: Required<ProductsSelectorConfig>;
 private taxonomyCache: TaxonomyCache | null = null;

 constructor(db: Firestore | null, config: ProductsSelectorConfig) {
  this.db = db;
  this.config = {
   collections: config.collections,
   searchFields: config.searchFields,
   categoryField: config.categoryField || 'categories',
   typeField: config.typeField || 'types',
   joins: config.joins || [],
   maxResults: config.maxResults || 10,
  };
 }

 /**
  * タクソノミー（カテゴリ・タイプ）をキャッシュから取得
  */
 private async getTaxonomyCache(): Promise<TaxonomyCache> {
  if (this.taxonomyCache) {
   return this.taxonomyCache;
  }

  if (!this.db) {
   return { categories: new Map(), types: new Map() };
  }

  const cache: TaxonomyCache = {
   categories: new Map(),
   types: new Map(),
  };

  try {
   // カテゴリ取得
   const categoriesDoc = doc(this.db, 'taxonomies', 'categories');
   const categoriesSnap = await getDocs(collection(categoriesDoc, 'terms'));
   categoriesSnap.docs.forEach((d) => {
    const data = d.data();
    cache.categories.set(d.id, data.label || data.name || d.id);
   });

   // タイプ取得
   const typesDoc = doc(this.db, 'taxonomies', 'types');
   const typesSnap = await getDocs(collection(typesDoc, 'terms'));
   typesSnap.docs.forEach((d) => {
    const data = d.data();
    cache.types.set(d.id, data.label || data.name || d.id);
   });
  } catch (err) {
   console.error('[InventoryStrategy] タクソノミー取得エラー:', err);
  }

  this.taxonomyCache = cache;
  return cache;
 }

 /**
  * カテゴリフィルタ用クエリ（文字列・配列両対応）
  */
 private async fetchWithCategoryFilter(
  collectionName: string,
  categoryId: string,
  typeFilter?: string
 ): Promise<any[]> {
  if (!this.db) return [];

  const colRef = collection(this.db, collectionName);
  const constraints: any[] = [firestoreLimit(500)];

  // カテゴリが文字列の場合と配列の場合の2クエリを実行
  const qEq = query(colRef, where(this.config.categoryField, '==', categoryId), ...constraints);
  const qArr = query(colRef, where(this.config.categoryField, 'array-contains', categoryId), ...constraints);

  // タイプフィルタがあれば追加
  if (typeFilter) {
   constraints.push(where(this.config.typeField, '==', typeFilter));
  }

  const [snap1, snap2] = await Promise.all([getDocs(qEq), getDocs(qArr)]);

  // 重複を除去してマージ
  const map = new Map<string, any>();
  snap1.docs.forEach((d) => map.set(d.id, d));
  snap2.docs.forEach((d) => map.set(d.id, d));

  return Array.from(map.values());
 }

 /**
  * 検索実行
  */
 async search(
  searchText: string,
  filters?: Record<string, any>
 ): Promise<SearchResult<ProductOption>> {
  const startTime = Date.now();

  // 最小文字数チェック
  if (!searchText || searchText.length < 2) {
   return {
    items: [],
    total: 0,
    duration: Date.now() - startTime,
   };
  }

  if (!this.db) {
   console.warn('[InventoryStrategy] Firestore client not available');
   return {
    items: [],
    total: 0,
    duration: Date.now() - startTime,
   };
  }

  try {
   const categoryFilter = filters?.categoryId;
   const typeFilter = filters?.typeId;
   const stockFilter = filters?.stockFilter; // 'all' | 'in-stock' | 'out-of-stock'

   // タクソノミーキャッシュ取得
   const taxonomy = await this.getTaxonomyCache();

   // 各コレクションからデータ取得
   const allDocs = new Map<string, any>();

   for (const collectionName of this.config.collections) {
    let docs: any[] = [];

    if (categoryFilter) {
     // カテゴリフィルタあり
     docs = await this.fetchWithCategoryFilter(collectionName, categoryFilter, typeFilter);
    } else {
     // カテゴリフィルタなし
     const constraints: any[] = [firestoreLimit(500)];
     if (typeFilter) {
      constraints.push(where(this.config.typeField, '==', typeFilter));
     }
     const colRef = collection(this.db, collectionName);
     const snapshot = await getDocs(query(colRef, ...constraints));
     docs = snapshot.docs;
    }

    // コレクション名をキーに格納（join用）
    docs.forEach((d) => {
     const key = `${collectionName}:${d.id}`;
     allDocs.set(key, { doc: d, source: collectionName });
    });
   }

   // Join処理: inventoriesMaster.variant_id = variantsMaster.id
   const joinedMap = new Map<string, any>();

   allDocs.forEach((item) => {
    const data = item.doc.data();
    const source = item.source;

    if (source === 'inventoriesMaster' && data.variant_id) {
     // inventoriesMaster優先でマップに追加（在庫情報含む）
     joinedMap.set(data.variant_id, { doc: item.doc, source: 'inventoriesMaster', inventory: data });
    } else if (source === 'variantsMaster') {
     // variantsMasterは既存がなければ追加
     if (!joinedMap.has(item.doc.id)) {
      joinedMap.set(item.doc.id, { doc: item.doc, source: 'variantsMaster', inventory: null });
     }
    } else {
     // その他のコレクション
     joinedMap.set(item.doc.id, item);
    }
   });

   // 正規化検索
   const normalizedSearch = normalizeText(searchText, {
    toHalfWidth: true,
    toLowerCase: true,
    removeSymbols: true,
   });

   // フィルタ・変換・ソート
   let suggestions: ProductOption[] = Array.from(joinedMap.values())
    .map((item) => {
     const data = item.doc.data();
     const inventory = item.inventory;
     const productName = data.product_name || data.productName || '';

     // カテゴリデータ（文字列または配列）
     const categoryData = data.category
      ? [data.category]
      : typeof data.categories === 'string'
       ? [data.categories]
       : data.categories || [];

     // タイプデータ
     const typeData = typeof data.types === 'string' ? [data.types] : data.types || [];

     return {
      id: item.doc.id,
      productName,
      categories: categoryData,
      types: typeData,
      categoryLabels: categoryData.map((cid: string) => taxonomy.categories.get(cid) || cid),
      typeLabels: typeData.map((tid: string) => taxonomy.types.get(tid) || tid),
      w: typeof data.w === 'number' ? data.w : undefined,
      d: typeof data.d === 'number' ? data.d : undefined,
      h: typeof data.h === 'number' ? data.h : undefined,
      unitWeightKg:
       typeof data.unitWeightKg === 'number'
        ? data.unitWeightKg
        : typeof data.unit_weight_kg === 'number'
         ? data.unit_weight_kg
         : undefined,
      availableStock: inventory ? (typeof inventory.available === 'number' ? inventory.available : 0) : 0,
      variantGroupId: data.variant_group_id || data.variantGroupIdRef || undefined,
     } as ProductOption;
    })
    .filter((p) => {
     const normalizedProductName = normalizeText(p.productName, {
      toHalfWidth: true,
      toLowerCase: true,
      removeSymbols: true,
     });
     return normalizedProductName.includes(normalizedSearch);
    });

   // 在庫フィルタ適用
   if (stockFilter === 'in-stock') {
    suggestions = suggestions.filter((p) => (p.availableStock || 0) > 0);
   } else if (stockFilter === 'out-of-stock') {
    suggestions = suggestions.filter((p) => (p.availableStock || 0) === 0);
   }

   // 在庫数量でソート（多い順）
   suggestions = suggestions
    .sort((a, b) => {
     const aStock = a.availableStock || 0;
     const bStock = b.availableStock || 0;

     if (aStock !== bStock) {
      return bStock - aStock;
     }

     return a.productName.localeCompare(b.productName, 'ja');
    })
    .slice(0, this.config.maxResults);

   return {
    items: suggestions,
    total: suggestions.length,
    duration: Date.now() - startTime,
   };
  } catch (err) {
   console.error('[InventoryStrategy] 検索エラー:', err);
   return {
    items: [],
    total: 0,
    duration: Date.now() - startTime,
   };
  }
 }
}
