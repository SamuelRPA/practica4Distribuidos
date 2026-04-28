import { config } from './config';

export interface RespuestaActaPdf {
    status?: string;
    codigo_mesa?: number;
    hash_pdf?: string;
    error?: string;
}

export interface MesaInfo {
    codigo_mesa: number;
    cantidad_habilitada?: number;
    nro_mesa?: number;
}

const TIMEOUT = config.timeoutMs;

async function fetchConTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
}

export const api = {
    /**
     * Sube una imagen/PDF al pipeline RRV.
     * Acepta image/jpeg, image/png o application/pdf — el backend lo manda al OCR.
     */
    async enviarActaPdf(uri: string, codigoMesa: number, mimeType = 'image/jpeg'): Promise<RespuestaActaPdf> {
        const fd = new FormData();
        // RN espera este formato específico para FormData
        fd.append('file', {
            uri,
            name: `acta_${codigoMesa}_${Date.now()}.${mimeType.split('/')[1]}`,
            type: mimeType,
        } as any);
        fd.append('codigo_mesa', String(codigoMesa));

        const r = await fetchConTimeout(`${config.apiBaseUrl}/api/rrv/acta-pdf`, {
            method: 'POST',
            body: fd,
        });

        if (!r.ok) {
            const text = await r.text();
            throw new Error(`HTTP ${r.status}: ${text}`);
        }
        return r.json();
    },

    /**
     * Consulta el acta activa de una mesa para mostrar contexto.
     */
    async consultarMesa(codigo: number): Promise<MesaInfo | null> {
        try {
            const r = await fetchConTimeout(`${config.apiBaseUrl}/api/rrv/mesa/${codigo}`);
            if (r.status === 404) return null;
            if (!r.ok) return null;
            const json = await r.json();
            return { codigo_mesa: codigo, ...json };
        } catch {
            return null;
        }
    },

    async ping(): Promise<boolean> {
        try {
            const r = await fetchConTimeout(`${config.apiBaseUrl}/api/dashboard/health`);
            return r.ok;
        } catch {
            return false;
        }
    },
};
