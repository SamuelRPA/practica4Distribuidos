// Indicador de conectividad en la parte superior.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

export function BannerOnline({ online, pendientes }: { online: boolean; pendientes: number }) {
    return (
        <View style={[
            styles.banner,
            { backgroundColor: online ? 'rgba(6,214,160,0.15)' : 'rgba(255,183,77,0.15)' },
        ]}>
            <View style={[
                styles.led,
                { backgroundColor: online ? colors.success : colors.warning },
            ]} />
            <Text style={styles.texto}>
                {online ? 'Conectado al servidor' : 'Sin conexión — modo offline'}
            </Text>
            {pendientes > 0 && (
                <View style={styles.badge}>
                    <Ionicons name="cloud-upload-outline" size={12} color="white" />
                    <Text style={styles.badgeText}>{pendientes}</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
        alignSelf: 'center',
        marginBottom: spacing.md,
    },
    led: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    texto: {
        ...typography.caption,
        color: colors.textPrimary,
        fontWeight: '600',
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: colors.warning,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radius.pill,
    },
    badgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '700',
    },
});
