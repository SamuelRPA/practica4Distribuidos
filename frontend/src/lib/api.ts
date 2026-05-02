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

async function jsonDelete<T>(path: string, body?: unknown): Promise<T> {
    const r = await fetch(`${BASE}${path}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
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
    tiempos: (depto?: string, prov?: string) => {
        let url = '/api/dashboard/tiempos';
        if (depto && prov) {
            url += `?depto=${encodeURIComponent(depto)}&prov=${encodeURIComponent(prov)}`;
        }
        return jsonGet<any>(url);
    },

    getProvincias: (depto: string) => jsonGet<string[]>(`/api/dashboard/jerarquia/provincias?depto=${encodeURIComponent(depto)}`),
    getRecintos: (depto: string, prov: string) => jsonGet<any[]>(`/api/dashboard/jerarquia/recintos?depto=${encodeURIComponent(depto)}&prov=${encodeURIComponent(prov)}`),
    getMesas: (idRecinto: string) => jsonGet<any[]>(`/api/dashboard/jerarquia/mesas?recinto=${encodeURIComponent(idRecinto)}`),
    getMesaDetalle: (codigoMesa: string) => jsonGet<any>(`/api/dashboard/jerarquia/mesaDetalle?mesa=${encodeURIComponent(codigoMesa)}`),

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
    mesaInfo: (codigoMesa: number | string) => jsonGet<any>(`/api/oficial/mesa-info/${codigoMesa}`),

    // CRUD oficial - actas
    listarActas: (filtros: { limit?: number; estado?: string; mesa?: number } = {}) => {
        const qs = new URLSearchParams();
        if (filtros.limit) qs.set('limit', String(filtros.limit));
        if (filtros.estado) qs.set('estado', filtros.estado);
        if (filtros.mesa) qs.set('mesa', String(filtros.mesa));
        const s = qs.toString();
        return jsonGet<any[]>(`/api/oficial/actas${s ? '?' + s : ''}`);
    },
    anularActa: (id: string, motivo?: string) =>
        jsonDelete<any>(`/api/oficial/acta/${id}`, { motivo, modificado_por: 'admin_web' }),

    // CRUD oficial - mesas
    listarMesasCrud: (filtros: { limit?: number; recinto?: number; q?: string } = {}) => {
        const qs = new URLSearchParams();
        if (filtros.limit) qs.set('limit', String(filtros.limit));
        if (filtros.recinto) qs.set('recinto', String(filtros.recinto));
        if (filtros.q) qs.set('q', filtros.q);
        const s = qs.toString();
        return jsonGet<any[]>(`/api/oficial/mesas${s ? '?' + s : ''}`);
    },
    crearMesa: (data: { codigo_mesa: number; nro_mesa: number; cantidad_habilitada: number; id_recinto: number }) =>
        jsonPost<any>('/api/oficial/mesa', data),
    eliminarMesa: (codigoMesa: number) =>
        jsonDelete<any>(`/api/oficial/mesa/${codigoMesa}`),
    listarRecintosTodos: () => jsonGet<any[]>('/api/oficial/recintos'),

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
