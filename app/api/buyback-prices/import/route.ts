import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { records = [], useCsvId = true, docIdColumn = 'buyback_price_id' } = body as {
      records?: any[];
      useCsvId?: boolean;
      docIdColumn?: string;
    }

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'records array is required' }, { status: 400 })
    }

    const writes: Promise<any>[] = []

    for (const rec of records) {
      // build document data
      const docData: any = {
        variantIdRef: rec.variantIdRef || '',
        variantGroupIdRef: rec.variantGroupIdRef || '',
        productName: rec.product_name || '',
        category: rec.category || '',
        type: rec.type || '',
        condition: rec.sealing || rec.original_condition || '',
        amount: rec.amount || '',
        priority: rec.priority || '',
        status: rec.status || '',
        image: rec.image || '',
        notes: rec.notes || '',
        createdAt: rec.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      if (useCsvId && rec[docIdColumn]) {
        // 指定された列の値をドキュメントIDとして使用
        const docRef = adminDb.collection('buyback_prices').doc(rec[docIdColumn])
        writes.push(docRef.set(docData))
      } else {
        const docRef = adminDb.collection('buyback_prices').doc()
        writes.push(docRef.set(docData))
      }
    }

    await Promise.all(writes)

    return NextResponse.json({ success: true, saved: records.length })
  } catch (error) {
    console.error('buyback import error', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
