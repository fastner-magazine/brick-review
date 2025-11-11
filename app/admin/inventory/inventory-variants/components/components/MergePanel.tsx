/**
 * 商品統合UI（衝突検出・解決）
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { MergeContext } from '../types';

type MergePanelProps = {
    context: MergeContext | null;
    isProcessing: boolean;
    statusMessage: string;
    onExecute: () => void;
    onCancel: () => void;
    onForceDeleteVariant?: (variantSku: string) => void;
};

export function MergePanel({
    context,
    isProcessing,
    statusMessage,
    onExecute,
    onCancel,
    onForceDeleteVariant,
}: MergePanelProps) {
    if (!context) return null;

    const hasConflicts = context.conflicts.length > 0;

    const handleForceDelete = (variantSku: string, variantInfo: string) => {
        if (!onForceDeleteVariant) return;
        
        const confirmed = window.confirm(
            `⚠️ 警告: このバリアントを強制削除します\n\n` +
            `バリアント: ${variantInfo}\n` +
            `SKU: ${variantSku}\n\n` +
            `この操作は取り消せません。本当に削除しますか？`
        );
        
        if (confirmed) {
            onForceDeleteVariant(variantSku);
        }
    };

    return (
        <Card className="border-orange-500 bg-orange-50">
            <CardHeader>
                <CardTitle className="text-lg">
                    🔀 商品統合の確認
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* 統合元・統合先の表示 */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <div className="text-sm font-semibold text-gray-600">統合元（削除）</div>
                        <div className="font-bold">{context.fromGroup.productName}</div>
                        <div className="text-xs text-gray-500">
                            {context.fromGroup.variantGroupId}
                        </div>
                        <Badge variant="outline" className="mt-1">
                            {context.fromGroup.variants.length} バリアント
                        </Badge>
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-gray-600">統合先（保持）</div>
                        <div className="font-bold">{context.toGroup.productName}</div>
                        <div className="text-xs text-gray-500">
                            {context.toGroup.variantGroupId}
                        </div>
                        <Badge variant="outline" className="mt-1">
                            {context.toGroup.variants.length} バリアント
                        </Badge>
                    </div>
                </div>

                {/* 衝突情報 */}
                {hasConflicts && (
                    <div className="border border-red-300 bg-red-50 p-4 rounded">
                        <div className="font-semibold text-red-700 mb-2">
                            ⚠️ {context.conflicts.length}件のバリアント衝突
                        </div>
                        <div className="space-y-3">
                            {context.conflicts.map((conflict, idx) => (
                                <div key={idx} className="text-sm border-l-4 border-red-400 pl-3 py-2 bg-white rounded">
                                    <div className="font-mono text-xs mb-2 space-y-1">
                                        <div><strong>Type:</strong> {conflict.type}</div>
                                        <div><strong>Sealing:</strong> {conflict.sealing}</div>
                                        {conflict.damages && <div><strong>Damages:</strong> {conflict.damages}</div>}
                                        {conflict.storageLocation && <div><strong>保管場所:</strong> {conflict.storageLocation}</div>}
                                    </div>
                                    
                                    {/* 統合元のバリアント（削除候補） */}
                                    <div className="mb-2">
                                        <div className="text-xs text-gray-600 font-semibold mb-1">統合元（削除される側）</div>
                                        {conflict.fromVariants.map((v) => (
                                            <div key={v.variant_id} className="flex items-center justify-between gap-2 p-2 bg-gray-50 rounded mb-1">
                                                <div className="flex-1 text-xs">
                                                    <div className="font-mono">{v.variant_id}</div>
                                                    <div className="text-gray-500">数量: {v.quantity}</div>
                                                </div>
                                                {onForceDeleteVariant && (
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        onClick={() => handleForceDelete(
                                                            v.variant_id,
                                                            `${conflict.type} / ${conflict.sealing}`
                                                        )}
                                                        disabled={isProcessing}
                                                        className="text-xs h-7 px-2"
                                                    >
                                                        🗑️ 強制削除
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* 統合先のバリアント（保持） */}
                                    <div>
                                        <div className="text-xs text-gray-600 font-semibold mb-1">統合先（保持される側）</div>
                                        {conflict.toVariants.map((v) => (
                                            <div key={v.variant_id} className="flex items-center gap-2 p-2 bg-blue-50 rounded mb-1">
                                                <div className="flex-1 text-xs">
                                                    <div className="font-mono">{v.variant_id}</div>
                                                    <div className="text-gray-500">数量: {v.quantity}</div>
                                                </div>
                                                <Badge variant="outline" className="text-xs">保持</Badge>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ステータスメッセージ */}
                {statusMessage && (
                    <div className="text-sm p-3 bg-blue-50 border border-blue-200 rounded">
                        {statusMessage}
                    </div>
                )}

                {/* アクションボタン */}
                <div className="flex gap-2">
                    <Button
                        onClick={onExecute}
                        disabled={hasConflicts || isProcessing}
                        className="flex-1"
                        variant={hasConflicts ? 'outline' : 'default'}
                    >
                        {isProcessing ? '処理中...' : '統合を実行'}
                    </Button>
                    <Button
                        onClick={onCancel}
                        disabled={isProcessing}
                        variant="outline"
                    >
                        キャンセル
                    </Button>
                </div>

                {hasConflicts && (
                    <div className="text-xs text-gray-500 italic">
                        ※ 衝突を解決するまで統合を実行できません
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
