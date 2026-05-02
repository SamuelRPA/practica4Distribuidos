'use client';

import { useEffect, useState } from 'react';
import {
    MessageSquare, Phone, Send, Plus, Trash2, Power, RefreshCw,
    CheckCircle, AlertTriangle, XCircle, Inbox, Hash, Clock,
} from 'lucide-react';
import { api } from '@/lib/api';

const PROVEEDORES = ['GENERICO', 'TWILIO', 'TELEGRAM', 'WHATSAPP'];

type Tab = 'numeros' | 'mensajes' | 'simulador';

export default function SmsAdmin() {
    const [tab, setTab] = useState<Tab>('numeros');
    const [numeros, setNumeros] = useState<any[]>([]);
    const [mensajes, setMensajes] = useState<any[]>([]);
    const [refresh, setRefresh] = useState(0);

    useEffect(() => {
        api.listarNumerosSms().then(setNumeros).catch(console.error);
        api.listarMensajesSms(100).then(setMensajes).catch(console.error);
    }, [refresh]);

    useEffect(() => {
        const t = setInterval(() => setRefresh((r) => r + 1), 5000);
        return () => clearInterval(t);
    }, []);

    return (
        <div>
            <header className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div className="icon-wrap"><MessageSquare size={22} /></div>
                    <div>
                        <h1>Administración de SMS</h1>
                        <p className="lead">Lista blanca, simulador y auditoría de mensajes recibidos.</p>
                    </div>
                </div>
                <div className="tabs">
                    <button className={`tab ${tab === 'numeros' ? 'active' : ''}`} onClick={() => setTab('numeros')}>
                        <Phone size={14} /> Números ({numeros.length})
                    </button>
                    <button className={`tab ${tab === 'mensajes' ? 'active' : ''}`} onClick={() => setTab('mensajes')}>
                        <Inbox size={14} /> Mensajes ({mensajes.length})
                    </button>
                    <button className={`tab ${tab === 'simulador' ? 'active' : ''}`} onClick={() => setTab('simulador')}>
                        <Send size={14} /> Simulador
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-4" style={{ marginBottom: 24 }}>
                <KpiCard
                    label="Números autorizados"
                    value={numeros.filter((n) => n.activo).length}
                    icon={Phone}
                    sub={`${numeros.length} total`}
                />
                <KpiCard
                    label="Mensajes recibidos"
                    value={mensajes.length}
                    icon={Inbox}
                    sub="últimos 100"
                />
                <KpiCard
                    label="Encolados a RRV"
                    value={mensajes.filter((m) => m.resultado?.startsWith('ENCOLADO')).length}
                    icon={CheckCircle}
                    sub="aceptados"
                />
                <KpiCard
                    label="Rechazados"
                    value={mensajes.filter((m) => !m.resultado?.startsWith('ENCOLADO')).length}
                    icon={AlertTriangle}
                    sub="no autorizados o inválidos"
                />
            </div>

            {tab === 'numeros' && (
                <NumerosTab
                    numeros={numeros}
                    onRefresh={() => setRefresh((r) => r + 1)}
                />
            )}
            {tab === 'mensajes' && <MensajesTab mensajes={mensajes} />}
            {tab === 'simulador' && (
                <SimuladorTab onEnviado={() => setRefresh((r) => r + 1)} />
            )}
        </div>
    );
}

function KpiCard({ label, value, icon: Icon, sub }: any) {
    return (
        <div className="card kpi" style={{ marginBottom: 0 }}>
            <span className="label">
                <Icon size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 6 }} />
                {label}
            </span>
            <span className="value">{value.toLocaleString()}</span>
            <span style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 4 }}>{sub}</span>
        </div>
    );
}

// ============================================================
// TAB: NÚMEROS
// ============================================================
function NumerosTab({ numeros, onRefresh }: { numeros: any[]; onRefresh: () => void }) {
    const [form, setForm] = useState({ numero: '+591', etiqueta: '', recinto: '', proveedor: 'GENERICO' });
    const [enviando, setEnviando] = useState(false);

    async function agregar(e: React.FormEvent) {
        e.preventDefault();
        if (!form.numero) return;
        setEnviando(true);
        try {
            await api.agregarNumeroSms(form);
            setForm({ numero: '+591', etiqueta: '', recinto: '', proveedor: 'GENERICO' });
            onRefresh();
        } finally { setEnviando(false); }
    }

    async function eliminar(id: string) {
        if (!confirm('¿Eliminar este número?')) return;
        await api.eliminarNumeroSms(id);
        onRefresh();
    }

    async function toggle(id: string, activo: boolean) {
        await api.toggleNumeroSms(id, !activo);
        onRefresh();
    }

    return (
        <div className="grid" style={{ gridTemplateColumns: '1fr 2fr', gap: 20 }}>
            <div className="card" style={{ marginBottom: 0 }}>
                <h3>Agregar número</h3>
                <form onSubmit={agregar}>
                    <div className="field" style={{ marginBottom: 12 }}>
                        <label>Número o handle</label>
                        <input
                            value={form.numero}
                            onChange={(e) => setForm({ ...form, numero: e.target.value })}
                            placeholder="+59170000001 o @usuario_telegram"
                        />
                        <span className="hint">Formato internacional o handle de Telegram (@user)</span>
                    </div>
                    <div className="field" style={{ marginBottom: 12 }}>
                        <label>Etiqueta</label>
                        <input
                            value={form.etiqueta}
                            onChange={(e) => setForm({ ...form, etiqueta: e.target.value })}
                            placeholder="Ej. Operador U.E. Santa Mónica"
                        />
                    </div>
                    <div className="field" style={{ marginBottom: 12 }}>
                        <label>Recinto</label>
                        <input
                            value={form.recinto}
                            onChange={(e) => setForm({ ...form, recinto: e.target.value })}
                            placeholder="ID del recinto"
                        />
                    </div>
                    <div className="field" style={{ marginBottom: 16 }}>
                        <label>Proveedor</label>
                        <select
                            value={form.proveedor}
                            onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
                        >
                            {PROVEEDORES.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <button type="submit" disabled={enviando} style={{ width: '100%' }}>
                        <Plus size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {enviando ? 'Agregando...' : 'Agregar a lista blanca'}
                    </button>
                </form>
            </div>

            <div className="card" style={{ marginBottom: 0 }}>
                <h3>Números autorizados</h3>
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Número</th>
                                <th>Etiqueta</th>
                                <th>Proveedor</th>
                                <th>Estado</th>
                                <th style={{ textAlign: 'right' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {numeros.map((n) => (
                                <tr key={n._id}>
                                    <td><code>{n.numero}</code></td>
                                    <td style={{ fontSize: 13 }}>{n.etiqueta || <span style={{ color: 'var(--c-text-muted)' }}>—</span>}</td>
                                    <td><span className="badge muted" style={{ fontSize: 11 }}>{n.proveedor}</span></td>
                                    <td>
                                        {n.activo
                                            ? <span className="badge"><CheckCircle size={12} /> ACTIVO</span>
                                            : <span className="badge muted">INACTIVO</span>}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button
                                            className="secondary"
                                            style={{ marginRight: 6, fontSize: 12, padding: '6px 10px' }}
                                            onClick={() => toggle(n._id, n.activo)}
                                        >
                                            <Power size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                            {n.activo ? 'Desactivar' : 'Activar'}
                                        </button>
                                        <button
                                            className="danger"
                                            style={{ fontSize: 12, padding: '6px 10px' }}
                                            onClick={() => eliminar(n._id)}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {numeros.length === 0 && (
                                <tr><td colSpan={5} className="empty">No hay números autorizados</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// TAB: MENSAJES
// ============================================================
function MensajesTab({ mensajes }: { mensajes: any[] }) {
    const [filtro, setFiltro] = useState<'todos' | 'aceptados' | 'rechazados'>('todos');

    const filtrados = mensajes.filter((m) => {
        if (filtro === 'aceptados') return m.resultado?.startsWith('ENCOLADO');
        if (filtro === 'rechazados') return !m.resultado?.startsWith('ENCOLADO');
        return true;
    });

    return (
        <div className="card" style={{ marginBottom: 0 }}>
            <div className="toolbar">
                <h3 style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 0 }}>
                    Mensajes recibidos
                </h3>
                <span className="spacer" />
                <div className="tabs">
                    <button className={`tab ${filtro === 'todos' ? 'active' : ''}`} onClick={() => setFiltro('todos')}>
                        Todos ({mensajes.length})
                    </button>
                    <button className={`tab ${filtro === 'aceptados' ? 'active' : ''}`} onClick={() => setFiltro('aceptados')}>
                        Aceptados
                    </button>
                    <button className={`tab ${filtro === 'rechazados' ? 'active' : ''}`} onClick={() => setFiltro('rechazados')}>
                        Rechazados
                    </button>
                </div>
            </div>

            <div>
                {filtrados.map((m) => (
                    <MensajeBubble key={m._id} m={m} />
                ))}
                {filtrados.length === 0 && (
                    <div className="empty">
                        <div className="empty-icon"><Inbox size={20} /></div>
                        Aún no hay mensajes para este filtro.
                    </div>
                )}
            </div>
        </div>
    );
}

function MensajeBubble({ m }: { m: any }) {
    const aceptado = m.resultado?.startsWith('ENCOLADO');
    const noAutorizado = m.resultado?.includes('NO_AUTORIZADO');

    return (
        <div className="sms-msg">
            <div>
                <div className="sms-msg-meta">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} /> {new Date(m.timestamp).toLocaleString()}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={12} /> <code>{m.numero_origen}</code>
                    </span>
                    <span className="badge muted" style={{ fontSize: 10 }}>{m.proveedor}</span>
                    {m.codigo_mesa && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Hash size={12} /> Mesa {m.codigo_mesa}
                        </span>
                    )}
                </div>
                <div className="sms-msg-text">{m.texto || '(sin texto)'}</div>
            </div>
            <div className="sms-msg-result">
                {aceptado
                    ? <span className="badge"><CheckCircle size={12} /> {m.resultado}</span>
                    : noAutorizado
                        ? <span className="badge warn"><AlertTriangle size={12} /> NO AUTORIZADO</span>
                        : <span className="badge danger"><XCircle size={12} /> {m.resultado}</span>}
            </div>
        </div>
    );
}

// ============================================================
// TAB: SIMULADOR
// ============================================================
function SimuladorTab({ onEnviado }: { onEnviado: () => void }) {
    const [numero, setNumero] = useState('+59170000001');
    const [texto, setTexto] = useState('M:10101001001;VE:70;VN:15;P1:0;P2:20;P3:8;P4:32;VB:4;NU:6');
    const [resp, setResp] = useState<any>(null);
    const [enviando, setEnviando] = useState(false);

    async function enviar() {
        setEnviando(true);
        try {
            const r = await api.simularSms(numero, texto);
            setResp(r);
            onEnviado();
        } finally { setEnviando(false); }
    }

    return (
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card" style={{ marginBottom: 0 }}>
                <h3>Simulador de SMS</h3>
                <p style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>
                    Envía un SMS al sistema sin necesidad de proveedor real.
                    Útil para demostrar el flujo durante la defensa.
                </p>
                <div className="field" style={{ marginBottom: 12 }}>
                    <label>Número origen</label>
                    <input value={numero} onChange={(e) => setNumero(e.target.value)} />
                    <span className="hint">Debe estar en la lista blanca activa</span>
                </div>
                <div className="field" style={{ marginBottom: 16 }}>
                    <label>Texto SMS</label>
                    <textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} />
                    <span className="hint">Formato: M:codigo;VE:n;VN:n;P1:n;P2:n;P3:n;P4:n;VB:n;NU:n</span>
                </div>
                <button onClick={enviar} disabled={enviando}>
                    <Send size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    {enviando ? 'Enviando...' : 'Enviar SMS simulado'}
                </button>
                {resp && (
                    <div className={`result-pill ${resp.status === 'SMS_ACEPTADO' ? 'ok' : 'warn'}`} style={{ marginTop: 16 }}>
                        {resp.status === 'SMS_ACEPTADO' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                        <div style={{ flex: 1 }}>
                            <strong>{resp.status || 'Respuesta'}</strong>
                            <pre style={{ marginTop: 8 }}>{JSON.stringify(resp, null, 2)}</pre>
                        </div>
                    </div>
                )}
            </div>

            <div className="card" style={{ marginBottom: 0, background: 'var(--c-surface-2)' }}>
                <h3>Webhooks disponibles</h3>
                <p style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>
                    El backend recibe mensajes desde múltiples proveedores en endpoints normalizados:
                </p>
                <pre style={{ background: '#0b1e3a', color: '#e0e7ff', padding: 14, borderRadius: 8, fontSize: 12, overflow: 'auto', marginTop: 12 }}>
{`POST /api/sms/webhook/twilio    ← Twilio (From, Body)
POST /api/sms/webhook/telegram  ← Telegram bot
POST /api/sms/webhook/whatsapp  ← WhatsApp Cloud API
POST /api/sms/webhook/generico  ← { numero_origen, texto }`}
                </pre>
                <p style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 12, marginBottom: 0 }}>
                    Ver guía completa en <code>SMS-INTEGRATION.md</code>.
                </p>
            </div>
        </div>
    );
}
