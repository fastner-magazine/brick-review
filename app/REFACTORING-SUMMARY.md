# Firestore データ構造リファクタリング完了

## 実施内容

### 1. データ設計の改善

**変更前:**
- `inventory_master` と `products_master` の両方に `product_name` と `category` が存在
- データの重複により、整合性の維持が困難

**変更後:**
- `products_master` が商品名とカテゴリの**唯一の信頼できる情報源 (Single Source of Truth)**
- `inventory_master` には `productNameRef` と `categoryRef` として**参照キャッシュ**のみを保持

### 2. 更新されたファイル

#### コード変更
1. **`app/inventory/inventory-variants/components/builders/firestoreBuilders.ts`**
   - `buildVariantDoc()` 関数を更新
   - `product_name` → `productNameRef`
   - `category` → `categoryRef`

2. **`lib/firestoreClient.ts`**
   - `InventoryMasterData` 型定義を更新
   - `productNameRef?: string` と `categoryRef?: string` を追加

3. **`app/api/inventory-variants/route.ts`**
   - コメントを追加して `products_master` が信頼できる情報源であることを明示

#### スクリプト（新規作成）
1. **`scripts/rename-inventory-fields.js`** - メインスクリプト
2. **`scripts/rollback-inventory-fields.js`** - ロールバック用スクリプト
3. **`scripts/README-rename-inventory-fields.md`** - 詳細ドキュメント

## 実行手順

### ステップ1: Dry Run（必須）

まず、変更内容をプレビュー:

```powershell
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $OutputEncoding=[Text.UTF8Encoding]::new($false); chcp 65001 > $null; & { node scripts/rename-inventory-fields.js --dry-run }
```

### ステップ2: 本番実行

プレビューを確認後、実際に実行:

```powershell
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $OutputEncoding=[Text.UTF8Encoding]::new($false); chcp 65001 > $null; & { node scripts/rename-inventory-fields.js }
```

### ステップ3: 動作確認

アプリケーションを起動して動作確認:

```powershell
npm run dev
```

`http://localhost:3000/inventory/inventory-variants` にアクセスして、データが正しく表示されることを確認。

### ロールバック（必要な場合）

問題が発生した場合、以下で元に戻せます:

```powershell
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $OutputEncoding=[Text.UTF8Encoding]::new($false); chcp 65001 > $null; & { node scripts/rollback-inventory-fields.js }
```

## データ構造の比較

### Before (重複データ)

```typescript
// inventory_master
{
  variant_sku: "pokemon-box-001",
  product_name: "ポケモンカード ボックス",  // ← 重複
  category: "ポケモン",                   // ← 重複
  quantity: 10
}

// products_master
{
  variant_group_id: "pokemon-group-1",
  product_name: "ポケモンカード ボックス",  // ← 重複
  category: "ポケモン"                    // ← 重複
}
```

### After (SSOT + キャッシュ)

```typescript
// inventory_master（キャッシュのみ）
{
  variant_sku: "pokemon-box-001",
  productNameRef: "ポケモンカード ボックス", // ← 参照キャッシュ
  categoryRef: "ポケモン",                  // ← 参照キャッシュ
  quantity: 10
}

// products_master（信頼できる情報源）
{
  variant_group_id: "pokemon-group-1",
  product_name: "ポケモンカード ボックス",  // ← 唯一の真実
  category: "ポケモン"                    // ← 唯一の真実
}
```

## メリット

1. **データ整合性の向上**
   - 商品名とカテゴリの更新は `products_master` のみで完結
   - データの不整合が発生しにくい

2. **保守性の向上**
   - フィールド名から役割が明確（`*Ref` = キャッシュ）
   - 将来的にキャッシュの再構築が容易

3. **パフォーマンス**
   - 検索・フィルタリング用にキャッシュを保持
   - 正規化されたデータ構造による柔軟性

## 注意事項

- スクリプト実行前に必ずFirestoreのバックアップを取得
- 大規模コレクションの場合、処理に時間がかかる可能性あり
- 実行中は他のプロセスによる更新を避ける

## 後方互換性

アプリケーションコードは以下のようにフォールバックを実装:

```typescript
// 新しいフィールド名を優先、なければ古いフィールド名
const productName = data.productNameRef || data.product_name || '';
const category = data.categoryRef || data.category || '';
```

これにより、移行期間中も安全に動作します。
