# Twilio Quickstart — paso a paso para tu sistema

Esta guía es específica para enchufar Twilio al pipeline RRV de este proyecto.
Tiempo estimado: **15-20 minutos**.

## Pre-requisitos

- Tu sistema corriendo en local (`npm run dev` del backend en :3001)
- Una tarjeta de crédito (Twilio la pide para verificar; el trial es gratis y NO cobran)
- Un teléfono donde recibir el código de verificación

## Paso 1 — Crear cuenta Twilio

1. Ve a https://www.twilio.com/try-twilio
2. Registrate con tu email y password
3. Verifica tu teléfono (te llega un SMS con código)
4. Cuando entres al panel, te darán **$15 USD de crédito gratis** (suficiente para ~2000 SMS de prueba)

**Importante**: durante el trial, Twilio solo permite enviar/recibir SMS de **números verificados**.
Para verificar números, hay que entrar a **Phone Numbers → Verified Caller IDs** y agregar
el número que vas a usar para enviar SMS.

## Paso 2 — Comprar un número Twilio

En el panel:
1. **Phone Numbers → Manage → Buy a number**
2. Filtra por:
   - Country: **United States** (los más baratos, $1 USD/mes, funcionan para SMS internacionales)
   - Capabilities: ☑ **SMS** (los demás no importan)
3. Click **Search → Buy** en uno cualquiera (todos sirven)

Te dará un número tipo `+1 555 123 4567`. **Anótalo**, lo necesitarás.

> Bolivia no vende números directos en Twilio. El número US recibe SMS desde
> +591 sin problema. El operador en el recinto manda al número US.

## Paso 3 — Exponer tu localhost a internet con ngrok

Twilio necesita poder hacer POST a tu webhook. Tu backend está en `localhost:3001`,
que no es accesible desde internet. Solución: ngrok.

```bash
# Instalar ngrok (una sola vez)
# Windows: choco install ngrok   o descarga desde https://ngrok.com/download
# Mac: brew install ngrok
# Linux: snap install ngrok

# Registrate gratis en ngrok.com y obten tu authtoken (lo encuentras en el dashboard)
ngrok config add-authtoken TU_TOKEN

# Levantar túnel hacia el backend
ngrok http 3001
```

Te mostrará algo así:
```
Forwarding   https://abc123.ngrok-free.app -> http://localhost:3001
```

**Anota esa URL pública** (la `https://abc123.ngrok-free.app`). La vas a pegar en Twilio.

> ⚠️ Cada vez que reinicias ngrok la URL cambia (en plan gratis).
> Para que sea fija, paga el plan de $8/mes O usa un dominio reservado gratis.
> Para la práctica académica con `ngrok http 3001` cada sesión es suficiente.

## Paso 4 — Configurar el webhook en Twilio

1. Ve a **Phone Numbers → Manage → Active Numbers**
2. Click en tu número comprado
3. Scrollea hasta **"A MESSAGE COMES IN"**
4. Configura:
   - Webhook URL: `https://abc123.ngrok-free.app/api/sms/webhook/twilio`
   - HTTP Method: **POST**
5. Click **Save** abajo del todo

Listo, Twilio ahora hace POST a tu backend cada vez que llega un SMS.

## Paso 5 — Agregar el número del operador en /sms-admin

1. Abre http://localhost:3000/sms-admin
2. En "Agregar número autorizado":
   - **Número**: el número de tu celular en formato E.164 → `+59170000001`
     (este es el número desde el cual VAS a enviar SMS para probar)
   - **Etiqueta**: "Mi celular"
   - **Proveedor**: TWILIO
3. Click **Agregar**

> ⚠️ Recuerda: durante el trial de Twilio, este número también debe estar
> verificado en Twilio (Phone Numbers → Verified Caller IDs).

## Paso 6 — Probar end-to-end

Desde tu celular (el +591 que registraste y verificaste), manda un SMS al
**número Twilio** (+1 555... que compraste):

```
M:10101001001;VE:70;VN:15;P1:0;P2:20;P3:8;P4:32;VB:4;NU:6
```

Lo que debería pasar:

1. Twilio recibe el SMS
2. Twilio hace POST a `https://abc123.ngrok-free.app/api/sms/webhook/twilio`
3. ngrok lo reenvía a `localhost:3001/api/sms/webhook/twilio`
4. Tu backend:
   - Verifica que `+59170000001` esté en la lista blanca → ✓
   - Parsea el SMS → `{ codigo_mesa: 10101001001, p1: 0, p2: 20, ... }`
   - Lo encola en RabbitMQ con prioridad 10
   - Registra el mensaje en `sms_mensajes_recibidos` para auditoría
5. El worker procesa y guarda en MongoDB Atlas
6. **El dashboard muestra el conteo** en tiempo real

## Paso 7 — Verificar que funcionó

En el dashboard:
- **/sms-admin** → tabla "Historial de mensajes recibidos" debería mostrar tu SMS con resultado `ENCOLADO_EN_RRV`
- **/dashboard** → la barra "RRV" para esa mesa debería actualizarse

En logs del backend:
```bash
# verás algo como:
[escritura-worker] insertando acta para mesa 10101001001 desde SMS
```

## Troubleshooting

| Problema | Causa probable | Solución |
|---|---|---|
| Twilio dice "Webhook delivery failed" | ngrok cayó o cambió de URL | `ngrok http 3001` de nuevo, actualiza la URL en Twilio |
| El SMS llega pero sale "NUMERO_NO_AUTORIZADO" | El número no está en `/sms-admin` | Agrégalo o verifica el formato (debe ser `+591...`) |
| "Trial Account: cannot send to unverified number" | Tu celular no está verificado en Twilio | Phone Numbers → Verified Caller IDs → Add a new Caller ID |
| El SMS llega pero parsea mal | Formato del SMS no reconocido | Mira los logs del backend para ver qué reconoció el parser |
| ngrok rate limit | Plan free tiene 40 req/min | Para producción/demo prolongada, usa `cloudflared` (también gratis y más generoso) |

## Costo durante la práctica

Con tu trial de $15 USD:
- Recibir SMS: $0.0075 por SMS = ~2,000 SMS gratis
- Mantener el número: $1.00/mes (se descuenta del trial)
- **Para una demo de 1-2 horas con 50 SMS de prueba**: gastas <$1 USD

## Alternativa más simple: Telegram Bot

Si Twilio te complica (verificación de tarjeta, ngrok, etc), **Telegram Bot
es 100% gratis y se configura en 5 minutos**. Mira [SMS-INTEGRATION.md](SMS-INTEGRATION.md)
sección "Opción 2 — Telegram Bot" para los pasos.

Para la **defensa académica**, recomiendo Telegram. Más rápido, más visual,
no depende de cobertura celular y nunca cobra.

## Para tu defensa

Tienes dos opciones:

**Opción A — Live demo con Twilio**:
- Pre-arrancas todo: backend, ngrok, ya configuraste Twilio
- En clase mandas SMS desde tu celular al número Twilio
- El profesor ve cómo aparece en el dashboard
- Riesgo: ngrok puede fallar, SMS puede tardar 5-30s

**Opción B — Live demo con Telegram + screenshots de Twilio**:
- Demo en vivo con Telegram Bot (instantáneo, gratis)
- Muestras screenshots de Twilio configurado para demostrar que también funciona en SMS reales
- Más confiable, mismo concepto demostrado
