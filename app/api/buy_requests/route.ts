import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

function pad(n: number, width = 3) {
    return n.toString().padStart(width, '0');
}

function formatDateYMD(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
}

export async function POST(request: NextRequest) {
    try {
        const db = getAdminDb();

        const body = await request.json();

        // Generate date-based sequence using a counter document per date to avoid race conditions
        const now = new Date();
        const ymd = formatDateYMD(now);
        const counterDocRef = db.collection('counters').doc(`buy_requests_${ymd}`);

        const counters = await db.runTransaction(async (tx) => {
            // 受付番号カウンター（年月日単位）
            const dailySnap = await tx.get(counterDocRef);
            let receptionSeq: number;
            if (!dailySnap.exists) {
                receptionSeq = 1;
                tx.set(counterDocRef, { current: receptionSeq });
            } else {
                const data = dailySnap.data() as any;
                const current = typeof data.current === 'number' ? data.current : 0;
                receptionSeq = current + 1;
                tx.update(counterDocRef, { current: receptionSeq });
            }

            // 入庫用連番（全体で通し番号）
            const inboundCounterRef = db.collection('counters').doc('inbound_serial');
            const inboundSnap = await tx.get(inboundCounterRef);
            let inboundSerial: number;
            if (!inboundSnap.exists) {
                inboundSerial = 15000;
                tx.set(inboundCounterRef, { current: inboundSerial });
            } else {
                const data = inboundSnap.data() as any;
                const current = typeof data.current === 'number' ? data.current : 14999;
                inboundSerial = current + 1;
                tx.update(inboundCounterRef, { current: inboundSerial });
            }

            return { receptionSeq, inboundSerial };
        });

        const receptionNumber = `BUY${ymd}-${pad(counters.receptionSeq, 3)}`;

        const payload = {
            ...body,
            receptionNumber,
            inboundSerial: counters.inboundSerial,
            status: body.status || 'pending',
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        };

        const docRef = await db.collection('buy_requests').add(payload);

        return NextResponse.json({ success: true, id: docRef.id, receptionNumber, inboundSerial: counters.inboundSerial });
    } catch (err) {
        console.error('Failed to create buy request', err);
        return NextResponse.json({ error: 'Failed to create buy request' }, { status: 500 });
    }
}
