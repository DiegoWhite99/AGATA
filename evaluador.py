"""Lectura del CV y cálculo del puntaje de match."""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import astro

NOMBRES_COMPONENTE = {
    "lider": "Sinastría con el líder",
    "empresa": "Sinastría con la empresa",
    "elemento": "Elemento afín al cargo",
    "conflicto": "Manejo de conflictos",
    "cv": "Hoja de vida",
    "ia": "Ajuste con el líder (IA)",
}

# El puntaje no clasifica ni descarta: ordena a los postulantes y se lee en dos partes.
LECTURAS = {
    "profesional": ("cv", "ia"),
    "astral": ("lider", "empresa", "elemento", "conflicto"),
}

# Alertas (no descartan a nadie: avisan al líder sin que tenga que abrir el informe).
UMBRAL_AFINIDAD_BAJA = 40   # perfil profesional por debajo: "Baja afinidad con el cargo"
UMBRAL_SINERGIA_BAJA = 45   # sinastría con el líder por debajo, con un manejo de conflictos flojo
UMBRAL_CONFLICTO_FLOJO = 50

NOMBRES_EXCLUYENTE = {"titulo": "Título", "experiencia": "Experiencia", "proyectos": "Proyectos"}

_FRASE_COMPONENTE = {
    "lider": "la sinastría con {lider}",
    "empresa": "la sinastría con {empresa}",
    "elemento": "el elemento afín al cargo",
    "conflicto": "su manejo de conflictos",
    "cv": "su hoja de vida",
    "ia": "su ajuste con lo que espera el líder",
}


def extraer_texto_cv(ruta: Path) -> str:
    ext = ruta.suffix.lower()
    if ext == ".pdf":
        from pypdf import PdfReader
        return "\n".join(page.extract_text() or "" for page in PdfReader(str(ruta)).pages)
    if ext == ".docx":
        from docx import Document
        return "\n".join(p.text for p in Document(str(ruta)).paragraphs)
    return ruta.read_text(encoding="utf-8", errors="ignore")


def normalizar(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFKD", texto)
    sin_tildes = "".join(c for c in sin_tildes if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", sin_tildes.lower())


def palabras_clave(habilidad: dict) -> list[str]:
    candidatas = [habilidad["nombre"]] + habilidad["palabras_clave"].split(",")
    claves, vistas = [], set()
    for clave in (c.strip() for c in candidatas):
        if clave and normalizar(clave) not in vistas:
            vistas.add(normalizar(clave))
            claves.append(clave)
    return claves


def buscar_claves(texto_norm: str, claves: list[str]) -> list[str]:
    encontradas = []
    for clave in claves:
        patron = r"(?<![a-z0-9])" + re.escape(normalizar(clave).strip()) + r"(?![a-z0-9+#])"
        if re.search(patron, texto_norm):
            encontradas.append(clave)
    return encontradas


def anios_experiencia(texto_norm: str) -> int | None:
    hallados = re.findall(r"(\d{1,2})\s*\+?\s*anos?\s+(?:de\s+)?experiencia", texto_norm)
    hallados += re.findall(r"(\d{1,2})\s*\+?\s*years?\s+(?:of\s+)?experience", texto_norm)
    return max(map(int, hallados)) if hallados else None


def nivel_educativo(texto_norm: str) -> str | None:
    for patron, nivel in [(r"doctorado|phd", "Doctorado"),
                          (r"maestria|magister|master|msc", "Maestría"),
                          (r"especializacion", "Especialización"),
                          (r"ingenier[oa]|pregrado|bachelor|licenciad", "Profesional"),
                          (r"tecnolog[oa]", "Tecnólogo"),
                          (r"tecnic[oa]", "Técnico")]:
        if re.search(patron, texto_norm):
            return nivel
    return None


def evaluar(vacante: dict, habilidades: list[dict], cv_texto: str, carta_cand: dict,
            carta_lider: dict | None, carta_empresa: dict | None, nombres: dict,
            ia: dict | None = None) -> dict:
    """Calcula el match centrado en las cartas astrales.

    Componentes: sinastría con el líder, sinastría con la empresa, afinidad con el elemento del
    cargo, manejo de conflictos (con el líder, o con la empresa si no hay carta del líder), hoja de
    vida y ajuste con el líder según la IA. Los que no tienen datos (por ejemplo,
    la empresa sin carta o la IA sin clave) quedan fuera y los pesos se reparten entre el resto.
    Nadie queda descartado: el puntaje ordena a los postulantes y la decisión es del líder.
    `nombres` trae {"candidato", "lider", "empresa"} para redactar las lecturas.
    """
    texto = normalizar(cv_texto or "")
    ia_ok = bool(ia) and not ia.get("error")
    ia_hab = {h["nombre"]: h for h in ia["habilidades"]} if ia_ok else {}

    detalle = []
    suma_peso = cobertura_total = 0.0
    for hab in habilidades:
        claves = palabras_clave(hab)
        encontradas = buscar_claves(texto, claves)
        necesarias = min(3, len(claves))
        cv_claves = min(100.0, len(encontradas) / necesarias * 100) if necesarias else 0.0
        lectura_ia = ia_hab.get(hab["nombre"])
        blanda = hab.get("tipo") == "blanda"
        # La IA lee la hoja de vida y los proyectos con criterio semántico. Las palabras clave solo
        # pueden sumar, y en las habilidades blandas no cuentan: nadie las escribe al pie de la letra.
        if lectura_ia:
            cv = lectura_ia["puntaje"] if blanda else max(lectura_ia["puntaje"], 0.4 * cv_claves + 0.6 * lectura_ia["puntaje"])
        else:
            cv = None if blanda else cv_claves  # sin IA, una habilidad blanda no se puede leer: queda fuera
        requerido = hab["nivel"] * 20.0
        if cv is None:
            cobertura, estado = None, "sin_lectura"
        else:
            cobertura = min(100.0, cv / requerido * 100)
            estado = "cumple" if cobertura >= 90 else "parcial" if cobertura >= 60 else "brecha"
            suma_peso += hab["peso"]
            cobertura_total += hab["peso"] * cobertura
        detalle.append({
            "nombre": hab["nombre"], "peso": hab["peso"], "nivel": hab["nivel"], "tipo": "blanda" if blanda else "tecnica",
            "requerido": requerido, "cv": round(cv, 1) if cv is not None else None, "cv_claves": round(cv_claves, 1),
            "cv_ia": lectura_ia["puntaje"] if lectura_ia else None,
            "evidencia_ia": lectura_ia["evidencia"] if lectura_ia else None,
            # De dónde sale la nota: directa (la hoja de vida lo dice), deducida (los proyectos lo muestran) o sin evidencia.
            "evidencia_tipo": lectura_ia.get("tipo_evidencia") if lectura_ia else None,
            "fuente": lectura_ia.get("fuente") if lectura_ia else None,
            "cobertura": round(cobertura, 1) if cobertura is not None else None, "estado": estado,
            "claves_encontradas": encontradas,
        })

    sin_lider = (astro.sinastria(carta_cand, carta_lider, nombres["candidato"], nombres["lider"])
                 if carta_lider else None)
    sin_empresa = (astro.sinastria(carta_cand, carta_empresa, nombres["candidato"], nombres["empresa"])
                   if carta_empresa else None)
    elemento = astro.afinidad_elemento(carta_cand, vacante.get("elemento_afin"))
    conf_lider = (astro.dinamica_conflicto(carta_cand, carta_lider, nombres["candidato"], nombres["lider"])
                  if carta_lider else None)
    conf_empresa = (astro.dinamica_conflicto(carta_cand, carta_empresa, nombres["candidato"], nombres["empresa"])
                    if carta_empresa else None)
    conflicto = conf_lider or conf_empresa

    componentes = {
        "lider": sin_lider["puntaje"] if sin_lider else None,
        "empresa": sin_empresa["puntaje"] if sin_empresa else None,
        "elemento": elemento,
        "conflicto": conflicto["puntaje"] if conflicto else None,
        "cv": round(cobertura_total / suma_peso, 1) if suma_peso else None,
        "ia": ia["ajuste_lider"] if ia_ok else None,
    }
    pesos = {k: (vacante.get(f"peso_{k}", 0) if v is not None else 0) for k, v in componentes.items()}
    total_pesos = sum(pesos.values()) or 1
    final = sum(pesos[k] * (v or 0) for k, v in componentes.items()) / total_pesos
    lecturas = {nombre: _promedio(componentes, pesos, claves) for nombre, claves in LECTURAS.items()}
    # Lo más fuerte de cada postulante, sea cual sea su puntaje total.
    destaca = [k for k in sorted(componentes, key=lambda k: -(componentes[k] or 0)) if pesos[k]][:2]

    fortalezas = [h["nombre"] for h in sorted(detalle, key=lambda h: -(h["cv"] or 0)) if h["estado"] == "cumple"]
    brechas = [h["nombre"] for h in sorted(detalle, key=lambda h: h["cobertura"] or 0) if h["estado"] == "brecha"]
    # El potencial (capacidad de crecer) es una lectura aparte de la IA: no entra en el puntaje.
    potencial = ia.get("potencial") if ia_ok else None
    # Requisitos excluyentes del cargo, tal como los verificó la IA ("sin verificar" si no hay IA o si
    # el líder agregó el requisito después de la última consulta).
    verificados = {r["tipo"]: r for r in ia.get("requisitos") or []} if ia_ok else {}
    requisitos = [{**e, "cumple": verificados.get(e["tipo"], {}).get("cumple", "sin verificar"),
                   "evidencia": verificados.get(e["tipo"], {}).get("evidencia", "")}
                  for e in vacante.get("excluyentes") or []]
    cumple = (None if not requisitos else False if any(r["cumple"] == "no" for r in requisitos)
              else True if all(r["cumple"] == "si" for r in requisitos) else None)
    alertas = _alertas(componentes, lecturas, requisitos, nombres)

    return {
        "puntaje": round(final, 1),
        "lecturas": lecturas,
        "potencial": potencial,
        "requisitos": requisitos,
        "cumple_requisitos": cumple,
        "alertas": alertas,
        "destaca": [{"clave": k, "nombre": NOMBRES_COMPONENTE[k], "puntaje": componentes[k]} for k in destaca],
        "componentes": componentes,
        "pesos": pesos,
        "sinastria": {"lider": sin_lider, "empresa": sin_empresa},
        "elemento": {"afin": vacante.get("elemento_afin"), "puntaje": elemento},
        "conflicto": {"lider": conf_lider, "empresa": conf_empresa},
        "ia": ia,
        "habilidades": detalle,
        "fortalezas": fortalezas,
        "brechas": brechas,
        "experiencia_anios": anios_experiencia(texto),
        "nivel_educativo": nivel_educativo(texto),
        "cv_palabras": len(texto.split()),
        "recomendacion": _recomendacion(componentes, lecturas, destaca, brechas, potencial, requisitos, nombres),
    }


def _alertas(comp: dict, lecturas: dict, requisitos: list[dict], nombres: dict) -> list[dict]:
    alertas = []
    faltan = [r for r in requisitos if r["cumple"] == "no"]
    if faltan:
        alertas.append({"clave": "requisitos", "texto": "No cumple: " + "; ".join(
            f"{NOMBRES_EXCLUYENTE[r['tipo']].lower()} ({r['texto']})" for r in faltan)})
    dudosos = [r for r in requisitos if r["cumple"] == "dudoso"]
    if dudosos:
        alertas.append({"clave": "validar", "texto": "Por validar en entrevista: " + ", ".join(
            NOMBRES_EXCLUYENTE[r["tipo"]].lower() for r in dudosos)})
    if lecturas["profesional"] is not None and lecturas["profesional"] < UMBRAL_AFINIDAD_BAJA:
        alertas.append({"clave": "afinidad", "texto": "Baja afinidad con el cargo"})
    if (comp["lider"] is not None and comp["lider"] < UMBRAL_SINERGIA_BAJA
            and (comp["conflicto"] is None or comp["conflicto"] < UMBRAL_CONFLICTO_FLOJO)):
        alertas.append({"clave": "sinergia", "texto": f"Sinergia difícil con {nombres['lider']}"})
    return alertas


def _promedio(componentes: dict, pesos: dict, claves: tuple[str, ...]) -> float | None:
    """Promedio ponderado de un grupo de componentes; None si ninguno tiene datos."""
    total = sum(pesos[k] for k in claves)
    if not total:
        return None
    return round(sum(pesos[k] * componentes[k] for k in claves if pesos[k]) / total, 1)


def _y(items: list[str]) -> str:
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " y " + items[-1]


def _recomendacion(comp: dict, lecturas: dict, destaca: list[str], brechas: list[str], potencial: dict | None,
                   requisitos: list[dict], nombres: dict) -> str:
    """Lo más fuerte del postulante y lo que conviene explorar. Solo un requisito excluyente lo deja al final."""
    partes = []
    faltan = [NOMBRES_EXCLUYENTE[r["tipo"]].lower() for r in requisitos if r["cumple"] == "no"]
    if faltan:
        partes.append(f"No cumple un requisito excluyente del cargo ({_y(faltan)}): queda al final del ranking "
                      "y el líder confirma.")
    if destaca:
        fuertes = [f"{_FRASE_COMPONENTE[k].format(**nombres)} ({comp[k]:.0f}%)" for k in destaca]
        partes.append(f"Lo más fuerte de {nombres['candidato']} para este cargo es {_y(fuertes)}.")
    if potencial and potencial.get("puntaje", 0) >= 70:
        partes.append(f"La IA ve en {nombres['candidato']} un potencial de crecimiento alto "
                      f"({potencial['puntaje']}%): vale la pena conocerlo aunque su experiencia formal sea corta.")
    if lecturas["profesional"] is not None and lecturas["astral"] is not None:
        partes.append(f"Perfil profesional: {lecturas['profesional']:.0f}%; "
                      f"afinidad astral: {lecturas['astral']:.0f}%.")
    if brechas:
        partes.append(f"En la entrevista conviene explorar {_y(brechas[:3])}.")
    partes.append("La decisión de avanzar es del líder.")
    return " ".join(partes)
