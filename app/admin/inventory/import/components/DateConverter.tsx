'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface DateField {
 field: string;
 sampleValue: string;
 pattern: string;
}

interface DateConverterProps {
 csvText: string;
 onConvert: (_convertedText: string) => void;
}

export function DateConverter({ csvText, onConvert }: DateConverterProps) {
 const [dateFields, setDateFields] = useState<DateField[]>([]);
 const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());

 // 日付パターンの検出
 const datePatterns = useMemo(() => [
  { pattern: /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/, name: 'YYYY-MM-DD or YYYY/MM/DD' },
  { pattern: /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{1,2}:\d{2}(:\d{2})?$/, name: 'YYYY-MM-DD HH:mm:ss' },
  { pattern: /^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/, name: 'DD-MM-YYYY or MM/DD/YYYY' },
  { pattern: /^\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\s+\d{1,2}:\d{2}(:\d{2})?$/, name: 'DD/MM/YYYY HH:mm:ss' },
 ], []);

 useEffect(() => {
  if (!csvText) {
   setDateFields([]);
   setSelectedFields(new Set());
   return;
  }

  const detected = detectDateFields();
  setDateFields(detected);
  // 自動的にすべての日付フィールドを選択
  setSelectedFields(new Set(detected.map(d => d.field)));
 }, [csvText]); // eslint-disable-line react-hooks/exhaustive-deps

 const detectDateFields = (): DateField[] => {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const firstDataRow = parseCSVLine(lines[1]);

  const detected: DateField[] = [];

  headers.forEach((header, index) => {
   const value = firstDataRow[index]?.trim() || '';

   // 各日付パターンをチェック
   for (const { pattern, name } of datePatterns) {
    if (pattern.test(value)) {
     detected.push({
      field: header,
      sampleValue: value,
      pattern: name,
     });
     break;
    }
   }
  });

  return detected;
 };

 const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
   const char = line[i];

   if (char === '"') {
    inQuotes = !inQuotes;
   } else if (char === ',' && !inQuotes) {
    result.push(current.trim().replace(/^["']+|["']+$/g, ''));
    current = '';
   } else {
    current += char;
   }
  }
  result.push(current.trim().replace(/^["']+|["']+$/g, ''));
  return result;
 };

 const convertToTimestamp = (dateStr: string): string => {
  try {
   // 様々な日付フォーマットをパース
   let date: Date;

   // YYYY/MM/DD HH:mm:ss 形式
   if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{1,2}:\d{2}(:\d{2})?$/.test(dateStr)) {
    const normalized = dateStr.replace(/\//g, '-');
    date = new Date(normalized);
   }
   // YYYY/MM/DD 形式
   else if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/.test(dateStr)) {
    const normalized = dateStr.replace(/\//g, '-');
    date = new Date(normalized);
   }
   // DD/MM/YYYY 形式
   else if (/^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/.test(dateStr)) {
    const parts = dateStr.split(/[-\/]/);
    date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
   }
   // その他の形式
   else {
    date = new Date(dateStr);
   }

   if (isNaN(date.getTime())) {
    return dateStr; // 変換失敗時は元の値を返す
   }

   // ISO 8601形式に変換
   return date.toISOString();
  } catch {
   return dateStr;
  }
 };

 const handleConvert = () => {
  if (selectedFields.size === 0) {
   alert('変換するフィールドを選択してください');
   return;
  }

  try {
   const lines = csvText.trim().split('\n');
   if (lines.length < 2) return;

   const headers = parseCSVLine(lines[0]);
   const selectedIndexes = new Set(
    Array.from(selectedFields).map(field => headers.indexOf(field))
   );

   // ヘッダー行はそのまま
   const convertedLines = [lines[0]];

   // データ行を処理
   for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const convertedValues = values.map((value, index) => {
     if (selectedIndexes.has(index)) {
      return convertToTimestamp(value);
     }
     return value;
    });

    // CSV行を再構築（クォートで囲む）
    const csvLine = convertedValues.map(v => `"${v}"`).join(',');
    convertedLines.push(csvLine);
   }

   const convertedText = convertedLines.join('\n');
   onConvert(convertedText);

   alert(`${selectedFields.size}個のフィールドをTimestamp形式に変換しました`);
  } catch (error) {
   console.error('Date conversion error:', error);
   alert('日付変換に失敗しました');
  }
 };

 const toggleField = (field: string) => {
  const newSelected = new Set(selectedFields);
  if (newSelected.has(field)) {
   newSelected.delete(field);
  } else {
   newSelected.add(field);
  }
  setSelectedFields(newSelected);
 };

 if (dateFields.length === 0) return null;

 return (
  <Card className="border-blue-300 bg-blue-50">
   <CardHeader className="pb-3">
    <CardTitle className="text-sm flex items-center gap-2">
     <Calendar className="w-4 h-4" />
     日付フィールド検出
    </CardTitle>
    <CardDescription className="text-xs">
     日付と思われるフィールドが検出されました。Timestamp形式に変換できます。
    </CardDescription>
   </CardHeader>
   <CardContent>
    <div className="space-y-3">
     {/* 検出された日付フィールド */}
     <div className="space-y-2">
      {dateFields.map((item) => (
       <div
        key={item.field}
        className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200"
       >
        <Checkbox
         id={`field-${item.field}`}
         checked={selectedFields.has(item.field)}
         onCheckedChange={() => toggleField(item.field)}
        />
        <div className="flex-1">
         <label
          htmlFor={`field-${item.field}`}
          className="text-sm font-medium text-gray-900 cursor-pointer flex items-center gap-2"
         >
          {item.field}
          <Badge variant="secondary" className="text-xs">
           {item.pattern}
          </Badge>
         </label>
         <p className="text-xs text-gray-600 mt-1">
          例: <code className="px-1 py-0.5 bg-gray-100 rounded">{item.sampleValue}</code>
         </p>
        </div>
       </div>
      ))}
     </div>

     {/* 変換ボタン */}
     <div className="flex items-center justify-between pt-2">
      <div className="flex items-center gap-2 text-sm text-gray-700">
       {selectedFields.size > 0 ? (
        <>
         <CheckCircle2 className="w-4 h-4 text-green-600" />
         {selectedFields.size}個のフィールドを変換
        </>
       ) : (
        <>
         <AlertCircle className="w-4 h-4 text-yellow-600" />
         フィールドを選択してください
        </>
       )}
      </div>
      <Button
       onClick={handleConvert}
       size="sm"
       disabled={selectedFields.size === 0}
       className="bg-blue-600 hover:bg-blue-700"
      >
       <Calendar className="w-4 h-4 mr-2" />
       Timestamp形式に変換
      </Button>
     </div>
    </div>
   </CardContent>
  </Card>
 );
}
