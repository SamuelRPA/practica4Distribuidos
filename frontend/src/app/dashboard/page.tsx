'use client';

import { useEffect, useState } from 'react';
import {
    Bar, BarChart, CartesianGrid, Legend,
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, LineChart, Line,
} from 'recharts';
import { Activity, Clock, MapPin, Users, CheckCircle, AlertTriangle, Trophy, Zap, FileSpreadsheet, Layers } from 'lucide-react';
import { api } from '@/lib/api';
import BoliviaMap from '@/components/BoliviaMap';

// Colores oficiales
const COLORS = ['#1d4ed8', '#047857', '#b91c1c', '#6d28d9', '#64748b', '#334155'];

export default function Dashboard() {
    const [rrv, setRrv] = useState<any>(null);
    const [oficial, setOficial] = useState<any>(null);
    const [tiempos, setTiempos] = useState<any>(null);
    const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);
    const [estadoConexion, setEstadoConexion] = useState<'conectando' | 'ok' | 'error'>('conectando');
    const [conteoRrv, setConteoRrv] = useState<{ total: number; porEstado: any[] } | null>(null);
    
    // Filtros interactivos
    const [selectedDepto, setSelectedDepto] = useState<string>('TODOS');
    const [selectedProv, setSelectedProv] = useState<string>('TODOS');
    const [selectedRecinto, setSelectedRecinto] = useState<string>('TODOS');
    const [selectedMesa, setSelectedMesa] = useState<string>('TODOS');
    const [filtroTiempos, setFiltroTiempos] = useState<'rapidas' | 'lentas'>('rapidas');

    // Jerarquías
    const [provincias, setProvincias] = useState<string[]>([]);
    const [recintos, setRecintos] = useState<any[]>([]);
    const [mesas, setMesas] = useState<any[]>([]);
    const [mesaDetalle, setMesaDetalle] = useState<any>(null);
    const [provTiempos, setProvTiempos] = useState<any>(null);

    // Métricas adicionales
    const [vista, setVista] = useState<'combinada' | 'oficial' | 'rrv'>('combinada');
    const [ganadores, setGanadores] = useState<any>(null);
    const [nivelGanador, setNivelGanador] = useState<'departamento' | 'provincia' | 'municipio' | 'recinto'>('departamento');
    const [topHorarios, setTopHorarios] = useState<any[]>([]);

    useEffect(() => {
        if (selectedDepto !== 'TODOS') {
            api.getProvincias(selectedDepto).then(setProvincias).catch(() => setProvincias([]));
            setSelectedProv('TODOS');
            setSelectedRecinto('TODOS');
            setSelectedMesa('TODOS');
        } else {
            setProvincias([]);
        }
    }, [selectedDepto]);

    useEffect(() => {
        if (selectedProv !== 'TODOS') {
            api.getRecintos(selectedDepto, selectedProv).then(setRecintos).catch(() => setRecintos([]));
            api.tiempos(selectedDepto, selectedProv).then(setProvTiempos).catch(() => setProvTiempos(null));
            setSelectedRecinto('TODOS');
            setSelectedMesa('TODOS');
        } else {
            setRecintos([]);
            setProvTiempos(null);
        }
    }, [selectedProv]);

    useEffect(() => {
        if (selectedRecinto !== 'TODOS') {
            api.getMesas(selectedRecinto).then(setMesas).catch(() => setMesas([]));
            setSelectedMesa('TODOS');
        } else {
            setMesas([]);
        }
    }, [selectedRecinto]);

    useEffect(() => {
        if (selectedMesa !== 'TODOS') {
            api.getMesaDetalle(selectedMesa).then(setMesaDetalle).catch(() => setMesaDetalle(null));
        } else {
            setMesaDetalle(null);
        }
    }, [selectedMesa]);

    useEffect(() => {
        const cargar = async () => {
            try {
                const [r, o, t, th, crrv] = await Promise.all([
                    api.rrvResumen(),
                    api.oficialResumen(),
                    api.tiempos().catch(() => null),
                    api.topHorarios().catch(() => []),
                    api.conteoRrv().catch(() => null),
                ]);
                setRrv(r); setOficial(o); setTiempos(t); setTopHorarios(th);
                if (crrv) setConteoRrv(crrv);
                setUltimaActualizacion(new Date());
                setEstadoConexion('ok');
            } catch (err) {
                console.error('[dashboard] error fetching:', err);
                setEstadoConexion('error');
            }
        };
        cargar();
        const t = setInterval(cargar, 10000); // cada 10s, no 3s, para no saturar
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        api.ganadorTerritorio(nivelGanador).then(setGanadores).catch(() => setGanadores(null));
    }, [nivelGanador]);

    if (!rrv && !oficial && estadoConexion === 'conectando') {
        return <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', fontSize: 24, fontWeight: 'bold', color: '#1d4ed8' }}>Iniciando Cómputo Oficial...</div>;
    }

    const totalesRrv = rrv?.totales || {};
    const totalesOf = oficial?.totales || {};

    const partidos = ['p1', 'p2', 'p3', 'p4', 'votos_blancos', 'votos_nulos'];

    const dataComparacion = partidos.map((p) => {
        // Mapeo especial para votos blancos y nulos porque la vista los llama total_blancos en vez de total_votos_blancos
        const keyRrv = p;
        let keyOficial = `total_${p}`;
        if (p === 'votos_blancos') keyOficial = 'total_blancos';
        if (p === 'votos_nulos') keyOficial = 'total_nulos';

        return {
            partido: p.replace('votos_', '').toUpperCase(),
            RRV: Number(totalesRrv[keyRrv] || 0),
            Oficial: Number(totalesOf[keyOficial] || totalesOf[keyRrv] || 0),
        };
    });

    const dataPie = partidos.slice(0, 4).map((p, i) => ({
        name: p.toUpperCase(),
        value: Number(totalesOf[`total_${p}`] || totalesOf[p] || 0),
        fill: COLORS[i],
    }));

    const participacionData = oficial?.participacion || [];
    
    // Filtrar participación por departamento si se seleccionó uno
    const deptosOptions = ['TODOS', ...Array.from(new Set(participacionData.map((p:any) => p.departamento)))];
    
    const displayParticipacion = selectedDepto === 'TODOS' 
        ? participacionData 
        : participacionData.filter((p:any) => p.departamento === selectedDepto);

    return (
        <div className="dashboard-container">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
                <div>
                    <h1 style={{ fontSize: '2.5rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Activity size={40} color="#2563eb" />
                        Cómputo Electoral Plurinacional
                    </h1>
                    <p style={{ color: '#64748b', margin: 0, fontSize: '1.1rem' }}>
                        Visualización interactiva en tiempo real RRV y Oficial
                    </p>
                </div>
                
                <div className="badge" style={{
                    borderColor: estadoConexion === 'ok' ? '#a7f3d0' : '#fca5a5',
                    background: estadoConexion === 'ok' ? '#ecfdf5' : '#fef2f2',
                    color: estadoConexion === 'ok' ? '#065f46' : '#991b1b'
                }}>
                    {estadoConexion === 'ok' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                    {estadoConexion === 'ok' ? 'Sistema en Línea' : 'Reconectando...'}
                    {ultimaActualizacion && (
                        <span style={{ fontWeight: 400, marginLeft: 8 }}>
                            {ultimaActualizacion.toLocaleTimeString()}
                        </span>
                    )}
                </div>
            </header>

            {/* Selector de vista (Oficial / RRV / Combinada) */}
            <div className="filter-bar" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: '#475569' }}>
                    <Layers size={18} />
                    Vista:
                </div>
                <div className="tabs">
                    <button className={`tab ${vista === 'combinada' ? 'active' : ''}`} onClick={() => setVista('combinada')}>
                        <Activity size={14} /> Combinada
                    </button>
                    <button className={`tab ${vista === 'oficial' ? 'active' : ''}`} onClick={() => setVista('oficial')}>
                        <FileSpreadsheet size={14} /> Oficial
                    </button>
                    <button className={`tab ${vista === 'rrv' ? 'active' : ''}`} onClick={() => setVista('rrv')}>
                        <Zap size={14} /> Rápido (RRV)
                    </button>
                </div>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
                    {vista === 'combinada' && 'Muestra Oficial y RRV uno al lado del otro'}
                    {vista === 'oficial' && 'Solo cómputo oficial (PostgreSQL)'}
                    {vista === 'rrv' && 'Solo recepción rápida (MongoDB)'}
                </span>
            </div>

            {/* Barra de Filtros */}
            <div className="filter-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: '#475569' }}>
                    <MapPin size={20} />
                    Filtrar Vista:
                </div>
                <select value={selectedDepto} onChange={e => setSelectedDepto(e.target.value)}>
                    {deptosOptions.map((opt:any) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                <select value={selectedProv} onChange={e => setSelectedProv(e.target.value)} disabled={selectedDepto === 'TODOS'}>
                    <option value="TODOS">Todas las Provincias</option>
                    {provincias.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={selectedRecinto} onChange={e => setSelectedRecinto(e.target.value)} disabled={selectedProv === 'TODOS'}>
                    <option value="TODOS">Todos los Recintos</option>
                    {recintos.map(r => <option key={r.id_recinto} value={r.id_recinto}>{r.nombre}</option>)}
                </select>
                <select value={selectedMesa} onChange={e => setSelectedMesa(e.target.value)} disabled={selectedRecinto === 'TODOS'}>
                    <option value="TODOS">Todas las Mesas</option>
                    {mesas.map(m => <option key={m.codigo_mesa} value={m.codigo_mesa}>Mesa #{m.nro_mesa} ({m.cantidad_habilitada} hab.)</option>)}
                </select>
            </div>

            {/* KPIs Principales — varía según la vista */}
            {vista === 'combinada' && (
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 24 }}>
                    {/* Bloque Oficial */}
                    <div className="card" style={{ marginBottom: 0, borderTop: '3px solid #2563eb' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <FileSpreadsheet size={16} color="#2563eb" /> Cómputo Oficial
                        </h3>
                        <BloqueKpi
                            emitidos={Number(totalesOf.total_emitidos || 0)}
                            validos={['p1','p2','p3','p4'].reduce((a, p) => a + Number(totalesOf[`total_${p}`] || totalesOf[p] || 0), 0)}
                            mesas={(oficial?.estados || []).find((e:any) => e.estado === 'APROBADA')?.cantidad || 0}
                            cuarentena={(oficial?.estados || []).find((e:any) => e.estado === 'EN_CUARENTENA')?.cantidad || 0}
                        />
                    </div>
                    {/* Bloque RRV */}
                    <div className="card" style={{ marginBottom: 0, borderTop: '3px solid #f59e0b' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Zap size={16} color="#f59e0b" /> Cómputo Rápido (RRV)
                        </h3>
                        <BloqueKpi
                            emitidos={conteoRrv?.total ?? (rrv?.estados || []).reduce((s: number, e: any) => s + (e.cantidad || 0), 0)}
                            validos={(conteoRrv?.porEstado || []).find((e: any) => e._id === 'APROBADA')?.cantidad || (rrv?.estados || []).find((e:any) => e._id === 'APROBADA')?.cantidad || 0}
                            mesas={Number(totalesRrv.votos_emitidos || 0)}
                            cuarentena={(conteoRrv?.porEstado || []).find((e: any) => e._id === 'EN_VERIFICACION')?.cantidad || 0}
                            label1="Total Actas RRV"
                            label2="Actas Aprobadas"
                            label3="Votos Emitidos (RRV)"
                            label4="En Verificación"
                        />
                    </div>
                    {/* Bloque Combinado */}
                    <div className="card" style={{ marginBottom: 0, borderTop: '3px solid #10b981' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Activity size={16} color="#10b981" /> Combinado
                        </h3>
                        <BloqueKpi
                            emitidos={Number(totalesOf.total_emitidos || 0) + Number(totalesRrv.votos_emitidos || 0)}
                            validos={
                                ['p1','p2','p3','p4'].reduce((a, p) => a + Number(totalesOf[`total_${p}`] || totalesOf[p] || 0), 0)
                                + ['p1','p2','p3','p4'].reduce((a, p) => a + Number(totalesRrv[p] || 0), 0)
                            }
                            mesas={
                                ((oficial?.estados || []).find((e:any) => e.estado === 'APROBADA')?.cantidad || 0)
                                + ((rrv?.estados || []).find((e:any) => e._id === 'APROBADA')?.cantidad || 0)
                            }
                            cuarentena={
                                ((oficial?.estados || []).find((e:any) => e.estado === 'EN_CUARENTENA')?.cantidad || 0)
                                + ((rrv?.estados || []).find((e:any) => e._id === 'EN_VERIFICACION')?.cantidad || 0)
                            }
                            label3="Mesas (suma)"
                            label4="Pendientes (suma)"
                        />
                    </div>
                </div>
            )}

            {vista === 'oficial' && (
                <div className="grid grid-cols-4">
                    <div className="card kpi">
                        <span className="label"><Users size={16} style={{display:'inline', verticalAlign:'text-bottom', marginRight:4}}/>Votos Emitidos</span>
                        <span className="value">{Number(totalesOf.total_emitidos || 0).toLocaleString()}</span>
                    </div>
                    <div className="card kpi green">
                        <span className="label"><CheckCircle size={16} style={{display:'inline', verticalAlign:'text-bottom', marginRight:4}}/>Votos Válidos</span>
                        <span className="value">
                            {(['p1','p2','p3','p4'].reduce((a, p) => a + Number(totalesOf[`total_${p}`] || totalesOf[p] || 0), 0)).toLocaleString()}
                        </span>
                    </div>
                    <div className="card kpi purple">
                        <span className="label">Mesas Aprobadas (Oficial)</span>
                        <span className="value">
                            {((oficial?.estados || []).find((e:any) => e.estado === 'APROBADA')?.cantidad || 0).toLocaleString()}
                        </span>
                    </div>
                    <div className="card kpi orange">
                        <span className="label">En Cuarentena</span>
                        <span className="value">
                            {((oficial?.estados || []).find((e:any) => e.estado === 'EN_CUARENTENA')?.cantidad || 0).toLocaleString()}
                        </span>
                    </div>
                </div>
            )}

            {vista === 'rrv' && (
                <div className="grid grid-cols-4">
                    <div className="card kpi">
                        <span className="label"><Users size={16} style={{display:'inline', verticalAlign:'text-bottom', marginRight:4}}/>Total Actas RRV</span>
                        <span className="value">{(conteoRrv?.total ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="card kpi green">
                        <span className="label"><Zap size={16} style={{display:'inline', verticalAlign:'text-bottom', marginRight:4}}/>Actas Aprobadas</span>
                        <span className="value">
                            {((conteoRrv?.porEstado || []).find((e:any) => e._id === 'APROBADA')?.cantidad || 0).toLocaleString()}
                        </span>
                    </div>
                    <div className="card kpi purple">
                        <span className="label">Votos Emitidos (RRV)</span>
                        <span className="value">
                            {Number(totalesRrv.votos_emitidos || 0).toLocaleString()}
                        </span>
                    </div>
                    <div className="card kpi orange">
                        <span className="label">Duplicados / Inconsistentes</span>
                        <span className="value">
                            {(['DUPLICADO_PARCIAL','DATOS_INCONSISTENTES','MESA_FANTASMA'].reduce((s: number, k: string) => s + ((conteoRrv?.porEstado || []).find((e:any) => e._id === k)?.cantidad || 0), 0)).toLocaleString()}
                        </span>
                    </div>
                </div>
            )}

            <div className="grid" style={{ gridTemplateColumns: '1.2fr 2fr' }}>
                {/* Mapa de Bolivia */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                    <h3>Mapa de Calor: Participación</h3>
                    <div className="map-container" style={{ flex: 1, minHeight: 400 }}>
                        <BoliviaMap 
                            data={participacionData} 
                            onDepartmentClick={(depto) => setSelectedDepto(depto === selectedDepto ? 'TODOS' : depto)}
                        />
                        <div style={{ position: 'absolute', bottom: 16, right: 16, background: 'rgba(255,255,255,0.9)', padding: '8px 12px', borderRadius: 8, fontSize: 12, border: '1px solid #cbd5e1' }}>
                            <strong>Participación</strong>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}><span style={{width: 12, height: 12, background:'#06d6a0', borderRadius:2}}/> &gt; 80%</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}><span style={{width: 12, height: 12, background:'#118ab2', borderRadius:2}}/> 50% - 80%</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}><span style={{width: 12, height: 12, background:'#ffd166', borderRadius:2}}/> &lt; 50%</div>
                        </div>
                    </div>
                    <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 12 }}>
                        Toca un departamento para filtrar los resultados del dashboard.
                    </p>
                </div>

                {/* Gráficos de Resultados */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div className="card">
                        <h3>Tendencia de Votación: RRV vs Cómputo Oficial</h3>
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={dataComparacion} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="partido" axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} />
                                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: 8, border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'}}/>
                                <Legend wrapperStyle={{ paddingTop: 20 }}/>
                                <Bar dataKey="RRV" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                                <Bar dataKey="Oficial" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
                        <div className="card" style={{ marginBottom: 0 }}>
                            <h3>Distribución Votos Válidos</h3>
                            <ResponsiveContainer width="100%" height={200}>
                                <PieChart>
                                    <Pie data={dataPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2}>
                                        {dataPie.map((d, i) => <Cell key={i} fill={d.fill} />)}
                                    </Pie>
                                    <Tooltip contentStyle={{borderRadius: 8, border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'}}/>
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid">
                <div className="card">
                    <h3>Detalle Departamental {selectedDepto !== 'TODOS' ? `- ${selectedDepto}` : ''}</h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table>
                            <thead><tr><th>Departamento</th><th>Habilitados</th><th>Votos Emitidos</th><th>Participación</th><th>Estado</th></tr></thead>
                            <tbody>
                                {displayParticipacion.map((p: any) => (
                                    <tr key={p.departamento}>
                                        <td style={{ fontWeight: 600 }}>{p.departamento}</td>
                                        <td>{Number(p.total_habilitados).toLocaleString()}</td>
                                        <td>{Number(p.total_emitidos).toLocaleString()}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${p.porcentaje}%`, background: '#2563eb' }} />
                                                </div>
                                                <span style={{ fontSize: 13, fontWeight: 600, minWidth: 45 }}>{p.porcentaje}%</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{ padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, background: Number(p.porcentaje) > 50 ? '#dcfce7' : '#fef9c3', color: Number(p.porcentaje) > 50 ? '#166534' : '#854d0e' }}>
                                                {Number(p.porcentaje) > 50 ? 'Óptimo' : 'Procesando'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {displayParticipacion.length === 0 && (
                                    <tr><td colSpan={5} style={{textAlign:'center', padding: 24, color: '#64748b'}}>No hay datos para el filtro seleccionado.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Explorador de Jerarquía */}
                {selectedDepto !== 'TODOS' && (
                <div className="card">
                    <h3>Explorador Geográfico - {selectedDepto}</h3>
                    <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>Navega por la estructura de asientos electorales inamovibles.</p>
                    
                    {selectedProv === 'TODOS' ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {provincias.map(p => (
                                <button key={p} className="secondary" onClick={() => setSelectedProv(p)}>{p}</button>
                            ))}
                        </div>
                    ) : selectedRecinto === 'TODOS' ? (
                        <div>
                            <button className="secondary" onClick={() => setSelectedProv('TODOS')} style={{ marginBottom: 12 }}>← Volver a Provincias</button>
                            
                            <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
                                <div>
                                    <h4 style={{ margin: '0 0 12px 0' }}>Recintos en {selectedProv}</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {recintos.map(r => (
                                            <div key={r.id_recinto} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <strong>{r.nombre}</strong> <span style={{ fontSize: 12, color: '#64748b' }}>({r.cantidad_mesas} mesas)</span>
                                                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{r.direccion}</div>
                                                </div>
                                                <button onClick={() => setSelectedRecinto(r.id_recinto)}>Ver Mesas</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                
                                <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #cbd5e1' }}>
                                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 12}}>
                                        <h4 style={{margin:0}}>Recintos por Tiempo Promedio</h4>
                                        <select value={filtroTiempos} onChange={(e) => setFiltroTiempos(e.target.value as any)} style={{fontSize: 12, padding: 4}}>
                                            <option value="rapidas">Top Rápidos</option>
                                            <option value="lentas">Top Lentos</option>
                                        </select>
                                    </div>
                                    <ul className="ranking-list" style={{margin:0}}>
                                        {provTiempos?.data ? (
                                            provTiempos.data[filtroTiempos === 'rapidas' ? 'mas_rapidas' : 'mas_lentas']?.map((m: any, i: number) => (
                                                <li key={m.id_recinto || i}>
                                                    <span className="rank">{i+1}</span>
                                                    <span className="mesa" style={{lineHeight: 1.2}}>
                                                        {m.recinto_nombre}
                                                    </span>
                                                    <span className="time">{Math.floor(m.duracion_minutos / 60)}h {m.duracion_minutos % 60}m</span>
                                                </li>
                                            ))
                                        ) : (
                                            <li style={{textAlign:'center', color:'#64748b'}}>Cargando...</li>
                                        )}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    ) : selectedMesa === 'TODOS' ? (
                        <div>
                            <button className="secondary" onClick={() => setSelectedRecinto('TODOS')} style={{ marginBottom: 12 }}>← Volver a Recintos</button>
                            <h4 style={{ margin: '0 0 12px 0' }}>Mesas en el Recinto Seleccionado</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                                {mesas.map(m => (
                                    <div key={m.codigo_mesa} style={{ padding: 12, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, textAlign: 'center', cursor: 'pointer', transition: 'background 0.2s' }} onClick={() => setSelectedMesa(m.codigo_mesa)}>
                                        <strong style={{ display: 'block', fontSize: 18, color: '#0f172a' }}>Mesa {m.nro_mesa}</strong>
                                        <span style={{ fontSize: 12, color: '#64748b' }}>{m.cantidad_habilitada} habilitados</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div>
                            <button className="secondary" onClick={() => setSelectedMesa('TODOS')} style={{ marginBottom: 12 }}>← Volver a Mesas</button>
                            <h4 style={{ margin: '0 0 12px 0' }}>Detalle Oficial de Mesa #{selectedMesa}</h4>
                            {mesaDetalle ? (
                                <div style={{ background: '#f8fafc', padding: 20, borderRadius: 12, border: '1px solid #cbd5e1' }}>
                                    <div className="grid grid-cols-4" style={{ marginBottom: 16 }}>
                                        <div><strong style={{color:'#64748b', fontSize:12}}>ESTADO</strong><br/><span className="badge">{mesaDetalle.estado}</span></div>
                                        <div><strong style={{color:'#64748b', fontSize:12}}>HABILITADOS</strong><br/>{mesaDetalle.habilitados}</div>
                                        <div><strong style={{color:'#64748b', fontSize:12}}>EMITIDOS</strong><br/>{mesaDetalle.votos_emitidos}</div>
                                        <div><strong style={{color:'#64748b', fontSize:12}}>AUSENTISMO</strong><br/>{mesaDetalle.ausentismo}</div>
                                    </div>
                                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                                        <strong style={{color:'#0f172a', marginBottom:12, display:'block'}}>Distribución de Votos</strong>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                            <div style={{display:'flex', justifyContent:'space-between', padding:8, background:'#fff', borderRadius:6, border:'1px solid #e2e8f0'}}><span>Daenerys Targaryen</span><strong>{mesaDetalle.p1}</strong></div>
                                            <div style={{display:'flex', justifyContent:'space-between', padding:8, background:'#fff', borderRadius:6, border:'1px solid #e2e8f0'}}><span>Sansa Stark</span><strong>{mesaDetalle.p2}</strong></div>
                                            <div style={{display:'flex', justifyContent:'space-between', padding:8, background:'#fff', borderRadius:6, border:'1px solid #e2e8f0'}}><span>Robert Baratheon</span><strong>{mesaDetalle.p3}</strong></div>
                                            <div style={{display:'flex', justifyContent:'space-between', padding:8, background:'#fff', borderRadius:6, border:'1px solid #e2e8f0'}}><span>Tyrion Lannister</span><strong>{mesaDetalle.p4}</strong></div>
                                            <div style={{display:'flex', justifyContent:'space-between', padding:8, background:'#fff', borderRadius:6, border:'1px solid #e2e8f0'}}><span>Votos Blancos</span><strong>{mesaDetalle.votos_blancos}</strong></div>
                                            <div style={{display:'flex', justifyContent:'space-between', padding:8, background:'#fff', borderRadius:6, border:'1px solid #e2e8f0'}}><span>Votos Nulos</span><strong>{mesaDetalle.votos_nulos}</strong></div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>Aún no hay resultados consolidados para esta mesa.</div>
                            )}
                        </div>
                    )}
                </div>
                )}
            </div>

            {/* Ganador por territorio + Top horarios */}
            <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, paddingBottom: 0, borderBottom: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Trophy size={18} color="#f59e0b" /> Partido ganador por territorio
                        </h3>
                        <select value={nivelGanador} onChange={(e) => setNivelGanador(e.target.value as any)} style={{ width: 'auto' }}>
                            <option value="departamento">Por Departamento</option>
                            <option value="provincia">Por Provincia</option>
                            <option value="municipio">Por Municipio</option>
                            <option value="recinto">Por Recinto</option>
                        </select>
                    </div>
                    <div className="table-wrap" style={{ maxHeight: 400, overflow: 'auto' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>{nivelGanador.charAt(0).toUpperCase() + nivelGanador.slice(1)}</th>
                                    <th>Ganador</th>
                                    <th>Votos</th>
                                    <th>P1</th><th>P2</th><th>P3</th><th>P4</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(ganadores?.data || []).map((g: any, i: number) => {
                                    const nombre = g.recinto_nombre || g.municipio || g.provincia || g.departamento;
                                    const colorPartido: Record<string, string> = {
                                        P1: '#1d4ed8', P2: '#047857', P3: '#b91c1c', P4: '#6d28d9',
                                    };
                                    return (
                                        <tr key={i}>
                                            <td style={{ fontWeight: 600 }}>{nombre}</td>
                                            <td>
                                                <span style={{
                                                    background: `${colorPartido[g.partido_ganador]}1a`,
                                                    color: colorPartido[g.partido_ganador],
                                                    padding: '3px 10px', borderRadius: 6,
                                                    fontSize: 12, fontWeight: 700,
                                                }}>
                                                    🏆 {g.partido_ganador}
                                                </span>
                                            </td>
                                            <td><strong>{Number(g.votos_ganador).toLocaleString()}</strong></td>
                                            <td style={{ fontSize: 12 }}>{g.p1}</td>
                                            <td style={{ fontSize: 12 }}>{g.p2}</td>
                                            <td style={{ fontSize: 12 }}>{g.p3}</td>
                                            <td style={{ fontSize: 12 }}>{g.p4}</td>
                                        </tr>
                                    );
                                })}
                                {(!ganadores?.data || ganadores.data.length === 0) && (
                                    <tr><td colSpan={7} className="empty">Aún no hay actas aprobadas para calcular ganadores.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="card">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Clock size={18} color="#2563eb" /> Cierre de mesas por hora
                    </h3>
                    {topHorarios.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={topHorarios.map((h: any) => ({
                                hora: `${h.hora}:00`,
                                actas: Number(h.actas_cerradas),
                                emitidos: Number(h.total_emitidos),
                            }))}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="hora" axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                                <Legend />
                                <Bar dataKey="actas" fill="#2563eb" name="Actas cerradas" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="emitidos" fill="#10b981" name="Votos emitidos" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="empty">Aún no hay datos de cierre.</div>
                    )}
                </div>
            </div>
        </div>
    );
}

function BloqueKpi({ emitidos, validos, mesas, cuarentena, label1 = 'Votos emitidos', label2 = 'Votos válidos', label3 = 'Mesas Aprobadas', label4 = 'En Cuarentena' }: any) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Mini label={label1} value={Number(emitidos || 0).toLocaleString()} color="#2563eb" />
            <Mini label={label2} value={Number(validos || 0).toLocaleString()} color="#10b981" />
            <Mini label={label3} value={Number(mesas || 0).toLocaleString()} color="#8b5cf6" />
            <Mini label={label4} value={Number(cuarentena || 0).toLocaleString()} color="#f59e0b" />
        </div>
    );
}

function Mini({ label, value, color }: { label: string; value: any; color: string }) {
    return (
        <div style={{ background: 'var(--c-surface-2)', padding: 12, borderRadius: 10, borderLeft: `3px solid ${color}` }}>
            <div style={{ fontSize: 11, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                {label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-text)' }}>{value}</div>
        </div>
    );
}
