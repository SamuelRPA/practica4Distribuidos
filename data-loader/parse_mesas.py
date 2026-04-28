"""
Parsea Recursos Practica 4 - ActasImpresas.pdf para extraer mesas electorales.
Cada fila tiene: codigo_territorial | codigo_mesa | nro_mesa | cantidad_habilitada
"""
import re
import psycopg2
from common import asegurar_txt, conectar_pg, insertar_lote

PATRON_MESA = re.compile(r'^\s*(\d{5})\s+(\d{11})(?:\s+(\d+)\s+(\d+))?\s*$')


def parse_lineas(lineas):
    filas = []
    for linea in lineas:
        m = PATRON_MESA.match(linea)
        if not m:
            continue
        codigo_mesa = int(m.group(2))
        nro_mesa = int(m.group(3)) if m.group(3) else None
        habilitada = int(m.group(4)) if m.group(4) else None
        # id_recinto son los primeros 8 dígitos del codigo_mesa (5 territorial + 3 recinto)
        id_recinto = int(str(codigo_mesa)[:8])
        if nro_mesa is None or habilitada is None:
            continue
        filas.append((codigo_mesa, nro_mesa, habilitada, id_recinto))
    return filas


def main():
    txt = asegurar_txt('Recursos Practica 4 - ActasImpresas.pdf', 'actas.txt')
    with open(txt, encoding='latin-1') as f:
        lineas = f.readlines()

    filas = parse_lineas(lineas)
    print(f'[mesas] {len(filas)} mesas parseadas')

    conn = conectar_pg()
    try:
        insertar_lote(
            conn,
            '''INSERT INTO mesas_electorales
               (codigo_mesa, nro_mesa, cantidad_habilitada, id_recinto)
               VALUES %s
               ON CONFLICT (codigo_mesa) DO NOTHING''',
            filas,
            'mesas_electorales',
        )
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        print('Ignorando registros duplicados en mesas_electorales')
    conn.close()


if __name__ == '__main__':
    main()
