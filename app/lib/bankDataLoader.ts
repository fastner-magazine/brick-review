// 銀行データの型定義
export type BankData = {
  bankCode: string;
  bankName: string;
  bankNameKana: string;
  bankNameHiragana: string;
  bankNameRomaji: string;
  branchCode: string;
  branchName: string;
  branchNameKana: string;
  branchNameHiragana: string;
  branchNameRomaji: string;
  concatenatedCode: string;
  concatenatedName: string;
  // 追加: データ源により hiragana が `*KanaHiragana` というキーで来る場合があるため保険
  bankNameKanaHiragana?: string;
  branchNameKanaHiragana?: string;
};

let cachedBankData: BankData[] | null = null;

/**
 * 銀行データをロードする（クライアント・サーバー両対応）
 * 分割されたJSONファイルから読み込み
 */
export async function loadBankData(): Promise<BankData[]> {
  if (cachedBankData) {
    return cachedBankData;
  }

  try {
    // index.jsonから全てのkanaファイル名を取得
    const indexResponse = await fetch('/bankdata_by_kana/index.json');
    if (!indexResponse.ok) {
      throw new Error(`Failed to load bank data index: ${indexResponse.status}`);
    }

    const kanaFilesData = await indexResponse.json();
    const kanaFiles = Array.isArray(kanaFilesData) ? kanaFilesData : [];

    // 全てのkanaファイルを並列で読み込み
    const allData: BankData[] = [];

    await Promise.all(
      kanaFiles.map(async (kanaFile: string) => {
        try {
          const response = await fetch(`/bankdata_by_kana/${kanaFile}`);
          if (response.ok) {
            const data = await response.json();
            allData.push(...data);
          }
        } catch (error) {
          console.warn(`Failed to load ${kanaFile}:`, error);
        }
      })
    );

    cachedBankData = allData;
    return cachedBankData;
  } catch (error) {
    console.error('Failed to load bank data:', error);
    cachedBankData = [];
    return cachedBankData;
  }
}

/**
 * 拗音（小文字）を大文字に正規化する関数
 * 例: きょうと → きようと、しゅうと → しゆうと
 */
function normalizeSmallKana(s: string): string {
  if (!s) return '';
  return s
    // ひらがな小文字を大文字に
    .replace(/ぁ/g, 'あ')
    .replace(/ぃ/g, 'い')
    .replace(/ぅ/g, 'う')
    .replace(/ぇ/g, 'え')
    .replace(/ぉ/g, 'お')
    .replace(/ゃ/g, 'や')
    .replace(/ゅ/g, 'ゆ')
    .replace(/ょ/g, 'よ')
    .replace(/ゎ/g, 'わ')
    .replace(/っ/g, 'つ')
    // カタカナ小文字を大文字に
    .replace(/ァ/g, 'ア')
    .replace(/ィ/g, 'イ')
    .replace(/ゥ/g, 'ウ')
    .replace(/ェ/g, 'エ')
    .replace(/ォ/g, 'オ')
    .replace(/ャ/g, 'ヤ')
    .replace(/ュ/g, 'ユ')
    .replace(/ョ/g, 'ヨ')
    .replace(/ヮ/g, 'ワ')
    .replace(/ッ/g, 'ツ');
}

/**
 * 銀行名を検索（部分一致、かな・カナ・ローマ字対応）
 * 母音だけの入力は無視して、子音+母音のパターンからマッチング開始
 */
export function searchBanks(query: string, allData: BankData[]): BankData[] {
  if (!query || query.trim().length === 0) {
    return [];
  }

  // クエリを正規化（拗音の小文字を大文字に）
  const normalizedQuery = normalizeSmallKana(query.toLowerCase().trim());

  // 母音のみの入力を検出（a, i, u, e, o, n のみで構成）
  const isOnlyVowels = /^[aiueon]+$/.test(normalizedQuery);
  if (isOnlyVowels && normalizedQuery.length < 2) {
    // 母音1文字の場合はサジェストしない
    return [];
  }

  // 銀行の一意なリストを作成
  const uniqueBanks = new Map<string, BankData>();

  allData.forEach(item => {
    const key = `${item.bankCode}`;
    if (!uniqueBanks.has(key)) {
      uniqueBanks.set(key, item);
    }
  });

  const results = Array.from(uniqueBanks.values()).filter(bank => {
    const name = bank.bankName || '';
    const kana = (bank.bankNameKana || '').toLowerCase();
    // データベース側の文字列も拗音正規化
    const hira = normalizeSmallKana((bank.bankNameHiragana || bank.bankNameKanaHiragana || '') as string);
    const romaji = (bank.bankNameRomaji || '').toLowerCase();
    return (
      name.includes(query) ||
      kana.includes(normalizedQuery) ||
      hira.includes(normalizedQuery) ||
      romaji.includes(normalizedQuery)
    );
  });

  return results.slice(0, 10); // 最大10件
}

/**
 * 支店名を検索（特定の銀行コード内で検索）
 */
export function searchBranches(
  bankCode: string,
  query: string,
  allData: BankData[]
): BankData[] {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const normalizedQuery = query.toLowerCase().trim();

  // 母音のみの入力を検出
  const isOnlyVowels = /^[aiueon]+$/.test(normalizedQuery);
  if (isOnlyVowels && normalizedQuery.length < 2) {
    return [];
  }

  const results = allData
    .filter(item => item.bankCode === bankCode && item.branchCode)
    .filter(branch => {
      const name = branch.branchName || '';
      const kana = (branch.branchNameKana || '').toLowerCase();
      const hira = (branch.branchNameHiragana || branch.branchNameKanaHiragana || '') as string;
      const romaji = (branch.branchNameRomaji || '').toLowerCase();
      return (
        name.includes(query) ||
        kana.includes(normalizedQuery) ||
        hira.includes(normalizedQuery) ||
        romaji.includes(normalizedQuery)
      );
    });

  return results.slice(0, 10); // 最大10件
}
