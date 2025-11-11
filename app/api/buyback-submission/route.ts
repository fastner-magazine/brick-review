import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const COLLECTION_NAME = 'buyback_submissions';

export async function POST(request: NextRequest) {
  try {
    const db = getAdminDb();

    const body = await request.json();

    const submissionData = {
      ...body,
      createdAt: FieldValue.serverTimestamp(),
      status: 'pending', // pending, confirmed, completed, cancelled
    };

    const docRef = await db.collection(COLLECTION_NAME).add(submissionData);

    return NextResponse.json({
      success: true,
      id: docRef.id,
    });
  } catch (error) {
    console.error('Failed to save buyback submission:', error);
    return NextResponse.json(
      { error: 'Failed to save submission' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const db = getAdminDb();

    const snapshot = await db.collection(COLLECTION_NAME)
      .orderBy('createdAt', 'desc')
      .get();

    const submissions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate().toISOString(),
    }));

    return NextResponse.json({ submissions });
  } catch (error) {
    console.error('Failed to fetch buyback submissions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch submissions' },
      { status: 500 }
    );
  }
}
