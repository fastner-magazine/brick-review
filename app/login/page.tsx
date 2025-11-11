'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getFirebaseAuth } from '@/lib/firebaseClient';
import {
 GoogleAuthProvider,
 signInWithEmailAndPassword,
 signInWithPopup,
 signOut,
} from 'firebase/auth';
import { Button } from '@/components/ui/button';

function sanitizeRedirect(target: string | null | undefined) {
 if (!target) return '/admin';
 if (!target.startsWith('/')) return '/admin';
 return target;
}

export default function LoginPage() {
 const router = useRouter();
 // Avoid calling useSearchParams() at render time (can cause prerender bailout).
 // Read the query string on client after mount instead.
 const [searchQueryStr, setSearchQueryStr] = useState<string | null>(null);

 useEffect(() => {
  setSearchQueryStr(window.location.search ? window.location.search.replace(/^\?/, '') : null);
 }, []);
 const { user, loading, error } = useAuth(false);
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [submitting, setSubmitting] = useState(false);
 const [signInError, setSignInError] = useState<string | null>(null);

 const redirectTarget = useMemo(() => {
  try {
   const params = new URLSearchParams(searchQueryStr ?? '');
   const raw = params.get('redirect');
   return sanitizeRedirect(raw);
    } catch {
     return sanitizeRedirect(null);
    }
 }, [searchQueryStr]);

 useEffect(() => {
  if (!loading && user?.isAnonymous) {
   const auth = getFirebaseAuth();
   if (auth) {
    signOut(auth).catch(() => undefined);
   }
  }
 }, [loading, user]);

 useEffect(() => {
  if (loading) return;
  if (user && !user.isAnonymous) {
   router.replace(redirectTarget);
  }
 }, [loading, user, router, redirectTarget]);

 const handleEmailSignIn = async (event: React.FormEvent) => {
  event.preventDefault();
  const auth = getFirebaseAuth();
  if (!auth) {
   setSignInError('Firebase Authentication が初期化されていません');
   return;
  }

  setSubmitting(true);
  setSignInError(null);
  try {
   await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (err) {
   console.error('[login] Email sign-in failed', err);
   if (err instanceof Error) {
    setSignInError(err.message);
   } else {
    setSignInError('メールアドレスでのサインインに失敗しました');
   }
  } finally {
   setSubmitting(false);
  }
 };

 const handleGoogleSignIn = async () => {
  const auth = getFirebaseAuth();
  if (!auth) {
   setSignInError('Firebase Authentication が初期化されていません');
   return;
  }

  setSubmitting(true);
  setSignInError(null);
  try {
   const provider = new GoogleAuthProvider();
   provider.setCustomParameters({ prompt: 'select_account' });
   await signInWithPopup(auth, provider);
  } catch (err) {
   console.error('[login] Google sign-in failed', err);
   if (err instanceof Error) {
    setSignInError(err.message);
   } else {
    setSignInError('Google でのサインインに失敗しました');
   }
  } finally {
   setSubmitting(false);
  }
 };

 const handleSignOut = async () => {
  const auth = getFirebaseAuth();
  if (!auth) return;
  setSubmitting(true);
  try {
   await signOut(auth);
  } finally {
   setSubmitting(false);
  }
 };

 const showLoginForm = !user || user.isAnonymous;

 return (
  <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 py-12">
   <div className="w-full max-w-md space-y-6">
    <div className="text-center space-y-2">
     <h1 className="text-2xl font-semibold text-gray-900">管理画面ログイン</h1>
     <p className="text-sm text-gray-600">
      指定のアカウントでサインインしてください。
     </p>
    </div>

    {(error || signInError) && (
     <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {error || signInError}
     </div>
    )}

    {showLoginForm ? (
     <>
      <form onSubmit={handleEmailSignIn} className="space-y-4 bg-white p-6 rounded-lg shadow">
       <label className="block text-sm font-medium text-gray-700">
        メールアドレス
        <input
         type="email"
         value={email}
         onChange={(event) => setEmail(event.target.value)}
         className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring"
         placeholder="admin@example.com"
         autoComplete="email"
         required
        />
       </label>
       <label className="block text-sm font-medium text-gray-700">
        パスワード
        <input
         type="password"
         value={password}
         onChange={(event) => setPassword(event.target.value)}
         className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring"
         placeholder="********"
         autoComplete="current-password"
         required
        />
       </label>
       <Button
        type="submit"
        className="w-full"
        disabled={submitting}
       >
        {submitting ? 'サインイン中...' : 'メールアドレスでサインイン'}
       </Button>
      </form>

      <div className="flex items-center">
       <div className="flex-1 border-t border-gray-300" />
       <span className="px-4 text-xs uppercase tracking-wide text-gray-500">または</span>
       <div className="flex-1 border-t border-gray-300" />
      </div>

      <Button
       type="button"
       variant="outline"
       className="w-full bg-white"
       onClick={handleGoogleSignIn}
       disabled={submitting}
      >
       {submitting ? 'サインイン中...' : 'Google でサインイン'}
      </Button>
     </>
    ) : (
     <div className="space-y-4 bg-white p-6 rounded-lg shadow text-center">
      <p className="text-sm text-gray-700">
       {user?.email || 'ログイン済み'} としてサインインしています。
      </p>
      <div className="space-y-2">
       <Button
        type="button"
        className="w-full"
        onClick={() => router.replace(redirectTarget)}
       >
        管理画面へ進む
       </Button>
       <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleSignOut}
        disabled={submitting}
       >
        サインアウト
       </Button>
      </div>
     </div>
    )}
   </div>
  </div>
 );
}
