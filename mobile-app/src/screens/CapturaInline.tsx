// Card de captura — el formulario completo embebido en home.
// Lógica:
// 1. Operador pone código de mesa (validación opcional contra backend)
// 2. Toma foto o elige de galería
// 3. (opcional) captura ubicación GPS
// 4. Manda al backend; si falla por red, encola para reintento offline
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, ScrollView } from 'react-native';
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
    
    // Campos del acta (Izquierda)
    const [habilitados, setHabilitados] = useState('');
    const [papeletasAnfora, setPapeletasAnfora] = useState('');
    
    // Campos del acta (Centro Azul - Candidatos)
    const [p1, setP1] = useState(''); // Daenerys Targaryen
    const [p2, setP2] = useState(''); // Sansa Stark
    const [p3, setP3] = useState(''); // Robert Baratheon
    const [p4, setP4] = useState(''); // Tyrion Lannister
    
    // Campos del acta (Centro Azul - Abajo)
    const [votosValidos, setVotosValidos] = useState('');
    const [votosBlancos, setVotosBlancos] = useState('');
    const [votosNulos, setVotosNulos] = useState('');

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
            
            // Opcional: si la API soportara los votos manuales, se enviarían aquí.
            
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
        setP1(''); setP2(''); setP3(''); setP4('');
        setHabilitados(''); setPapeletasAnfora('');
        setVotosValidos(''); setVotosBlancos(''); setVotosNulos('');
        setEstado({ tipo: 'idle' });
    }

    return (
        <Card titulo="Capturar nueva acta">
            <Pasos actual={paso} />

            {/* Formulario estructurado como el Acta Electoral */}
            <View style={styles.actaContainer}>
                
                {/* Columna Izquierda: Información de Mesa */}
                <View style={styles.columnaGris}>
                    <Text style={styles.columnaTituloAlt}>MESA</Text>
                    <Input
                        label="Cód. Mesa"
                        value={codigoMesa}
                        onChangeText={(v) => setCodigoMesa(v.replace(/\D/g, ''))}
                        placeholder="ej. 101112"
                        keyboardType="number-pad"
                        maxLength={11}
                        deshabilitado={estado.tipo === 'subiendo'}
                    />
                    <Input
                        label="Electores habilitados"
                        value={habilitados}
                        onChangeText={(v) => setHabilitados(v.replace(/\D/g, ''))}
                        keyboardType="number-pad"
                        deshabilitado={estado.tipo === 'subiendo'}
                    />
                    <Input
                        label="Papeletas en ánfora"
                        value={papeletasAnfora}
                        onChangeText={(v) => setPapeletasAnfora(v.replace(/\D/g, ''))}
                        keyboardType="number-pad"
                        deshabilitado={estado.tipo === 'subiendo'}
                    />
                </View>

                {/* Columna Derecha/Central: Franja Azul (Presidente) */}
                <View style={styles.columnaAzul}>
                    <Text style={styles.columnaTituloAzul}>PRESIDENTE</Text>
                    
                    <View style={styles.candidatosSection}>
                        <Input
                            label="Daenerys Targaryen"
                            value={p1}
                            onChangeText={(v) => setP1(v.replace(/\D/g, ''))}
                            keyboardType="number-pad"
                            deshabilitado={estado.tipo === 'subiendo'}
                        />
                        <Input
                            label="Sansa Stark"
                            value={p2}
                            onChangeText={(v) => setP2(v.replace(/\D/g, ''))}
                            keyboardType="number-pad"
                            deshabilitado={estado.tipo === 'subiendo'}
                        />
                        <Input
                            label="Robert Baratheon"
                            value={p3}
                            onChangeText={(v) => setP3(v.replace(/\D/g, ''))}
                            keyboardType="number-pad"
                            deshabilitado={estado.tipo === 'subiendo'}
                        />
                        <Input
                            label="Tyrion Lannister"
                            value={p4}
                            onChangeText={(v) => setP4(v.replace(/\D/g, ''))}
                            keyboardType="number-pad"
                            deshabilitado={estado.tipo === 'subiendo'}
                        />
                    </View>

                    <View style={styles.votosSection}>
                        <Input
                            label="VOTOS VÁLIDOS"
                            value={votosValidos}
                            onChangeText={(v) => setVotosValidos(v.replace(/\D/g, ''))}
                            keyboardType="number-pad"
                            deshabilitado={estado.tipo === 'subiendo'}
                        />
                        <Input
                            label="VOTOS BLANCOS"
                            value={votosBlancos}
                            onChangeText={(v) => setVotosBlancos(v.replace(/\D/g, ''))}
                            keyboardType="number-pad"
                            deshabilitado={estado.tipo === 'subiendo'}
                        />
                        <Input
                            label="VOTOS NULOS"
                            value={votosNulos}
                            onChangeText={(v) => setVotosNulos(v.replace(/\D/g, ''))}
                            keyboardType="number-pad"
                            deshabilitado={estado.tipo === 'subiendo'}
                        />
                    </View>
                </View>

            </View>

            {!imagen ? (
                <View style={{ gap: spacing.md, marginTop: spacing.md }}>
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
    actaContainer: {
        flexDirection: 'row',
        gap: spacing.md,
        marginBottom: spacing.sm,
    },
    columnaGris: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: radius.md,
        padding: spacing.sm,
    },
    columnaAzul: {
        flex: 1.5,
        backgroundColor: '#9fb3c8', // Azul grisáceo como en la imagen
        borderColor: '#7a93b2',
        borderWidth: 1,
        borderRadius: radius.md,
        padding: spacing.sm,
    },
    columnaTituloAlt: {
        ...typography.label,
        color: '#555',
        textAlign: 'center',
        marginBottom: spacing.sm,
        fontWeight: 'bold',
        backgroundColor: '#e0e0e0',
        paddingVertical: 4,
        borderRadius: 4,
    },
    columnaTituloAzul: {
        ...typography.label,
        color: '#224466',
        textAlign: 'center',
        marginBottom: spacing.md,
        fontWeight: 'bold',
        backgroundColor: '#7a93b2',
        paddingVertical: 4,
        borderRadius: 4,
        overflow: 'hidden',
    },
    candidatosSection: {
        marginBottom: spacing.md,
    },
    votosSection: {
        borderTopWidth: 2,
        borderTopColor: '#7a93b2',
        paddingTop: spacing.md,
    },
    preview: {
        borderRadius: radius.md,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: 'black',
        marginBottom: spacing.md,
        marginTop: spacing.sm,
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

