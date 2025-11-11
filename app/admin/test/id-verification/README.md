# ID検証システム（身分証動画撮影）

## 概要

古物商法に対応した身分証の動画撮影システムです。カメラのみを使用して、4つのステップで連続撮影を行います。

## 機能

### 撮影フロー

1. **身分証の表面**: 録画開始後、表面全体をゆっくり左右に傾けて撮影
2. **身分証の裏面**: 裏返して裏面全体を撮影（マイナンバーは隠す）
3. **身分証の厚み**: 斜めに持って厚みと側面を撮影
4. **セルフィー**: インカメラに自動切り替え、顔と身分証を同時に撮影

### 保存機能

- **動画**: `video.webm` として Firebase Storage に保存
- **スナップショット**: 各ステップで撮影された静止画 (JPEG)
  - `snapshot_front.jpg` - 表面
  - `snapshot_back.jpg` - 裏面
  - `snapshot_thickness.jpg` - 厚み
  - `snapshot_selfie.jpg` - セルフィー
- **メタデータ**: `metadata.json` としてセッション情報を保存

### Firebase Storage保存構造

```
id-verification/
  {sessionId}/
    video.webm
    snapshot_front.jpg
    snapshot_back.jpg
    snapshot_thickness.jpg
    snapshot_selfie.jpg
    metadata.json
```

## 技術仕様

### 使用技術

- **フロントエンド**: Next.js 14 (App Router), React, TypeScript
- **カメラAPI**: MediaRecorder API, getUserMedia API
- **ストレージ**: Firebase Storage
- **動画形式**: WebM (VP9コーデック)
- **画像形式**: JPEG (Base64 → Blob変換)

### 主要ファイル

- `app/test/id-verification/page.tsx` - メインページ
- `app/test/id-verification/components/VideoRecorder.tsx` - 録画コンポーネント
- `lib/idVerificationStorage.ts` - Firebase Storage保存ロジック
- `app/test/id-verification/types.ts` - 型定義
- `app/test/id-verification/utils.ts` - ユーティリティ関数

### セキュリティ考慮事項

1. **チャレンジコード**: 各ステップでランダムなコードを表示し、偽造を防止
2. **タイムスタンプ**: 撮影時刻と各ステップの経過時間を記録
3. **デバイス情報**: User Agent、画面解像度などを記録
4. **連続撮影**: 1本の動画として連続撮影することで、後から編集されていないことを証明

### カメラ切り替えの実装

ステップ4（セルフィー）でインカメラに切り替える際の処理:

1. カメラ切り替え前に MediaRecorder の `onstop` ハンドラを無効化
2. 新しいカメラストリームを取得
3. 古い MediaRecorder を停止してデータを確定
4. 新しいストリームで新しい MediaRecorder を作成
5. 元の `onstop` ハンドラを新しい MediaRecorder に設定
6. 録画を継続

これにより、ストリーム切り替え時に録画が中断されることを防ぎます。

## デプロイ前の確認事項

### Firebase設定

1. **環境変数の設定** (`.env.local`)
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
   ```

2. **Storage Rulesの設定**
   - 開発環境: `storage.rules` で全アクセス許可
   - 本番環境: 適切な認証ルールを追加

3. **CORS設定**
   - Firebase Storageのバケットに適切なCORS設定を追加

### 本番環境への移行

本番環境では以下の変更が必要です:

1. **認証の追加**
   ```typescript
   // 本番環境では認証チェックを追加
   if (!currentUser) {
     throw new Error('認証が必要です');
   }
   ```

2. **Storage Rulesの厳格化**
   ```
   match /id-verification/{sessionId}/{allPaths=**} {
     allow write: if request.auth != null;
     allow read: if request.auth != null && 
                    request.auth.token.admin == true;
   }
   ```

3. **ファイルサイズ制限**
   ```typescript
   // 動画サイズのチェック
   if (session.videoBlob.size > 100 * 1024 * 1024) { // 100MB
     throw new Error('動画サイズが大きすぎます');
   }
   ```

4. **データ保持期間の設定**
   - Cloud Functionsで古いデータを自動削除
   - または Firebase Storage の lifecycle ルールを設定

## トラブルシューティング

### カメラが起動しない

- HTTPSまたはlocalhostでアクセスしているか確認
- ブラウザのカメラ許可設定を確認
- 別のアプリがカメラを使用していないか確認

### アップロードが失敗する

- Firebase Storageの設定を確認
- ネットワーク接続を確認
- ブラウザのコンソールログでエラー詳細を確認

### インカメラに切り替わらない

- デバイスにフロントカメラがあるか確認
- ブラウザのコンソールログを確認
- 別のブラウザで試す

## ライセンス

このプロジェクトは内部使用目的で作成されています。
