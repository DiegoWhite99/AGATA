"""Cálculo de carta astral y compatibilidad astral.

Implementa fórmulas astronómicas de baja precisión (Meeus y elementos
keplerianos aproximados del JPL) sin dependencias externas. La precisión es
de ~1° para Sol, Luna y planetas entre 1800 y 2050: suficiente para saber el
signo de cada astro y el ascendente.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta

SIGNOS = [
    {"nombre": "Aries", "simbolo": "♈\ufe0e", "elemento": "Fuego", "modalidad": "Cardinal",
     "laboral": "Iniciativa, energía para arrancar proyectos y tomar decisiones rápidas."},
    {"nombre": "Tauro", "simbolo": "♉\ufe0e", "elemento": "Tierra", "modalidad": "Fija",
     "laboral": "Constancia, paciencia y foco en resultados tangibles y de calidad."},
    {"nombre": "Géminis", "simbolo": "♊\ufe0e", "elemento": "Aire", "modalidad": "Mutable",
     "laboral": "Comunicación ágil, curiosidad y facilidad para aprender tecnologías nuevas."},
    {"nombre": "Cáncer", "simbolo": "♋\ufe0e", "elemento": "Agua", "modalidad": "Cardinal",
     "laboral": "Cuidado del equipo, memoria del proyecto y fuerte sentido de pertenencia."},
    {"nombre": "Leo", "simbolo": "♌\ufe0e", "elemento": "Fuego", "modalidad": "Fija",
     "laboral": "Liderazgo visible, creatividad y capacidad de motivar a otros."},
    {"nombre": "Virgo", "simbolo": "♍\ufe0e", "elemento": "Tierra", "modalidad": "Mutable",
     "laboral": "Precisión técnica, análisis detallado y mejora continua de procesos."},
    {"nombre": "Libra", "simbolo": "♎\ufe0e", "elemento": "Aire", "modalidad": "Cardinal",
     "laboral": "Diplomacia, trabajo colaborativo y búsqueda de soluciones equilibradas."},
    {"nombre": "Escorpio", "simbolo": "♏\ufe0e", "elemento": "Agua", "modalidad": "Fija",
     "laboral": "Investigación profunda, resiliencia y enfoque en problemas complejos."},
    {"nombre": "Sagitario", "simbolo": "♐\ufe0e", "elemento": "Fuego", "modalidad": "Mutable",
     "laboral": "Visión amplia, optimismo y gusto por los retos y el aprendizaje."},
    {"nombre": "Capricornio", "simbolo": "♑\ufe0e", "elemento": "Tierra", "modalidad": "Cardinal",
     "laboral": "Disciplina, planificación a largo plazo y responsabilidad con metas."},
    {"nombre": "Acuario", "simbolo": "♒\ufe0e", "elemento": "Aire", "modalidad": "Fija",
     "laboral": "Innovación, pensamiento sistémico y apertura a ideas disruptivas."},
    {"nombre": "Piscis", "simbolo": "♓\ufe0e", "elemento": "Agua", "modalidad": "Mutable",
     "laboral": "Intuición, empatía y creatividad para resolver lo no estructurado."},
]

ELEMENTOS = ["Fuego", "Tierra", "Aire", "Agua"]

ELEMENTO_DESC = {
    "Fuego": "Impulso, acción y entusiasmo.",
    "Tierra": "Practicidad, método y constancia.",
    "Aire": "Ideas, comunicación y análisis.",
    "Agua": "Intuición, empatía y cohesión de equipo.",
}

ASTROS = [
    ("sol", "Sol", "☉"), ("luna", "Luna", "☽"), ("mercurio", "Mercurio", "☿"),
    ("venus", "Venus", "♀"), ("marte", "Marte", "♂"), ("jupiter", "Júpiter", "♃"),
    ("saturno", "Saturno", "♄"), ("ascendente", "Ascendente", "AC"),
]

# Peso de cada astro en el reparto de elementos de la carta.
PESO_ELEMENTO = {"sol": 3, "luna": 2, "ascendente": 2, "mercurio": 1.5,
                 "venus": 1, "marte": 1.5, "jupiter": 0.5, "saturno": 0.5}

# Elementos keplerianos aproximados (JPL, válidos 1800-2050), J2000.
# a, e, I, L, long. perihelio, long. nodo  +  tasas por siglo.
_KEPLER = {
    "mercurio": ((0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593),
                 (0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081)),
    "venus": ((0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255),
              (0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418)),
    "tierra": ((1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0),
               (0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0)),
    "marte": ((1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891),
              (0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343)),
    "jupiter": ((5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909),
                (-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106)),
    "saturno": ((9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448),
                (-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794)),
}


def _norm(deg: float) -> float:
    return deg % 360.0


def _sin(deg: float) -> float:
    return math.sin(math.radians(deg))


def _cos(deg: float) -> float:
    return math.cos(math.radians(deg))


def dia_juliano(utc: datetime) -> float:
    y, m = utc.year, utc.month
    d = utc.day + (utc.hour + utc.minute / 60 + utc.second / 3600) / 24
    if m <= 2:
        y -= 1
        m += 12
    a = y // 100
    b = 2 - a + a // 4
    return int(365.25 * (y + 4716)) + int(30.6001 * (m + 1)) + d + b - 1524.5


def longitud_sol(t: float) -> float:
    l0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t
    m = 357.52911 + 35999.05029 * t - 0.0001537 * t * t
    c = ((1.914602 - 0.004817 * t - 0.000014 * t * t) * _sin(m)
         + (0.019993 - 0.000101 * t) * _sin(2 * m) + 0.000289 * _sin(3 * m))
    omega = 125.04 - 1934.136 * t
    return _norm(l0 + c - 0.00569 - 0.00478 * _sin(omega))


def longitud_luna(t: float) -> float:
    lp = 218.3164477 + 481267.88123421 * t
    d = 297.8501921 + 445267.1114034 * t
    m = 357.5291092 + 35999.0502909 * t
    mp = 134.9633964 + 477198.8675055 * t
    f = 93.2720950 + 483202.0175233 * t
    lon = (lp + 6.288774 * _sin(mp) + 1.274027 * _sin(2 * d - mp) + 0.658314 * _sin(2 * d)
           + 0.213618 * _sin(2 * mp) - 0.185116 * _sin(m) - 0.114332 * _sin(2 * f)
           + 0.058793 * _sin(2 * d - 2 * mp) + 0.057066 * _sin(2 * d - m - mp)
           + 0.053322 * _sin(2 * d + mp) + 0.045758 * _sin(2 * d - m)
           - 0.040923 * _sin(m - mp) - 0.034720 * _sin(d) - 0.030383 * _sin(m + mp))
    return _norm(lon)


def _heliocentrica(planeta: str, t: float) -> tuple[float, float, float]:
    base, tasa = _KEPLER[planeta]
    a, e, inc, l, varpi, nodo = (b + r * t for b, r in zip(base, tasa))
    omega = varpi - nodo
    m = math.radians(_norm(l - varpi))
    ex = m + e * math.sin(m)
    for _ in range(12):  # Kepler: E - e·sinE = M
        ex -= (ex - e * math.sin(ex) - m) / (1 - e * math.cos(ex))
    xp = a * (math.cos(ex) - e)
    yp = a * math.sqrt(1 - e * e) * math.sin(ex)
    co, so = _cos(omega), _sin(omega)
    cn, sn = _cos(nodo), _sin(nodo)
    ci, si = _cos(inc), _sin(inc)
    x = (co * cn - so * sn * ci) * xp + (-so * cn - co * sn * ci) * yp
    y = (co * sn + so * cn * ci) * xp + (-so * sn + co * cn * ci) * yp
    z = (so * si) * xp + (co * si) * yp
    return x, y, z


def longitud_planeta(planeta: str, t: float) -> float:
    px, py, _ = _heliocentrica(planeta, t)
    tx, ty, _ = _heliocentrica("tierra", t)
    lon = math.degrees(math.atan2(py - ty, px - tx))
    return _norm(lon + 1.396971 * t)  # precesión J2000 -> equinoccio de la fecha


def ascendente(jd: float, t: float, lat: float, lon: float) -> float:
    gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t
    ramc = _norm(gmst + lon)
    eps = 23.4392911 - 0.0130042 * t
    asc = math.degrees(math.atan2(_cos(ramc), -(_sin(ramc) * _cos(eps)
                                                + math.tan(math.radians(lat)) * _sin(eps))))
    return _norm(asc)


def _posicion(longitud: float) -> dict:
    idx = int(longitud // 30) % 12
    signo = SIGNOS[idx]
    return {
        "longitud": round(longitud, 2),
        "grado": round(longitud % 30, 1),
        "signo": signo["nombre"],
        "simbolo": signo["simbolo"],
        "elemento": signo["elemento"],
        "modalidad": signo["modalidad"],
        "indice": idx,
    }


def calcular_carta(fecha: str, hora: str | None, lat: float, lon: float, utc_offset: float) -> dict:
    """fecha 'YYYY-MM-DD', hora 'HH:MM' (opcional), utc_offset en horas (Bogotá = -5)."""
    hora_conocida = bool(hora)
    local = datetime.strptime(f"{fecha} {hora or '12:00'}", "%Y-%m-%d %H:%M")
    utc = local - timedelta(hours=utc_offset)
    jd = dia_juliano(utc)
    t = (jd - 2451545.0) / 36525.0

    longitudes = {
        "sol": longitud_sol(t),
        "luna": longitud_luna(t),
        **{p: longitud_planeta(p, t) for p in ("mercurio", "venus", "marte", "jupiter", "saturno")},
    }
    if hora_conocida:
        longitudes["ascendente"] = ascendente(jd, t, lat, lon)

    posiciones = {}
    for clave, nombre, glifo in ASTROS:
        if clave in longitudes:
            posiciones[clave] = {"astro": nombre, "glifo": glifo, **_posicion(longitudes[clave])}

    elementos = {e: 0.0 for e in ELEMENTOS}
    modalidades = {"Cardinal": 0.0, "Fija": 0.0, "Mutable": 0.0}
    total = 0.0
    for clave, pos in posiciones.items():
        peso = PESO_ELEMENTO[clave]
        elementos[pos["elemento"]] += peso
        modalidades[pos["modalidad"]] += peso
        total += peso
    elementos = {k: round(v / total * 100, 1) for k, v in elementos.items()}
    modalidades = {k: round(v / total * 100, 1) for k, v in modalidades.items()}
    dominante = max(elementos, key=elementos.get)

    sol = SIGNOS[posiciones["sol"]["indice"]]
    carta = {
        "posiciones": posiciones,
        "elementos": elementos,
        "modalidades": modalidades,
        "elemento_dominante": dominante,
        "hora_conocida": hora_conocida,
        "perfil_laboral": sol["laboral"],
        "resumen": (f"Sol en {sol['nombre']}, Luna en {posiciones['luna']['signo']}"
                    + (f", Ascendente {posiciones['ascendente']['signo']}" if hora_conocida else "")
                    + f". Elemento dominante: {dominante} ({ELEMENTO_DESC[dominante]})"),
    }
    return completar_carta(carta)


# --- Atributos verificables ------------------------------------------------

# Cómo se expresa cada signo (en femenino, para concordar con los temas de abajo).
CUALIDADES = {
    "Aries": "directa, valiente e impulsiva",
    "Tauro": "estable, paciente y práctica",
    "Géminis": "curiosa, versátil y comunicativa",
    "Cáncer": "protectora, intuitiva y leal",
    "Leo": "segura, creativa y generosa",
    "Virgo": "precisa, analítica y servicial",
    "Libra": "diplomática, justa y colaborativa",
    "Escorpio": "intensa, estratégica y perseverante",
    "Sagitario": "optimista, visionaria y libre",
    "Capricornio": "disciplinada, ambiciosa y responsable",
    "Acuario": "innovadora, independiente y original",
    "Piscis": "empática, imaginativa y adaptable",
}

# Área de la vida laboral que rige cada astro.
TEMAS = {
    "sol": ("Identidad", "el propósito"),
    "luna": ("Mundo emocional", "el mundo emocional"),
    "mercurio": ("Comunicación", "la comunicación"),
    "venus": ("Forma de relacionarse", "el trato"),
    "marte": ("Forma de actuar", "el empuje"),
    "jupiter": ("Visión de crecimiento", "la visión"),
    "saturno": ("Disciplina", "la disciplina"),
    "ascendente": ("Presencia", "el estilo"),
}


def atributos(carta: dict) -> list[dict]:
    """Lo que dicta la carta: un rasgo por astro, más los de manejo de conflictos."""
    lista = []
    for clave, (tema, _) in TEMAS.items():
        pos = carta["posiciones"].get(clave)
        if pos:
            lista.append({"clave": clave, "astro": pos["astro"], "glifo": pos["glifo"],
                          "signo": pos["signo"], "simbolo": pos["simbolo"],
                          "elemento": pos["elemento"], "tema": tema,
                          "texto": CUALIDADES[pos["signo"]].capitalize() + "."})
    # Rasgos de manejo de conflictos: Marte (cómo enfrenta) y Luna (qué necesita).
    for clave, astro, tema, texto in (
        ("conflicto", "marte", "Ante el conflicto", lambda sg: ANTE_CONFLICTO[sg]),
        ("necesidad", "luna", "En un desacuerdo necesita",
         lambda sg: NECESIDAD[sg][1][0].upper() + NECESIDAD[sg][1][1:] + "."),
    ):
        pos = carta["posiciones"][astro]
        lista.append({"clave": clave, "astro": pos["astro"], "glifo": pos["glifo"],
                      "signo": pos["signo"], "simbolo": pos["simbolo"],
                      "elemento": pos["elemento"], "tema": tema, "texto": texto(pos["signo"])})
    return lista


# --- Manejo de conflictos (estilos de Thomas-Kilmann) ----------------------------------

MODOS = ["Competir", "Colaborar", "Negociar", "Evitar", "Complacer"]

MODO_DESC = {
    "Competir": "Defiende su posición con firmeza; resuelve rápido, pero puede imponerse.",
    "Colaborar": "Busca soluciones en las que ganen ambas partes y dialoga a fondo.",
    "Negociar": "Cede en algo para llegar a un punto medio práctico.",
    "Evitar": "Pospone o esquiva el conflicto; prefiere enfriar antes de hablar.",
    "Complacer": "Prioriza la relación y cede ante el otro para mantener la armonía.",
}

# Inclinación de cada signo hacia los cinco estilos (Competir, Colaborar, Negociar, Evitar, Complacer).
_ESTILO_SIGNO = {
    "Aries": (3, 1, 0, 0, 0), "Tauro": (2, 1, 1, 2, 1), "Géminis": (1, 1, 3, 1, 0),
    "Cáncer": (0, 1, 1, 2, 2), "Leo": (2, 2, 0, 0, 1), "Virgo": (1, 2, 1, 1, 1),
    "Libra": (0, 1, 3, 1, 2), "Escorpio": (2, 1, 0, 2, 0), "Sagitario": (1, 2, 1, 1, 0),
    "Capricornio": (2, 1, 2, 0, 0), "Acuario": (1, 2, 1, 2, 0), "Piscis": (0, 1, 0, 2, 3),
}

# Qué tanto pesa cada astro en la forma de manejar un conflicto.
_PESO_CONFLICTO = {"marte": 3, "luna": 2.5, "mercurio": 2, "sol": 1.5, "venus": 1.2,
                   "saturno": 1, "ascendente": 1}

ANTE_CONFLICTO = {
    "Aries": "Va de frente y rápido; prefiere resolver ya, aunque a veces sin medir el tono.",
    "Tauro": "Tarda en enojarse, pero cuando se planta cuesta mucho que cambie de posición.",
    "Géminis": "Discute con argumentos e ingenio; cambia de postura si encuentra una idea mejor.",
    "Cáncer": "Se defiende de forma indirecta y protege a su gente antes que a sí mismo.",
    "Leo": "Defiende su posición con orgullo; necesita salir del conflicto con su dignidad intacta.",
    "Virgo": "Ataca el problema, no a la persona: corrige detalles y propone soluciones concretas.",
    "Libra": "Evita la confrontación abierta y media hasta encontrar un punto justo.",
    "Escorpio": "Rara vez muestra el enojo de inmediato; lo procesa a fondo y no olvida fácilmente.",
    "Sagitario": "Es franco y directo, a veces demasiado; se le pasa rápido y no guarda rencor.",
    "Capricornio": "Maneja el conflicto con frialdad y estrategia, apoyándose en reglas y jerarquías.",
    "Acuario": "Toma distancia y lo analiza como un problema del sistema; puede parecer frío.",
    "Piscis": "Tiende a ceder o retirarse para no herir; necesita un espacio seguro para hablar.",
}

# (qué lo detona, qué necesita para resolver), según la Luna.
NECESIDAD = {
    "Aries": ("sentirse frenado o ignorado", "acción inmediata y que se reconozca su punto"),
    "Tauro": ("los cambios bruscos y la presión de tiempo", "calma, tiempo y seguridad"),
    "Géminis": ("la falta de información y las conversaciones cortadas", "hablarlo y entender todas las versiones"),
    "Cáncer": ("las críticas personales y sentir que no se cuida al equipo", "contención y confianza"),
    "Leo": ("sentirse expuesto o no reconocido", "reconocimiento y respeto, sobre todo en público"),
    "Virgo": ("el desorden, la improvisación y los errores repetidos", "un plan claro y criterios objetivos"),
    "Libra": ("la injusticia y los ambientes tensos", "cortesía, equilibrio y acuerdos justos"),
    "Escorpio": ("la falta de transparencia y sentirse traicionado", "honestidad total y tiempo para procesar"),
    "Sagitario": ("el control excesivo y la rigidez", "libertad, perspectiva y sentido del humor"),
    "Capricornio": ("la irresponsabilidad y los incumplimientos", "estructura, compromisos claros y resultados"),
    "Acuario": ("las imposiciones sin argumentos y el drama emocional", "espacio, lógica y autonomía"),
    "Piscis": ("la dureza, los gritos y la presión", "empatía, suavidad y comprensión"),
}

# Consejo para quien trata con alguien de cada estilo dominante.
_CONSEJO_ESTILO = {
    "Competir": "da argumentos concretos y límites claros, y evita las confrontaciones en público",
    "Colaborar": "construyan la solución en conjunto y reconoce su participación",
    "Negociar": "propón opciones concretas, deja que elija y acuerden plazos",
    "Evitar": "abre el tema en privado y con tiempo, y pide su opinión de forma directa",
    "Complacer": "verifica que su «sí» sea real y da seguridad para decir que no",
}

# Compatibilidad entre estilos (simétrica).
_COMPAT_ESTILO = {
    ("Colaborar", "Colaborar"): 1.0, ("Colaborar", "Negociar"): 0.85, ("Colaborar", "Competir"): 0.6,
    ("Colaborar", "Complacer"): 0.7, ("Colaborar", "Evitar"): 0.5, ("Negociar", "Negociar"): 0.85,
    ("Negociar", "Competir"): 0.55, ("Negociar", "Complacer"): 0.7, ("Negociar", "Evitar"): 0.5,
    ("Competir", "Competir"): 0.2, ("Competir", "Complacer"): 0.45, ("Competir", "Evitar"): 0.35,
    ("Complacer", "Complacer"): 0.6, ("Complacer", "Evitar"): 0.4, ("Evitar", "Evitar"): 0.25,
}

# Riesgo según la combinación de estilos dominantes.
_RIESGO_PAR = {
    frozenset(["Competir"]): "Choques frontales: ambos querrán ganar la discusión. Conviene acordar reglas "
                             "para discrepar y, si hace falta, un tercero que medie.",
    frozenset(["Competir", "Complacer"]): "Uno puede imponerse y el otro callar. Hay que abrir espacio explícito "
                                          "para el desacuerdo.",
    frozenset(["Competir", "Evitar"]): "Uno presiona y el otro se retira. Conviene bajar el ritmo y dar tiempo "
                                       "antes de decidir.",
    frozenset(["Competir", "Negociar"]): "Uno cede y el otro gana: hay que vigilar que los acuerdos sean justos.",
    frozenset(["Evitar"]): "Los conflictos pueden quedarse sin hablar y acumularse. Agenden conversaciones "
                           "periódicas.",
    frozenset(["Evitar", "Complacer"]): "Ambos esquivan la tensión: los problemas pueden quedar ocultos.",
    frozenset(["Complacer"]): "Mucha armonía aparente, con el riesgo de no decir lo importante.",
    frozenset(["Negociar"]): "Llegan a acuerdos rápidos, aunque a veces superficiales.",
    frozenset(["Negociar", "Evitar"]): "Se resuelve lo urgente, pero lo de fondo puede postergarse.",
    frozenset(["Negociar", "Complacer"]): "Acuerdos amables; conviene revisar que nadie ceda de más.",
}

_PLANETAS_CONFLICTO = ("marte", "mercurio", "luna", "sol", "saturno")


def perfil_conflicto(carta: dict) -> dict:
    """Estilo de manejo de conflictos según la carta (modelo de Thomas-Kilmann)."""
    crudo = [0.0] * 5
    peso_total = 0.0
    for clave, peso in _PESO_CONFLICTO.items():
        pos = carta["posiciones"].get(clave)
        if pos:
            for i, v in enumerate(_ESTILO_SIGNO[pos["signo"]]):
                crudo[i] += v * peso
            peso_total += peso
    total = sum(crudo) or 1
    modos = {m: round(crudo[i] / total * 100, 1) for i, m in enumerate(MODOS)}
    orden = sorted(MODOS, key=lambda m: -modos[m])
    marte, luna = carta["posiciones"]["marte"]["signo"], carta["posiciones"]["luna"]["signo"]
    return {
        "modos": modos,
        "dominante": orden[0],
        "secundario": orden[1],
        "ante_conflicto": ANTE_CONFLICTO[marte],
        "detonante": NECESIDAD[luna][0],
        "necesita": NECESIDAD[luna][1],
        "resumen": f"Tiende a {orden[0].lower()} y, en segundo lugar, a {orden[1].lower()}. "
                   f"{MODO_DESC[orden[0]]}",
    }


def dinamica_conflicto(carta_a: dict, carta_b: dict, nombre_a: str, nombre_b: str) -> dict:
    """Cómo manejarían A (postulante) y B (líder o empresa) un desacuerdo."""
    pa, pb = carta_a["conflicto"], carta_b["conflicto"]
    da = [pa["modos"][m] / 100 for m in MODOS]
    db = [pb["modos"][m] / 100 for m in MODOS]
    compat = sum(da[i] * db[j] * (_COMPAT_ESTILO.get((MODOS[i], MODOS[j]))
                                   or _COMPAT_ESTILO[(MODOS[j], MODOS[i])])
                 for i in range(5) for j in range(5))
    estilos = max(0.0, min(100.0, (compat - 0.45) / 0.3 * 100))

    fricciones, puentes = [], []
    arm = ten = 0.0
    for a in _PLANETAS_CONFLICTO:
        for b in _PLANETAS_CONFLICTO:
            pos_a, pos_b = carta_a["posiciones"][a], carta_b["posiciones"][b]
            asp = _aspecto_entre(pos_a["longitud"], pos_b["longitud"], solar=False)
            if not asp:
                continue
            if asp["aspecto"] == "Conjunción" and {a, b} & {"marte", "saturno"}:
                asp["naturaleza"] = -0.3
            valor = asp["naturaleza"] * asp["fuerza"] * (1.5 if "marte" in (a, b) else 1)
            item = {"glifo_a": pos_a["glifo"], "glifo_b": pos_b["glifo"], "glifo": asp["glifo"],
                    "aspecto": asp["aspecto"], "astro_a": pos_a["astro"], "astro_b": pos_b["astro"],
                    "lectura": _lectura(a, nombre_a, asp["verbo"], b, nombre_b), "peso": abs(valor)}
            if valor >= 0:
                arm += valor
                puentes.append(item)
            else:
                ten += -valor
                fricciones.append(item)
    aspectos = 100 * (arm + 1.5) / (arm + ten + 3)
    crudo = 0.55 * estilos + 0.45 * aspectos
    # Calibración: dos cartas al azar dan ~44 ± 7 en crudo; se lleva a ~65 ± 13.
    puntaje = max(0.0, min(100.0, 65 + (crudo - 44.4) * 1.85))
    par = frozenset([pa["dominante"], pb["dominante"]])
    if "Colaborar" in par:
        riesgo = ("Buena base para resolver: al menos uno busca soluciones de fondo. "
                  + ("El reto es no alargar las discusiones." if len(par) == 1 else
                     f"Que el estilo de {pa['dominante'].lower() if pa['dominante'] != 'Colaborar' else pb['dominante'].lower()} "
                     "no frene el diálogo."))
    else:
        riesgo = _RIESGO_PAR.get(par, "Estilos distintos que pueden complementarse con acuerdos claros.")
    fricciones.sort(key=lambda x: -x["peso"])
    puentes.sort(key=lambda x: -x["peso"])
    return {
        "puntaje": round(puntaje, 1),
        "estilos": round(estilos, 1),
        "aspectos": round(aspectos, 1),
        "riesgo": riesgo,
        "fricciones": fricciones[:3],
        "puentes": puentes[:3],
        "consejo_para_b": (f"Con {nombre_a}, {_CONSEJO_ESTILO[pa['dominante']]}. "
                           f"En un desacuerdo necesita {pa['necesita']}."),
        "consejo_para_a": (f"Con {nombre_b}, {_CONSEJO_ESTILO[pb['dominante']]}. "
                           f"En un desacuerdo necesita {pb['necesita']}."),
    }


VERSION_CARTA = 4


def completar_carta(carta: dict) -> dict:
    """Agrega (o recalcula) lo que se deriva de las posiciones: atributos y perfil de conflicto."""
    carta["conflicto"] = perfil_conflicto(carta)
    carta["atributos"] = atributos(carta)
    carta["version"] = VERSION_CARTA
    return carta


# --- Sinastría: aspectos reales entre dos cartas --------------------------------

# nombre, ángulo, orbe, naturaleza (+ armonía / − tensión), glifo, verbo para la lectura
_ASPECTOS = [
    ("Conjunción", 0, 8, 0.8, "☌", "se funde con"),
    ("Sextil", 60, 5, 0.75, "⚹", "encuentra oportunidades con"),
    ("Cuadratura", 90, 7, -0.8, "□", "genera fricción con"),
    ("Trígono", 120, 7, 1.0, "△", "fluye en armonía con"),
    ("Quincuncio", 150, 3, -0.35, "⚻", "necesita ajustes con"),
    ("Oposición", 180, 8, -0.5, "☍", "se polariza frente a"),
]

# Importancia de cada astro en una relación de trabajo.
_PESO_SINASTRIA = {"sol": 3, "luna": 2.5, "ascendente": 2, "mercurio": 2.5, "venus": 1.5,
                   "marte": 2, "jupiter": 1.2, "saturno": 2}

# Afinidad entre elementos: iguales o complementarios (fuego-aire, tierra-agua) armonizan.
_AFINIDAD_ELEMENTO = {
    ("Fuego", "Fuego"): 1, ("Tierra", "Tierra"): 1, ("Aire", "Aire"): 1, ("Agua", "Agua"): 1,
    ("Fuego", "Aire"): 0.85, ("Tierra", "Agua"): 0.85,
}


def _afinidad_elemental(a: dict, b: dict) -> float:
    total = 0.0
    for ea, pa in a.items():
        for eb, pb in b.items():
            afin = _AFINIDAD_ELEMENTO.get((ea, eb)) or _AFINIDAD_ELEMENTO.get((eb, ea)) or 0.3
            total += pa / 100 * pb / 100 * afin
    # Dos cartas al azar rondan 0.6; se reescala para que el rango útil vaya de 0 a 100.
    return max(0.0, min(100.0, (total - 0.3) / 0.55 * 100))


def _aspecto_entre(lon_a: float, lon_b: float, solar: bool) -> dict | None:
    dist = abs(lon_a - lon_b) % 360
    dist = min(dist, 360 - dist)
    for nombre, angulo, orbe, naturaleza, glifo, verbo in _ASPECTOS:
        orbe_real = orbe + (2 if solar and angulo in (0, 120, 180) else 0)
        diff = abs(dist - angulo)
        if diff <= orbe_real:
            if angulo == 0 and not solar and naturaleza > 0:
                naturaleza = 0.5
            return {"aspecto": nombre, "glifo": glifo, "verbo": verbo, "orbe": round(diff, 1),
                    "fuerza": 1 - diff / orbe_real, "naturaleza": naturaleza}
    return None


def _lectura(clave_a: str, nombre_a: str, verbo: str, clave_b: str, nombre_b: str) -> str:
    tema_a, tema_b = TEMAS[clave_a][1], TEMAS[clave_b][1]
    frase = f"{tema_a[0].upper()}{tema_a[1:]} de {nombre_a} {verbo} {tema_b} de {nombre_b}."
    return frase.replace(" a el ", " al ").replace(" de el ", " del ")


def sinastria(carta_a: dict, carta_b: dict, nombre_a: str, nombre_b: str) -> dict:
    """Compara la carta A (postulante) con la B (líder o empresa)."""
    pa, pb = carta_a["posiciones"], carta_b["posiciones"]
    armonia = tension = 0.0
    por_astro = {}
    aspectos = []
    rejilla: dict[str, dict[str, dict]] = {}
    for a, pos_a in pa.items():
        arm_a = ten_a = 0.0
        rejilla[a] = {}
        for b, pos_b in pb.items():
            asp = _aspecto_entre(pos_a["longitud"], pos_b["longitud"],
                                 solar=a in ("sol", "luna") or b in ("sol", "luna"))
            if not asp:
                continue
            # Marte y Saturno vuelven tensa incluso una conjunción.
            if asp["aspecto"] == "Conjunción" and {a, b} & {"marte", "saturno"}:
                asp["naturaleza"] = -0.3
            valor = asp["naturaleza"] * asp["fuerza"] * _PESO_SINASTRIA[a] * _PESO_SINASTRIA[b] / 4
            if valor >= 0:
                armonia += valor
                arm_a += valor
            else:
                tension += -valor
                ten_a += -valor
            rejilla[a][b] = {"glifo": asp["glifo"], "aspecto": asp["aspecto"],
                             "armonico": asp["naturaleza"] >= 0, "orbe": asp["orbe"]}
            aspectos.append({
                "a": a, "b": b, "astro_a": pos_a["astro"], "astro_b": pos_b["astro"],
                "glifo_a": pos_a["glifo"], "glifo_b": pos_b["glifo"],
                "signo_a": pos_a["signo"], "signo_b": pos_b["signo"],
                "aspecto": asp["aspecto"], "glifo": asp["glifo"], "orbe": asp["orbe"],
                "armonico": asp["naturaleza"] >= 0, "peso": round(abs(valor), 3),
                "lectura": _lectura(a, nombre_a, asp["verbo"], b, nombre_b),
            })
        por_astro[a] = round(100 * (arm_a + 0.6) / (arm_a + ten_a + 1.2), 1)

    k = 2.5  # suaviza: pocas coincidencias no llevan el puntaje a los extremos
    aspectos_pct = 100 * (armonia + k) / (armonia + tension + 2 * k)
    elemental = _afinidad_elemental(carta_a["elementos"], carta_b["elementos"])
    crudo = 0.75 * aspectos_pct + 0.25 * elemental
    # Calibración: dos cartas al azar dan ~56 ± 8 en crudo; se lleva a ~65 ± 13 para que el
    # puntaje use todo el rango y separe de verdad las sinastrías flojas de las fuertes.
    puntaje = max(0.0, min(100.0, 65 + (crudo - 56) * 1.7))
    aspectos.sort(key=lambda x: -x["peso"])
    return {
        "puntaje": round(puntaje, 1),
        "aspectos_pct": round(aspectos_pct, 1),
        "elemental": round(elemental, 1),
        "armonicos": sum(1 for x in aspectos if x["armonico"]),
        "tensos": sum(1 for x in aspectos if not x["armonico"]),
        "por_astro": por_astro,
        "aspectos": aspectos[:12],
        "rejilla": rejilla,
    }


def afinidad_elemento(carta: dict, elemento: str | None) -> float | None:
    """Qué tanto está presente en la carta el elemento afín al cargo."""
    if elemento not in ELEMENTOS:
        return None
    return round(min(100.0, 40 + carta["elementos"][elemento] * 1.5), 1)
