import {
    StyleSheet, Text, TextInput, View,
    type KeyboardTypeOptions,
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
    label: string;
    value: string;
    onChangeText: (v: string) => void;
    placeholder?: string;
    keyboardType?: KeyboardTypeOptions;
    maxLength?: number;
    deshabilitado?: boolean;
}

export function Input({
    label, value, onChangeText, placeholder, keyboardType = 'default', maxLength, deshabilitado,
}: Props) {
    return (
        <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
                style={styles.input}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                keyboardType={keyboardType}
                maxLength={maxLength}
                editable={!deshabilitado}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    field: {
        marginBottom: spacing.lg,
    },
    label: {
        ...typography.label,
        color: colors.textSecondary,
        marginBottom: spacing.sm,
    },
    input: {
        backgroundColor: colors.bgInput,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.md,
        padding: spacing.md,
        fontSize: 16,
        color: colors.textPrimary,
    },
});
