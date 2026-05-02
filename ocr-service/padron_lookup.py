"""
padron_lookup.py — Tabla de búsqueda de datos del padrón/transcripciones CSV.

Carga en memoria los datos del CSV de Transcripciones al arrancar el servicio.
Permite al validador y al extractor consultar los valores de referencia
(habilitados, votos esperados, etc.) para cualquier codigo_mesa.

Los datos del CSV son INMUTABLES (verdad de referencia oficial).
"""

import csv
import os
import logging

logger = logging.getLogger(__name__)

# Rutas posibles al CSV (Docker o desarrollo local)
_CSV_PATHS = [
    '/data/_Recursos Practica 4 - Transcripciones.csv',
    os.path.join(os.path.dirname(__file__), '..', 'Data', '_Recursos Practica 4 - Transcripciones.csv'),
]

# Cache en memoria: codigo_mesa (str) → dict con campos del CSV
_PADRON: dict = {}
_LOADED = False


def _parse_int(val):
    try:
        return int(str(val).strip())
    except (ValueError, TypeError):
        return None


def cargar_padron():
    """Carga el CSV de transcripciones en memoria. Se llama una sola vez al iniciar."""
    global _PADRON, _LOADED
    if _LOADED:
        return len(_PADRON)

    csv_path = None
    for p in _CSV_PATHS:
        if os.path.exists(p):
            csv_path = p
            break

    if not csv_path:
        logger.warning('[padron] CSV de Transcripciones NO encontrado. Validación por CSV desactivada.')
        _LOADED = True
        return 0

    try:
        with open(csv_path, encoding='utf-8-sig', errors='replace') as f:
            reader = csv.DictReader(f)
            for row in reader:
                codigo = str(row.get('CodigoActa', '')).strip()
                if not codigo:
                    continue
                _PADRON[codigo] = {
                    'habilitados':    _parse_int(row.get('VotantesHabilitados')),
                    'papeletas':      _parse_int(row.get('PapeletasAnfora')),
                    'no_utilizadas':  _parse_int(row.get('PapeltasNoUtilizadas')),
                    'p1':             _parse_int(row.get('P1')),
                    'p2':             _parse_int(row.get('P2')),
                    'p3':             _parse_int(row.get('P3')),
                    'p4':             _parse_int(row.get('P4')),
                    'votos_validos':  _parse_int(row.get('VotosValidos')),
                    'blancos':        _parse_int(row.get('VotosBlancos')),
                    'nulos':          _parse_int(row.get('VotosNulos')),
                    'departamento':   str(row.get('Departamento', '')).strip(),
                    'municipio':      str(row.get('Municipio', '')).strip(),
                    'recinto':        str(row.get('RecintoNombre', '')).strip(),
                    'observaciones':  str(row.get('Observaciones', '')).strip(),
                }

        _LOADED = True
        logger.info(f'[padron] CSV cargado: {len(_PADRON)} mesas.')
        return len(_PADRON)

    except Exception as e:
        logger.error(f'[padron] Error cargando CSV: {e}')
        _LOADED = True
        return 0


def buscar_mesa(codigo_mesa) -> dict | None:
    """
    Retorna los datos de referencia del CSV para una mesa, o None si no está.
    codigo_mesa puede ser int o str.
    """
    if not _LOADED:
        cargar_padron()
    return _PADRON.get(str(codigo_mesa).strip())


def disponible() -> bool:
    """True si el padrón fue cargado y tiene datos."""
    return _LOADED and len(_PADRON) > 0
