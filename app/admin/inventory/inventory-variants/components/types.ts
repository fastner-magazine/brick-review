// ===== 新しい正規化されたデータ構造 (3-table normalized schema) =====

/** products_master レコード */
export type ProductMaster = {
    docid: string;              // ULID
    variant_group_id: string;   // vg_xxxxx
    product_name: string;
    category: string;
};

/** variants_master レコード */
export type VariantMaster = {
    variant_id: string;         // vg_xxxxx_hash (deterministic)
    variantGroupIdRef: string;  // variant_group_id への参照
    type: string;               // box / shrink / none 等
    sealing: string;            // no_shrink / none 等
};

/** inventory_master レコード */
export type InventoryMaster = {
    inventory_id: string;
    variantIdRef: string;       // variant_id への参照
    location: string;
    quantity: number;
    damages: string;
    note: string;
    barcode: string;
    status: string;
    created_at: string;
    updated_at: string;
};

/** クライアント側で結合したバリアント（variant + inventory） */
export type JoinedVariant = {
    variant_id: string;
    inventory_id: string;
    type: string;
    sealing: string;
    location: string;
    quantity: number;
    damages: string;
    note: string;
    barcode: string;
    status: string;
    created_at: string;
    updated_at: string;
};

/** クライアント側で結合した商品グループ（product + variants + inventories） */
export type JoinedProduct = {
    docid: string;
    variant_group_id: string;
    product_name: string;
    category: string;
    totalQuantity: number;
    variants: JoinedVariant[];
};

// ===== 互換性のための旧型定義（段階的移行用） =====

export type AggregatedVariant = {
    inventoryId: string;
    variantSku: string;
    types: string;
    damages: string;
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

export type AggregatedProduct = {
    docid?: string; // Firestore document ID (実際のドキュメントID)
    variantGroupId: string;
    seriesId?: string; // シリーズID（任意）
    productName: string; // 商品名本体
    vol?: string; // 巻数・号数（任意）
    displayName?: string; // 表示用の結合名（series_id + product_name + vol）
    releaseDate?: string; // 発売日（ISO 8601 string, Firestore Timestampから変換）
    category: string;
    types: string[];
    damages: string[];
    sealing: string[];
    totalQuantity: number;
    variants: AggregatedVariant[];
};

export type ApiResponse = {
    generatedAt: string;
    totalGroups: number;
    items: AggregatedProduct[];
};

export type ProductDraft = {
    variantGroupId: string;
    seriesId: string; // シリーズID
    productName: string; // 商品名本体
    vol: string; // 巻数・号数
    releaseDate: string; // 発売日（YYYY-MM-DD形式）
    category: string;
    categoryInput: string;
    typesInput: string;
    damagesInput: string;
    sealingInput: string;
    storageInput: string;
};

export type VariantDraft = {
    key: string;
    inventoryId: string;
    variantSku: string;
    types: string;
    damages: string;
    sealing: string;
    storageLocation: string;
    quantity: number | string;
    unitPrice: number | string;
    statusTokens: string;
    barcode: string;
    notes: string;
};

export type FirestoreDoc = {
    id?: string;
    data: Record<string, unknown>;
};

export type PendingDoc = {
    collection: string;
    doc: FirestoreDoc;
    summary: string;
};

export type VariantDiff = {
    key: string;
    original: AggregatedVariant;
    draft: VariantDraft;
    changedFields: string[];
};

export type MergeSuggestion = {
    targetGroup: AggregatedProduct;
    reason: string;
};

/** バリアント衝突情報 */
export type VariantConflict = {
    type: string;
    sealing: string;
    damages?: string;          // 追加: ダメージ状態
    storageLocation?: string;  // 追加: 保管場所
    fromVariants: JoinedVariant[];  // 統合元グループのこの(type,sealing,damages,location)を持つバリアント
    toVariants: JoinedVariant[];    // 統合先グループのこの(type,sealing,damages,location)を持つバリアント
};

/** 統合コンテキスト */
export type MergeContext = {
    fromGroup: AggregatedProduct;
    toGroup: AggregatedProduct;
    conflicts: VariantConflict[];
};
