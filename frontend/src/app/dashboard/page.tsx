'use client';

import { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
    Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart
} from 'recharts';
import { api } from '@/lib/api';
import styles from './dashboard.module.css';
import geoDataRaw from './geoData.json';

const BoliviaMap = dynamic(() => import('./BoliviaMap'), { ssr: false });

const COLORS = ['#38bdf8', '#818cf8', '#34d399', '#f472b6', '#fbbf24', '#f87171'];
const RRV_COLOR = '#38bdf8';
const OFICIAL_COLOR = '#818cf8';

// Party Name Mapping
const PARTY_NAMES: Record<string, string> = {
    'p1': 'Frente Patriota (FP)',
    'p2': 'Unidad Nacional (UN)',
    'p3': 'Alianza Cívica (AC)',
    'p4': 'Mov. Popular (MP)',
    'votos_blancos': 'Blancos',
    'votos_nulos': 'Nulos'
};

const formatPartyName = (p: string) => PARTY_NAMES[p] || p.toUpperCase();

const geoData = geoDataRaw.jerarquia as any;
const departamentos = Object.keys(geoData).sort();

export default function Dashboard() {
    // Tabs
    const [activeTab, setActiveTab] = useState<'global' | 'geo' | 'tech'>('global');

    // Modals
    const [pdfModalOpen, setPdfModalOpen] = useState<string | null>(null);
    const [anomaliesModalOpen, setAnomaliesModalOpen] = useState(false);

    // Active chart focus
    const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

    // API Data state
    const [rrv, setRrv] = useState<any>(null);
    const [oficial, setOficial] = useState<any>(null);
    const [comp, setComp] = useState<any>(null);

    // Filter State
    const [selectedDept, setSelectedDept] = useState<string>('');
    const [selectedProv, setSelectedProv] = useState<string>('');
    const [selectedMuni, setSelectedMuni] = useState<string>('');
    const [selectedRecinto, setSelectedRecinto] = useState<string>('');

    // Fetch data
    useEffect(() => {
        const cargar = async () => {
            try {
                const [r, o, c] = await Promise.all([
                    api.rrvResumen(),
                    api.oficialResumen(),
                    api.comparacion(),
                ]).catch(() => [null, null, null]);
                
                if (r) setRrv(r);
                if (o) setOficial(o);
                if (c) setComp(c);
            } catch (err) {
                console.error('Error fetching dashboard data', err);
            }
        };
        cargar();
        const t = setInterval(cargar, 5000);
        return () => clearInterval(t);
    }, []);

    // Geographic Selectors Derived State
    const provincias = useMemo(() => selectedDept ? Object.keys(geoData[selectedDept] || {}).sort() : [], [selectedDept]);
    const municipios = useMemo(() => selectedDept && selectedProv ? Object.keys(geoData[selectedDept][selectedProv] || {}).sort() : [], [selectedDept, selectedProv]);
    const recintos = useMemo(() => selectedDept && selectedProv && selectedMuni ? (geoData[selectedDept][selectedProv][selectedMuni] || []) : [], [selectedDept, selectedProv, selectedMuni]);
    
    const currentRecintoData = useMemo(() => recintos.find((r: any) => r.codRecinto === selectedRecinto), [recintos, selectedRecinto]);

    // Mock Technical & Advanced Data
    const techMetrics = useMemo(() => ({
        latency: Math.floor(Math.random() * 20 + 30),
        throughput: Math.floor(Math.random() * 500 + 4500),
        uptime: 99.98,
        anomalies: Math.floor(Math.random() * 3),
    }), [rrv]);

    // Derived Real Data
    const totalesRrv = rrv?.totales || {};
    const totalesOf = oficial?.totales || {};
    const participacion = oficial?.participacion || [];

    const partidos = ['p1', 'p2', 'p3', 'p4'];
    
    const validVotesOficial = partidos.reduce((sum, p) => sum + Number(totalesOf[`total_${p}`] || totalesOf[p] || 0), 0);
    const totalEmitidos = Number(totalesOf.total_emitidos || 0);
    const tasaParticipacion = totalEmitidos > 0 ? ((totalEmitidos / (totalEmitidos + 1000000)) * 100).toFixed(1) : "0.0"; // Simulated 1M total
    
    // Actas states
    const actasRecibidas = (rrv?.estados?.find((e:any) => e._id === 'RECIBIDA')?.cantidad || 0);
    const actasProcesadas = (oficial?.estados?.find((e:any) => e.estado === 'COMPLETADA')?.cantidad || 0);
    const totalActasEstimado = 35000; // Mocked expected total
    const actasPendientes = Math.max(0, totalActasEstimado - actasProcesadas);

    // Margen de Victoria Calculation
    const sortedOficial = [...partidos].map(p => ({ p, v: Number(totalesOf[p] || 0) })).sort((a,b) => b.v - a.v);
    const margenVictoria = sortedOficial.length > 1 ? sortedOficial[0].v - sortedOficial[1].v : 0;
    const ganadorActual = sortedOficial.length > 0 ? formatPartyName(sortedOficial[0].p) : 'N/A';

    // Charts Data
    const dataComparacion = partidos.map((p) => ({
        candidato: formatPartyName(p),
        RRV: Number(totalesRrv[p] || 0),
        Oficial: Number(totalesOf[p] || 0),
    }));

    const dataPie = partidos.map((p, i) => ({
        name: formatPartyName(p),
        value: Number(totalesOf[p] || 0),
        fill: COLORS[i % COLORS.length],
    }));

    // Regional Filter logic to calculate regional votes
    const getRegionalVotes = () => {
        // Since we don't have regional breakdown from the real backend yet, we'll simulate it proportionally.
        // For a true implementation, we would sum the votes from the API for the selected level.
        let factor = 1.0;
        let title = "Resultados Nacionales";
        if (selectedRecinto) {
            factor = 0.005; // very small portion
            title = `Resultados en Recinto: ${currentRecintoData?.nombre || 'Desconocido'}`;
        } else if (selectedMuni) {
            factor = 0.05;
            title = `Resultados en Municipio: ${selectedMuni}`;
        } else if (selectedProv) {
            factor = 0.15;
            title = `Resultados en Provincia: ${selectedProv}`;
        } else if (selectedDept) {
            factor = 0.30;
            title = `Resultados en Departamento: ${selectedDept}`;
        }

        const simulatedVotes = validVotesOficial * factor;
        const partyVotes = partidos.map((p, i) => ({
            name: formatPartyName(p),
            value: Math.floor(Number(totalesOf[p] || 100000) * factor),
            fill: COLORS[i % COLORS.length],
        }));

        return {
            title,
            total: Math.floor(totalEmitidos * factor),
            validos: Math.floor(simulatedVotes),
            nulos: Math.floor(15000 * factor),
            blancos: Math.floor(8000 * factor),
            partyVotes
        };
    };

    const regionalStats = getRegionalVotes();

    const speedData = useMemo(() => Array.from({ length: 10 }).map((_, i) => ({
        time: `T-${9-i}m`,
        rrvSpeed: Math.floor(Math.random() * 100 + 500),
        oficialSpeed: Math.floor(Math.random() * 50 + 300),
    })), [rrv]);

    // Render logic
    if (!rrv && !oficial) return (
        <div className={styles.container} style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
            <div className={styles.liveIndicator}>
                <div className={styles.liveDot}></div>
                Iniciando Conexión con Clusters...
            </div>
        </div>
    );

    return (
        <div className={styles.container}>
            {/* HEADER */}
            <header className={styles.header}>
                <div>
                    <h1>Centro de Inteligencia Electoral</h1>
                    <p>Monitoreo en tiempo real de RRV y Cómputo Oficial</p>
                </div>
                <div className={styles.liveIndicator}>
                    <div className={styles.liveDot}></div>
                    Transmisión Activa
                </div>
            </header>

            {/* TABS NAVIGATION */}
            <div className={styles.tabsContainer}>
                <button className={`${styles.tab} ${activeTab === 'global' ? styles.active : ''}`} onClick={() => setActiveTab('global')}>
                    Visión Global
                </button>
                <button className={`${styles.tab} ${activeTab === 'geo' ? styles.active : ''}`} onClick={() => setActiveTab('geo')}>
                    Análisis Geográfico
                </button>
                <button className={`${styles.tab} ${activeTab === 'tech' ? styles.active : ''}`} onClick={() => setActiveTab('tech')}>
                    Transparencia y Tecnología
                </button>
            </div>

            {/* TAB: VISIÓN GLOBAL */}
            {activeTab === 'global' && (
                <>
                    {/* KPIs */}
                    <div className={styles.kpiGrid}>
                        <div className={styles.glassCard}>
                            <div className={styles.kpiLabel}>Votos Emitidos (Oficial)</div>
                            <div className={styles.kpiValue}>{totalEmitidos.toLocaleString()}</div>
                            <div className={styles.kpiDelta}>Tasa Participación: {tasaParticipacion}%</div>
                        </div>
                        <div className={styles.glassCard}>
                            <div className={styles.kpiLabel}>Votos Válidos (Oficial)</div>
                            <div className={styles.kpiValue}>{validVotesOficial.toLocaleString()}</div>
                            <div className={styles.kpiDelta + ' ' + styles.positive}>
                                {totalEmitidos ? ((validVotesOficial/totalEmitidos)*100).toFixed(1) : 0}% del total
                            </div>
                        </div>
                        <div className={styles.glassCard}>
                            <div className={styles.kpiLabel}>Actas (Recibidas / Pendientes)</div>
                            <div className={styles.kpiValue}>
                                {actasRecibidas.toLocaleString()} <span style={{fontSize: '1rem', color: '#94a3b8'}}>/ {actasPendientes.toLocaleString()} pend.</span>
                            </div>
                            <div className={styles.progressBarBg}>
                                <div className={styles.progressBarFill} style={{ width: `${(actasRecibidas/totalActasEstimado)*100}%`, backgroundColor: '#38bdf8' }}></div>
                            </div>
                        </div>
                        <div className={styles.glassCard}>
                            <div className={styles.kpiLabel}>Margen de Victoria</div>
                            <div className={styles.kpiValue}>{margenVictoria.toLocaleString()}</div>
                            <div className={styles.kpiDelta + ' ' + styles.info}>Líder: {ganadorActual}</div>
                        </div>
                    </div>

                    <div className={styles.mainGrid}>
                        <div className={styles.glassCard}>
                            <h3 className={styles.sectionTitle}>Comparativa de Tendencias: RRV vs Oficial</h3>
                            <div className={styles.chartContainer}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={dataComparacion} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                        <XAxis dataKey="candidato" stroke="#94a3b8" />
                                        <YAxis stroke="#94a3b8" />
                                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                                        <Legend onMouseEnter={(o) => setActiveIndex(dataComparacion.findIndex(d => d.candidato === o.value))} onMouseLeave={() => setActiveIndex(undefined)} />
                                        <Bar dataKey="RRV" fill={RRV_COLOR} radius={[4, 4, 0, 0]} opacity={activeIndex !== undefined ? 0.3 : 1} />
                                        <Bar dataKey="Oficial" fill={OFICIAL_COLOR} radius={[4, 4, 0, 0]} opacity={activeIndex !== undefined ? 0.3 : 1} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className={styles.glassCard}>
                            <h3 className={styles.sectionTitle}>Distribución Oficial</h3>
                            <div style={{ width: '100%', height: '250px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={dataPie} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value"
                                             onMouseEnter={(_, index) => setActiveIndex(index)}
                                             onMouseLeave={() => setActiveIndex(undefined)}>
                                            {dataPie.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} 
                                                      opacity={activeIndex === undefined || activeIndex === index ? 1 : 0.3} 
                                                      stroke={activeIndex === index ? '#fff' : 'none'} strokeWidth={2} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} />
                                        <Legend onMouseEnter={(o, i) => setActiveIndex(i)} onMouseLeave={() => setActiveIndex(undefined)} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* TAB: ANÁLISIS GEOGRÁFICO */}
            {activeTab === 'geo' && (
                <div className={styles.mainGrid}>
                    {/* Filtros Geográficos */}
                    <div className={styles.glassCard} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h3 className={styles.sectionTitle}>Filtro de Localización</h3>
                        <div className={styles.selectGroup}>
                            <label>Departamento</label>
                            <select value={selectedDept} onChange={(e) => { setSelectedDept(e.target.value); setSelectedProv(''); setSelectedMuni(''); setSelectedRecinto(''); }}>
                                <option value="">Selecciona Departamento...</option>
                                {departamentos.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div className={styles.selectGroup}>
                            <label>Provincia</label>
                            <select value={selectedProv} onChange={(e) => { setSelectedProv(e.target.value); setSelectedMuni(''); setSelectedRecinto(''); }} disabled={!selectedDept}>
                                <option value="">Selecciona Provincia...</option>
                                {provincias.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div className={styles.selectGroup}>
                            <label>Municipio</label>
                            <select value={selectedMuni} onChange={(e) => { setSelectedMuni(e.target.value); setSelectedRecinto(''); }} disabled={!selectedProv}>
                                <option value="">Selecciona Municipio...</option>
                                {municipios.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div className={styles.selectGroup}>
                            <label>Recinto Electoral</label>
                            <select value={selectedRecinto} onChange={(e) => setSelectedRecinto(e.target.value)} disabled={!selectedMuni}>
                                <option value="">Selecciona Recinto...</option>
                                {recintos.map((r: any) => <option key={r.codRecinto} value={r.codRecinto}>{r.nombre}</option>)}
                            </select>
                        </div>

                        {/* Recinto Details (Simulated votes if selected) */}
                        {currentRecintoData && (
                            <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                <h4 style={{ margin: '0 0 0.5rem 0', color: '#38bdf8' }}>{currentRecintoData.nombre}</h4>
                                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#94a3b8' }}>📍 {currentRecintoData.direccion}</p>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span>Nro. Mesas: <strong>{currentRecintoData.numMesas}</strong></span>
                                    <span style={{ color: '#34d399' }}>100% Escrutadas</span>
                                </div>
                                <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '1rem 0' }}/>
                                <p style={{ fontSize: '0.85rem', color: '#e2e8f0', marginBottom: '0.5rem' }}>Resultados Simulados Recinto:</p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                                    {partidos.map((p, i) => (
                                        <div key={p} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>{formatPartyName(p)}</span>
                                            <strong>{Math.floor(Math.random() * 300 + 100)}</strong>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Mapa Interactivo */}
                    <div className={styles.glassCard} style={{ padding: 0, overflow: 'hidden' }}>
                        <BoliviaMap selectedDept={selectedDept} selectedMuni={selectedMuni} recinto={currentRecintoData} />
                    </div>

                    {/* Regional Statistics underneath map/filters */}
                    <div className={styles.glassCard} style={{ gridColumn: 'span 2', marginTop: '1rem' }}>
                        <h3 className={styles.sectionTitle}>{regionalStats.title}</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div>
                                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Votos Totales</span>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{regionalStats.total.toLocaleString()}</div>
                            </div>
                            <div>
                                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Válidos</span>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#34d399' }}>{regionalStats.validos.toLocaleString()}</div>
                            </div>
                            <div>
                                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Nulos</span>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f87171' }}>{regionalStats.nulos.toLocaleString()}</div>
                            </div>
                            <div>
                                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Blancos</span>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{regionalStats.blancos.toLocaleString()}</div>
                            </div>
                        </div>
                        <h4 style={{ fontSize: '0.9rem', color: '#e2e8f0', marginBottom: '0.5rem' }}>Distribución Partidaria en la Región</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                            {regionalStats.partyVotes.map(pv => {
                                const percent = regionalStats.validos > 0 ? ((pv.value / regionalStats.validos) * 100).toFixed(1) : 0;
                                return (
                                    <div key={pv.name} style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span style={{ fontSize: '0.85rem' }}>{pv.name}</span>
                                            <span style={{ fontWeight: 'bold' }}>{pv.value.toLocaleString()} ({percent}%)</span>
                                        </div>
                                        <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${percent}%`, backgroundColor: pv.fill }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: TRANSPARENCIA Y TECNOLOGIA */}
            {activeTab === 'tech' && (
                <div className={styles.thirdsGrid}>
                    
                    {/* Visor de Actas (Mock) */}
                    <div className={styles.glassCard} style={{ gridColumn: 'span 2' }}>
                        <h3 className={styles.sectionTitle}>Acceso a Actas Digitalizadas (PDF)</h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1rem' }}>
                            {currentRecintoData ? `Mostrando actas para: ${currentRecintoData.nombre}` : 'Seleccione un recinto en la pestaña Geográfica para ver actas específicas. Mostrando actas recientes a nivel nacional:'}
                        </p>
                        <div className={styles.pdfList}>
                            {[1, 2, 3, 4].map(num => (
                                <div key={num} className={styles.pdfItem}>
                                    <div className={styles.pdfIcon}>
                                        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>Acta_Mesa_00{num}.pdf</div>
                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Procesada: Hace {num * 5} mins • Verificado Blockchain</div>
                                        </div>
                                    </div>
                                    <button className={styles.pdfDownload} onClick={() => setPdfModalOpen(`Acta_Mesa_00${num}`)}>Ver Acta</button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Indicadores Tecnicos */}
                        <div className={styles.glassCard}>
                            <h3 className={styles.sectionTitle}>Indicadores Técnicos</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div><div className={styles.kpiLabel}>Latencia Avg</div><div className={styles.kpiValue} style={{ fontSize: '1.5rem' }}>{techMetrics.latency}ms</div></div>
                                <div><div className={styles.kpiLabel}>Throughput</div><div className={styles.kpiValue} style={{ fontSize: '1.5rem' }}>{techMetrics.throughput}/s</div></div>
                                <div><div className={styles.kpiLabel}>Disponibilidad</div><div className={styles.kpiValue} style={{ fontSize: '1.5rem', color: '#34d399' }}>{techMetrics.uptime}%</div></div>
                                <div><div className={styles.kpiLabel}>Seguridad</div><div className={styles.kpiValue} style={{ fontSize: '1.2rem', color: '#34d399' }}>OK (WAF)</div></div>
                            </div>
                        </div>

                        {/* Analitica Avanzada */}
                        <div className={styles.glassCard}>
                            <h3 className={styles.sectionTitle}>Analítica Avanzada (AI)</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: '#94a3b8' }}>Detección de Anomalías</span>
                                    <span className={`${styles.badge} ${styles.clickableBadge} ${techMetrics.anomalies > 0 ? styles.danger : styles.success}`}
                                          onClick={() => techMetrics.anomalies > 0 && setAnomaliesModalOpen(true)}>
                                        {techMetrics.anomalies > 0 ? `${techMetrics.anomalies} DETECTADAS (Ver Detalle)` : 'SIN ANOMALÍAS'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: '#94a3b8' }}>Patrones Atípicos</span>
                                    <span className={styles.badge + ' ' + styles.success}>NINGUNO</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: '#94a3b8' }}>Proyección Final (Confianza)</span>
                                    <span style={{ fontWeight: 'bold', color: '#fff' }}>94.2%</span>
                                </div>
                            </div>
                        </div>

                        {/* Nodos Blockchain */}
                        <div className={styles.glassCard}>
                            <h3 className={styles.sectionTitle}>Estado de Nodos (Consenso)</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '1rem' }}>
                                <div style={{ background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '0.5rem', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>OEP Master</span>
                                    <span style={{ color: '#34d399', fontWeight: 'bold', fontSize: '0.8rem' }}>SYNCED</span>
                                </div>
                                <div style={{ background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '0.5rem', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Nodo Auditoría</span>
                                    <span style={{ color: '#34d399', fontWeight: 'bold', fontSize: '0.8rem' }}>SYNCED</span>
                                </div>
                                <div style={{ background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '0.5rem', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Nodo CDE_CBBA</span>
                                    <span style={{ color: '#34d399', fontWeight: 'bold', fontSize: '0.8rem' }}>SYNCED</span>
                                </div>
                                <div style={{ background: 'rgba(250, 204, 21, 0.1)', border: '1px solid rgba(250, 204, 21, 0.3)', padding: '0.5rem', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Nodo CDE_LPZ</span>
                                    <span style={{ color: '#facc15', fontWeight: 'bold', fontSize: '0.8rem' }}>DELAY (2s)</span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {/* MODALS */}
            {pdfModalOpen && (
                <div className={styles.modalOverlay} onClick={() => setPdfModalOpen(null)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>Visor de Documentos: {pdfModalOpen}</h2>
                            <button className={styles.closeButton} onClick={() => setPdfModalOpen(null)}>✕</button>
                        </div>
                        <div style={{ background: '#f8fafc', padding: '2rem', borderRadius: '8px', color: '#0f172a', textAlign: 'center', minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24" style={{ marginBottom: '1rem', color: '#94a3b8' }}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                            <h3 style={{ margin: '0 0 0.5rem 0' }}>Acta de Escrutinio Original</h3>
                            <p style={{ margin: 0, color: '#64748b' }}>El archivo PDF digitalizado cargaría aquí.<br/>Firma Blockchain Verificada ✓</p>
                        </div>
                    </div>
                </div>
            )}

            {anomaliesModalOpen && (
                <div className={styles.modalOverlay} onClick={() => setAnomaliesModalOpen(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 style={{ color: '#ef4444' }}>⚠️ Anomalías Detectadas</h2>
                            <button className={styles.closeButton} onClick={() => setAnomaliesModalOpen(false)}>✕</button>
                        </div>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {Array.from({ length: techMetrics.anomalies }).map((_, i) => (
                                <li key={i} style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '1rem', borderRadius: '8px' }}>
                                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#fca5a5' }}>Inconsistencia Tipo {i+1}</h4>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#e2e8f0' }}>Se detectó una discrepancia en la suma de control criptográfico en la mesa {Math.floor(Math.random()*100)}. La validación del RRV vs Oficial excedió el límite de tolerancia estadística.</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

        </div>
    );
}
