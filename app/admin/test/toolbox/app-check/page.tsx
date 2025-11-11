"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getToken, type AppCheckTokenResult } from "firebase/app-check";
import { initAppCheck, getAppCheckInstance, isAppCheckInitialized } from "@/lib/appCheck";
import { getFirebaseApp } from "@/lib/firebaseClient";

type ClientDecodedToken = {
 header: Record<string, unknown> | null;
 payload: Record<string, unknown> | null;
};

type ServerVerificationResult = {
 appId: string;
 aud: string[];
 tokenId: string | null;
 expireTime: string;
 issuedAt: string;
 alreadyConsumed: boolean;
};

type FetchState = "idle" | "loading" | "success" | "error";

function decodeSegment(segment: string) {
 const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
 const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
 const atobFn = typeof globalThis.atob === "function" ? globalThis.atob : (() => {
  throw new Error("atob is not available in this environment");
 });
 const decoded = atobFn(padded);
 return JSON.parse(decoded);
}

function decodeJwt(token: string): ClientDecodedToken {
 try {
  const [headerSegment, payloadSegment] = token.split(".").slice(0, 2);
  const header = decodeSegment(headerSegment);
  const payload = decodeSegment(payloadSegment);

  return {
   header: header ?? null,
   payload: payload ?? null,
  };
 } catch (error) {
  console.warn("Failed to decode App Check token", error);
  return { header: null, payload: null };
 }
}

export default function AppCheckInspectorPage() {
 const [initialized, setInitialized] = useState<boolean>(isAppCheckInitialized());
 const [fetchState, setFetchState] = useState<FetchState>("idle");
 const [tokenResult, setTokenResult] = useState<AppCheckTokenResult | null>(null);
 const [clientDecoded, setClientDecoded] = useState<ClientDecodedToken | null>(null);
 const [serverResult, setServerResult] = useState<ServerVerificationResult | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [forceRefresh, setForceRefresh] = useState(false);
 const [firebaseAppAvailable, setFirebaseAppAvailable] = useState<boolean>(false);

 useEffect(() => {
  // Check if Firebase app can be initialized
  const app = getFirebaseApp();
  setFirebaseAppAvailable(!!app);

  if (!initialized && app) {
   initAppCheck();
   setInitialized(isAppCheckInitialized());
  }
 }, [initialized]);

 const ensureInstance = useCallback(() => {
  // First check if Firebase app exists
  const app = getFirebaseApp();
  if (!app) {
   throw new Error(
     "Firebase app is not initialized. " +
     "Please ensure NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_PROJECT_ID, " +
     "and NEXT_PUBLIC_FIREBASE_APP_ID are set in your environment variables."
   );
  }

  let instance = getAppCheckInstance();
  if (!instance) {
   initAppCheck();
   instance = getAppCheckInstance();
  }
  return instance;
 }, []);

 const handleFetchToken = useCallback(async () => {
  setFetchState("loading");
  setError(null);
  setServerResult(null);

  try {
   const instance = ensureInstance();
   if (!instance) {
    throw new Error("App Check instance is not available. Check NEXT_PUBLIC_RECAPTCHA_SITE_KEY.");
   }

   const result = await getToken(instance, forceRefresh);
   setTokenResult(result);

   const decoded = decodeJwt(result.token);
   setClientDecoded(decoded);

   const response = await fetch("/api/test/app-check/verify", {
    method: "POST",
    headers: {
     "Content-Type": "application/json",
    },
    body: JSON.stringify({ token: result.token }),
   });

   if (response.ok) {
    const json = (await response.json()) as { result: ServerVerificationResult };
    setServerResult(json.result);
    setFetchState("success");
   } else {
    const json = await response.json().catch(() => ({}));
    throw new Error(json.error || `Server verification failed with status ${response.status}`);
   }
  } catch (err: unknown) {
   const message = err instanceof Error ? err.message : "Unknown error";
   setError(message);
   setFetchState("error");
  }
 }, [ensureInstance, forceRefresh]);

 const tokenExpiresAt = useMemo(() => {
  if (!tokenResult?.token) return null;
  try {
   const payload = clientDecoded?.payload as { exp?: number } | undefined;
   if (!payload?.exp) return null;
   return new Date(payload.exp * 1000);
  } catch {
   return null;
  }
 }, [clientDecoded?.payload, tokenResult?.token]);

 const tokenIssuedAt = useMemo(() => {
  if (!tokenResult?.token) return null;
  try {
   const payload = clientDecoded?.payload as { iat?: number } | undefined;
   if (!payload?.iat) return null;
   return new Date(payload.iat * 1000);
  } catch {
   return null;
  }
 }, [clientDecoded?.payload, tokenResult?.token]);

 return (
  <main className="min-h-screen bg-slate-950 text-slate-100">
   <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
    <header className="flex items-center justify-between">
     <div>
      <p className="text-sm text-slate-400">Toolbox / App Check</p>
      <h1 className="text-3xl font-semibold">App Check Token Inspector</h1>
      <p className="mt-2 text-sm text-slate-400">
       Fetch the current App Check token, inspect its payload, and verify it via Firebase Admin.
      </p>
     </div>
     <Link
      href="/test/toolbox"
      className="rounded border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-900"
     >
      ← Back to Toolbox
     </Link>
    </header>

    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-slate-950/50">
     <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
       <h2 className="text-xl font-semibold text-slate-100">1. Initialization Status</h2>
       <p className="text-sm text-slate-400">
        Ensure the App Check instance is ready before fetching a token.
       </p>
      </div>
      <span className={"rounded-full px-4 py-1 text-sm font-semibold " + (initialized ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-200")}
      >
       {initialized ? "Initialized" : "Not Initialized"}
      </span>
     </div>
     <div className="mt-4 space-y-2 text-xs">
      <div className="text-slate-400">
       Firebase App: {firebaseAppAvailable ? "✅ initialized" : "❌ not initialized"}
      </div>
      <div className="text-slate-400">
       NEXT_PUBLIC_RECAPTCHA_SITE_KEY: {process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ? "✅ set" : "⚠️ missing"}
      </div>
      {!firebaseAppAvailable && (
       <div className="mt-3 rounded border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-200">
        <p className="font-semibold">⚠️ Firebase App Not Initialized</p>
        <p className="mt-1">
         Required environment variables are missing. Please ensure the following are set in your .env.local:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 font-mono text-[0.65rem]">
         <li>NEXT_PUBLIC_FIREBASE_API_KEY</li>
         <li>NEXT_PUBLIC_FIREBASE_PROJECT_ID</li>
         <li>NEXT_PUBLIC_FIREBASE_APP_ID</li>
        </ul>
       </div>
      )}
     </div>
    </section>

    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-slate-950/50">
     <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
       <h2 className="text-xl font-semibold text-slate-100">2. Fetch Token</h2>
       <p className="text-sm text-slate-400">
        Retrieves an App Check token from the client SDK and sends it to the server for verification.
       </p>
      </div>
      <div className="flex items-center gap-3">
       <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
         type="checkbox"
         className="h-4 w-4 rounded border border-slate-700 bg-slate-950"
         checked={forceRefresh}
         onChange={(event) => setForceRefresh(event.target.checked)}
        />
        Force refresh token
       </label>
       <button
        type="button"
        onClick={handleFetchToken}
        disabled={fetchState === "loading" || !firebaseAppAvailable}
        className="rounded bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
       >
        {fetchState === "loading" ? "Fetching..." : "Fetch & Verify"}
       </button>
      </div>
     </div>
     {error && (
      <div className="mt-4 rounded border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-200">
       <p className="font-semibold">Error</p>
       <p className="mt-1 whitespace-pre-wrap font-mono text-xs">{error}</p>
      </div>
     )}
    </section>

    <section className="grid gap-6 lg:grid-cols-2">
     <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-slate-950/40">
      <h3 className="text-lg font-semibold text-slate-100">Client Token Details</h3>
      <p className="mt-1 text-xs text-slate-400">Payload decoded locally for quick inspection.</p>

      {tokenResult ? (
       <div className="mt-4 space-y-4">
        <div>
         <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Raw Token</p>
         <pre className="mt-2 max-h-48 overflow-x-auto whitespace-pre-wrap rounded bg-slate-950/70 p-3 text-xs text-slate-200">
          {tokenResult.token}
         </pre>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
         <div className="rounded border border-slate-800/60 bg-slate-900/80 p-3">
          <p className="text-[0.65rem] uppercase tracking-wide text-slate-500">Issued At</p>
          <p className="text-sm text-slate-200">
           {tokenIssuedAt ? tokenIssuedAt.toLocaleString() : "N/A"}
          </p>
         </div>
         <div className="rounded border border-slate-800/60 bg-slate-900/80 p-3">
          <p className="text-[0.65rem] uppercase tracking-wide text-slate-500">Expires At</p>
          <p className="text-sm text-slate-200">
           {tokenExpiresAt ? tokenExpiresAt.toLocaleString() : "N/A"}
          </p>
         </div>
        </div>

        <div className="rounded border border-slate-800/60 bg-slate-900/80 p-3">
         <p className="text-[0.65rem] uppercase tracking-wide text-slate-500">Decoded Payload</p>
         <pre className="mt-2 max-h-48 overflow-x-auto whitespace-pre-wrap rounded bg-slate-950/70 p-3 text-xs text-emerald-200">
          {JSON.stringify(clientDecoded?.payload, null, 2)}
         </pre>
        </div>
       </div>
      ) : (
       <p className="mt-4 text-sm text-slate-500">Token not fetched yet.</p>
      )}
     </div>

     <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-slate-950/40">
      <h3 className="text-lg font-semibold text-slate-100">Server Verification</h3>
      <p className="mt-1 text-xs text-slate-400">Firebase Admin verifies the token using App Check Admin API.</p>

      {fetchState === "idle" && !serverResult && (
       <p className="mt-4 text-sm text-slate-500">Run verification to populate this panel.</p>
      )}

      {fetchState === "loading" && (
       <p className="mt-4 text-sm text-indigo-200">Verifying token on the server...</p>
      )}

      {fetchState === "success" && serverResult && (
       <div className="mt-4 space-y-3">
        <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
         ✅ Server verification succeeded
        </div>
        <dl className="space-y-3 text-sm">
         <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">App ID</dt>
          <dd className="font-mono text-slate-200">{serverResult.appId}</dd>
         </div>
         <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Audience</dt>
          <dd className="font-mono text-slate-200">{serverResult.aud.join(", ")}</dd>
         </div>
         <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Token ID</dt>
          <dd className="font-mono text-slate-200 break-all">{serverResult.tokenId ?? "N/A"}</dd>
         </div>
         <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Already Consumed</dt>
          <dd className="font-mono text-slate-200">{serverResult.alreadyConsumed ? "true" : "false"}</dd>
         </div>
         <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Issued At</dt>
          <dd className="font-mono text-slate-200">{serverResult.issuedAt}</dd>
         </div>
         <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Expires At</dt>
          <dd className="font-mono text-slate-200">{serverResult.expireTime}</dd>
         </div>
        </dl>
       </div>
      )}

      {fetchState === "error" && (
       <div className="mt-4 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">
        ❌ Server verification failed
       </div>
      )}
     </div>
    </section>
   </div>
  </main>
 );
}
