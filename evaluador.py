"""Lectura del CV y cálculo del puntaje de match."""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import astro

UMBRAL_MATCH = 80
UMBRAL_DECISION = 60

VEREDICTOS = {
    "match": "Match",
    "decision": "En decisión",
    "descartado": "Descartado",
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


def clasificar(puntaje: float) -> str:
    if puntaje >= UMBRAL_MATCH:
        return "match"
    if puntaje >= UMBRAL_DECISION:
        return "decision"
    return "descartado"


def evaluar(vacante: dict, habilidades: list[dict], cv_texto: str, carta_cand: dict,
            carta_lider: dict | None, carta_empresa: dict | None, nombres: dict,
            ia: dict | None = None) -> dict:
    """Calcula el match centrado en las cartas astrales.

    Componentes: sinastría con el líder, sinastría con la empresa, afinidad con el elemento del
    cargo, manejo de conflictos (con el líder, o con la empresa si no hay carta del líder), hoja de
    vida y ajuste con el líder según la IA. Los que no tienen datos (por ejemplo,
    la empresa sin carta o la IA sin clave) quedan fuera y los pesos se reparten entre el resto.
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
        # La IA lee el CV con criterio semántico; las palabras clave quedan como respaldo.
        cv = 0.4 * cv_claves + 0.6 * lectura_ia["puntaje"] if lectura_ia else cv_claves
        requerido = hab["nivel"] * 20.0
        cobertura = min(100.0, cv / requerido * 100)
        estado = "cumple" if cobertura >= 90 else "parcial" if cobertura >= 60 else "brecha"
        suma_peso += hab["peso"]
        cobertura_total += hab["peso"] * cobertura
        detalle.append({
            "nombre": hab["nombre"], "peso": hab["peso"], "nivel": hab["nivel"],
            "requerido": requerido, "cv": round(cv, 1), "cv_claves": round(cv_claves, 1),
            "cv_ia": lectura_ia["puntaje"] if lectura_ia else None,
            "evidencia_ia": lectura_ia["evidencia"] if lectura_ia else None,
            "cobertura": round(cobertura, 1), "estado": estado, "claves_encontradas": encontradas,
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
    veredicto = clasificar(final)

    fortalezas = [h["nombre"] for h in sorted(detalle, key=lambda h: -h["cv"]) if h["estado"] == "cumple"]
    brechas = [h["nombre"] for h in sorted(detalle, key=lambda h: h["cobertura"]) if h["estado"] == "brecha"]

    return {
        "puntaje": round(final, 1),
        "veredicto": veredicto,
        "veredicto_texto": VEREDICTOS[veredicto],
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
        "recomendacion": _recomendacion(veredicto, final, componentes, nombres),
    }


def _nivel(valor: float) -> str:
    return "muy armónica" if valor >= 80 else "favorable" if valor >= 60 else "con tensiones"


def _recomendacion(veredicto: str, final: float, comp: dict, nombres: dict) -> str:
    if veredicto == "match":
        partes = [f"Las cartas y el perfil cubren el {final:.0f}% de lo que pide el cargo: "
                  "se recomienda avanzar a entrevista con el líder."]
    elif veredicto == "decision":
        partes = [f"El match es del {final:.0f}%. Queda en decisión del líder: conviene una "
                  "entrevista para validar los puntos de tensión."]
    else:
        partes = [f"El match es del {final:.0f}%, por debajo del 60% mínimo: se descarta para esta vacante."]
    if comp["lider"] is not None:
        partes.append(f"La sinastría con {nombres['lider']} es {_nivel(comp['lider'])} ({comp['lider']:.0f}%).")
    if comp["empresa"] is not None:
        partes.append(f"Con la carta de {nombres['empresa']} es {_nivel(comp['empresa'])} ({comp['empresa']:.0f}%).")
    if comp["conflicto"] is not None:
        partes.append(f"Su forma de manejar conflictos encaja en un {comp['conflicto']:.0f}%.")
    if comp["cv"] is not None:
        partes.append(f"La hoja de vida cubre el {comp['cv']:.0f}% de las habilidades.")
    return " ".join(partes)
