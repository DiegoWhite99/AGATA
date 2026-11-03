"""Datos de demostración. Uso: python seed.py  (borra y recrea la base de datos)."""
from __future__ import annotations

import json
from pathlib import Path

import astro
import evaluador
import perfiles
from db import DB_PATH, connect, init_db, rows_to_list

UPLOADS = Path(__file__).parent / "uploads"

LIDER = {
    "nombre": "Diego Castelblanco",
    "cargo": "Líder de Robótica",
    "area": "Robótica e Innovación",
    "email": "diego_castelblanco@cun.edu.co",
    "descripcion": (
        "Lidero el área de Robótica e Innovación, responsable de diseñar, construir y poner en "
        "operación robots móviles autónomos y brazos manipuladores para automatizar procesos "
        "internos y proyectos con clientes. El equipo trabaja con ROS 2 sobre Linux, simulación "
        "en Gazebo, visión artificial con OpenCV y modelos de detección, y electrónica propia "
        "basada en microcontroladores STM32 y ESP32. Cubrimos todo el ciclo: requerimientos, "
        "diseño mecánico y electrónico, firmware, integración, pruebas en campo y documentación."
    ),
    "estilo_liderazgo": (
        "Liderazgo cercano y técnico: reviso código y diseños con el equipo, doy autonomía en las "
        "decisiones de implementación y pido transparencia cuando algo falla. Trabajamos en "
        "sprints de dos semanas con demos cortas al final de cada uno."
    ),
    "expectativas": (
        "Busco a alguien que llegue a integrar y depurar sistemas completos (sensores, control y "
        "software), que documente lo que hace, proponga mejoras y sea capaz de acompañar a los "
        "practicantes. Valoro mucho la curiosidad y la responsabilidad con los tiempos de entrega."
    ),
    "equipo": "6 personas: 3 ingenieros de robótica, 1 electrónico, 2 practicantes.",
    # Datos natales de ejemplo: edítalos en la sección Líderes.
    "fecha_nac": "1992-08-14", "hora_nac": "10:30", "ciudad": "Bogotá, Colombia",
    "lat": 4.711, "lon": -74.072, "utc": -5,
}

VACANTE = {
    "cargo": "Ingeniero(a) de Robótica",
    "area": "Robótica e Innovación",
    "descripcion": (
        "Ingeniero(a) para el desarrollo e integración de robots móviles autónomos. Será "
        "responsable de programar nodos en ROS 2, sintonizar controladores de movimiento, "
        "integrar sensores (LiDAR, cámaras, IMU), apoyar el diseño de la electrónica de potencia "
        "y realizar pruebas en campo. Trabajará con el líder de Robótica y apoyará a los "
        "practicantes del área."
    ),
    "elemento_afin": "Tierra",
    "peso_lider": 35, "peso_empresa": 25, "peso_elemento": 10, "peso_conflicto": 10, "peso_cv": 20,
    "peso_ia": 10,
}

HABILIDADES = [
    ("ROS / ROS 2", 5, 4, "ros, ros2, ros 2, gazebo, rviz, moveit, nav2, colcon, catkin"),
    ("Python", 4, 4, "python, numpy, pandas, pytest, scipy"),
    ("C++ y embebidos", 4, 3, "c++, cpp, embebido, embedded, rtos, freertos, stm32, esp32, arduino"),
    ("Control automático", 4, 3, "pid, control, matlab, simulink, cinematica, mpc, lqr"),
    ("Visión artificial", 3, 3, "opencv, vision artificial, computer vision, yolo, pytorch, slam, lidar"),
    ("Electrónica y sensores", 3, 3, "electronica, pcb, kicad, altium, sensores, i2c, spi, can, uart"),
    ("Diseño mecánico CAD", 2, 2, "solidworks, fusion 360, cad, onshape, inventor, impresion 3d"),
    ("Trabajo en equipo", 3, 4, "equipo, scrum, agile, liderazgo, mentoria, git, comunicacion"),
]

EMPRESA = {
    "nombre": "Andes Robotics",
    "sector": "Robótica e innovación tecnológica",
    "mision": "Automatizar procesos con robots confiables, hechos en Colombia.",
    "valores": "Curiosidad, rigor técnico, trabajo en equipo y responsabilidad con el cliente.",
    "cultura": "Equipos pequeños y autónomos, demos cada dos semanas y aprendizaje continuo.",
    "fecha_nac": "2015-03-03", "hora_nac": "09:00", "ciudad": "Bogotá, Colombia",
    "lat": 4.711, "lon": -74.072, "utc": -5,
}

CANDIDATOS = [
    {
        "nombre": "Valentina Rojas", "email": "valentina.rojas@example.com", "telefono": "3001234567",
        "fecha_nac": "1994-09-02", "hora_nac": "07:45", "ciudad": "Medellín, Colombia",
        "lat": 6.244, "lon": -75.581, "utc": -5, "aciertos": 1.0, "auto": 4,
        "cv": """VALENTINA ROJAS — Ingeniera Mecatrónica, Maestría en Robótica (Universidad Nacional)
Perfil: 5 años de experiencia desarrollando robots móviles autónomos.
Experiencia:
- Robotics Engineer en AgroBots (2021-2025): nodos en ROS 2 (C++ y Python), navegación con Nav2,
  simulación en Gazebo y RViz, SLAM con LiDAR y fusión de IMU. Sintonía de controladores PID y MPC.
- Ingeniera de firmware (2019-2021): STM32 con FreeRTOS, buses CAN, SPI e I2C, diseño de PCB en KiCad.
Habilidades: Python (NumPy, pytest), C++17, OpenCV, YOLO, PyTorch, MATLAB/Simulink, SolidWorks,
impresión 3D, Git, Scrum. Mentoría de practicantes y trabajo en equipo multidisciplinario.""",
    },
    {
        "nombre": "Andrés Gómez", "email": "andres.gomez@example.com", "telefono": "3109876543",
        "fecha_nac": "1993-08-20", "hora_nac": "16:05", "ciudad": "Bogotá, Colombia",
        "lat": 4.711, "lon": -74.072, "utc": -5, "aciertos": 0.65, "auto": 3,
        "cv": """ANDRÉS GÓMEZ — Ingeniero Electrónico
Perfil: 3 años de experiencia en automatización y electrónica.
Experiencia:
- Ingeniero de automatización en Industrias Andinas: programación de PLC, control PID de
  temperatura, prototipos con Arduino y ESP32, diseño de tarjetas en Altium.
- Proyecto de grado: brazo robótico de 4 GDL con Python, cinemática inversa y visión con OpenCV.
Habilidades: Python, C++, MATLAB, sensores industriales, UART, comunicación con el cliente, Git.""",
    },
    {
        "nombre": "Camila Torres", "email": "camila.torres@example.com", "telefono": "3205551234",
        "fecha_nac": "1999-01-25", "hora_nac": "22:10", "ciudad": "Barranquilla, Colombia",
        "lat": 10.964, "lon": -74.796, "utc": -5, "aciertos": 0.2, "auto": 2,
        "cv": """CAMILA TORRES — Desarrolladora Web
Perfil: 2 años de experiencia como desarrolladora frontend.
Experiencia:
- Frontend en Tiendas Click: React, TypeScript, CSS, consumo de APIs REST.
- Freelance: sitios en WordPress y diseño UI en Figma.
Habilidades: JavaScript, React, SQL, Python básico, trabajo en equipo.""",
    },
]


def sembrar(con) -> None:
    def carta_de(d: dict) -> dict:
        return astro.calcular_carta(d["fecha_nac"], d["hora_nac"], d["lat"], d["lon"], d["utc"])

    carta_empresa = carta_de(EMPRESA)
    empresa = {**EMPRESA, "carta": json.dumps(carta_empresa, ensure_ascii=False)}
    con.execute(f"INSERT INTO empresa (id, {', '.join(empresa)}) VALUES (1, {', '.join('?' * len(empresa))})",
                tuple(empresa.values()))

    carta_lider = carta_de(LIDER)
    lider = {**LIDER, "carta": json.dumps(carta_lider, ensure_ascii=False)}
    lid = con.execute(f"INSERT INTO lideres ({', '.join(lider)}) VALUES ({', '.join('?' * len(lider))})",
                      tuple(lider.values())).lastrowid

    vac = {**VACANTE, "lider_id": lid}
    vid = con.execute(f"INSERT INTO vacantes ({', '.join(vac)}) VALUES ({', '.join('?' * len(vac))})",
                      tuple(vac.values())).lastrowid
    con.executemany(
        "INSERT INTO habilidades (vacante_id, nombre, peso, nivel, palabras_clave, tipo) VALUES (?,?,?,?,?,?)",
        [(vid, *h, perfiles.tipo_habilidad(h[0])) for h in HABILIDADES])
    habilidades = rows_to_list(con.execute("SELECT * FROM habilidades WHERE vacante_id=?", (vid,)))
    vac["id"] = vid

    UPLOADS.mkdir(exist_ok=True)
    for i, c in enumerate(CANDIDATOS):
        carta = carta_de(c)
        archivo = f"demo{i + 1}_{c['nombre'].split()[0].lower()}_cv.txt"
        (UPLOADS / archivo).write_text(c["cv"], encoding="utf-8")
        nombres = {"candidato": c["nombre"].split()[0], "lider": LIDER["nombre"].split()[0],
                   "empresa": EMPRESA["nombre"]}
        res = evaluador.evaluar(vac, habilidades, c["cv"], carta, carta_lider, carta_empresa, nombres)
        con.execute("""
            INSERT INTO candidatos (vacante_id, nombre, email, telefono, fecha_nac, hora_nac, ciudad,
                lat, lon, utc, cv_archivo, cv_texto, carta, resultado, puntaje)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (vid, c["nombre"], c["email"], c["telefono"], c["fecha_nac"], c["hora_nac"], c["ciudad"],
             c["lat"], c["lon"], c["utc"], archivo, c["cv"], json.dumps(carta, ensure_ascii=False),
             json.dumps(res, ensure_ascii=False), res["puntaje"]))
    con.commit()


if __name__ == "__main__":
    import sys
    if DB_PATH.exists() and "--forzar" not in sys.argv:
        con = connect()
        hay = sum(con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                  for t in ("lideres", "vacantes", "candidatos"))
        con.close()
        if hay:
            sys.exit(f"La base tiene {hay} registros. seed.py la borra completa junto con las hojas "
                     "de vida; si de verdad quieres eso, usa: python seed.py --forzar")
    DB_PATH.unlink(missing_ok=True)
    for archivo in UPLOADS.glob("*"):
        archivo.unlink()
    conexion = connect()
    init_db(conexion)
    sembrar(conexion)
    for fila in conexion.execute("SELECT nombre, puntaje FROM candidatos ORDER BY puntaje DESC"):
        print(f"{fila['nombre']:<20} {fila['puntaje']:>5}")
    conexion.close()
