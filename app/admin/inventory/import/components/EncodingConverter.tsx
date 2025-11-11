'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import Encoding from 'encoding-japanese';

interface EncodingConverterProps {
 csvText: string;
 onConvert?: (_convertedText: string) => void;
}

export function EncodingConverter({ csvText, onConvert }: EncodingConverterProps) {
 const [detectedEncoding, setDetectedEncoding] = useState<'UTF-8' | 'Shift-JIS' | 'Unknown'>('UTF-8');
 const [hasIssue, setHasIssue] = useState(false);
 const [isConverting, setIsConverting] = useState(false);

 useEffect(() => {
  if (!csvText) {
   setDetectedEncoding('UTF-8');
   setHasIssue(false);
   return;
  }

  // encoding-japaneseを使用したエンコーディング検出
  const detected = Encoding.detect(csvText);

  if (detected === 'SJIS' || detected === 'EUCJP') {
   setDetectedEncoding('Shift-JIS');
   setHasIssue(true);
  } else if (detected === 'UTF8' || detected === 'UNICODE') {
   setDetectedEncoding('UTF-8');
   setHasIssue(false);
  } else {
   // 文字化けパターンの追加チェック
   const hasReplacementChar = /\uFFFD/.test(csvText);
   if (hasReplacementChar) {
    setDetectedEncoding('Shift-JIS');
    setHasIssue(true);
   } else {
    setDetectedEncoding('UTF-8');
    setHasIssue(false);
   }
  }
 }, [csvText]);

 const handleConvert = async () => {
  if (!csvText || !onConvert) return;

  setIsConverting(true);

  try {
   // 文字列をUint8Array（バイト配列）に変換
   const encoder = new TextEncoder();
   const uint8Array = encoder.encode(csvText);

   // Shift-JISとして解釈してUTF-8に変換
   const detectedEncoding = Encoding.detect(uint8Array);

   let convertedArray: number[];

   if (detectedEncoding === 'SJIS' || detectedEncoding === 'EUCJP') {
    // Shift-JIS/EUC-JP → UTF-8
    convertedArray = Encoding.convert(uint8Array, {
     to: 'UNICODE',
     from: detectedEncoding
    });
   } else {
    // 既にUTF-8の場合はそのまま
    convertedArray = Array.from(uint8Array);
   }

   // バイト配列を文字列に戻す
   const convertedText = Encoding.codeToString(convertedArray);

   // 親コンポーネントに変換結果を渡す
   onConvert(convertedText);

   setHasIssue(false);
   setDetectedEncoding('UTF-8');

  } catch (error) {
   console.error('Encoding conversion error:', error);
   alert('エンコーディング変換に失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'));
  } finally {
   setIsConverting(false);
  }
 };

 if (!csvText) return null;

 return (
  <Card className={hasIssue ? 'border-yellow-300 bg-yellow-50' : 'border-green-300 bg-green-50'}>
   <CardHeader className="pb-3">
    <CardTitle className="text-sm flex items-center gap-2">
     <FileText className="w-4 h-4" />
     エンコーディング検出
    </CardTitle>
    <CardDescription className="text-xs">
     ファイルの文字エンコーディングを自動検出します
    </CardDescription>
   </CardHeader>
   <CardContent>
    <div className="flex items-center justify-between">
     <div className="flex items-center gap-3">
      {hasIssue ? (
       <AlertCircle className="w-5 h-5 text-yellow-600" />
      ) : (
       <CheckCircle2 className="w-5 h-5 text-green-600" />
      )}
      <div>
       <div className="text-sm font-medium text-gray-900">
        検出結果: <Badge variant={hasIssue ? 'destructive' : 'default'}>{detectedEncoding}</Badge>
       </div>
       {hasIssue && (
        <div className="text-xs text-yellow-700 mt-1">
         Shift-JISの可能性があります。UTF-8に変換することを推奨します。
        </div>
       )}
      </div>
     </div>

     {hasIssue && (
      <Button
       onClick={handleConvert}
       size="sm"
       variant="outline"
       className="border-yellow-600 text-yellow-700 hover:bg-yellow-100"
       disabled={isConverting}
      >
       <RefreshCw className={`w-4 h-4 mr-2 ${isConverting ? 'animate-spin' : ''}`} />
       {isConverting ? '変換中...' : 'UTF-8に変換'}
      </Button>
     )}
    </div>
   </CardContent>
  </Card>
 );
}
