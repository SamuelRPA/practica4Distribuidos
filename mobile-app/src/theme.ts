// Sistema de diseño coherente con el dashboard.
// Mismos colores que /frontend (azul OEP) pero adaptado a UI mobile-dark.

export const colors = {
    primary:        '#1457bd',
    primaryLight:   '#2d72d9',
    primaryDark:    '#0b3d8c',
    accent:         '#ffd166',
    success:        '#06d6a0',
    warning:        '#ffb74d',
    danger:         '#ef476f',

    bgDeep:         '#0b1e3a',
    bgMid:          '#142c52',
    bgCard:         'rgba(255, 255, 255, 0.06)',
    bgCardSolid:    '#1a2f57',
    bgInput:        'rgba(0, 0, 0, 0.3)',

    textPrimary:    '#f7f9fc',
    textSecondary:  '#aebed4',
    textMuted:      'rgba(255, 255, 255, 0.4)',

    border:         'rgba(255, 255, 255, 0.12)',
    borderActive:   '#2d72d9',

    overlay:        'rgba(0, 0, 0, 0.7)',
};

export const spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
};

export const radius = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    pill: 999,
};

export const typography = {
    display: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
    title:   { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
    heading: { fontSize: 18, fontWeight: '600' as const },
    body:    { fontSize: 16, fontWeight: '400' as const },
    label:   { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.5, textTransform: 'uppercase' as const },
    caption: { fontSize: 11, fontWeight: '500' as const, color: colors.textSecondary },
    code:    { fontSize: 13, fontFamily: 'monospace' as const },
};

export const shadows = {
    soft: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    medium: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 8,
    },
    glow: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 6,
    },
};
