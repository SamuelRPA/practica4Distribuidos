"""
Genera un CSV de prueba con actas sintéticas para alimentar al pipeline oficial vía n8n.
Toma las mesas reales de la base y produce votos coherentes.
"""
import csv
import random
from pathlib import Path
from common import conectar_pg

ROOT = Path(__file__).resolve().parent.parent
SALIDA = ROOT / 'data-loader' / 'actas_sinteticas.csv'


def main(n=200, seed=42):
    random.seed(seed)
    conn = conectar_pg()
    with conn.cursor() as cur:
        cur.execute(
            'SELECT codigo_mesa, cantidad_habilitada FROM mesas_electorales ORDER BY random() LIMIT %s',
            (n,)
        )
        mesas = cur.fetchall()
    conn.close()

    with open(SALIDA, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow([
            'codigo_mesa','votos_emitidos','ausentismo',
            'p1','p2','p3','p4','votos_blancos','votos_nulos',
        ])
        for codigo_mesa, habilitada in mesas:
            ausentismo = random.randint(0, int(habilitada * 0.3))
            emitidos = habilitada - ausentismo
            p1 = random.randint(0, emitidos // 2)
            p2 = random.randint(0, max(1, emitidos - p1))
            p3 = random.randint(0, max(1, emitidos - p1 - p2))
            p4 = max(0, emitidos - p1 - p2 - p3 - 5)
            blancos = max(0, emitidos - p1 - p2 - p3 - p4 - 2)
            nulos = max(0, emitidos - p1 - p2 - p3 - p4 - blancos)
            w.writerow([codigo_mesa, emitidos, ausentismo, p1, p2, p3, p4, blancos, nulos])

    print(f'[generate-csv] {n} actas escritas en {SALIDA}')


if __name__ == '__main__':
    main()
