/**
 * フィルタセレクトコンポーネント（完全制御）
 * クリアボタン付き
 */

import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import type { FilterOption } from '../types';

type FilterSelectProps = {
 id: string;
 label: string;
 value: string;
 onChange: (_value: string) => void;
 options: FilterOption[];
 defaultValue?: string;
 placeholder?: string;
 clearable?: boolean;
};

export function FilterSelect({
 id,
 label,
 value,
 onChange,
 options,
 defaultValue = 'all',
 placeholder,
 clearable = true,
}: FilterSelectProps) {
 const showClearButton = clearable && value !== defaultValue;

 return (
  <div className="grid gap-1.5">
   <Label htmlFor={id}>{label}</Label>
   <div className="relative">
    <Select value={value} onValueChange={onChange}>
     <SelectTrigger id={id} className="pr-3">
      <SelectValue placeholder={placeholder} />
     </SelectTrigger>
     <SelectContent className="max-h-[300px] overflow-y-auto">
      <SelectItem value={defaultValue}>すべて</SelectItem>
      {options.map((option) => {
       const optionId = typeof option === 'string' ? option : option.id;
       const optionLabel = typeof option === 'string' ? option : option.label;
       return (
        <SelectItem key={optionId} value={optionId}>
         {optionLabel || '(未設定)'}
        </SelectItem>
       );
      })}
     </SelectContent>
    </Select>
    {showClearButton && (
     <button
      onClick={(e) => {
       e.stopPropagation();
       onChange(defaultValue);
      }}
      className="absolute right-9 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded-full transition-colors z-10"
      aria-label={`${label}をクリア`}
     >
      <X className="w-3 h-3 text-gray-600" />
     </button>
    )}
   </div>
  </div>
 );
}
