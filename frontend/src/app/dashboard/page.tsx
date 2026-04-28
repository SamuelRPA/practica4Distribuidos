'use client';

import { useEffect, useState } from 'react';
import {
    Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '@/lib/api';

const COLORS = ['#1457bd', '#e94e1b', '#1aaa55', '#a557d0', '#999', '#444'];

export default function Dashboard() {
    const [rrv, setRrv] = useState<any>(null);
    const [oficial, setOficial] = useState<any>(null);
    const [comp, setComp] = useState<any>(null);

    useEffect(() => {
        const cargar = async () => {
            try {
                const [r, o, c] = await Promise.all([
                    api.rrvResumen(),
                    api.oficialResumen(),
                    api.comparacion(),
                ]);
                setRrv(r); setOficial(o); setComp(c);
            } catch (err) {
                console.error(err);
            }
        };
        cargar();
        const t = setInterval(cargar, 5000);
        return () => clearInterval(t);
    }, []);

    if (!rrv && !oficial) return <div>Cargando...</div>;

    const totalesRrv = rrv?.totales || {};
    const totalesOf = oficial?.totales || {};

    const partidos = ['p1', 'p2', 'p3', 'p4', 'votos_blancos', 'votos_nulos'];

    const dataComparacion = partidos.map((p) => ({
        partido: p.replace('votos_', '').toUpperCase(),
        RRV: Number(totalesRrv[p] || 0),
        Oficial: Number(totalesOf[p] || 0),
    }));

    const dataPie = partidos.slice(0, 4).map((p, i) => ({
        name: p.toUpperCase(),
        value: Number(totalesOf[p] || 0),
        fill: COLORS[i],
    }));

    return (
        <div>
            <h1>Dashboard Analítico</h1>

            <div className="grid">
                <div className="card kpi">
                    <span className="label">Votos emitidos (Oficial)</span>
                    <span className="value">{Number(totalesOf.total_emitidos || 0).toLocaleString()}</span>
                </div>
                <div className="card kpi">
                    <span className="label">Votos válidos (Oficial)</span>
                    <span className="value">
                        {(['p1','p2','p3','p4'].reduce((a, p) => a + Number(totalesOf[`total_${p}`] || totalesOf[p] || 0), 0)).toLocaleString()}
                    </span>
                </div>
                <div className="card kpi">
                    <span className="label">Estados RRV</span>
                    <ul>
                        {(rrv?.estados || []).map((e: any) => (
                            <li key={e._id}>{e._id}: <strong>{e.cantidad}</strong></li>
                        ))}
                    </ul>
                </div>
                <div className="card kpi">
                    <span className="label">Estados Oficial</span>
                    <ul>
                        {(oficial?.estados || []).map((e: any) => (
                            <li key={e.estado}>{e.estado}: <strong>{e.cantidad}</strong></li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className="card">
                <h3>Comparación RRV vs Oficial — votos por candidato</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={dataComparacion}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="partido" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="RRV" fill={COLORS[0]} />
                        <Bar dataKey="Oficial" fill={COLORS[1]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="grid">
                <div className="card">
                    <h3>Distribución de votos (Oficial)</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie data={dataPie} dataKey="value" nameKey="name" outerRadius={80}>
                                {dataPie.map((d, i) => <Cell key={i} fill={d.fill} />)}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <div className="card">
                    <h3>Participación por departamento</h3>
                    <table>
                        <thead><tr><th>Depto</th><th>Habilit.</th><th>Emitidos</th><th>%</th></tr></thead>
                        <tbody>
                            {(oficial?.participacion || []).map((p: any) => (
                                <tr key={p.departamento}>
                                    <td>{p.departamento}</td>
                                    <td>{Number(p.total_habilitados).toLocaleString()}</td>
                                    <td>{Number(p.total_emitidos).toLocaleString()}</td>
                                    <td>{p.porcentaje}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card">
                <h3>Top errores de validación</h3>
                <table>
                    <thead><tr><th>Tipo</th><th>Frecuencia</th></tr></thead>
                    <tbody>
                        {(oficial?.errores || []).map((e: any) => (
                            <tr key={e.tipo_error}><td>{e.tipo_error}</td><td>{e.frecuencia}</td></tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
