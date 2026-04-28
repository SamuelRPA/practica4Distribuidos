import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Boton } from '../src/components/Boton';
import { Card } from '../src/components/Card';
import { Input } from '../src/components/Input';
import { config } from '../src/config';
import { storage } from '../src/storage';
import { colors, spacing, typography } from '../src/theme';

export default function AjustesScreen() {
    const [operador, setOperador] = useState('');
    const [guardado, setGuardado] = useState(false);

    useEffect(() => {
        storage.leerConfig().then((c) => {
            if (c.operador) setOperador(c.operador);
        });
    }, []);

    async function guardar() {
        await storage.guardarConfig({ operador });
        setGuardado(true);
        setTimeout(() => setGuardado(false), 2000);
    }

    return (
        <SafeAreaView style={styles.safe} edges={['bottom']}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.contenido}>
                <Card titulo="Información del operador">
                    <Input
                        label="Tu nombre / código"
                        value={operador}
                        onChangeText={setOperador}
                        placeholder="ej. operador_juarez"
                    />
                    <Boton titulo={guardado ? '✓ Guardado' : 'Guardar'} onPress={guardar} icono="save" />
                </Card>

                <Card titulo="Conexión al servidor">
                    <View style={styles.kv}>
                        <Text style={styles.k}>API base URL</Text>
                        <Text style={styles.v} selectable>{config.apiBaseUrl}</Text>
                    </View>
                    <Text style={styles.nota}>
                        Para cambiar la URL del backend, edita el archivo .env en mobile-app/
                        y reinicia la app con `npx expo start`.
                    </Text>
                </Card>

                <Card titulo="Acerca de">
                    <View style={styles.kv}>
                        <Text style={styles.k}>App</Text><Text style={styles.v}>OEP Captura</Text>
                    </View>
                    <View style={styles.kv}>
                        <Text style={styles.k}>Versión</Text><Text style={styles.v}>1.0.0</Text>
                    </View>
                    <View style={styles.kv}>
                        <Text style={styles.k}>Práctica</Text><Text style={styles.v}>4 — Sistemas Distribuidos</Text>
                    </View>
                    <View style={styles.kv}>
                        <Text style={styles.k}>Pipeline</Text><Text style={styles.v}>RRV (Recuento Rápido)</Text>
                    </View>
                </Card>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    contenido: { padding: spacing.lg, paddingTop: 100 },
    kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
    k: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
    v: { ...typography.body, color: colors.textPrimary, flex: 1, textAlign: 'right' },
    nota: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 },
});
