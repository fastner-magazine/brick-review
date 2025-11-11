import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const SETTINGS_DOC_ID = 'sheets_config';

export async function GET() {
  try {
    const db = getAdminDb();

    const docRef = db.collection('settings').doc(SETTINGS_DOC_ID);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      return NextResponse.json({ config: docSnap.data() });
    } else {
      return NextResponse.json({ config: null });
    }
  } catch (error) {
    console.error('Failed to fetch sheets config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch config' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getAdminDb();

    const body = await request.json();

    const configData = {
      ...body,
      updatedAt: FieldValue.serverTimestamp(),
    };

    const docRef = db.collection('settings').doc(SETTINGS_DOC_ID);
    await docRef.set(configData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save sheets config:', error);
    return NextResponse.json(
      { error: 'Failed to save config' },
      { status: 500 }
    );
  }
}
