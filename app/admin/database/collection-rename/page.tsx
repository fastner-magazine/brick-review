'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function CollectionRenamePage() {
 const [sourceCollection, setSourceCollection] = useState('');
 const [targetCollection, setTargetCollection] = useState('');
 const [batchSize, setBatchSize] = useState('500');
 const [isProcessing, setIsProcessing] = useState(false);
 const [logs, setLogs] = useState<string[]>([]);
 const [error, setError] = useState('');
 const [success, setSuccess] = useState(''); const addLog = (message: string) => {
  setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
 };

 const handleRename = async () => {
  if (!sourceCollection || !targetCollection) {
   setError('コレクション名を両方入力してください');
   return;
  }

  if (sourceCollection === targetCollection) {
   setError('同じコレクション名は指定できません');
   return;
  }

  setError('');
  setSuccess('');
  setLogs([]);
  setIsProcessing(true);

  try {
   addLog(`開始: ${sourceCollection} → ${targetCollection}`);
   addLog(`バッチサイズ: ${batchSize}件`);

   const response = await fetch('/api/collection-rename', {
    method: 'POST',
    headers: {
     'Content-Type': 'application/json',
    },
    body: JSON.stringify({
     sourceCollection,
     targetCollection,
     batchSize: parseInt(batchSize, 10),
    }),
   });

   const data = await response.json();

   if (!response.ok) {
    throw new Error(data.error || 'コレクション名変更に失敗しました');
   }

   addLog(`✅ 完了: ${data.processed}件のドキュメントをコピー`);
   addLog(`処理時間: ${data.duration}ms`);
   setSuccess(`${data.processed}件のドキュメントを正常にコピーしました`);
  } catch (err) {
   const errorMessage = err instanceof Error ? err.message : '不明なエラー';
   setError(errorMessage);
   addLog(`❌ エラー: ${errorMessage}`);
  } finally {
   setIsProcessing(false);
  }
 };

 return (
  <div className="container mx-auto p-6 max-w-4xl">
   <Card>
    <CardHeader>
     <CardTitle>Firestore コレクション名変更</CardTitle>
     <CardDescription>
      既存のコレクションを新しい名前のコレクションにコピーします
      <br />
      <span className="text-red-500 font-semibold">
       ⚠️ 注意: 元のコレクションは削除されません（手動で削除してください）
      </span>
     </CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
     <div className="space-y-4">
      <div className="space-y-2">
       <Label htmlFor="source">元のコレクション名</Label>
       <Input
        id="source"
        placeholder="例: old_collection"
        value={sourceCollection}
        onChange={(e) => setSourceCollection(e.target.value)}
        disabled={isProcessing}
       />
      </div>

      <div className="space-y-2">
       <Label htmlFor="target">新しいコレクション名</Label>
       <Input
        id="target"
        placeholder="例: new_collection"
        value={targetCollection}
        onChange={(e) => setTargetCollection(e.target.value)}
        disabled={isProcessing}
       />
      </div>

      <div className="space-y-2">
       <Label htmlFor="batchSize">バッチサイズ（一度に処理する件数）</Label>
       <Input
        id="batchSize"
        type="number"
        min="1"
        max="500"
        value={batchSize}
        onChange={(e) => setBatchSize(e.target.value)}
        disabled={isProcessing}
       />
      </div>
     </div>

     {error && (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 px-4 py-3 rounded">
       {error}
      </div>
     )}

     {success && (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 px-4 py-3 rounded">
       {success}
      </div>
     )}

     <Button
      onClick={handleRename}
      disabled={isProcessing || !sourceCollection || !targetCollection}
      className="w-full"
     >
      {isProcessing ? '処理中...' : 'コレクション名を変更（コピー）'}
     </Button>

     {logs.length > 0 && (
      <div className="space-y-2">
       <Label>処理ログ</Label>
       <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md max-h-96 overflow-y-auto">
        {logs.map((log, index) => (
         <div key={index} className="text-sm font-mono mb-1">
          {log}
         </div>
        ))}
       </div>
      </div>
     )}

     <div className="text-sm text-gray-500 space-y-1">
      <p>📝 使い方:</p>
      <ol className="list-decimal list-inside space-y-1 ml-2">
       <li>元のコレクション名と新しいコレクション名を入力</li>
       <li>バッチサイズを設定（デフォルト: 500件）</li>
       <li>「コレクション名を変更」ボタンをクリック</li>
       <li>完了後、必要に応じて元のコレクションを手動削除</li>
      </ol>
     </div>
    </CardContent>
   </Card>
  </div>
 );
}
