'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { DEFAULT_CONSENT_TEXT } from '@/lib/consentDefaults';
import { loadBankData, searchBanks, searchBranches, BankData } from '@/lib/bankDataLoader';

type ItemEntry = {
  category: string;
  item: string;
  subcategory: string;
  count: number;
};

type FormState = {
  name: string;
  address: string;
  birthdate: string;
  lineName: string;
  idFront: File | null;
  idBack: File | null;
  bankName: string;
  bankCode: string;
  branchName: string;
  branchCode: string;
  accountNumber: string;
  accountNameKana: string;
  preferredDateTime: string;
  items: ItemEntry[];
  consent: boolean;
};

export default function BuybackIntakePage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [consentText, setConsentText] = useState('');
  const [bankData, setBankData] = useState<BankData[]>([]);
  const [bankSuggestions, setBankSuggestions] = useState<BankData[]>([]);
  const [branchSuggestions, setBranchSuggestions] = useState<BankData[]>([]);
  const [showBankSuggestions, setShowBankSuggestions] = useState(false);
  const [showBranchSuggestions, setShowBranchSuggestions] = useState(false);
  const [formData, setFormData] = useState<FormState>({
    name: '',
    address: '',
    birthdate: '',
    lineName: '',
    idFront: null,
    idBack: null,
    bankName: '',
    bankCode: '',
    branchName: '',
    branchCode: '',
    accountNumber: '',
    accountNameKana: '',
    preferredDateTime: '',
    items: [{ category: '', item: '', subcategory: '', count: 1 }],
    consent: false,
  });

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
        setConsentText(DEFAULT_CONSENT_TEXT);
      }
    };
    loadConsentText();

    // 生年月日の初期値を30年前に設定
    const today = new Date();
    const thirtyYearsAgo = new Date(today.getFullYear() - 30, today.getMonth(), today.getDate());
    const formattedDate = thirtyYearsAgo.toISOString().split('T')[0];
    
    // 来店希望日時の初期値を設定
    const now = new Date();
    const currentHour = now.getHours();
    let targetDate;
    
    if (currentHour < 19) {
      targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0);
    } else {
      targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 15, 0);
    }
    
    const formattedDateTime = targetDate.toISOString().slice(0, 16);
    
    setFormData(prev => ({
      ...prev,
      birthdate: formattedDate,
      preferredDateTime: formattedDateTime,
    }));
  }, []);

  const nextStep = () => {
    setCurrentStep(prev => Math.min(prev + 1, 6));
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { category: '', item: '', subcategory: '', count: 1 }],
    }));
  };

  const removeItem = (index: number) => {
    if (formData.items.length > 1) {
      setFormData(prev => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index),
      }));
    }
  };

  const handleSubmit = async () => {
    if (!formData.consent) {
      return;
    }

    try {
      // ファイルデータは送信しない（実装する場合はFirebase Storageなどを使用）
      const submissionData = {
        name: formData.name,
        address: formData.address,
        birthdate: formData.birthdate,
        lineName: formData.lineName,
        idFrontName: formData.idFront?.name || '',
        idBackName: formData.idBack?.name || '',
        bankName: formData.bankName,
        bankCode: formData.bankCode,
        branchName: formData.branchName,
        branchCode: formData.branchCode,
        accountNumber: formData.accountNumber,
        accountNameKana: formData.accountNameKana,
        preferredDateTime: formData.preferredDateTime,
        items: formData.items,
        consent: formData.consent,
      };

      // Firestoreに保存
      const response = await fetch('/api/buyback-submission', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submissionData),
      });

      if (!response.ok) {
        throw new Error('Failed to submit');
      }

      const result = await response.json();
      console.log('Submission successful:', result);

      // Google Sheetsへの書き込みも試行（エラーが発生しても続行）
      try {
        const sheetsConfigResponse = await fetch('/api/sheets-config');
        if (sheetsConfigResponse.ok) {
          const { config } = await sheetsConfigResponse.json();
          
          if (config && config.spreadsheetId) {
            const sheetsData = {
              ...submissionData,
              createdAt: new Date().toISOString(),
              status: 'pending',
            };

            await fetch('/api/sheets-write', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                data: sheetsData,
                config: config,
              }),
            });
            console.log('Google Sheets write attempted');
          }
        }
      } catch (sheetsError) {
        console.warn('Google Sheets write failed:', sheetsError);
        // Google Sheetsへの書き込みが失敗してもエラーにはしない
      }

      setCurrentStep(6);
    } catch (error) {
      console.error('Submission error:', error);
      alert('送信に失敗しました。もう一度お試しください。');
    }
  };

  const canAdvanceFromStep1 =
    formData.name.trim() !== '' &&
    formData.address.trim() !== '' &&
    formData.birthdate.trim() !== '' &&
    formData.lineName.trim() !== '' &&
    formData.idFront !== null &&
    formData.idBack !== null;

  return (
    <>
      {/* 印刷用スタイル */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #buyback-agreement,
          #buyback-agreement * {
            visibility: visible;
          }
          #buyback-agreement {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            box-shadow: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '20px 16px' }}>
      <div className="no-print" style={{ marginBottom: '20px', display: 'flex', gap: 12, alignItems: 'center' }}>
        <Link href="/" style={{ color: '#007bff', textDecoration: 'underline' }}>
          ← トップページに戻る
        </Link>
        <span style={{ color: '#9ca3af' }}>|</span>
        <Link href="/userclient/reservations" style={{ color: '#007bff', textDecoration: 'underline' }}>
          予約一覧へ
        </Link>
      </div>

      <h1 className="no-print" style={{ fontSize: '1.5rem', marginBottom: '16px' }}>買取受付</h1>

      {/* Progress indicator */}
      <div className="no-print" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        marginBottom: '20px',
        padding: '10px',
        background: '#f8f9fa',
        borderRadius: '6px',
        fontSize: '0.85rem'
      }}>
        {['個人情報', '口座情報', '買取希望項目', '来店希望日時', '本人確認と同意', '完了'].map((label, idx) => (
          <div
            key={idx}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '8px 4px',
              borderRadius: '4px',
              margin: '0 2px',
              background: currentStep === idx + 1 ? '#007bff' : currentStep > idx + 1 ? '#28a745' : 'transparent',
              color: currentStep >= idx + 1 ? 'white' : '#666',
            }}
          >
            {idx + 1}. {label}
          </div>
        ))}
      </div>

      {/* Step 1: 個人情報 */}
      {currentStep === 1 && (
        <div>
          <fieldset style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
            <legend style={{ fontWeight: '600' }}>個人情報</legend>
            
            <label style={{ display: 'block', margin: '10px 0 4px', fontWeight: '600', fontSize: '0.95rem' }}>
              お名前 *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              style={{ 
                width: '100%', 
                padding: '12px', 
                borderRadius: '8px', 
                border: '1px solid #bbb',
                fontSize: '16px'
              }}
              required
            />

            <label style={{ display: 'block', margin: '10px 0 4px', fontWeight: '600', fontSize: '0.95rem' }}>
              身分証に記載の住所 *
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
              style={{ 
                width: '100%', 
                padding: '12px', 
                borderRadius: '8px', 
                border: '1px solid #bbb',
                fontSize: '16px'
              }}
              required
            />

            <label style={{ display: 'block', margin: '10px 0 4px', fontWeight: '600', fontSize: '0.95rem' }}>
              生年月日 *
            </label>
            <input
              type="date"
              value={formData.birthdate}
              onChange={(e) => setFormData(prev => ({ ...prev, birthdate: e.target.value }))}
              style={{ 
                width: '100%', 
                padding: '12px', 
                borderRadius: '8px', 
                border: '1px solid #bbb',
                fontSize: '16px'
              }}
              required
            />
            <label style={{ display: 'block', margin: '10px 0 4px', fontWeight: '600', fontSize: '0.95rem' }}>
              ラインの登録名 *
            </label>
            <input
              type="text"
              value={formData.lineName}
              onChange={(e) => setFormData(prev => ({ ...prev, lineName: e.target.value }))}
              style={{ 
                width: '100%', 
                padding: '12px', 
                borderRadius: '8px', 
                border: '1px solid #bbb',
                fontSize: '16px'
              }}
              required
            />
          </fieldset>

          <fieldset style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
            <legend style={{ fontWeight: '600' }}>本人確認書類のアップロード</legend>
            <p style={{ fontSize: '0.9rem', color: '#555', marginBottom: '12px' }}>
              運転免許証など顔写真付きの身分証の表面・裏面をそれぞれアップロードしてください。文字が鮮明に読み取れる写真をご用意ください。
            </p>

            <label style={{ display: 'block', margin: '10px 0 4px', fontWeight: '600', fontSize: '0.95rem' }}>
              表面の写真 *
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setFormData(prev => ({ ...prev, idFront: file }));
              }}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #bbb',
                fontSize: '16px'
              }}
              required
            />
            {formData.idFront ? (
              <div style={{ marginTop: '6px', fontSize: '0.85rem', color: '#007bff' }}>
                選択済み: {formData.idFront.name}
              </div>
            ) : null}

            <label style={{ display: 'block', margin: '16px 0 4px', fontWeight: '600', fontSize: '0.95rem' }}>
              裏面の写真 *
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setFormData(prev => ({ ...prev, idBack: file }));
              }}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #bbb',
                fontSize: '16px'
              }}
              required
            />
            {formData.idBack ? (
              <div style={{ marginTop: '6px', fontSize: '0.85rem', color: '#007bff' }}>
                選択済み: {formData.idBack.name}
              </div>
            ) : null}
          </fieldset>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
            <div></div>
            <button
              onClick={() => {
                if (canAdvanceFromStep1) {
                  nextStep();
                }
              }}
              disabled={!canAdvanceFromStep1}
              style={{
                padding: '12px 16px',
                minHeight: '44px',
                background: canAdvanceFromStep1 ? '#007bff' : '#9fbce3',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: canAdvanceFromStep1 ? 'pointer' : 'not-allowed',
                fontSize: '16px'
              }}
            >
              次へ
            </button>
          </div>
        </div>
      )}

      {/* Step 2: 口座情報 */}
      {currentStep === 2 && (
        <div>
          <fieldset style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
            <legend style={{ fontWeight: '600' }}>銀行口座情報</legend>
            
            <label style={{ display: 'block', margin: '10px 0 4px', fontWeight: '600', fontSize: '0.95rem' }}>
              金融機関名 *
            </label>
            {formData.bankCode === 'OTHER' && (
              <div style={{
                padding: '8px 12px',
                backgroundColor: '#fff8e1',
                border: '1px solid #ffc107',
                borderRadius: '4px',
                marginBottom: '8px',
                fontSize: '0.9rem',
                color: '#856404'
              }}>
                📝 その他の銀行として登録されます。銀行名と支店名を自由に入力してください。
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={formData.bankName}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData(prev => ({ ...prev, bankName: value, bankCode: '' }));
                  
                  if (value.length > 0) {
                    const suggestions = searchBanks(value, bankData);
                    setBankSuggestions(suggestions);
                    // サジェストがある場合、または入力がある場合は「その他」も表示
                    setShowBankSuggestions(true);
                  } else {
                    setBankSuggestions([]);
                    setShowBankSuggestions(false);
                  }
                }}
                onBlur={() => {
                  // サジェスト選択のために少し遅延
                  setTimeout(() => setShowBankSuggestions(false), 200);
                }}
                onFocus={() => {
                  if (formData.bankName) {
                    const suggestions = searchBanks(formData.bankName, bankData);
                    setBankSuggestions(suggestions);
                    setShowBankSuggestions(true);
                  }
                }}
                style={{ 
                  width: '100%', 
                  padding: '12px', 
                  borderRadius: '8px', 
                  border: '1px solid #bbb',
                  fontSize: '16px',
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
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  marginTop: '4px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  listStyle: 'none',
                  padding: 0,
                  zIndex: 1000,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                  {bankSuggestions.length > 0 ? (
                    <>
                      {bankSuggestions.map((bank, idx) => (
                        <li
                          key={idx}
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
                            padding: '10px 12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid #eee',
                            fontSize: '15px'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#f0f0f0';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'white';
                          }}
                        >
                          {bank.bankName} <span style={{ fontSize: '0.85em', color: '#666' }}>({bank.bankNameKana})</span>
                        </li>
                      ))}
                    </>
                  ) : null}
                  {/* その他の銀行オプション - 常に表示 */}
                  <li
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
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      fontSize: '15px',
                      backgroundColor: '#f9f9f9',
                      borderTop: bankSuggestions.length > 0 ? '2px solid #ddd' : 'none',
                      fontWeight: '500'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#e8f4fd';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#f9f9f9';
                    }}
                  >
                    📝 その他の銀行（手入力）
                  </li>
                </ul>
              )}
            </div>

            <label style={{ display: 'block', margin: '10px 0 4px', fontWeight: '600', fontSize: '0.95rem' }}>
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
                  
                  if (value.length > 0 && formData.bankCode) {
                    const suggestions = searchBranches(formData.bankCode, value, bankData);
                    setBranchSuggestions(suggestions);
                    setShowBranchSuggestions(suggestions.length > 0);
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
                style={{ 
                  width: '100%', 
                  padding: '12px', 
                  borderRadius: '8px', 
                  border: '1px solid #bbb',
                  fontSize: '16px',
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
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  marginTop: '4px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  listStyle: 'none',
                  padding: 0,
                  zIndex: 1000,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                  {branchSuggestions.map((branch, idx) => (
                    <li
                      key={idx}
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
                        padding: '10px 12px',
                        cursor: 'pointer',
                        borderBottom: idx < branchSuggestions.length - 1 ? '1px solid #eee' : 'none',
                        fontSize: '15px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f0f0f0';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'white';
                      }}
                    >
                      {branch.branchName} <span style={{ fontSize: '0.85em', color: '#666' }}>({branch.branchNameKana})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <label style={{ display: 'block', margin: '10px 0 4px', fontWeight: '600', fontSize: '0.95rem' }}>
              口座番号 *
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={formData.accountNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, accountNumber: e.target.value.replace(/\D/g, '') }))}
              style={{ 
                width: '100%', 
                padding: '12px', 
                borderRadius: '8px', 
                border: '1px solid #bbb',
                fontSize: '16px'
              }}
              required
            />

            <label style={{ display: 'block', margin: '10px 0 4px', fontWeight: '600', fontSize: '0.95rem' }}>
              振込名カナ
            </label>
            <input
              type="text"
              value={formData.accountNameKana}
              onChange={(e) => setFormData(prev => ({ ...prev, accountNameKana: e.target.value }))}
              style={{ 
                width: '100%', 
                padding: '12px', 
                borderRadius: '8px', 
                border: '1px solid #bbb',
                fontSize: '16px'
              }}
            />
          </fieldset>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', gap: '12px' }}>
            <button
              onClick={prevStep}
              style={{
                padding: '12px 16px',
                minHeight: '44px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                flex: 1
              }}
            >
              戻る
            </button>
            <button
              onClick={nextStep}
              style={{
                padding: '12px 16px',
                minHeight: '44px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                flex: 1
              }}
            >
              次へ
            </button>
          </div>
        </div>
      )}

      {/* Step 3: 買取希望項目 */}
      {currentStep === 3 && (
        <div>
          <fieldset style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
            <legend style={{ fontWeight: '600' }}>買取希望項目</legend>
            
            {formData.items.map((item, index) => (
              <div key={index} style={{ marginBottom: '16px', padding: '12px', background: '#f8f9fa', borderRadius: '6px' }}>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="カテゴリ"
                    value={item.category}
                    onChange={(e) => {
                      const newItems = [...formData.items];
                      newItems[index].category = e.target.value;
                      setFormData(prev => ({ ...prev, items: newItems }));
                    }}
                    style={{ 
                      width: '100%', 
                      padding: '12px', 
                      borderRadius: '8px', 
                      border: '1px solid #bbb',
                      fontSize: '16px'
                    }}
                  />
                  
                  <input
                    type="text"
                    placeholder="商品名"
                    value={item.item}
                    onChange={(e) => {
                      const newItems = [...formData.items];
                      newItems[index].item = e.target.value;
                      setFormData(prev => ({ ...prev, items: newItems }));
                    }}
                    style={{ 
                      width: '100%', 
                      padding: '12px', 
                      borderRadius: '8px', 
                      border: '1px solid #bbb',
                      fontSize: '16px'
                    }}
                  />
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
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
                      style={{ 
                        flex: 1,
                        padding: '12px', 
                        borderRadius: '8px', 
                        border: '1px solid #bbb',
                        fontSize: '16px'
                      }}
                    />
                    
                    {formData.items.length > 1 && (
                      <button
                        onClick={() => removeItem(index)}
                        style={{
                          padding: '12px',
                          background: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '16px'
                        }}
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            <button
              onClick={addItem}
              style={{
                width: '100%',
                padding: '12px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                marginTop: '8px'
              }}
            >
              他にもある場合
            </button>
          </fieldset>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', gap: '12px' }}>
            <button
              onClick={prevStep}
              style={{
                padding: '12px 16px',
                minHeight: '44px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                flex: 1
              }}
            >
              戻る
            </button>
            <button
              onClick={nextStep}
              style={{
                padding: '12px 16px',
                minHeight: '44px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                flex: 1
              }}
            >
              次へ
            </button>
          </div>
        </div>
      )}

      {/* Step 4: 来店希望日時 */}
      {currentStep === 4 && (
        <div>
          <fieldset style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
            <legend style={{ fontWeight: '600' }}>来店希望日時</legend>
            
            <label style={{ display: 'block', margin: '10px 0 4px', fontWeight: '600', fontSize: '0.95rem' }}>
              来店希望日時 *
            </label>
            <input
              type="datetime-local"
              value={formData.preferredDateTime}
              onChange={(e) => setFormData(prev => ({ ...prev, preferredDateTime: e.target.value }))}
              style={{ 
                width: '100%', 
                padding: '12px', 
                borderRadius: '8px', 
                border: '1px solid #bbb',
                fontSize: '16px'
              }}
              required
            />
          </fieldset>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', gap: '12px' }}>
            <button
              onClick={prevStep}
              style={{
                padding: '12px 16px',
                minHeight: '44px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                flex: 1
              }}
            >
              戻る
            </button>
            <button
              onClick={nextStep}
              style={{
                padding: '12px 16px',
                minHeight: '44px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                flex: 1
              }}
            >
              確認へ進む
            </button>
          </div>
        </div>
      )}

      {/* Step 5: 同意確認 */}
      {currentStep === 5 && (
        <div>
          <fieldset style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
            <legend style={{ fontWeight: '600' }}>利用規約と個人情報の取り扱い</legend>
            {consentText ? (
              consentText.split('\n\n').map((paragraph, idx) => (
                <p
                  key={idx}
                  style={{ fontSize: '0.95rem', lineHeight: 1.6, color: '#333', marginBottom: '12px' }}
                >
                  {paragraph}
                </p>
              ))
            ) : (
              <>
                <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: '#333', marginBottom: '12px' }}>
                  買取にあたり、身分証のコピーと申込内容を本人確認および取引記録の保存目的でお預かりします。法令に基づき適切に保管し、第三者提供は行いません。
                </p>
              </>
            )}
            <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: '#333', marginBottom: '16px' }}>
              内容をご確認のうえ、同意いただける場合は以下のチェックボックスにチェックを入れてください。
            </p>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.95rem', color: '#333' }}>
              <input
                type="checkbox"
                checked={formData.consent}
                onChange={(e) => setFormData(prev => ({ ...prev, consent: e.target.checked }))}
                style={{ marginTop: '4px', transform: 'scale(1.1)' }}
              />
              <span>
                上記内容に同意し、提供した情報および本人確認書類の保管に承諾します。
              </span>
            </label>
          </fieldset>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', gap: '12px' }}>
            <button
              onClick={prevStep}
              style={{
                padding: '12px 16px',
                minHeight: '44px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                flex: 1
              }}
            >
              戻る
            </button>
            <button
              onClick={handleSubmit}
              disabled={!formData.consent}
              style={{
                padding: '12px 16px',
                minHeight: '44px',
                background: formData.consent ? '#28a745' : '#98c9a5',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: formData.consent ? 'pointer' : 'not-allowed',
                fontSize: '16px',
                flex: 1
              }}
            >
              送信する
            </button>
          </div>
        </div>
      )}

      {/* Step 6: 完了 */}
      {currentStep === 6 && (
        <div>
          <div className="no-print" style={{ textAlign: 'center', padding: '20px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '16px', color: '#28a745' }}>✓ 送信完了</h2>
            <p style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#333', margin: '16px 0' }}>
              買取受付が完了しました
            </p>
            <p style={{ color: '#666' }}>ご来店をお待ちしております。</p>
          </div>

          {/* 依頼書兼同意書 */}
          <div 
            id="buyback-agreement"
            style={{
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

            <div style={{ marginBottom: '24px', fontSize: '0.95rem', lineHeight: 1.8 }}>
              <p style={{ marginBottom: '8px' }}>受付日: {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
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
                    <td style={{ padding: '8px', fontWeight: 'bold', width: '30%', backgroundColor: '#f5f5f5' }}>お名前</td>
                    <td style={{ padding: '8px' }}>{formData.name}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #ddd' }}>
                    <td style={{ padding: '8px', fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>ご住所</td>
                    <td style={{ padding: '8px' }}>{formData.address}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #ddd' }}>
                    <td style={{ padding: '8px', fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>生年月日</td>
                    <td style={{ padding: '8px' }}>{formData.birthdate}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #ddd' }}>
                    <td style={{ padding: '8px', fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>LINE登録名</td>
                    <td style={{ padding: '8px' }}>{formData.lineName}</td>
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
                    <td style={{ padding: '8px', fontWeight: 'bold', width: '30%', backgroundColor: '#f5f5f5' }}>金融機関名</td>
                    <td style={{ padding: '8px' }}>{formData.bankName}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #ddd' }}>
                    <td style={{ padding: '8px', fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>支店名</td>
                    <td style={{ padding: '8px' }}>{formData.branchName}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #ddd' }}>
                    <td style={{ padding: '8px', fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>口座番号</td>
                    <td style={{ padding: '8px' }}>{formData.accountNumber}</td>
                  </tr>
                  {formData.accountNameKana && (
                    <tr style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: '8px', fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>口座名義（カナ）</td>
                      <td style={{ padding: '8px' }}>{formData.accountNameKana}</td>
                    </tr>
                  )}
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
                  </tr>
                </thead>
                <tbody>
                  {formData.items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: '8px' }}>{item.category || '-'}</td>
                      <td style={{ padding: '8px' }}>{item.item || '-'}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{item.count}</td>
                    </tr>
                  ))}
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
                来店予定日時
              </h4>
              <p style={{ fontSize: '1rem', padding: '12px', backgroundColor: '#f9f9f9', border: '1px solid #ddd', borderRadius: '4px' }}>
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

            <section style={{ marginBottom: '32px', padding: '16px', backgroundColor: '#f9f9f9', border: '1px solid #ddd', borderRadius: '4px' }}>
              <h4 style={{ fontSize: '1rem', marginBottom: '12px', fontWeight: 'bold' }}>
                同意事項
              </h4>
              <div style={{ fontSize: '0.9rem', lineHeight: 1.7, color: '#333' }}>
                {consentText ? (
                  consentText.split('\n\n').map((paragraph, idx) => (
                    <p key={idx} style={{ marginBottom: '8px' }}>
                      {paragraph}
                    </p>
                  ))
                ) : (
                  <p>
                    買取にあたり、身分証のコピーと申込内容を本人確認および取引記録の保存目的でお預かりします。法令に基づき適切に保管し、第三者提供は行いません。
                  </p>
                )}
              </div>
            </section>

            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              marginTop: '40px',
              paddingTop: '20px',
              borderTop: '1px solid #333'
            }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ marginBottom: '8px', fontSize: '0.9rem', color: '#666' }}>お客様署名</p>
                <div style={{ 
                  width: '200px', 
                  borderBottom: '1px solid #333',
                  height: '40px'
                }}></div>
              </div>
              <div style={{ textAlign: 'center' }}>
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
              display: 'flex', 
              gap: '12px', 
              justifyContent: 'center',
              marginTop: '24px',
              flexWrap: 'wrap'
            }}
          >
            <button
              onClick={() => window.print()}
              style={{
                padding: '12px 24px',
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600'
              }}
            >
              🖨️ この書類を印刷
            </button>
            
            <Link 
              href="/" 
              style={{ 
                display: 'inline-block',
                padding: '12px 24px',
                background: '#007bff',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: '600'
              }}
            >
              トップページに戻る
            </Link>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
