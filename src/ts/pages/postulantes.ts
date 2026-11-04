import { api } from "../api.js";
import { COLOR_ELEMENTO } from "../astro-ui.js";
import { $, $$, badgeDecision, barra, colorPuntaje, esc, fecha, toast, vacio } from "../ui.js";
import type { CandidatoGeneral } from "../types.js";

// Listado general: todas las postulaciones que ve el usuario (un líder, las de su cadena de mando), con su cargo,
// su líder, su puntaje y en qué va. Se filtra y se ordena en el navegador, y se puede descargar en CSV.

type Estado = "pendiente" | "espera" | "equipo" | "no";

const ESTADO_TXT: Record<Estado, string> = {
  pendiente: "Por decidir",
  espera: "Falta la dirección",
  equipo: "En el equipo",
  no: "No avanzaron",
};

const buscar = $<HTMLInputElement>("#buscar");
const selCargo = $<HTMLSelectElement>("#f-cargo");
const selLider = $<HTMLSelectElement>("#f-lider");
const selOrden = $<HTMLSelectElement>("#orden");
let todos: CandidatoGeneral[] = [];
let estado: Estado | "todos" = "todos";

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function estadoDe(c: CandidatoGeneral): Estado {
  if (!c.decision_lider) return "pendiente";
  if (c.decision_lider === "rechazado" || c.decision_direccion === "rechazado") return "no";
  return c.decision_direccion === "aprobado" ? "equipo" : "espera";
}

/** «Profesional 90»: una de las dos lecturas del puntaje, con su color. */
const lectura = (nombre: string, v: number | null | undefined) =>
  `<span title="${nombre === "Profesional" ? "Perfil profesional: hoja de vida + ajuste con el líder según la IA" : "Afinidad astral: sinastría, elemento y manejo de conflictos"}">${nombre} ${
    v == null ? "—" : `<b style="color:${colorPuntaje(v)}">${v.toFixed(0)}</b>`}</span>`;

/** Los que pasan la búsqueda, el cargo, el líder y el estado, en el orden elegido. */
function visibles(): CandidatoGeneral[] {
  const q = sinTildes(buscar.value.trim());
  const lista = todos.filter(
    (c) =>
      (!q || sinTildes([c.nombre, c.email, c.cargo, c.area, c.lider_nombre, c.ciudad ?? ""].join(" ")).includes(q)) &&
      (!selCargo.value || String(c.vacante_id) === selCargo.value) &&
      (!selLider.value || String(c.lider_id) === selLider.value) &&
      (estado === "todos" || estadoDe(c) === estado),
  );
  const orden = selOrden.value;
  return lista.sort((a, b) =>
    orden === "puntaje" ? b.puntaje - a.puntaje
      : orden === "nombre" ? a.nombre.localeCompare(b.nombre, "es")
        : b.creado.localeCompare(a.creado) || b.id - a.id);
}

function fila(c: CandidatoGeneral, postulaciones: number): string {
  return `<tr class="${c.cumple_requisitos === false ? "fila-no-cumple" : ""}">
    <td><a href="/candidatos/${c.id}" class="lista-titulo">${esc(c.nombre)}</a>
      ${c.arquetipo ? `<span class="rol-mini" style="--c:${COLOR_ELEMENTO[c.arquetipo.elemento]}">✦ ${esc(c.arquetipo.nombre)}</span>` : ""}
      <span class="meta">${esc(c.email)}${c.telefono ? ` · ${esc(c.telefono)}` : ""}</span>
      ${postulaciones > 1 ? `<span class="chip chip-redireccion" title="Se postuló a ${postulaciones} cargos">↺ ${postulaciones} postulaciones</span>` : ""}</td>
    <td><a href="/vacantes/${c.vacante_id}">${esc(c.cargo)}</a>
      <span class="meta">${esc(c.area)}${c.vacante_estado === "cerrada" ? " · vacante cerrada" : ""}</span></td>
    <td>${esc(c.lider_nombre)}<span class="meta">${esc(c.lider_cargo)}</span></td>
    <td class="celda-puntaje"><strong class="puntaje-neutro">${c.puntaje.toFixed(1)}%</strong>${barra(c.puntaje, "var(--gold)")}
      <span class="meta lecturas-mini">${lectura("Profesional", c.lecturas?.profesional)} · ${lectura("Astral", c.lecturas?.astral)}</span></td>
    <td>${badgeDecision(c.decision_lider, c.decision_direccion)}${c.cumple_requisitos === false ? `<span class="badge badge-no-cumple">No cumple requisitos</span>` : ""}</td>
    <td class="nowrap">${fecha(c.creado)}</td>
  </tr>`;
}

function pintar(): void {
  const lista = visibles();
  const porCorreo = new Map<string, number>();
  for (const c of todos) porCorreo.set(c.email.toLowerCase(), (porCorreo.get(c.email.toLowerCase()) ?? 0) + 1);
  const personas = new Set(lista.map((c) => c.email.toLowerCase())).size;
  $("#resumen").textContent = `${lista.length} postulación(es) de ${personas} persona(s)` +
    (lista.length !== todos.length ? ` · ${todos.length} en total` : "") + (lista.length ? " · clic en un nombre para ver su informe" : "");
  $("#tabla-postulantes").innerHTML = lista.length
    ? `<div class="tabla-scroll"><table class="tabla tabla-postulantes">
        <thead><tr><th>Postulante</th><th>Cargo</th><th>Líder</th>
          <th>Puntaje</th><th>Estado</th><th>Fecha</th></tr></thead>
        <tbody>${lista.map((c) => fila(c, porCorreo.get(c.email.toLowerCase()) ?? 1)).join("")}</tbody></table></div>`
    : todos.length
      ? vacio("∅", "Nadie coincide con ese filtro", "Prueba con otra búsqueda u otro estado.")
      : vacio("☽", "Aún no hay postulaciones", "Comparte el link de una vacante con los candidatos.",
          `<a class="btn btn-sm" href="/vacantes">Ir a Vacantes</a>`);
}

function pintarEstados(): void {
  const cuenta = (e: Estado) => todos.filter((c) => estadoDe(c) === e).length;
  $("#f-estado").innerHTML = [
    `<button class="filtro" role="tab" data-estado="todos" aria-selected="${estado === "todos"}">Todos (${todos.length})</button>`,
    ...(Object.keys(ESTADO_TXT) as Estado[]).map((e) =>
      `<button class="filtro" role="tab" data-estado="${e}" aria-selected="${estado === e}">${ESTADO_TXT[e]} (${cuenta(e)})</button>`),
  ].join("");
}

/** Opciones únicas (por id) para los filtros de cargo y de líder. */
function opciones(sel: HTMLSelectElement, pares: [number, string][]): void {
  const unicos = [...new Map(pares).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  sel.insertAdjacentHTML("beforeend", unicos.map(([id, txt]) => `<option value="${id}">${esc(txt)}</option>`).join(""));
}

// --- CSV: con punto y coma y coma decimal, como lo abre Excel en español ----------------------

function csv(lista: CandidatoGeneral[]): string {
  const num = (v: number | null | undefined) => (v == null ? "" : v.toFixed(1).replace(".", ","));
  const campo = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const filas = [
    ["Nombre", "Correo", "Teléfono", "Ciudad", "Cargo", "Área", "Líder", "Puntaje", "Perfil profesional",
      "Afinidad astral", "Estado", "Cumple requisitos", "Fecha"],
    ...lista.map((c) => [
      c.nombre, c.email, c.telefono ?? "", c.ciudad ?? "", c.cargo, c.area, c.lider_nombre, num(c.puntaje),
      num(c.lecturas?.profesional), num(c.lecturas?.astral), ESTADO_TXT[estadoDe(c)].replace("No avanzaron", "No avanzó"),
      c.cumple_requisitos === false ? "No" : c.cumple_requisitos ? "Sí" : "", c.creado.slice(0, 10),
    ]),
  ];
  return "﻿" + filas.map((f) => f.map(campo).join(";")).join("\r\n");
}

$("#btn-csv").addEventListener("click", () => {
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(new Blob([csv(visibles())], { type: "text/csv;charset=utf-8" }));
  enlace.download = `postulantes-${new Date().toISOString().slice(0, 10)}.csv`;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
});

$("#f-estado").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-estado]");
  if (!b) return;
  estado = b.dataset.estado as Estado | "todos";
  $$("[data-estado]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
  pintar();
});
buscar.addEventListener("input", pintar);
for (const sel of [selCargo, selLider, selOrden]) sel.addEventListener("change", pintar);

api
  .get<CandidatoGeneral[]>("/api/candidatos")
  .then((lista) => {
    todos = lista;
    opciones(selCargo, lista.map((c) => [c.vacante_id, `${c.cargo}${c.vacante_estado === "cerrada" ? " (cerrada)" : ""}`]));
    opciones(selLider, lista.map((c) => [c.lider_id, c.lider_nombre]));
    $<HTMLButtonElement>("#btn-csv").disabled = !lista.length;
    pintarEstados();
    pintar();
  })
  .catch(() => toast("No se pudo cargar el listado de postulantes.", "error"));
