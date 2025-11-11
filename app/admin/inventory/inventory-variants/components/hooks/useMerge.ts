/**
 * 商品グループ統合処理用のカスタムフック
 * 
 * 機能:
 * - 同名商品グループの統合候補を自動検索
 * - バリアント衝突の検出（同じ type+sealing の組み合わせ）
 * - 統合実行（アーカイブ → 削除 → 参照更新）
 * - 統合後の自動リロード
 * 
 * 使用フロー:
 * 1. suggestMerge: 統合候補を検索（同名で在庫数が多いグループを優先）
 * 2. prepareMergeContext: 衝突検出して MergeContext を作成
 * 3. executeCurrentMerge: Firestore に統合操作を送信（API 経由）
 * 4. cancelMerge: 統合をキャンセル
 * 
 * 統合処理の詳細:
 * - 統合元グループを products_master_archive に保存
 * - 統合元グループを products_master から削除
 * - すべてのバリアントの variantGroupIdRef を統合先に更新
 * 
 * 用途: 商品名変更時に同名グループとの統合を提案・実行する
 */

import { useState, useCallback } from 'react';
import type { AggregatedProduct, MergeContext } from '../types';
import { prepareMerge, executeMerge, findMergeCandidates, selectBestMergeTarget } from '../logic/mergeUtils';

export function useMerge() {
    const [mergeContext, setMergeContext] = useState<MergeContext | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    /**
     * 統合候補を検索して提案
     */
    const suggestMerge = useCallback((
        currentGroup: AggregatedProduct,
        allGroups: AggregatedProduct[]
    ): AggregatedProduct | null => {
        const candidates = findMergeCandidates(currentGroup, allGroups);
        return selectBestMergeTarget(candidates);
    }, []);

    /**
     * 統合準備（衝突検出）
     */
    const prepareMergeContext = useCallback((
        fromGroup: AggregatedProduct,
        toGroup: AggregatedProduct
    ) => {
        const context = prepareMerge(fromGroup, toGroup);
        setMergeContext(context);
        
        if (context.conflicts.length > 0) {
            setStatusMessage(
                `⚠️ ${context.conflicts.length}件のバリアント衝突が検出されました。解決が必要です。`
            );
        } else {
            setStatusMessage('✅ 衝突なし。統合可能です。');
        }

        return context;
    }, []);

    /**
     * 統合実行
     */
    const executeCurrentMerge = useCallback(async () => {
        console.log('[useMerge.executeCurrentMerge] 🚀 Starting merge execution...');
        console.log('[useMerge.executeCurrentMerge] mergeContext:', mergeContext);
        
        if (!mergeContext) {
            console.error('[useMerge.executeCurrentMerge] ❌ No merge context available');
            setStatusMessage('エラー: 統合コンテキストがありません');
            return { success: false };
        }

        console.log('[useMerge.executeCurrentMerge] Merge details:', {
            from: mergeContext.fromGroup.variantGroupId,
            to: mergeContext.toGroup.variantGroupId,
            conflicts: mergeContext.conflicts.length,
        });

        setIsProcessing(true);
        setStatusMessage('統合処理を実行中...');

        try {
            console.log('[useMerge.executeCurrentMerge] Calling executeMerge...');
            const result = await executeMerge(mergeContext);
            console.log('[useMerge.executeCurrentMerge] executeMerge result:', result);
            setStatusMessage(result.message);

            if (result.success) {
                console.log('[useMerge.executeCurrentMerge] ✅ Merge successful, clearing context');
                setMergeContext(null);
            } else {
                console.error('[useMerge.executeCurrentMerge] ❌ Merge failed:', result.message);
            }

            return { success: result.success };
        } catch (error) {
            console.error('[useMerge.executeCurrentMerge] ❌ Exception during merge:', error);
            const errorMsg = `統合処理で例外が発生: ${error instanceof Error ? error.message : String(error)}`;
            setStatusMessage(errorMsg);
            return { success: false };
        } finally {
            console.log('[useMerge.executeCurrentMerge] Merge execution finished, setting isProcessing=false');
            setIsProcessing(false);
        }
    }, [mergeContext]);

    /**
     * 統合をキャンセル
     */
    const cancelMerge = useCallback(() => {
        setMergeContext(null);
        setStatusMessage('');
    }, []);

    return {
        mergeContext,
        isProcessing,
        statusMessage,
        suggestMerge,
        prepareMergeContext,
        executeCurrentMerge,
        cancelMerge,
    };
}
