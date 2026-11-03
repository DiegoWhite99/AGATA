"""Llenado automático del perfil de un cargo desde un archivo (PDF, Word, texto, CSV o Excel).

Las tablas (CSV/Excel) se leen tal cual: pares "campo, valor" y una tabla de habilidades. Los
documentos libres (o las tablas a las que les falte algo) los interpreta el oráculo IA; sin IA se
usa una lectura por títulos y viñetas.
"""
from __future__ import annotations

import csv
import difflib
import io
import re
from pathlib import Path

import astro
import evaluador
import oraculo

EXT_PERFIL = {".pdf", ".docx", ".txt", ".csv", ".xlsx"}

_SINONIMOS = {
    "cargo": ["cargo", "nombre del cargo", "puesto", "titulo", "titulo del cargo", "vacante", "rol", "posicion"],
    "area": ["area", "departamento", "dependencia", "unidad", "proceso", "gerencia"],
    "descripcion": ["descripcion", "descripcion del cargo", "objetivo", "objetivo del cargo", "mision del cargo",
                    "proposito", "funciones", "responsabilidades", "funciones principales"],
    "lider": ["lider", "jefe", "jefe inmediato", "reporta a", "supervisor", "responsable", "lider del cargo"],
    "elemento_afin": ["elemento", "elemento afin", "elemento astral"],
}
_COLUMNAS_HAB = {
    "nombre": ["habilidad", "habilidades", "competencia", "competencias", "skill", "requisito", "conocimiento"],
    "peso": ["peso", "importancia", "prioridad", "relevancia"],
    "nivel": ["nivel", "nivel requerido", "dominio", "nivel esperado"],
    "palabras_clave": ["palabras clave", "palabras_clave", "keywords", "claves", "herramientas", "tecnologias"],
}
_ESCALA = {"baja": 1, "basico": 2, "basica": 2, "media": 3, "medio": 3, "intermedio": 3, "intermedia": 3,
           "alta": 4, "alto": 4, "avanzado": 4, "avanzada": 4, "experto": 5, "experta": 5, "critica": 5,
           "muy alta": 5}


def _norm(texto: str) -> str:
    return evaluador.normalizar(str(texto or "")).strip(" :.-*•\t")


def _campo_de(celda: str) -> str | None:
    n = _norm(celda)
    for campo, sinonimos in _SINONIMOS.items():
        if n in sinonimos:
            return campo
    return None


def _columna_hab(celda: str) -> str | None:
    n = _norm(celda)
    for col, sinonimos in _COLUMNAS_HAB.items():
        if n in sinonimos:
            return col
    return None


def _escala(valor, defecto: int = 3) -> int:
    n = _norm(valor)
    if not n:
        return defecto
    if n in _ESCALA:
        return _ESCALA[n]
    try:
        x = float(n.replace("%", "").replace(",", "."))
    except ValueError:
        return defecto
    if x > 5:  # porcentaje o escala de 10
        x = x / 20 if x > 10 else x / 2
    return max(1, min(5, round(x)))


def _elemento(valor: str) -> str | None:
    n = _norm(valor).capitalize()
    return n if n in astro.ELEMENTOS else None


# --- Lectura de tablas ---------------------------------------------------------------

def _filas_csv(ruta: Path) -> list[list[str]]:
    crudo = ruta.read_bytes()
    for codificacion in ("utf-8-sig", "latin-1"):
        try:
            texto = crudo.decode(codificacion)
            break
        except UnicodeDecodeError:
            continue
    # El separador es el que aparece en más líneas (Excel en español guarda con «;»).
    lineas = [l for l in texto.splitlines()[:50] if l.strip()]
    separador = max(";\t,|", key=lambda d: sum(1 for l in lineas if d in l))
    return [[c.strip() for c in fila] for fila in csv.reader(io.StringIO(texto), delimiter=separador)]


def _filas_xlsx(ruta: Path) -> list[list[str]]:
    from openpyxl import load_workbook
    libro = load_workbook(ruta, read_only=True, data_only=True)
    filas = []
    for hoja in libro.worksheets:
        for fila in hoja.iter_rows(values_only=True):
            filas.append(["" if v is None else str(v).strip() for v in fila])
        filas.append([])  # separa las hojas
    libro.close()
    return filas


def _lista_habilidades(valor: str) -> list[dict]:
    """«ROS 2; Python; Control» → habilidades con peso y nivel por defecto."""
    partes = re.split(r"[;\n|]|,(?![^()]*\))", valor)
    return [{"nombre": p.strip()[:60], "peso": 3, "nivel": 3, "palabras_clave": ""}
            for p in partes if p.strip()]


def _desde_tabla(filas: list[list[str]]) -> dict:
    datos: dict = {"habilidades": []}
    columnas: dict[str, int] | None = None
    i = 0
    while i < len(filas):
        celdas = [c for c in filas[i]]
        llenas = [(j, c) for j, c in enumerate(celdas) if c]
        if not llenas:
            columnas = None if datos["habilidades"] else columnas
            i += 1
            continue

        # Encabezado de la tabla de habilidades.
        cols = {_columna_hab(c): j for j, c in llenas if _columna_hab(c)}
        if "nombre" in cols and (len(cols) >= 2 or len(llenas) == 1):
            columnas = cols
            i += 1
            continue

        # Encabezado horizontal: cargo | área | descripción | ... y una fila de valores debajo.
        campos = {_campo_de(c): j for j, c in llenas if _campo_de(c)}
        if len(campos) >= 2 and i + 1 < len(filas):
            valores = filas[i + 1]
            for campo, j in campos.items():
                if j < len(valores) and valores[j]:
                    datos.setdefault(campo, valores[j])
            j_hab = cols.get("nombre")
            if j_hab is not None and j_hab < len(valores) and valores[j_hab]:
                datos["habilidades"] += _lista_habilidades(valores[j_hab])
            i += 2
            continue

        # «Habilidades | ROS 2; Python; Control» en una sola fila.
        if _columna_hab(llenas[0][1]) == "nombre" and len(llenas) >= 2:
            datos["habilidades"] += _lista_habilidades(" ; ".join(c for _, c in llenas[1:]))
            i += 1
            continue

        # Par campo → valor.
        j0, primera = llenas[0]
        campo = _campo_de(primera)
        if campo and len(llenas) >= 2:
            valor = " ".join(c for _, c in llenas[1:])
            if campo == "descripcion" and campo in datos:
                datos[campo] += "\n" + valor
            else:
                datos.setdefault(campo, valor)
            columnas = None
            i += 1
            continue

        # Fila de la tabla de habilidades.
        if columnas:
            def celda(col: str) -> str:
                j = columnas.get(col)
                return celdas[j] if j is not None and j < len(celdas) else ""
            nombre = celda("nombre")
            if nombre:
                datos["habilidades"].append({
                    "nombre": nombre[:60],
                    "peso": _escala(celda("peso")),
                    "nivel": _escala(celda("nivel")),
                    "palabras_clave": celda("palabras_clave"),
                })
        i += 1
    if "elemento_afin" in datos:
        datos["elemento_afin"] = _elemento(datos["elemento_afin"])
    return {k: v for k, v in datos.items() if v}


# --- Lectura de documentos libres sin IA ---------------------------------------------

_TITULOS_HAB = re.compile(r"^(requisitos|competencias|habilidades|conocimientos|perfil requerido|"
                          r"requerimientos|formacion y experiencia)\b")
_TITULOS_DESC = re.compile(r"^(objetivo|descripcion|funciones|responsabilidades|mision|proposito)\b")
_VINETA = re.compile(r"^\s*([-•*▪●◦–]|\d+[.)])\s*")


def _desde_texto(texto: str) -> dict:
    lineas = [l.strip() for l in texto.splitlines() if l.strip()]
    datos: dict = {"habilidades": []}
    seccion = None
    descripcion: list[str] = []
    for linea in lineas:
        n = _norm(linea)
        clave, sep, valor = linea.partition(":")
        campo = _campo_de(clave) if sep else None
        if campo and valor.strip() and campo != "descripcion":
            datos.setdefault(campo, valor.strip())
            continue
        if _TITULOS_HAB.match(n):
            seccion = "hab"
            continue
        if _TITULOS_DESC.match(n):
            seccion = "desc"
            if sep and valor.strip():
                descripcion.append(valor.strip())
            continue
        if seccion == "hab" and len(datos["habilidades"]) < 8:
            nombre = _VINETA.sub("", linea).rstrip(".;")
            if 2 < len(nombre) <= 90:
                datos["habilidades"].append({"nombre": nombre[:60], "peso": 3, "nivel": 3,
                                             "palabras_clave": ""})
        elif seccion == "desc" and sum(len(d) for d in descripcion) < 900:
            descripcion.append(_VINETA.sub("", linea))
    if "cargo" not in datos and lineas and len(lineas[0]) <= 80:
        datos["cargo"] = lineas[0]
    datos["descripcion"] = " ".join(descripcion) if descripcion else " ".join(lineas[1:])[:900]
    return {k: v for k, v in datos.items() if v}


# --- Punto de entrada --------------------------------------------------------------------

def _lider_coincidente(texto: str | None, lideres: list[dict]) -> int | None:
    """Busca el líder por nombre o cargo, tolerando tildes y errores de digitación."""
    n = _norm(texto or "")
    if not n:
        return None
    mejor, mejor_id = 0.0, None
    for l in lideres:
        for candidato in (_norm(l["nombre"]), _norm(l["cargo"])):
            if not candidato:
                continue
            if candidato in n or n in candidato:
                return l["id"]
            parecido = difflib.SequenceMatcher(None, n, candidato).ratio()
            if parecido > mejor:
                mejor, mejor_id = parecido, l["id"]
    return mejor_id if mejor >= 0.85 else None


def extraer(ruta: Path, lideres: list[dict]) -> dict:
    """Devuelve {"campos": {...}, "fuente": ..., "avisos": [...]} listo para llenar el formulario."""
    ext = ruta.suffix.lower()
    avisos: list[str] = []
    campos: dict = {}
    texto = ""
    fuente = "tabla"
    if ext in (".csv", ".xlsx"):
        filas = _filas_csv(ruta) if ext == ".csv" else _filas_xlsx(ruta)
        campos = _desde_tabla(filas)
        texto = "\n".join(" ".join(c for c in f if c) for f in filas if any(f))
    else:
        texto = evaluador.extraer_texto_cv(ruta)
        fuente = "documento"
    if not texto.strip():
        raise ValueError("El archivo no tiene texto legible (¿es un PDF escaneado como imagen?).")

    faltan = [c for c in ("cargo", "area", "habilidades") if not campos.get(c)]
    if len(campos.get("descripcion", "")) < 150:
        faltan.append("descripcion")
    if faltan:
        lectura = oraculo.extraer_perfil(texto) if oraculo.activo() else None
        if lectura and not lectura.get("error"):
            fuente = "ia" if fuente == "documento" else "tabla + ia"
            for clave, valor in lectura.items():
                if valor and not campos.get(clave):
                    campos[clave] = valor
            # Una descripción de tabla demasiado corta se reemplaza por la que redactó la IA.
            if len(campos.get("descripcion", "")) < 150 and len(lectura.get("descripcion") or "") >= 150:
                campos["descripcion"] = lectura["descripcion"]
        else:
            if lectura:
                avisos.append(lectura["error"])
            for clave, valor in _desde_texto(texto).items():
                campos.setdefault(clave, valor)
            fuente = "texto" if fuente == "documento" else fuente

    for h in campos.get("habilidades", []):
        if not h.get("palabras_clave"):
            h["palabras_clave"] = h["nombre"].lower()
    campos["habilidades"] = campos.get("habilidades", [])[:12]
    campos["lider_id"] = _lider_coincidente(campos.get("lider"), lideres)
    if campos.get("lider") and not campos["lider_id"]:
        avisos.append(f"El documento menciona a «{campos['lider']}» como líder, pero no está registrado.")
    if len(campos.get("descripcion", "")) < 150:
        avisos.append("La descripción quedó corta: complétala hasta 150 caracteres.")
    if len(campos["habilidades"]) < 3:
        avisos.append("Se encontraron menos de 3 habilidades: agrega las que falten.")
    return {"campos": campos, "fuente": fuente, "avisos": avisos}


def plantilla_filas() -> list[list[str]]:
    return [
        ["Campo", "Valor"],
        ["Cargo", "Ingeniero(a) de Robótica"],
        ["Área", "Robótica e Innovación"],
        ["Líder", "Nombre del líder registrado"],
        ["Elemento afín", "Tierra"],
        ["Descripción", "Desarrollo e integración de robots móviles: programar nodos en ROS 2, sintonizar "
                        "controladores, integrar sensores y realizar pruebas en campo con el equipo."],
        [],
        ["Habilidad", "Peso", "Nivel", "Palabras clave"],
        ["ROS 2", "5", "4", "ros, ros2, gazebo, rviz, nav2"],
        ["Python", "4", "4", "python, numpy, pytest"],
        ["Control automático", "4", "3", "pid, matlab, simulink"],
        ["Trabajo en equipo", "3", "4", "scrum, git, mentoría"],
    ]
