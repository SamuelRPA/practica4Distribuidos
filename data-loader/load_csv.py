import csv
import os
from common import conectar_pg, insertar_lote

def load_distribucion(conn, csv_path):
    filas = []
    with open(csv_path, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            filas.append((
                int(row['CodigoTerritorial']),
                row['Departamento'],
                row['Provincia'],
                row['Municipio']
            ))
    
    insertar_lote(
        conn,
        '''INSERT INTO distribucion_territorial
           (codigo_territorial, departamento, provincia, municipio)
           VALUES %s
           ON CONFLICT (codigo_territorial) DO NOTHING''',
        filas,
        'distribucion_territorial'
    )
    print(f"Loaded {len(filas)} territorial records.")

def load_recintos_y_mesas(conn, recintos_csv, transcripciones_csv):
    # 1. Cargar recintos_electorales
    recintos_filas = []
    with open(recintos_csv, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            recintos_filas.append((
                int(row['CodigoRecinto']),
                int(row['CodigoTerritorial']),
                row['RecintoNombre'],
                row['RecintoDireccion'],
                int(row['NumMesas'])
            ))
            
    insertar_lote(
        conn,
        '''INSERT INTO recintos_electorales 
           (id_recinto, codigo_territorial, nombre, direccion, cantidad_mesas)
           VALUES %s
           ON CONFLICT (id_recinto) DO NOTHING''',
        recintos_filas,
        'recintos_electorales'
    )
    print(f"Loaded {len(recintos_filas)} recintos.")

    # 2. Cargar mesas_electorales
    mesas_filas = []
    with open(transcripciones_csv, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # En el schema mesas_electorales: codigo_mesa, nro_mesa, cantidad_habilitada, id_recinto
            mesas_filas.append((
                int(row['CodigoActa']),
                int(row['NroMesa']),
                int(row['VotantesHabilitados']),
                int(row['CodigoRecinto'])
            ))
            
    # Filtrar únicas por CodigoActa (que es el codigo_mesa)
    mesas_unique = list({m[0]: m for m in mesas_filas}.values())
            
    insertar_lote(
        conn,
        '''INSERT INTO mesas_electorales 
           (codigo_mesa, nro_mesa, cantidad_habilitada, id_recinto)
           VALUES %s
           ON CONFLICT (codigo_mesa) DO NOTHING''',
        mesas_unique,
        'mesas_electorales'
    )
    print(f"Loaded {len(mesas_unique)} mesas.")


def main():
    base_dir = os.path.join(os.path.dirname(__file__), '..', 'Data')
    dist_csv = os.path.join(base_dir, 'Recursos Practica 4 - DistribucionTerritorial.csv')
    recintos_csv = os.path.join(base_dir, 'Recursos Practica 4 - RecintosElectorales.csv')
    transcripciones_csv = os.path.join(base_dir, 'Recursos Practica 4 - Transcripciones.csv')
    
    if not os.path.exists(dist_csv):
        print(f"Error: {dist_csv} not found")
        return

    conn = conectar_pg()
    try:
        load_distribucion(conn, dist_csv)
        load_recintos_y_mesas(conn, recintos_csv, transcripciones_csv)
    finally:
        conn.close()

if __name__ == '__main__':
    main()
