import { NextRequest, NextResponse } from 'next/server';
import { adminDb as db } from '@/lib/firebase-admin';
import * as crypto from 'crypto';

export const dynamic = 'force-dynamic';

// 商品名からvariant_group_idを生成（既存システムと互換性のある形式）
function generateVariantGroupId(productName: string): string {
    const normalized = productName.trim().toLowerCase() || 'unknown';
    const hash = crypto.createHash('sha256').update(normalized, 'utf8').digest('base64url');
    // 先頭10文字を除いた20文字を使用（既存の仕様に合わせる）
    return hash.substring(10, 30);
}

// variant_idを生成（既存システムと互換性のある形式）
function generateVariantId(productName: string, type: string, sealing: string): string {
    const variantGroupId = generateVariantGroupId(productName);
    
    // suffix部分を生成（type + sealing のハッシュから）
    const suffixInput = `${type}_${sealing}`;
    const suffixHash = crypto.createHash('sha256').update(suffixInput, 'utf8').digest('hex');
    const suffix = suffixHash.substring(0, 10);
    
    return `vg_${variantGroupId}_${suffix}`;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { productName, category, type, sealing } = body;

        if (!productName || !category || !type) {
            return NextResponse.json(
                { error: '商品名、カテゴリ、Typeは必須です' },
                { status: 400 }
            );
        }

        // variant_group_id と variant_id を生成
        const variantGroupId = generateVariantGroupId(productName);
        const variantId = generateVariantId(productName, type, sealing || '');

        console.log('[create-product] Creating new product:', {
            productName,
            category,
            type,
            sealing,
            variantGroupId,
            variantId,
        });

        // 1. products_master に追加（variant_group として）
        const productData = {
            product_name: productName,
            category: category,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        await db.collection('products_master').doc(variantGroupId).set(productData);
        console.log('[create-product] Created product in products_master:', variantGroupId);

        // 2. variants_master に追加
        const variantData = {
            variantGroupIdRef: variantGroupId,
            type: type,
            sealing: sealing || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        await db.collection('variants_master').doc(variantId).set(variantData);
        console.log('[create-product] Created variant in variants_master:', variantId);

        return NextResponse.json({
            success: true,
            variantGroupId,
            variantId,
            product: {
                variant_group_id: variantGroupId,
                product_name: productName,
                category: category,
            },
            variant: {
                variant_id: variantId,
                variantGroupIdRef: variantGroupId,
                type: type,
                sealing: sealing || '',
            },
        });
    } catch (error) {
        console.error('[create-product] Error:', error);
        return NextResponse.json(
            { error: '商品の作成に失敗しました' },
            { status: 500 }
        );
    }
}
