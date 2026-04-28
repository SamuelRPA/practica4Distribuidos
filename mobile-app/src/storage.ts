// Persistencia local con AsyncStorage para:
// - Histórico de envíos
// - Cola offline de envíos pendientes (cuando no hay conectividad)
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface EntradaHistorial {
    id: string;
    codigo_mesa: number;
    estado: 'enviado' | 'fallido' | 'pendiente';
    mensaje?: string;
    hash?: string;
    timestamp: number;
    uri?: string;
    location?: { lat: number; lon: number } | null;
}

export interface EnvioPendiente {
    id: string;
    codigo_mesa: number;
    uri: string;
    mimeType: string;
    timestamp: number;
    intentos: number;
    location?: { lat: number; lon: number } | null;
}

const KEY_HISTORIAL = '@oep:historial';
const KEY_COLA = '@oep:cola_offline';
const KEY_CONFIG = '@oep:config';

export const storage = {
    // ----- Historial -----
    async leerHistorial(): Promise<EntradaHistorial[]> {
        const json = await AsyncStorage.getItem(KEY_HISTORIAL);
        return json ? JSON.parse(json) : [];
    },

    async agregarHistorial(item: EntradaHistorial, max = 30): Promise<void> {
        const actual = await this.leerHistorial();
        const nuevo = [item, ...actual].slice(0, max);
        await AsyncStorage.setItem(KEY_HISTORIAL, JSON.stringify(nuevo));
    },

    async limpiarHistorial(): Promise<void> {
        await AsyncStorage.removeItem(KEY_HISTORIAL);
    },

    // ----- Cola offline -----
    async leerCola(): Promise<EnvioPendiente[]> {
        const json = await AsyncStorage.getItem(KEY_COLA);
        return json ? JSON.parse(json) : [];
    },

    async agregarACola(item: EnvioPendiente): Promise<void> {
        const actual = await this.leerCola();
        actual.push(item);
        await AsyncStorage.setItem(KEY_COLA, JSON.stringify(actual));
    },

    async eliminarDeCola(id: string): Promise<void> {
        const actual = await this.leerCola();
        await AsyncStorage.setItem(KEY_COLA, JSON.stringify(actual.filter((x) => x.id !== id)));
    },

    async actualizarEnCola(id: string, parcial: Partial<EnvioPendiente>): Promise<void> {
        const actual = await this.leerCola();
        await AsyncStorage.setItem(
            KEY_COLA,
            JSON.stringify(actual.map((x) => (x.id === id ? { ...x, ...parcial } : x))),
        );
    },

    // ----- Config persistente del operador -----
    async leerConfig(): Promise<{ ultimaMesa?: string; operador?: string }> {
        const json = await AsyncStorage.getItem(KEY_CONFIG);
        return json ? JSON.parse(json) : {};
    },

    async guardarConfig(parcial: { ultimaMesa?: string; operador?: string }): Promise<void> {
        const actual = await this.leerConfig();
        await AsyncStorage.setItem(KEY_CONFIG, JSON.stringify({ ...actual, ...parcial }));
    },
};
