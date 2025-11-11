import React from 'react';
import { Badge } from '@/components/ui/badge';

type MultiSelectCheckboxProps = {
    options: Array<{ id: string; label: string }>;
    selectedIds: string[];
    onChange: (_selectedIds: string[]) => void;
    label?: string;
    allowMultiple?: boolean;
};

export default function MultiSelectCheckbox({
    options,
    selectedIds,
    onChange,
    label,
    allowMultiple = true,
}: MultiSelectCheckboxProps) {
    const handleToggle = (id: string) => {
        if (allowMultiple) {
            if (selectedIds.includes(id)) {
                onChange(selectedIds.filter((x) => x !== id));
            } else {
                onChange([...selectedIds, id]);
            }
            return;
        }

        if (selectedIds.includes(id)) {
            onChange([]);
            return;
        }

        onChange([id]);
    };

    const handleClearAll = () => {
        onChange([]);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {label && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 500 }}>{label}</span>
                    {selectedIds.length > 0 && (
                        <button
                            type="button"
                            onClick={handleClearAll}
                            style={{
                                fontSize: '0.75rem',
                                color: '#ef4444',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                            }}
                        >
                            解除
                        </button>
                    )}
                </div>
            )}
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(148, 163, 184, 0.6)',
                    minHeight: '48px',
                    backgroundColor: '#fff',
                }}
            >
                {options.length === 0 && (
                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>選択肢がありません</span>
                )}
                {options.map((opt) => {
                    const isSelected = selectedIds.includes(opt.id);
                    return (
                        <label
                            key={opt.id}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 10px',
                                borderRadius: '9999px',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                backgroundColor: isSelected ? '#dbeafe' : '#f1f5f9',
                                border: `1px solid ${isSelected ? '#3b82f6' : '#cbd5e1'}`,
                                color: isSelected ? '#1e40af' : '#475569',
                                fontWeight: isSelected ? 600 : 400,
                                transition: 'all 0.15s',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggle(opt.id)}
                                style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                            />
                            <span>{opt.label}</span>
                        </label>
                    );
                })}
            </div>
            {selectedIds.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '0.75rem', color: '#64748b' }}>
                    <span>選択中:</span>
                    {selectedIds.map((id) => {
                        const opt = options.find((o) => o.id === id);
                        return opt ? (
                            <Badge key={id} variant="secondary">
                                {opt.label}
                            </Badge>
                        ) : null;
                    })}
                </div>
            )}
        </div>
    );
}
