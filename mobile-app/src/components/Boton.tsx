import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme';

interface Props {
    titulo: string;
    onPress: () => void;
    variante?: 'primary' | 'secondary' | 'danger';
    icono?: keyof typeof Ionicons.glyphMap;
    deshabilitado?: boolean;
    cargando?: boolean;
    estilo?: StyleProp<ViewStyle>;
}

export function Boton({
    titulo, onPress, variante = 'primary', icono, deshabilitado, cargando, estilo,
}: Props) {
    const efectivamenteDeshab = deshabilitado || cargando;

    const contenido = (
        <View style={styles.contenido}>
            {cargando ? (
                <ActivityIndicator color={variante === 'secondary' ? colors.primaryLight : 'white'} />
            ) : (
                icono && <Ionicons name={icono} size={20} color={variante === 'secondary' ? colors.primaryLight : 'white'} />
            )}
            <Text style={[styles.texto, variante === 'secondary' && { color: colors.primaryLight }]}>
                {titulo}
            </Text>
        </View>
    );

    if (variante === 'primary') {
        return (
            <Pressable onPress={onPress} disabled={efectivamenteDeshab} style={({ pressed }) => [
                styles.base, shadows.glow, estilo,
                pressed && { transform: [{ scale: 0.98 }] },
                efectivamenteDeshab && { opacity: 0.5 },
            ]}>
                <LinearGradient
                    colors={[colors.primary, colors.primaryLight]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.gradient}
                >
                    {contenido}
                </LinearGradient>
            </Pressable>
        );
    }

    if (variante === 'danger') {
        return (
            <Pressable onPress={onPress} disabled={efectivamenteDeshab} style={({ pressed }) => [
                styles.base, styles.danger, estilo,
                pressed && { transform: [{ scale: 0.98 }] },
                efectivamenteDeshab && { opacity: 0.5 },
            ]}>
                {contenido}
            </Pressable>
        );
    }

    return (
        <Pressable onPress={onPress} disabled={efectivamenteDeshab} style={({ pressed }) => [
            styles.base, styles.secondary, estilo,
            pressed && { transform: [{ scale: 0.98 }] },
            efectivamenteDeshab && { opacity: 0.5 },
        ]}>
            {contenido}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    base: {
        borderRadius: radius.md,
        overflow: 'hidden',
    },
    gradient: {
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.xl,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondary: {
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.xl,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    danger: {
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.xl,
        backgroundColor: colors.danger,
        alignItems: 'center',
        justifyContent: 'center',
    },
    contenido: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    texto: {
        ...typography.body,
        color: 'white',
        fontWeight: '600',
    },
});
