'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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

const DEFAULT_FIELDS: FieldMapping[] = [
  { fieldName: 'createdAt', displayName: '受付日時', cellAddress: 'A2', enabled: true },
  { fieldName: 'name', displayName: 'お名前', cellAddress: 'B2', enabled: true },
  { fieldName: 'address', displayName: '住所', cellAddress: 'C2', enabled: true },
  { fieldName: 'birthdate', displayName: '生年月日', cellAddress: 'D2', enabled: true },
  { fieldName: 'lineName', displayName: 'LINE登録名', cellAddress: 'E2', enabled: true },
  { fieldName: 'idFrontName', displayName: '身分証表面', cellAddress: 'F2', enabled: false },
  { fieldName: 'idBackName', displayName: '身分証裏面', cellAddress: 'G2', enabled: false },
  { fieldName: 'bankName', displayName: '金融機関名', cellAddress: 'H2', enabled: true },
  { fieldName: 'bankCode', displayName: '金融機関コード', cellAddress: 'I2', enabled: false },
  { fieldName: 'branchName', displayName: '支店名', cellAddress: 'J2', enabled: true },
  { fieldName: 'branchCode', displayName: '支店コード', cellAddress: 'K2', enabled: false },
  { fieldName: 'accountNumber', displayName: '口座番号', cellAddress: 'L2', enabled: true },
  { fieldName: 'accountNameKana', displayName: '口座名義（カナ）', cellAddress: 'M2', enabled: true },
  { fieldName: 'preferredDateTime', displayName: '来店希望日時', cellAddress: 'N2', enabled: true },
  { fieldName: 'items', displayName: '買取品目（JSON）', cellAddress: 'O2', enabled: true },
  { fieldName: 'itemsCount', displayName: '買取品目数', cellAddress: 'P2', enabled: true },
  { fieldName: 'status', displayName: 'ステータス', cellAddress: 'Q2', enabled: true },
];

export default function SheetsConfigPage() {
  const [config, setConfig] = useState<SheetsConfig>({
    spreadsheetId: '',
    sheetName: 'Sheet1',
    fieldMappings: DEFAULT_FIELDS,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [testResult, setTestResult] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'visual'>('table');
  const [draggedField, setDraggedField] = useState<FieldMapping | null>(null);
  const [duplicateAddresses, setDuplicateAddresses] = useState<string[]>([]);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    // フィールドマッピングが変わったら重複セルアドレスを検出する
    const duplicates = findDuplicateAddresses(config.fieldMappings);
    setDuplicateAddresses(duplicates);
  }, [config.fieldMappings]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/sheets-config');
      if (response.ok) {
        const data = await response.json();
        if (data.config) {
          setConfig(data.config);
        }
      }
    } catch (error) {
      console.error('設定の読み込みに失敗しました:', error);
    } finally {
      setLoading(false);
    }
  };

  // 有効なフィールドのセルアドレスに重複がないか検査する
  const findDuplicateAddresses = (mappings: FieldMapping[]): string[] => {
    const seen: Record<string, number> = {};
    for (const m of mappings) {
      if (!m.enabled) continue;
      const addr = (m.cellAddress || '').toUpperCase().trim();
      if (!addr) continue;
      seen[addr] = (seen[addr] || 0) + 1;
    }
    return Object.keys(seen).filter((k) => seen[k] > 1);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage('');

      if (duplicateAddresses.length > 0) {
        setMessage(`✗ 保存中止: 同じセルアドレスが複数のフィールドに設定されています: ${duplicateAddresses.join(', ')}`);
        return;
      }

      const response = await fetch('/api/sheets-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        setMessage('✓ 設定を保存しました');
        setTimeout(() => setMessage(''), 3000);
      } else {
        throw new Error('保存に失敗しました');
      }
    } catch (error) {
      console.error('保存エラー:', error);
      setMessage('✗ 保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    try {
      setTestResult('テスト中...');

      if (duplicateAddresses.length > 0) {
        setTestResult(`✗ テスト中止: 同じセルアドレスが複数のフィールドに設定されています: ${duplicateAddresses.join(', ')}`);
        return;
      }

      const testData = {
        createdAt: new Date().toISOString(),
        name: 'テスト太郎',
        address: '東京都渋谷区テスト1-2-3',
        birthdate: '1990-01-01',
        lineName: 'test_taro',
        idFrontName: 'id_front.jpg',
        idBackName: 'id_back.jpg',
        bankName: 'テスト銀行',
        bankCode: '0001',
        branchName: '本店',
        branchCode: '001',
        accountNumber: '1234567',
        accountNameKana: 'テストタロウ',
        preferredDateTime: new Date(Date.now() + 86400000).toISOString(),
        items: [{ category: 'テスト', item: 'テスト商品', count: 1 }],
        itemsCount: 1,
        status: 'pending',
      };

      const response = await fetch('/api/sheets-write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: testData,
          config: config,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setTestResult(`✓ テスト送信成功！\n書き込み範囲: ${result.updatedRange || 'N/A'}`);
      } else {
        const error = await response.json();
        setTestResult(`✗ テスト失敗: ${error.error || '不明なエラー'}`);
      }
    } catch (error) {
      console.error('テストエラー:', error);
      setTestResult(`✗ テスト失敗: ${error instanceof Error ? error.message : '不明なエラー'}`);
    }
  };

  const updateFieldMapping = (index: number, updates: Partial<FieldMapping>) => {
    const newMappings = [...config.fieldMappings];
    newMappings[index] = { ...newMappings[index], ...updates };
    setConfig({ ...config, fieldMappings: newMappings });
  };

  // セルアドレスをパース（例: A1 -> {col: 0, row: 0}, Z10 -> {col: 25, row: 9}）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
  const parseCellAddress = (address: string): { col: number; row: number } | null => {
    const match = address.match(/^([A-Z]+)(\d+)$/);
    if (!match) return null;

    const colStr = match[1];
    const rowStr = match[2];

    // 列を数値に変換（A=0, B=1, ..., Z=25, AA=26, ...）
    let col = 0;
    for (let i = 0; i < colStr.length; i++) {
      col = col * 26 + (colStr.charCodeAt(i) - 65 + 1);
    }
    col = col - 1;

    const row = parseInt(rowStr) - 1;

    return { col, row };
  };

  // 数値をセルアドレスに変換（例: {col: 0, row: 0} -> A1）
  const formatCellAddress = (col: number, row: number): string => {
    let colStr = '';
    let c = col + 1;
    while (c > 0) {
      const remainder = (c - 1) % 26;
      colStr = String.fromCharCode(65 + remainder) + colStr;
      c = Math.floor((c - 1) / 26);
    }
    return `${colStr}${row + 1}`;
  };

  // ビジュアルエディタでセルをクリックしたときの処理
  const handleCellClick = (col: number, row: number) => {
    if (!draggedField) return;

    const newAddress = formatCellAddress(col, row);
    const fieldIndex = config.fieldMappings.findIndex(f => f.fieldName === draggedField.fieldName);

    if (fieldIndex !== -1) {
      updateFieldMapping(fieldIndex, { cellAddress: newAddress, enabled: true });
    }

    setDraggedField(null);
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px 16px' }}>
        <p style={{ textAlign: 'center', padding: '40px', color: '#666' }}>読み込み中...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ marginBottom: '20px' }}>
        <Link href="/" style={{ color: '#007bff', textDecoration: 'underline' }}>
          ← トップページに戻る
        </Link>
      </div>

      <h1 style={{ fontSize: '1.8rem', marginBottom: '24px' }}>Google Sheets 連携設定</h1>

      {message && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '20px',
            backgroundColor: message.startsWith('✓') ? '#d4edda' : '#f8d7da',
            border: `1px solid ${message.startsWith('✓') ? '#c3e6cb' : '#f5c6cb'}`,
            borderRadius: '8px',
            color: message.startsWith('✓') ? '#155724' : '#721c24',
          }}
        >
          {message}
        </div>
      )}

      {/* 基本設定 */}
      <section style={{ marginBottom: '32px', padding: '24px', backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '12px' }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: '20px', paddingBottom: '12px', borderBottom: '2px solid #007bff' }}>
          基本設定
        </h2>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.95rem' }}>
            スプレッドシートID *
          </label>
          <input
            type="text"
            value={config.spreadsheetId}
            onChange={(e) => setConfig({ ...config, spreadsheetId: e.target.value })}
            placeholder="https://docs.google.com/spreadsheets/d/【ここのID】/edit"
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid #bbb',
              fontSize: '16px',
              fontFamily: 'monospace',
            }}
          />
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '6px' }}>
            スプレッドシートのURLから「/d/」と「/edit」の間の文字列をコピーしてください
          </p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.95rem' }}>
            シート名 *
          </label>
          <input
            type="text"
            value={config.sheetName}
            onChange={(e) => setConfig({ ...config, sheetName: e.target.value })}
            placeholder="Sheet1"
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid #bbb',
              fontSize: '16px',
            }}
          />
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '6px' }}>
            データを書き込むシートの名前（タブ名）を入力してください
          </p>
        </div>
      </section>

      {/* フィールドマッピング設定 */}
      <section style={{ marginBottom: '32px', padding: '24px', backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '2px solid #007bff' }}>
          <h2 style={{ fontSize: '1.3rem', margin: 0 }}>
            フィールドマッピング設定
          </h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setViewMode('table')}
              style={{
                padding: '8px 16px',
                backgroundColor: viewMode === 'table' ? '#007bff' : 'white',
                color: viewMode === 'table' ? 'white' : '#007bff',
                border: '1px solid #007bff',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              📋 テーブル表示
            </button>
            <button
              onClick={() => setViewMode('visual')}
              style={{
                padding: '8px 16px',
                backgroundColor: viewMode === 'visual' ? '#007bff' : 'white',
                color: viewMode === 'visual' ? 'white' : '#007bff',
                border: '1px solid #007bff',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              🎨 ビジュアル編集
            </button>
          </div>
        </div>

        {viewMode === 'table' ? (
          // テーブル表示モード（既存）
          <>
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '20px' }}>
              各フィールドをスプレッドシートのどのセルに書き込むかを設定します。<br />
              チェックを外すとそのフィールドは書き込まれません。
            </p>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #ddd' }}>
                    <th style={{ padding: '12px', textAlign: 'left', width: '60px' }}>有効</th>
                    <th style={{ padding: '12px', textAlign: 'left', minWidth: '180px' }}>フィールド名</th>
                    <th style={{ padding: '12px', textAlign: 'left', minWidth: '150px' }}>セルアドレス</th>
                    <th style={{ padding: '12px', textAlign: 'left', minWidth: '100px' }}>プレビュー</th>
                  </tr>
                </thead>
                <tbody>
                  {config.fieldMappings.map((field, index) => (
                    <tr key={field.fieldName} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={field.enabled}
                          onChange={(e) => updateFieldMapping(index, { enabled: e.target.checked })}
                          style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: '600' }}>{field.displayName}</div>
                        <div style={{ fontSize: '0.8rem', color: '#999', fontFamily: 'monospace' }}>
                          {field.fieldName}
                        </div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <input
                          type="text"
                          value={field.cellAddress}
                          onChange={(e) => updateFieldMapping(index, { cellAddress: e.target.value.toUpperCase() })}
                          disabled={!field.enabled}
                          placeholder="例: A1, B2"
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #bbb',
                            fontSize: '14px',
                            fontFamily: 'monospace',
                            backgroundColor: field.enabled ? 'white' : '#f5f5f5',
                          }}
                        />
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 10px',
                            backgroundColor: field.enabled ? '#e3f2fd' : '#f5f5f5',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            fontFamily: 'monospace',
                            color: field.enabled ? '#1565c0' : '#999',
                          }}
                        >
                          {config.sheetName}!{field.cellAddress}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#fff8e1', border: '1px solid #ffc107', borderRadius: '8px' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '8px', color: '#856404' }}>
                💡 セルアドレスの指定方法
              </h4>
              <ul style={{ fontSize: '0.85rem', color: '#856404', lineHeight: 1.8, paddingLeft: '20px' }}>
                <li>列はA, B, C...、行は1, 2, 3...で指定します（例: A1, B2, AA10）</li>
                <li>同じセルアドレスを複数のフィールドに設定しないでください</li>
                <li>ヘッダー行がある場合は、データ行（通常2行目以降）を指定してください</li>
                <li>「買取品目（JSON）」は配列データをJSON文字列として保存します</li>
              </ul>
            </div>
          </>
        ) : (
          // ビジュアル編集モード
          <>
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '20px' }}>
              左側のフィールドをクリックして選択し、右側のスプレッドシートグリッドでセルをクリックして配置します。
            </p>

            <div style={{ display: 'flex', gap: '20px' }}>
              {/* フィールドリスト */}
              <div style={{ flex: '0 0 280px', backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '8px', maxHeight: '600px', overflowY: 'auto' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '12px', fontWeight: '600' }}>フィールド一覧</h3>
                {config.fieldMappings.map((field) => {
                  const isSelected = draggedField?.fieldName === field.fieldName;
                  return (
                    <div
                      key={field.fieldName}
                      onClick={() => setDraggedField(field)}
                      style={{
                        padding: '10px 12px',
                        marginBottom: '8px',
                        backgroundColor: isSelected ? '#007bff' : field.enabled ? 'white' : '#e9ecef',
                        color: isSelected ? 'white' : field.enabled ? '#333' : '#999',
                        border: `2px solid ${isSelected ? '#0056b3' : field.enabled ? '#dee2e6' : '#ced4da'}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = field.enabled ? '#f8f9fa' : '#e0e0e0';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = field.enabled ? 'white' : '#e9ecef';
                        }
                      }}
                    >
                      <div style={{ fontWeight: '600', marginBottom: '4px' }}>{field.displayName}</div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.8, fontFamily: 'monospace' }}>
                        {field.enabled ? field.cellAddress : '無効'}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* スプレッドシートグリッド */}
              <div style={{ flex: 1, overflowX: 'auto' }}>
                <div style={{
                  display: 'inline-block',
                  border: '2px solid #dee2e6',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  backgroundColor: 'white',
                }}>
                  {/* ヘッダー行（列ラベル） */}
                  <div style={{ display: 'flex', borderBottom: '2px solid #dee2e6' }}>
                    <div style={{
                      width: '40px',
                      height: '32px',
                      backgroundColor: '#f8f9fa',
                      borderRight: '1px solid #dee2e6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: '#666',
                    }}></div>
                    {Array.from({ length: 20 }, (_, i) => {
                      const colLabel = formatCellAddress(i, 0).replace(/\d+$/, '');
                      return (
                        <div
                          key={i}
                          style={{
                            width: '60px',
                            height: '32px',
                            backgroundColor: '#f8f9fa',
                            borderRight: i < 19 ? '1px solid #dee2e6' : 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            color: '#495057',
                          }}
                        >
                          {colLabel}
                        </div>
                      );
                    })}
                  </div>

                  {/* データ行 */}
                  {Array.from({ length: 30 }, (_, rowIndex) => (
                    <div key={rowIndex} style={{ display: 'flex', borderBottom: rowIndex < 29 ? '1px solid #dee2e6' : 'none' }}>
                      {/* 行番号 */}
                      <div style={{
                        width: '40px',
                        height: '32px',
                        backgroundColor: '#f8f9fa',
                        borderRight: '1px solid #dee2e6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        color: '#495057',
                      }}>
                        {rowIndex + 1}
                      </div>

                      {/* セル */}
                      {Array.from({ length: 20 }, (_, colIndex) => {
                        const cellAddress = formatCellAddress(colIndex, rowIndex);
                        const fieldInCell = config.fieldMappings.find(f => f.enabled && f.cellAddress === cellAddress);
                        const isHovered = draggedField !== null;

                        return (
                          <div
                            key={colIndex}
                            onClick={() => handleCellClick(colIndex, rowIndex)}
                            style={{
                              width: '60px',
                              height: '32px',
                              borderRight: colIndex < 19 ? '1px solid #dee2e6' : 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.7rem',
                              cursor: isHovered ? 'pointer' : 'default',
                              backgroundColor: fieldInCell
                                ? '#007bff'
                                : isHovered
                                  ? '#e3f2fd'
                                  : 'white',
                              color: fieldInCell ? 'white' : '#666',
                              fontWeight: fieldInCell ? '600' : 'normal',
                              transition: 'all 0.15s',
                              position: 'relative',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              padding: '0 4px',
                            }}
                            title={fieldInCell ? `${fieldInCell.displayName} (${cellAddress})` : cellAddress}
                          >
                            {fieldInCell ? fieldInCell.displayName.substring(0, 6) : ''}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#e3f2fd', border: '1px solid #2196f3', borderRadius: '6px' }}>
                  <p style={{ fontSize: '0.85rem', color: '#0d47a1', margin: 0 }}>
                    💡 <strong>使い方:</strong> 左側のフィールドをクリックして選択し、グリッド上のセルをクリックして配置します。
                    {draggedField && (
                      <span style={{ display: 'block', marginTop: '8px', fontWeight: '600' }}>
                        選択中: {draggedField.displayName}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* 保存・テストボタン */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
        <button
          onClick={handleSave}
          disabled={saving || !config.spreadsheetId || !config.sheetName}
          style={{
            flex: 1,
            padding: '14px 24px',
            backgroundColor: saving ? '#98c9a5' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: saving || !config.spreadsheetId || !config.sheetName ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: '600',
          }}
        >
          {saving ? '保存中...' : '💾 設定を保存'}
        </button>

        <button
          onClick={handleTest}
          disabled={!config.spreadsheetId || !config.sheetName}
          style={{
            flex: 1,
            padding: '14px 24px',
            backgroundColor: !config.spreadsheetId || !config.sheetName ? '#9fbce3' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: !config.spreadsheetId || !config.sheetName ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: '600',
          }}
        >
          🧪 テスト送信
        </button>
      </div>

      {/* テスト結果表示 */}
      {testResult && (
        <div
          style={{
            padding: '16px',
            marginBottom: '32px',
            backgroundColor: testResult.startsWith('✓') ? '#d4edda' : '#f8d7da',
            border: `1px solid ${testResult.startsWith('✓') ? '#c3e6cb' : '#f5c6cb'}`,
            borderRadius: '8px',
            color: testResult.startsWith('✓') ? '#155724' : '#721c24',
            whiteSpace: 'pre-line',
            fontFamily: 'monospace',
            fontSize: '0.9rem',
          }}
        >
          {testResult}
        </div>
      )}

      {/* セットアップガイド */}
      <section style={{ padding: '24px', backgroundColor: '#f8f9fa', border: '1px solid #ddd', borderRadius: '12px' }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: '16px' }}>📖 セットアップガイド</h2>

        <div style={{ fontSize: '0.9rem', lineHeight: 1.8, color: '#333' }}>
          <h3 style={{ fontSize: '1.1rem', marginTop: '16px', marginBottom: '12px', fontWeight: '600' }}>
            1. Google Cloud Consoleでの設定
          </h3>
          <ol style={{ paddingLeft: '24px', marginBottom: '16px' }}>
            <li>Google Cloud Consoleにアクセス</li>
            <li>新しいプロジェクトを作成（または既存のプロジェクトを選択）</li>
            <li>Google Sheets APIを有効化</li>
            <li>サービスアカウントを作成し、JSONキーをダウンロード</li>
            <li>環境変数にサービスアカウントの情報を設定</li>
          </ol>

          <h3 style={{ fontSize: '1.1rem', marginTop: '16px', marginBottom: '12px', fontWeight: '600' }}>
            2. スプレッドシートの共有設定
          </h3>
          <ol style={{ paddingLeft: '24px', marginBottom: '16px' }}>
            <li>連携したいGoogleスプレッドシートを開く</li>
            <li>「共有」ボタンをクリック</li>
            <li>サービスアカウントのメールアドレスを「編集者」権限で追加</li>
          </ol>

          <h3 style={{ fontSize: '1.1rem', marginTop: '16px', marginBottom: '12px', fontWeight: '600' }}>
            3. このページでの設定
          </h3>
          <ol style={{ paddingLeft: '24px' }}>
            <li>スプレッドシートIDを入力（URLから取得）</li>
            <li>書き込み先のシート名を入力</li>
            <li>各フィールドのセルアドレスを設定</li>
            <li>「テスト送信」でテストデータを送信して動作確認</li>
            <li>問題なければ「設定を保存」</li>
          </ol>
        </div>
      </section>
    </div>
  );
}
