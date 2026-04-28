"""Conexión Postgres y utilidades compartidas."""
import os
import subprocess
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / 'Data'

load_dotenv(ROOT / '.env')


def conectar_pg():
    return psycopg2.connect(
        host=os.environ['POSTGRES_HOST'],
        port=int(os.environ['POSTGRES_PORT_WRITE']),
        user=os.environ['POSTGRES_USER'],
        password=os.environ['POSTGRES_PASSWORD'],
        dbname=os.environ['POSTGRES_DB'],
    )


def asegurar_txt(pdf_name: str, txt_name: str) -> Path:
    """Si no existe el .txt, lo extrae con pdftotext."""
    pdf_path = DATA_DIR / pdf_name
    txt_path = DATA_DIR / txt_name
    if not txt_path.exists():
        print(f'[data-loader] Extrayendo {pdf_name} -> {txt_name}')
        subprocess.run(['pdftotext', '-layout', str(pdf_path), str(txt_path)], check=True)
    return txt_path


def insertar_lote(conn, sql: str, filas: list, tabla: str):
    if not filas:
        print(f'[{tabla}] sin filas para insertar')
        return
    with conn.cursor() as cur:
        execute_values(cur, sql, filas)
    conn.commit()
    print(f'[{tabla}] insertadas {len(filas)} filas')
