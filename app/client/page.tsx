'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useCallback, useRef } from 'react';
import { loadBankData, searchBanks, searchBranches, BankData } from '@/lib/bankDataLoader';
import { Button } from '@/components/ui/button';
import BookingSlotSelector from '@/components/BookingSlotSelector';
import SignatureCanvas from '@/components/SignatureCanvas';
import BirthdateSelect from '@/components/BirthdateSelect';
import { ProductSelector, PriceSelectorStrategy } from '@/lib/search';
import { DEFAULT_CONSENT_TEXT } from '@/lib/consentDefaults';
import { getFirestoreClient } from '@/lib/firestoreClient';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useSecureBankSubmit } from './hooks/useSecureBankSubmit';
import { getFirebaseStorage } from '@/lib/firebaseClient';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import VideoRecorder from './components/id-verification/VideoRecorder';
import type { VerificationSession } from './components/id-verification/types';
import { initAppCheck } from '@/lib/appCheck';
// Use server API to create buy requests (server will assign reception number)

type ItemEntry = {
  category: string;
  categoryId?: string;
  item: string;
  subcategory: string;
  count: number;
  typeId?: string;
  type?: string;
  buyPrice?: number | null;
};

type TypeOptionWithPrice = { id: string; label: string; price?: number };

type FormState = {
  name: string;
  address: string;
  birthdate: string;
  lineName: string;
  idFront: File | null;
  idBack: File | null;
  verificationSession: VerificationSession | null; // 身分証撮影セッション
  bankName: string;
  bankCode: string;
  branchName: string;
  branchCode: string;
  accountNumber: string;
  accountNameKana: string;
  deliveryMethod: 'mail' | 'visit' | ''; // 'mail' = 郵送, 'visit' = 来店
  preferredDateTime: string; // 来店選択時のみ使用
  items: ItemEntry[];
  consent: boolean;
  signature: string; // サインの画像データURL
};

// styles moved to globals.css

export default function BuybackIntakePage() {
  // ログ制御: デフォルトは無効。必要時に true にするか、クエリや一時スイッチで切替える
  const DEBUG_BANK_LOGS = false;
  const dlog = useCallback((...args: any[]) => {
    if (DEBUG_BANK_LOGS && typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(...args);
    }
  }, [DEBUG_BANK_LOGS]);
  const [currentStep, setCurrentStep] = useState(1);
  const [consentText, setConsentText] = useState('');
  const [receptionNumber, setReceptionNumber] = useState('');
  const [showSignaturePopup, setShowSignaturePopup] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(0); // 編集中のアイテムインデックス（最初は0番目）
  const [submissionStatus, setSubmissionStatus] = useState(''); // 送信中のステータスメッセージ
  const [bankData, setBankData] = useState<BankData[]>([]);
  const [bankSuggestions, setBankSuggestions] = useState<BankData[]>([]);
  const [branchSuggestions, setBranchSuggestions] = useState<BankData[]>([]);
  const [showBankSuggestions, setShowBankSuggestions] = useState(false);
  const [showBranchSuggestions, setShowBranchSuggestions] = useState(false);
  const [isComposingBankName, setIsComposingBankName] = useState(false);
  const [confirmedBankName, setConfirmedBankName] = useState('');
  // cache for fetched per-kana-group JSON files to avoid repeated network calls
  const groupCacheRef = useRef<Record<string, BankData[]>>({});
  // debounce timer for bank suggestions
  const bankDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // debounce timer for branch suggestions
  const branchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // abort controller for in-flight group fetch
  const bankFetchAbortRef = useRef<AbortController | null>(null);
  // sequence id to drop stale async results
  const bankRequestSeqRef = useRef(0);
  // ref to bank input for auto-select single suggestion
  const bankInputRef = useRef<HTMLInputElement | null>(null);
  // cache enriched type prices by product/category
  const typePriceCacheRef = useRef<Map<string, Map<string, number>>>(new Map());
  // track latest async request per item index to drop stale price results
  const typePriceFetchSeqRef = useRef<Record<number, number>>({});

  dlog('[BuybackIntakePage] コンポーネントレンダリング', {
    currentStep,
    isComposingBankName,
    showBankSuggestions,
    suggestionsCount: bankSuggestions.length
  });

  const [formData, setFormData] = useState<FormState>({
    name: '',
    address: '',
    birthdate: '',
    lineName: '',
    idFront: null,
    idBack: null,
    verificationSession: null,
    bankName: '',
    bankCode: '',
    branchName: '',
    branchCode: '',
    accountNumber: '',
    accountNameKana: '',
    deliveryMethod: '',
    preferredDateTime: '',
    items: [{ category: '', categoryId: '', item: '', subcategory: '', count: 1, typeId: '', type: '' }],
    consent: false,
    signature: '',
  });

  // VideoRecorder表示フラグ
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);

  // カテゴリオプションのステート
  const [categoryOptions, setCategoryOptions] = useState<Array<{ id: string; label: string; order?: number }>>([]);

  // タイプオプションのステート
  const [allTypeOptions, setAllTypeOptions] = useState<Array<{ id: string; label: string; order?: number }>>([]);
  // 各アイテム単位のフィルタされたタイプオプション
   const [itemTypeOptions, setItemTypeOptions] = useState<Array<TypeOptionWithPrice[]>>(() =>
     formData.items.map(() => [] as TypeOptionWithPrice[])
    );

  // 封入数オプションのステート
  const [allSealingOptions, setAllSealingOptions] = useState<Array<{ id: string; label: string; order?: number }>>([]);

  // PriceSelectorStrategy のインスタンスを作成（buypricesMaster専用）
  const [priceSelectorStrategy] = useState(() =>
    new PriceSelectorStrategy(getFirestoreClient(), {
      collections: ['buypricesMaster'],
      searchFields: ['product_name_normalized'],
      priceField: 'buy_price'
    })
  );

  const verificationStepMarkers = formData.verificationSession?.stepMarkers ?? [];
  const verificationFrontSnapshot = verificationStepMarkers.find(marker => marker.step === 'front')?.snapshot ?? null;
  const verificationBackSnapshot = verificationStepMarkers.find(marker => marker.step === 'back')?.snapshot ?? null;

  // セキュアな銀行情報送信フック
  const { submitSecure, isSubmitting, error: submitError } = useSecureBankSubmit({
    otherFormData: {
      name: formData.name,
      address: formData.address,
      birthdate: formData.birthdate,
      lineName: formData.lineName,
      idFrontName: formData.idFront?.name || '',
      idBackName: formData.idBack?.name || '',
      deliveryMethod: formData.deliveryMethod,
      preferredDateTime: formData.deliveryMethod === 'visit' ? formData.preferredDateTime : '',
      items: formData.items,
      consent: formData.consent,
      // 以下は handleSubmit 内で動的に追加されるため、ここでは空値
      idFrontUrl: '',
      idBackUrl: '',
      tempStorageId: '',
      verificationSession: null,
    },
    onSuccess: (response) => {
      dlog('Server saved buy request:', response);
      if (response.receptionNumber) {
        setReceptionNumber(response.receptionNumber);
      }
      // 次のステップへ
      setCurrentStep(7);
    },
    onError: (error) => {
      console.error('Submission error:', error);
      alert('送信に失敗しました。もう一度お試しください。');
    },
  });

  // App Check初期化
  useEffect(() => {
    initAppCheck();
  }, []);

  // 買取同意テキストをFirestoreから取得
  useEffect(() => {
    const loadConsentText = async () => {
      // デフォルトの同意テキスト（フォールバック用）
      const defaultConsentText = `・ご本人確認のため、運転免許証（表・裏）もしくは健康保険証（表・裏）の確認が必要です。
・18歳未満の方、身分証明できない方の買い取りはできません。
・窃盗、詐欺等の犯罪行為、不正契約、不正転売目的にて入手した商品や中古品、海賊版、サンプル版の買取はできません。
・確認書類はお申込者御本人のものに限ります。偽造や第三者のものを利用したことが発覚した場合には、法的措置を採る場合もございます。
・商品の郵送中に発生した、破損、故障、紛失は弊社では一切責任を負いません。
・商品到着時点の状態により買取不可になったり、減額になる場合があります。また、すべて返送となる場合もございます。
・弊社あての郵送については【元払い】にて、買取不可の場合は【着払い】にて返送します。
・10万円以上の振込は手数料無料、10万円以下の場合には手数料を一律300円ご負担いただきます。
・書類・商品の不備があった場合、弊社よりご連絡差し上げますが、買取代金お支払いの遅延、場合によっては減額・買取不可・返品となる場合があります。
・当依頼書にご記入いただいた個人情報および、ご提供いただいた個人情報は厳重に管理し、古物営業法上の取引記録、本人確認のため、また古物営業法等法令による要請を除き第三者への提供はしません。

・買取代金は原則、持ち込みまたは到着日の翌日～3営業日（銀行の営業日、土日祝を除く）を目安にお支払いいたします。
※検品、入庫処理、振込対応の担当者が異なるため、当社の諸事情により支払いが遅延する場合があります。
・支払業務は営業時間外の対応になる場合もございます。

・お客様の商品に不備がある場合、書類不備がある場合、それらの双方の確認が完了した時点から銀行3営業日が目安となります。
・免税購入した商品、またはその疑いのある商品は買取できません。
・二次流通品、再シュリンク品を申告なしに買取依頼した場合には警察への相談、法的手段の検討をいたします。今後のご利用を制限させていただくこともございますので、ご了承ください。
・当社振込後、金額の過不足が判明した場合は、速やかに双方で確認し、不足分は追加振込、多い場合はお客様にてご返金いただきます。
・お客様のお申込数量と当社確認数量が異なる場合、当社確認数をもって売買契約の成立数量といたします。数量の差異が著しい場合や、当社判断により取引継続が困難と認められる場合には、契約を解除し、商品のご返却、または買取をお断りする場合がございます。`;

      try {
        const response = await fetch('/api/settings/buyback-consent');
        const data = await response.json();

        if (data.success && data.text) {
          setConsentText(data.text);
        } else {
          // フォールバック: デフォルトテキスト
          setConsentText(defaultConsentText);
        }
      } catch (error) {
        console.error('[BuybackIntakePage] 同意テキスト取得エラー:', error);
        // フォールバック: デフォルトテキスト
        setConsentText(defaultConsentText);
      }
    };

    loadConsentText();
  }, []);

  // カテゴリ取得: buypricesMasterに存在するcategoryIdのみ表示
  useEffect(() => {
    const loadCategories = async () => {
      const db = getFirestoreClient();
      if (!db) return;

      try {
        const { collection, doc, getDocs } = await import('firebase/firestore');

        // buypricesMasterから実際に使用されているcategoryIdを取得
        const buypricesSnap = await getDocs(collection(db, 'buypricesMaster'));
        const usedCategoryIds = new Set<string>();
        buypricesSnap.docs.forEach((d) => {
          const categoryId = d.data().categoryId;
          if (categoryId) {
            usedCategoryIds.add(categoryId);
          }
        });

        // taxonomiesからカテゴリラベルを取得
        const categoriesDoc = doc(db, 'taxonomies', 'categories');
        const categoriesSnap = await getDocs(collection(categoriesDoc, 'terms'));

        const cats = categoriesSnap.docs
          .filter((d) => usedCategoryIds.has(d.id)) // buypricesMasterに存在するもののみ
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              label: data.label || data.name || d.id,
              order: data.order || 0,
            };
          });

        cats.sort((a, b) => (a.order || 0) - (b.order || 0));
        setCategoryOptions(cats);
      } catch (error) {
        console.error('カテゴリの読み込みに失敗しました:', error);
      }
    };
    loadCategories();
  }, []);

  // タイプ取得
  useEffect(() => {
    const loadTypes = async () => {
      const db = getFirestoreClient();
      if (!db) return;

      try {
        const { collection, doc, getDocs } = await import('firebase/firestore');
        const typesDoc = doc(db, 'taxonomies', 'types');
        const typesSnap = await getDocs(collection(typesDoc, 'terms'));

        const types = typesSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            label: data.label || data.name || d.id,
            order: data.order || 0,
          };
        });

        types.sort((a, b) => (a.order || 0) - (b.order || 0));
        setAllTypeOptions(types);
      } catch (error) {
        console.error('タイプの読み込みに失敗しました:', error);
      }
    };
    loadTypes();
  }, []);

  // 封入数取得
  useEffect(() => {
    const loadSealings = async () => {
      const db = getFirestoreClient();
      if (!db) return;

      try {
        const { collection, doc, getDocs } = await import('firebase/firestore');
        const sealingsDoc = doc(db, 'taxonomies', 'sealings');
        const sealingsSnap = await getDocs(collection(sealingsDoc, 'terms'));

        const sealings = sealingsSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            label: data.label || data.name || d.id,
            order: data.order || 0,
          };
        });

        sealings.sort((a, b) => (a.order || 0) - (b.order || 0));
        setAllSealingOptions(sealings);
      } catch (error) {
        console.error('封入数の読み込みに失敗しました:', error);
      }
    };
    loadSealings();
  }, []);

  useEffect(() => {
    // 銀行データをロード
    loadBankData().then(data => setBankData(data));

    // 同意書テキストを読み込む
    const loadConsentText = async () => {
      try {
        const response = await fetch('/api/buyback-settings/consent');
        if (response.ok) {
          const data = await response.json();
          setConsentText(data.consentText || DEFAULT_CONSENT_TEXT);
        }
      } catch (error) {
        console.error('同意書の読み込みに失敗しました:', error);
        // Fall back to a safe default consent text so UI and PDF contain content
        setConsentText(DEFAULT_CONSENT_TEXT);
      }
    };
    loadConsentText();

    // 生年月日の初期値を30年前に設定
    const today = new Date();
    const thirtyYearsAgo = new Date(today.getFullYear() - 30, today.getMonth(), today.getDate());
    const formattedDate = thirtyYearsAgo.toISOString().split('T')[0];

    setFormData(prev => ({
      ...prev,
      birthdate: formattedDate,
    }));
  }, []);

  // 拗音（小文字）を大文字に正規化する関数
  // 例: きょうと → きようと、しゅうと → しゆうと
  const normalizeSmallKana = (s: string) => {
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
  };

  // Normalize input to hiragana where possible (katakana -> hiragana)
  const normalizeToHiragana = (s: string) => {
    if (!s) return '';
    // convert katakana (U+30A1..U+30F6) to hiragana by unicode offset
    return s.replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60)).replace(/\s+/g, '');
  };

  // Convert hiragana to katakana
  const hiraganaToKatakana = (s: string) => {
    if (!s) return '';
    // convert hiragana (U+3041..U+3096) to katakana by unicode offset
    return s.replace(/[\u3041-\u3096]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
  };

  // Enrich type dropdown options with buy prices derived from buypricesMaster.
  const enrichTypeOptionsWithPrice = useCallback(
    async (
      productName: string,
      categoryId: string | undefined,
      baseOptions: TypeOptionWithPrice[]
    ): Promise<TypeOptionWithPrice[]> => {
      const trimmed = productName?.trim();
      if (!trimmed || trimmed.length < 2 || baseOptions.length === 0) {
        return baseOptions;
      }

      const normalized = trimmed.toLowerCase();
      const cacheKey = `${normalized}__${categoryId ?? ''}`;

      const applyPriceMap = (options: TypeOptionWithPrice[], map: Map<string, number>) => {
        if (!map.size) return options;
        return options.map((option) => {
          if (typeof option.price === 'number') {
            return option;
          }
          const idKey = `id:${option.id}`;
          if (map.has(idKey)) {
            return { ...option, price: map.get(idKey)! };
          }
          const labelKey = `label:${option.label.trim().toLowerCase()}`;
          if (map.has(labelKey)) {
            return { ...option, price: map.get(labelKey)! };
          }
          return option;
        });
      };

      const cached = typePriceCacheRef.current.get(cacheKey);
      if (cached) {
        return applyPriceMap(baseOptions, cached);
      }

      try {
        const result = await priceSelectorStrategy.search(trimmed, categoryId ? { categoryId } : undefined);
        const priceMap = new Map<string, number>();

        result.items.forEach((item) => {
          const price = typeof item.buyPrice === 'number' ? item.buyPrice : undefined;
          if (price === undefined) return;

          (item.types || []).forEach((typeId) => {
            if (!typeId) return;
            const key = `id:${typeId}`;
            const prev = priceMap.get(key);
            if (prev === undefined || price > prev) {
              priceMap.set(key, price);
            }
          });

          (item.typeLabels || []).forEach((label) => {
            if (!label) return;
            const key = `label:${label.trim().toLowerCase()}`;
            const prev = priceMap.get(key);
            if (prev === undefined || price > prev) {
              priceMap.set(key, price);
            }
          });
        });

        typePriceCacheRef.current.set(cacheKey, priceMap);
        return applyPriceMap(baseOptions, priceMap);
      } catch (error) {
        console.error('タイプ価格の取得に失敗しました:', error);
        return baseOptions;
      }
    },
    [priceSelectorStrategy]
  );

  // Update suggestions: require at least 2 characters before consulting per-kana JSON
  // immediate=true の場合はデバウンスせず即時処理
  const updateBankSuggestions = useCallback((value: string, immediate = false) => {
    const trimmed = value.trim();

    // if empty or too short, clear suggestions
    if (!trimmed || trimmed.length < 2) {
      setBankSuggestions([]);
      setShowBankSuggestions(false);
      return;
    }

    // Build key: try converting to hiragana and take first 2 chars; fallback to raw first 2 chars
    const hira = normalizeToHiragana(trimmed);
    // 拗音を正規化（きょうと → きようと）
    const normalizedHira = normalizeSmallKana(hira);
    const key = (normalizedHira && normalizedHira.length >= 2) ? normalizedHira.slice(0, 2) : trimmed.slice(0, 2);

    const serveSuggestions = (sourceData: BankData[] | undefined) => {
      if (!sourceData) {
        setBankSuggestions([]);
        // 2文字以上入力されていたら「その他」を表示し続ける
        setShowBankSuggestions(trimmed.length >= 2);
        return;
      }
      // 検索時も拗音正規化を適用
      const normalizedQuery = normalizeSmallKana(normalizeToHiragana(trimmed));
      const suggestions = searchBanks(normalizedQuery, sourceData);
      setBankSuggestions(suggestions.slice(0, 10));
      // サジェストがなくても2文字以上入力されていたら「その他」を表示
      setShowBankSuggestions(trimmed.length >= 2);
    };

    const run = () => {
      // If we already have cached data for this key, use it
      const cached = groupCacheRef.current[key];
      if (cached) {
        serveSuggestions(cached);
        return;
      }

      // Abort previous fetch if any
      if (bankFetchAbortRef.current) {
        bankFetchAbortRef.current.abort();
      }
      const controller = new AbortController();
      bankFetchAbortRef.current = controller;
      const seq = ++bankRequestSeqRef.current;

      // Otherwise fetch the group JSON from public/bankdata_by_kana/<key>.json
      const url = `/bankdata_by_kana/${encodeURIComponent(key)}.json`;
      fetch(url, { signal: controller.signal })
        .then(res => {
          if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
          return res.json();
        })
        .then((arr: BankData[]) => {
          if (seq !== bankRequestSeqRef.current) return; // stale
          groupCacheRef.current[key] = arr || [];
          serveSuggestions(arr || []);
        })
        .catch(err => {
          if (controller.signal.aborted) return; // aborted, ignore
          console.warn('bankdata group fetch failed:', err);
          // fallback: try searching global bankData (best-effort)
          try {
            if (seq === bankRequestSeqRef.current) serveSuggestions(bankData);
          } catch {
            setBankSuggestions([]);
            setShowBankSuggestions(false);
          }
        });
    };

    if (immediate) {
      if (bankDebounceRef.current) {
        clearTimeout(bankDebounceRef.current);
        bankDebounceRef.current = null;
      }
      run();
    } else {
      if (bankDebounceRef.current) clearTimeout(bankDebounceRef.current);
      bankDebounceRef.current = setTimeout(run, 200);
    }
  }, [bankData]);

  // IME入力中はサジェストを強制的に表示し続ける
  useEffect(() => {
    if (isComposingBankName && bankSuggestions.length > 0) {
      setShowBankSuggestions(true);
    }
  }, [isComposingBankName, bankSuggestions.length]);

  // Step変更を監視
  useEffect(() => {
    dlog('[BuybackIntakePage] currentStep変更:', currentStep);
  }, [currentStep, dlog]);

  const nextStep = async () => {
    const nextStepNumber = Math.min(currentStep + 1, 6);

    // Step 5 → Step 6 に進む際に受付番号を事前取得
    if (currentStep === 5 && nextStepNumber === 6 && !receptionNumber) {
      try {
        setSubmissionStatus('受付番号を発行中...');
        const response = await fetch('/api/generate-reception-number');
        const data = await response.json();

        if (data.success && data.receptionNumber) {
          setReceptionNumber(data.receptionNumber);
          console.log('[Reception] Pre-generated:', data.receptionNumber);
        } else {
          console.error('[Reception] Failed to generate:', data.error);
        }
      } catch (error) {
        console.error('[Reception] Error generating reception number:', error);
      } finally {
        setSubmissionStatus('');
      }
    }

    setCurrentStep(nextStepNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { category: '', categoryId: '', item: '', subcategory: '', count: 1, typeId: '', type: '' }],
    }));
    // 新しく追加したアイテムを編集モードにする
    setEditingItemIndex(formData.items.length);
    // 追加に合わせて itemTypeOptions を増やす
    setItemTypeOptions(prev => [...prev, [] as Array<{ id: string; label: string }>]);
  };

  const removeItem = (index: number) => {
    if (formData.items.length > 1) {
      setFormData(prev => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index),
      }));
      setItemTypeOptions(prev => prev.filter((_, i) => i !== index));
    }
  };

  // 銀行サジェストが1件のみの場合に自動選択するヘルパー
  const autoSelectSingleBankSuggestion = useCallback(() => {
    if (bankSuggestions.length === 1 && formData.bankCode !== 'OTHER') {
      const bank = bankSuggestions[0];
      setFormData(prev => ({
        ...prev,
        bankName: bank.bankName,
        bankCode: bank.bankCode,
        branchName: '',
        branchCode: ''
      }));
      setShowBankSuggestions(false);
      setBankSuggestions([]);
      dlog('[Bank Input] 自動補完: 候補1件のため自動選択:', bank.bankName);
    }
  }, [bankSuggestions, formData.bankCode, dlog]);

  const handleSubmit = async () => {
    if (!formData.consent) {
      return;
    }

    try {
      setSubmissionStatus('身分証明書をアップロード中...');

      // 身分証明書をFirebase Storageにアップロード（受付番号取得前に仮IDを使用）
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      let idFrontUrl = '';
      let idBackUrl = '';

      const storage = getFirebaseStorage();
      if (!storage) {
        throw new Error('Firebase Storageが初期化されていません');
      }

      if (formData.idFront) {
        const idFrontRef = ref(storage, `buyback-ids/${tempId}/id_front.jpg`);
        await uploadBytes(idFrontRef, formData.idFront);
        idFrontUrl = await getDownloadURL(idFrontRef);
      }

      if (formData.idBack) {
        const idBackRef = ref(storage, `buyback-ids/${tempId}/id_back.jpg`);
        await uploadBytes(idBackRef, formData.idBack);
        idBackUrl = await getDownloadURL(idBackRef);
      }

      // 身分証動画をStorageにアップロード
      const verificationVideoUrls: string[] = [];
      if (formData.verificationSession?.videoBlobs && formData.verificationSession.videoBlobs.length > 0) {
        setSubmissionStatus('身分証動画をアップロード中...');
        // 受付番号を保存先に使用（フォールバックとしてsessionIdを使用）
        const storageId = receptionNumber || formData.verificationSession.sessionId;

        // 動画をアップロード
        for (let i = 0; i < formData.verificationSession.videoBlobs.length; i++) {
          const videoBlob = formData.verificationSession.videoBlobs[i];
          const videoRef = ref(storage, `id-verification/${storageId}/video_${i}.webm`);
          await uploadBytes(videoRef, videoBlob);
          const videoUrl = await getDownloadURL(videoRef);
          verificationVideoUrls.push(videoUrl);
        }

        // スナップショットをアップロード
        if (formData.verificationSession.stepMarkers && formData.verificationSession.stepMarkers.length > 0) {
          setSubmissionStatus('スナップショットをアップロード中...');
          for (let i = 0; i < formData.verificationSession.stepMarkers.length; i++) {
            const marker = formData.verificationSession.stepMarkers[i];
            if (marker.snapshot) {
              try {
                // Data URLをBlobに変換
                const base64Data = marker.snapshot.split(',')[1];
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let j = 0; j < byteCharacters.length; j++) {
                  byteNumbers[j] = byteCharacters.charCodeAt(j);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const snapshotBlob = new Blob([byteArray], { type: 'image/jpeg' });

                // Storageにアップロード（受付番号を使用）
                const snapshotRef = ref(storage, `id-verification/${storageId}/snapshot_step${marker.step}.jpg`);
                await uploadBytes(snapshotRef, snapshotBlob);
                console.log(`[Snapshot] Uploaded step ${marker.step} snapshot to ${storageId}`);
              } catch (err) {
                console.error(`[Snapshot] Failed to upload step ${marker.step}:`, err);
              }
            }
          }
        }
      }

      setSubmissionStatus('買取申込を送信中...');

      // 暗号化された銀行情報を送信（画像URL、動画URLも含める）
      const submitResult = await submitSecure({
        bankName: formData.bankName,
        bankCode: formData.bankCode,
        branchName: formData.branchName,
        branchCode: formData.branchCode,
        accountNumber: formData.accountNumber,
        accountNameKana: formData.accountNameKana,
        idFrontUrl,
        idBackUrl,
        tempStorageId: tempId,
        preGeneratedReceptionNumber: receptionNumber, // 事前発行済みの受付番号を渡す
        verificationSession: formData.verificationSession ? {
          sessionId: formData.verificationSession.sessionId,
          videoUrls: verificationVideoUrls,
          stepMarkers: formData.verificationSession.stepMarkers,
          deviceInfo: formData.verificationSession.deviceInfo,
        } : undefined,
      });

      // サーバーから返された受付番号を確認・更新
      if (submitResult && submitResult.receptionNumber) {
        console.log('[Reception] Server confirmed reception number:', submitResult.receptionNumber);
        if (!receptionNumber) {
          // 事前生成していない場合は、サーバーが生成した番号を使用
          setReceptionNumber(submitResult.receptionNumber);
        }
      }

      // 来店予約の場合は bookings コレクションにも保存
      if (formData.deliveryMethod === 'visit' && formData.preferredDateTime) {
        try {
          setSubmissionStatus('来店予約を登録中...');
          const { createBookingOnce } = await import('@/lib/firestoreClient');
          const dateTime = new Date(formData.preferredDateTime);
          const date = dateTime.toISOString().split('T')[0];
          const hours = dateTime.getHours().toString().padStart(2, '0');
          const minutes = dateTime.getMinutes().toString().padStart(2, '0');
          const slot = `${hours}:${minutes}`;

          const bookingResult = await createBookingOnce({
            date,
            slot,
            customerName: formData.name,
            customerContact: formData.lineName,
            storeId: 'default',
            receptionNumber: receptionNumber || '',
          });

          if (!bookingResult.ok) {
            console.warn('Booking creation failed:', bookingResult.reason);
            // 予約失敗してもエラーにはしない（buy_request は成功しているため）
          } else {
            dlog('Booking created successfully');
          }
        } catch (bookingError) {
          console.warn('Booking creation error:', bookingError);
          // 予約失敗してもエラーにはしない
        }
      }

      // PDF生成してStorageにアーカイブ（受付番号取得後）
      try {
        setSubmissionStatus('PDF生成中...');
        console.log('[PDF] Starting PDF generation, receptionNumber:', receptionNumber);

        if (!receptionNumber) {
          console.error('[PDF] Reception number is missing, cannot upload PDF');
          throw new Error('受付番号が取得できていません');
        }

        const pdfBlob = await generatePDFBlob();
        console.log('[PDF] PDF blob generated:', pdfBlob ? `${pdfBlob.size} bytes` : 'null');

        if (pdfBlob) {
          const storage = getFirebaseStorage();
          if (storage) {
            const pdfPath = `buyback-agreements/${receptionNumber}/agreement.pdf`;
            console.log('[PDF] Uploading to:', pdfPath);
            const pdfRef = ref(storage, pdfPath);
            await uploadBytes(pdfRef, pdfBlob);
            const pdfUrl = await getDownloadURL(pdfRef);
            console.log('[PDF] ✅ PDF archived to Storage:', pdfUrl);
          } else {
            console.error('[PDF] Storage not initialized');
          }
        } else {
          console.error('[PDF] PDF blob generation failed');
        }
      } catch (pdfError) {
        console.error('[PDF] PDF archiving error:', pdfError);
        // PDF生成失敗してもエラーにはしない（申込自体は成功）
      }

      // 送信完了
      setSubmissionStatus('');
    } catch (error) {
      console.error('Submission error:', error);
      setSubmissionStatus('');
      alert('送信に失敗しました。もう一度お試しください。');
    }
  };

  // PDF生成してBlobを返すヘルパー関数
  const generatePDFBlob = async (): Promise<Blob | null> => {
    const element = document.getElementById('buyback-agreement');
    if (!element) {
      return null;
    }

    try {
      const a4WidthPx = 1000;
      const paddingPx = 40;
      const borderPx = 2;

      const originalStyle = element.style.cssText;
      element.style.cssText = `
        display: block !important;
        visibility: visible !important;
        position: absolute !important;
        left: -9999px !important;
        top: 0 !important;
        width: ${a4WidthPx}px !important;
        max-width: ${a4WidthPx}px !important;
        padding: ${paddingPx}px !important;
        margin: 0 !important;
        background: white !important;
        border: ${borderPx}px solid #333 !important;
        box-shadow: none !important;
        font-size: 0.95rem !important;
        font-family: serif !important;
        box-sizing: content-box !important;
      `;

      await new Promise(resolve => setTimeout(resolve, 200));

      const totalWidth = element.offsetWidth;
      const totalHeight = element.offsetHeight;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: totalWidth,
        height: totalHeight,
      });

      element.style.cssText = originalStyle;

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const margin = 10;
      const availableWidth = pdfWidth - (margin * 2);
      const availableHeight = pdfHeight - (margin * 2);

      const imgWidthMM = canvas.width / 3.7795;
      const imgHeightMM = canvas.height / 3.7795;

      const scale = Math.min(availableWidth / imgWidthMM, 1);
      const scaledWidth = imgWidthMM * scale;
      const scaledHeight = imgHeightMM * scale;

      const imgX = (pdfWidth - scaledWidth) / 2;

      let currentY = margin;
      let remainingHeight = scaledHeight;
      let sourceY = 0;

      while (remainingHeight > 0) {
        const pageContentHeight = Math.min(availableHeight, remainingHeight);
        const sourceHeight = (pageContentHeight / scaledHeight) * canvas.height;

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sourceHeight;
        const ctx = pageCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight);
          const pageImgData = pageCanvas.toDataURL('image/png');
          pdf.addImage(pageImgData, 'PNG', imgX, currentY, scaledWidth, pageContentHeight);
        }

        remainingHeight -= pageContentHeight;
        sourceY += sourceHeight;

        if (remainingHeight > 0) {
          pdf.addPage();
          currentY = margin;
        }
      }

      return pdf.output('blob');
    } catch (error) {
      console.error('PDF生成エラー:', error);
      return null;
    }
  };

  // PDF生成関数（ダウンロード用）
  const generatePDF = async () => {
    const blob = await generatePDFBlob();
    if (!blob) {
      alert('PDF生成に失敗しました。');
      return;
    }

    try {
      // 受付番号をファイル名に使用
      const filename = receptionNumber
        ? `買取依頼書_${receptionNumber}.pdf`
        : `買取依頼書_${new Date().toISOString().split('T')[0]}.pdf`;

      // Blobをダウンロード
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDFダウンロードエラー:', error);
      alert('PDFダウンロードに失敗しました。');
    }
  };

  // 印刷関数
  const handlePrint = () => {
    const element = document.getElementById('buyback-agreement');
    if (!element) {
      alert('印刷に失敗しました。');
      return;
    }

    // window.print()は@media printで自動的に表示される
    window.print();
  };

  // 18歳以上かチェックする関数
  const isAtLeast18YearsOld = (birthdate: string): boolean => {
    if (!birthdate) return false;
    const today = new Date();
    const birth = new Date(birthdate);
    const age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    const dayDiff = today.getDate() - birth.getDate();

    // 誕生日がまだ来ていない場合は年齢から1を引く
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
      return age - 1 >= 18;
    }
    return age >= 18;
  };

  const canAdvanceFromStep1 =
    formData.name.trim() !== '' &&
    formData.address.trim() !== '' &&
    formData.birthdate.trim() !== '' &&
    formData.lineName.trim() !== '' &&
    isAtLeast18YearsOld(formData.birthdate);

  return (
    <>
      <div style={{
        maxWidth: 'min(1200px, 95vw)',
        margin: '0 auto',
        padding: '16px clamp(12px, 3vw, 24px)',
        width: '100%'
      }}>

        {/* Progress indicator - スマホ最適化版 */}
        <div className="no-print" style={{
          marginBottom: '16px',
          padding: '16px',
          background: '#f8f9fa',
          borderRadius: '8px'
        }}>
          {(() => {
            const steps = [
              { num: 1, label: '個人情報' },
              { num: 2, label: '本人確認書類' },
              { num: 3, label: '口座情報' },
              { num: 4, label: '買取希望項目' },
              { num: 5, label: '買取方法' },
              { num: 6, label: '同意と確認' },
              { num: 7, label: '完了' }
            ];
            const prevStep = steps[currentStep - 2];
            const currentStepData = steps[currentStep - 1];
            const nextStep = steps[currentStep];

            return (
              <>
                {/* ページ数表示 */}
                <div style={{
                  textAlign: 'center',
                  fontSize: '0.9rem',
                  color: '#666',
                  marginBottom: '12px',
                  fontWeight: '500'
                }}>
                  {currentStep} / {steps.length}
                </div>

                {/* 3カラムレイアウト */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1.5fr 1fr',
                  gap: '8px',
                  alignItems: 'center',
                  minHeight: '60px'
                }}>
                  {/* 左: 前のステップ */}
                  <div style={{
                    textAlign: 'center',
                    fontSize: '0.75rem',
                    color: '#999',
                    padding: '8px 4px'
                  }}>
                    {prevStep && (
                      <>
                        <div style={{ fontSize: '0.7rem', marginBottom: '2px' }}>前</div>
                        <div style={{ fontWeight: '600', color: '#28a745' }}>{prevStep.num}</div>
                        <div style={{ fontSize: '0.7rem', marginTop: '2px', lineHeight: 1.2 }}>
                          {prevStep.label}
                        </div>
                      </>
                    )}
                  </div>

                  {/* 中央: 現在のステップ */}
                  <div style={{
                    textAlign: 'center',
                    background: '#007bff',
                    color: 'white',
                    borderRadius: '8px',
                    padding: '12px 8px',
                    boxShadow: '0 2px 8px rgba(0,123,255,0.3)'
                  }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '4px' }}>
                      {currentStepData.num}
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: '600', lineHeight: 1.3 }}>
                      {currentStepData.label}
                    </div>
                  </div>

                  {/* 右: 次のステップ */}
                  <div style={{
                    textAlign: 'center',
                    fontSize: '0.75rem',
                    color: '#999',
                    padding: '8px 4px'
                  }}>
                    {nextStep && (
                      <>
                        <div style={{ fontSize: '0.7rem', marginBottom: '2px' }}>次</div>
                        <div style={{ fontWeight: '600', color: '#666' }}>{nextStep.num}</div>
                        <div style={{ fontSize: '0.7rem', marginTop: '2px', lineHeight: 1.2 }}>
                          {nextStep.label}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* プログレスバー */}
                <div style={{
                  marginTop: '12px',
                  height: '4px',
                  background: '#e0e0e0',
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${(currentStep / steps.length) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(to right, #28a745, #007bff)',
                    transition: 'width 0.3s ease'
                  }}></div>
                </div>
              </>
            );
          })()}
        </div>

        {/* Step 1: 個人情報 */}
        {currentStep === 1 && (
          <div>
            <fieldset className="form-fieldset">
              <legend>個人情報</legend>

              <label className="form-label">
                お名前 *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="form-input"
                placeholder="山田 太郎"
                required
              />

              <label className="form-label">
                身分証に記載の住所 *
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                className="form-input"
                placeholder="東京都渋谷区..."
                required
              />

              <label className="form-label">
                生年月日 *
              </label>
              <BirthdateSelect
                value={formData.birthdate}
                onChange={(next) => setFormData(prev => ({ ...prev, birthdate: next }))}
              />

              {/* 18歳未満の警告メッセージ */}
              {formData.birthdate && !isAtLeast18YearsOld(formData.birthdate) && (
                <div style={{
                  marginTop: '12px',
                  padding: 'clamp(12px, 3vw, 16px)',
                  background: 'linear-gradient(135deg, #fff5f5 0%, #ffe0e0 100%)',
                  border: '2px solid #dc3545',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  boxShadow: '0 2px 8px rgba(220,53,69,0.15)'
                }}>
                  <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>⚠️</span>
                  <div>
                    <div style={{
                      fontSize: 'clamp(0.9rem, 2.5vw, 1rem)',
                      fontWeight: '700',
                      color: '#dc3545',
                      marginBottom: '4px'
                    }}>
                      18歳未満の方はお申し込みいただけません
                    </div>
                    <div style={{
                      fontSize: 'clamp(0.85rem, 2.5vw, 0.9rem)',
                      color: '#721c24',
                      lineHeight: 1.5
                    }}>
                      買取サービスのご利用には、18歳以上である必要があります。
                    </div>
                  </div>
                </div>
              )}

              <label className="form-label">
                ラインの登録名 *
              </label>
              <input
                type="text"
                value={formData.lineName}
                onChange={(e) => setFormData(prev => ({ ...prev, lineName: e.target.value }))}
                className="form-input"
                placeholder="やまだ"
                required
              />
            </fieldset>

            <div className="button-group">
              <Button
                onClick={() => {
                  if (canAdvanceFromStep1) {
                    nextStep();
                  }
                }}
                disabled={!canAdvanceFromStep1}
                variant="gradient"
              >
                次へ進む(本人確認書類)
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: 本人確認書類の動画撮影 */}
        {currentStep === 2 && !showVideoRecorder && (
          <div>
            {/* 入力した情報の表示 */}
            <div style={{
              background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
              border: '2px solid #007bff',
              borderRadius: '10px',
              padding: 'clamp(12px, 3vw, 14px)',
              marginBottom: '16px',
              boxShadow: '0 2px 8px rgba(0,123,255,0.15)'
            }}>
              <h3 style={{
                fontSize: 'clamp(0.9rem, 2.8vw, 1rem)',
                color: '#0056b3',
                marginBottom: '10px',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span>📋</span>
                <span>入力された情報</span>
              </h3>
              <p style={{
                fontSize: 'clamp(0.8rem, 2.3vw, 0.85rem)',
                color: '#555',
                marginBottom: '12px',
                lineHeight: 1.5
              }}>
                以下の情報と一致する身分証明書を撮影してください
              </p>
              <div style={{
                background: 'white',
                borderRadius: '6px',
                padding: 'clamp(10px, 2.5vw, 12px)',
                display: 'grid',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: '600', color: '#0056b3', minWidth: '75px', fontSize: 'clamp(0.8rem, 2.3vw, 0.85rem)' }}>お名前:</span>
                  <span style={{ fontSize: 'clamp(0.85rem, 2.3vw, 0.9rem)', color: '#333' }}>{formData.name || '（未入力）'}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: '600', color: '#0056b3', minWidth: '75px', fontSize: 'clamp(0.8rem, 2.3vw, 0.85rem)' }}>住所:</span>
                  <span style={{ fontSize: 'clamp(0.85rem, 2.3vw, 0.9rem)', color: '#333', lineHeight: 1.4 }}>{formData.address || '（未入力）'}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: '600', color: '#0056b3', minWidth: '75px', fontSize: 'clamp(0.8rem, 2.3vw, 0.85rem)' }}>生年月日:</span>
                  <span style={{ fontSize: 'clamp(0.85rem, 2.3vw, 0.9rem)', color: '#333' }}>
                    {formData.birthdate ? new Date(formData.birthdate).toLocaleDateString('ja-JP', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    }) : '（未入力）'}
                  </span>
                </div>
              </div>
            </div>

            <fieldset className="form-fieldset">
              <legend>本人確認（動画撮影）</legend>

              {!formData.verificationSession && (
                <p style={{ fontSize: 'clamp(0.85rem, 2.5vw, 0.9rem)', color: '#555', marginBottom: '16px', lineHeight: 1.6 }}>
                  古物商法に基づき、身分証明書の動画撮影を行います。<br />
                  表面・裏面・厚み・セルフィーの4ステップで撮影します。
                </p>
              )}

              {formData.verificationSession ? (
                <div style={{
                  padding: '20px',
                  background: 'linear-gradient(135deg, #28a745 0%, #218838 100%)',
                  color: 'white',
                  borderRadius: '10px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: '10px' }}>✅</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '8px' }}>
                    撮影が完了しました
                  </div>
                  {(verificationFrontSnapshot || verificationBackSnapshot) && (
                    <div
                      style={{
                        marginTop: '16px',
                        display: 'grid',
                        gap: '12px',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        alignItems: 'stretch'
                      }}
                    >
                      {verificationFrontSnapshot && (
                        <div
                          style={{
                            position: 'relative',
                            width: '100%',
                            paddingTop: '62.5%',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            background: 'rgba(255,255,255,0.12)',
                            boxShadow: '0 6px 20px rgba(0,0,0,0.25)'
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              top: '10px',
                              left: '10px',
                              padding: '4px 10px',
                              borderRadius: '999px',
                              background: 'rgba(0,0,0,0.6)',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              letterSpacing: '0.04em'
                            }}
                          >
                            表面
                          </span>
                          <img
                            src={verificationFrontSnapshot}
                            alt="表面の静止画"
                            style={{
                              position: 'absolute',
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              objectPosition: 'center',
                              transform: 'scale(1.05)'
                            }}
                          />
                        </div>
                      )}
                      {verificationBackSnapshot && (
                        <div
                          style={{
                            position: 'relative',
                            width: '100%',
                            paddingTop: '62.5%',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            background: 'rgba(255,255,255,0.12)',
                            boxShadow: '0 6px 20px rgba(0,0,0,0.25)'
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              top: '10px',
                              left: '10px',
                              padding: '4px 10px',
                              borderRadius: '999px',
                              background: 'rgba(0,0,0,0.6)',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              letterSpacing: '0.04em'
                            }}
                          >
                            裏面
                          </span>
                          <img
                            src={verificationBackSnapshot}
                            alt="裏面の静止画"
                            style={{
                              position: 'absolute',
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              objectPosition: 'center',
                              transform: 'scale(1.05)'
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowVideoRecorder(true)}
                  style={{
                    width: '100%',
                    padding: '20px',
                    background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: 'clamp(16px, 4vw, 18px)',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 12px rgba(0,123,255,0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,123,255,0.35)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,123,255,0.25)';
                  }}
                >
                  <span style={{ fontSize: '3rem' }}>🎥</span>
                  <span>身分証の動画撮影を開始</span>
                  <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>
                    （表面・裏面・厚み・セルフィー）
                  </span>
                </button>
              )}
            </fieldset>

            <div className="button-group">
              <Button onClick={prevStep} variant="white">← 戻る</Button>
              <Button
                onClick={nextStep}
                disabled={!formData.verificationSession}
                variant="gradient"
              >
                次へ進む（口座情報）
              </Button>
            </div>
          </div>
        )}

        {/* VideoRecorder（フルスクリーン） */}
        {showVideoRecorder && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            background: 'black'
          }}>
            <VideoRecorder
              onComplete={(session) => {
                console.log('[BuybackIntake] 撮影完了:', session);
                setFormData(prev => ({ ...prev, verificationSession: session }));
                setShowVideoRecorder(false);
              }}
              onCancel={() => {
                setShowVideoRecorder(false);
              }}
            />
          </div>
        )}

        {/* Step 3: 口座情報 */}
        {currentStep === 3 && (
          <div>
            <fieldset className="form-fieldset">
              <legend>銀行口座情報</legend>

              <label className="form-label">
                金融機関名 *
              </label>
              {formData.bankCode === 'OTHER' && (
                <div style={{
                  padding: 'clamp(10px, 2.5vw, 12px)',
                  backgroundColor: '#fff8e1',
                  border: '2px solid #ffc107',
                  borderRadius: '8px',
                  marginBottom: '12px',
                  fontSize: 'clamp(0.85rem, 2.5vw, 0.9rem)',
                  color: '#856404',
                  lineHeight: 1.5
                }}>
                  📝 その他の銀行として登録されます。銀行名と支店名を自由に入力してください。
                </div>
              )}
              <div style={{ position: 'relative' }}>
                <input
                  ref={bankInputRef}
                  type="text"
                  value={formData.bankName}
                  onChange={(e) => {
                    const value = e.target.value;
                    dlog('[Bank Input] onChange:', { value, isComposing: isComposingBankName });

                    setFormData(prev => {
                      const prevWasCustom = prev.bankCode === 'OTHER';
                      return {
                        ...prev,
                        bankName: value,
                        bankCode: prevWasCustom ? 'OTHER' : '',
                        branchName: prevWasCustom ? prev.branchName : '',
                        branchCode: prevWasCustom ? prev.branchCode : ''
                      };
                    });

                    // IME入力中でない場合はデバウンス検索（immediate=false）
                    if (!isComposingBankName) {
                      updateBankSuggestions(value, false);
                    }
                  }}
                  onCompositionStart={() => {
                    dlog('[Bank Input] onCompositionStart - IME入力開始');
                    setIsComposingBankName(true);
                    // 現在の確定済みテキストを保存
                    setConfirmedBankName(formData.bankName);
                  }}
                  onCompositionUpdate={(e) => {
                    const data = e.data || '';
                    dlog('[Bank Input] onCompositionUpdate:', { data });

                    // ひらがなのみかチェック（ローマ字混在なら false）
                    const isOnlyHiragana = /^[\u3040-\u309F]*$/.test(data);

                    if (isOnlyHiragana && data) {
                      // ひらがなのみ: 確定済み + 現在の変換中ひらがなで検索
                      const searchValue = confirmedBankName + data;
                      dlog('[Bank Input] ひらがなのみ検索:', searchValue);
                      updateBankSuggestions(searchValue, true);
                    } else {
                      // ローマ字混在: 直前の確定文字列で固定（サジェストを維持）
                      dlog('[Bank Input] ローマ字混在のため確定テキストで固定:', confirmedBankName);
                      if (confirmedBankName) {
                        updateBankSuggestions(confirmedBankName, true);
                      }
                    }
                  }}
                  onCompositionEnd={(e) => {
                    const nextValue = e.currentTarget.value;
                    dlog('[Bank Input] onCompositionEnd - IME入力確定:', nextValue);
                    setIsComposingBankName(false);
                    // 確定後に確定済みテキストを更新し、通常検索
                    setConfirmedBankName(nextValue);
                    updateBankSuggestions(nextValue, true);
                  }}
                  onBlur={() => {
                    // 候補が1件のみなら自動補完
                    setTimeout(() => {
                      autoSelectSingleBankSuggestion();
                      setShowBankSuggestions(false);
                    }, 200);
                  }}
                  onFocus={() => {
                    dlog('[Bank Input] onFocus');
                    if (formData.bankName) {
                      updateBankSuggestions(formData.bankName, true);
                    } else {
                      // 空欄の場合でも「その他」オプションを表示するためにドロップダウンを開く
                      setBankSuggestions([]);
                      setShowBankSuggestions(true);
                    }
                  }}
                  onKeyDown={(e) => {
                    // 候補が1件のみの場合、Enterキーで自動補完
                    if (e.key === 'Enter' && bankSuggestions.length === 1 && formData.bankCode !== 'OTHER') {
                      e.preventDefault();
                      autoSelectSingleBankSuggestion();
                    }
                  }}
                  className="form-input"
                  style={{
                    backgroundColor: formData.bankCode === 'OTHER' ? '#fffef0' : 'white'
                  }}
                  placeholder="例: みずほ、三井住友"
                  required
                />
                {showBankSuggestions && (
                  <ul style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: 'white',
                    border: '2px solid #e3f2fd',
                    borderRadius: '8px',
                    marginTop: '6px',
                    maxHeight: '280px',
                    overflowY: 'auto',
                    listStyle: 'none',
                    padding: '4px',
                    zIndex: 1000,
                    boxShadow: '0 4px 16px rgba(0,123,255,0.15)'
                  }}>
                    {bankSuggestions.length > 0 ? (
                      <>
                        {bankSuggestions.map((bank) => (
                          <li key={`${bank.bankCode}-${bank.bankName}`}>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  bankName: bank.bankName,
                                  bankCode: bank.bankCode,
                                  branchName: '',
                                  branchCode: ''
                                }));
                                setShowBankSuggestions(false);
                                setBankSuggestions([]);
                              }}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: 'clamp(10px, 2.5vw, 12px)',
                                cursor: 'pointer',
                                border: 'none',
                                background: 'white',
                                fontSize: 'clamp(14px, 3.5vw, 15px)',
                                borderRadius: '6px',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#e3f2fd';
                                e.currentTarget.style.transform = 'translateX(4px)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'white';
                                e.currentTarget.style.transform = 'translateX(0)';
                              }}
                            >
                              {bank.bankName}{' '}
                              {(bank.bankNameKana || bank.bankNameKanaHiragana || bank.bankNameHiragana) ? (
                                <span style={{ fontSize: '0.85em', color: '#666' }}>
                                  ({bank.bankNameKana || bank.bankNameKanaHiragana || bank.bankNameHiragana})
                                </span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </>
                    ) : null}
                    {/* その他の銀行オプション - 常に表示 */}
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            bankCode: 'OTHER',
                            branchName: '',
                            branchCode: ''
                          }));
                          setShowBankSuggestions(false);
                          setBankSuggestions([]);
                        }}
                        aria-label="その他の銀行を手入力"
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: 'clamp(10px, 2.5vw, 12px)',
                          cursor: 'pointer',
                          fontSize: 'clamp(14px, 3.5vw, 15px)',
                          backgroundColor: '#f0f8ff',
                          borderTop: bankSuggestions.length > 0 ? '2px solid #bbdefb' : 'none',
                          borderRight: 'none',
                          borderBottom: 'none',
                          borderLeft: 'none',
                          fontWeight: 600,
                          borderRadius: '0 0 6px 6px',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#e1f5fe';
                          (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(4px)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f0f8ff';
                          (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(0)';
                        }}
                      >
                        📝 その他の銀行（手入力）
                      </button>
                    </li>
                  </ul>
                )}
              </div>

              <label className="form-label">
                支店名 *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={formData.branchName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData(prev => ({ ...prev, branchName: value, branchCode: '' }));

                    // その他の銀行の場合はサジェストを表示しない
                    if (formData.bankCode === 'OTHER') {
                      setBranchSuggestions([]);
                      setShowBranchSuggestions(false);
                      return;
                    }

                    if (branchDebounceRef.current) {
                      clearTimeout(branchDebounceRef.current);
                    }
                    if (value.length > 0 && formData.bankCode) {
                      branchDebounceRef.current = setTimeout(() => {
                        // groupCacheからデータを探す（銀行選択時にキャッシュされている）
                        let sourceData: BankData[] = [];
                        for (const cached of Object.values(groupCacheRef.current)) {
                          sourceData = sourceData.concat(cached);
                        }
                        // フォールバックとしてbankDataも使用
                        if (sourceData.length === 0) {
                          sourceData = bankData;
                        }
                        const suggestions = searchBranches(formData.bankCode, value, sourceData);
                        setBranchSuggestions(suggestions.slice(0, 10));
                        setShowBranchSuggestions(suggestions.length > 0);
                      }, 200);
                    } else {
                      setBranchSuggestions([]);
                      setShowBranchSuggestions(false);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowBranchSuggestions(false), 200);
                  }}
                  onFocus={() => {
                    if (formData.bankCode !== 'OTHER' && formData.branchName && branchSuggestions.length > 0) {
                      setShowBranchSuggestions(true);
                    }
                  }}
                  className="form-input"
                  style={{
                    backgroundColor: formData.bankCode === 'OTHER' ? '#fffef0' : 'white'
                  }}
                  placeholder={
                    !formData.bankCode
                      ? "先に金融機関名を入力してください"
                      : formData.bankCode === 'OTHER'
                        ? "支店名を自由に入力してください"
                        : "例: 本店、東京営業部"
                  }
                  disabled={!formData.bankCode}
                  required
                />
                {showBranchSuggestions && branchSuggestions.length > 0 && formData.bankCode !== 'OTHER' && (
                  <ul style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: 'white',
                    border: '2px solid #e3f2fd',
                    borderRadius: '8px',
                    marginTop: '6px',
                    maxHeight: '280px',
                    overflowY: 'auto',
                    listStyle: 'none',
                    padding: '4px',
                    zIndex: 1000,
                    boxShadow: '0 4px 16px rgba(0,123,255,0.15)'
                  }}>
                    {branchSuggestions.map((branch) => (
                      <li key={`${branch.bankCode}-${branch.branchCode}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              branchName: branch.branchName,
                              branchCode: branch.branchCode
                            }));
                            setShowBranchSuggestions(false);
                            setBranchSuggestions([]);
                          }}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: 'clamp(10px, 2.5vw, 12px)',
                            cursor: 'pointer',
                            border: 'none',
                            background: 'white',
                            fontSize: 'clamp(14px, 3.5vw, 15px)',
                            borderRadius: '6px',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#e3f2fd';
                            e.currentTarget.style.transform = 'translateX(4px)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'white';
                            e.currentTarget.style.transform = 'translateX(0)';
                          }}
                        >
                          {branch.branchName}{' '}
                          {(branch.branchNameKana || branch.branchNameKanaHiragana || branch.branchNameHiragana) ? (
                            <span style={{ fontSize: '0.85em', color: '#666' }}>
                              ({branch.branchNameKana || branch.branchNameKanaHiragana || branch.branchNameHiragana})
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <label className="form-label">
                口座番号 *
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={formData.accountNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, accountNumber: e.target.value.replace(/\D/g, '') }))}
                className="form-input"
                placeholder="1234567"
                required
              />

              <label className="form-label">
                振込名カナ
              </label>
              <input
                type="text"
                value={formData.accountNameKana}
                onChange={(e) => {
                  // 通常入力時はそのまま設定（カタカナ変換はCompositionEndで行う）
                  setFormData(prev => ({ ...prev, accountNameKana: e.target.value }));
                }}
                onCompositionEnd={(e) => {
                  // IME確定時にひらがなをカタカナに変換
                  const value = e.currentTarget.value;
                  const converted = hiraganaToKatakana(value);
                  setFormData(prev => ({ ...prev, accountNameKana: converted }));
                }}
                className="form-input"
                placeholder="ヤマダタロウ"
              />
            </fieldset>

            <div className="button-group">
              <Button
                onClick={prevStep}
                variant="white"
              >
                ← 戻る
              </Button>
              <Button
                onClick={nextStep}
                variant="gradient"
              >
                次へ進む
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: 買取希望項目 */}
        {currentStep === 4 && (
          <div>
            <fieldset className="form-fieldset">
              <legend>買取希望項目</legend>

              {formData.items.map((item, index) => {
                const isEditing = editingItemIndex === index;

                return (
                  <div key={index} style={{
                    marginBottom: '16px',
                    padding: 'clamp(12px, 3vw, 16px)',
                    background: isEditing
                      ? 'linear-gradient(to bottom, #f8fbff, #f0f8ff)'
                      : 'linear-gradient(to bottom, #fafafa, #f5f5f5)',
                    borderRadius: '10px',
                    border: isEditing ? '2px solid #1976d2' : '1px solid #e0e0e0'
                  }}>
                    {isEditing ? (
                      // 編集モード: 完全な入力UI
                      <div style={{ display: 'grid', gap: '10px' }}>
                        <ProductSelector
                          strategy={priceSelectorStrategy}
                          value={item.item}
                          categoryId={item.categoryId}
                          typeId={item.typeId}
                          onProductSelect={(productName: string, categoryId?: string, categoryLabel?: string) => {
                            const newItems = [...formData.items];
                            newItems[index].item = productName;
                            newItems[index].categoryId = categoryId || '';
                            newItems[index].category = categoryLabel || '';
                            // 商品選択によりタイプ候補が変わるため、既存のtype選択をクリア
                            newItems[index].typeId = '';
                            newItems[index].type = '';
                            newItems[index].buyPrice = undefined;
                            setFormData(prev => ({ ...prev, items: newItems }));
                          }}
                          onAdvancedSelect={(product) => {
                            const newItems = [...formData.items];
                            // pick a typeId from common fields if present
                            const getTypeId = () => {
                              const v = (product as any).typeId || (product as any).variantTypeId || (product as any).type_id || (product as any).typeIds?.[0] || (product as any).types?.[0];
                              return typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : undefined);
                            };
                            const mappedTypeId = getTypeId();
                            const typeLabel = (product as any).typeLabels?.[0] || (product as any).type || (product as any).typeLabel || '';
                            newItems[index].typeId = mappedTypeId || '';
                            newItems[index].type = typeLabel || '';
                            newItems[index].buyPrice = typeof (product as any).buyPrice === 'number' ? (product as any).buyPrice : undefined;
                            setFormData(prev => ({ ...prev, items: newItems }));
                          }}
                          onCategoryChange={(catId, catLabel) => {
                            const newItems = [...formData.items];
                            newItems[index].categoryId = catId;
                            newItems[index].category = catLabel;
                            newItems[index].item = '';
                            setFormData(prev => ({ ...prev, items: newItems }));
                          }}
                          onTypeChange={(typeId, typeLabel, price) => {
                            const newItems = [...formData.items];
                            newItems[index].typeId = typeId;
                            newItems[index].type = typeLabel;
                            newItems[index].buyPrice = typeof price === 'number' ? price : undefined;
                            setFormData(prev => ({ ...prev, items: newItems }));
                          }}
                          placeholder="商品名"
                          showCategorySelector={true}
                          showTypeSelector={true}
                          showPrice={true}
                          categoryOptions={categoryOptions}
                          typeOptions={itemTypeOptions[index] && itemTypeOptions[index].length ? itemTypeOptions[index] : allTypeOptions}
                          allTypeOptions={allTypeOptions}
                          sealingOptions={allSealingOptions}
                          onTypeOptionsChange={(opts) => {
                            const sanitized = (opts || []).map((opt) => ({ id: opt.id, label: opt.label, price: opt.price }));
                            setItemTypeOptions(prev => {
                              const next = [...prev];
                              next[index] = sanitized;
                              return next;
                            });
                            setFormData(prev => {
                              const nextItems = [...prev.items];
                              const current = nextItems[index];
                              if (!current) {
                                return prev;
                              }
                              const hasCurrentType = current.typeId
                                ? sanitized.some((opt) => opt.id === current.typeId)
                                : false;
                              if (hasCurrentType || (!current.typeId && !current.type)) {
                                return prev;
                              }
                              nextItems[index] = {
                                ...current,
                                typeId: '',
                                type: '',
                                buyPrice: undefined,
                              };
                              return { ...prev, items: nextItems };
                            });

                            if (!sanitized.length) {
                              typePriceFetchSeqRef.current[index] = (typePriceFetchSeqRef.current[index] ?? 0) + 1;
                              return;
                            }

                            const requiresEnrichment = sanitized.some((option) => typeof option.price !== 'number');
                            if (!requiresEnrichment) {
                              typePriceFetchSeqRef.current[index] = (typePriceFetchSeqRef.current[index] ?? 0) + 1;
                              return;
                            }

                            const productNameForPrice = (formData.items[index]?.item || item.item || '').trim();
                            if (!productNameForPrice || productNameForPrice.length < 2) {
                              typePriceFetchSeqRef.current[index] = (typePriceFetchSeqRef.current[index] ?? 0) + 1;
                              return;
                            }
                            const categoryIdForPrice = formData.items[index]?.categoryId || item.categoryId || undefined;
                            const nextSeq = (typePriceFetchSeqRef.current[index] ?? 0) + 1;
                            typePriceFetchSeqRef.current[index] = nextSeq;

                            void enrichTypeOptionsWithPrice(productNameForPrice, categoryIdForPrice, sanitized).then((enriched) => {
                              if (typePriceFetchSeqRef.current[index] !== nextSeq) {
                                return;
                              }

                              const hasPriceAugmentation = enriched.some((option, optionIndex) => {
                                const original = sanitized[optionIndex];
                                return original && option.price !== original.price;
                              });

                              if (hasPriceAugmentation) {
                                setItemTypeOptions(prev => {
                                  const next = [...prev];
                                  next[index] = enriched;
                                  return next;
                                });
                              }

                              setFormData(prev => {
                                const nextItems = [...prev.items];
                                const current = nextItems[index];
                                if (!current || !current.typeId) {
                                  return prev;
                                }
                                const matched = enriched.find((option) => option.id === current.typeId);
                                if (!matched || typeof matched.price !== 'number' || current.buyPrice === matched.price) {
                                  return prev;
                                }
                                nextItems[index] = {
                                  ...current,
                                  buyPrice: matched.price,
                                };
                                return { ...prev, items: nextItems };
                              });
                            }).catch(() => {
                              /* handled upstream */
                            });
                          }}
                          selectedTypeLabel={item.type}
                          selectedBuyPrice={item.buyPrice}
                        />

                        <div style={{ display: 'grid', gridTemplateColumns: formData.items.length > 1 ? '1fr auto' : '1fr', gap: '8px' }}>
                          <input
                            type="number"
                            placeholder="件数"
                            min="1"
                            value={item.count}
                            onChange={(e) => {
                              const newItems = [...formData.items];
                              newItems[index].count = parseInt(e.target.value) || 1;
                              setFormData(prev => ({ ...prev, items: newItems }));
                            }}
                            className="form-input"
                          />

                          {formData.items.length > 1 && (
                            <button
                              onClick={() => removeItem(index)}
                              style={{
                                padding: 'clamp(10px, 2.5vw, 12px)',
                                background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: 'clamp(14px, 3.5vw, 16px)',
                                fontWeight: '600',
                                minWidth: '80px',
                                transition: 'all 0.3s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(220,53,69,0.3)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                              }}
                            >
                              削除
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      // 短縮表示モード: カテゴリ・商品名・件数を一行で表示
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                      }}>
                        <div style={{
                          flex: 1,
                          fontSize: 'clamp(14px, 3.5vw, 16px)',
                          color: '#424242',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {item.category && <span style={{ fontWeight: '600', color: '#1976d2' }}>{item.category}</span>}
                          {item.category && item.item && <span style={{ margin: '0 6px', color: '#9e9e9e' }}>›</span>}
                          {item.item && <span>{item.item}</span>}
                          {(item.type || (item.buyPrice !== undefined && item.buyPrice !== null)) && (
                            <span style={{ marginLeft: '6px', color: '#9e9e9e', fontSize: '0.9rem' }}>（{item.type || 'タイプ未選択'}{item.buyPrice !== undefined && item.buyPrice !== null ? ` — ¥${item.buyPrice!.toLocaleString()}` : ''}）</span>
                          )}
                          {item.count > 1 && <span style={{ marginLeft: '8px', color: '#757575' }}>× {item.count}</span>}
                          {!item.category && !item.item && <span style={{ color: '#9e9e9e', fontStyle: 'italic' }}>未入力</span>}
                        </div>
                        <button
                          onClick={() => setEditingItemIndex(index)}
                          style={{
                            padding: '8px 16px',
                            background: 'linear-gradient(135deg, #90caf9 0%, #64b5f6 100%)',
                            color: '#0d47a1',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: 'clamp(13px, 3vw, 14px)',
                            fontWeight: '600',
                            minWidth: '70px',
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(25,118,210,0.2)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          変更
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              <Button
                onClick={addItem}
                variant="gradient"
                style={{ marginTop: '8px' }}
              >
                + 他にもある場合
              </Button>
            </fieldset>

            <div className="button-group">
              <Button onClick={prevStep} variant="white">← 戻る</Button>
              <Button onClick={nextStep} variant="gradient">次へ進む</Button>
            </div>
          </div>
        )}

        {/* Step 5: 買取方法の選択 */}
        {currentStep === 5 && (
          <div>
            <fieldset className="form-fieldset">
              <legend>買取方法の選択</legend>

              <label className="form-label">
                買取方法を選択してください *
              </label>

              <div style={{
                display: 'grid',
                gap: '16px',
                marginTop: '12px'
              }}>
                {/* 郵送オプション */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: 'clamp(16px, 4vw, 20px)',
                    border: formData.deliveryMethod === 'mail' ? '3px solid #007bff' : '2px solid #e0e0e0',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    background: formData.deliveryMethod === 'mail' ? 'linear-gradient(to bottom, #f0f8ff, #e3f2fd)' : 'white',
                    transition: 'all 0.3s ease',
                    boxShadow: formData.deliveryMethod === 'mail' ? '0 4px 12px rgba(0,123,255,0.15)' : '0 2px 6px rgba(0,0,0,0.05)'
                  }}
                  onMouseEnter={(e) => {
                    if (formData.deliveryMethod !== 'mail') {
                      e.currentTarget.style.borderColor = '#007bff';
                      e.currentTarget.style.background = '#f8f9fa';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (formData.deliveryMethod !== 'mail') {
                      e.currentTarget.style.borderColor = '#e0e0e0';
                      e.currentTarget.style.background = 'white';
                    }
                  }}
                >
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value="mail"
                    checked={formData.deliveryMethod === 'mail'}
                    onChange={(e) => setFormData(prev => ({ ...prev, deliveryMethod: e.target.value as 'mail' | 'visit' }))}
                    style={{
                      marginTop: '4px',
                      transform: 'scale(1.3)',
                      cursor: 'pointer'
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 'clamp(1rem, 3vw, 1.1rem)',
                      fontWeight: '700',
                      color: formData.deliveryMethod === 'mail' ? '#0056b3' : '#333',
                      marginBottom: '8px'
                    }}>
                      📦 郵送する
                    </div>
                    <div style={{
                      fontSize: 'clamp(0.85rem, 2.5vw, 0.9rem)',
                      color: '#555',
                      lineHeight: 1.6
                    }}>
                      後ほどご案内する発送先へ商品をお送りください。<br />
                      到着確認後、銀行3営業日以内に指定の口座へお振込みいたします。
                    </div>
                  </div>
                </label>

                {/* 来店オプション */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: 'clamp(16px, 4vw, 20px)',
                    border: formData.deliveryMethod === 'visit' ? '3px solid #007bff' : '2px solid #e0e0e0',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    background: formData.deliveryMethod === 'visit' ? 'linear-gradient(to bottom, #f0f8ff, #e3f2fd)' : 'white',
                    transition: 'all 0.3s ease',
                    boxShadow: formData.deliveryMethod === 'visit' ? '0 4px 12px rgba(0,123,255,0.15)' : '0 2px 6px rgba(0,0,0,0.05)'
                  }}
                  onMouseEnter={(e) => {
                    if (formData.deliveryMethod !== 'visit') {
                      e.currentTarget.style.borderColor = '#007bff';
                      e.currentTarget.style.background = '#f8f9fa';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (formData.deliveryMethod !== 'visit') {
                      e.currentTarget.style.borderColor = '#e0e0e0';
                      e.currentTarget.style.background = 'white';
                    }
                  }}
                >
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value="visit"
                    checked={formData.deliveryMethod === 'visit'}
                    onChange={(e) => setFormData(prev => ({ ...prev, deliveryMethod: e.target.value as 'mail' | 'visit' }))}
                    style={{
                      marginTop: '4px',
                      transform: 'scale(1.3)',
                      cursor: 'pointer'
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 'clamp(1rem, 3vw, 1.1rem)',
                      fontWeight: '700',
                      color: formData.deliveryMethod === 'visit' ? '#0056b3' : '#333',
                      marginBottom: '8px'
                    }}>
                      🏪 来店する
                    </div>
                    <div style={{
                      fontSize: 'clamp(0.85rem, 2.5vw, 0.9rem)',
                      color: '#555',
                      lineHeight: 1.6
                    }}>
                      ご来店いただき、検品完了後、銀行営業日3日以内に振込いたします。<br />
                      下記で来店希望日時を選択してください。
                    </div>
                  </div>
                </label>
              </div>

              {/* 来店選択時のみ日時入力を表示 */}
              {formData.deliveryMethod === 'visit' && (
                <div style={{ marginTop: '24px' }}>
                  <BookingSlotSelector
                    onSelect={(dateTime) => setFormData(prev => ({ ...prev, preferredDateTime: dateTime }))}
                    selectedDateTime={formData.preferredDateTime}
                    customerName={formData.name}
                    customerContact={formData.lineName}
                  />
                </div>
              )}
            </fieldset>

            <div className="button-group">
              <Button onClick={prevStep} variant="white">← 戻る</Button>
              <Button
                onClick={nextStep}
                variant="gradient"
                disabled={!formData.deliveryMethod || (formData.deliveryMethod === 'visit' && !formData.preferredDateTime)}
              >
                確認へ進む
              </Button>
            </div>
          </div>
        )}

        {/* Step 6: 同意確認 */}
        {currentStep === 6 && (
          <div>
            {submitError && (
              <div style={{
                padding: '16px',
                marginBottom: '20px',
                background: 'linear-gradient(135deg, #fff5f5 0%, #ffe0e0 100%)',
                border: '2px solid #dc3545',
                borderRadius: '12px',
                color: '#dc3545',
                fontSize: 'clamp(0.9rem, 2.5vw, 1rem)',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 2px 8px rgba(220,53,69,0.15)'
              }}>
                <span style={{ fontSize: '1.5rem' }}>⚠️</span>
                <span>エラー: {submitError}</span>
              </div>
            )}

            <fieldset className="form-fieldset">
              <legend>利用規約と個人情報の取り扱い</legend>
              {consentText ? (
                consentText.split('\n\n').map((paragraph, idx) => (
                  <p
                    key={idx}
                    style={{ fontSize: 'clamp(0.9rem, 2.5vw, 0.95rem)', lineHeight: 1.7, color: '#333', marginBottom: '14px' }}
                  >
                    {paragraph}
                  </p>
                ))
              ) : (
                <>
                  <p style={{ fontSize: 'clamp(0.9rem, 2.5vw, 0.95rem)', lineHeight: 1.7, color: '#333', marginBottom: '14px' }}>
                    {consentText}
                  </p>
                </>
              )}
              <p style={{ fontSize: 'clamp(0.9rem, 2.5vw, 0.95rem)', lineHeight: 1.7, color: '#333', marginBottom: '20px', fontWeight: 600 }}>
                内容をご確認のうえ、同意いただける場合は以下のチェックボックスにチェックを入れてください。
              </p>

              <label style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                fontSize: 'clamp(0.9rem, 2.5vw, 0.95rem)',
                color: '#333',
                padding: 'clamp(12px, 3vw, 16px)',
                background: '#f0f8ff',
                borderRadius: '8px',
                border: '2px solid #e3f2fd',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                marginBottom: '20px'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#007bff';
                  e.currentTarget.style.background = '#e3f2fd';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e3f2fd';
                  e.currentTarget.style.background = '#f0f8ff';
                }}>
                <input
                  type="checkbox"
                  checked={formData.consent}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setFormData(prev => ({ ...prev, consent: checked }));
                    // チェックが入ったらサインポップアップを表示
                    if (checked) {
                      setShowSignaturePopup(true);
                    }
                  }}
                  style={{ marginTop: '4px', transform: 'scale(1.3)', cursor: 'pointer' }}
                />
                <span style={{ lineHeight: 1.6 }}>
                  上記内容に同意し、提供した情報および本人確認書類の保管に承諾します。
                </span>
              </label>

              {/* サイン状態の表示 */}
              {formData.signature && (
                <div style={{
                  padding: '16px',
                  background: 'linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%)',
                  border: '2px solid #28a745',
                  borderRadius: '8px',
                  marginBottom: '20px'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.5rem' }}>✓</span>
                      <span style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1rem)', fontWeight: '600', color: '#155724' }}>
                        サインが完了しました
                      </span>
                    </div>
                    <button
                      onClick={() => setShowSignaturePopup(true)}
                      style={{
                        padding: '8px 16px',
                        background: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#0056b3';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#007bff';
                      }}
                    >
                      サインを書き直す
                    </button>
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <img
                      src={formData.signature}
                      alt="サイン"
                      style={{
                        maxWidth: '300px',
                        maxHeight: '100px',
                        border: '1px solid #28a745',
                        borderRadius: '4px',
                        background: 'white'
                      }}
                    />
                  </div>
                </div>
              )}
            </fieldset>

            <div className="button-group">
              <Button onClick={prevStep} variant="white">← 戻る</Button>
              <Button
                onClick={handleSubmit}
                disabled={!formData.consent || !formData.signature || isSubmitting}
                variant="success"
              >
                {isSubmitting ? '送信中...' : '✓ 送信する'}
              </Button>
            </div>

            {/* 送信ステータス表示 */}
            {submissionStatus && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                backdropFilter: 'blur(4px)'
              }}>
                <div style={{
                  padding: '40px',
                  background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
                  border: '3px solid #007bff',
                  borderRadius: '20px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '20px',
                  minWidth: '320px',
                  maxWidth: '90%',
                  boxShadow: '0 8px 32px rgba(0, 123, 255, 0.3)'
                }}>
                  <div className="spinner" style={{
                    width: '60px',
                    height: '60px',
                    border: '6px solid #bbdefb',
                    borderTop: '6px solid #007bff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  <span style={{
                    fontSize: 'clamp(1.2rem, 3vw, 1.5rem)',
                    color: '#0056b3',
                    fontWeight: '700',
                    lineHeight: 1.4
                  }}>{submissionStatus}</span>
                  <p style={{
                    fontSize: 'clamp(0.9rem, 2vw, 1rem)',
                    color: '#555',
                    margin: 0
                  }}>しばらくお待ちください...</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 7: 完了 */}
        {currentStep === 7 && (
          <div>
            <div className="no-print" style={{ textAlign: 'center', padding: '16px', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '16px', color: '#28a745' }}>✓ 送信完了</h2>
              <p style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#333', margin: '16px 0' }}>
                買取受付が完了しました
              </p>
              {receptionNumber && (
                <div style={{
                  margin: '24px auto',
                  padding: '20px',
                  maxWidth: '500px',
                  background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
                  border: '3px solid #007bff',
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0,123,255,0.2)'
                }}>
                  <p style={{
                    fontSize: 'clamp(0.9rem, 2.5vw, 1rem)',
                    color: '#0056b3',
                    marginBottom: '8px',
                    fontWeight: '600'
                  }}>
                    受付番号
                  </p>
                  <p style={{
                    fontSize: 'clamp(1.8rem, 5vw, 2.5rem)',
                    fontWeight: '700',
                    color: '#007bff',
                    letterSpacing: '2px',
                    margin: 0
                  }}>
                    {receptionNumber}
                  </p>
                  <p style={{
                    fontSize: 'clamp(0.8rem, 2vw, 0.85rem)',
                    color: '#555',
                    marginTop: '12px',
                    lineHeight: 1.5
                  }}>
                    こちらの番号を控えておいてください
                  </p>
                </div>
              )}
              <p style={{ color: '#666' }}>ご来店をお待ちしております。</p>
            </div>

            {/* 依頼書兼同意書 - 画面には表示せず印刷/PDF生成時のみ使用 */}
            <div
              id="buyback-agreement"
              style={{
                display: 'none', // 通常は非表示
                backgroundColor: 'white',
                border: '2px solid #333',
                padding: '40px',
                maxWidth: '800px',
                margin: '0 auto 24px',
                fontFamily: 'serif',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }}
            >
              <h3 style={{
                textAlign: 'center',
                fontSize: '1.5rem',
                marginBottom: '24px',
                borderBottom: '3px double #333',
                paddingBottom: '12px'
              }}>
                買取依頼書兼同意書
              </h3>

              <div style={{
                marginBottom: '12px',
                marginTop: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <p style={{ fontSize: '0.8rem', color: '#666', margin: 0 }}>
                  受付日: {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                {receptionNumber && (
                  <p style={{
                    fontSize: '0.9rem',
                    color: '#0056b3',
                    margin: 0,
                    fontWeight: '600',
                    padding: '4px 12px',
                    background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
                    borderRadius: '6px',
                    border: '1px solid #007bff'
                  }}>
                    受付番号: {receptionNumber}
                  </p>
                )}
              </div>

              <section style={{ marginBottom: '24px' }}>
                <h4 style={{
                  fontSize: '1.1rem',
                  marginBottom: '12px',
                  paddingBottom: '4px',
                  borderBottom: '1px solid #666'
                }}>
                  お客様情報
                </h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: '8px', fontWeight: 'bold', width: '18%', backgroundColor: '#f5f5f5' }}>お名前</td>
                      <td style={{ padding: '8px', wordBreak: 'break-word', overflowWrap: 'break-word', width: '32%' }}>{formData.name}</td>
                      <td style={{ padding: '8px', fontWeight: 'bold', width: '18%', backgroundColor: '#f5f5f5' }}>LINE登録名</td>
                      <td style={{ padding: '8px', wordBreak: 'break-word', overflowWrap: 'break-word', width: '32%' }}>{formData.lineName}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: '8px', fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>ご住所</td>
                      <td colSpan={3} style={{ padding: '8px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{formData.address}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: '8px', fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>生年月日</td>
                      <td colSpan={3} style={{ padding: '8px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                        {formData.birthdate ? new Date(formData.birthdate).toLocaleDateString('ja-JP', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        }) : ''}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section style={{ marginBottom: '24px' }}>
                <h4 style={{
                  fontSize: '1.1rem',
                  marginBottom: '12px',
                  paddingBottom: '4px',
                  borderBottom: '1px solid #666'
                }}>
                  振込先情報
                </h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: '8px', fontWeight: 'bold', width: '18%', backgroundColor: '#f5f5f5', verticalAlign: 'top' }}>
                        <div>金融機関名</div>
                        <div style={{ marginTop: '8px', borderTop: '1px solid #ddd', paddingTop: '8px' }}>支店名</div>
                      </td>
                      <td style={{ padding: '8px', width: '32%', verticalAlign: 'top' }}>
                        <div>{formData.bankName}</div>
                        <div style={{ marginTop: '8px', borderTop: '1px solid #ddd', paddingTop: '8px' }}>{formData.branchName}</div>
                      </td>
                      <td style={{ padding: '8px', fontWeight: 'bold', width: '18%', backgroundColor: '#f5f5f5', verticalAlign: 'top' }}>
                        <div>口座番号</div>
                        {formData.accountNameKana && (
                          <div style={{ marginTop: '8px', borderTop: '1px solid #ddd', paddingTop: '8px' }}>口座名義（カナ）</div>
                        )}
                      </td>
                      <td style={{ padding: '8px', width: '32%', verticalAlign: 'top' }}>
                        <div>{formData.accountNumber}</div>
                        {formData.accountNameKana && (
                          <div style={{ marginTop: '8px', borderTop: '1px solid #ddd', paddingTop: '8px' }}>{formData.accountNameKana}</div>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section style={{ marginBottom: '24px' }}>
                <h4 style={{
                  fontSize: '1.1rem',
                  marginBottom: '12px',
                  paddingBottom: '4px',
                  borderBottom: '1px solid #666'
                }}>
                  買取希望品目
                </h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #333' }}>
                      <th style={{ padding: '8px', textAlign: 'left' }}>カテゴリ</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>商品名</th>
                      <th style={{ padding: '8px', textAlign: 'center', width: '15%' }}>数量</th>
                      <th style={{ padding: '8px', textAlign: 'right', width: '15%' }}>買取価格（円）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.items.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #ddd' }}>
                        <td style={{ padding: '8px' }}>{item.category || '-'}</td>
                        <td style={{ padding: '8px' }}>{item.item || '-'}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{item.count}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {item.buyPrice !== null && item.buyPrice !== undefined
                            ? `¥${item.buyPrice.toLocaleString('ja-JP')}`
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid #333', backgroundColor: '#f9f9f9', fontWeight: 'bold' }}>
                      <td colSpan={3} style={{ padding: '12px', textAlign: 'right', fontSize: '1rem' }}>
                        合計金額（参考）
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontSize: '1.1rem', color: '#007bff' }}>
                        ¥{formData.items
                          .reduce((sum, item) => {
                            const price = item.buyPrice !== null && item.buyPrice !== undefined ? item.buyPrice : 0;
                            return sum + (price * item.count);
                          }, 0)
                          .toLocaleString('ja-JP')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </section>

              {formData.deliveryMethod === 'visit' && formData.preferredDateTime && (
                <section style={{ marginBottom: '24px' }}>
                  <h4 style={{
                    fontSize: '1.1rem',
                    marginBottom: '12px',
                    paddingBottom: '4px',
                    borderBottom: '1px solid #666'
                  }}>
                    来店予定日時
                  </h4>
                  <p style={{ fontSize: '1rem', padding: '12px', backgroundColor: '#f9f9f9', border: '1px solid #ddd', borderRadius: '4px', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                    {new Date(formData.preferredDateTime).toLocaleString('ja-JP', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      weekday: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </section>
              )}

              <section style={{ marginBottom: '32px', padding: '16px', backgroundColor: '#f9f9f9', border: '1px solid #ddd', borderRadius: '4px' }}>
                <h4 style={{ fontSize: '1rem', marginBottom: '12px', fontWeight: 'bold' }}>
                  同意事項
                </h4>
                <div style={{ fontSize: '0.5rem', lineHeight: 1.6, color: '#333' }}>
                  {consentText ? (
                    consentText.split('\n\n').map((paragraph, idx) => (
                      <p key={idx} style={{ marginBottom: '6px' }}>
                        {paragraph}
                      </p>
                    ))
                  ) : (
                    <p>
                      {consentText}
                    </p>
                  )}
                </div>
              </section>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '40px',
                paddingTop: '20px',
                borderTop: '1px solid #333',
                gap: '20px',
                flexWrap: 'wrap'
              }}>
                <div style={{ textAlign: 'center', flex: 1, minWidth: '200px' }}>
                  <p style={{ marginBottom: '8px', fontSize: '0.9rem', color: '#666' }}>お客様署名</p>
                  {formData.signature ? (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      minHeight: '60px',
                      padding: '8px',
                      border: '1px solid #333',
                      borderRadius: '4px',
                      background: 'white'
                    }}>
                      <img
                        src={formData.signature}
                        alt="お客様署名"
                        style={{
                          maxWidth: '100%',
                          maxHeight: '50px',
                          objectFit: 'contain'
                        }}
                      />
                    </div>
                  ) : (
                    <div style={{
                      width: '200px',
                      borderBottom: '1px solid #333',
                      height: '40px'
                    }}></div>
                  )}
                </div>
                <div style={{ textAlign: 'center', flex: 1, minWidth: '200px' }}>
                  <p style={{ marginBottom: '8px', fontSize: '0.9rem', color: '#666' }}>受付担当者</p>
                  <div style={{
                    width: '200px',
                    borderBottom: '1px solid #333',
                    height: '40px'
                  }}></div>
                </div>
              </div>

              <p style={{
                marginTop: '24px',
                fontSize: '0.85rem',
                color: '#999',
                textAlign: 'center'
              }}>
                この書類は電子記録として保管されます
              </p>
            </div>

            {/* アクションボタン */}
            <div
              className="no-print"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
                marginTop: '32px',
                maxWidth: '800px',
                margin: '32px auto 0'
              }}
            >
              <Button
                onClick={handlePrint}
                variant="success"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <span>🖨️</span>
                <span>この書類を印刷</span>
              </Button>

              <Button
                onClick={generatePDF}
                variant="gradient"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <span>📄</span>
                <span>PDFで保存</span>
              </Button>

              <Button
                onClick={() => {
                  setCurrentStep(1);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                variant="white"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>🏠</span>
                <span>申込フォームのトップへ戻る</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* サインポップアップ */}
      {showSignaturePopup && (
        <SignatureCanvas
          onComplete={(dataUrl) => {
            setFormData(prev => ({ ...prev, signature: dataUrl }));
            setShowSignaturePopup(false);
          }}
          onClose={() => {
            setShowSignaturePopup(false);
            // サインがまだ入力されていない場合は同意チェックも外す
            if (!formData.signature) {
              setFormData(prev => ({ ...prev, consent: false }));
            }
          }}
        />
      )}
    </>
  );
}
