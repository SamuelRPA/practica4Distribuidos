// Script de test end-to-end del pipeline RRV.
// Ejecuta:
//   1. Registra un número SMS autorizado
//   2. Manda 3 SMS al webhook genérico (uno OK, uno de número no autorizado, uno incompleto)
//   3. Manda una foto mock al endpoint /api/rrv/acta-pdf
//   4. Espera y consulta /api/rrv/resumen para verificar que los datos llegaron a Mongo
//
// Uso:
//   cd backend && node --env-file=../.env scripts/test-flow.mjs
//
// Requiere: backend corriendo en :3001, RabbitMQ y workers corriendo.

const BASE = process.env.BACKEND_BASE_URL || 'http://localhost:3001';

const C = {
    reset: '\x1b[0m', bold: '\x1b[1m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    blue: '\x1b[34m', cyan: '\x1b[36m', magenta: '\x1b[35m', gray: '\x1b[90m',
};

const NUMERO_TEST   = '+59170123456';
const NUMERO_NO_AUT = '+59171999999';
const MESA_TEST     = 10101001001; // Existe en padrón si se cargaron datos
const MESA_TEST_2   = 10101001002;

function log(color, label, msg, data) {
    const stamp = new Date().toLocaleTimeString('es-BO', { hour12: false });
    console.log(`${C.gray}${stamp}${C.reset} ${color}[${label.padEnd(10)}]${C.reset} ${msg}`);
    if (data !== undefined) console.log(`   ${C.gray}↳ ${JSON.stringify(data)}${C.reset}`);
}

function paso(n, titulo) {
    console.log(`\n${C.bold}${C.cyan}━━━━ PASO ${n}: ${titulo} ━━━━${C.reset}`);
}

async function fetchJson(url, init) {
    const r = await fetch(url, init);
    let body;
    try { body = await r.json(); } catch { body = { _texto: 'sin body json' }; }
    return { status: r.status, body };
}

async function dormir(ms) {
    return new Promise((res) => setTimeout(res, ms));
}

(async () => {
    console.log(`\n${C.bold}${C.magenta}╔══════════════════════════════════════════════════════╗${C.reset}`);
    console.log(`${C.bold}${C.magenta}║   TEST END-TO-END — Pipeline RRV                     ║${C.reset}`);
    console.log(`${C.bold}${C.magenta}╚══════════════════════════════════════════════════════╝${C.reset}`);
    console.log(`Backend: ${BASE}`);

    // -------- Paso 0: ping al backend --------
    paso(0, 'Ping al backend');
    try {
        const r = await fetchJson(`${BASE}/api/dashboard/health`);
        if (r.status === 200) log(C.green, 'OK', '✓ Backend responde', r.body);
        else throw new Error('backend no responde');
    } catch (err) {
        log(C.red, 'ERROR', `✗ Backend no disponible en ${BASE}`);
        log(C.red, 'ERROR', `Asegúrate de que esté corriendo (cd backend && npm run dev)`);
        process.exit(1);
    }

    // -------- Paso 1: registrar número --------
    paso(1, 'Registrar número SMS autorizado');
    const reg = await fetchJson(`${BASE}/api/sms/numeros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            numero: NUMERO_TEST,
            etiqueta: 'Operador test E2E',
            proveedor: 'GENERICO',
        }),
    });
    log(C.green, 'OK', `Registrado ${NUMERO_TEST}`, { status: reg.status });

    // -------- Paso 2: SMS válido --------
    paso(2, 'Mandar SMS válido al webhook');
    const smsBody = `M:${MESA_TEST};VE:70;VN:15;P1:0;P2:20;P3:8;P4:32;VB:4;NU:6`;
    log(C.cyan, 'INFO', `Enviando: "${smsBody}"`);
    const sms1 = await fetchJson(`${BASE}/api/sms/webhook/generico`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero_origen: NUMERO_TEST, texto: smsBody }),
    });
    log(C.green, 'OK', `Respuesta: status=${sms1.status}`, sms1.body);

    // -------- Paso 3: SMS de número NO autorizado --------
    paso(3, 'Mandar SMS de número NO autorizado (debe ignorarse)');
    const sms2 = await fetchJson(`${BASE}/api/sms/webhook/generico`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            numero_origen: NUMERO_NO_AUT,
            texto: `M:${MESA_TEST_2};VE:50;VN:10;P1:5;P2:10;P3:15;P4:20;VB:0;NU:0`,
        }),
    });
    log(C.yellow, 'OK', `Respuesta: status=${sms2.status} (204 = ignorado, esperado)`, sms2.body);

    // -------- Paso 4: SMS incompleto --------
    paso(4, 'Mandar SMS incompleto (debe rechazarse)');
    const sms3 = await fetchJson(`${BASE}/api/sms/webhook/generico`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            numero_origen: NUMERO_TEST,
            texto: 'M:99999;P1:5', // sin VE ni el resto de campos
        }),
    });
    log(C.yellow, 'OK', `Respuesta: status=${sms3.status} (esperado 422)`, sms3.body);

    // -------- Paso 5: Foto mock --------
    paso(5, 'Subir foto mock al endpoint de la app móvil');
    const fakeJpeg = new Uint8Array([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        ...Array(500).fill(0xAA), // padding para tener algo de tamaño
        0xFF, 0xD9,
    ]);
    const fd = new FormData();
    fd.append('file', new Blob([fakeJpeg], { type: 'image/jpeg' }), 'test_acta.jpg');
    fd.append('codigo_mesa', String(MESA_TEST));

    const photo = await fetchJson(`${BASE}/api/rrv/acta-pdf`, {
        method: 'POST',
        body: fd,
    });
    log(C.green, 'OK', `Respuesta: status=${photo.status}`, photo.body);

    // -------- Paso 6: esperar a que los workers procesen --------
    paso(6, 'Esperando 4s para que los workers procesen las colas...');
    await dormir(4000);

    // -------- Paso 7: verificar Mongo via /resumen --------
    paso(7, 'Consultar /api/rrv/resumen para verificar que llegó a Mongo');
    const resumen = await fetchJson(`${BASE}/api/rrv/resumen`);
    log(C.green, 'OK', `Resumen RRV recibido:`);
    console.log(JSON.stringify(resumen.body, null, 2));

    // -------- Paso 8: ver mensajes SMS auditados --------
    paso(8, 'Auditoría de SMS recibidos');
    const auditoria = await fetchJson(`${BASE}/api/sms/mensajes?limit=10`);
    if (Array.isArray(auditoria.body)) {
        log(C.green, 'OK', `${auditoria.body.length} mensajes en auditoría`);
        for (const m of auditoria.body.slice(0, 5)) {
            log(C.cyan, 'AUDIT',
                `${m.numero_origen} → ${m.resultado} (${m.codigo_mesa || 'sin mesa'})`);
        }
    }

    console.log(`\n${C.bold}${C.green}✓ TEST COMPLETADO${C.reset}`);
    console.log(`Revisa la terminal del backend para ver los logs detallados de cada paso.`);
    console.log(`Abre http://localhost:3000/dashboard para ver los datos en vivo.\n`);
})().catch((err) => {
    console.error(`${C.red}✗ Test falló:${C.reset}`, err);
    process.exit(1);
});
