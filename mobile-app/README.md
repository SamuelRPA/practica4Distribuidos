# 📱 Mobile App (App de Ingesta Operativa)

Aplicación construida en React Native / Expo. Es la herramienta principal que usan los notarios electorales en los recintos para tomar fotos de las actas y enviarlas de inmediato al sistema RRV (Resultados Rápidos).

## 🚀 Cómo ejecutar

### 1. Configurar la Conexión
Debes indicarle a la App móvil dónde está el backend.
1. Renombra el archivo `.env.example` a `.env` (si no lo has hecho).
2. Modifica la variable para apuntar a la IP de tu computadora (Local IPv4):
```env
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:3001
```
*(No uses localhost si vas a probar en un celular físico, ya que localhost apuntaría al propio celular).*

### 2. Iniciar Expo
```bash
npm install
npx expo start
```

### 3. Probar en un Dispositivo
- Descarga la app **Expo Go** en tu iOS o Android.
- Asegúrate de que tu celular y tu PC estén en la misma red WiFi.
- Escanea el código QR que aparece en la terminal.

## 📸 Uso de la App
1. Escribe el código de la mesa electoral.
2. Presiona "Tomar Foto" para abrir la cámara (o subir desde galería).
3. Presiona "Enviar". La app agrupará el código de mesa y la foto y realizará una petición `multipart/form-data` a `/api/rrv/acta-pdf`.
