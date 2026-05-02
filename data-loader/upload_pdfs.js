const fs = require('fs');
const path = require('path');

const BACKEND_URL = "http://localhost:3001/api/rrv/acta-pdf";

async function uploadPdfs(folderPath) {
    if (!fs.existsSync(folderPath)) {
        console.error(`Error: La carpeta ${folderPath} no existe.`);
        process.exit(1);
    }

    const files = fs.readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.pdf'));
    if (files.length === 0) {
        console.log(`No se encontraron archivos PDF en ${folderPath}.`);
        return;
    }

    console.log(`Se encontraron ${files.length} PDFs. Iniciando carga al backend...`);

    for (const file of files) {
        const filePath = path.join(folderPath, file);
        // Extraemos los números del nombre del archivo (Ej: "acta_10101001001.pdf" -> "10101001001")
        const match = file.match(/\d+/);
        if (!match) continue;
        const codigoMesa = match[0];

        const fileBuffer = fs.readFileSync(filePath);
        // En Node.js 18+ Blob y FormData ya son globales
        const fileBlob = new Blob([fileBuffer], { type: 'application/pdf' });
        
        const formData = new FormData();
        formData.append('file', fileBlob, file);
        formData.append('codigo_mesa', codigoMesa);

        try {
            process.stdout.write(`Subiendo acta de la mesa ${codigoMesa}... `);
            const response = await fetch(BACKEND_URL, {
                method: 'POST',
                body: formData
            });

            if (response.status === 202) {
                console.log('✓ [ENCOLADO OK]');
            } else {
                const text = await response.text();
                console.log(`✗ [ERROR ${response.status}] ${text}`);
            }
        } catch (e) {
            console.log(`✗ [FALLO DE RED] ${e.message}`);
        }
    }
    console.log("¡Carga finalizada!");
}

const targetFolder = process.argv[2];
if (!targetFolder) {
    console.log("\n--- SCRIPT DE CARGA MASIVA DE PDFs ---");
    console.log("Uso: node upload_pdfs.js <ruta_a_carpeta_con_pdfs>");
    console.log("Importante: El nombre del PDF debe ser el código de la mesa (Ej: 10101001001.pdf)\n");
} else {
    uploadPdfs(targetFolder);
}
