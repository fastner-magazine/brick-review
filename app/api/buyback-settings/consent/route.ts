import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { DEFAULT_CONSENT_TEXT } from '@/lib/consentDefaults';

const SETTINGS_DOC_ID = 'buyback_consent';

export async function GET() {
  try {
    const db = getAdminDb();

    const docRef = db.collection('settings').doc(SETTINGS_DOC_ID);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const rawText = docSnap.data()?.consentText;
      const consent = rawText && rawText.toString().trim() !== '' ? rawText.toString() : DEFAULT_CONSENT_TEXT;
      return NextResponse.json({ consentText: consent });
    } else {
      return NextResponse.json({ consentText: DEFAULT_CONSENT_TEXT });
    }
  } catch (error) {
    console.error('Error fetching consent text:', error);
    return NextResponse.json({ error: 'Failed to fetch consent text' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { consentText } = await request.json();

    const db = getAdminDb();

    const docRef = db.collection('settings').doc(SETTINGS_DOC_ID);
    await docRef.set({
      consentText,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving consent text:', error);
    return NextResponse.json({ error: 'Failed to save consent text' }, { status: 500 });
  }
}
