import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { EntradaHistorial } from '../storage';
import { colors, radius, spacing, typography } from '../theme';
import { Card } from './Card';

interface Props {
    items: EntradaHistorial[];
}

export function Historial({ items }: Props) {
    if (items.length === 0) return null;

    return (
        <Card titulo={`Envíos recientes (${items.length})`}>
            {items.map((item) => (
                <Item key={item.id} item={item} />
            ))}
        </Card>
    );
}

function Item({ item }: { item: EntradaHistorial }) {
    const cfg = {
        enviado:   { color: colors.success, icon: 'checkmark-circle' as const },
        fallido:   { color: colors.danger,  icon: 'close-circle' as const },
        pendiente: { color: colors.warning, icon: 'time' as const },
    }[item.estado];

    return (
        <View style={styles.item}>
            <Ionicons name={cfg.icon} size={20} color={cfg.color} />
            <View style={{ flex: 1 }}>
                <Text style={styles.titulo}>Mesa {item.codigo_mesa}</Text>
                <Text style={styles.meta}>
                    {new Date(item.timestamp).toLocaleTimeString()}
                    {item.mensaje ? ` · ${item.mensaje.slice(0, 30)}` : ''}
                </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: cfg.color + '33' }]}>
                <Text style={[styles.badgeText, { color: cfg.color }]}>{item.estado}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    titulo: {
        ...typography.body,
        color: colors.textPrimary,
        fontWeight: '600',
    },
    meta: {
        ...typography.caption,
        color: colors.textSecondary,
        marginTop: 2,
    },
    badge: {
        paddingHorizontal: spacing.md,
        paddingVertical: 4,
        borderRadius: radius.pill,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
});
