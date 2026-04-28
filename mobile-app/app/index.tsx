// Pantalla principal — captura de acta + estado online + acceso a historial.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BannerOnline } from '../src/components/BannerOnline';
import { useColaOffline } from '../src/hooks/useColaOffline';
import { useConectividad } from '../src/hooks/useConectividad';
import { storage } from '../src/storage';
import { colors, spacing, typography } from '../src/theme';
import { CapturaInline } from '../src/screens/CapturaInline';

export default function Home() {
    const { online } = useConectividad();
    const [pendientes, setPendientes] = useState(0);
    const [refresh, setRefresh] = useState(0);

    const recargar = useCallback(async () => {
        const cola = await storage.leerCola();
        setPendientes(cola.length);
    }, []);

    useEffect(() => {
        recargar();
    }, [refresh, recargar]);

    useColaOffline(online, () => setRefresh((r) => r + 1));

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.contenido}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.brandRow}>
                    <View style={styles.brandTag}>
                        <View style={styles.led} />
                        <Text style={styles.brandText}>OEP · Captura de Actas</Text>
                    </View>
                </View>

                <Text style={styles.titulo}>Sistema Nacional Electoral</Text>
                <Text style={styles.subtitulo}>Pipeline RRV — Recuento Rápido de Votos</Text>

                <BannerOnline online={online} pendientes={pendientes} />

                <CapturaInline online={online} onCambio={() => setRefresh((r) => r + 1)} />

                <View style={styles.botonRow}>
                    <Pressable style={styles.boton} onPress={() => router.push('/historial')}>
                        <Ionicons name="time-outline" size={22} color={colors.primaryLight} />
                        <Text style={styles.botonText}>Historial</Text>
                    </Pressable>
                    <Pressable style={styles.boton} onPress={() => router.push('/ajustes')}>
                        <Ionicons name="settings-outline" size={22} color={colors.primaryLight} />
                        <Text style={styles.botonText}>Ajustes</Text>
                    </Pressable>
                </View>

                <Text style={styles.footer}>v1.0.0 · Práctica 4 · Sistemas Distribuidos</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    scroll: { flex: 1 },
    contenido: {
        padding: spacing.lg,
        paddingBottom: spacing.xxl,
    },
    brandRow: {
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    brandTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
    },
    led: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.success,
    },
    brandText: {
        ...typography.label,
        color: colors.textPrimary,
    },
    titulo: {
        ...typography.title,
        color: colors.textPrimary,
        textAlign: 'center',
        marginBottom: 4,
    },
    subtitulo: {
        ...typography.caption,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: spacing.lg,
    },
    botonRow: {
        flexDirection: 'row',
        gap: spacing.md,
        marginTop: spacing.md,
    },
    boton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: colors.bgCard,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: spacing.md,
    },
    botonText: {
        ...typography.body,
        color: colors.primaryLight,
        fontWeight: '600',
    },
    footer: {
        ...typography.caption,
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: spacing.xl,
    },
});
