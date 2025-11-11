/**
 * Result Page共通スタイル定義
 * Material Design風のクリーンで現代的なデザイン
 */

export const colors = {
  primary: '#1976d2',
  primaryLight: '#42a5f5',
  primaryDark: '#1565c0',
  secondary: '#ff9800',
  secondaryLight: '#ffb74d',
  success: '#4caf50',
  error: '#f44336',
  warning: '#ff9800',
  info: '#2196f3',
  
  // Neutral
  gray50: '#fafafa',
  gray100: '#f5f5f5',
  gray200: '#eeeeee',
  gray300: '#e0e0e0',
  gray400: '#bdbdbd',
  gray500: '#9e9e9e',
  gray600: '#757575',
  gray700: '#616161',
  gray800: '#424242',
  gray900: '#212121',
  
  // Special
  white: '#ffffff',
  background: '#f8f9fa',
  surface: '#ffffff',
  border: '#e0e0e0',
  divider: '#e0e0e0',
  textPrimary: '#212121',
  textSecondary: '#757575',
  textDisabled: '#9e9e9e',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
};

export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: 700,
    lineHeight: 1.2,
    color: colors.textPrimary,
  },
  h2: {
    fontSize: 24,
    fontWeight: 600,
    lineHeight: 1.3,
    color: colors.textPrimary,
  },
  h3: {
    fontSize: 20,
    fontWeight: 600,
    lineHeight: 1.4,
    color: colors.textPrimary,
  },
  h4: {
    fontSize: 18,
    fontWeight: 600,
    lineHeight: 1.4,
    color: colors.textPrimary,
  },
  body1: {
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.5,
    color: colors.textPrimary,
  },
  body2: {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.5,
    color: colors.textSecondary,
  },
  caption: {
    fontSize: 12,
    fontWeight: 400,
    lineHeight: 1.4,
    color: colors.textSecondary,
  },
};

// Common component styles
export const styles = {
  container: {
    padding: spacing.lg,
    maxWidth: 1200,
    margin: '0 auto',
    background: colors.background,
    minHeight: '100vh',
  },
  
  card: {
    background: colors.surface,
    borderRadius: borderRadius.lg,
    boxShadow: shadows.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    border: `1px solid ${colors.border}`,
  },
  
  cardHeader: {
    marginTop: 0,
    marginBottom: spacing.md,
    ...typography.h2,
  },
  
  section: {
    background: colors.surface,
    borderRadius: borderRadius.lg,
    boxShadow: shadows.sm,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    border: `1px solid ${colors.border}`,
  },
  
  buttonPrimary: {
    padding: `${spacing.sm}px ${spacing.md}px`,
    background: colors.primary,
    color: colors.white,
    border: 'none',
    borderRadius: borderRadius.md,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    boxShadow: shadows.sm,
    transition: 'all 0.2s ease',
  },
  
  buttonSecondary: {
    padding: `${spacing.sm}px ${spacing.md}px`,
    background: colors.white,
    color: colors.textPrimary,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    transition: 'all 0.2s ease',
  },
  
  buttonActive: {
    background: colors.primary,
    color: colors.white,
    border: `1px solid ${colors.primary}`,
    boxShadow: shadows.md,
  },
  
  input: {
    padding: `${spacing.sm}px ${spacing.sm * 1.5}px`,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    fontSize: 14,
    outline: 'none',
    transition: 'all 0.2s ease',
  },
  
  select: {
    padding: `${spacing.sm}px ${spacing.sm * 1.5}px`,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    fontSize: 14,
    outline: 'none',
    background: colors.white,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: `${spacing.xs}px ${spacing.sm * 1.5}px`,
    borderRadius: borderRadius.full,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1,
  },
  
  badgeSuccess: {
    background: '#e8f5e9',
    color: '#2e7d32',
  },
  
  badgeError: {
    background: '#ffebee',
    color: '#c62828',
  },
  
  badgeWarning: {
    background: '#fff3e0',
    color: '#f57c00',
  },
  
  badgeInfo: {
    background: '#e3f2fd',
    color: '#1565c0',
  },
  
  alert: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  
  alertError: {
    background: '#ffebee',
    color: '#c62828',
    border: `1px solid #ef9a9a`,
  },
  
  alertWarning: {
    background: '#fff3e0',
    color: '#f57c00',
    border: `1px solid #ffcc80`,
  },
  
  alertInfo: {
    background: '#e3f2fd',
    color: '#1565c0',
    border: `1px solid #90caf9`,
  },
  
  alertSuccess: {
    background: '#e8f5e9',
    color: '#2e7d32',
    border: `1px solid #a5d6a7`,
  },
  
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 14,
    marginTop: spacing.md,
  },
  
  tableHeader: {
    background: colors.gray50,
    borderBottom: `2px solid ${colors.border}`,
    padding: spacing.sm * 1.5,
    textAlign: 'left' as const,
    fontWeight: 600,
    fontSize: 13,
    color: colors.textPrimary,
  },
  
  tableCell: {
    borderBottom: `1px solid ${colors.border}`,
    padding: spacing.sm * 1.5,
    textAlign: 'left' as const,
    color: colors.textPrimary,
  },
  
  divider: {
    height: 1,
    background: colors.divider,
    border: 'none',
    margin: `${spacing.lg}px 0`,
  },
  
  chipGroup: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: `${spacing.xs}px ${spacing.sm * 1.5}px`,
    background: colors.gray100,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.full,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  
  chipActive: {
    background: colors.primary,
    color: colors.white,
    border: `1px solid ${colors.primary}`,
  },
  
  svgContainer: {
    background: colors.white,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  
  controlPanel: {
    background: colors.gray50,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    border: `1px solid ${colors.border}`,
  },
  
  formRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm * 1.5,
    flexWrap: 'wrap' as const,
    marginBottom: spacing.sm,
  },
  
  label: {
    fontSize: 14,
    fontWeight: 500,
    color: colors.textPrimary,
    marginRight: spacing.xs,
  },
  
  stat: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    background: colors.gray50,
    borderRadius: borderRadius.md,
    border: `1px solid ${colors.border}`,
  },
  
  statLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: 500,
  },
  
  statValue: {
    fontSize: 24,
    fontWeight: 700,
    color: colors.primary,
  },
};
