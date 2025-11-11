'use client';

import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/lib/firebaseClient';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserPlus, UserMinus, RefreshCw, Shield, AlertCircle, CheckCircle2 } from 'lucide-react';

interface GoogleUser {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  isAdmin: boolean;
  disabled: boolean;
  createdAt: string;
}

export default function AdminManagementPage() {
  const { loading: authLoading, error: authError, isAdmin } = useAdminAuth();
  const [users, setUsers] = useState<GoogleUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const app = getFirebaseApp();
  const functions = getFunctions(app || undefined);

  useEffect(() => {
    if (!authLoading && isAdmin) {
      loadUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAdmin]);

  const loadUsers = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const listGoogleUsers = httpsCallable(functions, 'listGoogleUsers');
      const result = await listGoogleUsers();
      const data = result.data as { success: boolean; users: GoogleUser[] };

      if (data.success) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Error loading users:', error);
      setMessage({
        type: 'error',
        text: `ユーザー一覧の取得に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSetAdmin = async (uid: string, email: string) => {
    if (!window.confirm(`${email} に管理者権限を付与しますか？`)) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const setAdminClaim = httpsCallable(functions, 'setAdminClaim');
      const result = await setAdminClaim({ uid });
      const data = result.data as { success: boolean; message: string };

      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        await loadUsers(); // リロード
      }
    } catch (error) {
      console.error('Error setting admin claim:', error);
      setMessage({
        type: 'error',
        text: `管理者権限の付与に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAdmin = async (uid: string, email: string) => {
    if (!window.confirm(`${email} の管理者権限を削除しますか？`)) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const removeAdminClaim = httpsCallable(functions, 'removeAdminClaim');
      const result = await removeAdminClaim({ uid });
      const data = result.data as { success: boolean; message: string };

      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        await loadUsers(); // リロード
      }
    } catch (error) {
      console.error('Error removing admin claim:', error);
      setMessage({
        type: 'error',
        text: `管理者権限の削除に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
      });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="container mx-auto max-w-6xl p-6">
        <div className="text-center py-20">
          <p className="text-gray-600">認証確認中...</p>
        </div>
      </div>
    );
  }

  if (authError || !isAdmin) {
    return (
      <div className="container mx-auto max-w-6xl p-6">
        <div className="text-center py-20">
          <p className="text-red-600 font-semibold">管理者としてログインしてください</p>
          {authError && <p className="text-sm text-gray-600 mt-2">{authError}</p>}
        </div>
      </div>
    );
  }

  const adminUsers = users.filter(u => u.isAdmin);
  const nonAdminUsers = users.filter(u => !u.isAdmin);

  return (
    <div className="container mx-auto max-w-6xl p-6">
      {/* ヘッダー */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">管理者ユーザー管理</h1>
        <p className="text-gray-600 mt-2">Googleログインユーザーの管理者権限を管理します</p>
      </div>

      {/* アクション */}
      <div className="mb-6 flex items-center gap-3">
        <Button onClick={loadUsers} disabled={loading} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          再読み込み
        </Button>
      </div>

      {/* メッセージ */}
      {message && (
        <div
          className={`mb-6 flex items-center gap-2 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* 管理者一覧 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            管理者ユーザー ({adminUsers.length})
          </CardTitle>
          <CardDescription>
            管理者権限を持つユーザーの一覧
          </CardDescription>
        </CardHeader>
        <CardContent>
          {adminUsers.length === 0 ? (
            <p className="text-gray-500 text-center py-4">管理者が見つかりませんでした</p>
          ) : (
            <div className="space-y-3">
              {adminUsers.map((user) => (
                <div
                  key={user.uid}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    {user.photoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.photoURL}
                        alt={user.displayName || user.email}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-600">
                        {user.email.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-gray-900">
                        {user.displayName || user.email}
                      </div>
                      <div className="text-sm text-gray-600">{user.email}</div>
                      <div className="text-xs text-gray-500">
                        登録日: {new Date(user.createdAt).toLocaleDateString('ja-JP')}
                      </div>
                    </div>
                    <Badge variant="default" className="ml-2">
                      管理者
                    </Badge>
                    {user.disabled && (
                      <Badge variant="destructive" className="ml-2">
                        無効
                      </Badge>
                    )}
                  </div>
                  <Button
                    onClick={() => handleRemoveAdmin(user.uid, user.email)}
                    disabled={loading}
                    variant="destructive"
                    size="sm"
                  >
                    <UserMinus className="w-4 h-4 mr-2" />
                    権限削除
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 一般ユーザー一覧 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Googleログインユーザー ({nonAdminUsers.length})
          </CardTitle>
          <CardDescription>
            管理者権限を持たないユーザーの一覧
          </CardDescription>
        </CardHeader>
        <CardContent>
          {nonAdminUsers.length === 0 ? (
            <p className="text-gray-500 text-center py-4">ユーザーが見つかりませんでした</p>
          ) : (
            <div className="space-y-3">
              {nonAdminUsers.map((user) => (
                <div
                  key={user.uid}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    {user.photoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.photoURL}
                        alt={user.displayName || user.email}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-600">
                        {user.email.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-gray-900">
                        {user.displayName || user.email}
                      </div>
                      <div className="text-sm text-gray-600">{user.email}</div>
                      <div className="text-xs text-gray-500">
                        登録日: {new Date(user.createdAt).toLocaleDateString('ja-JP')}
                      </div>
                    </div>
                    {user.disabled && (
                      <Badge variant="destructive" className="ml-2">
                        無効
                      </Badge>
                    )}
                  </div>
                  <Button
                    onClick={() => handleSetAdmin(user.uid, user.email)}
                    disabled={loading || user.disabled}
                    variant="outline"
                    size="sm"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    管理者に設定
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 注意事項 */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>注意事項</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
            <li>管理者権限を付与・削除した後、ユーザーは再ログインが必要です</li>
            <li>Googleプロバイダーでログインしたユーザーのみ管理者に設定できます</li>
            <li>管理者は全てのFirestoreデータにアクセスできます</li>
            <li>最低1人の管理者を維持してください</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
