# app/client - 買取申込フォーム（クライアント向け）

このディレクトリには、エンドユーザー向けの買取申込フォームのコードが含まれています。

## ディレクトリ構造

```
app/client/
├── README.md                 # このファイル
├── layout.tsx                # クライアント向けページのレイアウト
├── page.tsx                  # 買取申込フォームのメインページ（6ステップのウィザード形式）
├── components/
│   ├── SecureBankForm.tsx    # 銀行情報暗号化コンポーネント（レンダープロップパターン）
│   └── id-verification/
│       ├── types.ts          # 身分証動画撮影の型定義
│       ├── utils.ts          # 身分証動画撮影のユーティリティ関数
│       └── VideoRecorder.tsx # 身分証動画撮影コンポーネント（古物商法対応）
└── hooks/
    ├── useBankEncryption.ts      # 銀行情報暗号化フック
    └── useSecureBankSubmit.ts    # 銀行情報送信フック（暗号化 + API送信）
```

---

## ファイル詳細

### 📄 `page.tsx` - メインページ

**役割**: 買取申込フォームのメインロジックと UI

**機能概要**:
- **6ステップのウィザード形式フォーム**:
  1. 個人情報入力（氏名、住所、生年月日、LINE登録名）
  2. 本人確認書類の動画撮影（`VideoRecorder` 使用）
  3. 銀行口座情報入力（サジェスト機能付き）
  4. 買取希望商品の入力（`ProductSelector` + `PriceSelectorStrategy` 使用）
  5. 買取方法選択（郵送 or 来店）
  6. 同意書の確認・署名（`SignatureCanvas` 使用）
  7. 送信完了画面

**主要な状態管理**:
- `formData`: フォーム全体のデータ（個人情報、銀行情報、買取希望商品、同意情報など）
- `consentText`: Firestore `settings/buyback_consent` から取得した同意書テキスト（フォールバック: `DEFAULT_CONSENT_TEXT`）
- `receptionNumber`: サーバから返却される受付番号
- `verificationSession`: 身分証動画撮影セッション

**データフロー**:
1. **同意書テキスト取得**: `/api/buyback-settings/consent` から取得。失敗時は `DEFAULT_CONSENT_TEXT` を使用
2. **銀行データ読み込み**: `loadBankData()` で公開JSON (`/bankdata_by_kana/*.json`) を動的ロード
3. **商品検索**: `PriceSelectorStrategy` で `buypricesMaster` から価格・タイプ情報を検索
4. **暗号化送信**: `useSecureBankSubmit` で銀行情報を暗号化し、`/api/buy_requests_secure` に送信
5. **PDF生成**: `generatePDFBlob()` で `#buyback-agreement` 要素を PDF 化し、Firebase Storage にアップロード
6. **来店予約**: 来店選択時は `bookings` コレクションに予約情報を保存

**重要な依存関係**:
- `@/lib/consentDefaults` - フォールバック同意書テキスト
- `@/lib/search` - `ProductSelector` と `PriceSelectorStrategy`
- `@/lib/bankDataLoader` - 銀行・支店名サジェスト
- `@/lib/firebaseClient` - Firebase Storage（身分証・PDF保存）
- `./hooks/useSecureBankSubmit` - 暗号化送信フック
- `./components/id-verification/VideoRecorder` - 身分証動画撮影

---

### 📄 `layout.tsx` - レイアウト

**役割**: クライアント向けページ共通のレイアウト（ヘッダー、メタデータ）

**機能**:
- ページタイトル・説明文のメタデータ設定
- 「買取博士」ヘッダー表示
- 印刷時にヘッダー非表示（`.no-print` クラス）

---

## components/

### 📄 `SecureBankForm.tsx` - 銀行情報暗号化コンポーネント

**役割**: 銀行情報を暗号化してレンダープロップで結果を返す

**使用例**:
```tsx
<SecureBankForm
  bankData={{
    bankName: '三菱UFJ銀行',
    bankCode: '0005',
    branchName: '本店',
    branchCode: '001',
    accountNumber: '1234567',
    accountNameKana: 'ヤマダタロウ',
  }}
  onEncryptSuccess={(encrypted) => {
    // サーバに送信
    submitToServer(encrypted);
  }}
  onEncryptError={(error) => alert(error)}
>
  {(encrypt, { isEncrypting, error }) => (
    <button onClick={encrypt} disabled={isEncrypting}>
      {isEncrypting ? '暗号化中...' : '送信'}
    </button>
  )}
</SecureBankForm>
```

**技術詳細**:
- `useBankEncryption` フックを内部で使用
- レンダープロップパターンで暗号化関数と状態を公開
- Web Crypto API によるハイブリッド暗号化（RSA-OAEP + AES-GCM）

---

### 📂 `components/id-verification/`

古物商法に対応した身分証動画撮影システム

#### 📄 `types.ts` - 型定義

**主要な型**:
- `RecordingStep`: 撮影ステップ（`'front'` | `'back'` | `'thickness'` | `'selfie'`）
- `StepMarker`: 各ステップのタイムスタンプ・チャレンジコード・スナップショット
- `VerificationSession`: 撮影セッション全体（動画Blob、マーカー、デバイス情報）
- `DeviceInfo`: デバイス情報（UserAgent、解像度、接続タイプなど）

#### 📄 `VideoRecorder.tsx` - 動画撮影コンポーネント

**役割**: 身分証の4ステップ動画撮影を実行

**撮影フロー**:
1. **表面撮影** (`front`): 外カメラで身分証表面を撮影
2. **裏面撮影** (`back`): 外カメラで身分証裏面を撮影
3. **厚み撮影** (`thickness`): 外カメラで身分証の側面厚みを撮影
4. **セルフィー撮影** (`selfie`): インカメラで本人＋身分証を同時撮影

**技術仕様**:
- **連続録画**: 全ステップを通して録画し続ける（カメラ切替時に動画を分割）
- **チャレンジコード**: 各ステップで6桁ランダムコードを表示し、ステップマーカーに記録
- **スナップショット**: ボタン押下時に `canvas` で静止画をキャプチャ
- **デバイス情報**: セッション開始時にデバイス情報を収集
- **ガイダンス**: 各ステップで操作ガイドを表示

**イベント**:
- `onComplete(session: VerificationSession)`: 撮影完了時
- `onCancel()`: キャンセル時

#### 📄 `utils.ts` - ユーティリティ関数

**提供関数**:
- `generateChallengeCode()`: 6桁ランダムコードの生成
- `getDeviceInfo()`: デバイス情報の取得
- その他の身分証撮影サポート関数

---

## hooks/

### 📄 `useBankEncryption.ts` - 銀行情報暗号化フック

**役割**: Web Crypto API を使って銀行情報を暗号化

**暗号化方式**:
- **ハイブリッド暗号化**: RSA-OAEP（2048bit）+ AES-GCM（256bit）
- サーバの公開鍵で AES セッションキーを暗号化
- AES セッションキーで銀行情報を暗号化

**返り値**:
```typescript
{
  encryptionState: {
    isEncrypting: boolean;
    error: string | null;
    isSupported: boolean;  // Web Crypto API サポート
    isSecure: boolean;      // HTTPS 接続確認
  },
  encryptBankInfo: (bankData: BankData) => Promise<{
    encryptedSessionKey: string;      // RSA暗号化されたAESキー
    encryptedData: {
      ciphertext: string;              // AES暗号化されたデータ
      iv: string;                      // 初期化ベクトル
      authTag: string;                 // 認証タグ
    };
    keyInfo: {
      algorithm: string;
      keySize: number;
    };
  } | null>;
  checkEncryptionSupport: () => boolean;
}
```

**使用例**:
```tsx
const { encryptionState, encryptBankInfo } = useBankEncryption();

const encrypted = await encryptBankInfo({
  bankName: '三菱UFJ銀行',
  bankCode: '0005',
  branchName: '本店',
  branchCode: '001',
  accountNumber: '1234567',
  accountNameKana: 'ヤマダタロウ',
});
```

---

### 📄 `useSecureBankSubmit.ts` - 銀行情報送信フック

**役割**: 銀行情報を暗号化してサーバに送信

**機能**:
1. `useBankEncryption` で銀行情報を暗号化
2. `/api/buy_requests_secure` に POST
3. 成功時に受付番号を受け取る
4. `onSuccess` / `onError` コールバックを呼び出す

**使用例**:
```tsx
const { submitSecure, isSubmitting, error } = useSecureBankSubmit({
  otherFormData: {
    name: '山田太郎',
    address: '東京都...',
    items: [...],
    idFrontUrl: '...',
    idBackUrl: '...',
  },
  onSuccess: (response) => {
    console.log('受付番号:', response.receptionNumber);
    setCurrentStep(7);
  },
  onError: (error) => {
    alert(error);
  },
});

// 送信実行
await submitSecure({
  bankName: '三菱UFJ銀行',
  bankCode: '0005',
  branchName: '本店',
  branchCode: '001',
  accountNumber: '1234567',
  accountNameKana: 'ヤマダタロウ',
  // 追加で idFrontUrl, idBackUrl などを渡すことも可能
});
```

**送信データ構造**:
```typescript
{
  // 暗号化された銀行情報
  encryptedBankData: {
    encryptedSessionKey: string;
    encryptedData: { ciphertext, iv, authTag };
    keyInfo: { algorithm, keySize };
  },
  // その他の平文データ
  name: string;
  address: string;
  birthdate: string;
  items: ItemEntry[];
  idFrontUrl: string;
  idBackUrl: string;
  verificationSession?: VerificationSessionSubmit;
  // ...
}
```

---

## データフローの全体像

```
┌──────────────────────────────────────────────────────────────────┐
│                         page.tsx (メインUI)                        │
│  - 6ステップのウィザード形式フォーム                                │
│  - 個人情報、銀行情報、買取希望商品、同意書の入力                    │
└───────────────────┬──────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
┌───────────────┐      ┌──────────────────────┐
│ VideoRecorder │      │ ProductSelector      │
│ (身分証撮影)    │      │ + PriceSelectorStrategy │
│               │      │ (商品検索・価格表示)   │
└───────┬───────┘      └──────────┬───────────┘
        │                         │
        │ VerificationSession     │ 検索結果
        │                         │
        ▼                         ▼
┌─────────────────────────────────────────┐
│     useSecureBankSubmit (送信フック)      │
│  ┌─────────────────────────────────┐    │
│  │  useBankEncryption (暗号化フック) │    │
│  │  - RSA-OAEP + AES-GCM          │    │
│  │  - Web Crypto API              │    │
│  └─────────────────────────────────┘    │
└─────────────┬───────────────────────────┘
              │
              │ POST (暗号化データ)
              ▼
    ┌──────────────────────────┐
    │ /api/buy_requests_secure  │
    │ (Next.js API Route)       │
    │ - 銀行情報を復号化         │
    │ - Firestore に保存        │
    │ - 受付番号を生成・返却     │
    └─────────────┬────────────┘
                  │
                  │ 受付番号
                  ▼
         ┌──────────────────┐
         │  PDF生成＆保存    │
         │ - html2canvas     │
         │ - jsPDF          │
         │ - Firebase Storage │
         └──────────────────┘
```

---

## セキュリティ対応

### 1. 銀行情報の暗号化
- **クライアント側暗号化**: Web Crypto API（RSA-OAEP 2048bit + AES-GCM 256bit）
- **サーバ側復号化**: Google Cloud KMS で秘密鍵を管理
- **HTTPS必須**: 暗号化は HTTPS 接続時のみ実行可能

### 2. 古物商法対応の身分証確認
- **連続動画撮影**: カメラのみ使用、編集・改ざん防止
- **チャレンジコード**: 各ステップで6桁ランダムコード表示
- **タイムスタンプ**: 録画開始からの経過ミリ秒を記録
- **デバイス情報**: UserAgent、解像度、接続タイプなどを収集
- **4ステップ撮影**: 表面・裏面・厚み・セルフィー

### 3. 同意書の安全な表示
- **Firestore取得**: `settings/buyback_consent` から取得
- **フォールバック**: 取得失敗時は `DEFAULT_CONSENT_TEXT` を使用（`lib/consentDefaults.ts`）
- **UI/PDF統一**: 同じ `consentText` を画面表示と PDF に使用

---

## 関連ファイル

- **API Route**: `app/api/buy_requests_secure/route.ts` - 暗号化された銀行情報を受け取り、復号化して Firestore に保存
- **暗号化ライブラリ**: `lib/encryption/clientCrypto.ts` - Web Crypto API のラッパー
- **同意書フォールバック**: `lib/consentDefaults.ts` - デフォルト同意書テキスト
- **商品検索戦略**: `lib/search/strategies/priceSelector.ts` - `buypricesMaster` 検索
- **商品選択UI**: `lib/search/components/ProductSelector.tsx` - 商品名・タイプ・価格選択UI

---

## 開発時の注意点

1. **HTTPS必須**: 暗号化は HTTPS 接続時のみ動作（開発環境では `localhost` で OK）
2. **カメラ権限**: 身分証撮影には外カメラ・インカメラの両方の権限が必要
3. **大容量動画**: 動画ファイルは Firebase Storage にアップロード（Firestore には URL のみ保存）
4. **PDF生成**: `html2canvas` + `jsPDF` で PDF を生成し、Storage に保存
5. **同意書テキスト**: Firestore `settings/buyback_consent` が空の場合は `DEFAULT_CONSENT_TEXT` を使用

---

## テスト時の確認項目

- [ ] 6ステップのフォーム遷移が正常に動作する
- [ ] 身分証動画撮影（4ステップ）が正常に完了する
- [ ] 銀行情報が暗号化されて送信される
- [ ] 商品検索で `buypricesMaster` から価格が表示される
- [ ] 同意書テキストが Firestore から取得され、UI と PDF に表示される
- [ ] 送信完了後に受付番号が表示される
- [ ] PDF が Firebase Storage に保存される
- [ ] 来店選択時に予約情報が `bookings` コレクションに保存される
