# Cómo conectar un proveedor real de mensajería

Para que el sistema reciba SMS reales (en vez de los simulados desde el dashboard),
necesitas conectarlo a un proveedor que reenvíe los mensajes vía webhook.

El backend expone un único endpoint con sufijo por proveedor:

```
POST http://TU_SERVIDOR:3001/api/sms/webhook/{proveedor}
```

Donde `{proveedor}` es uno de:
- `twilio`     — para SMS reales (recomendado para Bolivia)
- `telegram`   — gratis, ideal para demostrar en clase
- `whatsapp`   — WhatsApp Business Cloud API (Meta)
- `generico`   — cualquier proveedor con payload `{ numero_origen, texto }`

Para que tu servidor sea accesible desde internet en desarrollo, usa
[ngrok](https://ngrok.com/) o [cloudflared](https://github.com/cloudflare/cloudflared):

```bash
ngrok http 3001
# Devuelve algo como https://abc123.ngrok.io
# Esa URL pública es la que registras en el proveedor.
```

---

## Opción 1 — Twilio (RECOMENDADO para SMS reales)

Twilio funciona en Bolivia (+591) y tiene **trial gratuito de $15 USD**, suficiente
para muchas pruebas. Es el más usado para sistemas serios de SMS.

### Pasos

1. **Crea cuenta**: https://www.twilio.com/try-twilio
2. **Compra un número**: en el panel → Phone Numbers → Buy a number.
   Para Bolivia, los números disponibles suelen ser de USA con habilidad de SMS internacional.
3. **Configura el webhook**:
   - Console → Phone Numbers → tu número → "A MESSAGE COMES IN"
   - URL: `https://TU_NGROK.ngrok.io/api/sms/webhook/twilio`
   - HTTP: `POST`

### Cómo registra los números en el dashboard

El número que aparece en `From` de Twilio viene en formato E.164: `+591XXXXXXXX`.
Agrega cada número de operador en /sms-admin con `proveedor=TWILIO`.

### Variables de entorno (opcional, para validar firma de Twilio)

```bash
# En .env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
```

> Nota: el código actual NO valida la firma X-Twilio-Signature. Para producción
> agrega el middleware `twilio.webhook(authToken)`. Para defensa académica con
> webhook bajo ngrok, no es estrictamente necesario.

### Costos aproximados

- SMS entrante a número Twilio US: $0.0075 USD
- SMS saliente (si quisieras responder): $0.0075–$0.05 según destino

---

## Opción 2 — Telegram Bot (GRATIS, ideal para demo en clase)

Telegram Bots son **completamente gratuitos**, no requieren tarjeta ni verificación.
Recomiendo esta opción para la **demo en la defensa**: es instantánea y no depende
de cobertura celular.

### Pasos

1. **Crea el bot**:
   - Abre Telegram, busca `@BotFather`
   - Manda `/newbot`, sigue las instrucciones
   - Te dará un token tipo `123456:ABC-XYZ...`

2. **Registra el webhook**:
   ```bash
   curl -F "url=https://TU_NGROK.ngrok.io/api/sms/webhook/telegram" \
        https://api.telegram.org/bot<TU_TOKEN>/setWebhook
   ```

3. **Prueba**:
   - Busca tu bot en Telegram (el username que pusiste con BotFather)
   - Mándale: `M:10101001001;VE:70;VN:15;P1:0;P2:20;P3:8;P4:32;VB:4;NU:6`
   - Tu sistema lo procesará si tu usuario `@tu_username` está en la lista blanca

### Cómo registra los usuarios en el dashboard

En vez de un número de teléfono, Telegram identifica al usuario por:
- **username**: `@tu_username` (si lo tienes configurado)
- **id numérico**: `tg:123456789` (si no tiene username)

Agrega cada uno en /sms-admin con `proveedor=TELEGRAM`.

### Probar sin webhook (modo polling, para desarrollo local sin ngrok)

Si no quieres usar ngrok, puedes hacer polling manualmente:
```bash
curl https://api.telegram.org/bot<TOKEN>/getUpdates
# Ves los mensajes y los reenvías al backend manualmente
```

---

## Opción 3 — WhatsApp Business Cloud API (Meta)

WhatsApp es lo más usado en Bolivia, pero requiere verificación de empresa.
Para una práctica académica es **overkill**; recomiendo Twilio o Telegram.

### Si aún quieres hacerlo

1. Crea cuenta en [Meta for Developers](https://developers.facebook.com/)
2. Crea una App tipo Business → agrega producto WhatsApp
3. En Configuration → Webhook:
   - Callback URL: `https://TU_NGROK.ngrok.io/api/sms/webhook/whatsapp`
   - Verify Token: lo que pongas (Meta lo manda en query `?hub.verify_token=...`)
   - Subscribe a `messages`

### Limitación importante

WhatsApp Cloud API requiere que el usuario inicie la conversación dentro de las
últimas 24h, salvo plantillas pre-aprobadas. Para un sistema electoral donde
el operador escribe espontáneamente, es viable; sólo agrega cada número en
/sms-admin con `proveedor=WHATSAPP`.

---

## Opción 4 — Genérico (cualquier proveedor o tu propio modem GSM)

Si tienes un **modem USB GSM** (típico en sistemas electorales bolivianos),
o un servicio nacional como Tigo Money Bot o similar, puedes integrarlo así:

```bash
curl -X POST https://TU_SERVIDOR:3001/api/sms/webhook/generico \
     -H "Content-Type: application/json" \
     -d '{"numero_origen":"+59170000001","texto":"M:10101001001;VE:70;..."}'
```

Cualquier proveedor que pueda mandar un POST con esos dos campos funciona
inmediatamente.

---

## Comparativa rápida

| Proveedor | Costo | Setup | Para qué |
|---|---|---|---|
| **Twilio** | $$ (trial $15) | Medio | SMS reales en producción |
| **Telegram** | Gratis | Fácil | Demo en clase, defensa |
| **WhatsApp** | Gratis (con verificación) | Difícil | Producción si tu universidad lo soporta |
| **Genérico** | Depende | Variable | Modem GSM local, gateway propio |

## Mi recomendación para la defensa

1. **Para el sistema "real"**: documenta Twilio en tu doc técnico
2. **Para la demo en vivo**: usa Telegram Bot
   - Es gratis, instantáneo
   - El profesor puede ver en su teléfono cómo escribes al bot y aparece en el dashboard
   - Demuestras el patrón sin gastar plata ni esperar verificaciones

## Flujo end-to-end (ya implementado)

```
[Operador en recinto]
        │
        ▼ (manda mensaje al bot/número)
[Proveedor: Telegram/Twilio/etc]
        │
        ▼ POST /api/sms/webhook/{proveedor}
[Backend]
        │
        ├─ Normaliza payload por proveedor
        ├─ Verifica número en lista blanca (Mongo)
        │       └── Si no autorizado: log + ignora silenciosamente (ADR sec 3.3)
        ├─ Parsea SMS con regex flexible (smsParser.js)
        │       └── Si faltan campos: 422 con lista de faltantes
        ├─ Encola en RabbitMQ q_validacion con prioridad 10 (>PDF)
        └─ Registra mensaje en sms_mensajes_recibidos para auditoría
        │
        ▼ (consume worker validador → escritura)
[MongoDB Atlas — actas_rrv]
        │
        ▼
[Dashboard muestra el conteo en vivo]
```
