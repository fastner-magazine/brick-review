'use client';

import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';

export default function SetAdminTestPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleSetAdmin = async () => {
    setLoading(true);
    setResult('');

    try {
      if (!user) {
        setResult('❌ ログインしていません');
        return;
      }

      console.log('現在のユーザー:', user.email, user.uid);

      // us-central1 リージョンの Functions を使用（デプロイされているリージョン）
      const functions = getFunctions(undefined, 'us-central1');
      const setAdminClaim = httpsCallable(functions, 'setAdminClaim');

      console.log('setAdminClaim 関数を呼び出し中...');
      const response = await setAdminClaim({ uid: user.uid });
      console.log('✅ 関数レスポンス:', response.data);

      setResult(`✅ 成功: ${JSON.stringify(response.data, null, 2)}`);

      // トークンを更新
      console.log('トークンを更新中...');
      await user.getIdToken(true);
      const tokenResult = await user.getIdTokenResult();
      console.log('✅ 更新後のトークン claims:', tokenResult.claims);

      setResult(prev => prev + '\n\n✅ トークン更新完了\n\nカスタムクレーム:\n' + JSON.stringify(tokenResult.claims, null, 2));
    } catch (error: any) {
      console.error('❌ エラー:', error);
      setResult(`❌ エラー: ${error.code || error.message}\n${JSON.stringify(error, null, 2)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckToken = async () => {
    setLoading(true);
    setResult('');

    try {
      if (!user) {
        setResult('❌ ログインしていません');
        return;
      }

      const tokenResult = await user.getIdTokenResult();
      console.log('現在のトークン claims:', tokenResult.claims);

      setResult(`👤 ユーザー: ${user.email}\nUID: ${user.uid}\n\nカスタムクレーム:\n${JSON.stringify(tokenResult.claims, null, 2)}\n\nadmin権限: ${tokenResult.claims.admin ? '✅ あり' : '❌ なし'}`);
    } catch (error: any) {
      console.error('❌ エラー:', error);
      setResult(`❌ エラー: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Admin権限設定テスト</h1>

      <div className="space-y-4 max-w-2xl">
        <div className="border p-4 rounded">
          <h2 className="text-xl font-semibold mb-4">現在のユーザー</h2>
          <p>Email: {user?.email || '未ログイン'}</p>
          <p>UID: {user?.uid || '-'}</p>
        </div>

        <div className="space-x-4">
          <button
            onClick={handleSetAdmin}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '処理中...' : '自分にAdmin権限を付与'}
          </button>

          <button
            onClick={handleCheckToken}
            disabled={loading}
            className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? '処理中...' : '現在のトークンを確認'}
          </button>
        </div>

        {result && (
          <div className="border p-4 rounded bg-gray-50">
            <h3 className="font-semibold mb-2">結果:</h3>
            <pre className="whitespace-pre-wrap text-sm">{result}</pre>
          </div>
        )}

        <div className="border p-4 rounded bg-yellow-50">
          <h3 className="font-semibold mb-2">⚠️ 注意事項:</h3>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>この機能は kyotobrickoffice@gmail.com (UID: bTcOgqus08aFmW9EuKrCyDzfVPo1) のみが使用できます</li>
            <li>Admin権限付与後は、Firestore rulesも更新する必要があります</li>
            <li>本番環境では、このページを削除またはアクセス制限してください</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
