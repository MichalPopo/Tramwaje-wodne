/**
 * Tramwaje Wodne — Dark Maritime Theme (shared with web)
 */
export const colors = {
    bg: '#0a0e1a',
    bgCard: '#111827',
    bgCardHover: '#1a2236',
    bgInput: '#1e293b',

    primary: '#06b6d4',     // cyan-500
    primaryDark: '#0891b2', // cyan-600
    accent: '#f59e0b',      // amber-500
    accentRed: '#ef4444',
    accentGreen: '#22c55e',
    accentBlue: '#3b82f6',

    text: '#e2e8f0',
    textMuted: '#94a3b8',
    textDim: '#64748b',

    border: '#1e293b',
    borderLight: '#334155',

    statusTodo: '#3b82f6',
    statusProgress: '#f59e0b',
    statusDone: '#22c55e',
    statusBlocked: '#ef4444',

    priorityCritical: '#ef4444',
    priorityHigh: '#f59e0b',
    priorityNormal: '#3b82f6',
    priorityLow: '#94a3b8',
} as const;

export const spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
} as const;

export const fonts = {
    sm: 12,
    md: 14,
    lg: 16,
    xl: 20,
    xxl: 24,
    title: 28,
} as const;

export const radius = {
    sm: 6,
    md: 10,
    lg: 16,
    full: 999,
} as const;
