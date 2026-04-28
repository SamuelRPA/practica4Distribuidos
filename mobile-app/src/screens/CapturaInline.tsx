// Card de captura — el formulario completo embebido en home.
// Lógica:
// 1. Operador pone código de mesa (validación opcional contra backend)
// 2. Toma foto o elige de galería
// 3. (opcional) captura ubicación GPS
// 4. Manda al backend; si falla por red, encola para reintento offline
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Boton } from '../components/Boton';
import { Card } from '../components/Card';
import { Estado } from '../components/Estado';
import { Input } from '../components/Input';
import { Pasos } from '../components/Pasos';
import { useCamara } from '../hooks/useCamara';
import { useUbicacion } from '../hooks/useUbicacion';
import { api } from '../api';
import { storage } from '../storage';
import { colors, radius, spacing, typography } from '../theme';

type EstadoEnvio =
    | { tipo: 'idle' }
    | { tipo: 'subiendo' }
    | { tipo: 'ok'; hash?: string }
    | { tipo: 'encolado_offline' }
    | { tipo: 'error'; mensaje: string };

export function CapturaInline({ online, onCambio }: { online: boolean; onCambio: () => void }) {
    const [codigoMesa, setCodigoMesa] = useState('');
    const [imagen, setImagen] = useState<ImagePicker.ImagePickerAsset | null>(null);
    const [estado, setEstado] = useState<EstadoEnvio>({ tipo: 'idle' });
    const { tomarFoto, elegirDeGaleria, cargando } = useCamara();
    const { ubicacion, obtenerUbicacion } = useUbicacion();

    useEffect(() => {
        // Restaurar última mesa usada
        storage.leerConfig().then((c) => {
            if (c.ultimaMesa) setCodigoMesa(c.ultimaMesa);
        });
    }, []);

    const codigoNumerico = parseInt(codigoMesa, 10);
    const tieneCodigo = !isNaN(codigoNumerico) && codigoMesa.length >= 3;
    const paso = imagen ? (estado.tipo === 'ok' || estado.tipo === 'encolado_offline' ? 3 : 2) : (tieneCodigo ? 1 : 0);

    async function capturarFoto() {
        if (!tieneCodigo) {
            setEstado({ tipo: 'error', mensaje: 'Primero ingresa el código de mesa' });
            return;
        }
        const asset = await tomarFoto();
        if (asset) {
            setImagen(asset);
            setEstado({ tipo: 'idle' });
            await storage.guardarConfig({ ultimaMesa: codigoMesa });
            // Pedir ubicación en background
            obtenerUbicacion().catch(() => {});
        }
    }

    async function elegirFoto() {
        if (!tieneCodigo) {
            setEstado({ tipo: 'error', mensaje: 'Primero ingresa el código de mesa' });
            return;
        }
        const asset = await elegirDeGaleria();
        if (asset) {
            setImagen(asset);
            setEstado({ tipo: 'idle' });
            await storage.guardarConfig({ ultimaMesa: codigoMesa });
        }
    }

    async function enviar() {
        if (!imagen || !tieneCodigo) return;
        const id = `${Date.now()}-${codigoNumerico}`;
        const mimeType = imagen.mimeType || 'image/jpeg';

        // Si estamos offline, encolar directamente
        if (!online) {
            await storage.agregarACola({
                id,
                codigo_mesa: codigoNumerico,
                uri: imagen.uri,
                mimeType,
                timestamp: Date.now(),
                intentos: 0,
                location: ubicacion ? { lat: ubicacion.lat, lon: ubicacion.lon } : null,
            });
            await storage.agregarHistorial({
                id,
                codigo_mesa: codigoNumerico,
                estado: 'pendiente',
                mensaje: 'Encolada — se reintentará al recuperar conexión',
                timestamp: Date.now(),
                uri: imagen.uri,
                location: ubicacion ? { lat: ubicacion.lat, lon: ubicacion.lon } : null,
            });
            setEstado({ tipo: 'encolado_offline' });
            onCambio();
            return;
        }

        setEstado({ tipo: 'subiendo' });
        try {
            const r = await api.enviarActaPdf(imagen.uri, codigoNumerico, mimeType);
            await storage.agregarHistorial({
                id,
                codigo_mesa: codigoNumerico,
                estado: 'enviado',
                hash: r.hash_pdf,
                mensaje: r.status,
                timestamp: Date.now(),
                uri: imagen.uri,
                location: ubicacion ? { lat: ubicacion.lat, lon: ubicacion.lon } : null,
            });
            setEstado({ tipo: 'ok', hash: r.hash_pdf });
            onCambio();
        } catch (err: any) {
            // Si falló pero no era por offline, encolar igual para reintentar
            await storage.agregarACola({
                id,
                codigo_mesa: codigoNumerico,
                uri: imagen.uri,
                mimeType,
                timestamp: Date.now(),
                intentos: 1,
                location: ubicacion ? { lat: ubicacion.lat, lon: ubicacion.lon } : null,
            });
            setEstado({ tipo: 'error', mensaje: err.message || 'error de red' });
            onCambio();
        }
    }

    function reiniciar() {
        setImagen(null);
        setEstado({ tipo: 'idle' });
    }

    return (
        <Card titulo="Capturar nueva acta">
            <Pasos actual={paso} />

            <Input
                label="Código de mesa"
                value={codigoMesa}
                onChangeText={(v) => setCodigoMesa(v.replace(/\D/g, ''))}
                placeholder="ej. 10101001001"
                keyboardType="number-pad"
                maxLength={11}
                deshabilitado={estado.tipo === 'subiendo'}
            />

            {!imagen ? (
                <View style={{ gap: spacing.md }}>
                    <Boton
                        titulo="Tomar foto del acta"
                        icono="camera"
                        onPress={capturarFoto}
                        cargando={cargando}
                    />
                    <Boton
                        titulo="Elegir de galería"
                        icono="images"
                        variante="secondary"
                        onPress={elegirFoto}
                        cargando={cargando}
                    />
                </View>
            ) : (
                <>
                    <View style={styles.preview}>
                        <Image source={{ uri: imagen.uri }} style={styles.imagen} />
                    </View>

                    {ubicacion && (
                        <View style={styles.geo}>
                            <Ionicons name="location" size={14} color={colors.success} />
                            <Text style={styles.geoText}>
                                {ubicacion.lat.toFixed(5)}, {ubicacion.lon.toFixed(5)}
                            </Text>
                        </View>
                    )}

                    {estado.tipo === 'idle' && (
                        <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                            <Boton
                                titulo={online ? 'Enviar al servidor RRV' : 'Encolar para envío'}
                                icono={online ? 'cloud-upload' : 'cloud-offline'}
                                onPress={enviar}
                            />
                            <Boton titulo="Volver a tomar" variante="secondary" onPress={reiniciar} />
                        </View>
                    )}

                    {estado.tipo === 'subiendo' && (
                        <Estado tipo="loading" titulo="Enviando al servidor..." detalle="Pipeline RRV" />
                    )}

                    {estado.tipo === 'ok' && (
                        <>
                            <Estado
                                tipo="success"
                                titulo="Acta encolada en RRV"
                                detalle={estado.hash ? `Hash: ${estado.hash.slice(0, 16)}` : undefined}
                            />
                            <Boton
                                titulo="Capturar otra acta"
                                variante="secondary"
                                onPress={reiniciar}
                                estilo={{ marginTop: spacing.md }}
                            />
                        </>
                    )}

                    {estado.tipo === 'encolado_offline' && (
                        <>
                            <Estado
                                tipo="info"
                                titulo="Guardada para envío diferido"
                                detalle="Se reintentará automáticamente al recuperar conexión"
                            />
                            <Boton
                                titulo="Capturar otra acta"
                                variante="secondary"
                                onPress={reiniciar}
                                estilo={{ marginTop: spacing.md }}
                            />
                        </>
                    )}

                    {estado.tipo === 'error' && (
                        <>
                            <Estado tipo="error" titulo="Error al enviar" detalle={estado.mensaje} />
                            <Boton
                                titulo="Reintentar"
                                onPress={enviar}
                                estilo={{ marginTop: spacing.md }}
                            />
                            <Boton
                                titulo="Volver a tomar"
                                variante="secondary"
                                onPress={reiniciar}
                                estilo={{ marginTop: spacing.sm }}
                            />
                        </>
                    )}
                </>
            )}
        </Card>
    );
}

const styles = StyleSheet.create({
    preview: {
        borderRadius: radius.md,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: 'black',
        marginBottom: spacing.md,
    },
    imagen: {
        width: '100%',
        aspectRatio: 3 / 4,
    },
    geo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        backgroundColor: 'rgba(6,214,160,0.1)',
        borderRadius: radius.sm,
        alignSelf: 'flex-start',
        marginBottom: spacing.sm,
    },
    geoText: {
        ...typography.caption,
        color: colors.success,
        fontWeight: '600',
    },
});
