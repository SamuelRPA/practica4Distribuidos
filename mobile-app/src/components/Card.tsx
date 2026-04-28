import { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme';

interface Props {
    titulo?: string;
    children: ReactNode;
    estilo?: StyleProp<ViewStyle>;
}

export function Card({ titulo, children, estilo }: Props) {
    return (
        <View style={[styles.card, shadows.medium, estilo]}>
            {titulo && <Text style={styles.titulo}>{titulo}</Text>}
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.bgCard,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: spacing.lg,
        marginBottom: spacing.lg,
    },
    titulo: {
        ...typography.label,
        color: colors.textSecondary,
        marginBottom: spacing.md,
    },
});
