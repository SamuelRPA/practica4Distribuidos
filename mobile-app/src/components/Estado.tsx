// Banner de estado (success / error / info) animado.
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
    tipo: 'success' | 'error' | 'info' | 'loading';
    titulo: string;
    detalle?: string;
}

export function Estado({ tipo, titulo, detalle }: Props) {
    const cfg = {
        success: { color: colors.success, bg: 'rgba(6,214,160,0.15)', icon: 'checkmark-circle' as const },
        error:   { color: colors.danger,  bg: 'rgba(239,71,111,0.15)', icon: 'close-circle' as const },
        info:    { color: colors.primaryLight, bg: 'rgba(20,87,189,0.2)', icon: 'information-circle' as const },
        loading: { color: colors.primaryLight, bg: 'rgba(20,87,189,0.2)', icon: 'sync' as const },
    }[tipo];

    return (
        <View style={[styles.contenedor, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
            {tipo === 'loading' ? (
                <ActivityIndicator color={cfg.color} />
            ) : (
                <Ionicons name={cfg.icon} size={22} color={cfg.color} />
            )}
            <View style={{ flex: 1 }}>
                <Text style={[styles.titulo, { color: cfg.color }]}>{titulo}</Text>
                {detalle && <Text style={styles.detalle}>{detalle}</Text>}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    contenedor: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        marginTop: spacing.md,
    },
    titulo: {
        ...typography.body,
        fontWeight: '600',
    },
    detalle: {
        ...typography.caption,
        marginTop: 2,
    },
});
