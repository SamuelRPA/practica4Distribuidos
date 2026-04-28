'use client';

// Administración de SMS
// - Lista de números autorizados (CRUD)
// - Historial de mensajes recibidos
// - Simulador de SMS para probar el flujo sin proveedor real

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const PROVEEDORES = ['GENERICO', 'TWILIO', 'TELEGRAM', 'WHATSAPP'];

export default function SmsAdmin() {
    const [numeros, setNumeros] = useState<any[]>([]);
    const [mensajes, setMensajes] = useState<any[]>([]);
    const [form, setForm] = useState({ numero: '+591', etiqueta: '', recinto: '', proveedor: 'GENERICO' });
    const [refresh, setRefresh] = useState(0);

    useEffect(() => {
        api.listarNumerosSms().then(setNumeros).catch(console.error);
        api.listarMensajesSms().then(setMensajes).catch(console.error);
    }, [refresh]);

    async function agregar(e: React.FormEvent) {
        e.preventDefault();
        if (!form.numero) return;
        await api.agregarNumeroSms(form);
        setForm({ numero: '+591', etiqueta: '', recinto: '', proveedor: 'GENERICO' });
        setRefresh((r) => r + 1);
    }

    async function eliminar(id: string) {
        if (!confirm('¿Eliminar este número?')) return;
        await api.eliminarNumeroSms(id);
        setRefresh((r) => r + 1);
    }

    async function toggle(id: string, activo: boolean) {
        await api.toggleNumeroSms(id, !activo);
        setRefresh((r) => r + 1);
    }

    return (
        <div>
            <h1>📱 Administración de SMS</h1>
            <p style={{ color: '#666' }}>
                Lista blanca de números autorizados a enviar SMS al pipeline RRV.
                Los SMS de números no registrados se ignoran silenciosamente.
            </p>

            <div className="grid">
                <div className="card">
                    <h3>Agregar número autorizado</h3>
                    <form onSubmit={agregar}>
                        <div style={{ marginBottom: 8 }}>
                            <label>Número (formato internacional)</label>
                            <input
                                value={form.numero}
                                onChange={(e) => setForm({ ...form, numero: e.target.value })}
                                placeholder="+59170000001 o @usuario_telegram"
                            />
                        </div>
                        <div style={{ marginBottom: 8 }}>
                            <label>Etiqueta (opcional)</label>
                            <input
                                value={form.etiqueta}
                                onChange={(e) => setForm({ ...form, etiqueta: e.target.value })}
                                placeholder="ej. Operador U.E. Santa Mónica"
                            />
                        </div>
                        <div style={{ marginBottom: 8 }}>
                            <label>Recinto (opcional)</label>
                            <input
                                value={form.recinto}
                                onChange={(e) => setForm({ ...form, recinto: e.target.value })}
                                placeholder="ID del recinto"
                            />
                        </div>
                        <div style={{ marginBottom: 12 }}>
                            <label>Proveedor</label>
                            <select
                                value={form.proveedor}
                                onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
                            >
                                {PROVEEDORES.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <button type="submit">Agregar</button>
                    </form>
                </div>

                <div className="card">
                    <h3>Simulador de SMS</h3>
                    <p style={{ fontSize: 13, color: '#666' }}>
                        Manda un SMS al sistema sin necesitar proveedor real.
                        Útil para demostrar el flujo en la defensa.
                    </p>
                    <SimuladorSms onEnviado={() => setRefresh((r) => r + 1)} />
                </div>
            </div>

            <div className="card">
                <h3>Números autorizados ({numeros.length})</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Número</th>
                            <th>Etiqueta</th>
                            <th>Proveedor</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {numeros.map((n) => (
                            <tr key={n._id}>
                                <td><code>{n.numero}</code></td>
                                <td>{n.etiqueta || '—'}</td>
                                <td>{n.proveedor}</td>
                                <td>
                                    <span style={{
                                        padding: '2px 8px', borderRadius: 12, fontSize: 11,
                                        background: n.activo ? '#dff6dd' : '#fdd',
                                    }}>
                                        {n.activo ? 'ACTIVO' : 'INACTIVO'}
                                    </span>
                                </td>
                                <td>
                                    <button
                                        className="secondary"
                                        style={{ marginRight: 8, fontSize: 12, padding: '4px 8px' }}
                                        onClick={() => toggle(n._id, n.activo)}
                                    >
                                        {n.activo ? 'Desactivar' : 'Activar'}
                                    </button>
                                    <button
                                        className="secondary"
                                        style={{ fontSize: 12, padding: '4px 8px', color: '#c00', borderColor: '#c00' }}
                                        onClick={() => eliminar(n._id)}
                                    >
                                        Eliminar
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {numeros.length === 0 && (
                            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#999' }}>
                                No hay números autorizados todavía
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="card">
                <h3>Historial de mensajes recibidos ({mensajes.length})</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Hora</th>
                            <th>Origen</th>
                            <th>Proveedor</th>
                            <th>Mesa</th>
                            <th>Resultado</th>
                            <th>Texto</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mensajes.map((m) => (
                            <tr key={m._id}>
                                <td style={{ fontSize: 11 }}>{new Date(m.timestamp).toLocaleString()}</td>
                                <td><code>{m.numero_origen}</code></td>
                                <td>{m.proveedor}</td>
                                <td>{m.codigo_mesa || '—'}</td>
                                <td>
                                    <span style={{
                                        fontSize: 10, fontWeight: 700,
                                        color: m.resultado?.startsWith('ENCOLADO') ? '#0a0'
                                            : m.resultado?.includes('NO_AUTORIZADO') ? '#c80'
                                            : '#c00',
                                    }}>
                                        {m.resultado}
                                    </span>
                                </td>
                                <td style={{ fontSize: 11, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {m.texto}
                                </td>
                            </tr>
                        ))}
                        {mensajes.length === 0 && (
                            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#999' }}>
                                Aún no se han recibido mensajes
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="card" style={{ background: '#f0f4fa' }}>
                <h3>📡 Cómo conectar un proveedor real</h3>
                <p>El backend expone webhooks para Twilio, Telegram, WhatsApp y un genérico:</p>
                <pre style={{ background: '#fff', padding: 12, borderRadius: 6, fontSize: 12, overflow: 'auto' }}>
{`POST /api/sms/webhook/twilio    ← payload Twilio (From, Body, ...)
POST /api/sms/webhook/telegram  ← payload Telegram (message.from.username, message.text)
POST /api/sms/webhook/whatsapp  ← payload WhatsApp Cloud API
POST /api/sms/webhook/generico  ← { numero_origen, texto }`}
                </pre>
                <p>
                    Lee la guía completa en <code>SMS-INTEGRATION.md</code> en la raíz del repo
                    para configurar Twilio o un bot de Telegram (gratis).
                </p>
            </div>
        </div>
    );
}

function SimuladorSms({ onEnviado }: { onEnviado: () => void }) {
    const [numero, setNumero] = useState('+59170000001');
    const [texto, setTexto] = useState('M:10101001001;VE:70;VN:15;P1:0;P2:20;P3:8;P4:32;VB:4;NU:6');
    const [resp, setResp] = useState<any>(null);

    async function enviar() {
        const r = await api.simularSms(numero, texto);
        setResp(r);
        onEnviado();
    }

    return (
        <div>
            <div style={{ marginBottom: 8 }}>
                <label>Número origen</label>
                <input value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div style={{ marginBottom: 8 }}>
                <label>Texto SMS (formato flexible)</label>
                <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
            </div>
            <button onClick={enviar}>Enviar SMS simulado</button>
            {resp && (
                <pre style={{ marginTop: 8, fontSize: 11, background: '#fff', padding: 8, borderRadius: 6 }}>
                    {JSON.stringify(resp, null, 2)}
                </pre>
            )}
        </div>
    );
}
