'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function BuybackSettingsPage() {
  const [consentText, setConsentText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    // Firestoreから同意書テキストを読み込む
    const loadConsentText = async () => {
      try {
        const response = await fetch('/api/buyback-settings/consent');
        if (response.ok) {
          const data = await response.json();
          setConsentText(data.consentText || '');
        }
      } catch (error) {
        console.error('同意書の読み込みに失敗しました:', error);
      }
    };
    loadConsentText();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage('');

    try {
      const response = await fetch('/api/buyback-settings/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ consentText }),
      });

      if (response.ok) {
        setSaveMessage('保存しました');
        setTimeout(() => setSaveMessage(''), 3000);
      } else {
        setSaveMessage('保存に失敗しました');
      }
    } catch (error) {
      console.error('保存エラー:', error);
      setSaveMessage('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-800">買取設定</h1>
          <Button asChild variant="outline">
            <Link href="/">ホームに戻る</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>同意書の内容設定</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              買取受付フォームの同意確認ステップで表示される文章を設定します。
              <br />
              複数段落を記載する場合は、空行で区切ってください。
            </p>

            <textarea
              value={consentText}
              onChange={(e) => setConsentText(e.target.value)}
              placeholder="例：買取にあたり、身分証のコピーと申込内容を本人確認および取引記録の保存目的でお預かりします。法令に基づき適切に保管し、第三者提供は行いません。"
              rows={12}
              className="w-full p-4 border border-gray-300 rounded-lg resize-vertical focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ fontSize: '16px', lineHeight: '1.6' }}
            />

            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-gray-500">
                {consentText.length} 文字
              </div>
              <div className="flex items-center gap-4">
                {saveMessage && (
                  <span
                    className={`text-sm ${
                      saveMessage.includes('成功') || saveMessage.includes('保存しました')
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {saveMessage}
                  </span>
                )}
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  variant="default"
                >
                  {isSaving ? '保存中...' : '保存する'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>プレビュー</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
              <h3 className="font-semibold text-lg mb-3">利用規約と個人情報の取り扱い</h3>
              {consentText.split('\n\n').map((paragraph, idx) => (
                <p
                  key={idx}
                  className="text-gray-700 mb-3 last:mb-0"
                  style={{ fontSize: '0.95rem', lineHeight: 1.6 }}
                >
                  {paragraph}
                </p>
              ))}
              {!consentText && (
                <p className="text-gray-400 italic">同意書の内容が設定されていません</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
