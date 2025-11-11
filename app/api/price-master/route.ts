import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const COLLECTION_NAME = 'buypricesMaster';

type PriceMasterItem = {
    id: string;
    variantIdRef: string;
    product_name: string;
    category: string;
    type?: string;
    sealing?: string;
    price: number | string | null;
    status?: string;
    priority?: number;
    image?: string;
    notes?: string;
    createdAt?: any;
    updatedAt?: any;
};

/**
 * GET: 価格マスター一覧を取得
 */
export async function GET() {
    try {
        console.log(`[price-master GET] Fetching from ${COLLECTION_NAME}...`);

        const snapshot = await adminDb.collection(COLLECTION_NAME).get();
        const items: PriceMasterItem[] = [];

        snapshot.forEach((doc) => {
            const data = doc.data();
            const price = typeof data.price === 'number' ? data.price :
                         (typeof data.price === 'string' && data.price !== '' ? parseFloat(data.price) : null);

            items.push({
                id: doc.id,
                variantIdRef: data.variantIdRef || doc.id,
                product_name: data.product_name || '',
                category: data.category || '',
                type: data.type || '',
                sealing: data.sealing || '',
                price: price,
                status: data.status || '',
                priority: data.priority || 0,
                image: data.image || '',
                notes: data.notes || '',
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
            });
        });

        console.log(`[price-master GET] ✅ Retrieved ${items.length} items`);

        return NextResponse.json({
            success: true,
            items,
            count: items.length,
        });
    } catch (error) {
        console.error('[price-master GET] ❌ Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}

/**
 * POST: 価格マスターを保存（一括 or 個別）
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const items: PriceMasterItem[] = body.items || [];

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { success: false, error: 'items array is required' },
                { status: 400 }
            );
        }

        console.log(`[price-master POST] Saving ${items.length} items...`);

        const batch = adminDb.batch();
        let processedCount = 0;

        for (const item of items) {
            if (!item.variantIdRef) {
                console.warn('[price-master POST] Skipping item without variantIdRef:', item);
                continue;
            }

            const docRef = adminDb.collection(COLLECTION_NAME).doc(item.variantIdRef);

            const data: any = {
                variantIdRef: item.variantIdRef,
                product_name: item.product_name || '',
                category: item.category || '',
                price: item.price ?? null,
                updatedAt: item.updatedAt || { _seconds: Math.floor(Date.now() / 1000), _nanoseconds: 0 },
            };

            // オプショナルフィールドを追加
            if (item.type) data.type = item.type;
            if (item.sealing) data.sealing = item.sealing;
            if (item.status) data.status = item.status;
            if (item.priority !== undefined) data.priority = item.priority;
            if (item.image) data.image = item.image;
            if (item.notes) data.notes = item.notes;
            if (item.createdAt && !docRef) data.createdAt = item.createdAt;

            batch.set(docRef, data, { merge: true });
            processedCount++;
        }

        if (processedCount > 0) {
            await batch.commit();
            console.log(`[price-master POST] ✅ Successfully saved ${processedCount} items`);
        } else {
            console.warn('[price-master POST] ⚠️ No valid items to save');
        }

        return NextResponse.json({
            success: true,
            saved: processedCount,
            message: `${processedCount} items saved successfully`,
        });
    } catch (error) {
        console.error('[price-master POST] ❌ Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}

/**
 * DELETE: 価格マスターを削除
 */
export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json();
        const variantGroupIds: string[] = body.ids || [];

        if (!Array.isArray(variantGroupIds) || variantGroupIds.length === 0) {
            return NextResponse.json(
                { success: false, error: 'ids array is required' },
                { status: 400 }
            );
        }

        console.log(`[price-master DELETE] Deleting ${variantGroupIds.length} items...`);

        const batch = adminDb.batch();

        for (const id of variantGroupIds) {
            const docRef = adminDb.collection(COLLECTION_NAME).doc(id);
            batch.delete(docRef);
        }

        await batch.commit();
        console.log(`[price-master DELETE] ✅ Successfully deleted ${variantGroupIds.length} items`);

        return NextResponse.json({
            success: true,
            deleted: variantGroupIds.length,
            message: `${variantGroupIds.length} items deleted successfully`,
        });
    } catch (error) {
        console.error('[price-master DELETE] ❌ Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}
