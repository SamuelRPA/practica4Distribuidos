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
    # Cargar recintos
    recintos_filas = []
    with open(recintos_csv, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            recintos_filas.append((
                int(row['CodigoRecinto']),
                row['Nombre'],
                row['Direccion'],
                int(row['CodigoTerritorial']),
                int(row['Mesas'])
            ))
            
    insertar_lote(
        conn,
        '''INSERT INTO recintos 
           (codigo_recinto, nombre, direccion, codigo_territorial, cantidad_mesas)
           VALUES %s
           ON CONFLICT (codigo_recinto) DO NOTHING''',
        recintos_filas,
        'recintos'
    )
    print(f"Loaded {len(recintos_filas)} recintos.")

    # Cargar mesas (from transcripciones to get actual actas and habilitados)
    mesas_filas = []
    with open(transcripciones_csv, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            mesas_filas.append((
                int(row['CodigoActa']),
                int(row['CodigoRecinto']),
                int(row['NroMesa']),
                int(row['VotantesHabilitados'])
            ))
            
    # filter unique mesas by CodigoActa
    mesas_unique = list({m[0]: m for m in mesas_filas}.values())
            
    insertar_lote(
        conn,
        '''INSERT INTO mesas 
           (codigo_mesa, codigo_recinto, numero_mesa, cantidad_habilitada)
           VALUES %s
           ON CONFLICT (codigo_mesa) DO NOTHING''',
        mesas_unique,
        'mesas'
    )
    print(f"Loaded {len(mesas_unique)} mesas.")


def main():
    base_dir = os.path.join(os.path.dirname(__file__), '..', 'Data')
    dist_csv = os.path.join(base_dir, 'Recursos Practica 4 - DistribucionTerritorial.csv')
    recintos_csv = os.path.join(base_dir, 'Recursos Practica 4 - RecintosElectorales.csv')
    transcripciones_csv = os.path.join(base_dir, 'Recursos Practica 4 - Transcripciones.csv')
    
    conn = conectar_pg()
    load_distribucion(conn, dist_csv)
    load_recintos_y_mesas(conn, recintos_csv, transcripciones_csv)
    conn.close()

if __name__ == '__main__':
    main()
