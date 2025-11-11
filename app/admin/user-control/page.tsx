'use client';

import { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  isAdmin: boolean;
  disabled: boolean;
  createdAt: string;
}

export default function AdminControlPage() {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        loadUsers(user);
      }
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getIdToken = async (user?: FirebaseUser | null): Promise<string> => {
    const targetUser = user || currentUser;
    if (!targetUser) {
      throw new Error('ログインしていません');
    }
    return await targetUser.getIdToken();
  };

  const loadUsers = async (user?: FirebaseUser | null) => {
    setLoading(true);
    setMessage('');

    try {
      const token = await getIdToken(user);
      const response = await fetch('/admin/user-control/manage/api/list-users', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'ユーザー一覧の取得に失敗しました');
      }

      const data = await response.json();
      setUsers(data.users);
      setMessage('✅ ユーザー一覧を読み込みました');
    } catch (error: any) {
      console.error('エラー:', error);
      setMessage(`❌ エラー: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleUserDisabled = async (uid: string, currentDisabled: boolean) => {
    setLoading(true);
    setMessage('');

    try {
      const token = await getIdToken();
      const response = await fetch('/admin/user-control/manage/api/set-disabled', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid, disabled: !currentDisabled }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'ユーザー状態の変更に失敗しました');
      }

      const data = await response.json();
      setMessage(`✅ ${data.message}`);
      await loadUsers(); // リロード
    } catch (error: any) {
      console.error('エラー:', error);
      setMessage(`❌ エラー: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleAdmin = async (uid: string, currentIsAdmin: boolean) => {
    setLoading(true);
    setMessage('');

    try {
      const token = await getIdToken();
      const endpoint = currentIsAdmin 
        ? '/admin/user-control/manage/api/remove-admin'
        : '/admin/user-control/manage/api/set-admin';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Admin権限の変更に失敗しました');
      }

      const data = await response.json();
      setMessage(`✅ ${data.message}`);
      await loadUsers(); // リロード
    } catch (error: any) {
      console.error('エラー:', error);
      setMessage(`❌ エラー: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="container mx-auto p-8">
        <div className="text-center">
          <p className="text-xl">ログインしてください</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">ユーザー管理</h1>

      <div className="mb-6">
        <button
          onClick={() => loadUsers()}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '読み込み中...' : 'ユーザー一覧を更新'}
        </button>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded ${message.startsWith('✅') ? 'bg-green-50' : 'bg-red-50'}`}>
          <pre className="whitespace-pre-wrap text-sm">{message}</pre>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 border text-left">ユーザー</th>
              <th className="px-4 py-2 border text-left">Email</th>
              <th className="px-4 py-2 border text-center">Admin</th>
              <th className="px-4 py-2 border text-center">状態</th>
              <th className="px-4 py-2 border text-center">作成日</th>
              <th className="px-4 py-2 border text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.uid} className={user.disabled ? 'bg-gray-50' : ''}>
                <td className="px-4 py-2 border">
                  <div className="flex items-center space-x-2">
                    {user.photoURL && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
                    )}
                    <span>{user.displayName || '-'}</span>
                  </div>
                </td>
                <td className="px-4 py-2 border">{user.email}</td>
                <td className="px-4 py-2 border text-center">
                  <span className={`px-2 py-1 rounded text-xs ${user.isAdmin ? 'bg-purple-100 text-purple-800' : 'bg-gray-100'}`}>
                    {user.isAdmin ? '管理者' : '-'}
                  </span>
                </td>
                <td className="px-4 py-2 border text-center">
                  <span className={`px-2 py-1 rounded text-xs ${user.disabled ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                    {user.disabled ? '無効' : '有効'}
                  </span>
                </td>
                <td className="px-4 py-2 border text-center text-sm">
                  {new Date(user.createdAt).toLocaleDateString('ja-JP')}
                </td>
                <td className="px-4 py-2 border text-center">
                  <div className="flex flex-col space-y-1">
                    <button
                      onClick={() => toggleUserDisabled(user.uid, user.disabled)}
                      disabled={loading}
                      className={`px-3 py-1 rounded text-xs ${
                        user.disabled
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-gray-600 hover:bg-gray-700 text-white'
                      } disabled:opacity-50`}
                    >
                      {user.disabled ? '有効化' : '無効化'}
                    </button>
                    <button
                      onClick={() => toggleAdmin(user.uid, user.isAdmin)}
                      disabled={loading}
                      className={`px-3 py-1 rounded text-xs ${
                        user.isAdmin
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-purple-600 hover:bg-purple-700 text-white'
                      } disabled:opacity-50`}
                    >
                      {user.isAdmin ? 'Admin削除' : 'Admin付与'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 border p-4 rounded bg-yellow-50">
        <h3 className="font-semibold mb-2">⚠️ 注意事項:</h3>
        <ul className="list-disc list-inside text-sm space-y-1">
          <li>新規ユーザーは自動的に無効化されます</li>
          <li>管理者が有効化してからログインできるようになります</li>
          <li>Admin権限を付与すると、このページにアクセスできるようになります</li>
          <li>自分自身を無効化しないように注意してください</li>
        </ul>
      </div>
    </div>
  );
}
