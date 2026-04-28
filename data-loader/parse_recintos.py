"""
Parsea Recursos Practica 4 - RecintosElectorales.pdf
Estructura: id_recinto (8 dígitos) | nombre | direccion | mesas
El id_recinto codifica el codigo_territorial: los primeros 5 dígitos.
"""
import re
from common import asegurar_txt, conectar_pg, insertar_lote


def parse_lineas(lineas):
    filas = []
    for linea in lineas:
        s = linea.strip()
        m = re.match(r'^(\d{8})\s+(.+)$', s)
        if not m:
            continue
        id_recinto = int(m.group(1))
        codigo_territorial = int(str(id_recinto)[:5])
        resto = m.group(2)
        # Las últimas cifras de la línea suelen ser cantidad de mesas
        mesas_match = re.search(r'(\d+)\s*$', resto)
        cantidad_mesas = int(mesas_match.group(1)) if mesas_match else 0
        # Recortar las mesas del final
        if mesas_match:
            resto = resto[:mesas_match.start()].strip()
        # Dividir nombre y direccion por bloques de 2+ espacios
        partes = re.split(r'\s{2,}', resto)
        nombre = partes[0] if partes else ''
        direccion = '  '.join(partes[1:]) if len(partes) > 1 else ''
        filas.append((id_recinto, codigo_territorial, nombre[:200], direccion[:400], cantidad_mesas))
    return filas


def main():
    txt = asegurar_txt('Recursos Practica 4 - RecintosElectorales.pdf', 'recintos.txt')
    with open(txt, encoding='latin-1') as f:
        lineas = f.readlines()

    filas = parse_lineas(lineas)
    print(f'[recintos] {len(filas)} filas parseadas')

    conn = conectar_pg()
    insertar_lote(
        conn,
        '''INSERT INTO recintos_electorales
           (id_recinto, codigo_territorial, nombre, direccion, cantidad_mesas)
           VALUES %s
           ON CONFLICT (id_recinto) DO NOTHING''',
        filas,
        'recintos_electorales',
    )
    conn.close()


if __name__ == '__main__':
    main()
