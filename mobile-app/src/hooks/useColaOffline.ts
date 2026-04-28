// Procesa la cola de envíos pendientes cuando hay conectividad.
import { useEffect, useRef } from 'react';
import { api } from '../api';
import { storage, EnvioPendiente } from '../storage';

export function useColaOffline(online: boolean, onProcesado: () => void) {
    const procesando = useRef(false);

    useEffect(() => {
        if (!online || procesando.current) return;

        (async () => {
            const cola = await storage.leerCola();
            if (cola.length === 0) return;

            procesando.current = true;
            try {
                for (const item of cola) {
                    if (item.intentos >= 5) {
                        // Demasiados intentos — marcar como fallido y sacar de la cola
                        await storage.eliminarDeCola(item.id);
                        await storage.agregarHistorial({
                            id: item.id,
                            codigo_mesa: item.codigo_mesa,
                            estado: 'fallido',
                            mensaje: 'Eliminado tras 5 intentos fallidos',
                            timestamp: item.timestamp,
                            uri: item.uri,
                            location: item.location,
                        });
                        continue;
                    }

                    try {
                        const r = await api.enviarActaPdf(item.uri, item.codigo_mesa, item.mimeType);
                        await storage.eliminarDeCola(item.id);
                        await storage.agregarHistorial({
                            id: item.id,
                            codigo_mesa: item.codigo_mesa,
                            estado: 'enviado',
                            hash: r.hash_pdf,
                            mensaje: r.status,
                            timestamp: Date.now(),
                            uri: item.uri,
                            location: item.location,
                        });
                    } catch (err: any) {
                        await storage.actualizarEnCola(item.id, { intentos: item.intentos + 1 });
                    }
                }
                onProcesado();
            } finally {
                procesando.current = false;
            }
        })();
    }, [online]);
}
