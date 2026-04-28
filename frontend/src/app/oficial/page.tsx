'use client';

// Formulario web simple para el cómputo oficial.
// Manda un acta al endpoint /api/oficial/acta y muestra el resultado.
import { useState } from 'react';
import { api } from '@/lib/api';

export default function OficialForm() {
    const [acta, setActa] = useState({
        codigo_mesa: '',
        votos_emitidos: '',
        ausentismo: '',
        p1: '', p2: '', p3: '', p4: '',
        votos_blancos: '', votos_nulos: '',
        creado_por: 'operador_web',
    });
    const [resp, setResp] = useState<any>(null);

    function set(campo: string, valor: string) {
        setActa((a) => ({ ...a, [campo]: valor }));
    }

    async function enviar() {
        const numeric: any = { ...acta };
        for (const k of Object.keys(acta)) {
            if (k !== 'creado_por' && acta[k as keyof typeof acta] !== '') {
                numeric[k] = parseInt(acta[k as keyof typeof acta] as string, 10);
            }
        }
        numeric.fuente = 'MANUAL';
        const r = await api.enviarActaOficial(numeric);
        setResp(r);
    }

    return (
        <div style={{ maxWidth: 600 }}>
            <h1>Cómputo Oficial — Formulario</h1>
            <p>Ingresa los datos transcritos del acta física.</p>

            <div className="card">
                {Object.keys(acta).filter((k) => k !== 'creado_por').map((k) => (
                    <div key={k} style={{ marginBottom: 8 }}>
                        <label>{k}</label>
                        <input
                            type="number"
                            value={acta[k as keyof typeof acta]}
                            onChange={(e) => set(k, e.target.value)}
                        />
                    </div>
                ))}
                <button onClick={enviar} style={{ marginTop: 12 }}>Enviar acta</button>
            </div>

            {resp && (
                <div className="card" style={{
                    background: resp.status === 'APROBADA' ? '#dff6dd'
                            : resp.status === 'EN_CUARENTENA' ? '#fff3cd' : '#fdd',
                }}>
                    <strong>{resp.status}</strong>
                    <pre style={{ fontSize: 12 }}>{JSON.stringify(resp, null, 2)}</pre>
                </div>
            )}
        </div>
    );
}
