import { api, ApiError } from "../api.js";
import { COLOR_ELEMENTO } from "../astro-ui.js";
import { nivelRol, opcionesPerfiles } from "../perfil-ui.js";
import { radar } from "../radar.js";
import { $, $$, confirmar, esAdmin, esc, fecha, iniciarDropzone, limpiarErrores, mostrarErrores, toast, vacio } from "../ui.js";
import type {
  Habilidad, Lider, Perfil, PerfilDetalle, Pesos, PropuestaPerfil, TipoExcluyente, TipoHabilidad, Vacante, VacanteResumen,
} from "../types.js";

const dlg = $<HTMLDialogElement>("#dlg-vacante");
const form = $<HTMLFormElement>("#form-vacante");
const contHab = $("#habilidades");
const inputPerfil = form.querySelector<HTMLInputElement>("[name=perfil]")!;
const selPerfil = form.elements.namedItem("perfil_id") as HTMLSelectElement;
const resultadoArchivo = $("#resultado-archivo");

let lideres: Lider[] = [];
let perfiles: Perfil[] = [];
/** Archivo concreto de la carpeta con el que se llenó el cargo (puede haber varias versiones). */
let perfilArchivo: string | null = null;
/** Superior inmediato según el perfil elegido y el líder registrado que le corresponde (si lo hay). */
let perfilSuperior = "";
let liderDelPerfil: number | null = null;
let vacantes: VacanteResumen[] = [];
let filtro = "todas";
let editandoId: number | null = null;
let habilidades: Habilidad[] = [];

const nuevaHabilidad = (): Habilidad => ({ nombre: "", peso: 3, nivel: 3, palabras_clave: "", tipo: "tecnica" });
const casillaTecnico = () => form.elements.namedItem("tecnico") as HTMLInputElement;
/** Lo único que puede ser innegociable: título, experiencia y proyectos. */
const EXCLUYENTES: TipoExcluyente[] = ["titulo", "experiencia", "proyectos"];
let excluyentesDelPerfil: Partial<Record<TipoExcluyente, string>> = {};

const PESOS: { campo: keyof Pesos; nombre: string; color: string }[] = [
  { campo: "peso_lider", nombre: "Líder ✶", color: "var(--gold)" },
  { campo: "peso_empresa", nombre: "Empresa ✶", color: "var(--bronze)" },
  { campo: "peso_elemento", nombre: "Elemento", color: "var(--violet)" },
  { campo: "peso_conflicto", nombre: "Conflictos", color: "var(--descartado)" },
  { campo: "peso_cv", nombre: "Hoja de vida", color: "var(--aire)" },
  { campo: "peso_ia", nombre: "IA", color: "var(--flame)" },
];

// --- Listado ---------------------------------------------------------------

function tarjetaVacante(v: VacanteResumen): string {
  const abierta = v.estado === "abierta";
  return `<article class="tarjeta tarjeta-vacante ${abierta ? "" : "cerrada"}">
    <header class="tarjeta-cab">
      <div>
        <h3><a href="/vacantes/${v.id}">${esc(v.cargo)}</a></h3>
        <span class="meta">${esc(v.area)}</span>
      </div>
      <span class="estado estado-${v.estado}">${abierta ? "Abierta" : "Cerrada"}</span>
    </header>
    ${v.tecnico ? `<p class="meta">⌘ Cargo técnico: pide portafolio, GitHub, LinkedIn y repositorio</p>` : ""}
    <p class="meta">Líder: <strong>${esc(v.lider_nombre)}</strong> · ${esc(v.lider_cargo)}</p>
    ${v.perfil_id
      ? v.perfil_titulo
        ? `<p class="perfil-ligado">▤ Perfil: ${esAdmin ? `<a href="/perfiles">${esc(v.perfil_titulo)}</a>` : esc(v.perfil_titulo)}</p>`
        : `<p class="perfil-ligado falta">▤ Su perfil ya no está en Perfiles</p>`
      : `<p class="perfil-ligado falta">▤ Sin perfil ligado${esAdmin ? ": edítalo para ligarlo" : ""}</p>`}
    <p class="texto-corto">${esc(v.descripcion)}</p>
    <div class="vacante-stats">
      <div><strong>${v.candidatos}</strong><span>postulantes</span></div>
      <div class="c-pendiente"><strong>${v.n_pendientes ?? 0}</strong><span>por decidir</span></div>
      <div class="c-aprobado"><strong>${v.n_aprobados ?? 0}</strong><span>aprobados</span></div>
      <div class="c-rechazado"><strong>${v.n_rechazados ?? 0}</strong><span>rechazados</span></div>
    </div>
    <p class="meta">${v.n_habilidades} habilidades · Líder ✶ ${v.peso_lider} / Empresa ✶ ${v.peso_empresa} / Elemento ${v.peso_elemento} / Conflictos ${v.peso_conflicto} / CV ${v.peso_cv} / IA ${v.peso_ia}
      ${v.elemento_afin ? ` · Elemento afín <b style="color:${COLOR_ELEMENTO[v.elemento_afin]}">${esc(v.elemento_afin)}</b>` : ""}
      · ${fecha(v.creado)}</p>
    <footer class="tarjeta-pie acciones-wrap">
      <a class="btn btn-sm" href="/vacantes/${v.id}">Ver postulantes</a>
      ${esAdmin ? `<button class="btn btn-sec btn-sm" data-editar="${v.id}">Editar</button>` : ""}
      <button class="btn btn-sec btn-sm" data-copiar="${v.id}" ${abierta ? "" : "disabled"}>Copiar link</button>
      ${esAdmin ? `<button class="btn btn-sec btn-sm" data-duplicar="${v.id}">Duplicar</button>
      <button class="btn btn-sec btn-sm" data-estado="${v.id}" data-nuevo="${abierta ? "cerrada" : "abierta"}">${abierta ? "Cerrar" : "Reabrir"}</button>
      <button class="btn btn-peligro btn-sm" data-borrar="${v.id}" aria-label="Eliminar ${esc(v.cargo)}">Eliminar</button>` : ""}
    </footer>
  </article>`;
}

function pintarLista(): void {
  const visibles = vacantes.filter((v) => filtro === "todas" || v.estado === filtro);
  $("#lista-vacantes").innerHTML = visibles.length
    ? visibles.map(tarjetaVacante).join("")
    : esAdmin
      ? vacio("△", "No hay cargos aquí", "Crea un cargo con su área, su líder y la matriz de habilidades.")
      : vacio("△", "No hay cargos aquí", "Aún no hay cargos en tu cadena de mando.");
}

async function cargar(): Promise<void> {
  // Un líder solo consulta sus cargos: el editor (líderes y perfiles) es del administrador.
  if (!esAdmin) {
    vacantes = await api.get<VacanteResumen[]>("/api/vacantes");
    return pintarLista();
  }
  [vacantes, lideres, perfiles] = await Promise.all([
    api.get<VacanteResumen[]>("/api/vacantes"),
    api.get<Lider[]>("/api/lideres"),
    api.get<Perfil[]>("/api/perfiles"),
  ]);
  pintarLista();
}

// --- Editor de habilidades -----------------------------------------------------

const opcionesNum = (sel: number) =>
  [1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === sel ? "selected" : ""}>${n}</option>`).join("");

function pintarHabilidades(): void {
  contHab.innerHTML = habilidades
    .map(
      (h, i) => `<div class="hab-fila" data-i="${i}">
        <label class="campo"><span class="sr">Habilidad ${i + 1}</span>
          <input data-k="nombre" value="${esc(h.nombre)}" placeholder="Habilidad (ej. ROS 2)"></label>
        <div class="campo campo-num"><label for="hab-${i}-peso">Peso</label><select id="hab-${i}-peso" data-k="peso">${opcionesNum(h.peso)}</select></div>
        <div class="campo campo-num"><label for="hab-${i}-nivel">Nivel</label><select id="hab-${i}-nivel" data-k="nivel">${opcionesNum(h.nivel)}</select></div>
        <div class="campo campo-tipo"><label for="hab-${i}-tipo">Tipo</label><select id="hab-${i}-tipo" data-k="tipo"
            title="Las blandas no se buscan por palabras clave: el oráculo IA las lee o las deduce de los proyectos">
          <option value="tecnica" ${h.tipo === "tecnica" ? "selected" : ""}>Técnica</option>
          <option value="blanda" ${h.tipo === "blanda" ? "selected" : ""}>Blanda</option></select></div>
        <label class="campo hab-claves"><span class="sr">Palabras clave</span>
          <input data-k="palabras_clave" value="${esc(h.palabras_clave)}"
            placeholder="${h.tipo === "blanda" ? "Blanda: la IA la lee o la deduce de los proyectos" : "Palabras clave del CV: ros2, gazebo, rviz"}"></label>
        <button type="button" class="btn-icono" data-quitar-hab="${i}" aria-label="Quitar habilidad ${i + 1}">✕</button>
      </div>`,
    )
    .join("");
  pintarPreview();
}

function pintarPreview(): void {
  const validas = habilidades.filter((h) => h.nombre.trim());
  $("#preview-radar").innerHTML =
    validas.length >= 3
      ? radar(
          validas.map((h) => h.nombre),
          [{ nombre: "Nivel requerido", valores: validas.map((h) => h.nivel * 20), color: "var(--gold)" }],
          { tam: 300, titulo: "Perfil requerido" },
        )
      : `<p class="nota">Agrega al menos 3 habilidades para ver el diagrama radial del perfil.</p>`;
}

contHab.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  const fila = t.closest<HTMLElement>(".hab-fila");
  if (!fila || !t.dataset.k) return;
  const h = habilidades[Number(fila.dataset.i)];
  if (t.dataset.k === "nombre") {
    h.nombre = t.value;
  } else if (t.dataset.k === "palabras_clave") {
    h.palabras_clave = t.value;
  } else if (t.dataset.k === "tipo") {
    h.tipo = t.value as TipoHabilidad;
    return pintarHabilidades(); // cambia la ayuda de las palabras clave
  } else {
    h[t.dataset.k as "peso" | "nivel"] = Number(t.value);
  }
  pintarPreview();
});

// --- Pesos y líder ------------------------------------------------------------

function pintarPesos(): void {
  const vals = PESOS.map((p) => Number((form.elements.namedItem(p.campo) as HTMLInputElement).value));
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  PESOS.forEach((p, i) => {
    form.querySelector<HTMLOutputElement>(`[data-out=${p.campo}]`)!.textContent = `${Math.round((vals[i] / total) * 100)}%`;
  });
  $("#pesos-barra").innerHTML = vals
    .map((v, i) => (v ? `<span style="flex:${v};background:${PESOS[i].color}">${PESOS[i].nombre} ${Math.round((v / total) * 100)}%</span>` : ""))
    .join("");
}

function pintarLiderPreview(): void {
  const sel = form.elements.namedItem("lider_id") as HTMLSelectElement;
  const l = lideres.find((x) => x.id === Number(sel.value));
  const box = $("#lider-preview");
  box.hidden = !l;
  if (!l) return;
  const area = form.elements.namedItem("area") as HTMLInputElement;
  if (!area.value.trim()) area.value = l.area;
  box.innerHTML = `<strong>${esc(l.nombre)}</strong> · ${esc(l.cargo)}
    ${l.carta ? `<span class="meta"> · ${esc(l.carta.resumen)}</span>` : `<span class="nota"> · Sin carta astral registrada</span>`}
    ${perfilSuperior && l.id !== liderDelPerfil
      ? `<p class="aviso-perfil">Según el perfil, este cargo reporta a «${esc(perfilSuperior)}», no a ${esc(l.nombre)}.</p>`
      : ""}`;
}

form.addEventListener("input", (e) => {
  const t = e.target as HTMLElement;
  if (t.matches("input[type=range]")) pintarPesos();
  if (t.matches("[name=lider_id]")) pintarLiderPreview();
  if (t.matches("textarea[data-min]")) contador();
});

function contador(): void {
  const ta = form.elements.namedItem("descripcion") as HTMLTextAreaElement;
  const min = Number(ta.dataset.min);
  const largo = ta.value.trim().length;
  const c = form.querySelector<HTMLElement>("[data-contador=descripcion]")!;
  c.textContent = largo >= min ? `✔ ${largo} caracteres` : `${largo} / ${min} caracteres mínimos`;
  c.classList.toggle("ok", largo >= min);
}

// --- Abrir / guardar -----------------------------------------------------------

async function abrir(vac?: Vacante, duplicar = false, perfilInicial = ""): Promise<void> {
  if (!lideres.length) {
    toast("Primero registra al líder o jefe del cargo.", "error");
    location.href = "/lideres?nuevo=1";
    return;
  }
  form.reset();
  refrescarPerfil();
  resultadoArchivo.hidden = true;
  limpiarErrores(form);
  editandoId = vac && !duplicar ? vac.id : null;
  $("#dlg-vacante-titulo").textContent = editandoId ? `Editar: ${vac!.cargo}` : duplicar ? "Duplicar cargo" : "Nuevo cargo";
  const sel = form.elements.namedItem("lider_id") as HTMLSelectElement;
  sel.innerHTML =
    `<option value="">Selecciona…</option>` +
    lideres.map((l) => `<option value="${l.id}">${esc(l.nombre)} · ${esc(l.cargo)}</option>`).join("");
  // Los cargos creados antes de la carpeta pueden guardarse sin perfil; los demás no.
  const sinPerfilPermitido = !!vac && !duplicar && !vac.perfil_id;
  selPerfil.innerHTML =
    `<option value="">${sinPerfilPermitido ? "Sin perfil (cargo creado antes de Perfiles)" : "Elige el perfil del cargo…"}</option>` +
    opcionesPerfiles(perfiles, vac?.perfil_id ?? perfilInicial);
  form.querySelector<HTMLElement>("[data-req-perfil]")!.hidden = sinPerfilPermitido;
  perfilArchivo = vac?.perfil_archivo ?? null;
  perfilSuperior = "";
  liderDelPerfil = null;

  if (vac) {
    const set = (n: string, v: unknown) => ((form.elements.namedItem(n) as HTMLInputElement).value = String(v ?? ""));
    set("cargo", duplicar ? `${vac.cargo} (copia)` : vac.cargo);
    set("area", vac.area);
    set("lider_id", vac.lider_id);
    set("descripcion", vac.descripcion);
    set("elemento_afin", vac.elemento_afin ?? "");
    casillaTecnico().checked = !!vac.tecnico;
    for (const t of EXCLUYENTES) set(`excl_${t}`, vac.excluyentes?.find((x) => x.tipo === t)?.texto ?? "");
    for (const p of PESOS) set(p.campo, vac[p.campo]);
    habilidades = vac.habilidades.map(({ nombre, peso, nivel, palabras_clave, tipo }) => ({ nombre, peso, nivel, palabras_clave, tipo }));
  } else {
    habilidades = [nuevaHabilidad(), nuevaHabilidad(), nuevaHabilidad()];
    casillaTecnico().checked = false;
    for (const t of EXCLUYENTES) (form.elements.namedItem(`excl_${t}`) as HTMLInputElement).value = "";
  }
  $("#excl-perfil").hidden = true;
  pintarHabilidades();
  pintarPesos();
  pintarLiderPreview();
  contador();
  dlg.showModal();
  if (vac?.perfil_id && !perfiles.some((p) => p.id === vac.perfil_id)) {
    mostrarResultado("con-error", `El perfil con el que se creó este cargo («${esc(vac.perfil_archivo ?? vac.perfil_id)}») ya no está en Perfiles. Elige otro.`);
  } else if (sinPerfilPermitido) {
    mostrarResultado("", `Este cargo se creó antes de Perfiles. Elige su perfil para ligarlo.`);
  } else if (!vac && perfilInicial) {
    await aplicarPerfil(perfilInicial);
  } else if (vac?.perfil_id) {
    // Al editar: solo se averigua el superior del perfil, sin tocar lo que ya tiene el cargo.
    const d = await api.get<PerfilDetalle>(`/api/perfiles/${encodeURIComponent(vac.perfil_id)}`);
    perfilSuperior = d.perfil.superior ?? "";
    liderDelPerfil = d.propuesta.campos.lider_id;
    pintarLiderPreview();
    sugerirExcluyentes(d.perfil);
  }
}

/** Ofrece usar la formación y la experiencia del perfil como requisitos excluyentes (el líder decide). */
function sugerirExcluyentes(p: Perfil): void {
  const caja = $("#excl-perfil");
  excluyentesDelPerfil = { titulo: (p.formacion ?? "").slice(0, 300), experiencia: (p.experiencia ?? "").slice(0, 300) };
  const partes = ([["Formación", p.formacion], ["Experiencia", p.experiencia]] as const).filter(([, v]) => v);
  caja.hidden = !partes.length;
  caja.innerHTML = partes.length
    ? `Según el perfil · ${partes.map(([n, v]) => `<strong>${n}:</strong> ${esc(v!.length > 140 ? `${v!.slice(0, 139)}…` : v)}`).join(" · ")}
       <button type="button" class="btn btn-sec btn-sm" data-usar-excl>Usar como requisitos</button>`
    : "";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const val = (n: string) => (form.elements.namedItem(n) as HTMLInputElement).value;
  const datos = {
    cargo: val("cargo"),
    area: val("area"),
    lider_id: val("lider_id"),
    descripcion: val("descripcion"),
    elemento_afin: val("elemento_afin"),
    tecnico: casillaTecnico().checked,
    excluyentes: Object.fromEntries(EXCLUYENTES.map((t) => [t, val(`excl_${t}`).trim()])),
    perfil_id: selPerfil.value,
    perfil_archivo: selPerfil.value ? perfilArchivo : null,
    ...Object.fromEntries(PESOS.map((p) => [p.campo, Number(val(p.campo))])),
    habilidades: habilidades.filter((h) => h.nombre.trim()),
  };
  const btn = form.querySelector<HTMLButtonElement>("[type=submit]")!;
  btn.disabled = true;
  try {
    const r = editandoId
      ? await api.put<{ id: number }>(`/api/vacantes/${editandoId}`, datos)
      : await api.post<{ id: number }>("/api/vacantes", datos);
    dlg.close();
    toast(editandoId ? "Cargo actualizado. Se recalcularon los puntajes." : "Cargo creado");
    if (new URLSearchParams(location.search).has("volver")) location.href = `/vacantes/${r.id}`;
    else await cargar();
  } catch (err) {
    mostrarErrores(form, err);
  } finally {
    btn.disabled = false;
  }
});

$("#btn-add-hab").addEventListener("click", () => {
  habilidades.push(nuevaHabilidad());
  pintarHabilidades();
  contHab.querySelector<HTMLInputElement>(".hab-fila:last-child input")?.focus();
});

document.addEventListener("click", async (e) => {
  const t = e.target as HTMLElement;
  const el = (sel: string) => t.closest<HTMLElement>(sel);
  if (el("[data-cerrar]")) dlg.close();
  if (el("[data-usar-excl]")) {
    for (const [tipo, texto] of Object.entries(excluyentesDelPerfil)) {
      if (texto) (form.elements.namedItem(`excl_${tipo}`) as HTMLInputElement).value = texto;
    }
    $("#excl-perfil").hidden = true;
  }

  const qh = el("[data-quitar-hab]");
  if (qh) {
    habilidades.splice(Number(qh.dataset.quitarHab), 1);
    pintarHabilidades();
  }

  const editar = el("[data-editar]") ?? el("[data-duplicar]");
  if (editar) {
    const id = editar.dataset.editar ?? editar.dataset.duplicar;
    await abrir(await api.get<Vacante>(`/api/vacantes/${id}`), "duplicar" in editar.dataset);
  }
  const copiar = el("[data-copiar]");
  if (copiar) {
    const url = `${location.origin}/postular/${copiar.dataset.copiar}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link de postulación copiado");
    } catch {
      window.prompt("Copia el link de postulación:", url);
    }
  }
  const estado = el("[data-estado]");
  if (estado) {
    await api.patch(`/api/vacantes/${estado.dataset.estado}/estado`, { estado: estado.dataset.nuevo });
    toast(estado.dataset.nuevo === "cerrada" ? "Vacante cerrada" : "Vacante reabierta");
    await cargar();
  }
  const borrar = el("[data-borrar]");
  if (borrar && confirmar("¿Eliminar el cargo y todas sus postulaciones? No se puede deshacer.")) {
    try {
      await api.del(`/api/vacantes/${borrar.dataset.borrar}`);
      toast("Cargo eliminado");
      await cargar();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No se pudo eliminar.", "error");
    }
  }
  const f = el("[data-filtro]");
  if (f) {
    filtro = f.dataset.filtro!;
    $$("[data-filtro]").forEach((b) => b.setAttribute("aria-selected", String(b === f)));
    pintarLista();
  }
});

// --- Perfil de la carpeta perfiles/ ----------------------------------------------------

function mostrarResultado(clase: string, contenido: string): void {
  resultadoArchivo.hidden = false;
  resultadoArchivo.className = `resultado-archivo ${clase}`;
  resultadoArchivo.innerHTML = contenido;
}

/** Llena el formulario con lo que propone el perfil; lo que el perfil no trae queda vacío (nada del perfil anterior). */
function llenar(c: PropuestaPerfil["campos"]): void {
  const poner = (n: string, v: unknown) => ((form.elements.namedItem(n) as HTMLInputElement).value = v == null ? "" : String(v));
  poner("cargo", c.cargo);
  poner("area", c.area);
  poner("descripcion", c.descripcion);
  poner("elemento_afin", c.elemento_afin);
  casillaTecnico().checked = c.tecnico;
  poner("lider_id", c.lider_id);
  habilidades = c.habilidades.length
    ? c.habilidades.map(({ nombre, peso, nivel, palabras_clave, tipo }) => ({ nombre, peso, nivel, palabras_clave, tipo: tipo ?? "tecnica" }))
    : [nuevaHabilidad(), nuevaHabilidad(), nuevaHabilidad()];
  pintarHabilidades();
  pintarLiderPreview();
  contador();
}

function mostrarLigado(d: PerfilDetalle, titulo: string): void {
  const p = d.perfil;
  const { campos, lider_motivo, avisos } = d.propuesta;
  const lider = lideres.find((l) => l.id === campos.lider_id);
  mostrarResultado("listo", `<strong>✓ ${titulo}</strong>
    <span class="meta">▤ ${esc(p.archivo)}${p.division ? ` · ${esc(p.division)}` : ""} ${nivelRol(p.nivel)}
      · ${p.responsabilidades.length} responsabilidades · ${campos.habilidades.length} habilidades desde sus competencias</span>
    ${lider ? `<span class="meta">Líder: <strong>${esc(lider.nombre)}</strong>, porque ${esc(lider_motivo)}.</span>` : ""}
    ${d.vacantes.length ? `<span class="meta">Otros cargos con este perfil: ${d.vacantes.map((v) => esc(v.cargo)).join(", ")}</span>` : ""}
    ${avisos.length ? `<ul>${avisos.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}`);
}

async function aplicarPerfil(id: string): Promise<void> {
  if (!id) {
    perfilArchivo = null;
    perfilSuperior = "";
    liderDelPerfil = null;
    resultadoArchivo.hidden = true;
    return;
  }
  selPerfil.value = id;
  mostrarResultado("leyendo", `<span class="mini-orbita" aria-hidden="true"></span> Leyendo el perfil…`);
  try {
    const d = await api.get<PerfilDetalle>(`/api/perfiles/${encodeURIComponent(id)}`);
    perfilArchivo = d.perfil.archivo;
    perfilSuperior = d.perfil.superior ?? "";
    liderDelPerfil = d.propuesta.campos.lider_id;
    llenar(d.propuesta.campos);
    sugerirExcluyentes(d.perfil);
    mostrarLigado(d, `Cargo ligado al perfil «${esc(d.perfil.titulo)}»`);
  } catch (err) {
    mostrarResultado("con-error", err instanceof ApiError ? esc(err.message) : "No se pudo leer el perfil.");
  }
}

selPerfil.addEventListener("change", () => aplicarPerfil(selPerfil.value));

async function subirPerfil(archivo: File): Promise<void> {
  mostrarResultado("leyendo", `<span class="mini-orbita" aria-hidden="true"></span> Guardando «${esc(archivo.name)}» en Perfiles y leyéndolo…`);
  const fd = new FormData();
  fd.append("perfil", archivo);
  try {
    const d = await api.post<PerfilDetalle>("/api/perfiles", fd);
    perfiles = await api.get<Perfil[]>("/api/perfiles");
    const vacioTxt = selPerfil.options[0].textContent ?? "";
    selPerfil.innerHTML = `<option value="">${esc(vacioTxt)}</option>` + opcionesPerfiles(perfiles, d.perfil.id);
    perfilArchivo = d.perfil.archivo;
    perfilSuperior = d.perfil.superior ?? "";
    liderDelPerfil = d.propuesta.campos.lider_id;
    llenar(d.propuesta.campos);
    mostrarLigado(d, d.nuevo
      ? `«${esc(d.perfil.archivo)}» quedó guardado en Perfiles y el cargo quedó ligado a él`
      : `Ese archivo ya estaba en Perfiles («${esc(d.perfil.archivo)}»): el cargo quedó ligado a él`);
  } catch (err) {
    mostrarResultado("con-error", err instanceof ApiError ? esc(err.message) : "No se pudo agregar el archivo.");
  }
}

const refrescarPerfil = iniciarDropzone($("#zona-perfil"), inputPerfil, (f) => {
  if (f) subirPerfil(f);
});

$("#btn-nueva-vacante")?.addEventListener("click", () => abrir());

cargar()
  .then(async () => {
    const q = new URLSearchParams(location.search);
    if (!esAdmin) return;
    if (q.has("nueva")) await abrir(undefined, false, q.get("perfil") ?? "");
    if (q.get("editar")) await abrir(await api.get<Vacante>(`/api/vacantes/${q.get("editar")}`));
  })
  .catch(() => toast("No se pudieron cargar los cargos.", "error"));
