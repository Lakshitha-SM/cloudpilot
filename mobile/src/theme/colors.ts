/**
 * src/theme/colors.ts
 * CloudPilot design system — all colors in one place
 */
export const Colors = {
  // Base
  bg: '#030712',
  bgCard: '#0d1b2e',
  bgCardAlt: '#0f172a',
  bgCardBorder: '#1e3a5f',

  // Accent
  cyan: '#06b6d4',
  cyanLight: '#22d3ee',
  cyanDark: '#0891b2',
  blue: '#3b82f6',
  blueLight: '#60a5fa',
  purple: '#8b5cf6',
  purpleLight: '#a78bfa',

  // Status
  green: '#10b981',
  greenDark: '#064e3b',
  greenLight: '#34d399',
  red: '#ef4444',
  redDark: '#450a0a',
  orange: '#f59e0b',
  orangeDark: '#451a03',

  // Text
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#475569',
  textAccent: '#06b6d4',

  // Nav
  navBg: '#030712',
  navBorder: '#1e3a5f',
  navActive: '#06b6d4',
  navInactive: '#475569',
};

export const Gradients = {
  header: ['#0d1b2e', '#030712'] as const,
  card: ['#0d1b2e', '#071428'] as const,
  accent: ['#0891b2', '#3b82f6'] as const,
  success: ['#064e3b', '#0d1b2e'] as const,
  danger: ['#450a0a', '#0d1b2e'] as const,
  splash: ['#030712', '#0d1b2e', '#071428'] as const,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const FontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};
