import { api, ApiError } from "../api.js";
import {
  chipArquetipo, COLOR_ELEMENTO, iniciarNatal, itemAspecto, itemConflicto, leerNatal, panelAtributos, RELACION_LIDER,
  rellenarNatal, ruedaZodiacal,
} from "../astro-ui.js";
import {
  $, $$, anillo, colorPuntaje, confirmar, esAdmin, esc, iniciarDropzone, limpiarErrores, mostrarErrores, sesion, toast, vacio,
} from "../ui.js";
import type { AfinidadesLider, AfinidadLider, JefeSugerido, Lider } from "../types.js";

const dlg = $<HTMLDialogElement>("#dlg-lider");
const form = $<HTMLFormElement>("#form-lider");
const inputCv = form.querySelector<HTMLInputElement>("[name=cv]")!;
const selJefe = form.elements.namedItem("jefe_id") as HTMLSelectElement;
const refrescarCv = iniciarDropzone($("#zona-cv-lider"), inputCv);
let editandoId: number | null = null;
let lideres: Lider[] = [];

/** Los que dependen (directa o indirectamente) de un líder: no pueden ser su jefe. */
function subordinados(id: number): Set<number> {
  const salida = new Set<number>();
  let nuevos = [id];
  while (nuevos.length) {
    nuevos = lideres.filter((l) => l.jefe_id != null && nuevos.includes(l.jefe_id) && !salida.has(l.id)).map((l) => l.id);
    nuevos.forEach((n) => salida.add(n));
  }
  return salida;
}

function opcionesJefe(id: number | null, actual: number | null): void {
  const excluidos = id ? subordinados(id).add(id) : new Set<number>();
  selJefe.innerHTML = `<option value="">Nadie: encabeza la cadena</option>` + lideres
    .filter((l) => !excluidos.has(l.id))
    .map((l) => `<option value="${l.id}" ${l.id === actual ? "selected" : ""}>${esc(l.nombre)} · ${esc(l.cargo)}</option>`)
    .join("");
}

/** Sugiere el jefe inmediato según el perfil del cargo del líder (su «superior inmediato»). */
async function sugerirJefe(): Promise<void> {
  if (!esAdmin) return;
  const caja = $("#jefe-sugerido");
  const cargo = (form.elements.namedItem("cargo") as HTMLInputElement).value.trim();
  const s = cargo ? await api.get<JefeSugerido | null>(`/api/lideres/jefe-sugerido?cargo=${encodeURIComponent(cargo)}${editandoId ? `&id=${editandoId}` : ""}`) : null;
  const yaAsignado = s?.jefe_id != null && String(s.jefe_id) === selJefe.value;
  caja.hidden = !s || yaAsignado || !!(s.jefe_id && !selJefe.querySelector(`option[value="${s.jefe_id}"]`));
  if (!s || caja.hidden) return;
  caja.innerHTML = s.jefe_id
    ? `Según el perfil «${esc(s.perfil)}», su superior inmediato es «${esc(s.superior)}»: <strong>${esc(s.jefe_nombre)}</strong>.
       <button type="button" class="btn btn-sec btn-sm" data-usar-jefe="${s.jefe_id}">Asignar</button>`
    : `Según el perfil «${esc(s.perfil)}», su superior inmediato es «${esc(s.superior)}», pero aún no hay un líder registrado con ese cargo.`;
}

const dlgCarta = $<HTMLDialogElement>("#dlg-carta");

const CAMPOS_TEXTO = ["nombre", "cargo", "area", "email", "descripcion", "estilo_liderazgo", "expectativas", "equipo"] as const;

function tarjetaLider(l: Lider): string {
  const sol = l.carta?.posiciones.sol;
  const astros = l.carta
    ? `<div class="astros-mini">
        ${["sol", "luna", "ascendente"]
          .map((k) => l.carta!.posiciones[k])
          .filter(Boolean)
          .map((p) => `<span title="${esc(p.astro)} en ${esc(p.signo)}"><b>${p.glifo}</b> <i style="color:${COLOR_ELEMENTO[p.elemento]}">${p.simbolo}</i> ${esc(p.signo)}</span>`)
          .join("")}
      </div>`
    : `<p class="nota">Sin datos natales: no se puede medir la sinergia astral.</p>`;
  const cv = l.cv_archivo
    ? `<a class="cv-enlace" href="/api/lideres/${l.id}/cv">✒ Hoja de vida del líder</a>`
    : `<span class="cv-enlace falta">Falta la hoja de vida del líder</span>`;
  return `<article class="tarjeta tarjeta-lider">
      <header class="tarjeta-cab">
        <div class="avatar" style="--c:${sol ? COLOR_ELEMENTO[sol.elemento] : "var(--violet)"}">${sol ? sol.simbolo : esc(l.nombre[0])}</div>
        <div>
          <h3>${esc(l.nombre)}</h3>
          <span class="meta">${esc(l.cargo)} · ${esc(l.area)}</span>
        </div>
      </header>
      ${chipArquetipo(l.carta, true)}
      ${l.jefe_nombre ? `<p class="meta">Reporta a <strong>${esc(l.jefe_nombre)}</strong></p>` : ""}
      ${l.integrantes?.length ? `<p class="meta integrantes">★ En su equipo: ${l.integrantes
        .map((i) => `<a href="/candidatos/${i.id}" title="${esc(i.cargo)}">${esc(i.nombre)}</a>`).join(", ")}</p>` : ""}
      ${astros}
      ${l.carta ? `<p class="meta">Ante el conflicto tiende a <strong>${l.carta.conflicto.dominante.toLowerCase()}</strong>
          · necesita ${esc(l.carta.conflicto.necesita)}.</p>` : ""}
      <p class="texto-corto">${esc(l.descripcion)}</p>
      ${cv}
      <footer class="tarjeta-pie">
        <span class="meta">${l.vacantes ?? 0} cargo(s) a cargo${(() => {
          const equipo = lideres.filter((o) => o.jefe_id === l.id).length;
          return equipo ? ` · ${equipo} líder(es) en su equipo` : "";
        })()}</span>
        <div class="lista-acciones">
          ${l.carta ? `<button class="btn btn-sm" data-carta="${l.id}">Ver carta</button>
            <button class="btn btn-sec btn-sm" data-afinidad="${l.id}">Afinidad</button>` : ""}
          ${esAdmin || l.id === sesion.liderId ? `<button class="btn btn-sec btn-sm" data-editar="${l.id}">Editar</button>` : ""}
          ${esAdmin ? `<button class="btn btn-peligro btn-sm" data-borrar="${l.id}" aria-label="Eliminar a ${esc(l.nombre)}">Eliminar</button>` : ""}
        </div>
      </footer>
    </article>`;
}

async function cargar(): Promise<void> {
  lideres = await api.get<Lider[]>("/api/lideres");
  $("#lista-lideres").innerHTML = lideres.length
    ? lideres.map(tarjetaLider).join("")
    : vacio("♃", "Aún no hay líderes", "Registra al líder o jefe que va a recibir a los nuevos integrantes.");
}

/** Contadores y medidor de detalle de las descripciones. */
function actualizarMedidor(): void {
  let total = 0;
  const areas = $$<HTMLTextAreaElement>("textarea[data-min]", form);
  for (const ta of areas) {
    const min = Number(ta.dataset.min);
    const largo = ta.value.trim().length;
    total += Math.min(1, largo / min);
    const cont = form.querySelector<HTMLElement>(`[data-contador="${ta.name}"]`)!;
    cont.textContent = largo >= min ? `✔ ${largo} caracteres` : `${largo} / ${min} caracteres mínimos`;
    cont.classList.toggle("ok", largo >= min);
  }
  const pct = Math.round((total / areas.length) * 100);
  const nivel = pct >= 100 ? "Descripción completa" : pct >= 60 ? "Le falta un poco de detalle" : "Descripción insuficiente";
  $("#medidor-detalle").innerHTML = `
    <div class="medidor-cab"><span>Nivel de detalle</span><strong>${pct}% · ${nivel}</strong></div>
    <div class="barra"><span style="width:${pct}%;background:${pct >= 100 ? "var(--match)" : pct >= 60 ? "var(--decision)" : "var(--descartado)"}"></span></div>`;
}

async function abrir(lider?: Lider): Promise<void> {
  form.reset();
  limpiarErrores(form);
  editandoId = lider?.id ?? null;
  $("#dlg-lider-titulo").textContent = lider ? `Editar a ${lider.nombre}` : "Registrar líder";
  if (lider) {
    for (const c of CAMPOS_TEXTO) {
      (form.elements.namedItem(c) as HTMLInputElement).value = lider[c] ?? "";
    }
  }
  await rellenarNatal(form, lider ?? {});
  opcionesJefe(editandoId, lider?.jefe_id ?? null);
  // Un líder edita su ficha, pero a quién reporta lo define el administrador.
  selJefe.disabled = !esAdmin;
  if (!esAdmin) {
    const jefe = lideres.find((l) => l.id === lider?.id)?.jefe_nombre;
    selJefe.innerHTML = `<option value="">${jefe ? esc(jefe) : "Nadie: encabeza la cadena"}</option>`;
  }
  $("#jefe-sugerido").hidden = true;
  if (lider) sugerirJefe().catch(() => undefined);
  refrescarCv();
  const actual = $("#cv-actual");
  actual.hidden = !lider?.cv_archivo;
  actual.innerHTML = lider?.cv_archivo
    ? `Hoja de vida actual: <a href="/api/lideres/${lider.id}/cv">${esc(lider.cv_archivo.replace(/^[0-9a-f]{10}_/, ""))}</a>. Sube otra solo si quieres reemplazarla.`
    : "";
  actualizarMedidor();
  dlg.showModal();
}

form.addEventListener("input", actualizarMedidor);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const datos = new FormData();
  for (const c of CAMPOS_TEXTO) datos.append(c, (form.elements.namedItem(c) as HTMLInputElement).value);
  datos.append("jefe_id", selJefe.value);
  const natal = leerNatal(form);
  if (natal.fecha_nac) for (const [k, v] of Object.entries(natal)) datos.append(k, v);
  if (inputCv.files?.[0]) datos.append("cv", inputCv.files[0]);
  const btn = form.querySelector<HTMLButtonElement>("[type=submit]")!;
  btn.disabled = true;
  try {
    if (editandoId) await api.put(`/api/lideres/${editandoId}`, datos);
    else await api.post("/api/lideres", datos);
    dlg.close();
    toast(editandoId ? "Líder actualizado. Se recalcularon sus postulantes." : "Líder registrado");
    await cargar();
  } catch (err) {
    mostrarErrores(form, err);
  } finally {
    btn.disabled = false;
  }
});

(form.elements.namedItem("cargo") as HTMLInputElement).addEventListener("change", () => sugerirJefe().catch(() => undefined));
selJefe.addEventListener("change", () => sugerirJefe().catch(() => undefined));

document.addEventListener("click", async (e) => {
  const t = e.target as HTMLElement;
  t.closest("[data-cerrar]")?.closest("dialog")?.close();
  const usarJefe = t.closest<HTMLElement>("[data-usar-jefe]");
  if (usarJefe) {
    selJefe.value = usarJefe.dataset.usarJefe!;
    $("#jefe-sugerido").hidden = true;
  }
  const verCarta = t.closest<HTMLElement>("[data-carta]");
  if (verCarta) await abrirCarta(await api.get<Lider>(`/api/lideres/${verCarta.dataset.carta}`));
  const verAfinidad = t.closest<HTMLElement>("[data-afinidad]");
  if (verAfinidad) await abrirAfinidad(Number(verAfinidad.dataset.afinidad));
  const editar = t.closest<HTMLElement>("[data-editar]");
  if (editar) await abrir(await api.get<Lider>(`/api/lideres/${editar.dataset.editar}`));
  const borrar = t.closest<HTMLElement>("[data-borrar]");
  if (borrar && confirmar("¿Eliminar este líder? Esta acción no se puede deshacer.")) {
    try {
      await api.del(`/api/lideres/${borrar.dataset.borrar}`);
      toast("Líder eliminado");
      await cargar();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No se pudo eliminar.", "error");
    }
  }
});

async function abrirCarta(l: Lider): Promise<void> {
  if (!l.carta) return;
  $("#dlg-carta-titulo").textContent = `Carta de ${l.nombre}`;
  $("#carta-cuerpo").innerHTML = `
    <div class="carta-cabecera">
      <div class="carta-rueda">${ruedaZodiacal(l.carta, 240)}</div>
      <div><p class="eyebrow">La regla de los astros</p>
        ${chipArquetipo(l.carta, true)}
        <p class="parrafo"><strong>${esc(l.carta.resumen)}</strong></p>
        <p class="parrafo">${esc(l.carta.perfil_laboral)}</p></div>
    </div>
    ${panelAtributos(l.carta)}`;
  dlgCarta.showModal();
}

// --- Afinidad con otros líderes ---------------------------------------------------------
// La misma lectura que AGATA hace entre un postulante y su líder (sinastría y manejo de conflictos), ahora
// entre líderes. Es solo informativa: no cambia el puntaje de ningún postulante.

const dlgAfinidad = $<HTMLDialogElement>("#dlg-afinidad");
const primerNombre = (n: string) => n.split(" ")[0];

function itemAfinidad(a: AfinidadLider, yo: string): string {
  const color = a.arquetipo ? COLOR_ELEMENTO[a.arquetipo.elemento] : "var(--violet)";
  const cab = `<header class="afinidad-cab">
      <div class="avatar" style="--c:${color}">${esc(a.nombre[0])}</div>
      <div class="afinidad-quien">
        <h3>${esc(a.nombre)}</h3>
        <span class="meta">${esc(a.cargo)}</span>
        <span class="chip chip-relacion">${RELACION_LIDER[a.relacion]}</span>
      </div>
      ${a.sinastria ? `<div class="afinidad-num">${anillo(a.sinastria.puntaje, 66, 6)}<span>sinastría</span></div>` : ""}
    </header>`;
  if (!a.sinastria || !a.conflicto) {
    return `<article class="afinidad-item sin-carta">${cab}
        <p class="nota">Sin datos natales: no se puede medir su afinidad.</p></article>`;
  }
  const s = a.sinastria;
  const d = a.conflicto;
  return `<article class="afinidad-item">${cab}
      <p class="meta">${s.armonicos} aspectos armónicos · ${s.tensos} tensos · afinidad elemental ${s.elemental.toFixed(0)}%
        · ante el conflicto <strong style="color:${colorPuntaje(d.puntaje)}">${d.puntaje.toFixed(0)}%</strong></p>
      <p class="dinamica-riesgo">${esc(d.riesgo)}</p>
      <details class="afinidad-lectura">
        <summary>Ver la lectura completa</summary>
        <h4 class="mini-titulo">Aspectos más fuertes</h4>
        <ul class="aspectos">${s.aspectos.map(itemAspecto).join("") || `<li class="meta">Sin aspectos dentro de orbe.</li>`}</ul>
        <div class="grid-2">
          <div><h4 class="mini-titulo">Puntos de fricción</h4>
            <ul class="aspectos">${d.fricciones.map((x) => itemConflicto(x, "tenso")).join("") || `<li class="meta">Sin fricciones fuertes entre sus cartas.</li>`}</ul></div>
          <div><h4 class="mini-titulo">Puentes para resolver</h4>
            <ul class="aspectos">${d.puentes.map((x) => itemConflicto(x, "armonico")).join("") || `<li class="meta">Pocos puentes naturales: habrá que acordar cómo discrepar.</li>`}</ul></div>
        </div>
        <div class="consejos">
          <div class="consejo"><strong>Para ${esc(yo)}</strong><p>${esc(d.consejo_para_a)}</p></div>
          <div class="consejo"><strong>Para ${esc(a.nombre)}</strong><p>${esc(d.consejo_para_b)}</p></div>
        </div>
      </details>
    </article>`;
}

async function abrirAfinidad(id: number): Promise<void> {
  let datos: AfinidadesLider;
  try {
    datos = await api.get<AfinidadesLider>(`/api/lideres/${id}/afinidad`);
  } catch {
    toast("No se pudo leer la afinidad de este líder.", "error");
    return;
  }
  const { lider, afinidades } = datos;
  $("#dlg-afinidad-titulo").textContent = `Afinidad de ${lider.nombre} con otros líderes`;
  $<HTMLAnchorElement>("#afinidad-red").href = `/red?centro=l${id}&vista=afinidad`;
  const medidas = afinidades.filter((a) => a.sinastria);
  const promedio = medidas.length ? medidas.reduce((t, a) => t + a.sinastria!.puntaje, 0) / medidas.length : null;
  const intro = `<p class="parrafo">La misma lectura que AGATA hace entre un postulante y su líder: sinastría y manejo de
      conflictos. Es solo informativa: no cambia el puntaje de ningún postulante.${esAdmin ? "" : " Ves a los líderes de tu cadena de mando."}</p>
    ${promedio != null ? `<p class="meta">Sinastría promedio de ${esc(primerNombre(lider.nombre))} con ${medidas.length} líder(es):
      <strong style="color:${colorPuntaje(promedio)}">${promedio.toFixed(0)}%</strong>
      · la más alta, con <strong>${esc(medidas[0].nombre)}</strong> (${medidas[0].sinastria!.puntaje.toFixed(0)}%).</p>` : ""}`;
  $("#afinidad-cuerpo").innerHTML = !lider.tiene_carta
    ? `<p class="nota">${esc(lider.nombre)} no tiene datos natales: registra su fecha, hora y ciudad de nacimiento para medir su afinidad.</p>`
    : !afinidades.length
      ? vacio("♃", "No hay otros líderes para comparar", esAdmin ? "Registra más líderes para ver su afinidad." : "Tu cadena de mando no tiene más líderes.")
      : `${intro}<div class="afinidad-lista">${afinidades.map((a) => itemAfinidad(a, lider.nombre)).join("")}</div>`;
  dlgAfinidad.showModal();
}

$("#btn-nuevo-lider")?.addEventListener("click", () => abrir());

iniciarNatal(form).then(() => {
  if (esAdmin && new URLSearchParams(location.search).has("nuevo")) abrir();
});
cargar()
  .then(() => {
    // Desde la Red se llega con ?afinidad=<id> para abrir directamente la afinidad de ese líder.
    const pedido = Number(new URLSearchParams(location.search).get("afinidad"));
    if (pedido && lideres.some((l) => l.id === pedido)) abrirAfinidad(pedido);
  })
  .catch(() => toast("No se pudieron cargar los líderes.", "error"));
