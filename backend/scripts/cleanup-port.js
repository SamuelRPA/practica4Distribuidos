import { execSync } from 'child_process';

const PORT = 3001;

try {
    console.log(`[cleanup] Buscando procesos en el puerto ${PORT}...`);
    // Encontrar el PID en Windows usando netstat
    const stdout = execSync(`netstat -ano | findstr :${PORT} | findstr LISTENING`).toString();
    const lines = stdout.trim().split('\n');
    
    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') {
            console.log(`[cleanup] Matando proceso fantasma PID: ${pid}`);
            execSync(`taskkill /F /PID ${pid}`);
        }
    }
} catch (e) {
    // Si findstr no encuentra nada, devuelve error, simplemente ignoramos
    console.log(`[cleanup] Puerto ${PORT} libre.`);
}
