'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
// inventory_variants: split modules
import { useProductSchema } from './components/hooks/useProductSchema';
import { useTaxonomies } from './components/hooks/useTaxonomies';
import { useTaxonomyResolver } from '@/lib/taxonomyResolver';
import { useMerge } from './components/hooks/useMerge';
import { initDraftsFromGroup, createVariantDraft, createProductDraft } from './components/hooks/useDrafts';
import {
    parseTypesInput,
    parseDamagesInput,
    parseSealingInput,
} from './components/utils';
import {
    collectDocsForActiveGroup,
    writeDocsToFirestore,
} from './logic/firestoreOperations';
import { buildVariantDoc } from './components/builders/firestoreBuilders';
import { diffVariant } from './components/logic/diffs';
import { ProductCard } from './components/components/ProductCard';
import { LoadingBar } from '../components/LoadingBar';
import { InventorySearchBar } from './components/InventorySearchBar';
import { useVariantDiffs } from './components/hooks/useVariantDiffs';
import { CsvImport } from './components/CsvImport';
import { Sidebar } from '../components/Sidebar';
import type {
    AggregatedProduct,
    AggregatedVariant,
    ProductDraft,
    VariantDraft,
    PendingDoc,
} from './components/types';

export default function InventoryVariantsPage() {
    const {
        data, generatedAt, loading, error, reload, setData,
        search, setSearch,
        categoryFilter, setCategoryFilter,
        typeFilter, setTypeFilter,
        typeOptions,
        filtered,
        showAll, setShowAll,
        displayCount, setDisplayCount,
        currentPage, setCurrentPage,
        totalPages,
        paginatedData,
    } = useProductSchema(); // Product Schema (3テーブル構造) を使用

    const { types: taxonomyTypes, damages: taxonomyDamages, sealings: taxonomySealings, categories: taxonomyCategories, storages: taxonomyStorages } = useTaxonomies();

    // Taxonomy解決システム (ID ↔ Label の双方向マッピング + 解決関数)
    const taxonomy = useTaxonomyResolver();

    // カテゴリーオプションをTaxonomiesから取得
    const categoryOptions = useMemo(() => {
        return taxonomyCategories.map(cat => ({ id: cat.id, label: cat.label }));
    }, [taxonomyCategories]);

    // 検索結果に存在するカテゴリーのみをフィルタリング
    const availableCategoryOptions = useMemo(() => {
        if (!search) {
            // 検索していない場合は全カテゴリーを表示
            return categoryOptions;
        }

        // 現在のデータから実際に存在するカテゴリーIDを収集
        const existingCategoryIds = new Set<string>();
        data.forEach(group => {
            if (group.category) {
                existingCategoryIds.add(group.category);
            }
        });

        // 存在するカテゴリーのみをフィルタリング
        return categoryOptions.filter(option => existingCategoryIds.has(option.id));
    }, [categoryOptions, data, search]);

    // Column definitions shared for edit/read table headers
    const columnLabels: Record<string, string> = {
        variant_sku: 'バリアントSKU',
        inventory_id: '在庫ID',
        types: 'タイプ',
        damages: 'ダメージ',
        sealing: 'シーリング',
        storage: '保管場所',
        quantity: '在庫数',
        unit_price: '単価',
        status: 'ステータス',
        barcode: 'バーコード',
        notes: '備考',
        timestamps: 'タイムスタンプ',
        updated: '更新日時',
    };
    const editColumns = [
        'variant_sku',
        'inventory_id',
        'types',
        'damages',
        'sealing',
        'storage',
        'quantity',
        'unit_price',
        'status',
        'barcode',
        'notes',
        'timestamps',
    ];
    const readColumns = [
        'variant_sku',
        'inventory_id',
        'types',
        'damages',
        'sealing',
        'storage',
        'quantity',
        'unit_price',
        'status',
        'barcode',
        'updated',
    ];

    const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
    const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
    const [productDraft, setProductDraft] = useState<ProductDraft | null>(null);
    const [variantDrafts, setVariantDrafts] = useState<Record<string, VariantDraft>>({});
    const [statusMessage, setStatusMessage] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [resetKey, setResetKey] = useState(0); // 保存後に編集行をリセットするためのキー

    // 新しい統合システムを使用
    const merge = useMerge();
    // フックから必要なメソッドだけ取り出して依存配列の安定化を図る
    const {
        mergeContext,
        isProcessing: mergeIsProcessing,
        statusMessage: mergeStatusMessage,
        suggestMerge,
        prepareMergeContext,
        executeCurrentMerge,
        cancelMerge,
    } = merge;

    // replaced local data/taxonomy fetching and option/filter memos with hooks

    const activeGroup = useMemo(
        () => filtered.find((item) => item.variantGroupId === activeGroupId) ?? null,
        [filtered, activeGroupId],
    );

    // Memoize taxonomy methods to prevent infinite re-renders
    const taxonomyResolve = useMemo(() => taxonomy.resolve, [taxonomy.resolve]);

    // draft initialization now centralized in inventory_variants/hooks/useDrafts

    useEffect(() => {
        console.log('[Draft initialization useEffect]', {
            hasActiveGroup: !!activeGroup,
            activeGroupId,
            variantCount: activeGroup?.variants.length,
        });

        if (!activeGroup) {
            setProductDraft(null);
            setVariantDrafts({});
            cancelMerge();
            return;
        }
        const typeId = taxonomyResolve(activeGroup.types || [], 'types');
        const damageId = taxonomyResolve(activeGroup.damages || [], 'damages');
        const sealingId = taxonomyResolve(activeGroup.sealing || [], 'sealings');
        const categoryId = taxonomyResolve([activeGroup.category], 'categories');

        // Get the most common storage location from variants
        const storageLocations = activeGroup.variants
            .map(v => v.storageLocation)
            .filter(s => s && s.trim());
        const storageId = storageLocations.length > 0
            ? taxonomyResolve([storageLocations[0]], 'storages')
            : '';



        const { product, variants } = initDraftsFromGroup(activeGroup);
        console.log('[Draft initialization] Created drafts:', {
            variantGroupId: activeGroup.variantGroupId,
            variantDraftKeys: Object.keys(variants),
            variantDraftCount: Object.keys(variants).length,
        });

        product.typesInput = typeId;
        product.damagesInput = damageId;
        product.sealingInput = sealingId;
        product.categoryInput = categoryId;
        product.storageInput = storageId;

        setProductDraft(product);
        setVariantDrafts(variants);
    }, [
        activeGroup,
        activeGroupId,
        taxonomyResolve,
        cancelMerge,
    ]);

    // 商品名が変更されたときに統合候補を提案
    useEffect(() => {
        console.log('[useMerge useEffect] Triggered', {
            hasActiveGroup: !!activeGroup,
            hasProductDraft: !!productDraft,
            hasData: !!data,
            activeGroupId: activeGroup?.variantGroupId,
        });

        if (!activeGroup || !productDraft || !data) return;
        const newName = String(productDraft.productName || '').trim();
        const oldName = String(activeGroup.productName || '').trim();

        console.log('[useMerge useEffect] Comparing names:', {
            newName,
            oldName,
            areEqual: newName === oldName,
        });

        // 商品名が変更されていない場合は何もしない
        if (!newName || newName === oldName) {
            console.log('[useMerge useEffect] Names match or empty, canceling merge');
            cancelMerge();
            return;
        }

        console.log('[useMerge useEffect] Names differ, searching for merge candidates...');

        // 変更後の商品名で統合候補を検索
        const candidateWithNewName: AggregatedProduct = {
            ...activeGroup,
            productName: newName,
        };

        const targetGroup = suggestMerge(candidateWithNewName, data);
        if (targetGroup) {
            console.log('[useMerge] 統合候補が見つかりました:', targetGroup.productName, targetGroup.variantGroupId);
            prepareMergeContext(activeGroup, targetGroup);
        } else {
            console.log('[useMerge] 統合候補が見つかりませんでした。新しい商品名:', newName);
            cancelMerge();
        }
    }, [productDraft, activeGroup, data, suggestMerge, prepareMergeContext, cancelMerge]);

    const { productDiffFields, variantDiffs } = useVariantDiffs(activeGroup, productDraft, variantDrafts);

    // 編集中かどうかを判定（変更がある場合はボトムバーを表示）
    const hasChanges = useMemo(() => {
        if (!activeGroup || !productDraft) return false;
        return productDiffFields.length > 0 || variantDiffs.length > 0;
    }, [activeGroup, productDraft, productDiffFields, variantDiffs]);



    const handleToggleExpand = async (groupId: string) => {
        if (expandedGroupId === groupId) {
            // 展開を閉じる - 編集中の場合は確認
            if (activeGroupId === groupId && hasChanges) {
                const action = await showSaveConfirmDialog();
                if (action === 'cancel') return;
                if (action === 'save') {
                    await handleSaveNow();
                }
                // 'discard' の場合はそのまま閉じる
                setActiveGroupId(null);
                setProductDraft(null);
                setVariantDrafts({});
                cancelMerge();
            }
            setExpandedGroupId(null);
            return;
        }

        // 新しいグループを展開
        setExpandedGroupId(groupId);
        const targetGroup = filtered.find((item) => item.variantGroupId === groupId);
        if (!targetGroup) return;

        // variants が空配列の場合は詳細データを取得
        if (targetGroup.variants.length === 0) {
            setStatusMessage(`${targetGroup.displayName || targetGroup.productName} の詳細を読み込み中...`);

            // 詳細データを取得
            fetch(`/api/inventory-variants?variantGroupId=${groupId}`)
                .then(res => {
                    if (!res.ok) {
                        return res.text().then(text => {
                            console.error('[handleToggleExpand] API error response:', text);
                            throw new Error(`API error: ${res.status} - ${text}`);
                        });
                    }
                    return res.json();
                })
                .then(payload => {
                    if (payload.items && payload.items.length > 0) {
                        const detailedGroup = payload.items[0];
                        // data 内の該当グループを詳細データで更新
                        setData(prevData =>
                            prevData.map(g =>
                                g.variantGroupId === groupId
                                    ? {
                                        ...g,
                                        variants: (detailedGroup.variants || []).map((v: any) => ({
                                            inventoryId: v.inventoryId,
                                            variantSku: v.variantSku,
                                            types: v.types,
                                            damages: v.damages,
                                            sealing: v.sealing,
                                            storageLocation: v.storageLocation,
                                            quantity: v.quantity,
                                            unitPrice: v.unitPrice,
                                            statusTokens: v.statusTokens,
                                            barcode: v.barcode,
                                            notes: v.notes,
                                            updatedAt: v.updatedAt,
                                            createdAt: v.createdAt,
                                        })),
                                    }
                                    : g
                            )
                        );
                        setStatusMessage('');
                    }
                })
                .catch(err => {
                    console.error('[handleToggleExpand] Failed to fetch group details:', err);
                    setStatusMessage(`詳細の取得に失敗しました: ${err.message}`);
                    setExpandedGroupId(null);
                });
        }

        // DOMの更新を待ってからスクロール（ヘッダー分のオフセットを追加）
        setTimeout(() => {
            const element = document.getElementById(`product-card-${groupId}`);
            if (element) {
                const headerOffset = 230; // ヘッダー + サブヘッダー + 余白
                const elementPosition = element.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        }, 100);
    };

    // 保存確認ダイアログを表示
    const showSaveConfirmDialog = (): Promise<'save' | 'discard' | 'cancel'> => {
        return new Promise((resolve) => {
            const result = window.confirm(
                '編集中の内容があります。\n\n' +
                'OK: 保存して閉じる\n' +
                'キャンセル: 変更を破棄して閉じる\n\n' +
                '※このダイアログをキャンセルすると、開いたままになります。'
            );
            if (result) {
                resolve('save');
            } else {
                // キャンセルボタンを押した場合、破棄するか確認
                const discard = window.confirm('変更を破棄して閉じますか？');
                resolve(discard ? 'discard' : 'cancel');
            }
        });
    };

    const handleToggleEdit = async (groupId: string) => {
        if (activeGroupId === groupId) {
            // 編集モードを閉じる - 変更がある場合は確認
            if (hasChanges) {
                const action = await showSaveConfirmDialog();
                if (action === 'cancel') return;
                if (action === 'save') {
                    await handleSaveNow();
                }
                // 'discard' の場合はそのまま閉じる
            }
            setActiveGroupId(null);
            setProductDraft(null);
            setVariantDrafts({});
            cancelMerge();
        } else {
            // 編集モードを開く
            const targetGroup = filtered.find((item) => item.variantGroupId === groupId);
            if (!targetGroup) return;

            // 展開状態も確保
            if (expandedGroupId !== groupId) {
                setExpandedGroupId(groupId);
            }

            // variants が空配列の場合は詳細データを取得してから編集モードへ
            if (targetGroup.variants.length === 0) {
                setStatusMessage(`${targetGroup.displayName || targetGroup.productName} の詳細を読み込み中...`);

                // 詳細データを取得
                fetch(`/api/inventory-variants?variantGroupId=${groupId}`)
                    .then(res => {
                        if (!res.ok) {
                            return res.text().then(text => {
                                console.error('[handleToggleEdit] API error response:', text);
                                throw new Error(`API error: ${res.status} - ${text}`);
                            });
                        }
                        return res.json();
                    })
                    .then(payload => {
                        if (payload.items && payload.items.length > 0) {
                            const detailedGroup = payload.items[0];
                            // data 内の該当グループを詳細データで更新
                            setData(prevData =>
                                prevData.map(g =>
                                    g.variantGroupId === groupId
                                        ? {
                                            ...g,
                                            variants: (detailedGroup.variants || []).map((v: any) => ({
                                                inventoryId: v.inventoryId,
                                                variantSku: v.variantSku,
                                                types: v.types,
                                                damages: v.damages,
                                                sealing: v.sealing,
                                                storageLocation: v.storageLocation,
                                                quantity: v.quantity,
                                                unitPrice: v.unitPrice,
                                                statusTokens: v.statusTokens,
                                                barcode: v.barcode,
                                                notes: v.notes,
                                                updatedAt: v.updatedAt,
                                                createdAt: v.createdAt,
                                            })),
                                        }
                                        : g
                                )
                            );

                            // 更新されたグループを取得してドラフトを初期化
                            const updatedGroup = {
                                ...targetGroup,
                                variants: (detailedGroup.variants || []).map((v: any) => ({
                                    inventoryId: v.inventoryId,
                                    variantSku: v.variantSku,
                                    types: v.types,
                                    damages: v.damages,
                                    sealing: v.sealing,
                                    storageLocation: v.storageLocation,
                                    quantity: v.quantity,
                                    unitPrice: v.unitPrice,
                                    statusTokens: v.statusTokens,
                                    barcode: v.barcode,
                                    notes: v.notes,
                                    updatedAt: v.updatedAt,
                                    createdAt: v.createdAt,
                                })),
                            };

                            // ドラフトを明示的に初期化
                            const typeId = taxonomy.resolve(updatedGroup.types || [], 'types');
                            const damageId = taxonomy.resolve(updatedGroup.damages || [], 'damages');
                            const sealingId = taxonomy.resolve(updatedGroup.sealing || [], 'sealings');
                            const categoryId = taxonomy.resolve([updatedGroup.category], 'categories');
                            const storageLocations = updatedGroup.variants
                                .map(v => v.storageLocation)
                                .filter(s => s && s.trim());
                            const storageId = storageLocations.length > 0
                                ? taxonomy.resolve([storageLocations[0]], 'storages')
                                : '';

                            const { product, variants } = initDraftsFromGroup(updatedGroup);
                            product.typesInput = typeId;
                            product.damagesInput = damageId;
                            product.sealingInput = sealingId;
                            product.categoryInput = categoryId;
                            product.storageInput = storageId;

                            setProductDraft(product);
                            setVariantDrafts(variants);

                            // ドラフト初期化後に編集モードに入る
                            setActiveGroupId(groupId);
                            setStatusMessage('');
                        }
                    })
                    .catch(err => {
                        console.error('[handleToggleEdit] Failed to fetch group details:', err);
                        setStatusMessage(`詳細の取得に失敗しました: ${err.message}`);
                        setExpandedGroupId(null);
                    });
            } else {
                // variants が既にある場合は通常通り編集モードへ
                // useEffect でドラフトが初期化されるのでそのまま activeGroupId を設定
                setActiveGroupId(groupId);
            }

            // DOMの更新を待ってからスクロール（ヘッダー分のオフセットを追加）
            setTimeout(() => {
                const element = document.getElementById(`product-card-${groupId}`);
                if (element) {
                    const headerOffset = 180; // ヘッダー + サブヘッダー + 余白
                    const elementPosition = element.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                    window.scrollTo({
                        top: offsetPosition,
                        behavior: 'smooth'
                    });
                }
            }, 100);
        }
    };

    const syncVariantDrafts = (fields: { types?: string; damages?: string; sealing?: string; storage?: string }) => {
        const hasSyncFields = fields.types !== undefined || fields.damages !== undefined || fields.sealing !== undefined || fields.storage !== undefined;
        if (!hasSyncFields) return;

        setVariantDrafts((prev) => {
            let mutated = false;
            const next: Record<string, VariantDraft> = {};

            Object.entries(prev).forEach(([key, draft]) => {
                let draftChanged = draft;

                if (fields.types !== undefined && draft.types !== fields.types) {
                    draftChanged = draftChanged === draft ? { ...draftChanged } : draftChanged;
                    draftChanged.types = fields.types;
                    mutated = true;
                }

                if (fields.damages !== undefined && draft.damages !== fields.damages) {
                    draftChanged = draftChanged === draft ? { ...draftChanged } : draftChanged;
                    draftChanged.damages = fields.damages;
                    mutated = true;
                }

                if (fields.sealing !== undefined && draft.sealing !== fields.sealing) {
                    draftChanged = draftChanged === draft ? { ...draftChanged } : draftChanged;
                    draftChanged.sealing = fields.sealing;
                    mutated = true;
                }

                if (fields.storage !== undefined && draft.storageLocation !== fields.storage) {
                    draftChanged = draftChanged === draft ? { ...draftChanged } : draftChanged;
                    draftChanged.storageLocation = fields.storage;
                    mutated = true;
                }

                next[key] = draftChanged;
            });

            return mutated ? next : prev;
        });
    };

    const handleProductDraftChange = (patch: Partial<ProductDraft>) => {
        setProductDraft((prev) => {
            if (!prev) return prev;

            const updated: ProductDraft = { ...prev, ...patch };
            const syncFields: { types?: string; damages?: string; sealing?: string; storage?: string } = {};

            if (patch.typesInput !== undefined) {
                const [normalizedType = ''] = parseTypesInput(updated.typesInput);
                if (normalizedType !== updated.typesInput) {
                    updated.typesInput = normalizedType;
                }
                syncFields.types = updated.typesInput;
            }

            if (patch.damagesInput !== undefined) {
                const [normalizedDamage = ''] = parseDamagesInput(updated.damagesInput);
                if (normalizedDamage !== updated.damagesInput) {
                    updated.damagesInput = normalizedDamage;
                }
                syncFields.damages = updated.damagesInput;
            }

            if (patch.sealingInput !== undefined) {
                const [normalizedSealing = ''] = parseSealingInput(updated.sealingInput);
                if (normalizedSealing !== updated.sealingInput) {
                    updated.sealingInput = normalizedSealing;
                }
                syncFields.sealing = updated.sealingInput;
            }

            if (patch.categoryInput !== undefined) {
                const trimmed = updated.categoryInput.trim();
                if (trimmed !== updated.categoryInput) {
                    updated.categoryInput = trimmed;
                }
                // categoryにはtaxonomy IDを保存（日本語ラベルではない）
                if (trimmed !== updated.category) {
                    updated.category = trimmed;
                }
            }

            if (patch.storageInput !== undefined) {
                const trimmed = updated.storageInput.trim();
                if (trimmed !== updated.storageInput) {
                    updated.storageInput = trimmed;
                }
                syncFields.storage = updated.storageInput;
            }

            if (syncFields.types !== undefined || syncFields.damages !== undefined || syncFields.sealing !== undefined || syncFields.storage !== undefined) {
                syncVariantDrafts(syncFields);
            }


            return updated;
        });
    };

    const handleVariantDraftChange = (key: string, patch: Partial<VariantDraft>) => {
        console.log('[handleVariantDraftChange] Called:', {
            key,
            patch,
            currentDrafts: Object.keys(variantDrafts),
            hasDraft: !!variantDrafts[key],
        });

        setVariantDrafts((prev) => {
            const current = prev[key];

            // draft が存在しない場合、activeGroup または expanded group から該当バリアントを探して draft を作成
            if (!current) {
                console.warn('[handleVariantDraftChange] No draft found, creating new draft for key:', key);

                // activeGroup が null の場合（expanded mode のみ）は filtered から探す
                let variant: AggregatedVariant | undefined;

                if (activeGroup) {
                    variant = activeGroup.variants.find(v => String(v.inventoryId) === key);
                } else if (expandedGroupId) {
                    // expanded mode: filtered から該当グループを探す
                    const expandedGroup = filtered.find(item => item.variantGroupId === expandedGroupId);
                    if (expandedGroup) {
                        variant = expandedGroup.variants.find(v => String(v.inventoryId) === key);
                    }
                }

                if (!variant) {
                    console.error('[handleVariantDraftChange] ❌ Variant not found:', {
                        key,
                        activeGroupId,
                        expandedGroupId,
                        hasActiveGroup: !!activeGroup,
                    });
                    return prev;
                }

                // 新しい draft を作成
                const newDraft = createVariantDraft(variant);

                console.log('[handleVariantDraftChange] ✅ Created new draft:', {
                    key,
                    draft: newDraft,
                });

                return {
                    ...prev,
                    [key]: { ...newDraft, ...patch },
                };
            }

            const updated = {
                ...prev,
                [key]: { ...current, ...patch },
            };

            console.log('[handleVariantDraftChange] ✅ Updated draft:', {
                key,
                before: current,
                after: updated[key],
            });

            return updated;
        });
    };

    const handleResetDrafts = () => {
        if (!activeGroup) return;
        const typeId = taxonomy.resolve(activeGroup.types || [], 'types');
        const damageId = taxonomy.resolve(activeGroup.damages || [], 'damages');
        const sealingId = taxonomy.resolve(activeGroup.sealing || [], 'sealings');
        const categoryId = taxonomy.resolve([activeGroup.category], 'categories');

        // Get the most common storage location from variants
        const storageLocations = activeGroup.variants
            .map(v => v.storageLocation)
            .filter(s => s && s.trim());
        const storageId = storageLocations.length > 0
            ? taxonomy.resolve([storageLocations[0]], 'storages')
            : '';

        const { product, variants } = initDraftsFromGroup(activeGroup);
        product.typesInput = typeId;
        product.damagesInput = damageId;
        product.sealingInput = sealingId;
        product.categoryInput = categoryId;
        product.storageInput = storageId;

        setProductDraft(product);
        setVariantDrafts(variants);
        setStatusMessage('編集中の内容を元のデータへ戻しました。');
    };

    // バリアント強制削除ハンドラ
    const handleForceDeleteVariant = async (variantSku: string) => {
        try {
            console.log('[handleForceDeleteVariant] Deleting variant:', variantSku);
            setStatusMessage(`バリアント ${variantSku} を削除中...`);

            // inventoriesMasterから該当バリアントを削除
            const pendingDoc: PendingDoc = {
                collection: 'inventoriesMaster',
                doc: {
                    id: variantSku,
                    data: {
                        _deleteDoc: true,
                    },
                },
                summary: `Force delete variant: ${variantSku}`,
            };

            const result = await writeDocsToFirestore([pendingDoc]);

            if (result.failures.length === 0) {
                console.log('[handleForceDeleteVariant] ✅ Variant deleted successfully');
                setStatusMessage(`バリアント ${variantSku} を削除しました。データをリロードしています...`);

                // データをリロード
                reload();

                // マージコンテキストを再生成（衝突が解決された可能性がある）
                if (mergeContext) {
                    const fromGroupUpdated = filtered.find(g => g.variantGroupId === mergeContext.fromGroup.variantGroupId);
                    const toGroupUpdated = filtered.find(g => g.variantGroupId === mergeContext.toGroup.variantGroupId);

                    if (fromGroupUpdated && toGroupUpdated) {
                        setTimeout(() => {
                            prepareMergeContext(fromGroupUpdated, toGroupUpdated);
                        }, 1000); // リロード完了を待つ
                    }
                }
            } else {
                const failureMsg = result.failures.map(f => f.reason).join(', ');
                throw new Error(`削除に失敗しました: ${failureMsg}`);
            }
        } catch (error) {
            console.error('[handleForceDeleteVariant] ❌ Error:', error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`削除エラー: ${errorMsg}`);
            alert(`削除に失敗しました: ${errorMsg}`);
        }
    };

    const refreshGroupData = useCallback(async (
        savedGroupId: string,
        {
            originalGroupId,
            isGroupMerge = false,
            shouldActivate = true,
        }: {
            originalGroupId?: string;
            isGroupMerge?: boolean;
            shouldActivate?: boolean;
        } = {}
    ) => {
        console.log('[refreshGroupData] Fetching updated group:', savedGroupId);

        try {
            const res = await fetch(`/api/inventory-variants?variantGroupId=${savedGroupId}`);
            if (!res.ok) {
                const detail = await res.text();
                console.warn('[refreshGroupData] Failed to fetch group:', detail);
                reload();
                return null;
            }

            const payload = await res.json();
            if (!payload.items || payload.items.length === 0) {
                console.warn('[refreshGroupData] No items returned for group:', savedGroupId);
                return null;
            }

            const updatedGroupData = payload.items[0];
            console.log('[refreshGroupData] Updated group data:', {
                variantGroupId: updatedGroupData.variantGroupId,
                variantsCount: updatedGroupData.variants?.length,
            });

            const normalizedGroup: AggregatedProduct = {
                docid: updatedGroupData.docid,
                variantGroupId: updatedGroupData.variantGroupId,
                seriesId: updatedGroupData.seriesId ?? undefined,
                productName: updatedGroupData.productName,
                vol: updatedGroupData.vol ?? undefined,
                displayName: updatedGroupData.displayName ?? undefined,
                releaseDate: updatedGroupData.releaseDate ?? undefined,
                category: updatedGroupData.category || '',
                types: Array.isArray(updatedGroupData.types)
                    ? updatedGroupData.types.filter(Boolean)
                    : updatedGroupData.types
                        ? [updatedGroupData.types].filter(Boolean)
                        : [],
                damages: Array.isArray(updatedGroupData.damages)
                    ? updatedGroupData.damages.filter(Boolean)
                    : updatedGroupData.damages
                        ? [updatedGroupData.damages].filter(Boolean)
                        : [],
                sealing: Array.isArray(updatedGroupData.sealing)
                    ? updatedGroupData.sealing.filter(Boolean)
                    : updatedGroupData.sealing
                        ? [updatedGroupData.sealing].filter(Boolean)
                        : [],
                totalQuantity: Number(updatedGroupData.totalQuantity ?? 0),
                variants: (updatedGroupData.variants || []).map((v: any): AggregatedVariant => ({
                    inventoryId: String(v.inventoryId ?? ''),
                    variantSku: String(v.variantSku ?? ''),
                    types: typeof v.types === 'string' ? v.types : Array.isArray(v.types) ? v.types.join('|') : '',
                    damages: typeof v.damages === 'string' ? v.damages : Array.isArray(v.damages) ? v.damages.join('|') : '',
                    sealing: typeof v.sealing === 'string' ? v.sealing : Array.isArray(v.sealing) ? v.sealing.join('|') : '',
                    storageLocation: typeof v.storageLocation === 'string' ? v.storageLocation : Array.isArray(v.storageLocation) ? v.storageLocation[0] : '',
                    quantity: typeof v.quantity === 'number' ? v.quantity : Number(v.quantity ?? 0),
                    unitPrice: v.unitPrice === null || v.unitPrice === undefined ? null : Number(v.unitPrice),
                    statusTokens: Array.isArray(v.statusTokens)
                        ? v.statusTokens.join('|')
                        : typeof v.statusTokens === 'string'
                            ? v.statusTokens
                            : '',
                    barcode: String(v.barcode ?? ''),
                    notes: String(v.notes ?? ''),
                    updatedAt: String(v.updatedAt ?? ''),
                    createdAt: String(v.createdAt ?? ''),
                })),
            };

            setData((prevData) => {
                if (isGroupMerge && originalGroupId) {
                    const filteredData = prevData.filter((group) => (
                        group.variantGroupId !== originalGroupId && group.variantGroupId !== savedGroupId
                    ));
                    return [...filteredData, normalizedGroup];
                }

                let replaced = false;
                const next = prevData.map((group) => {
                    if (group.variantGroupId === savedGroupId) {
                        replaced = true;
                        return normalizedGroup;
                    }
                    return group;
                });

                if (!replaced) {
                    next.push(normalizedGroup);
                }

                return next;
            });

            const { product: refreshedProduct, variants: refreshedVariants } = initDraftsFromGroup(normalizedGroup);
            if (shouldActivate) {
                setProductDraft(refreshedProduct);
                setVariantDrafts(refreshedVariants);
                setActiveGroupId(normalizedGroup.variantGroupId);
            }
            setResetKey(prev => prev + 1);

            return normalizedGroup;
        } catch (error) {
            console.error('[refreshGroupData] ❌ Error fetching updated group:', error);
            reload();
            return null;
        }
    }, [reload, setActiveGroupId, setData, setProductDraft, setVariantDrafts, setResetKey]);

    // 個別バリアント保存
    const handleSaveSingleVariant = async (inventoryId: string) => {
        console.log('[handleSaveSingleVariant] Starting save for:', inventoryId);

        const draft = variantDrafts[inventoryId];
        if (!draft) {
            setStatusMessage('保存対象のドラフトが見つかりません。');
            return;
        }

        // 該当バリアントを探す
        let variant: AggregatedVariant | undefined;
        let targetGroup: AggregatedProduct | null = null;
        let groupId: string | null = null;

        if (activeGroup) {
            variant = activeGroup.variants.find(v => String(v.inventoryId) === inventoryId);
            targetGroup = activeGroup;
            groupId = activeGroup.variantGroupId;
        } else if (expandedGroupId) {
            const expandedGroup = filtered.find(item => item.variantGroupId === expandedGroupId);
            if (expandedGroup) {
                variant = expandedGroup.variants.find(v => String(v.inventoryId) === inventoryId);
                targetGroup = expandedGroup;
                groupId = expandedGroup.variantGroupId;
            }
        }

        if (!variant || !targetGroup) {
            setStatusMessage('保存対象のバリアントが見つかりません。');
            return;
        }

        const variantDiff = diffVariant(variant, draft);
        if (!variantDiff) {
            setStatusMessage('変更がありません。');
            return;
        }

        const effectiveProductDraft = activeGroup && productDraft && activeGroup.variantGroupId === groupId
            ? productDraft
            : createProductDraft(targetGroup);

        const variantDoc = buildVariantDoc(
            targetGroup,
            effectiveProductDraft,
            draft,
            variantDiff.changedFields,
            taxonomy
        );

        const docs: PendingDoc[] = [variantDoc];

        console.log('[handleSaveSingleVariant] Saving document:', docs[0]);

        setIsUploading(true);
        setStatusMessage('保存しています...');

        try {
            const result = await writeDocsToFirestore(docs);
            console.log('[handleSaveSingleVariant] Save result:', result);

            if (result.failures.length > 0) {
                const detail = result.failures
                    .map((failure) => `${failure.collection}/${failure.id ?? '—'}: ${failure.reason}`)
                    .join(' | ');
                console.error('[handleSaveSingleVariant] ❌ Write failed:', detail);
                setStatusMessage(`保存に失敗しました: ${detail}`);
                return;
            }

            console.log('[handleSaveSingleVariant] ✅ Save successful');
            setStatusMessage('保存しました。データを更新しています...');

            await new Promise(resolve => setTimeout(resolve, 300));

            if (groupId) {
                const shouldActivate = activeGroup?.variantGroupId === groupId;
                const updatedGroup = await refreshGroupData(groupId, {
                    originalGroupId: groupId,
                    shouldActivate,
                });
                if (updatedGroup) {
                    if (!shouldActivate) {
                        setVariantDrafts(prev => {
                            const next = { ...prev };
                            delete next[inventoryId];
                            return next;
                        });
                    }
                    setStatusMessage('保存が完了しました。');
                    setTimeout(() => setStatusMessage(''), 2000);
                } else {
                    setStatusMessage('保存しましたが、表示���更新に失敗しました。リロードしてください。');
                }
            } else {
                console.warn('[handleSaveSingleVariant] groupId is missing after save.');
            }
        } catch (error) {
            console.error('[handleSaveSingleVariant] ❌ Error:', error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`保存エラー: ${errorMsg}`);
        } finally {
            setIsUploading(false);
        }
    };

    const handleSaveNow = async () => {
        if (!activeGroup) {
            setStatusMessage('保存対象のグループが選択されていません。');
            return;
        }

        const { docs, updatedGroup } = collectDocsForActiveGroup(
            activeGroup,
            productDraft!,
            variantDrafts,
            productDiffFields,
            variantDiffs,
            taxonomy
        );
        if (!updatedGroup) {
            setStatusMessage('保存対象のグループが選択されていません。');
            return;
        }
        if (docs.length === 0) {
            setStatusMessage('保存対象の変更がありませんでした。');
            return;
        }

        console.log('[handleSaveNow] 🚀 Starting save operation');
        console.log('[handleSaveNow] Total docs to save:', docs.length);
        console.log('[handleSaveNow] Docs breakdown:',
            docs.reduce<Record<string, number>>((acc, doc) => {
                acc[doc.collection] = (acc[doc.collection] || 0) + 1;
                return acc;
            }, {})
        );

        // 保存対象のグループIDを記憶（統合の場合、新旧両方のIDを保持）
        const savedGroupId = updatedGroup.variantGroupId;
        const originalGroupId = activeGroup.variantGroupId;
        const isGroupMerge = savedGroupId !== originalGroupId;

        console.log('[handleSaveNow] Group IDs:', {
            original: originalGroupId,
            saved: savedGroupId,
            isGroupMerge,
        });

        setIsUploading(true);
        setStatusMessage('Firestore へ保存しています…');
        try {
            console.log('[handleSaveNow] Calling writeDocsToFirestore...');
            const result = await writeDocsToFirestore(docs);
            console.log('[handleSaveNow] writeDocsToFirestore completed:', result);

            if (result.failures.length > 0) {
                const detail = result.failures
                    .map((failure) => `${failure.collection}/${failure.id ?? '—'}: ${failure.reason}`)
                    .join(' | ');
                console.error('[handleSaveNow] ❌ Some writes failed:', detail);
                setStatusMessage(`一部の書き込みに失敗しました: ${detail}`);
                return;
            }

            if (!activeGroup) {
                setStatusMessage('保存対象のグループが選択されていません。');
                return;
            }

            console.log('[handleSaveNow] ✅ All writes successful');
            console.log('[handleSaveNow] Resetting drafts after successful save...');

            // 保存成功後は編集モードを維持してデータを更新
            setStatusMessage(`保存が完了しました（${result.written} 件）。データを更新しています...`);

            // Firestoreの書き込みが完全に反映されるまで少し待機
            await new Promise(resolve => setTimeout(resolve, 500));

            // 保存したグループだけを再取得して更新（全データリロードを避ける）
            console.log('[handleSaveNow] Fetching updated group:', savedGroupId);
            console.log('[handleSaveNow] Is group merge:', isGroupMerge);

            const updatedGroup = await refreshGroupData(savedGroupId, {
                originalGroupId,
                isGroupMerge,
            });

            if (updatedGroup) {
                setStatusMessage(`保存が完了しました（${result.written} 件）。データを更新しました。`);
            } else {
                setStatusMessage('保存しましたが、表示の更新に失敗しました。リロードしてください。');
            }
        } catch (error) {
            console.error('[handleSaveNow] ❌ Caught exception in handleSaveNow:', error);
            if (error instanceof Error) {
                console.error('[handleSaveNow] error.name:', error.name);
                console.error('[handleSaveNow] error.message:', error.message);
                console.error('[handleSaveNow] error.stack:', error.stack);
            }
            const errorMsg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`保存中にエラーが発生しました: ${errorMsg}`);
            alert(`保存エラー: ${errorMsg}\n\nブラウザのコンソールとネットワークタブを確認してください。`);
        } finally {
            setIsUploading(false);
        }
    };


    return (
        <div className="flex min-h-screen">
            {/* 左サイドバー - 完全に左端に固定 */}
            <Sidebar activeItem="inventory" />

            {/* メインコンテンツエリア - サイドバー以外の全幅を使用 */}
            <main className="flex-1 bg-gray-50">
                {/* サブヘッダー - ヘッダーの下に固定、半透明 */}
                <div className="sticky top-[73px] z-30 w-screen -ml-20 bg-white/95 backdrop-blur supports-backdrop-filter:bg-white/80 border-b shadow-sm">
                    <div className="pl-[105px] pr-6 py-4">
                        {/* タイトル行 */}
                        <div className="flex justify-between gap-4 flex-wrap items-center mb-4">
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold text-gray-900 m-0">📦 商品データベース</h1>
                                {!loading && !error && data.length > 0 && (
                                    <Badge variant="secondary" className="bg-green-100 text-green-700">
                                        {filtered.length}件
                                    </Badge>
                                )}
                            </div>
                            <div className="flex gap-2 items-center">
                                <CsvImport onImportComplete={() => {
                                    window.location.reload();
                                }} />
                                <Link href="/test">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="bg-white/80 hover:bg-white border-gray-300 hover:border-gray-400 shadow-sm"
                                    >
                                        <span className="mr-1.5">←</span>
                                        テスト
                                    </Button>
                                </Link>
                            </div>
                        </div>

                        {/* 検索バー */}
                        <div className="mb-3">
                            <InventorySearchBar
                                search={search}
                                setSearch={setSearch}
                                categoryFilter={categoryFilter}
                                setCategoryFilter={setCategoryFilter}
                                categoryOptions={availableCategoryOptions}
                                typeFilter={typeFilter}
                                setTypeFilter={setTypeFilter}
                                typeOptions={typeOptions}
                            />
                        </div>

                        {/* コントロール行 */}
                        <div className="flex flex-wrap items-center gap-3">
                            <Button
                                onClick={() => setShowAll(true)}
                                disabled={showAll || loading}
                                variant={showAll ? "outline" : "default"}
                                size="sm"
                                className="inline-flex items-center justify-center gap-2 whitespace-nowrap min-h-0 bg-blue-600 hover:bg-blue-700 h-8 text-sm font-semibold pl-2.5 pr-3 rounded-[10px] text-white"
                            >
                                {showAll ? '✓ 一覧表示中' : '📋 一覧を表示'}
                            </Button>

                            <div className="flex items-center gap-2">
                                <Label htmlFor="displayCount" className="text-xs">表示件数</Label>
                                <Select
                                    value={String(displayCount)}
                                    onValueChange={(value) => {
                                        setDisplayCount(value === 'all' ? 'all' : Number(value));
                                        setCurrentPage(1);
                                    }}
                                >
                                    <SelectTrigger id="displayCount" className="w-24 h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="10">10件</SelectItem>
                                        <SelectItem value="25">25件</SelectItem>
                                        <SelectItem value="50">50件</SelectItem>
                                        <SelectItem value="100">100件</SelectItem>
                                        <SelectItem value="all">全件</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {displayCount !== 'all' && totalPages > 1 && (
                                <div className="flex items-center gap-2">
                                    <Button
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage === 1}
                                        variant="outline"
                                        size="sm"
                                    >
                                        ≪
                                    </Button>
                                    <Button
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        variant="outline"
                                        size="sm"
                                    >
                                        ＜
                                    </Button>
                                    <span className="text-xs text-gray-700 px-2">
                                        {currentPage} / {totalPages}
                                    </span>
                                    <Button
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                        variant="outline"
                                        size="sm"
                                    >
                                        ＞
                                    </Button>
                                    <Button
                                        onClick={() => setCurrentPage(totalPages)}
                                        disabled={currentPage === totalPages}
                                        variant="outline"
                                        size="sm"
                                    >
                                        ≫
                                    </Button>
                                </div>
                            )}

                            <div className="text-xs text-gray-500 ml-auto">
                                生成: {generatedAt ? new Date(generatedAt).toLocaleString('ja-JP') : '—'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* コンテンツエリア */}
                <div className="flex flex-col gap-6 pt-6 px-6 pb-6">
                    {loading && (
                        <Card>
                            <CardContent className="pt-6">
                                <LoadingBar />
                            </CardContent>
                        </Card>
                    )}

                    {error && !loading && (
                        <Card>
                            <CardContent className="pt-6">
                                <div className="text-red-600 font-semibold">データの取得に失敗しました: {error}</div>
                            </CardContent>
                        </Card>
                    )}

                    {!loading && !error && data.length === 0 && !showAll && !search && categoryFilter === 'all' && (
                        <Card>
                            <CardContent className="pt-6">
                                <div className="text-center py-12 space-y-4">
                                    <div className="text-6xl">🔍</div>
                                    <div className="text-xl font-semibold text-gray-700">商品を検索してください</div>
                                    <div className="text-gray-600 max-w-md mx-auto">
                                        商品名（series_id / productName / vol）で検索するか、<br />
                                        「一覧を表示」ボタンで全商品を表示できます。
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {!loading && !error && data.length === 0 && (showAll || search || categoryFilter !== 'all') && (
                        <Card>
                            <CardContent className="pt-6">
                                <div className="text-center py-8 text-gray-600">
                                    検索条件に一致する商品が見つかりませんでした。
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* 商品リスト - テーブル風表示 */}
                    {!loading && !error && paginatedData.length > 0 && (
                        <div className="bg-white border border-gray-200">
                            {paginatedData.map((group) => (
                                <ProductCard
                                    key={group.variantGroupId}
                                    group={group}
                                    isActive={group.variantGroupId === activeGroupId}
                                    isExpanded={expandedGroupId === group.variantGroupId}
                                    productDraft={productDraft}
                                    variantDrafts={variantDrafts}
                                    productDiffFields={productDiffFields}
                                    variantDiffs={variantDiffs}
                                    columnLabels={columnLabels}
                                    editColumns={editColumns}
                                    readColumns={readColumns}
                                    isUploading={isUploading}
                                    taxonomy={taxonomy}
                                    categoryOptions={taxonomyCategories}
                                    typeOptions={taxonomyTypes}
                                    damageOptions={taxonomyDamages}
                                    sealingOptions={taxonomySealings}
                                    storageOptions={taxonomyStorages}
                                    storageIdToLabel={taxonomy.maps.storages.idToLabel}
                                    mergeContext={mergeContext}
                                    mergeIsProcessing={mergeIsProcessing}
                                    mergeStatusMessage={mergeStatusMessage}
                                    resetKey={resetKey}
                                    onToggleExpand={() => handleToggleExpand(group.variantGroupId)}
                                    onToggleEdit={() => handleToggleEdit(group.variantGroupId)}
                                    onProductChange={handleProductDraftChange}
                                    onVariantChange={handleVariantDraftChange}
                                    onReset={handleResetDrafts}
                                    onSave={handleSaveNow}
                                    onExecuteMerge={executeCurrentMerge}
                                    onCancelMerge={cancelMerge}
                                    onForceDeleteVariant={handleForceDeleteVariant}
                                    onSaveVariant={handleSaveSingleVariant}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* ボトム固定アクションバー（編集時のみ表示） - サイドバーの右側に配置 */}
                {hasChanges && activeGroup && productDraft && (
                    <div className="fixed bottom-0 left-16 right-0 bg-white border-t-2 border-blue-500 shadow-lg z-50">
                        <div className="px-0 py-4">
                            <div className="flex justify-between items-center gap-4 flex-wrap">
                                <div className="flex flex-col gap-1">
                                    <div className="text-sm font-semibold text-gray-900">
                                        編集中: {activeGroup.productName}
                                    </div>
                                    <div className="text-xs text-gray-600">
                                        変更内容: 商品 {productDiffFields.length}項目 / バリアント {variantDiffs.length}件
                                    </div>
                                </div>
                                <div className="flex gap-3 flex-wrap">
                                    <Button
                                        onClick={handleResetDrafts}
                                        variant="outline"
                                        size="sm"
                                    >
                                        変更を破棄
                                    </Button>
                                    <Button
                                        onClick={handleSaveNow}
                                        disabled={isUploading}
                                        size="sm"
                                        className="bg-green-600 hover:bg-green-700"
                                    >
                                        {isUploading ? '保存中...' : '今すぐ保存'}
                                    </Button>
                                </div>
                            </div>
                            {statusMessage && (
                                <div className="mt-2 text-sm text-purple-700 bg-purple-50 px-3 py-2 rounded">
                                    {statusMessage}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
