'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Zap, RefreshCw, FileImage, MessageSquare, Edit3, Search,
    CheckCircle, AlertTriangle, XCircle, Eye, Clock, Hash,
    TrendingUp, Layers, Wifi, WifiOff,
} from 'lucide-react';
import { api } from '@/lib/api';

const ORIGENES = [
    { value: '', label: 'Todos los orígenes' },
    { value: 'PDF', label: 'PDF (App móvil)' },
    { value: 'SMS', label: 'SMS' },
    { value: 'MANUAL', label: 'Manual' },
    { value: 'N8N', label: 'N8N' },
    { value: 'OCR', label: 'OCR' },
];

const ESTADOS = [
    { value: '', label: 'Todos los estados' },
    { value: 'APROBADA', label: 'Aprobadas' },
    { value: 'EN_VERIFICACION', label: 'En verificación' },
    { value: 'EN_OBSERVACION', label: 'En observación' },
    { value: 'RECHAZADA', label: 'Rechazadas' },
];

export default function RrvPage() {
    const [actas, setActas] = useState<any[]>([]);
    const [resumen, setResumen] = useState<any>(null);
    const [origen, setOrigen] = useState('');
    const [estado, setEstado] = useState('');
    const [mesa, setMesa] = useState('');
    const [loading, setLoading] = useState(false);
    const [conexion, setConexion] = useState<'conectando' | 'ok' | 'error'>('conectando');
    const [ultima, setUltima] = useState<Date | null>(null);
    const [actaDetalle, setActaDetalle] = useState<any>(null);

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    async function cargar() {
        setLoading(true);
        try {
            const [a, r] = await Promise.all([
                api.listarActasRrv({
                    origen: origen || undefined,
                    estado: estado || undefined,
                    mesa: mesa ? parseInt(mesa, 10) : undefined,
                    limit: 200,
                }),
                api.rrvResumen().catch(() => null),
            ]);
            setActas(a);
            setResumen(r);
            setUltima(new Date());
            setConexion('ok');
        } catch {
            setConexion('error');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [origen, estado]);

    useEffect(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(cargar, 3000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
        // eslint-disable-next-line
    }, [origen, estado, mesa]);

    async function rechazar(a: any) {
        const motivo = prompt(`Motivo del rechazo del acta de mesa ${a.codigo_mesa}:`);
        if (!motivo) return;
        await api.cambiarEstadoActaRrv(String(a._id), 'RECHAZADA', motivo);
        cargar();
    }

    async function aprobar(a: any) {
        if (!confirm(`¿Aprobar manualmente el acta de mesa ${a.codigo_mesa}?`)) return;
        await api.cambiarEstadoActaRrv(String(a._id), 'APROBADA', 'Aprobación manual desde panel');
        cargar();
    }

    async function ponerEnObservacion(a: any) {
        const motivo = prompt(`Motivo para poner el acta en observación:`);
        if (!motivo) return;
        await api.cambiarEstadoActaRrv(String(a._id), 'EN_OBSERVACION', motivo);
        cargar();
    }

    async function eliminar(a: any) {
        if (!confirm(`¿Eliminar DEFINITIVAMENTE el acta de mesa ${a.codigo_mesa}? Esta acción no se puede deshacer.`)) return;
        try {
            await api.eliminarActaRrv(String(a._id));
            cargar();
        } catch (err: any) {
            alert('Error eliminando: ' + (err.message || err));
        }
    }

    const stats = useMemo(() => {
        const por = (filtro: (a: any) => boolean) => actas.filter(filtro).length;
        return {
            total: actas.length,
            aprobadas: por((a) => a.estado === 'APROBADA'),
            observacion: por((a) => a.estado === 'EN_OBSERVACION' || a.estado === 'EN_VERIFICACION'),
            rechazadas: por((a) => a.estado === 'RECHAZADA'),
            pdf: por((a) => a.fuente === 'PDF' || a.fuente === 'OCR'),
            sms: por((a) => a.fuente === 'SMS'),
            manual: por((a) => a.fuente === 'MANUAL' || a.fuente === 'N8N'),
        };
    }, [actas]);

    return (
        <div>
            <header className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div className="icon-wrap" style={{ background: 'linear-gradient(135deg, #fef3c7, #fcd34d)', color: '#92400e' }}>
                        <Zap size={22} />
                    </div>
                    <div>
                        <h1>Cómputo Rápido (RRV)</h1>
                        <p className="lead">Pipeline rápido — actas desde PDF (móvil), SMS y N8N. Tiempo real cada 3s.</p>
                    </div>
                </div>
                <div className="badge" style={{
                    background: conexion === 'ok' ? 'var(--c-success-soft)' : 'var(--c-danger-soft)',
                    borderColor: conexion === 'ok' ? '#a7f3d0' : '#fecaca',
                    color: conexion === 'ok' ? '#065f46' : '#991b1b',
                }}>
                    {conexion === 'ok' ? <Wifi size={14} /> : <WifiOff size={14} />}
                    {conexion === 'ok' ? 'En vivo' : 'Reconectando'}
                    {ultima && <span style={{ marginLeft: 8, fontWeight: 400 }}>{ultima.toLocaleTimeString()}</span>}
                </div>
            </header>

            <div className="grid grid-cols-4" style={{ marginBottom: 24 }}>
                <KpiBox label="Total RRV" value={stats.total} icon={Layers} accent="default" />
                <KpiBox label="Aprobadas" value={stats.aprobadas} icon={CheckCircle} accent="green" />
                <KpiBox label="En observación" value={stats.observacion} icon={AlertTriangle} accent="orange" />
                <KpiBox label="Rechazadas" value={stats.rechazadas} icon={XCircle} accent="purple" />
            </div>

            <div className="grid grid-cols-3" style={{ marginBottom: 24 }}>
                <OrigenCard label="Desde móvil (PDF)" value={stats.pdf} icon={FileImage} color="#2563eb" />
                <OrigenCard label="Desde SMS" value={stats.sms} icon={MessageSquare} color="#10b981" />
                <OrigenCard label="Manual / N8N" value={stats.manual} icon={Edit3} color="#8b5cf6" />
            </div>

            <div className="card" style={{ marginBottom: 0 }}>
                <div className="toolbar">
                    <h3 style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 0 }}>
                        <TrendingUp size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                        Actas RRV ({actas.length})
                    </h3>
                    <span className="spacer" />
                    <select value={origen} onChange={(e) => setOrigen(e.target.value)}>
                        {ORIGENES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select value={estado} onChange={(e) => setEstado(e.target.value)}>
                        {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                    </select>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-muted)' }} />
                        <input
                            type="number"
                            placeholder="Mesa..."
                            value={mesa}
                            onChange={(e) => setMesa(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && cargar()}
                            style={{ paddingLeft: 30, minWidth: 120 }}
                        />
                    </div>
                    <button className="secondary" onClick={cargar} disabled={loading}>
                        <RefreshCw size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                        Refrescar
                    </button>
                </div>

                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Mesa</th>
                                <th>Origen</th>
                                <th>Estado</th>
                                <th>Confianza</th>
                                <th>Recibido</th>
                                <th>Versión</th>
                                <th>Resultado</th>
                                <th style={{ textAlign: 'right' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {actas.map((a) => (
                                <tr key={a._id}>
                                    <td><code>{a.codigo_mesa}</code></td>
                                    <td><OrigenBadge fuente={a.fuente} /></td>
                                    <td><EstadoRrvBadge estado={a.estado} /></td>
                                    <td style={{ fontSize: 12 }}>
                                        {a.confianza_global != null
                                            ? <span style={{ color: a.confianza_global >= 0.8 ? '#065f46' : a.confianza_global >= 0.5 ? '#92400e' : '#991b1b', fontWeight: 600 }}>
                                                {(a.confianza_global * 100).toFixed(0)}%
                                            </span>
                                            : <span style={{ color: 'var(--c-text-muted)' }}>—</span>}
                                    </td>
                                    <td style={{ fontSize: 12 }}>
                                        <Clock size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                                        {a.timestamp_recepcion ? new Date(a.timestamp_recepcion).toLocaleTimeString() : '—'}
                                    </td>
                                    <td>
                                        {a.es_version_activa
                                            ? <span className="badge info" style={{ fontSize: 10 }}><Hash size={10} />{a.ingreso_numero || 1}</span>
                                            : <span className="badge muted" style={{ fontSize: 10 }}>histórica</span>}
                                    </td>
                                    <td style={{ fontSize: 12 }}>
                                        {a.datos_interpretados ? (
                                            <span style={{ color: 'var(--c-text-muted)' }}>
                                                VE:{a.datos_interpretados.votos_emitidos} | P1:{a.datos_interpretados.p1} P2:{a.datos_interpretados.p2}
                                            </span>
                                        ) : '—'}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button className="ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setActaDetalle(a)}>
                                            <Eye size={12} />
                                        </button>
                                        {a.estado !== 'APROBADA' && (
                                            <button className="secondary" style={{ fontSize: 11, padding: '4px 8px', marginLeft: 4 }} onClick={() => aprobar(a)}>
                                                Aprobar
                                            </button>
                                        )}
                                        {a.estado !== 'EN_OBSERVACION' && a.estado !== 'RECHAZADA' && (
                                            <button className="secondary" style={{ fontSize: 11, padding: '4px 8px', marginLeft: 4 }} onClick={() => ponerEnObservacion(a)}>
                                                Observar
                                            </button>
                                        )}
                                        {a.estado !== 'RECHAZADA' && (
                                            <button className="danger" style={{ fontSize: 11, padding: '4px 8px', marginLeft: 4 }} onClick={() => rechazar(a)}>
                                                Rechazar
                                            </button>
                                        )}
                                        <button
                                            className="danger"
                                            style={{ fontSize: 11, padding: '4px 8px', marginLeft: 4, opacity: 0.7 }}
                                            title="Eliminar permanentemente"
                                            onClick={() => eliminar(a)}
                                        >
                                            🗑
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {actas.length === 0 && (
                                <tr><td colSpan={8} className="empty">{loading ? 'Cargando...' : 'No hay actas RRV para los filtros seleccionados.'}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {actaDetalle && <ModalDetalle a={actaDetalle} onClose={() => setActaDetalle(null)} />}
        </div>
    );
}

function KpiBox({ label, value, icon: Icon, accent }: any) {
    const cls = accent === 'green' ? 'kpi green' : accent === 'orange' ? 'kpi orange' : accent === 'purple' ? 'kpi purple' : 'kpi';
    return (
        <div className={`card ${cls}`} style={{ marginBottom: 0 }}>
            <span className="label"><Icon size={14} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />{label}</span>
            <span className="value">{value.toLocaleString()}</span>
        </div>
    );
}

function OrigenCard({ label, value, icon: Icon, color }: any) {
    return (
        <div className="card" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ background: `${color}1a`, color, padding: 12, borderRadius: 12, display: 'inline-flex' }}>
                <Icon size={22} />
            </div>
            <div>
                <div style={{ fontSize: 12, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                    {label}
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--c-text)' }}>{value.toLocaleString()}</div>
            </div>
        </div>
    );
}

function OrigenBadge({ fuente }: { fuente?: string }) {
    if (!fuente) return <span className="badge muted" style={{ fontSize: 10 }}>—</span>;
    const map: Record<string, { color: string; bg: string; label: string; Icon: any }> = {
        PDF:    { color: '#1e40af', bg: '#dbeafe', label: 'PDF', Icon: FileImage },
        OCR:    { color: '#1e40af', bg: '#dbeafe', label: 'OCR', Icon: FileImage },
        SMS:    { color: '#065f46', bg: '#d1fae5', label: 'SMS', Icon: MessageSquare },
        MANUAL: { color: '#5b21b6', bg: '#ede9fe', label: 'Manual', Icon: Edit3 },
        N8N:    { color: '#5b21b6', bg: '#ede9fe', label: 'N8N', Icon: Edit3 },
    };
    const v = map[fuente] || { color: '#475569', bg: '#f1f5f9', label: fuente, Icon: Layers };
    const Icon = v.Icon;
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: v.bg, color: v.color, fontSize: 11, fontWeight: 600 }}>
            <Icon size={11} /> {v.label}
        </span>
    );
}

function EstadoRrvBadge({ estado }: { estado?: string }) {
    const map: Record<string, string> = {
        APROBADA: 'badge',
        EN_VERIFICACION: 'badge info',
        EN_OBSERVACION: 'badge warn',
        RECHAZADA: 'badge danger',
    };
    return <span className={map[estado || ''] || 'badge muted'} style={{ fontSize: 11 }}>{estado || 'PENDIENTE'}</span>;
}

function ModalDetalle({ a, onClose }: { a: any; onClose: () => void }) {
    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0 }}>Acta mesa {a.codigo_mesa}</h3>
                    <button className="ghost" onClick={onClose}>×</button>
                </div>
                <pre style={{ background: 'var(--c-surface-2)', padding: 14, borderRadius: 8, fontSize: 12, overflow: 'auto', maxHeight: '60vh' }}>
                    {JSON.stringify(a, null, 2)}
                </pre>
                <div className="modal-actions">
                    <button className="secondary" onClick={onClose}>Cerrar</button>
                </div>
            </div>
        </div>
    );
}
