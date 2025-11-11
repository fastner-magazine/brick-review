import admin from 'firebase-admin';
import { existsSync, readFileSync } from 'fs';

type ServiceAccount = {
    project_id?: string;
    private_key?: string;
    client_email?: string;
    [key: string]: unknown;
};

function parseServiceAccount(raw: string): ServiceAccount {
    const parsed: ServiceAccount = JSON.parse(raw);
    if (typeof parsed.private_key === 'string') {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return parsed;
}

function resolveCredential(): admin.credential.Credential | undefined {
    const isProduction = process.env.NODE_ENV === 'production';
    const shouldLog = !isProduction || process.env.FIREBASE_ADMIN_LOG_LEVEL === 'info';

    if (shouldLog) console.log('[Firebase Admin] Resolving credentials...');

    // 本番環境では ADMIN_SDK_CREDENTIAL_B64 を優先（予約語回避）
    const adminSdkBase64 = process.env.ADMIN_SDK_CREDENTIAL_B64?.trim();
    if (adminSdkBase64) {
        try {
            if (shouldLog) console.log('[Firebase Admin] Trying ADMIN_SDK_CREDENTIAL_B64...');
            const decoded = Buffer.from(adminSdkBase64, 'base64').toString('utf8');
            const serviceAccount = parseServiceAccount(decoded);
            if (shouldLog) console.log('[Firebase Admin] ✅ Successfully parsed ADMIN_SDK_CREDENTIAL_B64');
            return admin.credential.cert(serviceAccount as admin.ServiceAccount);
        } catch (error) {
            console.error('[Firebase Admin] ❌ Failed to parse ADMIN_SDK_CREDENTIAL_B64:', error);
        }
    }

    const jsonEnv = process.env.FIREBASE_ADMIN_CREDENTIAL_JSON?.trim();
    if (jsonEnv) {
        try {
            if (shouldLog) console.log('[Firebase Admin] Trying FIREBASE_ADMIN_CREDENTIAL_JSON...');
            const serviceAccount = parseServiceAccount(jsonEnv);
            return admin.credential.cert(serviceAccount as admin.ServiceAccount);
        } catch (error) {
            console.error('[Firebase Admin] Failed to parse FIREBASE_ADMIN_CREDENTIAL_JSON:', error);
        }
    }

    // GOOGLE_SERVICE_ACCOUNT_BASE64 をチェック（既存の ADMIN_CREDENTIAL_BASE64 より優先）
    const googleBase64Env = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64?.trim();
    if (googleBase64Env) {
        try {
            if (shouldLog) console.log('[Firebase Admin] Trying GOOGLE_SERVICE_ACCOUNT_BASE64...');
            const decoded = Buffer.from(googleBase64Env, 'base64').toString('utf8');
            const serviceAccount = parseServiceAccount(decoded);
            return admin.credential.cert(serviceAccount as admin.ServiceAccount);
        } catch (error) {
            console.error('[Firebase Admin] Failed to parse GOOGLE_SERVICE_ACCOUNT_BASE64:', error);
        }
    }

    const firebaseBase64Env = process.env.FIREBASE_ADMIN_CREDENTIAL_BASE64?.trim();
    if (firebaseBase64Env) {
        try {
            if (shouldLog) console.log('[Firebase Admin] Trying FIREBASE_ADMIN_CREDENTIAL_BASE64...');
            const decoded = Buffer.from(firebaseBase64Env, 'base64').toString('utf8');
            const serviceAccount = parseServiceAccount(decoded);
            if (shouldLog) console.log('[Firebase Admin] ✅ Successfully parsed FIREBASE_ADMIN_CREDENTIAL_BASE64');
            return admin.credential.cert(serviceAccount as admin.ServiceAccount);
        } catch (error) {
            console.error('[Firebase Admin] ❌ Failed to parse FIREBASE_ADMIN_CREDENTIAL_BASE64:', error);
        }
    }

    const base64Env = process.env.ADMIN_CREDENTIAL_BASE64?.trim();
    if (base64Env) {
        try {
            if (shouldLog) console.log('[Firebase Admin] Trying ADMIN_CREDENTIAL_BASE64...');
            const decoded = Buffer.from(base64Env, 'base64').toString('utf8');
            const serviceAccount = parseServiceAccount(decoded);
            if (shouldLog) console.log('[Firebase Admin] ✅ Successfully parsed ADMIN_CREDENTIAL_BASE64');
            return admin.credential.cert(serviceAccount as admin.ServiceAccount);
        } catch (error) {
            console.error('[Firebase Admin] ❌ Failed to parse ADMIN_CREDENTIAL_BASE64:', error);
        }
    } const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credentialsPath) {
        console.log(`[Firebase Admin] Trying GOOGLE_APPLICATION_CREDENTIALS: ${credentialsPath}`);
        if (existsSync(credentialsPath)) {
            try {
                const fileContents = readFileSync(credentialsPath, 'utf8');
                const serviceAccount = parseServiceAccount(fileContents);
                return admin.credential.cert(serviceAccount as admin.ServiceAccount);
            } catch (error) {
                console.error(`[Firebase Admin] Failed to read credentials file at ${credentialsPath}:`, error);
            }
        } else {
            console.warn(
                `[Firebase Admin] GOOGLE_APPLICATION_CREDENTIALS is set to "${credentialsPath}", but the file does not exist.`
            );
        }
    }

    console.log('[Firebase Admin] Trying Application Default Credentials...');
    try {
        return admin.credential.applicationDefault();
    } catch (error) {
        console.warn('[Firebase Admin] Application Default Credentials are not available:', error);
    }

    console.warn('[Firebase Admin] ⚠️ No credentials resolved');
    return undefined;
}

/**
 * Initialize Firebase Admin SDK if not already initialized.
 * Supports credentials via JSON/Base64 env vars, GOOGLE_APPLICATION_CREDENTIALS file path, or ADC.
 * Falls back to emulator-friendly initialization when FIRESTORE_EMULATOR_HOST is defined.
 */
export function initAdmin() {
    if (admin.apps.length) {
        console.log('[Firebase Admin] Already initialized, apps count:', admin.apps.length);
        return;
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const logLevel = process.env.FIREBASE_ADMIN_LOG_LEVEL || (isProduction ? 'info' : 'info'); // 本番でも info を出力
    const shouldLog = (level: 'info' | 'error') => {
        if (logLevel === 'error') return level === 'error';
        return true; // 'info' レベルならすべてログ出力
    };

    if (shouldLog('info')) {
        console.log('[Firebase Admin] Starting initialization...');
        console.log('[Firebase Admin] Environment check:', {
            nodeEnv: process.env.NODE_ENV,
            hasFirebaseAdminCredentialJson: !!process.env.FIREBASE_ADMIN_CREDENTIAL_JSON,
            hasFirebaseAdminCredentialBase64: !!process.env.FIREBASE_ADMIN_CREDENTIAL_BASE64,
            hasAdminCredentialBase64: !!process.env.ADMIN_CREDENTIAL_BASE64,
            hasGoogleServiceAccountBase64: !!process.env.GOOGLE_SERVICE_ACCOUNT_BASE64,
            hasGoogleApplicationCredentials: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
            hasFirestoreEmulatorHost: !!process.env.FIRESTORE_EMULATOR_HOST,
        });
    }

    const credential = resolveCredential();

    if (credential) {
        const projectId =
            process.env.FIREBASE_ADMIN_PROJECT_ID ||
            process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

        try {
            admin.initializeApp({
                credential,
                projectId,
            });
            if (shouldLog('info')) {
                console.log(`[Firebase Admin] ✅ Initialized with explicit credentials (projectId: ${projectId || 'from credential'})`);
            }
            return;
        } catch (error) {
            console.error('[Firebase Admin] ❌ Failed to initialize with credentials:', error);
            throw error;
        }
    }

    if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_EMULATOR_HOST) {
        const projectId =
            process.env.FIREBASE_ADMIN_EMULATOR_PROJECT_ID ||
            process.env.FIREBASE_ADMIN_PROJECT_ID ||
            process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
            'demo-test-project';

        try {
            admin.initializeApp({
                projectId,
            });
            if (shouldLog('info')) {
                console.log(
                    `[Firebase Admin] ✅ Initialized for emulator (projectId="${projectId}")`
                );
            }
            return;
        } catch (error) {
            console.error('[Firebase Admin] ❌ Failed to initialize for emulator:', error);
            throw error;
        }
    }

    const help =
        'Set FIREBASE_ADMIN_CREDENTIAL_JSON, ADMIN_CREDENTIAL_BASE64, or GOOGLE_APPLICATION_CREDENTIALS before invoking Firebase Admin.';

    console.error('[Firebase Admin] ❌ No credentials available. Environment:', {
        hasJson: !!process.env.FIREBASE_ADMIN_CREDENTIAL_JSON,
        hasBase64: !!process.env.ADMIN_CREDENTIAL_BASE64,
        hasFirebaseBase64: !!process.env.FIREBASE_ADMIN_CREDENTIAL_BASE64,
        hasGoogleBase64: !!process.env.GOOGLE_SERVICE_ACCOUNT_BASE64,
        hasGoogleAppCreds: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
    throw new Error(help);
}

export function getAdmin() {
    initAdmin();
    return admin;
}

let _adminDb: admin.firestore.Firestore | null = null;

export function getAdminDb() {
    if (!_adminDb) {
        initAdmin();
        _adminDb = admin.firestore();
    }
    return _adminDb;
}

export const adminDb = new Proxy({} as admin.firestore.Firestore, {
    get(_target, prop) {
        const db = getAdminDb();
        const value = (db as any)[prop];
        if (typeof value === 'function') {
            return value.bind(db);
        }
        return value;
    }
});

let _adminAuth: admin.auth.Auth | null = null;

export function getAdminAuth() {
    if (!_adminAuth) {
        initAdmin();
        _adminAuth = admin.auth();
    }
    return _adminAuth;
}

export const adminAuth = new Proxy({} as admin.auth.Auth, {
    get(_target, prop) {
        const auth = getAdminAuth();
        const value = (auth as any)[prop];
        if (typeof value === 'function') {
            return value.bind(auth);
        }
        return value;
    }
});
