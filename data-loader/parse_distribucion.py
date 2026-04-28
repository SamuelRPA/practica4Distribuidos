"""
Parsea Recursos Practica 4 - DistribucionTerritorial.pdf
Cada fila tiene: codigo_territorial, departamento, provincia, municipio
Algunos rows están desordenados — extraemos por código numérico.
"""
import re
from common import asegurar_txt, conectar_pg, insertar_lote

PATRON = re.compile(r'^\s*(\d{5})\s+(.+?)\s{2,}(.+?)(?:\s{2,}(.+))?\s*$')


def parse_lineas(lineas):
    filas = []
    for linea in lineas:
        m = re.match(r'^\s*(\d{5})\b', linea)
        if not m:
            continue
        codigo = int(m.group(1))
        partes = re.split(r'\s{2,}', linea.strip())
        departamento = partes[1] if len(partes) > 1 else 'Desconocido'
        provincia = partes[2] if len(partes) > 2 else 'Desconocido'
        municipio = partes[3] if len(partes) > 3 else 'Desconocido'
        filas.append((codigo, departamento[:50], provincia[:80], municipio[:80]))
    return filas


def main():
    txt = asegurar_txt('Recursos Practica 4 - DistribucionTerritorial.pdf', 'distribucion.txt')
    with open(txt, encoding='latin-1') as f:
        lineas = f.readlines()

    filas = parse_lineas(lineas)
    print(f'[distribucion] {len(filas)} filas parseadas')

    conn = conectar_pg()
    insertar_lote(
        conn,
        '''INSERT INTO distribucion_territorial
           (codigo_territorial, departamento, provincia, municipio)
           VALUES %s
           ON CONFLICT (codigo_territorial) DO NOTHING''',
        filas,
        'distribucion_territorial',
    )
    conn.close()


if __name__ == '__main__':
    main()
