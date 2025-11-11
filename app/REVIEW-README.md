# Brick - Review Repository

このリポジトリはレビュー用に作成されたコードの抜粋です。

## � プロジェクト概要

京都ブリック - 買取・在庫管理システム

レゴブロックの買取、在庫管理、価格設定、注文処理を一元管理する Web アプリケーション。
本リポジトリには主要なコンポーネント、API ルート、管理画面が含まれています。

## 🏗️ アーキテクチャ

### フロントエンド
- **フレームワーク**: Next.js 15.5.6 (App Router)
- **UI ライブラリ**: React 19.2.0
- **言語**: TypeScript 5.9.3
- **スタイリング**: Tailwind CSS 4.1.16
- **UI コンポーネント**: Radix UI (shadcn/ui)
- **状態管理**: React Hooks + Context API

### バックエンド
- **Firebase**:
  - Firestore (データベース)
  - Firebase Admin SDK
  - Firebase App Check (セキュリティ)
  - Firebase Storage (ファイル保存)
- **API**: Next.js API Routes (Server Actions)

### 追加技術
- **WebAssembly**: Rust (wasm-pack) による画像品質検証
- **暗号化**: Google Cloud KMS、Web Crypto API
- **検索**: Fuse.js (ファジー検索)
- **Canvas API**: 価格表生成、アイソメトリック図形描画
- **CSV 処理**: csv-parse, csv-stringify
- **Google Sheets API**: データ連携

## 📁 ディレクトリ構成

\\\
app/
├── admin/           # 管理画面
│   ├── buy/        # 買取管理
│   ├── calculator/ # 箱詰め計算機
│   ├── database/   # データベース管理
│   ├── inventory/  # 在庫管理
│   ├── orders/     # 注文管理
│   └── system/     # システム設定
├── api/            # API ルート
├── client/         # 顧客向けページ
└── login/          # 認証

components/         # 共通 UI コンポーネント
├── ui/            # shadcn/ui コンポーネント
└── ...            # カスタムコンポーネント

lib/               # ユーティリティ・ロジック
├── search/        # 検索システム
├── encryption/    # 暗号化ユーティリティ
└── box-calculator/ # 箱詰めロジック

wasm-image-validator/ # Rust/Wasm 画像検証
\\\

## 🌟 主要機能

### 1. ID 検証システム (WebRTC + Canvas + Wasm)
**ファイル**: \pp/client/components/id-verification/VideoRecorder.tsx\

**実装内容**:
- リアルタイムカメラ撮影（WebRTC）
- 4段階撮影フロー: front → back → thickness → selfie
- SVG path morphing による台形ガイドアニメーション
- CSS transitionend イベントでロバストなアニメーション制御
- Wasm (Rust) による画像品質チェック（ブレ・明るさ検証）
- Canvas ベースの画像編集・プレビュー

**技術ポイント**:
- \	ransitionend\ イベントで CSS 回転完了を検知
- inner (赤枠) + outer (白枠) を同時に morphing
- \equestAnimationFrame\ で SVG path 補間
- Rust/wasm-bindgen による高速画像処理

**レビューポイント**:
- [ ] transitionend ハンドラの実装は適切か？
- [ ] useRef の使い分けは最適か？
- [ ] SVG morphing のパフォーマンスは問題ないか？
- [ ] Wasm バイナリのサイズは許容範囲か？

### 2. 高度な検索システム (Fuse.js + Firestore)
**ファイル**: \lib/search/\

**実装内容**:
- 複数ストラテジーパターン (products, inventory, priceSelector)
- Fuse.js によるファジー検索 + Firestore クエリ
- taxonomy による階層的フィルタリング
- デバウンス処理、ページネーション

**レビューポイント**:
- [ ] 検索パフォーマンスは十分か？
- [ ] taxonomy キャッシュ戦略は適切か？

### 3. 買取価格表自動生成 (Canvas API)
**ファイル**: \pp/admin/buy/price-sheet/page.tsx\

**実装内容**:
- 背景画像 + 透明度調整
- \uypricesMaster\ から価格データ取得
- Canvas 2D で価格表をレンダリング
- PNG ダウンロード機能

**レビューポイント**:
- [ ] Canvas レンダリングロジックは最適か？
- [ ] 大量データ (1000+ 商品) でのパフォーマンスは？

### 4. 暗号化システム (Google Cloud KMS + Web Crypto API)
**ファイル**: \lib/encryption/clientCrypto.ts\, \pp/api/crypto/\

**実装内容**:
- RSA-OAEP による公開鍵暗号化 (クライアント側)
- Google Cloud KMS による秘密鍵管理 (サーバー側)
- 銀行口座情報の End-to-End 暗号化

**レビューポイント**:
- [ ] 鍵管理フローは安全か？
- [ ] エラーハンドリングは十分か？

### 5. 在庫管理システム (Firestore + CSV)
**ファイル**: \pp/admin/inventory/\

**実装内容**:
- CSV インポート/エクスポート (encoding-japanese 対応)
- variant レベルの在庫追跡
- マージ・差分検出機能
- リアルタイム在庫更新

## 🔧 開発環境セットアップ

### 必須ツール
- Node.js 20
- Rust (rustup) + wasm-pack (Wasm ビルド用)

### ビルドコマンド
\\\ash
# 依存関係インストール
npm install

# Wasm ビルド
npm run wasm:build

# 開発サーバー起動
npm run dev

# プロダクションビルド
npm run build
\\\

### 環境変数
\.env.local\ に以下を設定:
\\\
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
FIREBASE_ADMIN_PROJECT_ID=...
GOOGLE_CLOUD_KMS_KEY_NAME=...
\\\

## 📊 パフォーマンス考慮事項

- **Wasm バイナリサイズ**: ~400KB (画像検証 crate)
- **Canvas レンダリング**: 1000+ 商品で 2-3 秒
- **Firestore クエリ**: インデックス最適化済み
- **画像アップロード**: Firebase Storage (5MB 制限)

## 🧪 テスト
\pp/admin/test/\ 配下にテストツール・デバッグページあり。

## 📝 質問・コメント
Issue または PR でフィードバックをお願いします！

## 📄 ライセンス
非公開プロジェクト（レビュー用コピー）
