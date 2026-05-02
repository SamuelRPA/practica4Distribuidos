'use client';

import { useEffect, useState } from 'react';
import {
    FileSpreadsheet, Send, Trash2, Plus, RefreshCw, ClipboardList,
    Layers, Search, CheckCircle, AlertTriangle, XCircle, X,
} from 'lucide-react';
import { api } from '@/lib/api';

type Tab = 'form' | 'actas' | 'mesas';

const CAMPOS_VOTOS = [
    { key: 'p1', label: 'Daenerys Targaryen', short: 'P1' },
    { key: 'p2', label: 'Sansa Stark', short: 'P2' },
    { key: 'p3', label: 'Robert Baratheon', short: 'P3' },
    { key: 'p4', label: 'Tyrion Lannister', short: 'P4' },
] as const;

const ESTADO_FILTROS = ['', 'APROBADA', 'PENDIENTE', 'EN_CUARENTENA', 'ANULADA', 'RECHAZADA'];

export default function OficialPage() {
    const [tab, setTab] = useState<Tab>('form');

    return (
        <div>
            <header className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div className="icon-wrap"><FileSpreadsheet size={22} /></div>
                    <div>
                        <h1>Cómputo Oficial</h1>
                        <p className="lead">Transcripción de actas físicas y administración de actas / mesas electorales.</p>
                    </div>
                </div>
                <div className="tabs">
                    <button className={`tab ${tab === 'form' ? 'active' : ''}`} onClick={() => setTab('form')}>
                        <FileSpreadsheet size={14} /> Transcribir
                    </button>
                    <button className={`tab ${tab === 'actas' ? 'active' : ''}`} onClick={() => setTab('actas')}>
                        <ClipboardList size={14} /> Actas
                    </button>
                    <button className={`tab ${tab === 'mesas' ? 'active' : ''}`} onClick={() => setTab('mesas')}>
                        <Layers size={14} /> Mesas
                    </button>
                </div>
            </header>

            {tab === 'form' && <FormularioActa />}
            {tab === 'actas' && <CrudActas />}
            {tab === 'mesas' && <CrudMesas />}
        </div>
    );
}

// ============================================================
// FORMULARIO DE ACTA (mejorado, mismos campos)
// ============================================================
function FormularioActa() {
    const [acta, setActa] = useState({
        codigo_mesa: '',
        votos_emitidos: '',
        ausentismo: '',
        p1: '', p2: '', p3: '', p4: '',
        votos_blancos: '', votos_nulos: '',
        creado_por: 'operador_web',
    });
    const [resp, setResp] = useState<any>(null);
    const [enviando, setEnviando] = useState(false);
    const [mesaInfo, setMesaInfo] = useState<any>(null);
    const [mesaError, setMesaError] = useState<string | null>(null);
    const [buscandoMesa, setBuscandoMesa] = useState(false);

    function set(campo: string, valor: string) {
        setActa((a) => ({ ...a, [campo]: valor }));
    }

    function reset() {
        setActa({
            codigo_mesa: '', votos_emitidos: '', ausentismo: '',
            p1: '', p2: '', p3: '', p4: '',
            votos_blancos: '', votos_nulos: '',
            creado_por: 'operador_web',
        });
        setResp(null);
        setMesaInfo(null);
        setMesaError(null);
    }

    // Auto-busca info de la mesa al ingresar el código (debounced)
    useEffect(() => {
        const codigo = acta.codigo_mesa.trim();
        if (!codigo || codigo.length < 6) {
            setMesaInfo(null);
            setMesaError(null);
            return;
        }
        const timer = setTimeout(async () => {
            setBuscandoMesa(true);
            try {
                const info = await api.mesaInfo(codigo);
                if (info && !info.error) {
                    setMesaInfo(info);
                    setMesaError(null);
                } else {
                    setMesaInfo(null);
                    setMesaError(info?.error || 'Mesa no encontrada en el padrón');
                }
            } catch {
                setMesaInfo(null);
                setMesaError('Mesa no encontrada en el padrón');
            } finally {
                setBuscandoMesa(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [acta.codigo_mesa]);

    async function enviar() {
        setEnviando(true);
        try {
            const numeric: any = { ...acta };
            for (const k of Object.keys(acta)) {
                if (k !== 'creado_por' && acta[k as keyof typeof acta] !== '') {
                    numeric[k] = parseInt(acta[k as keyof typeof acta] as string, 10);
                }
            }
            numeric.fuente = 'MANUAL';
            const r = await api.enviarActaOficial(numeric);
            setResp(r);
        } finally {
            setEnviando(false);
        }
    }

    const totalCandidatos = ['p1', 'p2', 'p3', 'p4']
        .reduce((a, k) => a + (parseInt(acta[k as keyof typeof acta] as string, 10) || 0), 0);
    const totalConBlancosNulos =
        totalCandidatos
        + (parseInt(acta.votos_blancos, 10) || 0)
        + (parseInt(acta.votos_nulos, 10) || 0);
    const emitidos = parseInt(acta.votos_emitidos, 10) || 0;
    const ausentismoIngresado = parseInt(acta.ausentismo, 10) || 0;
    const balanceOk = emitidos > 0 && emitidos === totalConBlancosNulos;
    const habilitados = mesaInfo?.cantidad_habilitada || 0;
    const balancePadronOk = habilitados > 0 && (emitidos + ausentismoIngresado) === habilitados;
    const ausentismoSugerido = habilitados > 0 ? Math.max(0, habilitados - emitidos) : null;

    return (
        <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 20 }}>
            <div className="card" style={{ marginBottom: 0 }}>
                <h3>Transcripción de acta física</h3>

                <div className="form-section-title"><span>Identificación</span></div>
                <div className="form-grid">
                    <div className="field full">
                        <label>Código de mesa</label>
                        <input
                            type="number"
                            placeholder="Ej. 10101001001"
                            value={acta.codigo_mesa}
                            onChange={(e) => set('codigo_mesa', e.target.value)}
                        />
                        {buscandoMesa && (
                            <span className="hint" style={{ color: 'var(--c-primary)' }}>Buscando en padrón...</span>
                        )}
                        {!buscandoMesa && mesaError && (
                            <span className="hint" style={{ color: 'var(--c-danger)' }}>
                                <AlertTriangle size={11} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                                {mesaError}
                            </span>
                        )}
                        {!buscandoMesa && mesaInfo && (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                gap: 12,
                                marginTop: 10,
                                padding: 12,
                                background: 'var(--c-primary-soft)',
                                border: '1px solid #bfdbfe',
                                borderRadius: 8,
                                fontSize: 13,
                            }}>
                                <div>
                                    <div style={{ fontSize: 11, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Habilitados</div>
                                    <strong style={{ fontSize: 18, color: 'var(--c-primary-2)' }}>{Number(mesaInfo.cantidad_habilitada).toLocaleString()}</strong>
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mesa Nº</div>
                                    <strong>{mesaInfo.nro_mesa}</strong>
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <div style={{ fontSize: 11, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recinto</div>
                                    <strong>{mesaInfo.recinto_nombre}</strong>
                                    <div style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>{mesaInfo.departamento} · {mesaInfo.provincia}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="form-section-title"><span>Resumen del acta</span></div>
                <div className="form-grid">
                    <div className="field">
                        <label>Votos emitidos</label>
                        <input type="number" value={acta.votos_emitidos} onChange={(e) => set('votos_emitidos', e.target.value)} />
                    </div>
                    <div className="field">
                        <label>Ausentismo</label>
                        <input type="number" value={acta.ausentismo} onChange={(e) => set('ausentismo', e.target.value)} />
                        {ausentismoSugerido != null && acta.ausentismo === '' && (
                            <span className="hint" style={{ color: 'var(--c-primary)' }}>
                                Sugerido según padrón: {ausentismoSugerido}
                                <button
                                    type="button"
                                    className="ghost"
                                    style={{ marginLeft: 6, padding: '2px 8px', fontSize: 11, background: 'var(--c-primary-soft)', color: 'var(--c-primary-2)' }}
                                    onClick={() => set('ausentismo', String(ausentismoSugerido))}
                                >Usar</button>
                            </span>
                        )}
                    </div>
                </div>

                <div className="form-section-title"><span>Votos por candidatura</span></div>
                <div className="form-grid">
                    {CAMPOS_VOTOS.map((c) => (
                        <div key={c.key} className="field">
                            <label>{c.short} — {c.label}</label>
                            <input
                                type="number"
                                value={acta[c.key as keyof typeof acta]}
                                onChange={(e) => set(c.key, e.target.value)}
                            />
                        </div>
                    ))}
                </div>

                <div className="form-section-title"><span>Otros</span></div>
                <div className="form-grid">
                    <div className="field">
                        <label>Votos blancos</label>
                        <input type="number" value={acta.votos_blancos} onChange={(e) => set('votos_blancos', e.target.value)} />
                    </div>
                    <div className="field">
                        <label>Votos nulos</label>
                        <input type="number" value={acta.votos_nulos} onChange={(e) => set('votos_nulos', e.target.value)} />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                    <button onClick={enviar} disabled={enviando || !acta.codigo_mesa}>
                        <Send size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {enviando ? 'Enviando...' : 'Enviar acta'}
                    </button>
                    <button className="secondary" onClick={reset} disabled={enviando}>Limpiar</button>
                </div>

                {resp && <ResultadoEnvio resp={resp} />}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="card" style={{ marginBottom: 0 }}>
                    <h3>Verificación rápida</h3>

                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                        Balance interno (R2)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                        <ResumenItem label="Suma candidaturas" value={totalCandidatos.toLocaleString()} />
                        <ResumenItem label="+ Blancos + Nulos" value={totalConBlancosNulos.toLocaleString()} />
                        <ResumenItem label="Votos emitidos" value={emitidos.toLocaleString()} />
                    </div>
                    <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 12, marginBottom: 16 }}>
                        {emitidos === 0 ? (
                            <span className="badge muted">Sin datos</span>
                        ) : balanceOk ? (
                            <span className="badge"><CheckCircle size={12} /> Balance interno OK</span>
                        ) : (
                            <span className="badge warn"><AlertTriangle size={12} /> Diferencia {Math.abs(emitidos - totalConBlancosNulos)}</span>
                        )}
                    </div>

                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                        Balance vs padrón (R1)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <ResumenItem label="Habilitados" value={habilitados ? habilitados.toLocaleString() : '—'} />
                        <ResumenItem label="Emitidos + Ausentismo" value={(emitidos + ausentismoIngresado).toLocaleString()} />
                    </div>
                    <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 12, marginTop: 12 }}>
                        {!habilitados ? (
                            <span className="badge muted">Esperando código de mesa</span>
                        ) : balancePadronOk ? (
                            <span className="badge"><CheckCircle size={12} /> Cuadra con padrón</span>
                        ) : (
                            <span className="badge warn">
                                <AlertTriangle size={12} /> Diferencia {Math.abs(habilitados - emitidos - ausentismoIngresado)}
                            </span>
                        )}
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 0, background: 'var(--c-surface-2)' }}>
                    <h3 style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 8 }}>Tip</h3>
                    <p style={{ fontSize: 13, color: 'var(--c-text-muted)', margin: 0, lineHeight: 1.6 }}>
                        El acta se guarda en la base de datos siempre. Si los balances no cuadran,
                        queda como <strong style={{ color: '#92400e' }}>EN_CUARENTENA</strong> en
                        lugar de aprobada y aparece en la pestaña <em>Actas</em> para revisión.
                    </p>
                </div>
            </div>
        </div>
    );
}

function ResumenItem({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>{label}</span>
            <strong style={{ fontSize: 16, color: 'var(--c-text)' }}>{value}</strong>
        </div>
    );
}

function ResultadoEnvio({ resp }: { resp: any }) {
    const variant = resp.status === 'APROBADA' ? 'ok'
                  : resp.status === 'EN_CUARENTENA' ? 'warn' : 'err';
    const Icon = variant === 'ok' ? CheckCircle : variant === 'warn' ? AlertTriangle : XCircle;
    return (
        <div className={`result-pill ${variant}`}>
            <Icon size={20} />
            <div style={{ flex: 1 }}>
                <strong>{resp.status || 'Error'}</strong>
                {resp.motivo && <div style={{ fontSize: 13, marginTop: 2 }}>{resp.motivo}</div>}
                <details style={{ marginTop: 6 }}>
                    <summary style={{ fontSize: 12, cursor: 'pointer' }}>Ver respuesta completa</summary>
                    <pre>{JSON.stringify(resp, null, 2)}</pre>
                </details>
            </div>
        </div>
    );
}

// ============================================================
// CRUD ACTAS
// ============================================================
function CrudActas() {
    const [actas, setActas] = useState<any[]>([]);
    const [estado, setEstado] = useState('');
    const [mesa, setMesa] = useState('');
    const [loading, setLoading] = useState(false);
    const [tick, setTick] = useState(0);

    async function cargar() {
        setLoading(true);
        try {
            const r = await api.listarActas({
                estado: estado || undefined,
                mesa: mesa ? parseInt(mesa, 10) : undefined,
                limit: 100,
            });
            setActas(r);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [tick, estado]);
    useEffect(() => {
        const t = setInterval(() => setTick((x) => x + 1), 5000);
        return () => clearInterval(t);
    }, []);

    async function anular(id: string, codigoMesa: number) {
        if (!confirm(`¿Anular el acta de la mesa ${codigoMesa}? Quedará marcada como ANULADA y dejará de contar en los totales.`)) return;
        await api.anularActa(id, 'Anulada manualmente desde panel de administración');
        setTick((x) => x + 1);
    }

    return (
        <div className="card" style={{ marginBottom: 0 }}>
            <div className="toolbar">
                <h3 style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 0 }}>Actas oficiales ({actas.length})</h3>
                <span className="spacer" />
                <select value={estado} onChange={(e) => setEstado(e.target.value)}>
                    {ESTADO_FILTROS.map((e) => (
                        <option key={e} value={e}>{e || 'Todos los estados'}</option>
                    ))}
                </select>
                <input
                    placeholder="Buscar por mesa..."
                    type="number"
                    value={mesa}
                    onChange={(e) => setMesa(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && cargar()}
                />
                <button className="secondary" onClick={cargar} disabled={loading}>
                    <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    Refrescar
                </button>
            </div>

            <div className="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Mesa</th>
                            <th>Recinto / Depto</th>
                            <th>Emitidos</th>
                            <th>P1/P2/P3/P4</th>
                            <th>B / N</th>
                            <th>Fuente</th>
                            <th>Estado</th>
                            <th style={{ textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {actas.map((a) => (
                            <tr key={a.id}>
                                <td><strong>#{a.nro_mesa}</strong><br /><code style={{ fontSize: 11 }}>{a.codigo_mesa}</code></td>
                                <td style={{ fontSize: 13 }}>
                                    {a.recinto_nombre}
                                    <br />
                                    <span style={{ color: 'var(--c-text-muted)', fontSize: 11 }}>{a.departamento}</span>
                                </td>
                                <td>{Number(a.votos_emitidos || 0).toLocaleString()}</td>
                                <td style={{ fontSize: 12 }}>{a.p1}/{a.p2}/{a.p3}/{a.p4}</td>
                                <td style={{ fontSize: 12 }}>{a.votos_blancos}/{a.votos_nulos}</td>
                                <td>
                                    <span className="badge muted" style={{ fontSize: 10 }}>{a.fuente}</span>
                                </td>
                                <td><EstadoBadge estado={a.estado} /></td>
                                <td style={{ textAlign: 'right' }}>
                                    {a.estado !== 'ANULADA' && (
                                        <button
                                            className="danger"
                                            style={{ fontSize: 12, padding: '6px 10px' }}
                                            onClick={() => anular(a.id, a.codigo_mesa)}
                                        >
                                            <Trash2 size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                            Anular
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {actas.length === 0 && (
                            <tr>
                                <td colSpan={8} className="empty">
                                    {loading ? 'Cargando...' : 'No hay actas para los filtros seleccionados.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function EstadoBadge({ estado }: { estado: string }) {
    const map: Record<string, string> = {
        APROBADA: 'badge',
        PENDIENTE: 'badge info',
        EN_CUARENTENA: 'badge warn',
        ANULADA: 'badge muted',
        RECHAZADA: 'badge danger',
    };
    return <span className={map[estado] || 'badge muted'} style={{ fontSize: 11 }}>{estado}</span>;
}

// ============================================================
// CRUD MESAS
// ============================================================
function CrudMesas() {
    const [mesas, setMesas] = useState<any[]>([]);
    const [recintos, setRecintos] = useState<any[]>([]);
    const [q, setQ] = useState('');
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);

    async function cargar() {
        setLoading(true);
        try {
            const m = await api.listarMesasCrud({ q: q || undefined, limit: 200 });
            setMesas(m);
        } finally { setLoading(false); }
    }

    useEffect(() => {
        cargar();
        api.listarRecintosTodos().then(setRecintos).catch(() => setRecintos([]));
    }, []);

    async function eliminar(codigoMesa: number) {
        if (!confirm(`¿Eliminar la mesa ${codigoMesa}? Esta acción solo procede si no tiene actas activas.`)) return;
        try {
            const r: any = await api.eliminarMesa(codigoMesa);
            if (r.error) alert(r.error);
            cargar();
        } catch (err: any) {
            alert(err.message || 'Error eliminando');
        }
    }

    return (
        <div className="card" style={{ marginBottom: 0 }}>
            <div className="toolbar">
                <h3 style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 0 }}>Mesas electorales ({mesas.length})</h3>
                <span className="spacer" />
                <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-muted)' }} />
                    <input
                        placeholder="Buscar mesa o recinto..."
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && cargar()}
                        style={{ paddingLeft: 32, minWidth: 240 }}
                    />
                </div>
                <button className="secondary" onClick={cargar} disabled={loading}>
                    <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    Refrescar
                </button>
                <button onClick={() => setShowModal(true)}>
                    <Plus size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    Nueva mesa
                </button>
            </div>

            <div className="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Código de mesa</th>
                            <th>Nº</th>
                            <th>Habilitados</th>
                            <th>Recinto</th>
                            <th>Departamento / Provincia</th>
                            <th>Actas activas</th>
                            <th style={{ textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mesas.map((m) => (
                            <tr key={m.codigo_mesa}>
                                <td><code>{m.codigo_mesa}</code></td>
                                <td><strong>#{m.nro_mesa}</strong></td>
                                <td>{Number(m.cantidad_habilitada).toLocaleString()}</td>
                                <td style={{ fontSize: 13 }}>{m.recinto_nombre}</td>
                                <td style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
                                    {m.departamento} · {m.provincia}
                                </td>
                                <td>
                                    {m.actas_activas > 0 ? (
                                        <span className="badge info" style={{ fontSize: 11 }}>{m.actas_activas}</span>
                                    ) : (
                                        <span className="badge muted" style={{ fontSize: 11 }}>0</span>
                                    )}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    <button
                                        className="danger"
                                        style={{ fontSize: 12, padding: '6px 10px' }}
                                        onClick={() => eliminar(m.codigo_mesa)}
                                        disabled={m.actas_activas > 0}
                                        title={m.actas_activas > 0 ? 'Anula sus actas primero' : 'Eliminar mesa'}
                                    >
                                        <Trash2 size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                        Eliminar
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {mesas.length === 0 && (
                            <tr>
                                <td colSpan={7} className="empty">
                                    {loading ? 'Cargando...' : 'No hay mesas para mostrar.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <ModalNuevaMesa
                    recintos={recintos}
                    onClose={() => setShowModal(false)}
                    onCreated={() => { setShowModal(false); cargar(); }}
                />
            )}
        </div>
    );
}

function ModalNuevaMesa({ recintos, onClose, onCreated }: {
    recintos: any[]; onClose: () => void; onCreated: () => void;
}) {
    const [data, setData] = useState({
        codigo_mesa: '', nro_mesa: '', cantidad_habilitada: '', id_recinto: '',
    });
    const [error, setError] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);

    async function guardar(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (!data.codigo_mesa || !data.nro_mesa || !data.cantidad_habilitada || !data.id_recinto) {
            setError('Todos los campos son obligatorios.');
            return;
        }
        setEnviando(true);
        try {
            const r: any = await api.crearMesa({
                codigo_mesa: parseInt(data.codigo_mesa, 10),
                nro_mesa: parseInt(data.nro_mesa, 10),
                cantidad_habilitada: parseInt(data.cantidad_habilitada, 10),
                id_recinto: parseInt(data.id_recinto, 10),
            });
            if (r.error) {
                setError(r.error);
            } else {
                onCreated();
            }
        } catch (err: any) {
            setError(err.message || 'Error creando mesa');
        } finally {
            setEnviando(false);
        }
    }

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0 }}>Nueva mesa electoral</h3>
                    <button className="ghost" onClick={onClose}><X size={16} /></button>
                </div>

                <form onSubmit={guardar}>
                    <div className="form-grid">
                        <div className="field full">
                            <label>Recinto</label>
                            <select
                                value={data.id_recinto}
                                onChange={(e) => setData({ ...data, id_recinto: e.target.value })}
                            >
                                <option value="">Selecciona un recinto...</option>
                                {recintos.map((r) => (
                                    <option key={r.id_recinto} value={r.id_recinto}>
                                        {r.nombre} — {r.departamento}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="field full">
                            <label>Código de mesa (11 dígitos)</label>
                            <input
                                type="number"
                                placeholder="10101001001"
                                value={data.codigo_mesa}
                                onChange={(e) => setData({ ...data, codigo_mesa: e.target.value })}
                            />
                        </div>
                        <div className="field">
                            <label>Nº de mesa</label>
                            <input
                                type="number"
                                placeholder="1"
                                value={data.nro_mesa}
                                onChange={(e) => setData({ ...data, nro_mesa: e.target.value })}
                            />
                        </div>
                        <div className="field">
                            <label>Cantidad habilitada</label>
                            <input
                                type="number"
                                placeholder="200"
                                value={data.cantidad_habilitada}
                                onChange={(e) => setData({ ...data, cantidad_habilitada: e.target.value })}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="result-pill err" style={{ marginTop: 16 }}>
                            <XCircle size={18} />
                            <div>{error}</div>
                        </div>
                    )}

                    <div className="modal-actions">
                        <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
                        <button type="submit" disabled={enviando}>
                            {enviando ? 'Creando...' : 'Crear mesa'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
