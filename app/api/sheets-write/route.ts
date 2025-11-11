import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

type FieldMapping = {
  fieldName: string;
  displayName: string;
  cellAddress: string;
  enabled: boolean;
};

type SheetsConfig = {
  spreadsheetId: string;
  sheetName: string;
  fieldMappings: FieldMapping[];
};

export async function POST(request: NextRequest) {
  try {
    const { data, config } = await request.json() as { data: any; config: SheetsConfig };

    if (!config.spreadsheetId || !config.sheetName) {
      return NextResponse.json(
        { error: 'スプレッドシートIDまたはシート名が設定されていません' },
        { status: 400 }
      );
    }

    // Google Sheets APIクライアントの認証
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // 有効なフィールドのみを処理
    const enabledMappings = config.fieldMappings.filter(m => m.enabled);
    
    // 各セルに書き込むデータを準備
    const updateRequests = enabledMappings.map(mapping => {
      let value = data[mapping.fieldName];
      
      // データの変換処理
      if (mapping.fieldName === 'items' && Array.isArray(value)) {
        // 配列データはJSON文字列に変換
        value = JSON.stringify(value);
      } else if (mapping.fieldName === 'itemsCount' && Array.isArray(data.items)) {
        // 買取品目数を計算
        value = data.items.length;
      } else if (mapping.fieldName === 'createdAt' || mapping.fieldName === 'preferredDateTime') {
        // 日時フィールドを読みやすい形式に変換
        if (value) {
          const date = new Date(value);
          value = date.toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });
        }
      } else if (value === null || value === undefined) {
        value = '';
      }

      return {
        range: `${config.sheetName}!${mapping.cellAddress}`,
        values: [[value]],
      };
    });

    // バッチ更新リクエストを送信
    const response = await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updateRequests,
      },
    });

    return NextResponse.json({
      success: true,
      updatedCells: response.data.totalUpdatedCells,
      updatedRange: response.data.responses?.[0]?.updatedRange,
    });
  } catch (error: any) {
    console.error('Failed to write to Google Sheets:', error);
    
    // エラーの詳細をログに出力
    if (error.response) {
      console.error('API Error:', error.response.data);
    }
    
    return NextResponse.json(
      { 
        error: 'Google Sheetsへの書き込みに失敗しました',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
