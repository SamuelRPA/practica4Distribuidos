# Cómo verificar el pipeline RRV en vivo

Esta guía te lleva paso a paso para ver el flujo completo SMS + foto móvil →
RabbitMQ → workers → MongoDB → dashboard.

## 1. Levanta TODO en orden

Necesitas **6 terminales abiertas** (cada una mira logs de un componente).

### Terminal 1 — Infraestructura
```bash
docker-compose up -d
docker start ocr-service       # si lo construiste como contenedor
```

Verifica:
```bash
docker ps   # debes ver pg_primary, pg_standby_1/2, lb_postgres, rabbitmq, n8n, ocr-service
```

### Terminal 2 — Backend API
```bash
cd backend
npm run dev
```

Deberías ver el banner:
```
══════════════════════════════════════════════════════════════
  BACKEND OEP — Sistema Nacional de Cómputo Electoral
══════════════════════════════════════════════════════════════

✓ MongoDB Atlas conectado
✓ PostgreSQL cluster conectado
✓ RabbitMQ conectado, colas declaradas
✓ API HTTP escuchando en :3001 (env=development)
```

### Terminal 3 — OCR Worker
```bash
cd backend
npm run worker:ocr
```

### Terminal 4 — Validador Worker
```bash
cd backend
npm run worker:validador
```

### Terminal 5 — Escritura Worker
```bash
cd backend
npm run worker:escritura
```

### Terminal 6 — Frontend (dashboard)
```bash
cd frontend
npm run dev
```

Abre http://localhost:3000/dashboard. Verás el banner verde "Conectado al backend"
y un timestamp "actualizado HH:MM:SS" que se refresca cada 5 segundos.

---

## 2. Correr el test end-to-end

En **una séptima terminal** ejecuta:

```bash
cd backend
npm run test:flow
```

El script hace **8 pasos** y los muestra con colores:

```
╔══════════════════════════════════════════════════════╗
║   TEST END-TO-END — Pipeline RRV                     ║
╚══════════════════════════════════════════════════════╝
Backend: http://localhost:3001

━━━━ PASO 0: Ping al backend ━━━━
[OK] ✓ Backend responde

━━━━ PASO 1: Registrar número SMS autorizado ━━━━
[OK] Registrado +59170123456

━━━━ PASO 2: Mandar SMS válido al webhook ━━━━
[INFO] Enviando: "M:10101001001;VE:70;VN:15;P1:0;P2:20;P3:8;P4:32;VB:4;NU:6"
[OK] Respuesta: status=200

━━━━ PASO 3: Mandar SMS de número NO autorizado (debe ignorarse) ━━━━
[OK] Respuesta: status=204 (ignorado, esperado)

━━━━ PASO 4: Mandar SMS incompleto (debe rechazarse) ━━━━
[OK] Respuesta: status=422 (esperado)

━━━━ PASO 5: Subir foto mock al endpoint de la app móvil ━━━━
[OK] Respuesta: status=202

━━━━ PASO 6: Esperando 4s para que los workers procesen las colas ━━━━

━━━━ PASO 7: Consultar /api/rrv/resumen ━━━━
{ estados: [...], totales: {...}, ingestaPorHora: [...] }

━━━━ PASO 8: Auditoría de SMS recibidos ━━━━
[OK] 3 mensajes en auditoría

✓ TEST COMPLETADO
```

---

## 3. Qué deberías ver en cada terminal

### Terminal 2 (backend) — el más rico en información
```
[sms-routes] 📨 SMS entrante por GENERICO desde +59170123456
   ↳ {texto: "M:10101001001;VE:70;..."}
[sms-routes] Número +59170123456 autorizado ✓ — parseando SMS...
[sms-routes] ✓ SMS parseado — mesa 10101001001, 9 campos reconocidos
   ↳ {VE:70, P1:0, P2:20, P3:8, P4:32, VB:4, VN:6}
[sms-routes] 📤 Encolado en q_validacion (priority=10) — esperando worker

[rrv-routes] 📷 Foto recibida desde móvil — mesa 10101001001
   ↳ {hash: "a3f8b2c4d5e6f7g8...", size_kb: 1, mime: "image/jpeg", origen: "node"}
[rrv-routes] 📤 Encolada en q_ingesta (priority=5) — esperando OCR worker
```

### Terminal 3 (ocrWorker)
```
[ocr-worker] 📥 Mensaje recibido — mesa 10101001001, tipo=PDF
[ocr-worker] ⚙ Llamando a OCR Service (http://localhost:5000/ocr) para mesa 10101001001...
[ocr-worker] ✓ OCR completado para mesa 10101001001
   ↳ {confianza_promedio: "0.91", modo: "MOCK", campos: 9}
[ocr-worker] 📤 Publicado en q_validacion → mesa 10101001001
```

### Terminal 4 (validadorWorker)
```
[validador] 📥 Validando acta — mesa 10101001001, fuente=SMS
[validador] 📤 Publicado en q_escritura → mesa 10101001001
[validador] 📥 Validando acta — mesa 10101001001, fuente=PDF
[validador] 📤 Publicado en q_escritura → mesa 10101001001
```

### Terminal 5 (escrituraWorker) — aquí ves los INSERT en Mongo
```
[escritura] 🗄 Mongo INSERT → mesa 10101001001, estado=APROBADA
   ↳ {ingreso_id: "65a3...", nivel_alerta: null}
[escritura] 🗄 Mongo INSERT → mesa 10101001001, estado=DUPLICADO_PARCIAL
   ↳ {ingreso_id: "65a4...", nivel_alerta: "ADVERTENCIA"}
```

### Dashboard (Terminal 6 / navegador)
- Banner verde "Conectado al backend · actualizado 14:32:15"
- Las cards de KPIs se actualizan en tiempo real
- "Estados RRV" muestra `APROBADA: 2`, etc.

---

## 4. Verificar manualmente en Mongo Atlas

Abre tu cluster en https://cloud.mongodb.com/ → Browse Collections.

Database: `electoral_rrv`

Colecciones que deberías ver pobladas:
| Colección | Qué tiene |
|-----------|-----------|
| `actas_rrv` | Una entrada por SMS y por foto procesada |
| `logs_rrv` | Eventos de error (SMS no autorizado, OCR fallido, duplicados parciales) |
| `sms_numeros_autorizados` | Tu número de test +59170123456 |
| `sms_mensajes_recibidos` | Auditoría de los 3 SMS del test |

Query útil para ver lo último insertado:
```js
db.actas_rrv.find().sort({ timestamp_recepcion: -1 }).limit(5)
```

O usa `mongosh`:
```bash
mongosh "$MONGO_URI"
> use electoral_rrv
> db.actas_rrv.countDocuments()
> db.actas_rrv.findOne({}, { _id: 0, codigo_mesa: 1, estado: 1, fuente: 1, confianza_global: 1 })
```

---

## 5. Probar desde la app móvil real (Expo)

Una vez que el script de test funciona, prueba con tu celular:

1. Asegúrate de que `mobile-app/.env` tiene tu IP local:
   ```
   EXPO_PUBLIC_API_BASE_URL=http://192.168.50.251:3001
   ```
2. `cd mobile-app && npx expo start`
3. Escanea el QR con Expo Go
4. En la app: pon código de mesa `10101001001`, toma una foto, envía
5. **Mira la Terminal 2 (backend)**:
   ```
   [rrv-routes] 📷 Foto recibida desde móvil — mesa 10101001001
      ↳ {hash: "...", size_kb: 245, mime: "image/jpeg", origen: "Expo Go"}
   ```
6. El campo `origen: "Expo Go"` confirma que vino del móvil real (no del test).

---

## 6. Probar SMS real con Telegram

Si quieres ver SMS reales (no simulados):

1. Crea un bot con `@BotFather` en Telegram → te da un token
2. Levanta `ngrok http 3001`
3. Registra el webhook:
   ```bash
   curl -F "url=https://TU_NGROK.ngrok-free.app/api/sms/webhook/telegram" \
        https://api.telegram.org/bot<TU_TOKEN>/setWebhook
   ```
4. En `/sms-admin` agrega tu username (`@tu_usuario`) con proveedor=TELEGRAM
5. Mándale al bot el SMS:
   ```
   M:10101001001;VE:70;VN:15;P1:0;P2:20;P3:8;P4:32;VB:4;NU:6
   ```
6. **Mira la Terminal 2**:
   ```
   [sms-routes] 📨 SMS entrante por TELEGRAM desde @tu_usuario
   [sms-routes] Número @tu_usuario autorizado ✓
   [sms-routes] ✓ SMS parseado — mesa 10101001001
   ```

Ver guía completa: [SMS-INTEGRATION.md](SMS-INTEGRATION.md).

---

## 7. Troubleshooting

| Síntoma | Causa | Fix |
|---------|-------|-----|
| `npm run test:flow` dice "Backend no disponible" | Backend no está corriendo | `cd backend && npm run dev` |
| Test pasa pero `/resumen` está vacío | Workers no corriendo | Verifica las terminales 3, 4, 5 |
| OCR worker dice "ECONNREFUSED" en :5000 | OCR service no está arriba | `docker start ocr-service` |
| Mongo dice "auth failed" | Contraseña en `.env` no actualizada | Edita `.env`, reinicia backend |
| Dashboard muestra "Sin conexión al backend" | CORS o backend caído | Revisa terminal 2 por errores |
| `MESA_INEXISTENTE` en logs | No cargaste el padrón | `cd data-loader && python load_all.py` |

---

## 8. Comandos rápidos cheat sheet

```bash
# Levantar todo (asumiendo docker-compose ya corre)
cd backend && npm run dev &
cd backend && npm run worker:ocr &
cd backend && npm run worker:validador &
cd backend && npm run worker:escritura &
cd frontend && npm run dev &

# Mandar un SMS de prueba
curl -X POST http://localhost:3001/api/sms/webhook/generico \
  -H "Content-Type: application/json" \
  -d '{"numero_origen":"+59170123456","texto":"M:10101001001;VE:70;VN:15;P1:0;P2:20;P3:8;P4:32;VB:4;NU:6"}'

# Ver el resumen RRV (lo que el dashboard muestra)
curl http://localhost:3001/api/rrv/resumen | jq

# Ver mensajes SMS auditados
curl http://localhost:3001/api/sms/mensajes?limit=5 | jq

# Test completo
cd backend && npm run test:flow
```
