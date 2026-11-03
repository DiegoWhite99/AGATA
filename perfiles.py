"""Catálogo de perfiles de cargo: la carpeta perfiles/ del proyecto.

Todo cargo nuevo se liga a uno de estos archivos. Los Excel con el formato institucional
«Descripción del rol y responsabilidades» (ASL-FOR-001) se leen sección por sección; los demás
(PDF, Word, TXT, CSV o Excel libre) los interpreta perfil_cargo. Las copias idénticas y las
versiones de un mismo archivo («CARGO (1).xlsx») se agrupan en un solo perfil.
"""
from __future__ import annotations

import datetime as dt
import difflib
import hashlib
import json
import re
from pathlib import Path

import evaluador
import perfil_cargo

CARPETA = Path(__file__).parent / "perfiles"
# Súbela si cambia la lectura de los archivos: invalida la caché guardada en la base.
VERSION_LECTURA = 1

_SECCION = re.compile(r"^(\d+(?:\.\d+)?)\.\s*\S")
_COPIA = re.compile(r"\s*\(\d+\)\s*$")
_NIVEL_BASE = {"estrategico": 5, "tactico": 4, "operativo": 3}

_CAMPOS_ROL = [
    ("vicerrectoria", "vicerrectoria"),
    ("nombre del cargo", "cargo"),
    ("division", "division"),
    ("rol (", "nivel"),
    ("superior inmediato jerarquico", "superior"),
    ("superior inmediato funcional", "superior_funcional"),
    ("otros cargos", "pares"),
    ("cargos que tiene a cargo", "a_cargo"),
    ("actual ocupante", "ocupantes"),
]
_CAMPOS_PERFIL = [
    ("formacion", "formacion"),
    ("experiencia", "experiencia"),
    ("conocimientos", "conocimientos"),
    ("competencias", "competencias"),
]
_VACIOS = {"", "n/a", "na", "no aplica", "-", "ninguno"}


def _norm(texto) -> str:
    return evaluador.normalizar(str(texto or "")).strip()


def _texto(valor) -> str:
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    lineas = [re.sub(r"[ \t\xa0]+", " ", l).strip() for l in str(valor).splitlines()]
    return "\n".join(l for l in lineas if l)


def _lleno(valor) -> bool:
    return _norm(valor) not in _VACIOS


# --- Lectura del formato institucional (ASL-FOR-001) ----------------------------------------

def _filas_xlsx(ruta: Path) -> list[list]:
    from openpyxl import load_workbook
    libro = load_workbook(ruta, read_only=True, data_only=True)
    try:
        hoja = libro.worksheets[0]
        # Columnas A–L: más a la derecha solo hay notas de diligenciamiento.
        return [list(f) for f in hoja.iter_rows(max_row=400, max_col=12, values_only=True)]
    finally:
        libro.close()


def es_formato_institucional(filas: list[list]) -> bool:
    for fila in filas[:12]:
        for v in fila:
            n = _norm(v)
            if "asl-for-001" in n or "descripcion del rol y responsabilidades" in n:
                return True
    return False


def _celdas(fila: list) -> list[tuple[int, object]]:
    return [(j, v) for j, v in enumerate(fila) if v is not None and str(v).strip()]


def _valor_a_la_derecha(celdas, j0: int, hasta: int = 9) -> str:
    """Primer valor después de la etiqueta, sin pasar de la columna I (las notas van en K)."""
    for j, v in celdas:
        if j0 < j <= hasta:
            return _texto(v)
    return ""


def _leer_institucional(filas: list[list]) -> dict:
    p: dict = {"formato": "institucional", "responsabilidades": [], "decisiones": {"tomar": [], "proponer": []},
               "relaciones": {"internas": [], "externas": []}, "dimension": [], "cambios": []}
    seccion, sub, encabezado = "", "", False
    mision: list[str] = []
    for fila in filas:
        celdas = _celdas(fila)
        if not celdas:
            continue
        j0, v0 = celdas[0]
        n0 = _norm(v0)
        if isinstance(v0, str):
            m = _SECCION.match(v0.strip())
            if m:
                seccion, sub, encabezado = m.group(1), "", False
                continue
            if n0.startswith("control de cambios"):
                seccion = "cambios"
                continue

        if seccion == "1":
            for prefijo, clave in _CAMPOS_ROL:
                if n0.startswith(prefijo):
                    valor = _valor_a_la_derecha(celdas, j0)
                    if _lleno(valor):
                        p[clave] = valor
                    break
        elif seccion == "2":
            mision.append(_texto(v0))
        elif seccion == "3":
            # «1 | Responsabilidad»: el número en una celda y el texto en la siguiente.
            textos = [_texto(v) for j, v in celdas if isinstance(v, str) and j <= 6]
            if textos and not _norm(textos[0]).startswith("kpi"):
                p["responsabilidades"].append(textos[0])
        elif seccion == "5":
            if n0.startswith("descripcion"):
                encabezado = True
            elif encabezado:
                fila_d = {"descripcion": _texto(fila[2]) if fila[2] else "",
                          "valor": _texto(fila[4]) if fila[4] else "",
                          "funcionarios": _texto(fila[5]) if fila[5] else "",
                          "roles": _texto(fila[6]) if fila[6] else "",
                          "alcance": _texto(fila[7]) if fila[7] else ""}
                if any(_lleno(v) for v in fila_d.values()):
                    p["dimension"].append(fila_d)
        elif seccion == "6":
            if n0.startswith("a tomar"):
                sub = "tomar"
            elif n0.startswith("a proponer"):
                sub = "proponer"
            elif sub and _lleno(v0):
                p["decisiones"][sub].append(_texto(v0))
        elif seccion == "7":
            if n0 in ("internas", "externas"):
                sub = n0
            elif sub and n0 != "contacto":
                rel = {"contacto": _texto(fila[3]) if fila[3] else "",
                       "proposito": _texto(fila[4]) if fila[4] else "",
                       "frecuencia": _texto(fila[6]) if fila[6] else ""}
                if _lleno(rel["contacto"]):
                    p["relaciones"][sub].append(rel)
        elif seccion == "8":
            for prefijo, clave in _CAMPOS_PERFIL:
                if n0.startswith(prefijo):
                    valor = _valor_a_la_derecha(celdas, j0, hasta=11)
                    if _lleno(valor):
                        p[clave] = valor
                    break
        elif seccion == "cambios" and isinstance(v0, (dt.datetime, dt.date)):
            p["cambios"].append({"fecha": v0.date().isoformat() if isinstance(v0, dt.datetime) else v0.isoformat(),
                                 "version": _valor_a_la_derecha(celdas, j0),
                                 "descripcion": _texto(celdas[-1][1]) if len(celdas) > 2 else ""})
    p["mision"] = "\n".join(m for m in mision if m)
    return p


# --- Competencias y conocimientos ----------------------------------------------------------

_MARCA_COMP = re.compile(r"competencias\s*(t[eé]cnicas|blandas)\s*:?", re.I)


def _items(texto: str) -> list[str]:
    """Separa un bloque en ítems: por línea, por oración y por «, Palabra minúscula…»; no parte listas de
    nombres propios («Adobe Photoshop, Adobe Illustrator») ni lo que va entre paréntesis."""
    salida = []
    for linea in (texto or "").splitlines():
        for parte in re.split(r"(?<=[a-záéíóúñ)])\.\s+(?=[A-ZÁÉÍÓÚÑ])|,\s+(?=[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[a-záéíóúñ])(?![^()]*\))", linea):
            parte = parte.strip(" .;:-•*\t")
            if len(parte) > 2:
                salida.append(parte)
    return salida


def competencias(texto: str | None) -> dict[str, list[str]]:
    res: dict[str, list[str]] = {"tecnicas": [], "blandas": []}
    if not texto:
        return res
    marcas = list(_MARCA_COMP.finditer(texto))
    if not marcas:
        res["tecnicas"] = _items(texto)
        return res
    vistos: list[str] = []
    for i, m in enumerate(marcas):
        tipo = "blandas" if _norm(m.group(1)).startswith("blanda") else "tecnicas"
        # Algunos formatos repiten «Técnicas» donde va «Blandas».
        if tipo == "tecnicas" and "tecnicas" in vistos and "blandas" not in vistos:
            tipo = "blandas"
        vistos.append(tipo)
        fin = marcas[i + 1].start() if i + 1 < len(marcas) else len(texto)
        res[tipo] += _items(texto[m.end():fin])
    return res


def _parentesis(texto: str) -> list[str]:
    """Herramientas entre paréntesis: «(React, Angular, Vue.js)» → ["React", "Angular", "Vue.js"]."""
    salida = []
    for grupo in re.findall(r"\(([^)]*)\)", texto):
        for t in re.split(r",|/|\by\b", grupo):
            t = re.sub(r"^(ej\.?|ejemplo:?|o software equivalente|entre otr[oa]s|etc\.?)\s*", "", t.strip(), flags=re.I)
            t = re.sub(r"\s*(etc\.?|entre otr[oa]s)$", "", t, flags=re.I).strip(" .")
            if 1 < len(t) <= 30:
                salida.append(t)
    return salida


_RELLENO = re.compile(r"^(conocimiento\s+(s[oó]lido\s+)?(en|de)|dominio\s+de|manejo\s+(b[aá]sico\s+)?de|uso\s+de|"
                      r"comprensi[oó]n\s+de(\s+principios\s+de)?|familiaridad\s+con|capacidad\s+(de|para)|"
                      r"experiencia\s+en|fundamentos\s+de)\s+", re.I)
_CONECTORES = {"de", "del", "la", "el", "los", "las", "y", "e", "en", "con", "para", "a", "al", "por", "o", "u"}
# Palabras que aparecen en casi cualquier hoja de vida: solas no prueban una habilidad.
_GENERICAS = {"gestion", "procesos", "proceso", "capacidad", "trabajo", "herramientas", "conocimiento", "conocimientos",
              "institucional", "institucionales", "tecnicas", "tecnicos", "tecnico", "efectiva", "desarrollo", "manejo",
              "dominio", "orientacion", "habilidades", "aplicadas", "aplicados", "entornos", "principios", "resultados",
              "objetivos", "experiencia", "solido", "modernos", "comprension", "integral", "sistemas", "evaluacion",
              "aseguramiento", "produccion", "edicion", "intermedia", "intermedio", "basico", "basica", "avanzado",
              "equipos", "equipo", "pensamiento", "critico", "resolucion", "problemas", "detalle", "cumplimiento",
              "atencion", "servicio", "proyectos", "tecnologicos", "tecnologicas", "recursos", "complejos",
              "administrativa", "administrativos", "eventos", "especializadas", "plataformas", "analisis",
              "tecnologia", "tecnologias", "digitales", "estrategico", "estrategica", "colaborativo", "academicos",
              "academica", "academicas", "institucion", "procedimientos", "actividades", "calidad", "nivel"}
_SIGLA = re.compile(r"(?<![\w+#])(?:[A-Z][A-Za-z0-9]*[+#][A-Za-z0-9+#]*|[A-Z]{2,}[a-z]?)(?![\w+#])")


def _nombre_corto(texto: str, maximo: int = 48) -> str:
    t = re.sub(r"\s*\([^)]*\)", "", texto)
    t = re.sub(r"\s+", " ", t).strip(" .:;,-")
    if len(t) > maximo:
        t = _RELLENO.sub("", t)
    if len(t) > maximo:
        palabras = t[:maximo + 1].split(" ")[:-1]
        while palabras and _norm(palabras[-1].strip(",;:")) in _CONECTORES:
            palabras.pop()
        t = " ".join(palabras).strip(" ,;:.-")
    return t[:1].upper() + t[1:]


def _claves(texto: str, maximo: int = 8) -> list[str]:
    """Palabras clave para buscar en la hoja de vida: herramientas, siglas, frases cortas y términos propios."""
    claves = _parentesis(texto)
    base = re.sub(r"\([^)]*\)", "", texto)
    claves += _SIGLA.findall(base)
    for frase in re.split(r",|;|:|\.(?=\s|$)|\by\b|\be\b", base):
        palabras = _RELLENO.sub("", frase.strip()).split()
        while palabras and _norm(palabras[-1]) in _CONECTORES:
            palabras.pop()
        contenido = [p for p in palabras if _norm(p) not in _CONECTORES]
        if palabras and 2 <= len(contenido) <= 3 and _norm(palabras[0]) not in _CONECTORES:
            claves.append(" ".join(palabras).lower())
    if len(claves) < 3:
        for palabra in re.findall(r"[A-Za-zÁÉÍÓÚáéíóúÑñ]{6,}", base):
            if _norm(palabra) not in _GENERICAS:
                claves.append(palabra.lower())
    salida, vistas = [], set()
    for c in claves:
        n = _norm(c)
        if n and n not in vistas:
            vistas.add(n)
            salida.append(c)
    return salida[:maximo]


def habilidades(p: dict) -> list[dict]:
    """La matriz de habilidades sale de las competencias y los conocimientos del perfil."""
    if p.get("habilidades"):
        return [{**h, "tipo": h.get("tipo") or tipo_habilidad(h["nombre"])} for h in p["habilidades"]]
    base = _NIVEL_BASE.get(_norm(p.get("nivel")).split()[0] if p.get("nivel") else "", 3)
    comp = competencias(p.get("competencias"))
    tecnicas, blandas = comp["tecnicas"], comp["blandas"]
    conocimientos = _items(p.get("conocimientos") or "")
    if len(tecnicas) < 2:  # sin competencias técnicas, los conocimientos hacen sus veces
        tecnicas, conocimientos = tecnicas + conocimientos, []
    salida, vistas = [], set()

    def agregar(texto: str, peso: int, nivel: int, claves: list[str], tipo: str) -> None:
        nombre = _nombre_corto(texto)
        if len(nombre) < 3 or _norm(nombre) in vistas:
            return
        vistas.add(_norm(nombre))
        salida.append({"nombre": nombre, "peso": peso, "nivel": nivel, "palabras_clave": ", ".join(claves), "tipo": tipo})

    for i, t in enumerate(tecnicas[:5]):
        agregar(t, 5 if i < 2 else 4, base, _claves(t), "tecnica")
    for t in blandas[:4]:
        agregar(t, 3, base, _claves(t, 5), "blanda")
    if conocimientos:
        claves = [c for linea in conocimientos for c in _claves(linea, 3)]
        agregar("Conocimientos deseables", 3, max(2, base - 1), claves[:12], "tecnica")
    return salida


# --- Elemento afín (sugerencia según la naturaleza del rol) ----------------------------------

_ELEMENTO_RAICES = {
    "Fuego": ["lider", "dirig", "impuls", "emprend", "negoci", "estrateg", "promov", "motiv", "alianz",
              "convocatori", "transform", "monetiz", "decision"],
    "Tierra": ["planific", "planea", "presupuest", "document", "procedimient", "cumpl", "indicador", "metric",
               "riesgo", "organiz", "administr", "control", "seguimiento", "calidad", "cronograma", "logistic",
               "normativ", "ofimatic"],
    "Aire": ["comunic", "investig", "anali", "datos", "conocimiento", "divulg", "relacion", "articul", "publica",
             "informe", "idea", "aprend", "metodolog", "sistematiz", "red"],
    "Agua": ["acompan", "empat", "servicio", "cuidado", "bienestar", "creativ", "diseno", "visual", "sensib",
             "apoyo", "atencion", "emocion", "colabor", "equipo"],
}


# --- Cargo técnico: además del portafolio, pide GitHub, LinkedIn y repositorio ----------------

_TECNICO = re.compile(
    r"\b(software|programa(cion|dor\w*)|desarrollador\w*|desarrollo (tecnologico|web|de software|de aplicaciones|movil)|"
    r"front ?end|back ?end|full ?stack|devops|ingenier\w* de (sistemas|software|datos|desarrollo)|"
    r"inteligencia artificial|ia|machine learning|aprendizaje automatico|ciencia de datos|analitica de datos|"
    r"robotic\w*|ciberseguridad|cloud|python|javascript|typescript|java|react|sql|git|api)\b")


# --- Habilidad técnica o blanda --------------------------------------------------------------
# Las blandas casi nunca se escriben al pie de la letra en una hoja de vida: no se buscan por
# palabras clave, las lee (o las deduce de los proyectos) el oráculo IA.

_BLANDA = re.compile(
    r"\b(comunica\w*|trabajo en equipo|equipos?|colabora\w*|lideraz\w*|liderar|orientacion|autonom\w*|"
    r"proactiv\w*|iniciativa|empat\w*|adaptab\w*|flexib\w*|creativ\w*|negocia\w*|resolucion de (problemas|conflictos)|"
    r"pensamiento critico|etica|responsab\w*|compromiso|servicio|atencion al cliente|relaciones interpersonales|"
    r"interpersonal\w*|gestion del tiempo|cumplimiento|resultados|actitud|asertiv\w*|escucha|tolerancia|presion|"
    r"disciplina|motivacion|aprendizaje continuo)\b")


def tipo_habilidad(nombre: str) -> str:
    """'blanda' o 'tecnica', por el nombre de la habilidad."""
    return "blanda" if _BLANDA.search(_norm(nombre)) else "tecnica"


def es_tecnico(*textos: str) -> bool:
    """Sugiere si un cargo es técnico (ingeniería, desarrollo, datos o IA) por su nombre y sus habilidades."""
    return bool(_TECNICO.search(_norm(" ".join(t or "" for t in textos))))


def elemento_sugerido(p: dict) -> str | None:
    if p.get("elemento_afin"):
        return p["elemento_afin"]
    texto = _norm(" ".join([p.get("mision") or "", *p.get("responsabilidades", []), p.get("competencias") or ""]))
    if not texto:
        return None
    cuenta = {e: sum(len(re.findall(r"\b" + r, texto)) for r in raices) for e, raices in _ELEMENTO_RAICES.items()}
    mejor = max(cuenta, key=lambda e: cuenta[e])
    return mejor if cuenta[mejor] else None


# --- Coincidencia de cargos y personas -----------------------------------------------------

_SUFIJOS = ("aciones", "acion", "adoras", "adora", "adores", "ador", "iones", "ion", "orias", "oria", "oras", "ora",
            "ores", "or", "es", "s", "a", "o")
_VACIAS = {"de", "del", "la", "el", "los", "las", "y", "e", "en", "a", "para", "por", "con", "nacional", "gerencia"}


def _raiz(palabra: str) -> str:
    for suf in _SUFIJOS:
        if palabra.endswith(suf) and len(palabra) - len(suf) >= 4:
            return palabra[: -len(suf)]
    return palabra


def _raices(texto: str) -> list[str]:
    return [_raiz(w) for w in re.findall(r"[a-z0-9]+", _norm(texto)) if w not in _VACIAS]


def _iguales(a: str, b: str) -> bool:
    if a == b:
        return True
    comun = len(_prefijo(a, b))
    return (comun >= 5 and comun >= 0.8 * min(len(a), len(b))) or difflib.SequenceMatcher(None, a, b).ratio() >= 0.85


def _prefijo(a: str, b: str) -> str:
    i = 0
    while i < min(len(a), len(b)) and a[i] == b[i]:
        i += 1
    return a[:i]


def parecido_cargo(buscado: str, cargo: str) -> float:
    """Qué parte del cargo buscado aparece en el otro, tolerando género, plural, tildes y errores."""
    a, b = _raices(buscado), _raices(cargo)
    if not a or not b:
        return 0.0
    return sum(1 for x in a if any(_iguales(x, y) for y in b)) / len(a)


def misma_persona(nombre: str, ocupantes: str) -> bool:
    partes = [w for w in re.findall(r"[a-z]+", _norm(nombre)) if len(w) >= 3]
    for ocupante in re.split(r"\s+-\s+|,|;|\n| y ", ocupantes or ""):
        palabras = set(re.findall(r"[a-z]+", _norm(ocupante)))
        if len(partes) >= 2 and all(p in palabras for p in partes):
            return True
    return False


def lider_del_perfil(p: dict, lideres: list[dict], catalogo_: list[dict]) -> tuple[int | None, str]:
    """Busca entre los líderes registrados al superior inmediato que indica el perfil."""
    superior = p.get("superior") or p.get("lider") or ""
    if not superior or not lideres:
        return None, ""
    # 1) Por el cargo registrado del líder.
    puntajes = sorted(((parecido_cargo(superior, l["cargo"]), l) for l in lideres), key=lambda x: -x[0])
    if puntajes[0][0] >= 0.75 and (len(puntajes) == 1 or puntajes[1][0] < puntajes[0][0]):
        return puntajes[0][1]["id"], f"su cargo coincide con «{superior}», el superior inmediato del perfil"
    # 2) Por el organigrama de la carpeta: el perfil del superior dice quién lo ocupa.
    for otro in catalogo_:
        if otro.get("ocupantes") and parecido_cargo(superior, otro.get("cargo") or otro["titulo"]) >= 0.75:
            for l in lideres:
                if misma_persona(l["nombre"], otro["ocupantes"]):
                    return l["id"], f"ocupa el cargo «{otro.get('cargo') or otro['titulo']}», superior inmediato del perfil"
    return None, ""


# --- Catálogo ------------------------------------------------------------------------------

def _base(archivo: str) -> str:
    return _COPIA.sub("", Path(archivo).stem).strip(" _-")


def _titulo(base: str) -> str:
    """«INGENIERO DE DESARROLLO DE IA» → «Ingeniero de Desarrollo de IA»."""
    if not base.isupper():
        return base
    palabras = []
    for i, w in enumerate(base.lower().split()):
        if len(w) <= 2 and w not in _CONECTORES:
            palabras.append(w.upper())
        elif i and w in _CONECTORES:
            palabras.append(w)
        else:
            palabras.append(w.capitalize())
    return " ".join(palabras)


def _slug(texto: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", _norm(texto)).strip("-") or "perfil"


def _completitud(p: dict) -> int:
    return sum(1 for c in ("cargo", "division", "nivel", "superior", "mision", "formacion", "experiencia",
                           "conocimientos", "competencias") if p.get(c)) + min(len(p.get("responsabilidades", [])), 5)


def _leer(ruta: Path) -> dict:
    ext = ruta.suffix.lower()
    if ext == ".xlsx":
        filas = _filas_xlsx(ruta)
        if es_formato_institucional(filas):
            return _leer_institucional(filas)
    # Otros formatos: la lectura general (tabla, IA o títulos y viñetas).
    c = perfil_cargo.extraer(ruta, [])["campos"]
    return {"formato": "libre", "cargo": c.get("cargo"), "division": c.get("area"), "superior": c.get("lider"),
            "mision": c.get("descripcion"), "habilidades": c.get("habilidades") or [],
            "elemento_afin": c.get("elemento_afin"), "responsabilidades": []}


def leer_archivo(con, ruta: Path) -> dict:
    """Lectura de un archivo de la carpeta, guardada en la base mientras el archivo no cambie."""
    info = ruta.stat()
    firma = f"{VERSION_LECTURA}:{info.st_size}:{info.st_mtime_ns}"
    fila = con.execute("SELECT firma, datos FROM perfiles_cache WHERE archivo=?", (ruta.name,)).fetchone()
    if fila and fila[0] == firma:
        return json.loads(fila[1])
    try:
        datos = _leer(ruta)
    except Exception as err:  # archivo dañado, protegido o sin texto
        datos = {"error": str(err) if isinstance(err, ValueError) else "No se pudo leer el archivo."}
    datos["hash"] = hashlib.md5(ruta.read_bytes()).hexdigest()
    con.execute("INSERT OR REPLACE INTO perfiles_cache (archivo, firma, datos) VALUES (?,?,?)",
                (ruta.name, firma, json.dumps(datos, ensure_ascii=False)))
    con.commit()
    return datos


def id_de(archivo: str) -> str:
    """Id del perfil al que pertenece un archivo: «COORDINADOR CUMBRE (1).xlsx» → coordinador-cumbre."""
    return _slug(_base(archivo))


def _completo(p: dict) -> bool:
    return bool(p.get("mision") and (p.get("competencias") or p.get("habilidades")))


def archivos() -> list[Path]:
    if not CARPETA.is_dir():
        return []
    return sorted(r for r in CARPETA.iterdir()
                  if r.is_file() and r.suffix.lower() in perfil_cargo.EXT_PERFIL and not r.name.startswith(("~$", ".")))


def catalogo(con) -> list[dict]:
    """Un perfil por cargo. Si hay varias versiones, se usa la más completa (y la más reciente)."""
    grupos: dict[str, list[tuple[Path, dict]]] = {}
    presentes = archivos()
    for ruta in presentes:
        grupos.setdefault(id_de(ruta.name), []).append((ruta, leer_archivo(con, ruta)))
    nombres = [r.name for r in presentes]
    con.execute(f"DELETE FROM perfiles_cache WHERE archivo NOT IN ({','.join('?' * len(nombres))})", nombres)
    con.commit()
    salida = []
    for pid, versiones in grupos.items():
        legibles = [(r, d) for r, d in versiones if not d.get("error")] or versiones
        ruta, datos = max(legibles, key=lambda rd: (_completitud(rd[1]), rd[0].stat().st_mtime_ns, rd[0].name))
        hashes = {d.get("hash") for _, d in versiones}
        perfil = {**datos, "id": pid, "archivo": ruta.name, "titulo": _titulo(_base(ruta.name)),
                  "archivos": [r.name for r, _ in versiones], "versiones": len(hashes)}
        perfil["completo"] = _completo(datos)
        salida.append(perfil)
    # Las divisiones escritas distinto («Dirección de investigación», «Dirección Nacional de
    # Investigación»…) quedan en un mismo grupo, con el nombre que más se repite.
    claves = {p["id"]: " ".join(sorted(set(_raices(p.get("division") or p.get("vicerrectoria") or ""))))
              for p in salida}
    nombres: dict[str, list[str]] = {}
    for p in salida:
        if claves[p["id"]]:
            nombres.setdefault(claves[p["id"]], []).append((p.get("division") or p.get("vicerrectoria")).strip())
    for p in salida:
        lista = nombres.get(claves[p["id"]])
        p["grupo"] = (max(sorted(set(lista)), key=lista.count) if lista
                      else "Sin división" if p["completo"] else "Formatos sin diligenciar")
    _marcar_copias(salida)
    return sorted(salida, key=lambda p: (p["grupo"] == "Formatos sin diligenciar", _norm(p["grupo"]), _norm(p["titulo"])))


_CAMPOS_COPIA = [("mision", "misión"), ("formacion", "formación"), ("experiencia", "experiencia"),
                 ("conocimientos", "conocimientos deseables")]


def _marcar_copias(salida: list[dict]) -> None:
    """Señala el texto copiado entre perfiles de cargos distintos (p. ej., las competencias de un analista
    pegadas en el perfil de un ingeniero): ese cargo no tiene requisitos propios en esa sección."""
    for p in salida:
        p["compartido"] = []
    for i, a in enumerate(salida):
        for b in salida[i + 1:]:
            campos = [nombre for clave, nombre in _CAMPOS_COPIA
                      if a.get(clave) and _norm(a.get(clave)) == _norm(b.get(clave))]
            ca = competencias(a.get("competencias"))
            cb = competencias(b.get("competencias"))
            items_a = {_norm(x) for x in ca["tecnicas"] + ca["blandas"]}
            items_b = {_norm(x) for x in cb["tecnicas"] + cb["blandas"]}
            if items_a and items_b and len(items_a & items_b) / len(items_a | items_b) >= 0.8:
                campos.append("competencias")
            if campos:
                a["compartido"].append({"id": b["id"], "titulo": b["titulo"], "campos": campos})
                b["compartido"].append({"id": a["id"], "titulo": a["titulo"], "campos": campos})


def _y(items: list[str]) -> str:
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " y " + items[-1]


def avisos_copia(p: dict) -> list[str]:
    return [f"«{p['titulo']}» y «{c['titulo']}» tienen el mismo texto en {_y(c['campos'])}: parece copiado de un "
            f"perfil a otro. Revisa el archivo «{p['archivo']}»." for c in p.get("compartido", [])]


def expectativas(p: dict | None) -> str:
    """Lo que el cargo espera del nuevo integrante, según su perfil (no según el líder)."""
    if not p or p.get("error"):
        return ""
    comp = competencias(p.get("competencias"))
    partes = [("Misión del rol", p.get("mision")), ("Formación académica", p.get("formacion")),
              ("Experiencia", p.get("experiencia")),
              ("Competencias técnicas", "; ".join(comp["tecnicas"])),
              ("Competencias blandas", "; ".join(comp["blandas"])),
              ("Conocimientos deseables", "; ".join(_items(p.get("conocimientos") or "")))]
    return "\n".join(f"{t}: {v}" for t, v in partes if v)


def obtener(con, pid: str | None, archivo: str | None = None) -> dict | None:
    """El perfil por su id; con archivo, esa versión concreta (la que se usó al crear el cargo)."""
    if not pid:
        return None
    perfil = next((p for p in catalogo(con) if p["id"] == pid), None)
    if perfil and archivo and archivo != perfil["archivo"] and archivo in perfil["archivos"]:
        datos = leer_archivo(con, CARPETA / archivo)
        if not datos.get("error"):
            perfil = {**perfil, **datos, "archivo": archivo, "completo": _completo(datos)}
    return perfil


def propuesta(p: dict, lideres: list[dict], catalogo_: list[dict]) -> dict:
    """Campos del formulario «Nuevo cargo» llenados desde el perfil, con avisos para revisar."""
    avisos = []
    cargo = (p.get("cargo") or p["titulo"]).strip()
    descripcion = (p.get("mision") or "").strip()
    if p.get("responsabilidades"):
        descripcion += ("\n\n" if descripcion else "") + "Responsabilidades:\n" + "\n".join(
            f"• {r}" for r in p["responsabilidades"])
    habs = habilidades(p)
    lider_id, motivo = lider_del_perfil(p, lideres, catalogo_)
    if not p.get("completo"):
        avisos.append(f"El archivo «{p['archivo']}» está sin diligenciar: solo trae el nombre del cargo. "
                      "Completa la descripción y las habilidades.")
    if p.get("superior") and not lider_id:
        avisos.append(f"El superior inmediato del perfil es «{p['superior']}», pero no hay un líder registrado "
                      "con ese cargo. Regístralo en Líderes o elige otro.")
    avisos += avisos_copia(p)
    if p.get("versiones", 1) > 1:
        avisos.append(f"Hay {p['versiones']} versiones de este perfil; se usó «{p['archivo']}», "
                      "la más completa.")
    return {
        "campos": {"cargo": cargo, "area": (p.get("division") or p.get("vicerrectoria") or "").strip(),
                   "descripcion": descripcion, "habilidades": habs, "elemento_afin": elemento_sugerido(p),
                   "lider_id": lider_id,
                   "tecnico": es_tecnico(cargo, *(f"{h['nombre']} {h['palabras_clave']}" for h in habs))},
        "lider_motivo": motivo,
        "avisos": avisos,
    }


def publico(p: dict | None) -> dict | None:
    """Lo que se muestra del perfil (sin los ocupantes actuales), con las listas ya separadas."""
    if not p:
        return None
    salida = {k: v for k, v in p.items() if k not in ("ocupantes", "hash")}
    salida["competencias_lista"] = competencias(p.get("competencias"))
    salida["conocimientos_lista"] = _items(p.get("conocimientos") or "")
    return salida


def requisitos(p: dict | None) -> dict | None:
    """Requisitos del perfil que ve el postulante."""
    if not p:
        return None
    req = {k: p.get(k) for k in ("formacion", "experiencia", "conocimientos")}
    return req if any(req.values()) else None


def guardar_archivo(archivo, nombre: str) -> tuple[Path, bool]:
    """Guarda un perfil subido en la carpeta. Devuelve (ruta, nuevo); si ya estaba idéntico, no lo duplica."""
    from werkzeug.utils import secure_filename
    CARPETA.mkdir(exist_ok=True)
    contenido = archivo.read()
    huella = hashlib.md5(contenido).hexdigest()
    for ruta in archivos():
        if ruta.stat().st_size == len(contenido) and hashlib.md5(ruta.read_bytes()).hexdigest() == huella:
            return ruta, False
    ruta_nombre = Path(nombre)
    limpio = re.sub(r"[^\w .()-]", "", ruta_nombre.stem).strip(" .") or secure_filename(ruta_nombre.stem) or "perfil"
    ruta = CARPETA / f"{limpio}{ruta_nombre.suffix.lower()}"
    n = 1
    while ruta.exists():
        ruta = CARPETA / f"{limpio} ({n}){ruta_nombre.suffix.lower()}"
        n += 1
    ruta.write_bytes(contenido)
    return ruta, True
