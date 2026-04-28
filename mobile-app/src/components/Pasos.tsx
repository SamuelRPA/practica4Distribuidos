// Indicador de progreso 1-2-3 para el flujo de captura.
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

interface Props {
    actual: number; // 0, 1, 2, 3
    total?: number;
}

export function Pasos({ actual, total = 3 }: Props) {
    return (
        <View style={styles.contenedor}>
            {Array.from({ length: total }, (_, i) => {
                const completo = i < actual;
                const activo = i === actual - 1;
                return (
                    <View key={i} style={[
                        styles.dot,
                        activo && styles.activo,
                        completo && styles.completo,
                    ]} />
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    contenedor: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginBottom: spacing.xl,
    },
    dot: {
        flex: 1,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: radius.sm,
    },
    activo: {
        backgroundColor: colors.primaryLight,
    },
    completo: {
        backgroundColor: colors.success,
    },
});
