# Mobile App — Captura de Actas (Expo + React Native)

App nativa para Android e iOS. Construida con **Expo SDK 54** y React Native (v0.81+).
Captura fotos del acta con la cámara del dispositivo, registra ubicación GPS,
funciona offline (cola con reintento), y se conecta al backend RRV en el puerto 3001.

## Características implementadas

- 📷 **Cámara nativa** con `expo-image-picker` — toma foto o elige de galería
- 📍 **Geolocalización** opcional con `expo-location` — asocia el GPS del recinto a la captura
- 💾 **Persistencia local** con AsyncStorage — historial e historial sobreviven a reinicios
- 📡 **Modo offline con cola** — si no hay red, guarda y reintenta automáticamente al recuperar
- 🎨 **Diseño glassmorphism** coherente con el dashboard (paleta `#1457bd`)
- 🧭 **Navegación nativa** con Expo Router v6 (file-based routing)
- 🔄 **Polling de health** al backend cada 10s para reflejar estado online/offline
- ⚡ **Indicador de progreso** 1-2-3 estilo onboarding

## Pre-requisitos

- **Node.js 18+** (ya lo tienes)
- **App Expo Go** en tu teléfono — instálala desde:
  - [Google Play (Android)](https://play.google.com/store/apps/details?id=host.exp.exponent)
  - [App Store (iOS)](https://apps.apple.com/app/expo-go/id982107779)

## Quick start

```bash
cd mobile-app
npm install
```

### 1. Configura la URL del backend

El móvil **NO puede usar `localhost`** — necesita la IP de tu PC en la red Wi-Fi.

```bash
# Windows: averigua tu IP local
ipconfig | findstr IPv4
```

Vas a ver algo como `192.168.1.100`. Edita el archivo `.env`:

```
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:3001
```

### 2. Arranca el dev server

```bash
npx expo start
```

Verás un **QR code en la terminal**. Esto es lo que esperabas:

```
› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web

› QR Code: (apuntá la cámara del móvil aquí)
```

### 3. Abrir en tu teléfono

- **Android**: abre **Expo Go** → "Scan QR code" → apunta al QR de la terminal
- **iOS**: abre la **cámara del iPhone** → apunta al QR → toca el banner que aparece para abrir en Expo Go

La app carga en tu teléfono. Cualquier cambio en el código se refleja al instante (Hot Reload).

## Si el QR no funciona

A veces hay problemas de red local entre tu PC y el móvil. Soluciones:

```bash
# Opción 1 — túnel a través de internet (más lento pero siempre funciona)
npx expo start --tunnel

# Opción 2 — servidor LAN explícito
npx expo start --lan

# Opción 3 — abrir el Wi-Fi de tu PC y conectar el móvil ahí
# (especialmente útil si la red Wi-Fi tiene aislamiento de clientes)
```

## Estructura del proyecto

```
mobile-app/
├── app.json                    # Configuración Expo (permisos, splash, etc)
├── babel.config.js
├── package.json                # Expo SDK 51 + dependencias nativas
├── tsconfig.json
├── .env                        # URL del backend
│
├── app/                        # Pantallas con expo-router (file-based)
│   ├── _layout.tsx             # Layout root: gradient + Stack navigator
│   ├── index.tsx               # Pantalla principal (captura + estado)
│   ├── historial.tsx           # Lista persistente de envíos
│   └── ajustes.tsx             # Operador, conexión, info
│
└── src/
    ├── theme.ts                # Sistema de diseño (colores, spacing, sombras)
    ├── config.ts               # Lee EXPO_PUBLIC_API_BASE_URL
    ├── api.ts                  # Cliente HTTP + FormData para subir foto
    ├── storage.ts              # AsyncStorage: historial + cola offline
    ├── components/             # UI reusable (Boton, Card, Input, Estado, ...)
    ├── hooks/                  # useCamara, useUbicacion, useConectividad, useColaOffline
    └── screens/
        └── CapturaInline.tsx   # Card principal con la lógica de captura
```

## Comandos comunes

```bash
npm start                  # arranca el dev server
npm run android            # abre en emulador Android (si tienes uno)
npm run ios                # abre en simulador iOS (sólo Mac)
npm run web                # versión web (debugging rápido)
npm run tunnel             # tunelizado por internet
```

## Cuando tengas que generar APK / IPA

```bash
# Build production con EAS (Expo Application Services)
npx eas-cli build --platform android   # genera APK / AAB
npx eas-cli build --platform ios       # genera IPA (requiere cuenta Apple Developer)
```

Para tu defensa académica con Expo Go te alcanza — no necesitas compilar APK.

## Permisos que pide

| Permiso | Cuándo | Por qué |
|---|---|---|
| Cámara | Al tocar "Tomar foto" | Capturar imagen del acta |
| Galería | Al tocar "Elegir de galería" | Seleccionar foto previa |
| Ubicación | Después de capturar | Asociar GPS al recinto (opcional) |

Todos están declarados en `app.json` para Android e iOS.

## Modo offline — cómo funciona

1. La app hace ping al backend cada 10s (`useConectividad`)
2. Si está offline cuando intentas enviar:
   - Guarda el envío en AsyncStorage (cola persistente)
   - Lo registra en el historial como "pendiente"
3. Cuando vuelve online:
   - `useColaOffline` procesa todos los pendientes en orden
   - Reintenta hasta 5 veces, después marca como fallido
4. El badge en el banner online muestra cuántos envíos hay pendientes

## Solución a problemas

| Síntoma | Causa | Fix |
|---|---|---|
| "Network request failed" en la app | Móvil no alcanza tu PC | Revisa que `.env` tenga la IP local correcta y que el firewall permita 3001 |
| Expo Go no carga el bundle | PC y móvil en redes diferentes | `npx expo start --tunnel` |
| Cámara dice "denied" | Negaste el permiso | Configuración del SO → Apps → Expo Go → Permisos |
| Pantalla negra al iniciar | Cache de Metro corrupto | `npx expo start -c` (clear cache) |
