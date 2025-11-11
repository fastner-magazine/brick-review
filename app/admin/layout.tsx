'use client';

import { ReactNode } from 'react';
import { AdminAuthProvider, useAdminAuthContext } from '@/contexts/AdminAuthContext';

/**
 * 管理画面認証ガード（内部コンポーネント）
 */
function AdminAuthGuard({ children }: { children: ReactNode }) {
  const { loading, isAdmin, error } = useAdminAuthContext();

  // 認証確認中 - 子コンポーネントを一切レンダリングしない
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #e0e0e0',
            borderTop: '4px solid #007bff',
            borderRadius: '50%',
            margin: '0 auto 1rem',
            animation: 'spin 1s linear infinite'
          }} />
          <p style={{ color: '#666', fontSize: '0.95rem' }}>認証確認中...</p>
        </div>
      </div>
    );
  }

  // 認証エラーまたは非管理者 - 子コンポーネントを一切レンダリングしない
  if (error || !isAdmin) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          maxWidth: '400px'
        }}>
          <div style={{
            fontSize: '3rem',
            marginBottom: '1rem'
          }}>🔒</div>
          <h2 style={{
            color: '#dc3545',
            fontSize: '1.25rem',
            fontWeight: '600',
            marginBottom: '0.5rem'
          }}>
            アクセスが拒否されました
          </h2>
          <p style={{
            color: '#666',
            fontSize: '0.95rem',
            marginBottom: '1rem'
          }}>
            管理者としてログインしてください
          </p>
          {error && (
            <p style={{
              color: '#999',
              fontSize: '0.85rem',
              fontStyle: 'italic'
            }}>
              {error}
            </p>
          )}
          <button
            onClick={() => {
              // ログインページにリダイレクト
              window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
            }}
            style={{
              marginTop: '1.5rem',
              padding: '0.5rem 1.5rem',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.95rem'
            }}
          >
            ログインページへ
          </button>
        </div>
      </div>
    );
  }

  // ✅ 認証成功 - この時点で確実に isAdmin = true
  // 子コンポーネント（各ページ）の Firestore アクセスは認証後にのみ実行される
  return <>{children}</>;
}

/**
 * 管理画面用レイアウト
 * 
 * 重要な変更点:
 * 1. AdminAuthProvider で認証状態を Context 経由で提供
 * 2. AdminAuthGuard で認証チェックを実施
 * 3. 認証完了後のみ子コンポーネント（各ページ）をレンダリング
 * 4. 各ページは useAdminAuthContext() で認証状態を取得し、loading === false && isAdmin === true の場合のみデータ取得
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminAuthGuard>{children}</AdminAuthGuard>
    </AdminAuthProvider>
  );
}

