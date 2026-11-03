"""Inicio de sesión con Firebase Authentication (cuentas Google) y qué ve cada usuario.

Firebase solo prueba quién es la persona: el navegador entra con Google y manda su token, que AGATA valida con
las llaves públicas de Google. No hacen falta credenciales de Google Cloud, y basta el plan gratuito (Spark).
Qué puede hacer lo decide la tabla `usuarios`: un administrador gestiona todo y un líder ve los cargos de su
cadena de mando (los suyos y los de quienes le reportan). La sesión es la cookie firmada de Flask
(AGATA_SECRET_KEY). AGATA no guarda contraseñas.
"""
from __future__ import annotations

import os
import re
import time
from collections.abc import Mapping
from datetime import timedelta

DURACION = timedelta(hours=12)   # una jornada de trabajo
INGRESO_RECIENTE = 5 * 60        # la sesión se abre solo con un ingreso a Google de hace menos de 5 minutos
ROLES = ("admin", "lider")
REQUERIDAS = ("FIREBASE_API_KEY", "FIREBASE_PROJECT_ID", "AGATA_SECRET_KEY")
# Modo local sin inicio de sesión (AGATA_SIN_LOGIN=1): quien abre la app es administrador.
USUARIO_LOCAL = {"id": 0, "email": "", "nombre": "Modo local", "rol": "admin", "lider_id": None, "local": True}

_servidor_de_desarrollo = False


class ErrorAcceso(Exception):
    """El inicio de sesión no se pudo completar; el mensaje es para la persona."""


def servidor_de_desarrollo() -> None:
    """Lo llama app.py solo al arrancar con `python app.py`. Detrás de un servidor WSGI (PythonAnywhere) nunca
    se llama, así que allí el modo sin login no existe aunque alguien defina la variable."""
    global _servidor_de_desarrollo
    _servidor_de_desarrollo = True


def sin_login() -> bool:
    return _servidor_de_desarrollo and os.environ.get("AGATA_SIN_LOGIN") == "1"


def faltantes() -> list[str]:
    """Variables que faltan para el inicio de sesión."""
    return [v for v in REQUERIDAS if not os.environ.get(v, "").strip()]


def config_web() -> dict | None:
    """Lo que el navegador necesita para abrir el inicio de sesión de Firebase. No es secreto: la clave web
    de Firebase solo identifica el proyecto."""
    if faltantes():
        return None
    proyecto = os.environ["FIREBASE_PROJECT_ID"].strip()
    return {"apiKey": os.environ["FIREBASE_API_KEY"].strip(), "projectId": proyecto,
            "authDomain": os.environ.get("FIREBASE_AUTH_DOMAIN", "").strip() or f"{proyecto}.firebaseapp.com"}


def admins_fijos() -> set[str]:
    """Correos que siempre son administradores (AGATA_ADMINS, separados por comas). Así entra el primero."""
    return {e.strip().lower() for e in os.environ.get("AGATA_ADMINS", "").split(",") if e.strip()}


def destino_seguro(ruta: str | None) -> str:
    """A dónde volver después de iniciar sesión: solo rutas de AGATA, nunca otro sitio (`//otro.com`)."""
    return ruta if ruta and re.fullmatch(r"/(?![/\\])[^\s]*", ruta) else "/"


def _validar_token(id_token: str) -> dict:
    """Comprueba la firma del token con las llaves públicas de Google, que sea de este proyecto y que no venció."""
    from google.auth import exceptions
    from google.auth.transport.requests import Request
    from google.oauth2 import id_token as tokens
    proyecto = os.environ["FIREBASE_PROJECT_ID"].strip()
    try:
        datos = tokens.verify_firebase_token(id_token, Request(), audience=proyecto)
    except exceptions.TransportError:
        raise ErrorAcceso("No se pudo contactar a Google para validar el inicio de sesión. Inténtalo en un momento.")
    except ValueError:  # firma inválida, otro proyecto o token vencido
        raise ErrorAcceso("El inicio de sesión no es válido o ya venció. Inténtalo de nuevo.")
    if datos.get("iss") != f"https://securetoken.google.com/{proyecto}" or not datos.get("sub"):
        raise ErrorAcceso("El inicio de sesión no es válido. Inténtalo de nuevo.")
    return datos


def _registrar_ingreso(con, email: str, nombre: str | None) -> dict | None:
    """El usuario autorizado con ese correo, o None. Los de AGATA_ADMINS se crean o se promueven solos."""
    fila = con.execute("SELECT * FROM usuarios WHERE email=?", (email,)).fetchone()
    if email in admins_fijos():
        if not fila:
            con.execute("INSERT INTO usuarios (email, nombre, rol) VALUES (?, ?, 'admin')", (email, nombre))
        elif fila["rol"] != "admin":
            con.execute("UPDATE usuarios SET rol='admin' WHERE email=?", (email,))
    elif not fila:
        return None
    # Un líder sin ficha ligada queda ligado a la ficha de líder con su mismo correo, si la hay.
    con.execute("""UPDATE usuarios SET lider_id = (SELECT id FROM lideres WHERE lower(lideres.email) = usuarios.email LIMIT 1)
                   WHERE email=? AND rol='lider' AND lider_id IS NULL""", (email,))
    con.execute("""UPDATE usuarios SET ultimo_ingreso=CURRENT_TIMESTAMP, nombre=COALESCE(NULLIF(nombre, ''), ?)
                   WHERE email=?""", (nombre, email))
    con.commit()
    return dict(con.execute("SELECT * FROM usuarios WHERE email=?", (email,)).fetchone())


def iniciar(con, id_token) -> dict:
    """Valida el token de Google que mandó el navegador y devuelve el usuario autorizado (o ErrorAcceso)."""
    if not isinstance(id_token, str) or not id_token:
        raise ErrorAcceso("Falta el token de inicio de sesión.")
    datos = _validar_token(id_token)
    if time.time() - datos.get("auth_time", 0) > INGRESO_RECIENTE:
        raise ErrorAcceso("Vuelve a iniciar sesión con Google.")
    email = (datos.get("email") or "").lower()
    if not email or not datos.get("email_verified"):
        raise ErrorAcceso("Tu cuenta de Google no tiene un correo verificado.")
    usuario = _registrar_ingreso(con, email, datos.get("name"))
    if not usuario:
        raise ErrorAcceso(f"{email} no tiene acceso a AGATA. Pídeselo a un administrador.")
    return usuario


def datos_de_sesion(usuario: dict) -> dict:
    """Lo que guarda la cookie firmada: quién es y desde cuándo vale su sesión."""
    return {"uid": usuario["id"], "email": usuario["email"], "desde": int(time.time())}


def usuario_actual(con, sesion: Mapping) -> dict | None:
    """El usuario de la sesión, si sigue autorizado; si no, None. Flask ya descartó las cookies vencidas."""
    if sin_login():
        return USUARIO_LOCAL
    if not config_web() or not sesion.get("uid"):
        return None
    fila = con.execute("SELECT * FROM usuarios WHERE id=?", (sesion["uid"],)).fetchone()
    # Si un administrador le quitó el acceso, o si cerró sesión después de abrir esta, ya no vale.
    if not fila or fila["email"] != sesion.get("email") or sesion.get("desde", 0) < fila["sesiones_desde"]:
        return None
    return dict(fila)


def cerrar(con, usuario: dict) -> None:
    """Invalida todas las sesiones abiertas del usuario (en cualquier navegador)."""
    con.execute("UPDATE usuarios SET sesiones_desde=? WHERE id=?", (int(time.time()), usuario["id"]))
    con.commit()


def alcance(con, usuario: dict) -> set[int] | None:
    """Ids de los líderes cuyos cargos ve el usuario: None si ve todos (administrador). Un líder ve los
    suyos y los de toda la cadena que le reporta; sin ficha de líder ligada, ninguno."""
    if usuario["rol"] == "admin":
        return None
    equipo: dict[int | None, list[int]] = {}
    for lid, jefe in con.execute("SELECT id, jefe_id FROM lideres"):
        equipo.setdefault(jefe, []).append(lid)
    visto: set[int] = set()
    pendientes = [usuario["lider_id"]] if usuario["lider_id"] else []
    while pendientes:
        lid = pendientes.pop()
        if lid not in visto:
            visto.add(lid)
            pendientes.extend(equipo.get(lid, []))
    return visto
