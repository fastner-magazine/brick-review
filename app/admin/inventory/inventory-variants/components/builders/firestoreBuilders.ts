import type { AggregatedProduct, ProductDraft, VariantDraft, PendingDoc } from "../types";
import type { TaxonomyResolver } from "@/lib/taxonomyResolver";
import { parseDamagesInput, parseSealingInput, parseTypesInput, numberFromInput, parseStatusTokens } from "../utils";

export function buildProductDoc(
    group: AggregatedProduct,
    draft: ProductDraft,
    changedFields: string[],
    taxonomy: TaxonomyResolver
): PendingDoc {
    const typeCandidates = parseTypesInput(draft.typesInput);
    const damageCandidates = parseDamagesInput(draft.damagesInput);
    const sealingCandidates = parseSealingInput(draft.sealingInput);
    const typeId = typeCandidates.length > 0 ? taxonomy.resolve(typeCandidates, 'types') : '';
    const damageId = damageCandidates.length > 0 ? taxonomy.resolve(damageCandidates, 'damages') : '';
    const sealingId = sealingCandidates.length > 0 ? taxonomy.resolve(sealingCandidates, 'sealings') : '';
    const categoryId = draft.categoryInput.trim();

    const now = new Date().toISOString();
    const effectiveGroupId = (draft.variantGroupId || group.variantGroupId).trim() || group.variantGroupId;

    // 商品名構成: series_id, product_name, vol
    const seriesId = draft.seriesId.trim();
    const productName = draft.productName.trim() || group.productName;
    const vol = draft.vol.trim();

    // categoryにはtaxonomy IDを保存（日本語ラベルではない）
    const category = categoryId || draft.category.trim() || group.category;

    // 発売日をFirestore Timestampに変換
    let releaseDate: any = null;
    if (draft.releaseDate) {
        try {
            const date = new Date(draft.releaseDate);
            if (!isNaN(date.getTime())) {
                releaseDate = date.toISOString();
            }
        } catch (e) {
            console.warn('[buildProductDoc] Failed to parse releaseDate:', draft.releaseDate, e);
        }
    }

    const data: any = {
        variant_group_id: effectiveGroupId,
        series_id: seriesId || null,
        product_name: productName,
        vol: vol || null,
        release_date: releaseDate,
        category, // taxonomy ID（英字）を保存
        types: typeId || null,
        damages: damageId || null,
        sealing: sealingId || null,
        updated_at: now,
    };

    return {
        collection: 'productsMaster',
        doc: {
            id: effectiveGroupId,
            data,
        },
        summary: `productsMaster / ${effectiveGroupId} [${changedFields.join(', ')}]`,
    };
}

export function buildVariantDoc(
    group: AggregatedProduct,
    productDraft: ProductDraft,
    variantDraft: VariantDraft,
    changedFields: string[],
    taxonomy: TaxonomyResolver
): PendingDoc {
    console.log('[buildVariantDoc] Input variantDraft:', {
        inventoryId: variantDraft.inventoryId,
        variantSku: variantDraft.variantSku,
        types: variantDraft.types,
        damages: variantDraft.damages,
        sealing: variantDraft.sealing,
        storageLocation: variantDraft.storageLocation
    });

    const typeCandidates = parseTypesInput(variantDraft.types);
    const damageCandidates = parseDamagesInput(variantDraft.damages);
    const sealingCandidates = parseSealingInput(variantDraft.sealing);

    const typeId = typeCandidates.length > 0 ? taxonomy.resolve(typeCandidates, 'types') : '';
    const damageId = damageCandidates.length > 0 ? taxonomy.resolve(damageCandidates, 'damages') : '';
    const sealingId = sealingCandidates.length > 0 ? taxonomy.resolve(sealingCandidates, 'sealings') : '';

    console.log('[buildVariantDoc] Parsed IDs:', { typeId, damageId, sealingId });

    const typeLabel = typeId ? taxonomy.getLabel(typeId, 'types') : '';
    const damageLabel = damageId ? taxonomy.getLabel(damageId, 'damages') : '';
    const sealingLabel = sealingId ? taxonomy.getLabel(sealingId, 'sealings') : '';

    const storageCandidate = (variantDraft.storageLocation || '').trim();
    const storageId = storageCandidate ? taxonomy.resolve([storageCandidate], 'storages') : '';
    const storageLabel = storageId ? taxonomy.getLabel(storageId, 'storages') : '';

    const statusTokens = parseStatusTokens(variantDraft.statusTokens);
    const now = new Date().toISOString();
    // ドキュメントIDはユニークな variantSku を優先、無ければ inventoryId
    const docId = String(variantDraft.inventoryId || '').trim() || String(variantDraft.variantSku || '').trim();
    const effectiveGroupId = (productDraft.variantGroupId || group.variantGroupId).trim() || group.variantGroupId;
    const productName = productDraft.productName.trim() || group.productName;
    const categoryId = productDraft.categoryInput.trim();
    // categoryにはtaxonomy IDを保存（日本語ラベルではない）
    const category = categoryId || productDraft.category.trim() || group.category;
    const inventoryId = variantDraft.inventoryId;
    const unitPrice = numberFromInput(variantDraft.unitPrice);
    const quantity = numberFromInput(variantDraft.quantity);
    const barcode = String(variantDraft.barcode || '').trim();
    const notes = String(variantDraft.notes || '').trim();

    const data = {
        variant_sku: variantDraft.variantSku || docId,
        variantIdRef: variantDraft.variantSku || docId,
        inventory_id: inventoryId,
        // キャッシュフィールド: productsMaster からの参照コピー
        groupIdRef: effectiveGroupId,
        productNameRef: productName,
        categoryRef: category,
        types: typeId || null,
        types_label: typeLabel || null,
        damages: damageId || null,
        damages_label: damageLabel || null,
        sealing: sealingId || null,
        sealing_label: sealingLabel || null,
        storage: storageId || null,
        storage_label: storageLabel || null,
        quantity,
        unit_price: unitPrice,
        status_tokens: statusTokens,
        barcode,
        notes,
        updated_at: now,
        changed_fields: changedFields,
    };

    console.log('[buildVariantDoc] Final data to save:', {
        variant_sku: data.variant_sku,
        inventory_id: data.inventory_id,
        types: data.types,
        damages: data.damages,
        sealing: data.sealing,
        storage: data.storage,
        types_label: data.types_label,
        damages_label: data.damages_label,
        sealing_label: data.sealing_label,
        storage_label: data.storage_label
    });

    return {
        collection: 'inventoriesMaster',
        doc: {
            id: docId,
            data,
        },
        summary: `inventoriesMaster / ${docId || '(id 未設定)'} [${changedFields.join(', ')}]`,
    };
}
