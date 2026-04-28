-- =====================================================================
-- Schema del Cómputo Oficial — PostgreSQL
-- Se aplica solo en el primary; se replica automáticamente a los standbys.
-- =====================================================================

-- ----------- Datos maestros (inmutables después de la carga) ------------

CREATE TABLE IF NOT EXISTS distribucion_territorial (
    codigo_territorial   INTEGER PRIMARY KEY,
    departamento         VARCHAR(50)  NOT NULL,
    provincia            VARCHAR(80),
    municipio            VARCHAR(80)
);

CREATE TABLE IF NOT EXISTS recintos_electorales (
    id_recinto           BIGINT PRIMARY KEY,
    codigo_territorial   INTEGER NOT NULL REFERENCES distribucion_territorial(codigo_territorial),
    nombre               VARCHAR(200) NOT NULL,
    direccion            VARCHAR(400),
    cantidad_mesas       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mesas_electorales (
    codigo_mesa          BIGINT PRIMARY KEY,
    nro_mesa             INTEGER NOT NULL,
    cantidad_habilitada  INTEGER NOT NULL,    -- INMUTABLE — viene del padrón
    id_recinto           BIGINT NOT NULL REFERENCES recintos_electorales(id_recinto),
    UNIQUE (id_recinto, nro_mesa)
);

CREATE INDEX idx_mesas_recinto ON mesas_electorales(id_recinto);

-- ----------- Cuentas de operadores y supervisores ----------

CREATE TABLE IF NOT EXISTS operadores (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(50) NOT NULL UNIQUE,
    nombre        VARCHAR(100) NOT NULL,
    rol           VARCHAR(20) NOT NULL CHECK (rol IN ('OPERADOR_MT1','OPERADOR_MT2','OPERADOR_MT3','SUPERVISOR','ADMIN','N8N','SISTEMA')),
    activo        BOOLEAN NOT NULL DEFAULT true,
    creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Operadores especiales reservados para automatización
INSERT INTO operadores (username, nombre, rol) VALUES
    ('n8n_001', 'N8N Bot OCR Variant 1', 'N8N'),
    ('n8n_002', 'N8N Bot OCR Variant 2', 'N8N'),
    ('n8n_003', 'N8N Bot OCR Variant 3', 'N8N'),
    ('sistema', 'Sistema (RRV cross-check)', 'SISTEMA')
ON CONFLICT (username) DO NOTHING;

-- ----------- Sesiones de transcripción (3 operadores por acta) ----------

CREATE TABLE IF NOT EXISTS sesiones_transcripcion (
    session_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_mesa   BIGINT NOT NULL REFERENCES mesas_electorales(codigo_mesa),
    estado        VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        -- PENDIENTE | ESPERANDO_OPERADORES | RESUELTA | EN_CUARENTENA
    via           VARCHAR(10) NOT NULL CHECK (via IN ('MANUAL','N8N')),
    creada_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
    cerrada_en    TIMESTAMPTZ
);

CREATE INDEX idx_ses_mesa ON sesiones_transcripcion(codigo_mesa);

CREATE TABLE IF NOT EXISTS transcripciones_pendientes (
    id              BIGSERIAL PRIMARY KEY,
    session_id      UUID NOT NULL REFERENCES sesiones_transcripcion(session_id) ON DELETE CASCADE,
    codigo_mesa     BIGINT NOT NULL REFERENCES mesas_electorales(codigo_mesa),
    operador_id     INTEGER NOT NULL REFERENCES operadores(id),
    votos_emitidos  INTEGER,
    ausentismo      INTEGER,
    p1              INTEGER,
    p2              INTEGER,
    p3              INTEGER,
    p4              INTEGER,
    votos_blancos   INTEGER,
    votos_nulos     INTEGER,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, operador_id)
);

CREATE INDEX idx_trans_session ON transcripciones_pendientes(session_id);

-- ----------- Acta oficial consolidada (después de validación cruzada) ----------

CREATE TABLE IF NOT EXISTS votos_oficiales (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_mesa         BIGINT NOT NULL REFERENCES mesas_electorales(codigo_mesa),
    session_id          UUID REFERENCES sesiones_transcripcion(session_id),
    habilitados         INTEGER NOT NULL,
    votos_emitidos      INTEGER,
    ausentismo          INTEGER,
    p1                  INTEGER DEFAULT 0,
    p2                  INTEGER DEFAULT 0,
    p3                  INTEGER DEFAULT 0,
    p4                  INTEGER DEFAULT 0,
    votos_blancos       INTEGER DEFAULT 0,
    votos_nulos         INTEGER DEFAULT 0,
    estado              VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado IN ('PENDIENTE','APROBADA','EN_CUARENTENA','ANULADA','RECHAZADA')),
    motivo_estado       TEXT,
    discrepancia_rrv    JSONB,
    discrepancias_3way  JSONB,
    fuente              VARCHAR(10) NOT NULL CHECK (fuente IN ('MANUAL','CSV','N8N')),
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    creado_por          VARCHAR(50) NOT NULL,
    modificado_en       TIMESTAMPTZ,
    modificado_por      VARCHAR(50)
);

CREATE INDEX idx_vo_mesa   ON votos_oficiales(codigo_mesa);
CREATE INDEX idx_vo_estado ON votos_oficiales(estado);
CREATE INDEX idx_vo_creado ON votos_oficiales(creado_en);

-- ----------- Event log inmutable (Event Sourcing) ----------

CREATE TABLE IF NOT EXISTS eventos_acta_oficial (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_mesa     BIGINT NOT NULL,
    acta_id         UUID,
    tipo_evento     VARCHAR(50) NOT NULL,
        -- INGRESADA | VALIDADA | APROBADA | RECHAZADA | EN_CUARENTENA
        -- CUARENTENA_LIBERADA | ANULADA | SUPERVISOR_APROBO
    payload         JSONB NOT NULL,
    actor           VARCHAR(50) NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_eventos_mesa  ON eventos_acta_oficial(codigo_mesa);
CREATE INDEX idx_eventos_tipo  ON eventos_acta_oficial(tipo_evento);
CREATE INDEX idx_eventos_actor ON eventos_acta_oficial(actor);

-- ----------- Logs de errores ----------

CREATE TABLE IF NOT EXISTS logs_oficial (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    codigo_mesa     BIGINT,
    tipo_error      VARCHAR(60) NOT NULL,
    detalle         TEXT NOT NULL,
    datos_entrada   JSONB,
    operador_id     INTEGER REFERENCES operadores(id)
);

CREATE INDEX idx_logs_tipo  ON logs_oficial(tipo_error);
CREATE INDEX idx_logs_mesa  ON logs_oficial(codigo_mesa);
CREATE INDEX idx_logs_fecha ON logs_oficial(timestamp);

-- ----------- Vistas de lectura para el dashboard ----------

-- Total de votos por candidato (oficial)
CREATE OR REPLACE VIEW v_totales_candidato AS
SELECT
    SUM(p1)            AS total_p1,
    SUM(p2)            AS total_p2,
    SUM(p3)            AS total_p3,
    SUM(p4)            AS total_p4,
    SUM(votos_blancos) AS total_blancos,
    SUM(votos_nulos)   AS total_nulos,
    SUM(votos_emitidos) AS total_emitidos
FROM votos_oficiales
WHERE estado = 'APROBADA';

-- Participación por departamento
CREATE OR REPLACE VIEW v_participacion_departamento AS
SELECT
    dt.departamento,
    SUM(vo.votos_emitidos) AS total_emitidos,
    SUM(vo.habilitados)    AS total_habilitados,
    ROUND(100.0 * SUM(vo.votos_emitidos) / NULLIF(SUM(vo.habilitados), 0), 2) AS porcentaje
FROM votos_oficiales vo
JOIN mesas_electorales me     ON me.codigo_mesa = vo.codigo_mesa
JOIN recintos_electorales re  ON re.id_recinto = me.id_recinto
JOIN distribucion_territorial dt ON dt.codigo_territorial = re.codigo_territorial
WHERE vo.estado = 'APROBADA'
GROUP BY dt.departamento;

-- Estado global de actas
CREATE OR REPLACE VIEW v_estado_actas AS
SELECT
    estado,
    COUNT(*) AS cantidad
FROM votos_oficiales
GROUP BY estado;

-- Ingesta por hora (para gráfica de tendencia)
CREATE OR REPLACE VIEW v_ingesta_por_hora AS
SELECT
    DATE_TRUNC('hour', creado_en) AS hora,
    fuente,
    COUNT(*) AS actas_recibidas
FROM votos_oficiales
GROUP BY 1, 2
ORDER BY 1 DESC;

-- Top errores
CREATE OR REPLACE VIEW v_top_errores AS
SELECT
    tipo_error,
    COUNT(*) AS frecuencia
FROM logs_oficial
GROUP BY tipo_error
ORDER BY frecuencia DESC;

-- =====================================================================
-- Trigger: cualquier cambio en votos_oficiales escribe un evento
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_log_evento_acta() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO eventos_acta_oficial (codigo_mesa, acta_id, tipo_evento, payload, actor)
    VALUES (
        NEW.codigo_mesa,
        NEW.id,
        CASE
            WHEN TG_OP = 'INSERT' THEN 'INGRESADA'
            WHEN OLD.estado IS DISTINCT FROM NEW.estado THEN 'CAMBIO_ESTADO_' || NEW.estado
            ELSE 'MODIFICADA'
        END,
        to_jsonb(NEW),
        COALESCE(NEW.modificado_por, NEW.creado_por, 'sistema')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_evento_acta ON votos_oficiales;
CREATE TRIGGER trg_log_evento_acta
AFTER INSERT OR UPDATE ON votos_oficiales
FOR EACH ROW
EXECUTE FUNCTION fn_log_evento_acta();
