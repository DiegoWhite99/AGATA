import { api } from "../api.js";
import { COLOR_ELEMENTO } from "../astro-ui.js";
import { $, esc, toast, vacio } from "../ui.js";
const TIPO_TXT = { empresa: "Empresa", lider: "Líder", vacante: "Cargo", candidato: "Postulante" };
const ANILLO = 125;
const MARGEN = 120;
const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const selCentro = $("#red-centro");
const chkPostulantes = $("#red-postulantes");
const chkCerradas = $("#red-cerradas");
const tip = $("#red-tip");
let datos;
const porId = new Map();
const nodo = (n) => ({
    arquetipo: null, fuerza: null, con: "", hijos: [], hojas: 1, angulo: 0, radio: 0, nivel: 0, ...n,
});
// --- La red como árbol: empresa → cadena de mando → cargos → postulantes ------------------
function ramaLider(id, fuerza, con, visitados) {
    visitados.add(id);
    const l = datos.lideres.find((x) => x.id === id);
    const nombreCorto = l.nombre.split(" ")[0];
    const equipo = datos.lideres
        .filter((o) => o.jefe_id === id && !visitados.has(o.id))
        .map((o) => ramaLider(o.id, o.sinastria_jefe, nombreCorto, visitados));
    const cargos = datos.vacantes
        .filter((v) => v.lider_id === id && (chkCerradas.checked || v.estado === "abierta"))
        .map((v) => nodo({
        id: `v${v.id}`, tipo: "vacante", nombre: v.cargo, enlace: `/vacantes/${v.id}`,
        detalle: [v.area, v.tecnico ? "cargo técnico" : "", v.estado === "cerrada" ? "cerrada" : ""].filter(Boolean).join(" · "),
        hijos: chkPostulantes.checked
            ? datos.candidatos
                .filter((c) => c.vacante_id === v.id)
                .map((c) => nodo({
                id: `c${c.id}`, tipo: "candidato", nombre: c.nombre, enlace: `/candidatos/${c.id}`, arquetipo: c.arquetipo,
                fuerza: c.sinastria_lider, con: nombreCorto, potencial: (c.potencial ?? 0) >= 70,
                detalle: `Puntaje ${c.puntaje.toFixed(0)}%${c.decision_lider ? ` · ${c.decision_lider}` : " · por decidir"}`,
            }))
            : [],
    }));
    return nodo({
        id: `l${id}`, tipo: "lider", nombre: l.nombre, detalle: l.cargo, enlace: "/lideres", arquetipo: l.arquetipo,
        fuerza, con, hijos: [...equipo, ...cargos],
    });
}
function arbol(centro) {
    if (centro.startsWith("l"))
        return ramaLider(Number(centro.slice(1)), null, "", new Set());
    const visitados = new Set();
    const empresa = datos.empresa?.nombre ?? "la empresa";
    const cabezas = datos.lideres
        .filter((l) => l.jefe_id == null)
        .map((l) => ramaLider(l.id, l.sinastria_empresa, empresa, visitados));
    return nodo({
        id: "empresa", tipo: "empresa", nombre: datos.empresa?.nombre ?? "La empresa", detalle: "Carta de fundación",
        enlace: "/empresa", arquetipo: datos.empresa?.arquetipo ?? null, hijos: cabezas,
    });
}
// --- Disposición radial: cada nivel en un anillo, cada rama con un ángulo según sus hojas ---------
function contarHojas(n) {
    n.hojas = n.hijos.length ? n.hijos.reduce((s, h) => s + contarHojas(h), 0) : 1;
    return n.hojas;
}
function ubicar(n, desde, hasta, nivel) {
    n.nivel = nivel;
    n.angulo = (desde + hasta) / 2;
    n.radio = nivel * ANILLO;
    // Fuera del centro, una rama no se abre más de media vuelta: así sus hijos no cruzan por el centro.
    if (nivel > 0 && hasta - desde > Math.PI) {
        desde = n.angulo - Math.PI / 2;
        hasta = n.angulo + Math.PI / 2;
    }
    let a = desde;
    for (const h of n.hijos) {
        const tramo = ((hasta - desde) * h.hojas) / n.hojas;
        ubicar(h, a, a + tramo, nivel + 1);
        a += tramo;
    }
}
const todos = (n) => [n, ...n.hijos.flatMap(todos)];
const polar = (c, r, ang) => [c + r * Math.cos(ang - Math.PI / 2), c + r * Math.sin(ang - Math.PI / 2)];
const colorDe = (n) => n.tipo === "vacante" ? "var(--gold)" : n.arquetipo ? COLOR_ELEMENTO[n.arquetipo.elemento] : "var(--faint)";
/** La sinapsis: una curva del nodo de arriba al de abajo. Más sinastría, más gruesa, brillante y rápida. */
function sinapsis(p, h, c) {
    const [x1, y1] = polar(c, p.radio, p.angulo);
    const [x2, y2] = polar(c, h.radio, h.angulo);
    const rm = (p.radio + h.radio) / 2;
    const [ax, ay] = polar(c, rm, p.nivel === 0 ? h.angulo : p.angulo);
    const [bx, by] = polar(c, rm, h.angulo);
    const d = `M${x1.toFixed(1)},${y1.toFixed(1)} C${ax.toFixed(1)},${ay.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
    const color = colorDe(h);
    if (h.fuerza == null) {
        return `<path d="${d}" class="sinapsis sin-dato" stroke="${h.tipo === "vacante" ? "var(--gold)" : "var(--faint)"}"/>`;
    }
    const f = h.fuerza;
    const pulso = sinMovimiento ? "" : `<circle r="${(2 + f / 50).toFixed(1)}" fill="${color}" class="pulso">
      <animateMotion dur="${(5.5 - f / 25).toFixed(1)}s" repeatCount="indefinite" path="${d}"/></circle>`;
    return `<path d="${d}" class="sinapsis" stroke="${color}" stroke-width="${(0.8 + f / 22).toFixed(1)}"
      stroke-opacity="${(0.22 + f / 140).toFixed(2)}"/>${pulso}`;
}
function figura(n, c, centro) {
    const [x, y] = polar(c, n.radio, n.angulo);
    const color = colorDe(n);
    const iniciales = n.nombre.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
    let forma;
    let etiqueta;
    if (n.tipo === "vacante") {
        forma = `<rect x="-11" y="-11" width="22" height="22" transform="rotate(45)" class="nodo-vacante" stroke="${color}"/>`;
        etiqueta = etiquetaFuera(n, 22);
    }
    else if (n.tipo === "candidato") {
        const r = 9;
        forma = `${n.potencial ? `<circle r="${r + 6}" class="aura-potencial"/>` : ""}
      <circle r="${r}" fill="${color}" fill-opacity="0.35" stroke="${color}" class="nodo-cuerpo"/>`;
        etiqueta = etiquetaFuera(n, 18);
    }
    else {
        const r = centro ? 38 : 27;
        forma = `<circle r="${r + 10}" fill="${color}" class="halo"/>
      <circle r="${r}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="2" class="nodo-cuerpo"/>
      <text class="nodo-iniciales" dy="0.35em">${esc(n.tipo === "empresa" ? "✦" : iniciales)}</text>`;
        etiqueta = `<text class="nodo-nombre" y="${r + 20}">${esc(corto(n.nombre, 26))}</text>
      ${n.arquetipo ? `<text class="nodo-rol" y="${r + 36}" fill="${color}">${esc(n.arquetipo.nombre)}</text>` : ""}`;
    }
    return `<g class="nodo nodo-${n.tipo}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})" data-n="${n.id}"
      tabindex="0" role="link" aria-label="${esc(`${TIPO_TXT[n.tipo]}: ${n.nombre}${n.arquetipo ? `, ${n.arquetipo.nombre}` : ""}`)}">
      ${forma}${etiqueta}</g>`;
}
const corto = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
/** Etiqueta hacia afuera del anillo, para que no se monte sobre las conexiones. */
function etiquetaFuera(n, d) {
    const cos = Math.cos(n.angulo - Math.PI / 2);
    const sin = Math.sin(n.angulo - Math.PI / 2);
    const ancla = Math.abs(cos) < 0.3 ? "middle" : cos > 0 ? "start" : "end";
    const texto = n.tipo === "candidato" ? n.nombre.split(" ")[0] : corto(n.nombre, 24);
    return `<text class="nodo-etiqueta nodo-etiqueta-${n.tipo}" x="${(cos * d).toFixed(1)}" y="${(sin * d + 4).toFixed(1)}"
      text-anchor="${ancla}">${esc(texto)}</text>`;
}
function pintar() {
    const raiz = arbol(selCentro.value);
    porId.clear();
    contarHojas(raiz);
    ubicar(raiz, 0, 2 * Math.PI, 0);
    const lista = todos(raiz);
    lista.forEach((n) => porId.set(n.id, n));
    const niveles = Math.max(...lista.map((n) => n.nivel));
    const c = niveles * ANILLO + MARGEN;
    // El lienzo se encuadra a los nodos (con aire para las etiquetas), no al círculo completo.
    const puntos = lista.map((n) => polar(c, n.radio, n.angulo));
    const [x0, x1] = [Math.min(...puntos.map((p) => p[0])) - MARGEN, Math.max(...puntos.map((p) => p[0])) + MARGEN];
    const [y0, y1] = [Math.min(...puntos.map((p) => p[1])) - 70, Math.max(...puntos.map((p) => p[1])) + 80];
    const caja = `${x0.toFixed(0)} ${y0.toFixed(0)} ${(x1 - x0).toFixed(0)} ${(y1 - y0).toFixed(0)}`;
    const anillos = Array.from({ length: niveles }, (_, i) => `<circle cx="${c}" cy="${c}" r="${(i + 1) * ANILLO}" class="red-anillo"/>`).join("");
    const conexiones = lista.flatMap((p) => p.hijos.map((h) => sinapsis(p, h, c))).join("");
    const nodos = [...lista].reverse().map((n) => figura(n, c, n === raiz)).join("");
    $("#red").innerHTML = raiz.hijos.length || raiz.tipo !== "empresa"
        ? `<svg viewBox="${caja}" class="red-svg" role="img" aria-label="Red de ${esc(raiz.nombre)}">
        <defs><filter id="brillo"><feGaussianBlur stdDeviation="9"/></filter></defs>
        ${anillos}<g class="conexiones">${conexiones}</g><g>${nodos}</g></svg>`
        : vacio("☊", "Aún no hay red", "Registra líderes para ver cómo se despliega la cadena de mando.", `<a class="btn" href="/lideres">Ir a Líderes</a>`);
    pintarRoles(lista);
}
function pintarRoles(lista) {
    const grupos = new Map();
    for (const n of lista) {
        if (!n.arquetipo)
            continue;
        const g = grupos.get(n.arquetipo.nombre) ?? { a: n.arquetipo, miembros: [] };
        g.miembros.push(n);
        grupos.set(n.arquetipo.nombre, g);
    }
    $("#red-roles").innerHTML = grupos.size
        ? [...grupos.values()]
            .sort((x, y) => y.miembros.length - x.miembros.length)
            .map(({ a, miembros }) => `<article class="rol-red" style="--c:${COLOR_ELEMENTO[a.elemento]}">
            <h3>✦ ${esc(a.nombre)}</h3>
            <p class="meta">${esc(a.elemento)} · ${esc(a.modalidad)}</p>
            <p class="parrafo">${esc(a.rol)}</p>
            <ul class="chips">${miembros.map((m) => `<li class="chip"><a href="${m.enlace}">${esc(m.nombre)}</a> · ${TIPO_TXT[m.tipo].toLowerCase()}</li>`).join("")}</ul>
          </article>`)
            .join("")
        : `<p class="meta">Nadie de esta red tiene carta astral todavía.</p>`;
}
function leyenda() {
    const elementos = Object.entries(COLOR_ELEMENTO)
        .map(([e, color]) => `<span><i class="punto-red" style="background:${color}"></i>${e}</span>`).join("");
    return `${elementos}
    <span><i class="forma-red forma-lider"></i>Líder</span>
    <span><i class="forma-red forma-vacante"></i>Cargo</span>
    <span><i class="forma-red forma-candidato"></i>Postulante</span>
    <span><i class="forma-red forma-potencial"></i>Potencial alto</span>
    <span class="meta-inline">Sinapsis más gruesa y brillante = más sinastría · punteada = falta una carta</span>`;
}
// --- Detalle al pasar el cursor y navegación --------------------------------------------
function mostrarTip(n, x, y) {
    const lienzo = $(".red-lienzo").getBoundingClientRect();
    tip.innerHTML = `<p class="eyebrow">${TIPO_TXT[n.tipo]}</p><strong>${esc(n.nombre)}</strong>
    <p class="meta">${esc(n.detalle)}</p>
    ${n.arquetipo ? `<p class="arquetipo" style="--c:${COLOR_ELEMENTO[n.arquetipo.elemento]}"><b>✦ ${esc(n.arquetipo.nombre)}</b><span>${esc(n.arquetipo.rol)}</span></p>` : ""}
    ${n.fuerza != null ? `<p class="meta">Sinapsis con ${esc(n.con)}: <strong>${n.fuerza.toFixed(0)}%</strong></p>` : ""}
    ${n.potencial ? `<p class="meta">✦ Potencial de crecimiento alto</p>` : ""}`;
    tip.hidden = false;
    const ancho = tip.offsetWidth;
    tip.style.left = `${Math.min(x - lienzo.left + 16, lienzo.width - ancho - 8)}px`;
    tip.style.top = `${y - lienzo.top + 16}px`;
}
const red = $("#red");
red.addEventListener("mousemove", (e) => {
    const g = e.target.closest("[data-n]");
    const n = g && porId.get(g.dataset.n);
    if (n)
        mostrarTip(n, e.clientX, e.clientY);
    else
        tip.hidden = true;
});
red.addEventListener("mouseleave", () => (tip.hidden = true));
red.addEventListener("focusin", (e) => {
    const g = e.target.closest("[data-n]");
    const n = g && porId.get(g.dataset.n);
    if (n) {
        const r = g.getBoundingClientRect();
        mostrarTip(n, r.right, r.top);
    }
});
red.addEventListener("click", (e) => {
    const g = e.target.closest("[data-n]");
    const n = g && porId.get(g.dataset.n);
    if (n)
        location.href = n.enlace;
});
red.addEventListener("keydown", (e) => {
    const g = e.target.closest("[data-n]");
    const n = g && porId.get(g.dataset.n);
    if (n && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        location.href = n.enlace;
    }
});
for (const control of [selCentro, chkPostulantes, chkCerradas])
    control.addEventListener("change", pintar);
api
    .get("/api/red")
    .then((d) => {
    datos = d;
    // Centro por defecto: el líder que encabeza la cadena, si hay uno solo; si no, toda la empresa.
    const cabezas = d.lideres.filter((l) => l.jefe_id == null);
    selCentro.innerHTML = `<option value="empresa">Toda la empresa</option>` +
        d.lideres.map((l) => `<option value="l${l.id}">${esc(l.nombre)} · ${esc(l.cargo)}</option>`).join("");
    const pedido = new URLSearchParams(location.search).get("centro");
    selCentro.value = pedido && selCentro.querySelector(`option[value="${pedido}"]`) ? pedido
        : cabezas.length === 1 ? `l${cabezas[0].id}` : "empresa";
    $("#red-leyenda").innerHTML = leyenda();
    pintar();
})
    .catch(() => toast("No se pudo cargar la red.", "error"));
