// Hook para obtener la ubicación del operador al capturar el acta.
// La ubicación se manda al backend para asociar con el recinto.
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export interface Coordenadas {
    lat: number;
    lon: number;
    accuracy?: number;
}

export function useUbicacion() {
    const [permitido, setPermitido] = useState<boolean | null>(null);
    const [ubicacion, setUbicacion] = useState<Coordenadas | null>(null);

    useEffect(() => {
        (async () => {
            const { status } = await Location.getForegroundPermissionsAsync();
            setPermitido(status === 'granted');
        })();
    }, []);

    async function pedirPermiso(): Promise<boolean> {
        const { status } = await Location.requestForegroundPermissionsAsync();
        const ok = status === 'granted';
        setPermitido(ok);
        return ok;
    }

    async function obtenerUbicacion(): Promise<Coordenadas | null> {
        if (!permitido) {
            const ok = await pedirPermiso();
            if (!ok) return null;
        }
        try {
            const pos = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });
            const coords: Coordenadas = {
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                accuracy: pos.coords.accuracy ?? undefined,
            };
            setUbicacion(coords);
            return coords;
        } catch {
            return null;
        }
    }

    return { permitido, ubicacion, pedirPermiso, obtenerUbicacion };
}
