import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { initAdmin } from '@/lib/firebase-admin';

export async function GET() {
    try {
        console.log('[storage] Starting GET request...');
        initAdmin();
        console.log('[storage] Admin initialized');
        const db = getFirestore();
        console.log('[storage] Firestore instance obtained');

        const snapshot = await db.collection('storage').get();
        console.log(`[storage] Found ${snapshot.size} storage documents`);
        const documents: Record<string, any> = {};

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            documents[docSnap.id] = {
                _id: docSnap.id,
                label: data.label || data.name || docSnap.id,
                ...data,
            };
        }

        console.log('[storage] Successfully loaded storage from Firestore');
        return NextResponse.json(
            { documents },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (err) {
        console.error('[storage API] Error:', err);
        console.error('[storage API] Error details:', err instanceof Error ? err.message : String(err));
        // Return empty documents instead of 500 to prevent cascade failures
        return NextResponse.json(
            {
                error: 'Failed to load storage',
                details: err instanceof Error ? err.message : String(err),
                documents: {}
            },
            { status: 200 } // Changed to 200 to prevent UI errors
        );
    }
}

// Ensure no static optimization/caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;
