// Hace ping al backend cada 10s para reflejar el estado online/offline.
// Cuando vuelve online, dispara el procesamiento de la cola pendiente.
import { useEffect, useState } from 'react';
import { api } from '../api';

export function useConectividad() {
    const [online, setOnline] = useState<boolean>(true);
    const [verificando, setVerificando] = useState(false);

    useEffect(() => {
        let cancelado = false;

        async function check() {
            setVerificando(true);
            const ok = await api.ping();
            if (!cancelado) setOnline(ok);
            setVerificando(false);
        }

        check();
        const interval = setInterval(check, 10_000);
        return () => {
            cancelado = true;
            clearInterval(interval);
        };
    }, []);

    return { online, verificando };
}
