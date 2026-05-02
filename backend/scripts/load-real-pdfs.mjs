import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const PDF_DIR = path.join(ROOT, 'Data', 'pdf');
const API_URL = 'http://localhost:3001/api/rrv/acta-pdf';

async function uploadPdf(filePath) {
    const fileName = path.basename(filePath);
    const mesaMatch = fileName.match(/acta_(\d+)\.pdf/);
    if (!mesaMatch) return;

    const codigoMesa = mesaMatch[1];
    console.log(`[loader] Subiendo acta de mesa ${codigoMesa}...`);

    const formData = new FormData();
    const blob = new Blob([fs.readFileSync(filePath)], { type: 'application/pdf' });
    formData.append('file', blob, fileName);
    formData.append('codigo_mesa', codigoMesa);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: formData,
        });
        const result = await response.json();
        console.log(`[loader] Mesa ${codigoMesa}: ${response.status} - ${JSON.stringify(result)}`);
    } catch (err) {
        console.error(`[loader] Error en mesa ${codigoMesa}:`, err.message);
    }
}

async function main() {
    if (!fs.existsSync(PDF_DIR)) {
        console.error(`Directorio no encontrado: ${PDF_DIR}`);
        return;
    }

    const files = fs.readdirSync(PDF_DIR).filter(f => f.endsWith('.pdf')).slice(0, 5); // Subir los primeros 5
    console.log(`==== Cargando ${files.length} actas reales al pipeline ====`);

    for (const file of files) {
        await uploadPdf(path.join(PDF_DIR, file));
        await new Promise(r => setTimeout(r, 1000)); // Esperar un poco entre envíos
    }

    console.log('==== Envío completado. Revisa los logs de los workers para ver el OCR en acción. ====');
}

main();
