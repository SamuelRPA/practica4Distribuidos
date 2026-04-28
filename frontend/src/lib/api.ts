const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

async function jsonGet<T>(path: string): Promise<T> {
    const r = await fetch(`${BASE}${path}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
}

async function jsonPost<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
    });
    return r.json();
}

export const api = {
    rrvResumen: () => jsonGet<{ estados: any[]; totales: any; ingestaPorHora: any[] }>('/api/rrv/resumen'),
    oficialResumen: () => jsonGet<{
        totales: any; participacion: any[]; estados: any[]; ingesta: any[]; errores: any[];
    }>('/api/oficial/resumen'),
    comparacion: () => jsonGet<{ rrv: any; oficial: any }>('/api/dashboard/comparacion'),

    enviarSms: (payload: { numero_origen: string; texto: string }) =>
        jsonPost('/api/rrv/sms', payload),

    enviarActaPdf: async (file: File, codigoMesa: number) => {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('codigo_mesa', String(codigoMesa));
        const r = await fetch(`${BASE}/api/rrv/acta-pdf`, { method: 'POST', body: fd });
        return r.json();
    },

    enviarActaOficial: (acta: any) => jsonPost('/api/oficial/acta', acta),

    // SMS admin
    listarNumerosSms: () => jsonGet<any[]>('/api/sms/numeros'),
    agregarNumeroSms: (data: { numero: string; etiqueta?: string; recinto?: string; proveedor?: string }) =>
        jsonPost('/api/sms/numeros', data),
    eliminarNumeroSms: async (id: string) => {
        await fetch(`${BASE}/api/sms/numeros/${id}`, { method: 'DELETE' });
    },
    toggleNumeroSms: (id: string, activo: boolean) =>
        fetch(`${BASE}/api/sms/numeros/${id}/toggle`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activo }),
        }).then((r) => r.json()),
    listarMensajesSms: (limit = 50) => jsonGet<any[]>(`/api/sms/mensajes?limit=${limit}`),
    simularSms: (numero_origen: string, texto: string) =>
        jsonPost('/api/sms/webhook/generico', { numero_origen, texto }),
};
