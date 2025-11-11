/**
 * 分類マスターデータ（タクソノミー）を取得するカスタムフック
 * 
 * 機能:
 * - /api/taxonomies から types, damages, sealings, categories, storages を取得
 * - Firestore の階層構造（documents/_subcollections/terms）を解析
 * - { id, label } 形式のオプション配列に変換
 * - 日本語のロケールでソート
 * 
 * 取得する分類:
 * - types: 商品タイプ（box, shrink, none など）
 * - damages: 破損タイプ（damage_a, damage_b など）
 * - sealings: シュリンク状態（no_shrink, with_shrink など）
 * - categories: 商品カテゴリ（ビジネス, 資格 など）
 * - storages: 保管場所（warehouse_a, office_b など）
 * 
 * 用途: フォームのドロップダウンやマルチセレクトで選択肢を表示する
 */

import { useEffect, useState } from 'react';

export type TaxonomyOption = { id: string; label: string };

export function useTaxonomies() {
    const [types, setTypes] = useState<TaxonomyOption[]>([]);
    const [damages, setDamages] = useState<TaxonomyOption[]>([]);
    const [sealings, setSealings] = useState<TaxonomyOption[]>([]);
    const [categories, setCategories] = useState<TaxonomyOption[]>([]);
    const [storages, setStorages] = useState<TaxonomyOption[]>([]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/taxonomies');
                if (!res.ok) return;
                const payload = await res.json();
                const docs = payload.documents || {};

                const typesDoc = docs['types'];
                const typesSub = typesDoc?._subcollections?.terms ?? typesDoc?._subcollections?.term ?? {};
                const typesTerms = Object.entries(typesSub);
                const mappedTypes = typesTerms.map(([slug, node]: any) => ({
                    id: String(node?._id ?? slug),
                    label: String(node?.label ?? slug),
                }));
                const nextTypes = mappedTypes.sort((a: any, b: any) => a.label.localeCompare(b.label, 'ja'));

                const damagesDoc = docs['damages'];
                const damagesSub = damagesDoc?._subcollections?.terms ?? damagesDoc?._subcollections?.term ?? {};
                const damagesTerms = Object.entries(damagesSub);
                const mappedDamages = damagesTerms.map(([slug, node]: any) => ({
                    id: String(node?._id ?? slug),
                    label: String(node?.label ?? slug),
                }));
                const nextDamages = mappedDamages.sort((a: any, b: any) => a.label.localeCompare(b.label, 'ja'));

                const sealingDoc = docs['sealing'];
                const sealingSub = sealingDoc?._subcollections?.terms ?? sealingDoc?._subcollections?.term ?? {};
                const sealingTerms = Object.entries(sealingSub);
                const mappedSealings = sealingTerms.map(([slug, node]: any) => ({
                    id: String(node?._id ?? slug),
                    label: String(node?.label ?? slug),
                }));
                const nextSealings = mappedSealings.sort((a: any, b: any) => a.label.localeCompare(b.label, 'ja'));

                const categoriesDoc = docs['categories'];
                const categoriesSub = categoriesDoc?._subcollections?.terms ?? categoriesDoc?._subcollections?.term ?? {};
                const categoriesTerms = Object.entries(categoriesSub);
                const mappedCategories = categoriesTerms.map(([slug, node]: any) => ({
                    id: String(node?._id ?? slug),
                    label: String(node?.label ?? slug),
                }));
                const nextCategories = mappedCategories.sort((a: any, b: any) => a.label.localeCompare(b.label, 'ja'));

                // final results prepared

                if (!cancelled) {
                    setTypes(prevTypes => {
                        // Only update if the data has actually changed
                        if (JSON.stringify(prevTypes) !== JSON.stringify(nextTypes)) {
                            return nextTypes;
                        }
                        return prevTypes;
                    });
                    setDamages(prevDamages => {
                        if (JSON.stringify(prevDamages) !== JSON.stringify(nextDamages)) {
                            return nextDamages;
                        }
                        return prevDamages;
                    });
                    setSealings(prevSealings => {
                        if (JSON.stringify(prevSealings) !== JSON.stringify(nextSealings)) {
                            return nextSealings;
                        }
                        return prevSealings;
                    });
                    setCategories(prevCategories => {
                        if (JSON.stringify(prevCategories) !== JSON.stringify(nextCategories)) {
                            return nextCategories;
                        }
                        return prevCategories;
                    });
                }

                // Fetch storage from root collection
                try {
                    const storageRes = await fetch('/api/storage');
                    if (storageRes.ok) {
                        const storagePayload = await storageRes.json();
                        const storageDocs = storagePayload.documents || {};
                        const storageEntries = Object.entries(storageDocs);
                        const mappedStorages = storageEntries
                            .filter(([docId]) => docId && docId.trim()) // 空文字列のidを除外
                            .map(([docId, doc]: any) => ({
                                id: docId,
                                label: String(doc?.label || doc?.name || docId),
                            }));
                        const nextStorages = mappedStorages.sort((a: any, b: any) => a.label.localeCompare(b.label, 'ja'));
                        // storage results prepared
                        if (!cancelled) {
                            setStorages(prevStorages => {
                                if (JSON.stringify(prevStorages) !== JSON.stringify(nextStorages)) {
                                    return nextStorages;
                                }
                                return prevStorages;
                            });
                        }
                    }
                } catch (err) {
                    console.error('Storage load error:', err);
                }
            } catch (err) {
                console.error('Taxonomy load error:', err);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    return { types, damages, sealings, categories, storages };
}
