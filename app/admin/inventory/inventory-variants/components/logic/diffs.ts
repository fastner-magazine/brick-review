import type { AggregatedProduct, AggregatedVariant, ProductDraft, VariantDraft, VariantDiff } from '../types';
import { parseTypesInput, parseDamagesInput, parseSealingInput, listsEqual } from '../utils';

export function diffProduct(group: AggregatedProduct, draft: ProductDraft): string[] {
    const changes: string[] = [];

    // seriesId, productName, vol, releaseDateの変更チェック
    if ((draft.seriesId || '').trim() !== (group.seriesId || '').trim()) {
        changes.push('seriesId');
    }
    if ((draft.productName || '').trim() !== String(group.productName || '').trim()) {
        changes.push('productName');
    }
    if ((draft.vol || '').trim() !== String(group.vol || '').trim()) {
        changes.push('vol');
    }

    // 発売日の比較（YYYY-MM-DD形式）
    const groupReleaseDate = group.releaseDate ? new Date(group.releaseDate).toISOString().split('T')[0] : '';
    const draftReleaseDate = draft.releaseDate ? draft.releaseDate.trim() : '';
    if (draftReleaseDate !== groupReleaseDate) {
        changes.push('releaseDate');
    }

    if ((draft.category || '').trim() !== (group.category || '').trim()) {
        changes.push('category');
    }
    if ((draft.categoryInput || '').trim() && (draft.categoryInput || '').trim() !== (draft.category || '').trim()) {
        changes.push('categoryInput');
    }
    if ((draft.storageInput || '').trim()) {
        changes.push('storage');
    }
    const effectiveGroupId = (draft.variantGroupId || group.variantGroupId || '').trim();
    if (effectiveGroupId !== (group.variantGroupId || '')) {
        changes.push('variantGroupId');
    }
    const originalTypes = (group.types || []).slice();
    const draftTypes = parseTypesInput(draft.typesInput);
    if (!listsEqual(originalTypes, draftTypes)) {
        changes.push('types');
    }
    const originalDamages = (group.damages || []).slice();
    const draftDamages = parseDamagesInput(draft.damagesInput);
    if (!listsEqual(originalDamages, draftDamages)) {
        changes.push('damages');
    }
    const originalSealing = (group.sealing || []).slice();
    const draftSealing = parseSealingInput(draft.sealingInput);
    if (!listsEqual(originalSealing, draftSealing)) {
        changes.push('sealing');
    }
    return changes;
}

export function diffVariant(original: AggregatedVariant, draft: VariantDraft, includeVariantGroupChange = false): VariantDiff | null {
    const changedFields: string[] = [];
    const originalTypes = parseTypesInput(original.types || '');
    const draftTypes = parseTypesInput(draft.types);
    if (!listsEqual(originalTypes, draftTypes)) {
        changedFields.push('types');
    }
    const originalDamages = parseDamagesInput(original.damages || '');
    const draftDamages = parseDamagesInput(draft.damages);
    if (!listsEqual(originalDamages, draftDamages)) {
        changedFields.push('damages');
    }
    const originalSealing = parseSealingInput(original.sealing || '');
    const draftSealing = parseSealingInput(draft.sealing);
    if (!listsEqual(originalSealing, draftSealing)) {
        changedFields.push('sealing');
    }
    if ((original.storageLocation || '').trim() !== (draft.storageLocation || '').trim()) {
        changedFields.push('storageLocation');
    }
    const originalQuantity = original.quantity ?? 0;
    const draftQuantity = typeof draft.quantity === 'string' ? (draft.quantity.trim() === '' ? 0 : Number(draft.quantity)) : (draft.quantity ?? 0);
    if (originalQuantity !== draftQuantity) {
        changedFields.push('quantity');
    }
    const originalUnitPrice = original.unitPrice ?? 0;
    const draftUnitPrice = typeof draft.unitPrice === 'string' ? (draft.unitPrice.trim() === '' ? 0 : Number(draft.unitPrice)) : (draft.unitPrice ?? 0);
    if (originalUnitPrice !== draftUnitPrice) {
        changedFields.push('unitPrice');
    }
    const originalStatusTokens = Array.isArray(original.statusTokens)
        ? original.statusTokens.join(',')
        : String(original.statusTokens || '');
    const draftStatusTokens = Array.isArray(draft.statusTokens)
        ? draft.statusTokens.join(',')
        : String(draft.statusTokens || '');
    if (originalStatusTokens.trim() !== draftStatusTokens.trim()) {
        changedFields.push('statusTokens');
    }
    const originalBarcode = String(original.barcode || '');
    const draftBarcode = String(draft.barcode || '');
    if (originalBarcode.trim() !== draftBarcode.trim()) {
        changedFields.push('barcode');
    }
    const originalNotes = String(original.notes || '');
    const draftNotes = String(draft.notes || '');
    if (originalNotes.trim() !== draftNotes.trim()) {
        changedFields.push('notes');
    }
    if (includeVariantGroupChange && !changedFields.includes('variantGroupId')) {
        changedFields.push('variantGroupId');
    }
    return changedFields.length > 0 ? { key: draft.key, original, draft, changedFields } : null;
}
