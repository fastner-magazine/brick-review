/**
 * Products Strategy
 *
 * 商品情報検索用のFirestore検索戦略
 * - inventoriesMaster + variantsMaster + productsMaster を結合
 * - 商品情報重視（在庫・詳細情報）
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

export class ProductsStrategy implements SearchStrategy<ProductOption> {
 readonly name = 'Products';
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
   console.error('[ProductsStrategy] タクソノミー取得エラー:', err);
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
   console.warn('[ProductsStrategy] Firestore client not available');
   return {
    items: [],
    total: 0,
    duration: Date.now() - startTime,
   };
  }

  try {
   const categoryFilter = filters?.categoryId;
   const typeFilter = filters?.typeId;

   console.log('[ProductsStrategy] Search params:', { searchText, categoryFilter, typeFilter });

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

    console.log(`[ProductsStrategy] ${collectionName}: ${docs.length} docs fetched`);

    // コレクション名をキーに格納（join用）
    docs.forEach((d) => {
     const key = `${collectionName}:${d.id}`;
     allDocs.set(key, { doc: d, source: collectionName });
    });
   }

   // Join処理: 
   // - inventoriesMaster.variant_id = variantsMaster.id
   // - variantsMaster.variantGroupIdRef = productsMaster.id
   const joinedMap = new Map<
    string,
    {
     variant: any;
     inventory: any | null;
     product: any | null;
    }
   >();

   // まずvariantsMasterを基準に
   allDocs.forEach((item) => {
    if (item.source === 'variantsMaster') {
     const variantId = item.doc.id;
     if (!joinedMap.has(variantId)) {
      joinedMap.set(variantId, {
       variant: item.doc,
       inventory: null,
       product: null,
      });
     }
    }
   });

   // inventoriesMasterをjoin
   allDocs.forEach((item) => {
    if (item.source === 'inventoriesMaster') {
     const data = item.doc.data();
     const variantId = data.variant_id;
     if (variantId && joinedMap.has(variantId)) {
      joinedMap.get(variantId)!.inventory = item.doc;
     }
    }
   });

   // productsMasterをjoin
   allDocs.forEach((item) => {
    if (item.source === 'productsMaster') {
     const productId = item.doc.id;
     // variantGroupIdRefがこのproductIdと一致するvariantを探す
     joinedMap.forEach((joined) => {
      const variantData = joined.variant.data();
      if (variantData.variantGroupIdRef === productId) {
       joined.product = item.doc;
      }
     });
    }
   });

   // 正規化検索
   const normalizedSearch = normalizeText(searchText, {
    toHalfWidth: true,
    toLowerCase: true,
    removeSymbols: true,
   });

   console.log('[ProductsStrategy] Normalized search text:', normalizedSearch);
   console.log('[ProductsStrategy] Joined records:', joinedMap.size);

   // フィルタ・変換・ソート
   const suggestions: ProductOption[] = Array.from(joinedMap.values())
    .map((joined) => {
     const variantData = joined.variant.data();
     const inventoryData = joined.inventory?.data();
     const productData = joined.product?.data();

     const productName = productData?.product_name || variantData.productName || variantData.product_name || '';

     // カテゴリデータ（文字列または配列）
     const categoryData = variantData.category
      ? [variantData.category]
      : typeof variantData.categories === 'string'
       ? [variantData.categories]
       : variantData.categories || [];

     // タイプデータ
     const typeData = typeof variantData.types === 'string' ? [variantData.types] : variantData.types || [];

     return {
      id: joined.variant.id,
      productName,
      categories: categoryData,
      types: typeData,
      categoryLabels: categoryData.map((cid: string) => taxonomy.categories.get(cid) || cid),
      typeLabels: typeData.map((tid: string) => taxonomy.types.get(tid) || tid),
      w: typeof variantData.w === 'number' ? variantData.w : undefined,
      d: typeof variantData.d === 'number' ? variantData.d : undefined,
      h: typeof variantData.h === 'number' ? variantData.h : undefined,
      unitWeightKg:
       typeof variantData.unitWeightKg === 'number'
        ? variantData.unitWeightKg
        : typeof variantData.unit_weight_kg === 'number'
         ? variantData.unit_weight_kg
         : undefined,
      availableStock: inventoryData ? (typeof inventoryData.available === 'number' ? inventoryData.available : 0) : 0,
      variantGroupId: variantData.variant_group_id || variantData.variantGroupIdRef || undefined,
     } as ProductOption;
    })
    .filter((p) => {
     const normalizedProductName = normalizeText(p.productName, {
      toHalfWidth: true,
      toLowerCase: true,
      removeSymbols: true,
     });
     const matches = normalizedProductName.includes(normalizedSearch);
     if (!matches && normalizedProductName) {
      console.log('[ProductsStrategy] No match:', { productName: p.productName, normalized: normalizedProductName, search: normalizedSearch });
     }
     return matches;
    })
    .sort((a, b) => {
     // 在庫がある商品を優先、次に商品名でソート
     const aStock = a.availableStock || 0;
     const bStock = b.availableStock || 0;

     if (aStock > 0 && bStock === 0) return -1;
     if (aStock === 0 && bStock > 0) return 1;

     if (aStock !== bStock) {
      return bStock - aStock;
     }

     return a.productName.localeCompare(b.productName, 'ja');
    })
    .slice(0, this.config.maxResults);

   console.log('[ProductsStrategy] Final suggestions:', suggestions.length, suggestions.slice(0, 3).map(s => s.productName));

   return {
    items: suggestions,
    total: suggestions.length,
    duration: Date.now() - startTime,
   };
  } catch (err) {
   console.error('[ProductsStrategy] 検索エラー:', err);
   return {
    items: [],
    total: 0,
    duration: Date.now() - startTime,
   };
  }
 }
}
