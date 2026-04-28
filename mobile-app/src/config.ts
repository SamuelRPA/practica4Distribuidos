import Constants from 'expo-constants';

// La URL del backend la leemos en este orden:
// 1. Variable de entorno EXPO_PUBLIC_API_BASE_URL (.env)
// 2. extra.apiBaseUrl en app.json
// 3. fallback a localhost (no funciona desde móvil real, sólo emulador web)
function detectarApiBase(): string {
    const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
    const fromApp = (Constants.expoConfig?.extra as any)?.apiBaseUrl;
    return fromEnv || fromApp || 'http://localhost:3001';
}

export const config = {
    apiBaseUrl: detectarApiBase(),
    timeoutMs: 30_000,
    maxHistorial: 30,
};

console.log('[config] API base URL:', config.apiBaseUrl);
