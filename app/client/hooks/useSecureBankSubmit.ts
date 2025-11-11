'use client';

import { useState } from 'react';
import { useBankEncryption } from './useBankEncryption';
import type { BankData } from '@/lib/encryption/clientCrypto';

export interface VerificationSessionSubmit {
  sessionId: string;
  videoUrls: string[];
  stepMarkers: any[];
  deviceInfo: any;
}

export interface UseSecureBankSubmitOptions {
 /** その他のフォームデータ */
 otherFormData: Record<string, any>;
 /** 送信成功時のコールバック */
 onSuccess?: (_response: { success: boolean; receptionNumber: string }) => void;
 /** 送信失敗時のコールバック */
 onError?: (_error: string) => void;
}

export interface UseSecureBankSubmitReturn {
 /** 送信実行関数（bankData + オプションの追加データ） */
 submitSecure: (_bankData: BankData & { [key: string]: any }) => Promise<void>;
 /** 送信中かどうか */
 isSubmitting: boolean;
 /** エラーメッセージ */
 error: string | null;
}

/**
 * 銀行情報を暗号化してサーバに送信するカスタムフック
 * 
 * 使用例:
 * ```tsx
 * const { submitSecure, isSubmitting, error } = useSecureBankSubmit({
 *   otherFormData: {
 *     name: '山田太郎',
 *     address: '東京都...',
 *     items: [...],
 *   },
 *   onSuccess: (response) => {
 *     console.log('受付番号:', response.receptionNumber);
 *     setCurrentStep(7);
 *   },
 *   onError: (error) => {
 *     alert(error);
 *   },
 * });
 * 
 * // 送信実行
 * await submitSecure({
 *   bankName: '三菱UFJ銀行',
 *   bankCode: '0005',
 *   branchName: '本店',
 *   branchCode: '001',
 *   accountNumber: '1234567',
 *   accountNameKana: 'ヤマダタロウ',
 * });
 * ```
 */
export function useSecureBankSubmit({
 otherFormData,
 onSuccess,
 onError,
}: UseSecureBankSubmitOptions): UseSecureBankSubmitReturn {
 const { encryptBankInfo } = useBankEncryption();
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [error, setError] = useState<string | null>(null);

 const submitSecure = async (bankData: BankData & { [key: string]: any }) => {
  setIsSubmitting(true);
  setError(null);

  try {
   console.log('[SecureSubmit] Starting encryption...');
   console.log('[SecureSubmit] Environment:', {
    origin: typeof window !== 'undefined' ? window.location.origin : 'SSR',
    protocol: typeof window !== 'undefined' ? window.location.protocol : 'unknown',
   });

   // bankData から銀行情報のみを抽出して暗号化
   const bankInfoOnly: BankData = {
    bankName: bankData.bankName,
    bankCode: bankData.bankCode,
    branchName: bankData.branchName,
    branchCode: bankData.branchCode,
    accountNumber: bankData.accountNumber,
    accountNameKana: bankData.accountNameKana,
   };

   // 1. 銀行情報を暗号化
   const encrypted = await encryptBankInfo(bankInfoOnly);

   if (!encrypted) {
    throw new Error('暗号化に失敗しました。ブラウザのコンソールで詳細を確認してください。');
   }

   console.log('[SecureSubmit] Encryption successful, sending to server...');

   // bankData から銀行情報フィールドを除外し、追加データのみを抽出
   const bankInfoKeys = ['bankName', 'bankCode', 'branchName', 'branchCode', 'accountNumber', 'accountNameKana'] as const;
   const additionalData = Object.fromEntries(
    Object.entries(bankData).filter(([key]) => !bankInfoKeys.includes(key as any))
   );
   
   const mergedFormData = {
    ...otherFormData,
    ...additionalData,
   };

   // 2. サーバに送信
   const response = await fetch('/api/buy_requests_secure', {
    method: 'POST',
    headers: {
     'Content-Type': 'application/json',
    },
    body: JSON.stringify({
     encryptedSessionKey: encrypted.encryptedSessionKey,
     encryptedData: encrypted.encryptedData,
     ...mergedFormData,
    }),
   });

   console.log('[SecureSubmit] Server response status:', response.status);

   if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('[SecureSubmit] Server error:', errorData);
    throw new Error(errorData.error || `サーバエラー: ${response.status}`);
   }

   const result = await response.json();
   console.log('[SecureSubmit] Submission successful:', result);

   // 3. 成功コールバック
   onSuccess?.(result);

   // 結果を返す
   return result;
  } catch (err) {
   const errorMessage =
    err instanceof Error ? err.message : '送信に失敗しました';

   console.error('[SecureSubmit] Submission failed:', err);
   setError(errorMessage);
   onError?.(errorMessage);

   // エラーの場合はthrowして呼び出し元でキャッチできるようにする
   throw err;
  } finally {
   setIsSubmitting(false);
  }
 }; return {
  submitSecure,
  isSubmitting,
  error,
 };
}
