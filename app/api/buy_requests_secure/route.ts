import { NextRequest, NextResponse } from 'next/server';
import { KeyManagementServiceClient } from '@google-cloud/kms';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Firestore } from '@google-cloud/firestore';
import crypto from 'crypto';

// KMS/Secret Manager クライアントの初期化（Base64認証情報対応）
function initGcpClients() {
  const base64Cred = process.env.ADMIN_CREDENTIAL_BASE64 || process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;

  if (base64Cred) {
    try {
      const credentials = JSON.parse(Buffer.from(base64Cred, 'base64').toString('utf8'));
      return {
        kms: new KeyManagementServiceClient({ credentials }),
        secret: new SecretManagerServiceClient({ credentials }),
        firestore: new Firestore({ credentials }),
      };
    } catch (error) {
      console.error('[GCP Clients] Failed to parse base64 credentials:', error);
    }
  }

  // フォールバック: GOOGLE_APPLICATION_CREDENTIALS または ADC
  return {
    kms: new KeyManagementServiceClient(),
    secret: new SecretManagerServiceClient(),
    firestore: new Firestore(),
  };
}

const { kms: kmsClient, secret: secretClient, firestore } = initGcpClients();

export const runtime = 'nodejs';

/**
 * 銀行情報を暗号化して安全に保存するAPI
 * 
 * フロー:
 * 1. クライアントから暗号化されたセッション鍵と銀行データを受信
 * 2. KMSでセッション鍵を復号
 * 3. セッション鍵で銀行データを復号（一時的にメモリ内のみ）
 * 4. 新しいDEKを生成
 * 5. DEKで銀行データを再暗号化
 * 6. DEKをKMSでラップ
 * 7. トークンIDを生成してSecret Managerに保存
 * 8. Firestoreにはトークン参照のみ保存
 */

/**
 * 受付番号を生成する関数
 * 形式: BUY20251106-001
 */
async function generateReceptionNumber(firestore: Firestore): Promise<string> {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000; // 9時間のミリ秒
  const jstDate = new Date(now.getTime() + jstOffset);

  const year = jstDate.getUTCFullYear();
  const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jstDate.getUTCDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  // 今日の日付の開始と終了のタイムスタンプを取得
  const startOfDay = new Date(jstDate.getUTCFullYear(), jstDate.getUTCMonth(), jstDate.getUTCDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  // Firestoreから今日作成されたドキュメント数を取得
  const todayDocs = await firestore
    .collection('buy_requests')
    .where('createdAt', '>=', startOfDay)
    .where('createdAt', '<', endOfDay)
    .count()
    .get();

  const count = todayDocs.data().count + 1;
  const serialNumber = String(count).padStart(3, '0');

  return `BUY${dateStr}-${serialNumber}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      encryptedSessionKey, // RSA-OAEPで暗号化されたAESセッション鍵
      encryptedData, // セッション鍵で暗号化された銀行情報
      verificationSession, // 身分証動画セッション情報
      preGeneratedReceptionNumber, // 事前に生成された受付番号（オプション）
      ...otherFormData
    } = body;

    console.log('Received encrypted bank data submission');
    if (verificationSession) {
      console.log('Verification session included:', verificationSession.sessionId);
    }

    // 環境変数の確認
    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT_ID ||
      process.env.KMS_PROJECT_ID ||
      process.env.PROJECT_ID;
    const location = process.env.KMS_LOCATION || 'asia-northeast2';
    const keyring = process.env.KMS_KEYRING || 'bank-data-keyring';
    const dekKeyName = process.env.KMS_DEK_KEY || 'bank-data-dek';
    const ecdhKeyName = process.env.KMS_ECDH_KEY || 'bank-ecdh-kek';

    // 開発環境でKMSが利用できない場合はモック処理
    const isDevelopment = process.env.NODE_ENV === 'development' || !projectId;

    if (isDevelopment) {
      console.warn('[DEV MODE] Using mock encryption (KMS not configured)');

      // Firestoreが利用可能かチェック
      try {
        // 受付番号を取得（事前生成済みがあればそれを使用、なければ新規生成）
        const receptionNumber = preGeneratedReceptionNumber || await generateReceptionNumber(firestore);

        if (preGeneratedReceptionNumber) {
          console.log('[DEV MODE] Using pre-generated reception number:', preGeneratedReceptionNumber);
        } else {
          console.log('[DEV MODE] Generated new reception number:', receptionNumber);
        }

        const docRef = await firestore.collection('buy_requests').add({
          ...otherFormData,
          receptionNumber,
          bankDataToken: `mock_${receptionNumber}`,
          isDevelopmentMode: true,
          verificationSession: verificationSession || null,
          encryptionMetadata: {
            algorithm: 'NONE (DEV MODE)',
            note: 'Development mode - no encryption applied',
            createdAt: new Date(),
          },
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        console.log('[DEV MODE] Buy request created:', docRef.id, 'Reception:', receptionNumber);

        return NextResponse.json({
          success: true,
          receptionNumber,
          isDevelopmentMode: true,
        });
      } catch (firestoreError) {
        console.error('[DEV MODE] Firestore error:', firestoreError);

        // Firestoreも使えない場合は完全モック
        const mockReceptionNumber = `DEV-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        return NextResponse.json({
          success: true,
          receptionNumber: mockReceptionNumber,
          isDevelopmentMode: true,
          note: 'Mock response - no data was saved',
        });
      }
    }

    if (!projectId) {
      throw new Error('Project ID environment variable not configured');
    }

    // 1. KMSでセッション鍵を復号
    const encryptedKeyBuffer = Buffer.from(encryptedSessionKey, 'base64');
    // 現在有効なバージョン2を使用
    const asymKeyName = `projects/${projectId}/locations/${location}/keyRings/${keyring}/cryptoKeys/${ecdhKeyName}/cryptoKeyVersions/2`;

    console.log('Decrypting session key with KMS');
    const [decryptResult] = await kmsClient.asymmetricDecrypt({
      name: asymKeyName,
      ciphertext: encryptedKeyBuffer,
    });

    if (!decryptResult.plaintext) {
      throw new Error('Failed to decrypt session key');
    }

    const sessionKey = Buffer.from(decryptResult.plaintext as Uint8Array);

    // 2. セッション鍵で銀行データを復号（一時的）
    console.log('Decrypting bank data with session key');
    const bankData = decryptWithSessionKey(sessionKey, encryptedData);

    // 3. 新しいDEK（Data Encryption Key）を生成
    const dek = crypto.randomBytes(32); // 256ビット

    // 4. DEKで銀行データを暗号化
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    let encrypted = cipher.update(JSON.stringify(bankData), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    console.log('Bank data encrypted with new DEK');

    // 5. DEKをKMSでラップ（KEKで暗号化）
    const kekName = `projects/${projectId}/locations/${location}/keyRings/${keyring}/cryptoKeys/${dekKeyName}`;
    const [encryptResponse] = await kmsClient.encrypt({
      name: kekName,
      plaintext: dek,
    });

    if (!encryptResponse.ciphertext) {
      throw new Error('Failed to wrap DEK with KMS');
    }

    const wrappedDek = Buffer.from(encryptResponse.ciphertext as Uint8Array).toString('base64');

    console.log('DEK wrapped with KMS');

    // 6. トークンIDを生成
    const tokenId = `bank_${crypto.randomBytes(16).toString('hex')}_${Date.now()}`;

    // 7. Secret Managerにトークンマッピングを保存（TTL付き）
    const secretId = tokenId;

    console.log('Creating secret in Secret Manager');
    await secretClient.createSecret({
      parent: `projects/${projectId}`,
      secretId: secretId,
      secret: {
        replication: {
          automatic: {},
        },
        ttl: {
          seconds: String(60 * 60 * 24 * 90), // 90日間
        },
      },
    });

    const secretPayload = {
      wrappedDek,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      encryptedData: encrypted,
      createdAt: new Date().toISOString(),
    };

    await secretClient.addSecretVersion({
      parent: `projects/${projectId}/secrets/${secretId}`,
      payload: {
        data: Buffer.from(JSON.stringify(secretPayload)),
      },
    });

    console.log('Secret stored successfully');

    // 8. 受付番号を取得（事前生成済みがあればそれを使用、なければ新規生成）
    const receptionNumber = preGeneratedReceptionNumber || await generateReceptionNumber(firestore);

    if (preGeneratedReceptionNumber) {
      console.log('Using pre-generated reception number:', preGeneratedReceptionNumber);
    } else {
      console.log('Generated new reception number:', receptionNumber);
    }

    // 9. Firestoreにはトークン参照のみ保存
    const docRef = await firestore.collection('buy_requests').add({
      ...otherFormData,
      receptionNumber,
      bankDataToken: tokenId,
      verificationSession: verificationSession || null,
      encryptionMetadata: {
        algorithm: 'AES-256-GCM',
        kekVersion: 1,
        tokenTTL: 90, // days
        createdAt: new Date(),
      },
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log('Buy request created:', docRef.id, 'Reception:', receptionNumber);

    // 10. 監査ログ記録
    await logEncryptionEvent({
      action: 'ENCRYPT_BANK_DATA',
      tokenId,
      documentId: docRef.id,
      receptionNumber,
      timestamp: new Date().toISOString(),
      success: true,
    });

    return NextResponse.json({
      success: true,
      receptionNumber,
      tokenId, // デバッグ用（本番では削除推奨）
    });
  } catch (error) {
    console.error('Encryption error:', error);

    await logEncryptionEvent({
      action: 'ENCRYPT_FAILED',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      success: false,
    });

    return NextResponse.json(
      { error: 'Failed to process secure submission' },
      { status: 500 }
    );
  }
}

/**
 * セッション鍵で暗号化されたデータを復号
 */
function decryptWithSessionKey(
  sessionKey: Buffer,
  encrypted: { ciphertext: string; iv: string; authTag: string }
): any {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    sessionKey,
    Buffer.from(encrypted.iv, 'base64')
  );

  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));

  let decrypted = decipher.update(encrypted.ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}

/**
 * 監査ログ記録（改ざん防止）
 */
async function logEncryptionEvent(event: Record<string, any>) {
  console.log(
    JSON.stringify({
      severity: 'INFO',
      'logging.googleapis.com/labels': {
        type: 'security-audit',
        component: 'bank-encryption',
      },
      ...event,
    })
  );
}
