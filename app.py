"""AGATA: API y páginas (Flask)."""
from __future__ import annotations

import csv
import io
import json
import re
import uuid
from pathlib import Path

from flask import Flask, Response, abort, jsonify, render_template, request, send_from_directory
from werkzeug.utils import secure_filename

import astro
import evaluador
import oraculo
import perfil_cargo
import perfiles
from ciudades import CIUDADES
from db import close_db, connect, get_db, init_db, row_to_dict, rows_to_list

BASE = Path(__file__).parent
UPLOADS = BASE / "uploads"
oraculo.cargar_env(BASE / ".env")
EXT_CV = {".pdf", ".docx", ".txt"}

MIN_DESC_LIDER = 300
MIN_ESTILO_LIDER = 100
MIN_EXPECTATIVAS_LIDER = 100
MIN_DESC_VACANTE = 150

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024
app.teardown_appcontext(close_db)


class ErrorValidacion(Exception):
    def __init__(self, errores: dict[str, str]):
        super().__init__("validación")
        self.errores = errores


@app.errorhandler(ErrorValidacion)
def _error_validacion(err: ErrorValidacion):
    return jsonify({"error": "Revisa los campos marcados.", "campos": err.errores}), 400


@app.errorhandler(413)
def _muy_grande(_err):
    return jsonify({"error": "El archivo supera el máximo de 5 MB."}), 413


def _texto(data: dict, campo: str) -> str:
    return str(data.get(campo) or "").strip()


def _entero(valor, defecto: int, minimo: int, maximo: int) -> int:
    try:
        return min(maximo, max(minimo, int(valor)))
    except (TypeError, ValueError):
        return defecto


def _archivo_cv(campo: str = "cv"):
    """Devuelve el archivo subido si tiene una extensión válida, o None si no se subió nada."""
    archivo = request.files.get(campo)
    if not archivo or not archivo.filename:
        return None
    if Path(archivo.filename).suffix.lower() not in EXT_CV:
        raise ErrorValidacion({campo: "La hoja de vida debe ser PDF, DOCX o TXT."})
    return archivo


def _guardar_cv(archivo) -> tuple[str, str]:
    """Guarda la hoja de vida en uploads/ y devuelve (nombre de archivo, texto extraído)."""
    UPLOADS.mkdir(exist_ok=True)
    ext = Path(archivo.filename).suffix.lower()
    nombre = f"{uuid.uuid4().hex[:10]}_{secure_filename(archivo.filename) or 'cv' + ext}"
    ruta = UPLOADS / nombre
    archivo.save(ruta)
    try:
        return nombre, evaluador.extraer_texto_cv(ruta)
    except Exception:  # PDF dañado o protegido
        ruta.unlink(missing_ok=True)
        raise ErrorValidacion({"cv": "No se pudo leer el archivo. Prueba con otro PDF o un DOCX."})


def _enviar_cv(archivo: str | None):
    if not archivo or not (UPLOADS / archivo).exists():
        abort(404)
    return send_from_directory(UPLOADS, archivo, as_attachment=True)


def _datos_natales(data: dict, obligatorio: bool, errores: dict) -> dict | None:
    fecha = _texto(data, "fecha_nac")
    if not fecha:
        if obligatorio:
            errores["fecha_nac"] = "La fecha es obligatoria para calcular la carta astral."
        return None
    hora = _texto(data, "hora_nac") or None
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", fecha):
        errores["fecha_nac"] = "Fecha inválida."
        return None
    if hora and not re.fullmatch(r"\d{2}:\d{2}", hora):
        errores["hora_nac"] = "Hora inválida (HH:MM)."
        return None
    try:
        lat, lon, utc = float(data.get("lat")), float(data.get("lon")), float(data.get("utc"))
    except (TypeError, ValueError):
        errores["ciudad"] = "Selecciona la ciudad o ingresa sus coordenadas."
        return None
    if not (-66 <= lat <= 66 and -180 <= lon <= 180 and -12 <= utc <= 14):
        errores["ciudad"] = "Coordenadas fuera de rango (latitud entre -66 y 66)."
        return None
    return {"fecha_nac": fecha, "hora_nac": hora, "ciudad": _texto(data, "ciudad"),
            "lat": lat, "lon": lon, "utc": utc,
            "carta": astro.calcular_carta(fecha, hora, lat, lon, utc)}


def _empresa(con) -> dict | None:
    return row_to_dict(con.execute("SELECT * FROM empresa WHERE id=1").fetchone())


# --- Páginas ---------------------------------------------------------------

@app.get("/")
def pagina_panel():
    return render_template("panel.html", pagina="panel")


@app.get("/lideres")
def pagina_lideres():
    return render_template("lideres.html", pagina="lideres", min_desc=MIN_DESC_LIDER,
                           min_estilo=MIN_ESTILO_LIDER, min_expect=MIN_EXPECTATIVAS_LIDER)


@app.get("/empresa")
def pagina_empresa():
    return render_template("empresa.html", pagina="empresa")


@app.get("/perfiles")
def pagina_perfiles():
    return render_template("perfiles.html", pagina="perfiles")


@app.get("/vacantes")
def pagina_vacantes():
    return render_template("vacantes.html", pagina="vacantes", min_desc=MIN_DESC_VACANTE)


@app.get("/vacantes/<int:vid>")
def pagina_vacante(vid: int):
    return render_template("vacante.html", pagina="vacantes", vacante_id=vid)


@app.get("/postular/<int:vid>")
def pagina_postular(vid: int):
    return render_template("postular.html", pagina="vacantes", vacante_id=vid)


@app.get("/candidatos/<int:cid>")
def pagina_informe(cid: int):
    return render_template("informe.html", pagina="vacantes", candidato_id=cid)


# --- API: catálogos y panel --------------------------------------------------

@app.get("/api/ciudades")
def api_ciudades():
    return jsonify(CIUDADES)


@app.get("/api/panel")
def api_panel():
    con = get_db()
    conteo = {r["decision_lider"]: r["n"] for r in con.execute(
        "SELECT decision_lider, COUNT(*) n FROM candidatos GROUP BY decision_lider")}
    recientes = con.execute("""
        SELECT c.id, c.nombre, c.puntaje, c.decision_lider, c.creado,
               v.cargo, v.id AS vacante_id
        FROM candidatos c JOIN vacantes v ON v.id = c.vacante_id
        ORDER BY c.id DESC LIMIT 8""").fetchall()
    return jsonify({
        "vacantes_abiertas": con.execute(
            "SELECT COUNT(*) FROM vacantes WHERE estado='abierta'").fetchone()[0],
        "lideres": con.execute("SELECT COUNT(*) FROM lideres").fetchone()[0],
        "candidatos": sum(conteo.values()),
        "pendientes": conteo.get(None, 0),
        "aprobados": conteo.get("aprobado", 0),
        "rechazados": conteo.get("rechazado", 0),
        "recientes": rows_to_list(recientes),
        "vacantes": _lista_vacantes(con, solo_abiertas=True),
        "empresa": _empresa(con),
        "ia": {"activa": oraculo.activo(), "modelo": oraculo.modelo()},
    })


@app.post("/api/carta")
def api_carta():
    """Calcula una carta sin guardarla, para mostrarle al postulante lo que dicta antes de enviar."""
    errores: dict[str, str] = {}
    natales = _datos_natales(request.get_json(force=True) or {}, obligatorio=True, errores=errores)
    if errores:
        raise ErrorValidacion(errores)
    return jsonify(natales["carta"])


# --- API: empresa --------------------------------------------------------------

@app.get("/api/empresa")
def api_empresa():
    return jsonify(_empresa(get_db()))


@app.put("/api/empresa")
def api_guardar_empresa():
    data = request.get_json(force=True) or {}
    errores: dict[str, str] = {}
    empresa = {c: _texto(data, c) for c in ("nombre", "sector", "mision", "valores", "cultura")}
    if not empresa["nombre"]:
        errores["nombre"] = "Escribe el nombre de la empresa."
    natales = _datos_natales(data, obligatorio=True, errores=errores)
    if errores:
        raise ErrorValidacion(errores)
    empresa.update(natales)
    empresa["carta"] = json.dumps(empresa["carta"], ensure_ascii=False)
    con = get_db()
    cols = ", ".join(empresa)
    con.execute(f"INSERT INTO empresa (id, {cols}, actualizado) VALUES (1, {', '.join('?' * len(empresa))}, "
                f"CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET "
                + ", ".join(f"{c}=excluded.{c}" for c in empresa) + ", actualizado=CURRENT_TIMESTAMP",
                tuple(empresa.values()))
    con.commit()
    for (vid,) in con.execute("SELECT id FROM vacantes").fetchall():
        _reevaluar_vacante(con, vid)
    return jsonify(_empresa(con))


@app.get("/api/empresa/lideres")
def api_empresa_lideres():
    """Sinastría de cada líder con la carta de la empresa."""
    con = get_db()
    empresa = _empresa(con)
    if not empresa or not empresa["carta"]:
        return jsonify([])
    salida = []
    for lider in rows_to_list(con.execute("SELECT id, nombre, cargo, carta FROM lideres WHERE carta IS NOT NULL")):
        sin = astro.sinastria(lider["carta"], empresa["carta"], lider["nombre"].split()[0].title(),
                              empresa["nombre"])
        salida.append({"id": lider["id"], "nombre": lider["nombre"], "cargo": lider["cargo"],
                       "puntaje": sin["puntaje"], "armonicos": sin["armonicos"], "tensos": sin["tensos"],
                       "aspecto": sin["aspectos"][0]["lectura"] if sin["aspectos"] else None})
    return jsonify(sorted(salida, key=lambda x: -x["puntaje"]))


# --- API: líderes ------------------------------------------------------------

def _validar_lider(data: dict) -> dict:
    errores: dict[str, str] = {}
    lider = {c: _texto(data, c) for c in
             ("nombre", "cargo", "area", "email", "descripcion", "estilo_liderazgo",
              "expectativas", "equipo")}
    for campo in ("nombre", "cargo", "area"):
        if not lider[campo]:
            errores[campo] = "Campo obligatorio."
    for campo, minimo in (("descripcion", MIN_DESC_LIDER), ("estilo_liderazgo", MIN_ESTILO_LIDER),
                          ("expectativas", MIN_EXPECTATIVAS_LIDER)):
        if len(lider[campo]) < minimo:
            errores[campo] = (f"Se necesita una descripción detallada: mínimo {minimo} caracteres "
                              f"(llevas {len(lider[campo])}).")
    natales = _datos_natales(data, obligatorio=False, errores=errores)
    if errores:
        raise ErrorValidacion(errores)
    lider.update(natales or {"fecha_nac": None, "hora_nac": None, "ciudad": None,
                             "lat": None, "lon": None, "utc": None, "carta": None})
    lider["carta"] = json.dumps(lider["carta"], ensure_ascii=False) if lider["carta"] else None
    return lider


def _lider_publico(lider: dict | None) -> dict | None:
    """El texto completo del CV no viaja al navegador: solo el archivo para descargarlo."""
    if lider:
        lider.pop("cv_texto", None)
    return lider


@app.get("/api/lideres")
def api_lideres():
    rows = get_db().execute("""
        SELECT l.*, (SELECT COUNT(*) FROM vacantes v WHERE v.lider_id = l.id) AS vacantes
        FROM lideres l ORDER BY l.nombre""").fetchall()
    return jsonify([_lider_publico(l) for l in rows_to_list(rows)])


@app.get("/api/lideres/<int:lid>")
def api_lider(lid: int):
    lider = row_to_dict(get_db().execute("SELECT * FROM lideres WHERE id=?", (lid,)).fetchone())
    if not lider:
        abort(404)
    return jsonify(_lider_publico(lider))


@app.get("/api/lideres/<int:lid>/cv")
def api_cv_lider(lid: int):
    fila = get_db().execute("SELECT cv_archivo FROM lideres WHERE id=?", (lid,)).fetchone()
    return _enviar_cv(fila["cv_archivo"] if fila else None)


@app.post("/api/lideres")
def api_crear_lider():
    lider = _validar_lider(request.form)
    archivo = _archivo_cv()
    if archivo:
        lider["cv_archivo"], lider["cv_texto"] = _guardar_cv(archivo)
    con = get_db()
    cols = ", ".join(lider)
    cur = con.execute(f"INSERT INTO lideres ({cols}) VALUES ({', '.join('?' * len(lider))})",
                      tuple(lider.values()))
    con.commit()
    return jsonify({"id": cur.lastrowid}), 201


@app.put("/api/lideres/<int:lid>")
def api_editar_lider(lid: int):
    con = get_db()
    anterior = con.execute("SELECT cv_archivo FROM lideres WHERE id=?", (lid,)).fetchone()
    if not anterior:
        abort(404)
    lider = _validar_lider(request.form)
    archivo = _archivo_cv()
    if archivo:  # si no sube una nueva hoja de vida, se conserva la anterior
        lider["cv_archivo"], lider["cv_texto"] = _guardar_cv(archivo)
        if anterior["cv_archivo"]:
            (UPLOADS / anterior["cv_archivo"]).unlink(missing_ok=True)
    sets = ", ".join(f"{c}=?" for c in lider)
    con.execute(f"UPDATE lideres SET {sets} WHERE id=?", (*lider.values(), lid))
    con.commit()
    for (vid,) in con.execute("SELECT id FROM vacantes WHERE lider_id=?", (lid,)).fetchall():
        _reevaluar_vacante(con, vid)
    return jsonify({"id": lid})


@app.delete("/api/lideres/<int:lid>")
def api_borrar_lider(lid: int):
    con = get_db()
    if con.execute("SELECT 1 FROM vacantes WHERE lider_id=?", (lid,)).fetchone():
        return jsonify({"error": "El líder tiene vacantes asignadas. Reasígnalas primero."}), 409
    fila = con.execute("SELECT cv_archivo FROM lideres WHERE id=?", (lid,)).fetchone()
    if fila and fila["cv_archivo"]:
        (UPLOADS / fila["cv_archivo"]).unlink(missing_ok=True)
    con.execute("DELETE FROM lideres WHERE id=?", (lid,))
    con.commit()
    return "", 204


# --- API: vacantes -----------------------------------------------------------

def _lista_vacantes(con, solo_abiertas: bool = False) -> list[dict]:
    filtro = "WHERE v.estado='abierta'" if solo_abiertas else ""
    rows = con.execute(f"""
        SELECT v.*, l.nombre AS lider_nombre, l.cargo AS lider_cargo,
               COUNT(c.id) AS candidatos,
               SUM(c.id IS NOT NULL AND c.decision_lider IS NULL) AS n_pendientes,
               SUM(c.decision_lider='aprobado') AS n_aprobados,
               SUM(c.decision_lider='rechazado') AS n_rechazados,
               (SELECT COUNT(*) FROM habilidades h WHERE h.vacante_id = v.id) AS n_habilidades
        FROM vacantes v JOIN lideres l ON l.id = v.lider_id
        LEFT JOIN candidatos c ON c.vacante_id = v.id
        {filtro} GROUP BY v.id ORDER BY v.id DESC""").fetchall()
    return rows_to_list(rows)


PESOS = ("peso_lider", "peso_empresa", "peso_elemento", "peso_conflicto", "peso_cv", "peso_ia")


def _validar_vacante(data: dict, requerir_perfil: bool = True) -> tuple[dict, list[dict]]:
    errores: dict[str, str] = {}
    vac = {c: _texto(data, c) for c in ("cargo", "area", "descripcion", "elemento_afin")}
    pid = _texto(data, "perfil_id")
    perfil = perfiles.obtener(get_db(), pid, _texto(data, "perfil_archivo")) if pid else None
    if pid and not perfil:
        errores["perfil_id"] = "Ese perfil ya no está en Perfiles. Elige otro."
    elif not pid and requerir_perfil:
        errores["perfil_id"] = "Liga el cargo a su perfil (sección Perfiles)."
    vac["perfil_id"] = perfil["id"] if perfil else None
    vac["perfil_archivo"] = perfil["archivo"] if perfil else None
    for campo in ("cargo", "area"):
        if not vac[campo]:
            errores[campo] = "Campo obligatorio."
    if len(vac["descripcion"]) < MIN_DESC_VACANTE:
        errores["descripcion"] = (f"Describe el cargo con al menos {MIN_DESC_VACANTE} caracteres "
                                  f"(llevas {len(vac['descripcion'])}).")
    if vac["elemento_afin"] not in astro.ELEMENTOS:
        vac["elemento_afin"] = None
    try:
        vac["lider_id"] = int(data.get("lider_id"))
        if not get_db().execute("SELECT 1 FROM lideres WHERE id=?", (vac["lider_id"],)).fetchone():
            raise ValueError
    except (TypeError, ValueError):
        errores["lider_id"] = "Selecciona el líder o jefe del cargo."
    try:
        for campo in PESOS:
            vac[campo] = max(0.0, float(data.get(campo, 0)))
        if sum(vac[c] for c in PESOS) <= 0:
            raise ValueError
    except (TypeError, ValueError):
        errores["pesos"] = "Los pesos deben ser números y sumar más de 0."

    habilidades = []
    for h in data.get("habilidades") or []:
        nombre = _texto(h, "nombre")
        if nombre:
            habilidades.append({
                "nombre": nombre,
                "peso": _entero(h.get("peso"), 3, 1, 5),
                "nivel": _entero(h.get("nivel"), 3, 1, 5),
                "palabras_clave": _texto(h, "palabras_clave"),
            })
    if len(habilidades) < 3:
        errores["habilidades"] = "Define al menos 3 habilidades para construir la matriz."
    if len({h["nombre"] for h in habilidades}) != len(habilidades):
        errores["habilidades"] = "Hay habilidades repetidas."

    if errores:
        raise ErrorValidacion(errores)
    return vac, habilidades


def _guardar_habilidades(con, vid: int, habilidades: list[dict]):
    con.execute("DELETE FROM habilidades WHERE vacante_id=?", (vid,))
    con.executemany(
        "INSERT INTO habilidades (vacante_id, nombre, peso, nivel, palabras_clave) VALUES (?,?,?,?,?)",
        [(vid, h["nombre"], h["peso"], h["nivel"], h["palabras_clave"]) for h in habilidades])


def _vacante_completa(con, vid: int) -> dict | None:
    vac = row_to_dict(con.execute("""
        SELECT v.*, l.nombre AS lider_nombre, l.cargo AS lider_cargo, l.area AS lider_area
        FROM vacantes v JOIN lideres l ON l.id = v.lider_id WHERE v.id=?""", (vid,)).fetchone())
    if not vac:
        return None
    vac["habilidades"] = rows_to_list(con.execute(
        "SELECT * FROM habilidades WHERE vacante_id=? ORDER BY id", (vid,)))
    return vac


@app.get("/api/vacantes")
def api_vacantes():
    con = get_db()
    lista = _lista_vacantes(con)
    titulos = {p["id"]: p["titulo"] for p in perfiles.catalogo(con)}
    for v in lista:
        v["perfil_titulo"] = titulos.get(v["perfil_id"])
    return jsonify(lista)


@app.get("/api/vacantes/<int:vid>")
def api_vacante(vid: int):
    con = get_db()
    vac = _vacante_completa(con, vid)
    if not vac:
        abort(404)
    vac["lider"] = _lider_publico(row_to_dict(con.execute("SELECT * FROM lideres WHERE id=?",
                                                          (vac["lider_id"],)).fetchone()))
    vac["candidatos"] = rows_to_list(con.execute("""
        SELECT id, nombre, email, puntaje, decision_lider, creado,
               json_extract(resultado, '$.lecturas') AS lecturas,
               json_extract(resultado, '$.destaca') AS destaca,
               json_extract(carta, '$.posiciones.sol.signo') AS signo_sol
        FROM candidatos WHERE vacante_id=? ORDER BY puntaje DESC""", (vid,)))
    for c in vac["candidatos"]:
        for col in ("lecturas", "destaca"):
            c[col] = json.loads(c[col]) if c[col] else None
    empresa = _empresa(con)
    vac["empresa"] = {"nombre": empresa["nombre"], "carta": empresa["carta"]} if empresa else None
    perfil = perfiles.obtener(con, vac["perfil_id"], vac["perfil_archivo"])
    vac["perfil"] = perfiles.publico(perfil)
    if perfil and perfil.get("superior"):
        # ¿El líder asignado es el superior inmediato que indica el perfil?
        lid, _ = perfiles.lider_del_perfil(perfil, [vac["lider"]] if vac["lider"] else [], perfiles.catalogo(con))
        vac["perfil_lider_coincide"] = lid == vac["lider_id"]
    return jsonify(vac)


@app.post("/api/vacantes")
def api_crear_vacante():
    vac, habilidades = _validar_vacante(request.get_json(force=True))
    con = get_db()
    cur = con.execute(f"INSERT INTO vacantes ({', '.join(vac)}) VALUES ({', '.join('?' * len(vac))})",
                      tuple(vac.values()))
    _guardar_habilidades(con, cur.lastrowid, habilidades)
    con.commit()
    return jsonify({"id": cur.lastrowid}), 201


@app.put("/api/vacantes/<int:vid>")
def api_editar_vacante(vid: int):
    con = get_db()
    actual = con.execute("SELECT perfil_id FROM vacantes WHERE id=?", (vid,)).fetchone()
    if not actual:
        abort(404)
    # Un cargo ligado no se puede desligar; los creados antes de la carpeta pueden ligarse al editarlos.
    vac, habilidades = _validar_vacante(request.get_json(force=True), requerir_perfil=bool(actual["perfil_id"]))
    sets = ", ".join(f"{c}=?" for c in vac)
    if con.execute(f"UPDATE vacantes SET {sets} WHERE id=?", (*vac.values(), vid)).rowcount == 0:
        abort(404)
    _guardar_habilidades(con, vid, habilidades)
    con.commit()
    _reevaluar_vacante(con, vid)
    return jsonify({"id": vid})


@app.patch("/api/vacantes/<int:vid>/estado")
def api_estado_vacante(vid: int):
    estado = (request.get_json(force=True) or {}).get("estado")
    if estado not in ("abierta", "cerrada"):
        abort(400)
    con = get_db()
    con.execute("UPDATE vacantes SET estado=? WHERE id=?", (estado, vid))
    con.commit()
    return jsonify({"estado": estado})


@app.delete("/api/vacantes/<int:vid>")
def api_borrar_vacante(vid: int):
    con = get_db()
    for (archivo,) in con.execute("SELECT cv_archivo FROM candidatos WHERE vacante_id=?", (vid,)):
        if archivo:
            (UPLOADS / archivo).unlink(missing_ok=True)
    con.execute("DELETE FROM vacantes WHERE id=?", (vid,))
    con.commit()
    return "", 204


@app.get("/api/perfiles/plantilla.csv")
def api_plantilla_csv():
    salida = io.StringIO()
    csv.writer(salida, delimiter=";").writerows(perfil_cargo.plantilla_filas())
    # BOM para que Excel muestre bien las tildes.
    return Response("\ufeff" + salida.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": "attachment; filename=perfil_cargo_agata.csv"})


@app.get("/api/perfiles/plantilla.xlsx")
def api_plantilla_xlsx():
    from openpyxl import Workbook
    from openpyxl.styles import Font
    libro = Workbook()
    hoja = libro.active
    hoja.title = "Perfil del cargo"
    for fila in perfil_cargo.plantilla_filas():
        hoja.append(fila)
    for fila in (1, 8):
        for celda in hoja[fila]:
            celda.font = Font(bold=True)
    hoja.column_dimensions["A"].width = 24
    hoja.column_dimensions["B"].width = 60
    hoja.column_dimensions["D"].width = 40
    salida = io.BytesIO()
    libro.save(salida)
    return Response(salida.getvalue(),
                    mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": "attachment; filename=perfil_cargo_agata.xlsx"})


@app.get("/api/vacantes/<int:vid>/publica")
def api_vacante_publica(vid: int):
    """Lo que ve el postulante de la vacante."""
    con = get_db()
    vac = _vacante_completa(con, vid)
    if not vac:
        abort(404)
    empresa = _empresa(con)
    return jsonify({
        "id": vac["id"], "cargo": vac["cargo"], "area": vac["area"], "estado": vac["estado"],
        "descripcion": vac["descripcion"], "lider_nombre": vac["lider_nombre"],
        "lider_cargo": vac["lider_cargo"], "empresa": empresa["nombre"] if empresa else None,
        "habilidades": [{"nombre": h["nombre"], "nivel": h["nivel"]} for h in vac["habilidades"]],
        "requisitos": perfiles.requisitos(perfiles.obtener(con, vac["perfil_id"], vac["perfil_archivo"])),
    })


# --- API: perfiles (carpeta perfiles/) -------------------------------------------

def _vacantes_por_perfil(con) -> dict[str, list[dict]]:
    ligadas: dict[str, list[dict]] = {}
    for v in con.execute("SELECT id, cargo, estado, perfil_id FROM vacantes WHERE perfil_id IS NOT NULL ORDER BY id"):
        ligadas.setdefault(v["perfil_id"], []).append({"id": v["id"], "cargo": v["cargo"], "estado": v["estado"]})
    return ligadas


def _perfil_con_propuesta(con, perfil: dict) -> dict:
    lideres = rows_to_list(con.execute("SELECT id, nombre, cargo, area FROM lideres"))
    return {"perfil": perfiles.publico(perfil),
            "propuesta": perfiles.propuesta(perfil, lideres, perfiles.catalogo(con)),
            "vacantes": _vacantes_por_perfil(con).get(perfil["id"], [])}


@app.get("/api/perfiles")
def api_perfiles():
    con = get_db()
    ligadas = _vacantes_por_perfil(con)
    return jsonify([{**perfiles.publico(p), "vacantes": ligadas.get(p["id"], [])} for p in perfiles.catalogo(con)])


@app.get("/api/perfiles/<pid>")
def api_perfil(pid: str):
    con = get_db()
    perfil = perfiles.obtener(con, pid, request.args.get("archivo"))
    if not perfil:
        abort(404)
    return jsonify(_perfil_con_propuesta(con, perfil))


@app.get("/api/perfiles/<pid>/archivo")
def api_perfil_archivo(pid: str):
    perfil = perfiles.obtener(get_db(), pid, request.args.get("archivo"))
    if not perfil:
        abort(404)
    return send_from_directory(perfiles.CARPETA, perfil["archivo"], as_attachment=True)


@app.post("/api/perfiles")
def api_subir_perfil():
    """Agrega un perfil a la carpeta perfiles/ (si ya estaba idéntico, no lo duplica) y lo devuelve listo
    para ligarlo a un cargo."""
    archivo = request.files.get("perfil")
    ext = Path(archivo.filename).suffix.lower() if archivo and archivo.filename else ""
    if ext not in perfil_cargo.EXT_PERFIL:
        return jsonify({"error": "Sube el perfil en Excel (.xlsx), CSV, PDF, Word (.docx) o TXT."}), 400
    con = get_db()
    ruta, nuevo = perfiles.guardar_archivo(archivo, archivo.filename)
    error = perfiles.leer_archivo(con, ruta).get("error")
    if error:
        if nuevo:
            ruta.unlink(missing_ok=True)
        return jsonify({"error": f"{error} No se agregó a Perfiles."}), 400
    perfil = perfiles.obtener(con, perfiles.id_de(ruta.name), ruta.name)
    return jsonify({**_perfil_con_propuesta(con, perfil), "nuevo": nuevo}), 201 if nuevo else 200


# --- API: postulaciones y candidatos ----------------------------------------

def _evaluar(con, vac: dict, cand: dict, consultar_ia: bool = False) -> dict:
    """Calcula el match. Con consultar_ia=True le pide un dictamen nuevo al oráculo (Groq) y lo
    deja en cand["ia"]; si no, reutiliza el dictamen guardado para no repetir llamadas."""
    lider = row_to_dict(con.execute("SELECT * FROM lideres WHERE id=?",
                                    (vac["lider_id"],)).fetchone())
    empresa = _empresa(con)
    nombres = {"candidato": cand["nombre"].split()[0].title(),
               "lider": lider["nombre"].split()[0].title() if lider else "el líder",
               "empresa": empresa["nombre"] if empresa else "la empresa"}
    args = (vac, vac["habilidades"], cand["cv_texto"], cand["carta"],
            lider["carta"] if lider else None, empresa["carta"] if empresa else None, nombres)
    if consultar_ia:
        perfil = perfiles.obtener(con, vac.get("perfil_id"), vac.get("perfil_archivo"))
        cand["ia"] = oraculo.consultar({**vac, "perfil_oficial": perfil, "expectativas_cargo": perfiles.expectativas(perfil)},
                                       lider, empresa, cand,
                                       evaluador.evaluar(*args))
    return evaluador.evaluar(*args, ia=cand.get("ia"))


def _guardar_resultado(con, cid: int, cand: dict, res: dict) -> None:
    con.execute("UPDATE candidatos SET resultado=?, ia=?, puntaje=? WHERE id=?",
                (json.dumps(res, ensure_ascii=False),
                 json.dumps(cand.get("ia"), ensure_ascii=False) if cand.get("ia") else None,
                 res["puntaje"], cid))


def _reevaluar_vacante(con, vid: int) -> None:
    vac = _vacante_completa(con, vid)
    for cand in rows_to_list(con.execute("SELECT * FROM candidatos WHERE vacante_id=?", (vid,))):
        _guardar_resultado(con, cand["id"], cand, _evaluar(con, vac, cand))
    con.commit()


@app.post("/api/vacantes/<int:vid>/postulaciones")
def api_postular(vid: int):
    con = get_db()
    vac = _vacante_completa(con, vid)
    if not vac:
        abort(404)
    if vac["estado"] != "abierta":
        return jsonify({"error": "Esta vacante ya está cerrada."}), 409

    form = request.form
    errores: dict[str, str] = {}
    cand = {c: _texto(form, c) for c in ("nombre", "email", "telefono")}
    if not cand["nombre"]:
        errores["nombre"] = "Campo obligatorio."
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", cand["email"]):
        errores["email"] = "Correo inválido."
    natales = _datos_natales(form, obligatorio=True, errores=errores)

    archivo = request.files.get("cv")
    ext = Path(archivo.filename).suffix.lower() if archivo and archivo.filename else ""
    if ext not in EXT_CV:
        errores["cv"] = "Sube la hoja de vida en PDF, DOCX o TXT."

    if errores:
        raise ErrorValidacion(errores)

    nombre_archivo, cv_texto = _guardar_cv(archivo)
    cand.update(natales)
    cand.update({"cv_archivo": nombre_archivo, "cv_texto": cv_texto})
    res = _evaluar(con, vac, cand, consultar_ia=True)
    fila = {**cand, "vacante_id": vid, "resultado": res, "puntaje": res["puntaje"]}
    for col in ("carta", "resultado", "ia"):
        fila[col] = json.dumps(fila[col], ensure_ascii=False) if fila.get(col) else None
    cur = con.execute(f"INSERT INTO candidatos ({', '.join(fila)}) "
                      f"VALUES ({', '.join('?' * len(fila))})", tuple(fila.values()))
    con.commit()
    return jsonify({"id": cur.lastrowid, "puntaje": res["puntaje"]}), 201


@app.get("/api/candidatos/<int:cid>")
def api_candidato(cid: int):
    con = get_db()
    cand = row_to_dict(con.execute("SELECT * FROM candidatos WHERE id=?", (cid,)).fetchone())
    if not cand:
        abort(404)
    cand.pop("cv_texto", None)
    vac = row_to_dict(con.execute("SELECT * FROM vacantes WHERE id=?",
                                  (cand["vacante_id"],)).fetchone())
    lider = row_to_dict(con.execute(
        "SELECT id, nombre, cargo, area, carta, cv_archivo FROM lideres WHERE id=?",
        (vac["lider_id"],)).fetchone())
    # Puesto en el ranking de la vacante (los empates comparten puesto).
    posicion, total = con.execute(
        "SELECT SUM(puntaje > ?) + 1, COUNT(*) FROM candidatos WHERE vacante_id=?",
        (cand["puntaje"], cand["vacante_id"])).fetchone()
    return jsonify({"candidato": cand, "vacante": vac, "lider": lider, "empresa": _empresa(con),
                    "ranking": {"posicion": posicion, "total": total},
                    "ia": {"activa": oraculo.activo(), "modelo": oraculo.modelo()}})


@app.post("/api/candidatos/<int:cid>/oraculo")
def api_reconsultar(cid: int):
    """Vuelve a pedirle el dictamen a la IA y recalcula el match del postulante."""
    if not oraculo.activo():
        return jsonify({"error": "Configura GROQ_API_KEY en el archivo .env para usar la IA."}), 409
    con = get_db()
    cand = row_to_dict(con.execute("SELECT * FROM candidatos WHERE id=?", (cid,)).fetchone())
    if not cand:
        abort(404)
    res = _evaluar(con, _vacante_completa(con, cand["vacante_id"]), cand, consultar_ia=True)
    _guardar_resultado(con, cid, cand, res)
    con.commit()
    if cand["ia"] and cand["ia"].get("error"):
        return jsonify({"error": cand["ia"]["error"]}), 502
    return jsonify({"puntaje": res["puntaje"]})


@app.patch("/api/candidatos/<int:cid>/decision")
def api_decision(cid: int):
    data = request.get_json(force=True) or {}
    decision = data.get("decision")
    if decision not in ("aprobado", "rechazado", None):
        abort(400)
    con = get_db()
    con.execute("UPDATE candidatos SET decision_lider=?, nota_lider=? WHERE id=?",
                (decision, _texto(data, "nota") or None, cid))
    con.commit()
    return jsonify({"decision": decision})


@app.delete("/api/candidatos/<int:cid>")
def api_borrar_candidato(cid: int):
    con = get_db()
    fila = con.execute("SELECT cv_archivo FROM candidatos WHERE id=?", (cid,)).fetchone()
    if fila and fila["cv_archivo"]:
        (UPLOADS / fila["cv_archivo"]).unlink(missing_ok=True)
    con.execute("DELETE FROM candidatos WHERE id=?", (cid,))
    con.commit()
    return "", 204


@app.get("/api/candidatos/<int:cid>/cv")
def api_cv(cid: int):
    fila = get_db().execute("SELECT cv_archivo FROM candidatos WHERE id=?", (cid,)).fetchone()
    return _enviar_cv(fila["cv_archivo"] if fila else None)


def preparar_db() -> None:
    """Crea o migra las tablas. Para cargar datos de demostración: python seed.py"""
    con = connect()
    init_db(con)
    # Cartas guardadas con una versión anterior: se recalculan sus atributos y su perfil de conflicto.
    cartas_nuevas = 0
    for tabla in ("lideres", "candidatos", "empresa"):
        for fila in rows_to_list(con.execute(f"SELECT id, carta FROM {tabla} WHERE carta IS NOT NULL")):
            if fila["carta"].get("version", 0) < astro.VERSION_CARTA:
                con.execute(f"UPDATE {tabla} SET carta=? WHERE id=?",
                            (json.dumps(astro.completar_carta(fila["carta"]), ensure_ascii=False), fila["id"]))
                cartas_nuevas += 1
    # 1.2.0: el match ya no clasifica ni descarta; la columna veredicto queda sin uso.
    con.execute("UPDATE candidatos SET veredicto = NULL WHERE veredicto IS NOT NULL")
    con.commit()
    # Si cambiaron las cartas o el modelo, se recalculan los resultados (sin volver a llamar a la IA).
    viejos = {r["vacante_id"] for r in con.execute(
        "SELECT vacante_id FROM candidatos WHERE resultado NOT LIKE '%\"conflicto\": {%'"
        " OR resultado NOT LIKE '%\"lecturas\"%'" + ("" if not cartas_nuevas else " OR 1"))}
    if viejos:
        with app.app_context():
            for vid in viejos:
                _reevaluar_vacante(con, vid)
    con.close()


preparar_db()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
