# Brick - Review Branch

このリポジトリはレビュー用に作成されたコードの抜粋です。

## 📌 レビュー依頼内容

### 1. ID 検証コンポーネント (VideoRecorder)
**ファイル**: `app/client/components/id-verification/VideoRecorder.tsx`

**実装内容**:
- ステップ1 (front) → ステップ2 (back) → ステップ3 (thickness) → ステップ4 (selfie) の4段階撮影
- CSS transform の transitionend イベントで回転完了を検知
- SVG path morphing で台形アニメーション（厚み撮影時）
- inner (赤枠) と outer (白枠) の両方を同時にアニメーション

**レビューポイント**:
- [ ] transitionend イベントハンドラの実装は適切か？
- [ ] ステップ進行ロジックに問題はないか？
- [ ] SVG path morphing のパフォーマンスは問題ないか？
- [ ] useRef の使い方は適切か？

### 2. 商品検索コンポーネント (ProductSelector)
**ファイル**: `lib/search/components/ProductSelector.tsx`

**実装内容**:
- 絵文字を削除（📁🏷️✨など）
- sealing 情報をサジェスト欄から削除
- taxonomy からラベル情報を取得

**レビューポイント**:
- [ ] UI/UX の改善は適切か？
- [ ] taxonomy データの取得方法は効率的か？

### 3. 買取価格表自動発行 (NEW)
**ファイル**: `app/admin/buy/price-sheet/page.tsx`

**実装内容**:
- 背景画像選択 + Canvas レンダリング
- buypricesMaster から価格データ取得
- 検索フィルター、レイアウト調整機能
- PNG ダウンロード機能

**レビューポイント**:
- [ ] Canvas API の使い方は適切か？
- [ ] パフォーマンス上の問題はないか？
- [ ] UI/UX は使いやすいか？

## 🔧 技術スタック
- Next.js 15.5.6
- React 19.2.0
- TypeScript 5.9.3
- Firebase Firestore
- Tailwind CSS

## 📝 質問・コメント
Issue または PR でフィードバックをお願いします！
