'use client';

import { useBankEncryption } from '../hooks/useBankEncryption';
import type { BankData } from '@/lib/encryption/clientCrypto';

export interface SecureBankFormProps {
 /** 銀行情報 */
 bankData: BankData;
 /** 暗号化成功時のコールバック */
 onEncryptSuccess: (encryptedPayload: {
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
 }) => void;
 /** 暗号化失敗時のコールバック */
 onEncryptError?: (error: string) => void;
 /** 子要素（レンダープロップパターン） */
 children: (encryptFn: () => Promise<void>, state: {
  isEncrypting: boolean;
  error: string | null;
 }) => React.ReactNode;
}

/**
 * 銀行情報暗号化コンポーネント
 * 
 * 使用例:
 * ```tsx
 * <SecureBankForm
 *   bankData={{
 *     bankName: formData.bankName,
 *     bankCode: formData.bankCode,
 *     branchName: formData.branchName,
 *     branchCode: formData.branchCode,
 *     accountNumber: formData.accountNumber,
 *     accountNameKana: formData.accountNameKana,
 *   }}
 *   onEncryptSuccess={(encrypted) => {
 *     // 暗号化済みデータをサーバに送信
 *     submitToServer(encrypted);
 *   }}
 *   onEncryptError={(error) => {
 *     alert(error);
 *   }}
 * >
 *   {(encrypt, { isEncrypting, error }) => (
 *     <button onClick={encrypt} disabled={isEncrypting}>
 *       {isEncrypting ? '暗号化中...' : '送信'}
 *     </button>
 *   )}
 * </SecureBankForm>
 * ```
 */
export function SecureBankForm({
 bankData,
 onEncryptSuccess,
 onEncryptError,
 children,
}: SecureBankFormProps) {
 const { encryptionState, encryptBankInfo } = useBankEncryption();

 const handleEncrypt = async () => {
  const result = await encryptBankInfo(bankData);

  if (result) {
   onEncryptSuccess(result);
  } else if (encryptionState.error) {
   onEncryptError?.(encryptionState.error);
  }
 };

 return (
  <>
   {children(handleEncrypt, {
    isEncrypting: encryptionState.isEncrypting,
    error: encryptionState.error,
   })}
  </>
 );
}
