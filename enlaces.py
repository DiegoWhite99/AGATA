"""Trabajo en línea del postulante: GitHub, LinkedIn, portafolio y repositorio destacado.

Los enlaces salen del formulario o, si faltan, de la hoja de vida, incluidos los hipervínculos
escondidos tras íconos en un PDF o un Word. GitHub se lee con su API pública y el portafolio
como página web. LinkedIn no permite que un programa lea sus perfiles: solo se guarda el enlace
para que el líder lo abra.
"""
from __future__ import annotations

import datetime as dt
import html.parser
import ipaddress
import json
import logging
import math
import os
import re
import socket
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

CAMPOS = ("github", "linkedin", "portafolio", "repositorio")
# El portafolio se pide en todos los cargos; GitHub, LinkedIn y el repositorio, solo en los técnicos.
CAMPOS_GENERAL = ("portafolio",)
NOMBRES = {"github": "GitHub", "linkedin": "LinkedIn", "portafolio": "Portafolio", "repositorio": "Repositorio destacado"}
TIMEOUT = 8
MAX_BYTES = 400_000   # lo máximo que se descarga de una página o un README
MAX_TEXTO = 2500      # caracteres que se guardan del portafolio o del README
MAX_URL = 300

log = logging.getLogger("agata.enlaces")

_URL_EN_TEXTO = re.compile(r"(?:https?://|www\.)[^\s<>\"')\]]+", re.I)
_GITHUB = re.compile(r"^https?://(?:www\.)?github\.com/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))(?:/([\w.-]{1,100}))?/?(?:[?#].*)?$", re.I)
_USUARIO_GITHUB = re.compile(r"^@?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))$")
_LINKEDIN = re.compile(r"^https?://(?:[a-z]{2,3}\.)?linkedin\.com/(?:in|pub)/[^/?#\s]+/?(?:[?#].*)?$", re.I)
# Rutas de github.com que no son usuarios.
_NO_USUARIOS = {"about", "features", "orgs", "settings", "topics", "marketplace", "explore", "sponsors", "login"}
# Sitios que no cuentan como portafolio propio.
_NO_PORTAFOLIO = ("linkedin.com", "github.com", "google.com", "gmail.com", "facebook.com", "instagram.com",
                  "twitter.com", "x.com", "wa.me", "whatsapp.com")


def campos_para(tecnico) -> tuple[str, ...]:
    """Los enlaces que se piden y se leen según el cargo."""
    return CAMPOS if tecnico else CAMPOS_GENERAL


def filtrar(enlaces: dict | None, campos: tuple[str, ...]) -> dict | None:
    """Solo los enlaces que cuentan para el cargo (por si el cargo dejó de ser técnico)."""
    if not enlaces:
        return None
    salida = {c: enlaces[c] for c in campos if enlaces.get(c)}
    return {**salida, "revisado": enlaces.get("revisado")} if salida else None


# --- Normalización y detección -------------------------------------------------------------

def normalizar(valor: str) -> str | None:
    """Devuelve la URL con esquema https si es válida, o None."""
    valor = (valor or "").strip().rstrip(".,;")
    if not valor or len(valor) > MAX_URL or any(c.isspace() for c in valor):
        return None
    if not re.match(r"^https?://", valor, re.I):
        valor = "https://" + valor
    partes = urllib.parse.urlsplit(valor)
    if partes.scheme.lower() not in ("http", "https") or not partes.hostname or "." not in partes.hostname:
        return None
    return urllib.parse.urlunsplit((partes.scheme.lower(), partes.netloc.lower(), partes.path, partes.query, ""))


def _host(url: str) -> str:
    return (urllib.parse.urlsplit(url).hostname or "").removeprefix("www.")


def _github(url: str) -> tuple[str, str | None] | None:
    """(usuario, repositorio) de una URL de GitHub."""
    m = _GITHUB.match(url)
    if not m or m.group(1).lower() in _NO_USUARIOS:
        return None
    return m.group(1), (m.group(2).removesuffix(".git") if m.group(2) else None)


def clasificar(urls: list[str]) -> dict[str, str]:
    """Reparte una lista de URLs en GitHub, LinkedIn, repositorio destacado y portafolio."""
    salida: dict[str, str] = {}
    for crudo in urls:
        url = normalizar(crudo)
        if not url:
            continue
        gh = _github(url)
        if gh and gh[1]:
            salida.setdefault("repositorio", url)
            salida.setdefault("github", f"https://github.com/{gh[0]}")
        elif gh:
            salida.setdefault("github", f"https://github.com/{gh[0]}")
        elif _LINKEDIN.match(url):
            salida.setdefault("linkedin", url)
        elif not any(_host(url) == d or _host(url).endswith("." + d) for d in _NO_PORTAFOLIO):
            salida.setdefault("portafolio", url)
    return salida


def _uris_pdf(ruta: Path) -> list[str]:
    from pypdf import PdfReader
    uris = []
    for pagina in PdfReader(str(ruta)).pages:
        for anotacion in pagina.get("/Annots") or []:
            accion = anotacion.get_object().get("/A")
            uri = accion.get_object().get("/URI") if accion is not None else None
            if uri:
                uris.append(str(uri))
    return uris


def _uris_docx(ruta: Path) -> list[str]:
    from docx import Document
    from docx.opc.constants import RELATIONSHIP_TYPE
    rels = Document(str(ruta)).part.rels.values()
    return [r.target_ref for r in rels if r.reltype == RELATIONSHIP_TYPE.HYPERLINK and r.is_external]


def desde_cv(ruta: Path | None, texto: str) -> dict[str, str]:
    """Enlaces de la hoja de vida: los hipervínculos del archivo y las URLs escritas en el texto."""
    uris: list[str] = []
    try:
        if ruta and ruta.suffix.lower() == ".pdf":
            uris += _uris_pdf(ruta)
        elif ruta and ruta.suffix.lower() == ".docx":
            uris += _uris_docx(ruta)
    except Exception as err:  # archivo dañado: quedan las URLs del texto
        log.warning("No se pudieron leer los hipervínculos de %s: %s", ruta, err)
    uris += _URL_EN_TEXTO.findall(texto or "")
    return clasificar([u for u in uris if not u.lower().startswith(("mailto:", "tel:"))])


def validar(datos, errores: dict[str, str], campos: tuple[str, ...] = CAMPOS) -> dict[str, str]:
    """Lee los enlaces del formulario. Agrega a `errores` los que no son válidos."""
    salida = {}
    for campo in campos:
        crudo = str(datos.get(campo) or "").strip()
        if not crudo:
            continue
        if campo == "github" and _USUARIO_GITHUB.match(crudo):
            crudo = "github.com/" + crudo.lstrip("@")
        url = normalizar(crudo)
        if campo == "github" and not (url and _github(url)):
            errores[campo] = "Escribe tu usuario de GitHub o el enlace a tu perfil."
        elif campo == "linkedin" and not (url and _LINKEDIN.match(url)):
            errores[campo] = "Usa el enlace de tu perfil: linkedin.com/in/tu-usuario"
        elif not url:
            errores[campo] = "Enlace no válido."
        else:
            salida[campo] = f"https://github.com/{_github(url)[0]}" if campo == "github" else url
    return salida


def combinar(propios: dict[str, str], de_cv: dict[str, str], campos: tuple[str, ...] = CAMPOS) -> dict[str, dict]:
    """Los del formulario mandan; los que falten salen de la hoja de vida."""
    salida = {}
    for campo in campos:
        if propios.get(campo):
            salida[campo] = {"url": propios[campo], "origen": "formulario"}
        elif de_cv.get(campo):
            salida[campo] = {"url": de_cv[campo], "origen": "hoja de vida"}
    return salida


# --- Lectura -------------------------------------------------------------------------------

def _api_github(ruta: str, crudo: bool = False):
    cabeceras = {"Accept": "application/vnd.github.raw" if crudo else "application/vnd.github+json",
                 "User-Agent": "agata", "X-GitHub-Api-Version": "2022-11-28"}
    if os.environ.get("GITHUB_TOKEN"):
        cabeceras["Authorization"] = f"Bearer {os.environ['GITHUB_TOKEN']}"
    req = urllib.request.Request("https://api.github.com" + ruta, headers=cabeceras)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        datos = resp.read(MAX_BYTES)
    return datos.decode("utf-8", "ignore") if crudo else json.loads(datos)


def _leer_github(usuario: str) -> dict:
    perfil = _api_github(f"/users/{usuario}")
    repos = _api_github(f"/users/{usuario}/repos?sort=pushed&per_page=50&type=owner")
    propios = [r for r in repos if not r.get("fork")]
    lenguajes = Counter(r["language"] for r in propios if r.get("language"))
    return {
        "usuario": perfil.get("login"), "nombre": perfil.get("name"), "bio": perfil.get("bio"),
        "repos_publicos": perfil.get("public_repos"), "seguidores": perfil.get("followers"),
        "desde": (perfil.get("created_at") or "")[:10],
        "lenguajes": [nombre for nombre, _ in lenguajes.most_common(8)],
        "forks": len(repos) - len(propios),
        "repos": [{"nombre": r["name"], "descripcion": r.get("description") or "", "lenguaje": r.get("language"),
                   "estrellas": r.get("stargazers_count", 0), "forks": r.get("forks_count", 0),
                   "temas": r.get("topics") or [], "archivado": bool(r.get("archived")),
                   "creado": (r.get("created_at") or "")[:10],
                   "actualizado": (r.get("pushed_at") or "")[:10], "url": r.get("html_url")} for r in propios[:30]],
    }


def destacado(gh: dict, claves: list[str]) -> dict | None:
    """El repositorio propio más destacado: estrellas, forks, actividad reciente, documentación y
    relación con las habilidades del cargo (`claves`, ya normalizadas). Sin forks ni archivados."""
    hoy = dt.date.today()

    def puntos(r: dict) -> float:
        dias = (hoy - dt.date.fromisoformat(r["actualizado"])).days if r["actualizado"] else 3650
        texto = _norm(" ".join([r["nombre"].replace("-", " ").replace("_", " "), r["descripcion"],
                                r["lenguaje"] or "", " ".join(r["temas"])]))
        afinidad = sum(1 for c in claves if re.search(r"\b" + re.escape(c) + r"\b", texto))
        # Estrellas y forks en escala logarítmica: entre 1 y 2 casi no hay diferencia; entre 1 y 100, sí.
        return (3 * math.log2(1 + r["estrellas"]) + 2 * math.log2(1 + r.get("forks", 0)) + max(0.0, 3 - dias / 120)
                + bool(r["descripcion"]) + bool(r["temas"]) + 2 * min(afinidad, 3))

    # El repositorio con el nombre del usuario es el README de su perfil, no un proyecto.
    candidatos = [r for r in gh.get("repos") or []
                  if not r.get("archivado") and r["nombre"].lower() != (gh.get("usuario") or "").lower()]
    return max(candidatos, key=puntos) if candidatos else None


def _norm(texto: str) -> str:
    sin_tildes = "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", sin_tildes.lower())


def claves_del_cargo(habilidades: list[dict]) -> list[str]:
    """Las palabras de las habilidades del cargo, para elegir el repositorio más afín."""
    claves = set()
    for h in habilidades:
        for c in [h["nombre"], *str(h.get("palabras_clave") or "").split(",")]:
            c = _norm(c).strip()
            if len(c) >= 2:
                claves.add(c)
    return sorted(claves)


def _sin_markdown(texto: str) -> str:
    texto = re.sub(r"```.*?```", " ", texto, flags=re.S)          # bloques de código
    texto = re.sub(r"!\[[^\]]*\]\([^)]*\)|<[^>]+>", " ", texto)   # imágenes y HTML
    texto = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", texto)        # enlaces: queda el texto
    texto = re.sub(r"[#>*_`|]+", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def _leer_repo(usuario: str, repo: str) -> dict:
    info = _api_github(f"/repos/{usuario}/{repo}")
    bytes_por_lenguaje = _api_github(f"/repos/{usuario}/{repo}/languages")
    total = sum(bytes_por_lenguaje.values()) or 1
    try:
        readme = _sin_markdown(_api_github(f"/repos/{usuario}/{repo}/readme", crudo=True))
    except urllib.error.HTTPError as err:
        if err.code != 404:
            raise
        readme = ""
    return {
        "nombre": info.get("full_name"), "descripcion": info.get("description") or "",
        "estrellas": info.get("stargazers_count", 0), "temas": info.get("topics") or [],
        "creado": (info.get("created_at") or "")[:10], "actualizado": (info.get("pushed_at") or "")[:10],
        "lenguajes": [{"nombre": k, "pct": round(100 * v / total)} for k, v in
                      sorted(bytes_por_lenguaje.items(), key=lambda kv: -kv[1])[:6]],
        "readme": readme[:MAX_TEXTO],
    }


def _url_publica(url: str) -> bool:
    """Solo http(s) a puertos web de direcciones públicas: el servidor no debe poder alcanzar su red interna."""
    partes = urllib.parse.urlsplit(url)
    if partes.scheme not in ("http", "https") or not partes.hostname or partes.port not in (None, 80, 443):
        return False
    try:
        direcciones = {info[4][0].split("%")[0] for info in socket.getaddrinfo(partes.hostname, None)}
    except (socket.gaierror, UnicodeError):
        return False
    return bool(direcciones) and all(ipaddress.ip_address(d).is_global for d in direcciones)


class _SoloPublicas(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not _url_publica(newurl):
            raise urllib.error.URLError("redirige a una dirección no pública")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class _TextoHtml(html.parser.HTMLParser):
    _OCULTAS = {"script", "style", "noscript", "svg", "template"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.partes: list[str] = []
        self.titulo = ""
        self.descripcion = ""
        self._ocultas = 0
        self._en_titulo = False

    def handle_starttag(self, tag, attrs):
        if tag in self._OCULTAS:
            self._ocultas += 1
        elif tag == "title":
            self._en_titulo = True
        elif tag == "meta" and not self.descripcion:
            a = {k: v or "" for k, v in attrs}
            if (a.get("name") or a.get("property") or "").lower() in ("description", "og:description"):
                self.descripcion = a.get("content", "").strip()

    def handle_endtag(self, tag):
        if tag in self._OCULTAS and self._ocultas:
            self._ocultas -= 1
        elif tag == "title":
            self._en_titulo = False

    def handle_data(self, data):
        if self._en_titulo:
            self.titulo += data
        elif not self._ocultas and data.strip():
            self.partes.append(data.strip())


def _leer_pagina(url: str) -> dict:
    if not _url_publica(url):
        raise ValueError("La dirección no es una página pública.")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; agata)",
                                               "Accept": "text/html,text/plain"})
    with urllib.request.build_opener(_SoloPublicas).open(req, timeout=TIMEOUT) as resp:
        tipo = resp.headers.get_content_type()
        if tipo not in ("text/html", "application/xhtml+xml", "text/plain"):
            raise ValueError(f"No es una página web ({tipo}).")
        crudo = resp.read(MAX_BYTES).decode(resp.headers.get_content_charset() or "utf-8", "ignore")
    lector = _TextoHtml()
    lector.feed(crudo)
    texto = re.sub(r"\s+", " ", " ".join(lector.partes)).strip()
    return {"titulo": re.sub(r"\s+", " ", lector.titulo).strip()[:200], "descripcion": lector.descripcion[:500],
            "texto": texto[:MAX_TEXTO],
            # Las páginas armadas con JavaScript (React, Vue…) casi no traen texto sin ejecutarlo.
            "poco_texto": len(texto) < 200}


def _error(err: Exception) -> str:
    if isinstance(err, urllib.error.HTTPError):
        if err.code == 404:
            return "No existe o es privado."
        if err.code in (403, 429):
            return "GitHub limitó las consultas; vuelve a intentarlo en una hora."
        return f"Respondió con error {err.code}."
    if isinstance(err, ValueError):
        return str(err)
    return "No respondió a tiempo."


def _leer_uno(campo: str, url: str) -> dict:
    gh = _github(url)
    if campo == "linkedin":
        return {"leido": False, "nota": "LinkedIn no permite que un programa lea sus perfiles: ábrelo desde el enlace."}
    if campo == "github":
        return {"leido": True, **_leer_github(gh[0])}
    if gh and gh[1]:
        return {"leido": True, "tipo": "github", **_leer_repo(*gh)}
    return {"leido": True, "tipo": "pagina", **_leer_pagina(url)}


def leer(enlaces: dict[str, dict], claves: list[str] | None = None) -> dict | None:
    """Visita cada enlace (en paralelo) y guarda lo que encontró. None si no hay enlaces.

    Si hay GitHub pero no repositorio destacado, se elige el más destacado de su GitHub
    (ver `destacado`; `claves` son las palabras de las habilidades del cargo)."""
    if not enlaces:
        return None

    def visitar(campo: str, entrada: dict) -> tuple[str, dict]:
        base = {"url": entrada["url"], "origen": entrada.get("origen", "formulario")}
        try:
            return campo, {**base, **_leer_uno(campo, base["url"])}
        except Exception as err:
            log.warning("No se pudo leer %s (%s): %s", campo, base["url"], err)
            return campo, {**base, "leido": False, "error": _error(err)}

    campos = [c for c in CAMPOS if c in enlaces]
    with ThreadPoolExecutor(max_workers=4) as hilos:
        salida = dict(hilos.map(lambda c: visitar(c, enlaces[c]), campos))
    gh = salida.get("github") or {}
    if "repositorio" not in salida and gh.get("leido"):
        mejor = destacado(gh, claves or [])
        if mejor:
            salida["repositorio"] = visitar("repositorio", {"url": mejor["url"], "origen": "github"})[1]
    salida["revisado"] = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    return salida


def urls(enlaces: dict | None, campos: tuple[str, ...] = CAMPOS) -> dict[str, dict]:
    """Los enlaces guardados, listos para volver a leerlos. El repositorio que eligió AGATA no se
    conserva: se vuelve a elegir, por si ahora hay otro más destacado."""
    return {c: {"url": enlaces[c]["url"], "origen": enlaces[c].get("origen", "formulario")}
            for c in campos if enlaces and enlaces.get(c) and enlaces[c].get("origen") != "github"}


# --- Para el match y el oráculo --------------------------------------------------------------

def texto_para_claves(enlaces: dict | None) -> str:
    """Lo leído en línea como texto, para buscar las palabras clave de cada habilidad."""
    if not enlaces:
        return ""
    partes = []
    gh = enlaces.get("github") or {}
    if gh.get("leido"):
        partes += [gh.get("bio") or "", " ".join(gh.get("lenguajes") or [])]
        for r in gh.get("repos") or []:
            partes += [r["nombre"].replace("-", " ").replace("_", " "), r["descripcion"], r["lenguaje"] or "", " ".join(r["temas"])]
    repo = enlaces.get("repositorio") or {}
    if repo.get("leido"):
        partes += [repo.get("descripcion") or "", " ".join(l["nombre"] for l in repo.get("lenguajes") or []),
                   " ".join(repo.get("temas") or []), repo.get("readme") or "", repo.get("texto") or ""]
    web = enlaces.get("portafolio") or {}
    if web.get("leido"):
        partes += [web.get("titulo") or "", web.get("descripcion") or "", web.get("texto") or ""]
    return "\n".join(p for p in partes if p)


def resumen_ia(enlaces: dict | None) -> dict | None:
    """Lo que el oráculo IA necesita saber del trabajo en línea, compacto."""
    if not enlaces:
        return None
    salida = {}
    gh = enlaces.get("github")
    if gh and gh.get("leido"):
        salida["github"] = {k: gh.get(k) for k in ("usuario", "bio", "repos_publicos", "seguidores", "desde", "lenguajes", "forks")}
        salida["github"]["repos_propios_recientes"] = [
            {k: r[k] for k in ("nombre", "descripcion", "lenguaje", "estrellas", "temas", "actualizado")}
            for r in (gh.get("repos") or [])[:10]]
        # Para leer el potencial: qué construyó y con qué lenguaje, en orden de creación ("2024-03 Python Robot_Bang").
        salida["github"]["trayectoria"] = [
            f"{r['creado'][:7]} {r['lenguaje'] or '-'} {r['nombre']}"
            for r in sorted(gh.get("repos") or [], key=lambda r: r.get("creado") or "") if r.get("creado")]
    elif gh:
        salida["github"] = {"url": gh["url"], "no_leido": gh.get("error")}
    repo = enlaces.get("repositorio")
    if repo and repo.get("leido"):
        salida["repositorio_destacado"] = {k: v for k, v in repo.items() if k not in ("leido", "origen", "tipo")}
    elif repo:
        salida["repositorio_destacado"] = {"url": repo["url"], "no_leido": repo.get("error")}
    web = enlaces.get("portafolio")
    if web and web.get("leido"):
        salida["portafolio"] = {k: web.get(k) for k in ("url", "titulo", "descripcion", "texto", "poco_texto")}
    elif web:
        salida["portafolio"] = {"url": web["url"], "no_leido": web.get("error")}
    if enlaces.get("linkedin"):
        salida["linkedin"] = "Tiene perfil, pero no se puede leer su contenido."
    return salida or None
