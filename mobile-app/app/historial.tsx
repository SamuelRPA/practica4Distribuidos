import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Boton } from '../src/components/Boton';
import { Historial } from '../src/components/Historial';
import { storage, type EntradaHistorial, type EnvioPendiente } from '../src/storage';
import { colors, spacing, typography } from '../src/theme';

export default function HistorialScreen() {
    const [items, setItems] = useState<EntradaHistorial[]>([]);
    const [pendientes, setPendientes] = useState<EnvioPendiente[]>([]);

    useFocusEffect(useCallback(() => {
        storage.leerHistorial().then(setItems);
        storage.leerCola().then(setPendientes);
    }, []));

    async function limpiar() {
        await storage.limpiarHistorial();
        setItems([]);
    }

    return (
        <SafeAreaView style={styles.safe} edges={['bottom']}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.contenido}>
                <View style={styles.kpiRow}>
                    <Kpi valor={items.filter((i) => i.estado === 'enviado').length} etiqueta="Enviadas" color={colors.success} />
                    <Kpi valor={pendientes.length} etiqueta="Pendientes" color={colors.warning} />
                    <Kpi valor={items.filter((i) => i.estado === 'fallido').length} etiqueta="Fallidas" color={colors.danger} />
                </View>

                {pendientes.length > 0 && (
                    <View style={styles.alerta}>
                        <Ionicons name="cloud-upload-outline" size={18} color={colors.warning} />
                        <Text style={styles.alertaText}>
                            {pendientes.length} envío(s) en cola. Se reintentarán al recuperar conexión.
                        </Text>
                    </View>
                )}

                <Historial items={items} />

                {items.length > 0 && (
                    <Boton titulo="Limpiar historial" variante="danger" onPress={limpiar} icono="trash" />
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

function Kpi({ valor, etiqueta, color }: { valor: number; etiqueta: string; color: string }) {
    return (
        <View style={styles.kpi}>
            <Text style={[styles.kpiValor, { color }]}>{valor}</Text>
            <Text style={styles.kpiEtiqueta}>{etiqueta}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    contenido: { padding: spacing.lg, paddingTop: 100 },
    kpiRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
    kpi: {
        flex: 1, padding: spacing.md, alignItems: 'center',
        backgroundColor: colors.bgCard, borderRadius: 12,
        borderColor: colors.border, borderWidth: 1,
    },
    kpiValor: { fontSize: 28, fontWeight: '700', lineHeight: 32 },
    kpiEtiqueta: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
    alerta: {
        flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
        padding: spacing.md, marginBottom: spacing.lg,
        backgroundColor: 'rgba(255,183,77,0.12)',
        borderColor: colors.warning, borderWidth: 1, borderRadius: 12,
    },
    alertaText: { flex: 1, ...typography.caption, color: colors.textPrimary },
});
