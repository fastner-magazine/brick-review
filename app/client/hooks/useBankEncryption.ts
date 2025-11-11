import { useState, useCallback } from 'react';
import {
  encryptBankDataForServer,
  isEncryptionSupported,
  isSecureContext,
  type BankData,
} from '@/lib/encryption/clientCrypto';

export interface EncryptionState {
  isEncrypting: boolean;
  error: string | null;
  isSupported: boolean;
  isSecure: boolean;
}

export interface UseEncryptionReturn {
  encryptionState: EncryptionState;
  encryptBankInfo: (bankData: BankData) => Promise<{
    encryptedSessionKey: string;
    encryptedData: {
      ciphertext: string;
      iv: string;
      authTag: string;
    };
    keyInfo: {
      algorithm: string;
      keySize: number;
    };
  } | null>;
  checkEncryptionSupport: () => boolean;
}

/**
 * 銀行情報暗号化カスタムフック
 * 
 * 使用例:
 * ```tsx
 * const { encryptionState, encryptBankInfo } = useBankEncryption();
 * 
 * const encrypted = await encryptBankInfo({
 *   bankName: '三菱UFJ銀行',
 *   bankCode: '0005',
 *   branchName: '本店',
 *   branchCode: '001',
 *   accountNumber: '1234567',
 *   accountNameKana: 'ヤマダタロウ',
 * });
 * ```
 */
export function useBankEncryption(): UseEncryptionReturn {
  const [encryptionState, setEncryptionState] = useState<EncryptionState>({
    isEncrypting: false,
    error: null,
    isSupported: isEncryptionSupported(),
    isSecure: isSecureContext(),
  });

  /**
   * 暗号化サポート確認
   */
  const checkEncryptionSupport = useCallback((): boolean => {
    const supported = isEncryptionSupported();
    const secure = isSecureContext();

    setEncryptionState((prev) => ({
      ...prev,
      isSupported: supported,
      isSecure: secure,
    }));

    if (!supported) {
      setEncryptionState((prev) => ({
        ...prev,
        error: 'お使いのブラウザは暗号化機能をサポートしていません',
      }));
      return false;
    }

    if (!secure) {
      setEncryptionState((prev) => ({
        ...prev,
        error: 'セキュアな接続（HTTPS）が必要です',
      }));
      return false;
    }

    return true;
  }, []);

  /**
  * 銀行情報を暗号化
  */
  const encryptBankInfo = useCallback(
    async (bankData: BankData) => {
      // サポート確認
      if (!checkEncryptionSupport()) {
        return null;
      }

      setEncryptionState((prev) => ({
        ...prev,
        isEncrypting: true,
        error: null,
      }));

      try {
        console.log('[Encryption] Starting bank data encryption');
        console.log('[Encryption] Browser info:', {
          userAgent: navigator.userAgent,
          isSecureContext: window.isSecureContext,
          hasCrypto: typeof crypto !== 'undefined',
          hasCryptoSubtle: typeof crypto?.subtle !== 'undefined',
        });

        const result = await encryptBankDataForServer(bankData);

        console.log('[Encryption] Bank data encrypted successfully');

        setEncryptionState((prev) => ({
          ...prev,
          isEncrypting: false,
          error: null,
        }));

        return result;
      } catch (error) {
        console.error('[Encryption] Failed to encrypt bank data:', error);
        console.error('[Encryption] Error details:', {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        const errorMessage =
          error instanceof Error
            ? `暗号化処理に失敗しました\n\n原因: ${error.message}\n\nブラウザのコンソールで詳細を確認してください。`
            : '暗号化処理に失敗しました';

        setEncryptionState((prev) => ({
          ...prev,
          isEncrypting: false,
          error: errorMessage,
        }));

        return null;
      }
    },
    [checkEncryptionSupport]
  ); return {
    encryptionState,
    encryptBankInfo,
    checkEncryptionSupport,
  };
}
