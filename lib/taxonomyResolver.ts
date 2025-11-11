/**
 * Taxonomy解決ユーティリティ
 * 
 * 機能:
 * - ID ↔ Label の双方向マッピングを提供
 * - 候補配列からの自動解決
 * - 全分類タイプの統一的なインターフェース
 * 
 * 使用例:
 * ```typescript
 * const taxonomy = useTaxonomyResolver();
 * const typeId = taxonomy.resolve(group.types, 'types');
 * const typeLabel = taxonomy.getLabel('box', 'types');
 * ```
 */

import { useMemo, useCallback } from 'react';
import { useTaxonomies, type TaxonomyOption } from '@/app/admin/inventory/inventory-variants/components/hooks/useTaxonomies';

export type TaxonomyType = 'types' | 'damages' | 'sealings' | 'categories' | 'storages';

export interface BidirectionalMap {
    idToLabel: Map<string, string>;
    labelToId: Map<string, string>;
}

export interface TaxonomyMaps {
    types: BidirectionalMap;
    damages: BidirectionalMap;
    sealings: BidirectionalMap;
    categories: BidirectionalMap;
    storages: BidirectionalMap;
}

export interface TaxonomyResolver {
    maps: TaxonomyMaps;
    rawTaxonomies: {
        types: TaxonomyOption[];
        damages: TaxonomyOption[];
        sealings: TaxonomyOption[];
        categories: TaxonomyOption[];
        storages: TaxonomyOption[];
    };
    resolve: (candidates: string[] | undefined, type: TaxonomyType) => string;
    getLabel: (id: string, type: TaxonomyType) => string;
    getId: (label: string, type: TaxonomyType) => string;
}

/**
 * TaxonomyOptionの配列から双方向マップを作成
 */
function createBidirectionalMap(options: TaxonomyOption[]): BidirectionalMap {
    const idToLabel = new Map<string, string>();
    const labelToId = new Map<string, string>();

    options.forEach((item) => {
        idToLabel.set(item.id, item.label);
        labelToId.set(item.label, item.id);
    });

    return { idToLabel, labelToId };
}

/**
 * Taxonomy解決のカスタムフック
 * 
 * useTaxonomies()をベースに、ID/Label変換とマッピングを提供
 */
export function useTaxonomyResolver(): TaxonomyResolver {
    const taxonomies = useTaxonomies();

    // 全分類タイプの双方向マップを作成
    const maps = useMemo((): TaxonomyMaps => ({
        types: createBidirectionalMap(taxonomies.types),
        damages: createBidirectionalMap(taxonomies.damages),
        sealings: createBidirectionalMap(taxonomies.sealings),
        categories: createBidirectionalMap(taxonomies.categories),
        storages: createBidirectionalMap(taxonomies.storages),
    }), [taxonomies.types, taxonomies.damages, taxonomies.sealings, taxonomies.categories, taxonomies.storages]);

    /**
     * 候補配列から適切なIDを解決
     * 
     * @param candidates - ID or Labelの候補配列
     * @param type - 分類タイプ
     * @returns 解決されたID（見つからない場合は最初の候補または空文字）
     */
    const resolve = useCallback((candidates: string[] | undefined, type: TaxonomyType): string => {
        if (!candidates) return '';

        const { labelToId, idToLabel } = maps[type];
        let fallback = '';

        for (const candidate of candidates) {
            const trimmed = (candidate ?? '').trim();
            if (!trimmed) continue;
            if (!fallback) fallback = trimmed;

            // LabelからIDへの変換を試みる
            const mapped = labelToId.get(trimmed);
            if (mapped) return mapped;

            // すでにIDとして存在するか確認
            if (idToLabel.has(trimmed)) return trimmed;
        }

        return fallback;
    }, [maps]);

    /**
     * IDからLabelを取得
     */
    const getLabel = useCallback((id: string, type: TaxonomyType): string => {
        return maps[type].idToLabel.get(id) || id;
    }, [maps]);

    /**
     * LabelからIDを取得
     */
    const getId = useCallback((label: string, type: TaxonomyType): string => {
        return maps[type].labelToId.get(label) || label;
    }, [maps]);

    return {
        maps,
        rawTaxonomies: taxonomies,
        resolve,
        getLabel,
        getId
    };
}

/**
 * レガシー用: 個別のマップを取得
 * 
 * @deprecated 新規コードでは useTaxonomyResolver を使用してください
 */
export function useTaxonomyMaps() {
    const resolver = useTaxonomyResolver();
    return {
        typeIdToLabel: resolver.maps.types.idToLabel,
        typeLabelToId: resolver.maps.types.labelToId,
        damageIdToLabel: resolver.maps.damages.idToLabel,
        damageLabelToId: resolver.maps.damages.labelToId,
        sealingIdToLabel: resolver.maps.sealings.idToLabel,
        sealingLabelToId: resolver.maps.sealings.labelToId,
        categoryIdToLabel: resolver.maps.categories.idToLabel,
        categoryLabelToId: resolver.maps.categories.labelToId,
        storageIdToLabel: resolver.maps.storages.idToLabel,
        storageLabelToId: resolver.maps.storages.labelToId,
    };
}
