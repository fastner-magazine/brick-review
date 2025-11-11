/**
 * 検索システムの型定義
 * Strategy パターンでUI/ロジックを完全分離
 */

// ============================================
// 基本型
// ============================================

export type FilterOption = string | { id: string; label: string };

export type SearchFilter = {
 id: string;
 label: string;
 value: string;
 onChange: (_value: string) => void;
 options: FilterOption[];
 defaultValue?: string;
 placeholder?: string;
 clearable?: boolean;
};

export type PaginationState = {
 currentPage: number;
 pageSize: number | 'all';
 totalItems: number;
 filteredItems: number;
};

// ============================================
// 検索戦略インターフェース
// ============================================

export interface SearchStrategy<T = any> {
 /**
  * 検索を実行
  * @param query 検索クエリ
  * @param filters フィルタ条件
  * @param options 追加オプション
  */
 search(
  _query: string,
  _filters?: Record<string, any>,
  _options?: SearchOptions
 ): Promise<SearchResult<T>>;

 /**
  * 検索対象のデータソースを初期化/更新
  */
 initialize?(_data: T[]): Promise<void>;

 /**
  * 戦略の名前（デバッグ用）
  */
 readonly name: string;
}

export type SearchOptions = {
 /** ページング情報 */
 pagination?: {
  page: number;
  size: number | 'all';
 };
 /** ソート条件 */
 sort?: {
  field: string;
  order: 'asc' | 'desc';
 };
 /** 追加のカスタムオプション */
 [key: string]: any;
};

export type SearchResult<T = any> = {
 /** 検索結果アイテム */
 items: T[];
 /** ヒット総数（ページング前） */
 total: number;
 /** 検索にかかった時間（ms） */
 duration?: number;
 /** 追加のメタデータ */
 metadata?: Record<string, any>;
};

// ============================================
// 正規化ユーティリティ
// ============================================

export type NormalizeOptions = {
 /** 全角→半角変換 */
 toHalfWidth?: boolean;
 /** 小文字に変換 */
 toLowerCase?: boolean;
 /** 記号を除去 */
 removeSymbols?: boolean;
 /** カスタム正規化関数 */
 custom?: (_text: string) => string;
};

// ============================================
// Firestore検索用の型
// ============================================

export type FirestoreSearchConfig = {
 /** コレクション名 */
 collectionName: string;
 /** 検索対象フィールド（正規化済みフィールド名） */
 searchFields: string[];
 /** フィルタ可能フィールド */
 filterFields?: {
  [key: string]: {
   operator: '==' | '>=' | '<=' | 'in' | 'array-contains';
   type?: 'string' | 'number' | 'boolean';
  };
 };
 /** 結果に含めるフィールド */
 selectFields?: string[];
};

// ============================================
// Fuse.js検索用の型
// ============================================

export type FuseSearchConfig = {
 /** 検索対象キー */
 keys: string[];
 /** あいまい検索の閾値 (0.0 = 完全一致, 1.0 = すべて一致) */
 threshold?: number;
 /** 検索距離 */
 distance?: number;
 /** 最小マッチ文字数 */
 minMatchCharLength?: number;
};

// ============================================
// PriceSelector用の型（価格マスター検索用）
// ============================================

/**
 * 価格情報オプション（買取価格重視のサジェスト表示用）
 * buypricesMaster + variantsMaster の検索結果
 */
export type PriceOption = {
 id: string;
 productName: string;
 categories?: string[];
 types?: string[];
 sealings?: string[];
 categoryLabels?: string[];
 typeLabels?: string[];
 sealingLabels?: string[];
 w?: number;
 d?: number;
 h?: number;
 unitWeightKg?: number;
 buyPrice?: number | null;
 variantGroupId?: string;
 /** 追加の任意フィールド */
 [key: string]: any;
};

/**
 * PriceSelector戦略の設定
 */
export type PriceSelectorConfig = {
 /** 検索対象コレクション（複数可） */
 collections: string[];
 /** 検索フィールド（正規化済み） */
 searchFields: string[];
 /** カテゴリフィールド名（デフォルト: 'categories'） */
 categoryField?: string;
 /** タイプフィールド名（デフォルト: 'types'） */
 typeField?: string;
 /** 価格フィールド名（デフォルト: 'buy_price'） */
 priceField?: string;
 /** コレクション間のJoin設定 */
 joins?: Array<{
  from: string; // 'collection.field'形式
  to: string;   // 'collection.field'形式
 }>;
 /** 結果の最大件数（デフォルト: 10） */
 maxResults?: number;
};

// ============================================
// ProductsSelector用の型（商品情報検索用）
// ============================================

/**
 * 商品情報オプション（在庫・商品情報重視のサジェスト表示用）
 * inventoriesMaster + variantsMaster + productsMaster の検索結果
 */
export type ProductOption = {
 id: string;
 productName: string;
 categories?: string[];
 types?: string[];
 categoryLabels?: string[];
 typeLabels?: string[];
 w?: number;
 d?: number;
 h?: number;
 unitWeightKg?: number;
 availableStock?: number;
 variantGroupId?: string;
 /** 追加の任意フィールド */
 [key: string]: any;
};

/**
 * ProductsSelector戦略の設定
 */
export type ProductsSelectorConfig = {
 /** 検索対象コレクション（複数可） */
 collections: string[];
 /** 検索フィールド（正規化済み） */
 searchFields: string[];
 /** カテゴリフィールド名（デフォルト: 'categories'） */
 categoryField?: string;
 /** タイプフィールド名（デフォルト: 'types'） */
 typeField?: string;
 /** コレクション間のJoin設定 */
 joins?: Array<{
  from: string; // 'collection.field'形式
  to: string;   // 'collection.field'形式
 }>;
 /** 結果の最大件数（デフォルト: 10） */
 maxResults?: number;
};
