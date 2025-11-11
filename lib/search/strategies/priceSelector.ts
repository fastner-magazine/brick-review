/**
 * PriceSelector Strategy
 *
 * 買取価格検索用のFirestore検索戦略
 * - buypricesMaster + variantsMaster を結合
 * - 買取価格優先ソート
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
 PriceSelectorConfig,
 PriceOption,
} from '../types';
import { normalizeText } from '../normalize';

type TaxonomyCache = {
 categories: Map<string, string>;
 types: Map<string, string>;
 sealings: Map<string, string>;
};

export class PriceSelectorStrategy implements SearchStrategy<PriceOption> {
 readonly name = 'PriceSelector';
 private db: Firestore | null;
 private config: Required<PriceSelectorConfig>;
 private taxonomyCache: TaxonomyCache | null = null;

 constructor(db: Firestore | null, config: PriceSelectorConfig) {
  this.db = db;
  this.config = {
   collections: config.collections,
   searchFields: config.searchFields,
   categoryField: config.categoryField || 'categories',
   typeField: config.typeField || 'types',
   priceField: config.priceField || 'price', // buypricesMasterでは'price'を使用
   joins: config.joins || [],
   maxResults: config.maxResults || 10,
  };
 }

 /**
  * タクソノミー（カテゴリ・タイプ・封入数）をキャッシュから取得
  */
 private async getTaxonomyCache(): Promise<TaxonomyCache> {
  if (this.taxonomyCache) {
   return this.taxonomyCache;
  }

  if (!this.db) {
   return { categories: new Map(), types: new Map(), sealings: new Map() };
  }

  const cache: TaxonomyCache = {
   categories: new Map(),
   types: new Map(),
   sealings: new Map(),
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

   // 封入数取得
   const sealingsDoc = doc(this.db, 'taxonomies', 'sealing');
   const sealingsSnap = await getDocs(collection(sealingsDoc, 'terms'));
   console.log('[PriceSelectorStrategy] Sealing docs fetched:', sealingsSnap.docs.length);
   sealingsSnap.docs.forEach((d) => {
    const data = d.data();
    const label = data.label || data.name || d.id;
    cache.sealings.set(d.id, label);
    console.log('[PriceSelectorStrategy] Sealing taxonomy loaded:', d.id, '→', label);
   });
  } catch (err) {
   console.error('[PriceSelectorStrategy] タクソノミー取得エラー:', err);
  }

  console.log('[PriceSelectorStrategy] Taxonomy cache loaded:', {
   categories: cache.categories.size,
   types: cache.types.size,
   sealings: cache.sealings.size,
  });

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
 ): Promise<SearchResult<PriceOption>> {
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
   console.warn('[PriceSelectorStrategy] Firestore client not available');
   return {
    items: [],
    total: 0,
    duration: Date.now() - startTime,
   };
  }

  try {
   const categoryFilter = filters?.categoryId;
   const typeFilter = filters?.typeId;

   // console.log('[PriceSelectorStrategy] Search params:', { searchText, categoryFilter, typeFilter });

   // タクソノミーキャッシュ取得
   const taxonomy = await this.getTaxonomyCache();   // 各コレクションからデータ取得
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

   // console.log('[PriceSelectorStrategy] Total docs fetched:', allDocs.size);

   // 正規化検索テキスト
   const normalizedSearch = normalizeText(searchText, {
    toHalfWidth: true,
    toLowerCase: true,
    removeSymbols: true,
   });

   // console.log('[PriceSelectorStrategy] Normalized search:', normalizedSearch);

   // フィルタ・変換・ソート（buypricesMaster単独検索、Join不要）
   const suggestions: PriceOption[] = Array.from(allDocs.values())
    .map((item) => {
     const data = item.doc.data();

     // productNameを安全に取得（必ず文字列にする）
     let productName = '';
     if (typeof data.product_name === 'string') {
      productName = data.product_name;
     } else if (typeof data.productName === 'string') {
      productName = data.productName;
     }

     // console.log('[PriceSelectorStrategy] Mapped item:', {
     //  id: item.doc.id,
     //  productName,
     //  productNameType: typeof productName,
     //  raw_product_name: data.product_name,
     //  raw_productName: data.productName
     // });

     // カテゴリデータ（文字列または配列）
     const categoryData = data.categoryId
      ? [data.categoryId]
      : data.category
       ? [data.category]
       : typeof data.categories === 'string'
        ? [data.categories]
        : data.categories || [];

     // タイプデータ（単数・複数・別名フィールドに対応）
     const collectStringValues = (value: unknown): string[] => {
      if (Array.isArray(value)) {
       return value
        .map((v) => (typeof v === 'string' ? v : String(v ?? '')).trim())
        .filter(Boolean);
      }
      if (value === undefined || value === null) return [];
      const str = typeof value === 'string' ? value : String(value);
      const trimmed = str.trim();
      return trimmed ? [trimmed] : [];
     };

     const typeIdSet = new Set<string>();
     const typeLabelSet = new Set<string>();

     const addTypeIds = (source: unknown) => {
      collectStringValues(source).forEach((entry) => typeIdSet.add(entry));
     };

     const addTypeLabels = (source: unknown) => {
      collectStringValues(source).forEach((entry) => typeLabelSet.add(entry));
     };

     addTypeIds(data.types);
     addTypeIds(data.type);
     addTypeIds(data.typeId);
     addTypeIds(data.type_id);
     addTypeIds(data.typeIds);
     addTypeIds(data.variantTypes);
     addTypeIds(data.variant_types);
     addTypeIds(data.variant_type);

     addTypeLabels(data.typeLabels);
     addTypeLabels(data.typeLabel);
     addTypeLabels(data.type_label);
     addTypeLabels(data.typeDisplayName);
     addTypeLabels(data.type_display_name);

     const typeData = Array.from(typeIdSet);
     const combinedTypeLabels = new Set<string>();
     typeData.forEach((tid) => {
      const label = taxonomy.types.get(tid) || tid;
      combinedTypeLabels.add(label);
     });
     typeLabelSet.forEach((label) => combinedTypeLabels.add(label));
     const typeLabels = Array.from(combinedTypeLabels);

     // 封入数データ（単数・複数・別名フィールドに対応）
     const sealingIdSet = new Set<string>();
     const sealingLabelSet = new Set<string>();

     const addSealingIds = (source: unknown) => {
      collectStringValues(source).forEach((entry) => sealingIdSet.add(entry));
     };

     const addSealingLabels = (source: unknown) => {
      collectStringValues(source).forEach((entry) => sealingLabelSet.add(entry));
     };

     addSealingIds(data.sealings);
     addSealingIds(data.sealing);
     addSealingIds(data.sealingId);
     addSealingIds(data.sealing_id);
     addSealingIds(data.sealingIds);
     addSealingIds(data.variantSealings);
     addSealingIds(data.variant_sealings);
     addSealingIds(data.variant_sealing);

     addSealingLabels(data.sealingLabels);
     addSealingLabels(data.sealingLabel);
     addSealingLabels(data.sealing_label);
     addSealingLabels(data.sealingDisplayName);
     addSealingLabels(data.sealing_display_name);

  const sealingData = Array.from(sealingIdSet);
  const combinedSealingLabels = new Set<string>();
  // Build reverse lookup: label (normalized) -> id
  const sealingLabelToId = new Map<string, string>();
  taxonomy.sealings.forEach((label, id) => {
   if (typeof label === 'string' && label.trim()) {
    sealingLabelToId.set(label.trim().toLowerCase(), id);
   }
  });

  const mapSealingValueToLabel = (value: string) => {
   const str = String(value || '').trim();
   if (!str) return str;
   // If the value is an ID that exists in taxonomy, return the mapped label
   if (taxonomy.sealings.has(str)) {
    return taxonomy.sealings.get(str) || str;
   }
   // If the value seems like a label, find its ID and then label (to apply normalization and keep consistent label text)
   const idFromLabel = sealingLabelToId.get(str.toLowerCase());
   if (idFromLabel && taxonomy.sealings.has(idFromLabel)) {
    return taxonomy.sealings.get(idFromLabel) || str;
   }
   // Fallback: return original value
   return str;
  };

  sealingData.forEach((sid) => {
   const label = mapSealingValueToLabel(sid);
   // console.log('[PriceSelectorStrategy] Sealing ID mapping:', sid, '→', label, 'from cache:', taxonomy.sealings.has(sid));
   combinedSealingLabels.add(label);
  });
  // sealingLabelSet may contain either raw labels or IDs; attempt to map values to taxonomy labels
  sealingLabelSet.forEach((raw) => {
   const mapped = mapSealingValueToLabel(String(raw));
   // console.log('[PriceSelectorStrategy] Sealing raw label mapping:', raw, '→', mapped, 'from cache:', taxonomy.sealings.has(raw) || sealingLabelToId.has(String(raw).trim().toLowerCase()));
   combinedSealingLabels.add(mapped);
  });
     const sealingLabels = Array.from(combinedSealingLabels);

     return {
      id: item.doc.id,
      productName: String(productName || ''), // String()で確実に文字列化
      categories: categoryData,
      types: typeData.length > 0 ? typeData : undefined,
      sealings: sealingData.length > 0 ? sealingData : undefined,
      categoryLabels: categoryData.map((cid: string) => taxonomy.categories.get(cid) || cid),
      typeLabels: typeLabels.length > 0 ? typeLabels : undefined,
      sealingLabels: sealingLabels.length > 0 ? sealingLabels : undefined,
      w: typeof data.w === 'number' ? data.w : undefined,
      d: typeof data.d === 'number' ? data.d : undefined,
      h: typeof data.h === 'number' ? data.h : undefined,
      unitWeightKg:
       typeof data.unitWeightKg === 'number'
        ? data.unitWeightKg
        : typeof data.unit_weight_kg === 'number'
         ? data.unit_weight_kg
         : undefined,
      buyPrice: typeof data.price === 'number' ? data.price :
                (typeof data.buy_price === 'number' ? data.buy_price : null),
      variantGroupId: data.variantIdRef || data.variant_group_id || undefined,
     } as PriceOption;
    })
    .filter((p) => {
     // 商品名が空の場合はスキップ
     if (!p.productName || typeof p.productName !== 'string' || p.productName.trim() === '') {
      // console.log('[PriceSelectorStrategy] Skipping empty product:', p.id);
      return false;
     }

     try {
      // console.log('[PriceSelectorStrategy] About to normalize:', {
      //  productName: p.productName,
      //  type: typeof p.productName,
      //  constructor: p.productName.constructor?.name
      // });

      const normalizedProductName = normalizeText(p.productName, {
       toHalfWidth: true,
       toLowerCase: true,
       removeSymbols: true,
      });

      // console.log('[PriceSelectorStrategy] Normalized result:', normalizedProductName);

      const matches = normalizedProductName.includes(normalizedSearch);

      // if (matches) {
      //  console.log('[PriceSelectorStrategy] Match found:', { productName: p.productName, buyPrice: p.buyPrice });
      // }

      return matches;
     } catch (err) {
      console.error('[PriceSelectorStrategy] Filter error:', err, 'product:', p);
      return false;
     }
    })
    .sort((a, b) => {
     // 買取価格優先ソート
     const aHasPrice = a.buyPrice !== null && a.buyPrice !== undefined;
     const bHasPrice = b.buyPrice !== null && b.buyPrice !== undefined;

     if (aHasPrice && !bHasPrice) return -1;
     if (!aHasPrice && bHasPrice) return 1;

     if (aHasPrice && bHasPrice) {
      return (b.buyPrice || 0) - (a.buyPrice || 0);
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
   console.error('[PriceSelectorStrategy] 検索エラー:', err);
   return {
    items: [],
    total: 0,
    duration: Date.now() - startTime,
   };
  }
 }
}
