"""Acceso a SQLite."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from flask import g

DB_PATH = Path(__file__).parent / "agata.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS lideres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    cargo TEXT NOT NULL,
    area TEXT NOT NULL,
    email TEXT,
    descripcion TEXT NOT NULL,
    estilo_liderazgo TEXT NOT NULL,
    expectativas TEXT NOT NULL,
    equipo TEXT,
    jefe_id INTEGER REFERENCES lideres(id) ON DELETE SET NULL,  -- cadena de mando entre líderes
    fecha_nac TEXT,
    hora_nac TEXT,
    ciudad TEXT,
    lat REAL,
    lon REAL,
    utc REAL,
    carta TEXT,
    verificacion TEXT,
    cv_archivo TEXT,
    cv_texto TEXT,
    creado TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS empresa (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    nombre TEXT NOT NULL,
    sector TEXT,
    mision TEXT,
    valores TEXT,
    cultura TEXT,
    fecha_nac TEXT,
    hora_nac TEXT,
    ciudad TEXT,
    lat REAL,
    lon REAL,
    utc REAL,
    carta TEXT,
    verificacion TEXT,
    actualizado TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vacantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cargo TEXT NOT NULL,
    area TEXT NOT NULL,
    lider_id INTEGER NOT NULL REFERENCES lideres(id),
    descripcion TEXT NOT NULL,
    elemento_afin TEXT,
    peso_cv REAL NOT NULL DEFAULT 20,
    peso_ia REAL NOT NULL DEFAULT 10,
    peso_lider REAL NOT NULL DEFAULT 35,
    peso_empresa REAL NOT NULL DEFAULT 25,
    peso_elemento REAL NOT NULL DEFAULT 10,
    peso_conflicto REAL NOT NULL DEFAULT 10,
    tecnico INTEGER NOT NULL DEFAULT 0,
    excluyentes TEXT,  -- JSON: [{"tipo": "titulo"|"experiencia"|"proyectos", "texto": ...}]
    estado TEXT NOT NULL DEFAULT 'abierta',
    creado TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS habilidades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vacante_id INTEGER NOT NULL REFERENCES vacantes(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    peso INTEGER NOT NULL DEFAULT 3,
    nivel INTEGER NOT NULL DEFAULT 3,
    palabras_clave TEXT NOT NULL DEFAULT '',
    tipo TEXT NOT NULL DEFAULT 'tecnica'  -- 'tecnica' o 'blanda'
);

CREATE TABLE IF NOT EXISTS candidatos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vacante_id INTEGER NOT NULL REFERENCES vacantes(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL,
    telefono TEXT,
    fecha_nac TEXT NOT NULL,
    hora_nac TEXT,
    ciudad TEXT,
    lat REAL,
    lon REAL,
    utc REAL,
    cv_archivo TEXT,
    cv_texto TEXT,
    carta TEXT,
    verificacion TEXT,
    resultado TEXT,
    ia TEXT,
    puntaje REAL,
    veredicto TEXT,  -- sin uso desde 1.2.0: el match ya no clasifica ni descarta
    decision_lider TEXT,
    nota_lider TEXT,
    enlaces TEXT,
    creado TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Lectura guardada de cada archivo de la carpeta perfiles/ (se renueva si el archivo cambia).
CREATE TABLE IF NOT EXISTS perfiles_cache (
    archivo TEXT PRIMARY KEY,
    firma TEXT NOT NULL,
    datos TEXT NOT NULL
);
"""

JSON_COLS = {"carta", "resultado", "ia", "verificacion", "enlaces", "excluyentes"}

# Columnas agregadas después de la primera versión (para bases ya creadas).
MIGRACIONES = [
    ("lideres", "cv_archivo", "TEXT"),
    ("lideres", "cv_texto", "TEXT"),
    ("vacantes", "peso_ia", "REAL NOT NULL DEFAULT 10"),
    ("candidatos", "ia", "TEXT"),
    # v3: el match se centra en las cartas astrales (líder, empresa y elemento del cargo).
    ("vacantes", "peso_lider", "REAL NOT NULL DEFAULT 35"),
    ("vacantes", "peso_empresa", "REAL NOT NULL DEFAULT 25"),
    ("vacantes", "peso_elemento", "REAL NOT NULL DEFAULT 10"),
    ("lideres", "verificacion", "TEXT"),
    ("candidatos", "verificacion", "TEXT"),
    # v4: manejo de conflictos entre perfiles.
    ("vacantes", "peso_conflicto", "REAL NOT NULL DEFAULT 10"),
    # v5: cada cargo se liga a un perfil de la carpeta perfiles/.
    ("vacantes", "perfil_id", "TEXT"),
    ("vacantes", "perfil_archivo", "TEXT"),
    # v6: GitHub, LinkedIn, portafolio y repositorio del postulante, con lo que se leyó de cada uno.
    ("candidatos", "enlaces", "TEXT"),
    # v7: los cargos técnicos piden GitHub, LinkedIn y repositorio; los demás, solo el portafolio.
    ("vacantes", "tecnico", "INTEGER NOT NULL DEFAULT 0"),
    # v8: las habilidades blandas no se buscan por palabras clave; las lee o las deduce la IA.
    ("habilidades", "tipo", "TEXT NOT NULL DEFAULT 'tecnica'"),
    # v9: cadena de mando: el jefe inmediato de cada líder (para la Red).
    ("lideres", "jefe_id", "INTEGER REFERENCES lideres(id) ON DELETE SET NULL"),
    # v10: requisitos excluyentes del cargo (solo título, experiencia y proyectos).
    ("vacantes", "excluyentes", "TEXT"),
]


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def close_db(_exc=None) -> None:
    con = g.pop("db", None)
    if con is not None:
        con.close()


def init_db(con: sqlite3.Connection) -> set[tuple[str, str]]:
    """Crea o migra las tablas. Devuelve las columnas (tabla, columna) que se acaban de agregar."""
    con.executescript(SCHEMA)
    agregadas = set()
    for tabla, columna, tipo in MIGRACIONES:
        existentes = {fila[1] for fila in con.execute(f"PRAGMA table_info({tabla})")}
        if columna not in existentes:
            con.execute(f"ALTER TABLE {tabla} ADD COLUMN {columna} {tipo}")
            agregadas.add((tabla, columna))
    if ("vacantes", "peso_lider") in agregadas:
        # Los cargos existentes pasan al reparto centrado en lo astral (70 % cartas, 30 % perfil).
        con.execute("UPDATE vacantes SET peso_cv = 20, peso_ia = 10")
    con.commit()
    return agregadas


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    data = dict(row)
    for col in JSON_COLS & data.keys():
        if data[col]:
            data[col] = json.loads(data[col])
    return data


def rows_to_list(rows) -> list[dict]:
    return [row_to_dict(r) for r in rows]
