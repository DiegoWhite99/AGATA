import { api } from "../api.js";
import {
  barrasElementos, fichaConflicto, iniciarNatal, leerNatal, panelAtributos, rellenarNatal, ruedaZodiacal,
  tablaPosiciones,
} from "../astro-ui.js";
import { $, barra, colorPuntaje, esc, limpiarErrores, mostrarErrores, toast, vacio } from "../ui.js";
import type { Empresa } from "../types.js";

const form = $<HTMLFormElement>("#form-empresa");
const CAMPOS = ["nombre", "sector", "mision", "valores", "cultura"] as const;
let empresa: Empresa | null = null;

interface LiderSinastria {
  id: number;
  nombre: string;
  cargo: string;
  puntaje: number;
  armonicos: number;
  tensos: number;
  aspecto: string | null;
}

function pintarCarta(): void {
  const caja = $("#carta-empresa");
  const carta = empresa?.carta;
  if (!empresa || !carta) {
    caja.innerHTML = vacio("♁", "La empresa aún no tiene carta",
      "Llena su nombre y los datos de fundación para trazarla.");
    return;
  }
  caja.innerHTML = `
    <header class="tarjeta-cab"><h2>${esc(empresa.nombre)}</h2></header>
    <p class="parrafo">${esc(carta.resumen)}</p>
    <div class="carta-rueda centrada">${ruedaZodiacal(carta, 340)}</div>
    <h3 class="subtitulo">Elementos</h3>
    ${barrasElementos(carta)}
    <h3 class="subtitulo">Cómo maneja los conflictos la cultura</h3>
    ${fichaConflicto("Empresa", empresa.nombre, carta.conflicto)}
    <details class="detalles-posiciones"><summary>Posiciones de los astros</summary>${tablaPosiciones(carta)}</details>`;
}

function pintarAtributos(): void {
  const caja = $("#atributos-empresa");
  const carta = empresa?.carta;
  caja.hidden = !carta;
  if (!carta || !empresa) return;
  caja.innerHTML = `
    <header class="tarjeta-cab"><div><p class="eyebrow">La regla de los astros</p>
      <h2>Lo que dicta la carta de ${esc(empresa.nombre)}</h2></div></header>
    ${panelAtributos(carta)}`;
}

async function pintarLideres(): Promise<void> {
  const caja = $("#lideres-empresa");
  if (!empresa?.carta) {
    caja.hidden = true;
    return;
  }
  const lista = await api.get<LiderSinastria[]>("/api/empresa/lideres");
  caja.hidden = false;
  caja.innerHTML = `<h2>Sinastría de los líderes con la empresa</h2>
    ${lista.length
      ? `<ul class="lista">${lista
          .map(
            (l) => `<li class="lista-item">
              <div><span class="lista-titulo">${esc(l.nombre)}</span>
                <span class="meta">${esc(l.cargo)} · ${l.armonicos} aspectos armónicos, ${l.tensos} tensos</span>
                ${l.aspecto ? `<span class="meta"><em>${esc(l.aspecto)}</em></span>` : ""}</div>
              <div class="lista-puntaje"><span class="num" style="color:${colorPuntaje(l.puntaje)}">${l.puntaje.toFixed(0)}%</span>${barra(l.puntaje)}</div>
            </li>`,
          )
          .join("")}</ul>`
      : `<p class="meta">Registra líderes con sus datos natales para ver su sinastría con la empresa.</p>`}`;
}

async function cargar(): Promise<void> {
  empresa = await api.get<Empresa | null>("/api/empresa");
  if (empresa) {
    for (const c of CAMPOS) (form.elements.namedItem(c) as HTMLInputElement).value = empresa[c] ?? "";
    await rellenarNatal(form, empresa);
  }
  pintarCarta();
  pintarAtributos();
  await pintarLideres();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiarErrores(form);
  const datos: Record<string, unknown> = {};
  for (const c of CAMPOS) datos[c] = (form.elements.namedItem(c) as HTMLInputElement).value;
  Object.assign(datos, leerNatal(form));
  const btn = form.querySelector<HTMLButtonElement>("[type=submit]")!;
  btn.disabled = true;
  try {
    await api.put("/api/empresa", datos);
    toast("Carta de la empresa trazada. Se recalcularon los postulantes.");
    await cargar();
    $("#carta-empresa").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    mostrarErrores(form, err);
  } finally {
    btn.disabled = false;
  }
});

iniciarNatal(form)
  .then(cargar)
  .catch(() => toast("No se pudo cargar la empresa.", "error"));
