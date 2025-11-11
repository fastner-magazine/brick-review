'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type ItemEntry = {
  category: string;
  item: string;
  subcategory: string;
  count: number;
};

type Submission = {
  id: string;
  name: string;
  address: string;
  birthdate: string;
  lineName: string;
  idFrontName: string;
  idBackName: string;
  bankName: string;
  bankCode: string;
  branchName: string;
  branchCode: string;
  accountNumber: string;
  accountNameKana: string;
  preferredDateTime: string;
  items: ItemEntry[];
  consent: boolean;
  status: string;
  createdAt: string;
};

export default function ReservationsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);

  useEffect(() => {
    loadSubmissions();
  }, []);

  const loadSubmissions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/buyback-submission');
      if (!response.ok) {
        throw new Error('Failed to fetch submissions');
      }
      const data = await response.json();
      setSubmissions(data.submissions || []);
    } catch (err) {
      console.error('Failed to load submissions:', err);
      setError('受付データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return '受付済み';
      case 'confirmed':
        return '確認済み';
      case 'completed':
        return '完了';
      case 'cancelled':
        return 'キャンセル';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return '#ffc107';
      case 'confirmed':
        return '#007bff';
      case 'completed':
        return '#28a745';
      case 'cancelled':
        return '#dc3545';
      default:
        return '#6c757d';
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ marginBottom: '20px' }}>
        <Link href="/" style={{ color: '#007bff', textDecoration: 'underline' }}>
          ← トップページに戻る
        </Link>
      </div>

      <h1 style={{ fontSize: '1.8rem', marginBottom: '24px' }}>買取受付一覧</h1>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          読み込み中...
        </div>
      ) : error ? (
        <div style={{ 
          padding: '20px', 
          backgroundColor: '#f8d7da', 
          border: '1px solid #f5c6cb',
          borderRadius: '8px',
          color: '#721c24'
        }}>
          {error}
        </div>
      ) : submissions.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px', 
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          color: '#666'
        }}>
          受付データがありません
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {submissions.map((submission) => (
            <div
              key={submission.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '20px',
                backgroundColor: 'white',
                cursor: 'pointer',
                transition: 'box-shadow 0.2s',
              }}
              onClick={() => setSelectedSubmission(submission)}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>
                    {submission.name}
                  </h3>
                  <p style={{ color: '#666', fontSize: '0.9rem' }}>
                    受付日時: {new Date(submission.createdAt).toLocaleString('ja-JP')}
                  </p>
                </div>
                <div
                  style={{
                    padding: '6px 16px',
                    borderRadius: '20px',
                    backgroundColor: getStatusColor(submission.status),
                    color: 'white',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                  }}
                >
                  {getStatusLabel(submission.status)}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '16px' }}>
                <div>
                  <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '4px' }}>来店予定日時</p>
                  <p style={{ fontWeight: '600' }}>
                    {new Date(submission.preferredDateTime).toLocaleString('ja-JP', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '4px' }}>買取品目数</p>
                  <p style={{ fontWeight: '600' }}>{submission.items.length}件</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '4px' }}>振込先</p>
                  <p style={{ fontWeight: '600', fontSize: '0.9rem' }}>{submission.bankName}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 詳細モーダル */}
      {selectedSubmission && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setSelectedSubmission(null)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              padding: '32px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.5rem' }}>受付詳細</h2>
              <button
                onClick={() => setSelectedSubmission(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#666',
                }}
              >
                ×
              </button>
            </div>

            <section style={{ marginBottom: '24px' }}>
              <h4 style={{ fontSize: '1.1rem', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #007bff' }}>
                お客様情報
              </h4>
              <table style={{ width: '100%', fontSize: '0.95rem' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px 0', fontWeight: '600', width: '30%', color: '#666' }}>お名前</td>
                    <td style={{ padding: '8px 0' }}>{selectedSubmission.name}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0', fontWeight: '600', color: '#666' }}>住所</td>
                    <td style={{ padding: '8px 0' }}>{selectedSubmission.address}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0', fontWeight: '600', color: '#666' }}>生年月日</td>
                    <td style={{ padding: '8px 0' }}>{selectedSubmission.birthdate}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0', fontWeight: '600', color: '#666' }}>LINE登録名</td>
                    <td style={{ padding: '8px 0' }}>{selectedSubmission.lineName}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0', fontWeight: '600', color: '#666' }}>身分証</td>
                    <td style={{ padding: '8px 0' }}>
                      表面: {selectedSubmission.idFrontName}<br />
                      裏面: {selectedSubmission.idBackName}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section style={{ marginBottom: '24px' }}>
              <h4 style={{ fontSize: '1.1rem', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #007bff' }}>
                振込先情報
              </h4>
              <table style={{ width: '100%', fontSize: '0.95rem' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px 0', fontWeight: '600', width: '30%', color: '#666' }}>金融機関</td>
                    <td style={{ padding: '8px 0' }}>{selectedSubmission.bankName}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0', fontWeight: '600', color: '#666' }}>支店名</td>
                    <td style={{ padding: '8px 0' }}>{selectedSubmission.branchName}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0', fontWeight: '600', color: '#666' }}>口座番号</td>
                    <td style={{ padding: '8px 0' }}>{selectedSubmission.accountNumber}</td>
                  </tr>
                  {selectedSubmission.accountNameKana && (
                    <tr>
                      <td style={{ padding: '8px 0', fontWeight: '600', color: '#666' }}>口座名義（カナ）</td>
                      <td style={{ padding: '8px 0' }}>{selectedSubmission.accountNameKana}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            <section style={{ marginBottom: '24px' }}>
              <h4 style={{ fontSize: '1.1rem', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #007bff' }}>
                買取希望品目
              </h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>カテゴリ</th>
                    <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>商品名</th>
                    <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>数量</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSubmission.items.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>{item.category || '-'}</td>
                      <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>{item.item || '-'}</td>
                      <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #eee' }}>{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section style={{ marginBottom: '24px' }}>
              <h4 style={{ fontSize: '1.1rem', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #007bff' }}>
                来店予定日時
              </h4>
              <p style={{ fontSize: '1.1rem', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                {new Date(selectedSubmission.preferredDateTime).toLocaleString('ja-JP', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </section>

            <section>
              <h4 style={{ fontSize: '1.1rem', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #007bff' }}>
                受付情報
              </h4>
              <table style={{ width: '100%', fontSize: '0.95rem' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px 0', fontWeight: '600', width: '30%', color: '#666' }}>受付日時</td>
                    <td style={{ padding: '8px 0' }}>
                      {new Date(selectedSubmission.createdAt).toLocaleString('ja-JP')}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0', fontWeight: '600', color: '#666' }}>ステータス</td>
                    <td style={{ padding: '8px 0' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          backgroundColor: getStatusColor(selectedSubmission.status),
                          color: 'white',
                          fontSize: '0.85rem',
                          fontWeight: '600',
                        }}
                      >
                        {getStatusLabel(selectedSubmission.status)}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0', fontWeight: '600', color: '#666' }}>受付ID</td>
                    <td style={{ padding: '8px 0', fontSize: '0.85rem', fontFamily: 'monospace', color: '#666' }}>
                      {selectedSubmission.id}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
