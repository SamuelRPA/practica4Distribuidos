// La app móvil ahora es nativa con Expo + React Native, no vive aquí.
// Esta ruta queda como información para el operador.
'use client';

export default function MobileMoved() {
    return (
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px' }}>
            <h1>📱 La app móvil es nativa (Expo + React Native)</h1>
            <p style={{ color: '#666' }}>
                La aplicación de captura de actas es una app nativa para Android e iOS.
                Se prueba con Expo Go escaneando un QR.
            </p>

            <div className="card">
                <strong>Cómo arrancarla:</strong>
                <pre style={{ background: '#0b1e3a', color: '#f7f9fc', padding: 16, borderRadius: 8, marginTop: 12, overflow: 'auto' }}>
{`# 1. En tu PC
cd mobile-app
npm install

# 2. Edita .env con tu IP local
ipconfig | findstr IPv4              # Windows
# Pega esa IP en mobile-app/.env:
# EXPO_PUBLIC_API_BASE_URL=http://TU_IP:3001

# 3. Arranca el dev server
npx expo start

# 4. En tu celular: instala "Expo Go" desde Play Store / App Store
# 5. Escanea el QR que sale en la terminal de tu PC`}
                </pre>
            </div>

            <p style={{ marginTop: 24, fontSize: 14, color: '#666' }}>
                La documentación completa está en <code>mobile-app/README.md</code>.
            </p>

            <p style={{ marginTop: 16 }}>
                <a href="/sms-admin">→ Ir a Administración de SMS</a>
            </p>
        </div>
    );
}
