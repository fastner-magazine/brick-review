import {
  getFirestore,
  Firestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  runTransaction,

} from 'firebase/firestore';
import { getFirebaseApp } from './firebaseClient';
import { initAppCheck, isAppCheckInitialized } from './appCheck';

let firestoreInstance: Firestore | null = null;

/**
 * Firestore が正しく初期化されているかチェック
 * @returns {boolean} 初期化済みなら true
 */
export function isFirestoreInitialized(): boolean {
  const app = getFirebaseApp();
  return app !== null;
}

/**
 * Firestoreインスタンスを強制的に再作成する
 * トークン更新後など、新しい認証情報で接続し直す必要がある場合に使用
 */
export function resetFirestoreInstance(): void {
  console.log('[resetFirestoreInstance] Resetting Firestore instance');
  firestoreInstance = null;
}

export function getFirestoreClient(): Firestore | null {
  if (firestoreInstance) {
    console.log('[getFirestoreClient] Returning existing Firestore instance');
    return firestoreInstance;
  }
  console.log('[getFirestoreClient] Creating new Firestore instance');

  if (typeof window !== 'undefined') {
    try {
      if (!isAppCheckInitialized()) {
        console.log('[getFirestoreClient] App Check not initialized, initializing now');
        initAppCheck();
      }
    } catch (err) {
      console.warn('[getFirestoreClient] Failed to initialize App Check:', err);
    }
  }

  const app = getFirebaseApp();
  if (!app) {
    // eslint-disable-next-line no-console
    console.error(
      'Firebase app not initialized. Please check your environment variables in .env.local'
    );
    return null;
  }
  try {
    firestoreInstance = getFirestore(app);
    console.log('[getFirestoreClient] Firestore instance created successfully');
    return firestoreInstance;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Firestore init error', err);
    return null;
  }
}

/**
 * Ensure the currently signed-in user has a fresh ID token before using Firestore.
 * This forces a token refresh, resets the cached Firestore instance, and allows
 * the SDK to establish a new channel with up-to-date credentials (admin claims,
 * App Check token, etc.).
 */
export async function refreshFirestoreAuth(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const authModule = await import('firebase/auth');
    const auth = authModule.getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      throw new Error('ユーザーが認証されていません');
    }

    console.log('[refreshFirestoreAuth] Forcing token refresh for Firestore access');
    const tokenResult = await currentUser.getIdTokenResult(true);
    console.log('[refreshFirestoreAuth] Token refreshed', {
      hasAdminClaim: tokenResult.claims?.admin === true,
      signInProvider: tokenResult.signInProvider,
    });

    await currentUser.getIdToken(true);

    resetFirestoreInstance();

    await new Promise((resolve) => setTimeout(resolve, 200));
  } catch (err) {
    console.warn('[refreshFirestoreAuth] Failed to refresh Firestore auth token', err);
    throw err;
  }
}

// Remove undefined values from an object recursively so Firestore setDoc won't
// reject unsupported 'undefined' field values.
function removeUndefined<T>(input: T): T {
  if (input === null || input === undefined) return input as T;
  if (typeof input !== 'object') return input;

  if (Array.isArray(input)) {
    // map arrays, cleaning each element
    return (input.map((v) => removeUndefined(v)) as unknown) as T;
  }

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

// ========================================
// 型定義（localStorageのデータ構造と同じ）
// ========================================

export type BoxData = {
  id: number;
  inner: { W: number; D: number; H: number };
  outer?: { W: number; D: number; H: number };
  maxWeightKg?: number;
  boxWeightKg?: number; // 箱自体の重量
};

export type SkuData = {
  id: string;
  name: string;
  w: number;
  d: number;
  h: number;
  unitWeightKg?: number;
};

export type GeneralSettingsData = {
  // レガシー設定（商品単体設定向け）
  boxPadding?: number;
  sideMargin?: number;
  frontMargin?: number;
  topMargin?: number;
  gapXY?: number;
  gapZ?: number;
  maxStackLayers?: number;
  unitWeightKg?: number;
  keepUpright?: boolean;

  // 新設定（UIで扱う全体デフォルト値）
  defaultSideMargin?: number;
  defaultFrontMargin?: number;
  defaultTopMargin?: number;
  defaultGapXY?: number;
  defaultGapZ?: number;
  defaultMaxStackLayers?: number;
  defaultBoxPadding?: number;
  // 後方互換: 古いキー名のまま保存されているデータに対応
  defaultSidePadding?: number;
  defaultFrontPadding?: number;
  defaultTopPadding?: number;
  defaultGroupMargin?: number;

  // 梱包材重量乗数
  packagingMaterialWeightMultiplier?: number;
};

export type SkuOverrideData = {
  skuId: string;
  sideMargin?: number;
  frontMargin?: number;
  topMargin?: number;
  gapXY?: number;
  gapZ?: number;
  maxStackLayers?: number;
  unitWeightKg?: number;
  keepUpright?: boolean;
};

// ========================================
// inventory_master コレクション型定義
// ========================================

export type InventoryMasterData = {
  inventoryId: string;
  variantSku: string;
  // キャッシュフィールド: products_master からの参照コピー
  groupIdRef?: string;
  productNameRef?: string;
  categoryRef?: string;
  types: string;
  damages: string;
  damageLabels: string;
  sealing: string;
  storageLocation: string;
  quantity: number;
  unitPrice: number | null;
  statusTokens: string;
  barcode: string;
  notes: string;
  updatedAt: string;
  createdAt: string;
};

// ========================================
// products_master コレクション型定義
// ========================================

export type ProductsMasterData = {
  variantGroupId: string;
  productName: string;
  category: string;
  types: string[];
  damages: string[];
  damageLabels: string[];
  sealing: string[];
  w?: number;
  d?: number;
  h?: number;
  unitWeightKg?: number;
  updatedAt?: string;
  createdAt?: string;
};

// ========================================
// Boxes コレクション CRUD
// ========================================

export async function getAllBoxes(): Promise<BoxData[]> {
  const db = getFirestoreClient();
  if (!db) return [];
  try {
    const snapshot = await getDocs(query(collection(db, 'boxes'), orderBy('id')));
    return snapshot.docs.map((d) => d.data() as BoxData);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('getAllBoxes error', err);
    return [];
  }
}

export async function getBoxById(id: number): Promise<BoxData | null> {
  const db = getFirestoreClient();
  if (!db) return null;
  try {
    const docRef = doc(db, 'boxes', String(id));
    const snapshot = await getDoc(docRef);
    return snapshot.exists() ? (snapshot.data() as BoxData) : null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('getBoxById error', err);
    return null;
  }
}

export async function saveBox(box: BoxData): Promise<void> {
  const db = getFirestoreClient();
  if (!db) throw new Error('Firestore not initialized');
  const docRef = doc(db, 'boxes', String(box.id));
  await setDoc(docRef, box, { merge: true });
}

export async function deleteBox(id: number): Promise<void> {
  const db = getFirestoreClient();
  if (!db) throw new Error('Firestore not initialized');
  const docRef = doc(db, 'boxes', String(id));
  await deleteDoc(docRef);
}

// ========================================
// SKUs コレクション CRUD
// ========================================

export async function getAllSkus(): Promise<SkuData[]> {
  const db = getFirestoreClient();
  if (!db) {
    // eslint-disable-next-line no-console
    console.error('getAllSkus: Firestore client not initialized');
    return [];
  }
  try {
    // eslint-disable-next-line no-console
    console.log('getAllSkus: Fetching from Firestore...');
    const snapshot = await getDocs(collection(db, 'skus'));
    // eslint-disable-next-line no-console
    console.log(`getAllSkus: Received ${snapshot.size} documents from Firestore`);
    const skus = snapshot.docs.map((d) => {
      const data = d.data() as SkuData;
      // ドキュメントIDがデータのidと異なる場合に対応
      return { ...data, id: d.id };
    });
    // eslint-disable-next-line no-console
    console.log(`Firestore: Loaded ${skus.length} SKUs`, skus);
    return skus;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('getAllSkus error:', err);
    if (err instanceof Error) {
      // eslint-disable-next-line no-console
      console.error('Error details:', {
        message: err.message,
        name: err.name,
        stack: err.stack,
      });
    }
    return [];
  }
}

export async function getSkuById(id: string): Promise<SkuData | null> {
  const db = getFirestoreClient();
  if (!db) return null;
  try {
    const docRef = doc(db, 'skus', id);
    const snapshot = await getDoc(docRef);
    return snapshot.exists() ? (snapshot.data() as SkuData) : null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('getSkuById error', err);
    return null;
  }
}

export async function saveSku(sku: SkuData): Promise<void> {
  const db = getFirestoreClient();
  if (!db) throw new Error('Firestore not initialized');
  const docRef = doc(db, 'skus', sku.id);
  await setDoc(docRef, sku, { merge: true });
}

export async function deleteSku(id: string): Promise<void> {
  console.log('deleteSku called with id:', id);
  const db = getFirestoreClient();
  if (!db) throw new Error('Firestore not initialized');
  console.log('Firestore client obtained, deleting doc:', id);
  const docRef = doc(db, 'skus', id);
  console.log('Doc ref created:', docRef.path);
  await deleteDoc(docRef);
  console.log('deleteDoc completed for:', id);
}

// ========================================
// GeneralSettings ドキュメント (singleton)
// ========================================

const GENERAL_SETTINGS_DOC_ID = 'default';

export async function getGeneralSettings(): Promise<GeneralSettingsData | null> {
  const db = getFirestoreClient();
  if (!db) return null;
  try {
    const docRef = doc(db, 'generalSettings', GENERAL_SETTINGS_DOC_ID);
    const snapshot = await getDoc(docRef);
    return snapshot.exists() ? (snapshot.data() as GeneralSettingsData) : null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('getGeneralSettings error', err);
    return null;
  }
}

export async function saveGeneralSettings(settings: GeneralSettingsData): Promise<void> {
  const db = getFirestoreClient();
  if (!db) throw new Error('Firestore not initialized');
  const docRef = doc(db, 'generalSettings', GENERAL_SETTINGS_DOC_ID);
  await setDoc(docRef, settings, { merge: true });
}

// ========================================
// SkuOverrides コレクション CRUD
// ========================================

export async function getAllSkuOverrides(): Promise<SkuOverrideData[]> {
  const db = getFirestoreClient();
  if (!db) return [];
  try {
    const snapshot = await getDocs(collection(db, 'skuOverrides'));
    return snapshot.docs.map((d) => d.data() as SkuOverrideData);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('getAllSkuOverrides error', err);
    return [];
  }
}

export async function getSkuOverride(skuId: string): Promise<SkuOverrideData | null> {
  const db = getFirestoreClient();
  if (!db) return null;
  try {
    const docRef = doc(db, 'skuOverrides', skuId);
    const snapshot = await getDoc(docRef);
    return snapshot.exists() ? (snapshot.data() as SkuOverrideData) : null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('getSkuOverride error', err);
    return null;
  }
}

export async function saveSkuOverride(override: SkuOverrideData): Promise<void> {
  const db = getFirestoreClient();
  if (!db) throw new Error('Firestore not initialized');
  const docRef = doc(db, 'skuOverrides', override.skuId);
  await setDoc(docRef, override, { merge: true });
}

export async function deleteSkuOverride(skuId: string): Promise<void> {
  const db = getFirestoreClient();
  if (!db) throw new Error('Firestore not initialized');
  const docRef = doc(db, 'skuOverrides', skuId);
  await deleteDoc(docRef);
}

// ========================================
// Orders コレクション CRUD
// ========================================

export type OrderData = {
  id: string;
  orderNumber: number;
  customerName: string;
  customerAddress: string;
  orderDate: string;
  status: string;
  boxSize: string;
  layers: any[];
  pickingBy?: string;
  pickingStartedAt?: string;
  totalWeight?: number;
  notes?: string;
  primaryBoxId?: number;
  packingStatus?: 'pending' | 'success' | 'failed';
  packingSummary?: any;
  packingError?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * 全ての注文を取得
 */
export async function getAllOrders(): Promise<OrderData[]> {
  const db = getFirestoreClient();
  if (!db) return [];
  try {
    const snapshot = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')));
    return snapshot.docs.map((d) => d.data() as OrderData);
  } catch (err) {
    console.error('getAllOrders error', err);
    return [];
  }
}

/**
 * 注文をIDで取得
 */
export async function getOrderById(id: string): Promise<OrderData | null> {
  const db = getFirestoreClient();
  if (!db) return null;
  try {
    const docRef = doc(db, 'orders', id);
    const snapshot = await getDoc(docRef);
    return snapshot.exists() ? (snapshot.data() as OrderData) : null;
  } catch (err) {
    console.error('getOrderById error', err);
    return null;
  }
}

/**
 * 注文を保存（新規作成または更新）
 */
export async function saveOrder(order: OrderData): Promise<void> {
  const db = getFirestoreClient();
  if (!db) throw new Error('Firestore not initialized');
  const docRef = doc(db, 'orders', order.id);
  // Clean undefined fields (Firestore rejects undefined values)
  const payload = removeUndefined(order);
  await setDoc(docRef, payload, { merge: true });
}

/**
 * 注文を削除
 */
export async function deleteOrder(id: string): Promise<void> {
  const db = getFirestoreClient();
  if (!db) throw new Error('Firestore not initialized');
  const docRef = doc(db, 'orders', id);
  await deleteDoc(docRef);
}

/**
 * 次の注文番号を取得
 */
const ORDER_COUNTER_DOC_ID = 'counter';

export async function getNextOrderNumber(): Promise<number> {
  const db = getFirestoreClient();
  if (!db) {
    console.error('Firestore not initialized, returning default counter');
    return 1;
  }
  try {
    const docRef = doc(db, 'orderCounters', ORDER_COUNTER_DOC_ID);
    const snapshot = await getDoc(docRef);

    let nextNumber = 1;
    if (snapshot.exists()) {
      const data = snapshot.data();
      nextNumber = (data.current || 0) + 1;
    }

    // カウンターを更新
    await setDoc(docRef, { current: nextNumber }, { merge: true });
    return nextNumber;
  } catch (err) {
    console.error('getNextOrderNumber error', err);
    return 1;
  }
}

// ========================================
// inventory_master コレクション CRUD
// ========================================

export async function getAllInventoryMaster(): Promise<InventoryMasterData[]> {
  const db = getFirestoreClient();
  if (!db) return [];
  try {
    const snapshot = await getDocs(collection(db, 'inventory_master'));
    return snapshot.docs.map((d) => ({
      ...(d.data() as InventoryMasterData),
      inventoryId: d.id,
    }));
  } catch (err) {
    console.error('getAllInventoryMaster error', err);
    return [];
  }
}

export async function getInventoryMasterById(inventoryId: string): Promise<InventoryMasterData | null> {
  const db = getFirestoreClient();
  if (!db) return null;
  try {
    const docRef = doc(db, 'inventory_master', inventoryId);
    const snapshot = await getDoc(docRef);
    return snapshot.exists() ? ({ ...snapshot.data(), inventoryId: snapshot.id } as InventoryMasterData) : null;
  } catch (err) {
    console.error('getInventoryMasterById error', err);
    return null;
  }
}

// ========================================
// products_master コレクション CRUD
// ========================================

export async function getAllProductsMaster(): Promise<ProductsMasterData[]> {
  const db = getFirestoreClient();
  if (!db) return [];
  try {
    const snapshot = await getDocs(collection(db, 'products_master'));
    return snapshot.docs.map((d) => ({
      ...(d.data() as ProductsMasterData),
      variantGroupId: d.id,
    }));
  } catch (err) {
    console.error('getAllProductsMaster error', err);
    return [];
  }
}

export async function getProductsMasterById(variantGroupId: string): Promise<ProductsMasterData | null> {
  const db = getFirestoreClient();
  if (!db) return null;
  try {
    const docRef = doc(db, 'products_master', variantGroupId);
    const snapshot = await getDoc(docRef);
    return snapshot.exists() ? ({ ...snapshot.data(), variantGroupId: snapshot.id } as ProductsMasterData) : null;
  } catch (err) {
    console.error('getProductsMasterById error', err);
    return null;
  }
}

// ========================================
// ローカルストレージとの同期ヘルパー (optional)
// ========================================

/**
 * ローカルストレージからFirestoreへ一括移行するユーティリティ
 * 初回セットアップや手動移行時に使用
 */
export async function migrateLocalStorageToFirestore(): Promise<void> {
  // Boxes
  const boxesRaw = globalThis.localStorage?.getItem('boxes');
  if (boxesRaw) {
    try {
      const boxes: BoxData[] = JSON.parse(boxesRaw);
      await Promise.all(boxes.map((b) => saveBox(b)));
      // eslint-disable-next-line no-console
      console.log(`Migrated ${boxes.length} boxes to Firestore`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to migrate boxes', err);
    }
  }

  // SKUs
  const skusRaw = globalThis.localStorage?.getItem('skus');
  if (skusRaw) {
    try {
      const skus: SkuData[] = JSON.parse(skusRaw);
      await Promise.all(skus.map((s) => saveSku(s)));
      // eslint-disable-next-line no-console
      console.log(`Migrated ${skus.length} SKUs to Firestore`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to migrate SKUs', err);
    }
  }

  // General Settings
  const settingsRaw = globalThis.localStorage?.getItem('generalSettings');
  if (settingsRaw) {
    try {
      const settings: GeneralSettingsData = JSON.parse(settingsRaw);
      await saveGeneralSettings(settings);
      // eslint-disable-next-line no-console
      console.log('Migrated general settings to Firestore');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to migrate general settings', err);
    }
  }

  // SKU Overrides
  const overridesRaw = globalThis.localStorage?.getItem('skuOverrides');
  if (overridesRaw) {
    try {
      const overrides: SkuOverrideData[] = JSON.parse(overridesRaw);
      await Promise.all(overrides.map((o) => saveSkuOverride(o)));
      // eslint-disable-next-line no-console
      console.log(`Migrated ${overrides.length} SKU overrides to Firestore`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to migrate SKU overrides', err);
    }
  }
}

// ========================================
// Booking: storeSettings + bookings
// ========================================

export type StoreSettings = {
  storeId: string; // 複数店舗対応に備えて
  enabled?: boolean;
  // 営業時間: 曜日ごとに open/close を "HH:mm" 形式で保持
  businessHours: {
    mon?: { open: string; close: string; breakStart?: string; breakEnd?: string } | null;
    tue?: { open: string; close: string; breakStart?: string; breakEnd?: string } | null;
    wed?: { open: string; close: string; breakStart?: string; breakEnd?: string } | null;
    thu?: { open: string; close: string; breakStart?: string; breakEnd?: string } | null;
    fri?: { open: string; close: string; breakStart?: string; breakEnd?: string } | null;
    sat?: { open: string; close: string; breakStart?: string; breakEnd?: string } | null;
    sun?: { open: string; close: string; breakStart?: string; breakEnd?: string } | null;
  };
  // 来店可能時間スロットの設定
  visitSettings: {
    slotMinutes: number; // 例: 30
    intervalMinutes?: number; // 例: 30（省略時は slotMinutes）
    maxDaysAhead?: number; // 何日先まで予約可
    minHoursBefore?: number; // 何時間前まで予約可
  };
  // 休業日（祝日等個別指定）
  closedDates?: string[]; // YYYY-MM-DD 配列
  updatedAt?: string;
  createdAt?: string;
};

export type Booking = {
  id: string; // storeId_date_HH-mm など
  storeId: string;
  date: string; // YYYY-MM-DD
  slot: string; // HH:mm
  customerName: string;
  customerContact?: string;
  receptionNumber?: string; // 買取受付番号
  status: 'booked' | 'canceled';
  createdAt: string;
  updatedAt: string;
};

const DEFAULT_STORE_ID = 'default';

export async function getStoreSettings(docId: string = DEFAULT_STORE_ID): Promise<StoreSettings | null> {
  const db = getFirestoreClient();
  if (!db) return null;
  try {
    const ref = doc(db, 'storeSettings', docId);
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as StoreSettings) : null;
  } catch (err) {
    console.error('getStoreSettings error', err);
    return null;
  }
}

export async function saveStoreSettings(settings: StoreSettings): Promise<void> {
  const db = getFirestoreClient();
  if (!db) throw new Error('Firestore not initialized');
  const now = new Date().toISOString();
  const payload = removeUndefined({ ...settings, updatedAt: now, createdAt: settings.createdAt || now });
  await setDoc(doc(db, 'storeSettings', settings.storeId || DEFAULT_STORE_ID), payload, { merge: true });
}

export async function listBookingsByDate(date: string, storeId: string = DEFAULT_STORE_ID): Promise<Booking[]> {
  const db = getFirestoreClient();
  if (!db) return [];
  try {
    const qy = query(
      collection(db, 'bookings'),
      where('storeId', '==', storeId),
      where('date', '==', date),
      where('status', '==', 'booked')
    );
    const snap = await getDocs(qy);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Booking);
  } catch (err) {
    console.error('listBookingsByDate error', err);
    return [];
  }
}

/**
 * 指定スロットを予約（同一スロットの二重予約を防止）
 * ドキュメントIDに storeId_date_HH-mm を使用し、トランザクションで存在チェック→作成。
 */
export async function createBookingOnce(params: {
  storeId?: string;
  date: string; // YYYY-MM-DD
  slot: string; // HH:mm
  customerName: string;
  customerContact?: string;
  receptionNumber?: string; // 買取受付番号
}): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const db = getFirestoreClient();
  if (!db) return { ok: false, reason: 'Firestore not initialized' };
  const storeId = params.storeId || DEFAULT_STORE_ID;
  const id = `${storeId}_${params.date}_${params.slot.replace(':', '-')}`;
  const ref = doc(db, 'bookings', id);
  try {
    await runTransaction(db, async (trx) => {
      const current = await trx.get(ref);
      if (current.exists() && current.data()?.status === 'booked') {
        throw new Error('already_booked');
      }
      const now = new Date().toISOString();
      const data: Booking = {
        id,
        storeId,
        date: params.date,
        slot: params.slot,
        customerName: params.customerName,
        customerContact: params.customerContact,
        receptionNumber: params.receptionNumber,
        status: 'booked',
        createdAt: now,
        updatedAt: now,
      };
      trx.set(ref, removeUndefined(data), { merge: false });
    });
    return { ok: true, id };
  } catch (err) {
    if (err instanceof Error && err.message === 'already_booked') {
      return { ok: false, reason: '既に予約されています' };
    }
    console.error('createBookingOnce error', err);
    return { ok: false, reason: '予約の作成に失敗しました' };
  }
}

export async function cancelBooking(id: string): Promise<void> {
  const db = getFirestoreClient();
  if (!db) throw new Error('Firestore not initialized');
  const ref = doc(db, 'bookings', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await setDoc(ref, { status: 'canceled', updatedAt: new Date().toISOString() }, { merge: true });
}
