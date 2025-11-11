/**
 * Search System Entry Point
 * 疎結合な検索システム（Strategy パターン）
 */

// ============================================
// 型定義
// ============================================
export type {
 SearchStrategy,
 SearchResult,
 SearchOptions,
 SearchFilter,
 FilterOption,
 PaginationState,
 FirestoreSearchConfig,
 FuseSearchConfig,
 NormalizeOptions,
 PriceOption,
 PriceSelectorConfig,
 ProductOption,
 ProductsSelectorConfig,
} from './types';

// ============================================
// 検索戦略
// ============================================
export { FirestoreSearchStrategy } from './strategies/firestore';
export { FuseSearchStrategy } from './strategies/fuse';
export { PriceSelectorStrategy } from './strategies/priceSelector';
export { InventoryStrategy } from './strategies/inventory';
export { ProductsStrategy } from './strategies/products';

// ============================================
// ユーティリティ
// ============================================
export {
 normalizeText,
 toHalfWidth,
 removeSymbols,
 getPrefixSearchRange,
} from './normalize';

// ============================================
// UIコンポーネント（完全制御）
// ============================================
export { SearchBar } from './components/SearchBar';
export type { SearchBarProps } from './components/SearchBar';
export { FilterSelect } from './components/FilterSelect';
export { PaginationControls } from './components/PaginationControls';
export { PriceSelector } from './components/PriceSelector';
export type { PriceSelectorProps } from './components/PriceSelector';
export { ProductSelector } from './components/ProductSelector';
export type { ProductSelectorProps } from './components/ProductSelector';

// ============================================
// Hooks
// ============================================
export { useSearchDebounce } from './hooks/useSearchDebounce';
export type { DebounceOptions } from './hooks/useSearchDebounce';
