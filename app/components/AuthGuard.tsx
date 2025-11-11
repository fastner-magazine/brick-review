'use client';

import { useAuth } from '@/hooks/useAuth';
import { initAppCheck } from '@/lib/appCheck';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface AuthGuardProps {
 children: ReactNode;
 /** 匿名ユーザーを許可するか */
 allowAnonymous?: boolean;
 /** 未認証時に自動で匿名サインインを試みるか */
 autoSignIn?: boolean;
 /** 認証が必要な場合に遷移させる先 */
 redirectTo?: string;
}

/**
 * 管理画面用の認証ガード。
 * allowAnonymous が false の場合は匿名ログインを拒否し、redirectTo へ遷移させる。
 */
export function AuthGuard({
 children,
 allowAnonymous = false,
 autoSignIn = false,
 redirectTo = '/login',
}: AuthGuardProps) {
 const { user, loading, error } = useAuth(autoSignIn);
 const router = useRouter();
 // Avoid calling useSearchParams/usePathname at render time to prevent
 // prerender-time hook bailout errors. Instead, read location in an effect
 // after mount and store values in state.
 const [pathname, setPathname] = useState<string | null>(null);
 const [searchQuery, setSearchQuery] = useState<string | null>(null);
 // redirectedRef ensures redirect is performed at most once even in StrictMode
 const redirectedRef = useRef(false);
 
 useEffect(() => {
  // Parse location once on client to avoid repeated parsing and to prevent
  // calling window APIs during render. Using new URL(url) avoids manual
  // string handling and is done exactly once.
  try {
   const u = new URL(window.location.href);
   setPathname(u.pathname || null);
   // store raw query string without leading '?'
   setSearchQuery(u.search ? u.search.replace(/^\?/, '') : null);
  } catch {
   // fallback to direct values if URL parsing fails
   setPathname(window.location.pathname ?? null);
   setSearchQuery(window.location.search ? window.location.search.replace(/^\?/, '') : null);
  }
  // empty deps -> run once
 }, []);
 // removed redirectInitiated state in favor of redirectedRef to ensure idempotence

 useEffect(() => {
  initAppCheck();
 }, []);

 const requiresRedirect = useMemo(() => {
  if (!user) return true;
  if (!allowAnonymous && user.isAnonymous) return true;
  return false;
 }, [user, allowAnonymous]);

 useEffect(() => {
    if (loading) return;
    if (!requiresRedirect) {
       // allow future redirects if requirements change
       redirectedRef.current = false;
       return;
      }

    if (!router) return;

      // pathname and searchQuery are initialized in a client-only effect.
      // If they are not yet available, wait for them to be set before redirecting.
      if (pathname === null) return;

      const redirectPathname = redirectTo.split('?')[0];
      const isAlreadyOnRedirectPage = pathname === redirectPathname;
      if (isAlreadyOnRedirectPage) return;

      // ensure redirect runs at most once (idempotent). This also prevents
      // double-running in React StrictMode during development.
      if (redirectedRef.current) return;

      const currentPath = pathname ?? '/';
      const queryString = searchQuery ?? '';
      const fullPath = queryString ? `${currentPath}?${queryString}` : currentPath;
      const params = new URLSearchParams();
      params.set('redirect', fullPath);

      redirectedRef.current = true;
      const separator = redirectTo.includes('?') ? '&' : '?';
      // use replace to avoid creating history entries that could loop the user
      router.replace(`${redirectTo}${separator}${params.toString()}`);
 }, [loading, requiresRedirect, router, pathname, searchQuery, redirectTo]);

 if (loading) {
  return (
   <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="text-center space-y-4">
     <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
     <p className="text-gray-600">認証を確認しています...</p>
    </div>
   </div>
  );
 }

 if (error) {
  return (
   <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="text-center space-y-4 p-8 bg-white rounded-lg shadow-lg max-w-md">
     <div className="text-red-600 text-5xl">⚠️</div>
     <h2 className="text-xl font-semibold text-gray-900">認証エラー</h2>
     <p className="text-gray-600">{error}</p>
     <button
      onClick={() => window.location.reload()}
      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
     >
      再読み込み
     </button>
    </div>
   </div>
  );
 }

 if (requiresRedirect) {
  return (
   <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="text-center space-y-4 p-8 bg-white rounded-lg shadow-lg max-w-md">
     <div className="text-yellow-600 text-5xl">🔒</div>
     <h2 className="text-xl font-semibold text-gray-900">ログインが必要です</h2>
     <p className="text-gray-600">ログインページへ移動しています...</p>
    </div>
   </div>
  );
 }

 // 認証成功 - 子コンポーネントを表示
 return <>{children}</>;
}
