import { api, ApiError } from "../api.js";
import { chipArquetipo, COLOR_ELEMENTO, iniciarNatal, leerNatal, panelAtributos, rellenarNatal, ruedaZodiacal, } from "../astro-ui.js";
import { $, $$, confirmar, esc, iniciarDropzone, limpiarErrores, mostrarErrores, toast, vacio } from "../ui.js";
const dlg = $("#dlg-lider");
const form = $("#form-lider");
const inputCv = form.querySelector("[name=cv]");
const selJefe = form.elements.namedItem("jefe_id");
const refrescarCv = iniciarDropzone($("#zona-cv-lider"), inputCv);
let editandoId = null;
let lideres = [];
/** Los que dependen (directa o indirectamente) de un líder: no pueden ser su jefe. */
function subordinados(id) {
    const salida = new Set();
    let nuevos = [id];
    while (nuevos.length) {
        nuevos = lideres.filter((l) => l.jefe_id != null && nuevos.includes(l.jefe_id) && !salida.has(l.id)).map((l) => l.id);
        nuevos.forEach((n) => salida.add(n));
    }
    return salida;
}
function opcionesJefe(id, actual) {
    const excluidos = id ? subordinados(id).add(id) : new Set();
    selJefe.innerHTML = `<option value="">Nadie: encabeza la cadena</option>` + lideres
        .filter((l) => !excluidos.has(l.id))
        .map((l) => `<option value="${l.id}" ${l.id === actual ? "selected" : ""}>${esc(l.nombre)} · ${esc(l.cargo)}</option>`)
        .join("");
}
/** Sugiere el jefe inmediato según el perfil del cargo del líder (su «superior inmediato»). */
async function sugerirJefe() {
    const caja = $("#jefe-sugerido");
    const cargo = form.elements.namedItem("cargo").value.trim();
    const s = cargo ? await api.get(`/api/lideres/jefe-sugerido?cargo=${encodeURIComponent(cargo)}${editandoId ? `&id=${editandoId}` : ""}`) : null;
    const yaAsignado = s?.jefe_id != null && String(s.jefe_id) === selJefe.value;
    caja.hidden = !s || yaAsignado || !!(s.jefe_id && !selJefe.querySelector(`option[value="${s.jefe_id}"]`));
    if (!s || caja.hidden)
        return;
    caja.innerHTML = s.jefe_id
        ? `Según el perfil «${esc(s.perfil)}», su superior inmediato es «${esc(s.superior)}»: <strong>${esc(s.jefe_nombre)}</strong>.
       <button type="button" class="btn btn-sec btn-sm" data-usar-jefe="${s.jefe_id}">Asignar</button>`
        : `Según el perfil «${esc(s.perfil)}», su superior inmediato es «${esc(s.superior)}», pero aún no hay un líder registrado con ese cargo.`;
}
const dlgCarta = $("#dlg-carta");
const CAMPOS_TEXTO = ["nombre", "cargo", "area", "email", "descripcion", "estilo_liderazgo", "expectativas", "equipo"];
function tarjetaLider(l) {
    const sol = l.carta?.posiciones.sol;
    const astros = l.carta
        ? `<div class="astros-mini">
        ${["sol", "luna", "ascendente"]
            .map((k) => l.carta.posiciones[k])
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
          ${l.carta ? `<button class="btn btn-sm" data-carta="${l.id}">Ver carta</button>` : ""}
          <button class="btn btn-sec btn-sm" data-editar="${l.id}">Editar</button>
          <button class="btn btn-peligro btn-sm" data-borrar="${l.id}" aria-label="Eliminar a ${esc(l.nombre)}">Eliminar</button>
        </div>
      </footer>
    </article>`;
}
async function cargar() {
    lideres = await api.get("/api/lideres");
    $("#lista-lideres").innerHTML = lideres.length
        ? lideres.map(tarjetaLider).join("")
        : vacio("♃", "Aún no hay líderes", "Registra al líder o jefe que va a recibir a los nuevos integrantes.");
}
/** Contadores y medidor de detalle de las descripciones. */
function actualizarMedidor() {
    let total = 0;
    const areas = $$("textarea[data-min]", form);
    for (const ta of areas) {
        const min = Number(ta.dataset.min);
        const largo = ta.value.trim().length;
        total += Math.min(1, largo / min);
        const cont = form.querySelector(`[data-contador="${ta.name}"]`);
        cont.textContent = largo >= min ? `✔ ${largo} caracteres` : `${largo} / ${min} caracteres mínimos`;
        cont.classList.toggle("ok", largo >= min);
    }
    const pct = Math.round((total / areas.length) * 100);
    const nivel = pct >= 100 ? "Descripción completa" : pct >= 60 ? "Le falta un poco de detalle" : "Descripción insuficiente";
    $("#medidor-detalle").innerHTML = `
    <div class="medidor-cab"><span>Nivel de detalle</span><strong>${pct}% · ${nivel}</strong></div>
    <div class="barra"><span style="width:${pct}%;background:${pct >= 100 ? "var(--match)" : pct >= 60 ? "var(--decision)" : "var(--descartado)"}"></span></div>`;
}
async function abrir(lider) {
    form.reset();
    limpiarErrores(form);
    editandoId = lider?.id ?? null;
    $("#dlg-lider-titulo").textContent = lider ? `Editar a ${lider.nombre}` : "Registrar líder";
    if (lider) {
        for (const c of CAMPOS_TEXTO) {
            form.elements.namedItem(c).value = lider[c] ?? "";
        }
    }
    await rellenarNatal(form, lider ?? {});
    opcionesJefe(editandoId, lider?.jefe_id ?? null);
    $("#jefe-sugerido").hidden = true;
    if (lider)
        sugerirJefe().catch(() => undefined);
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
    for (const c of CAMPOS_TEXTO)
        datos.append(c, form.elements.namedItem(c).value);
    datos.append("jefe_id", selJefe.value);
    const natal = leerNatal(form);
    if (natal.fecha_nac)
        for (const [k, v] of Object.entries(natal))
            datos.append(k, v);
    if (inputCv.files?.[0])
        datos.append("cv", inputCv.files[0]);
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
        if (editandoId)
            await api.put(`/api/lideres/${editandoId}`, datos);
        else
            await api.post("/api/lideres", datos);
        dlg.close();
        toast(editandoId ? "Líder actualizado. Se recalcularon sus postulantes." : "Líder registrado");
        await cargar();
    }
    catch (err) {
        mostrarErrores(form, err);
    }
    finally {
        btn.disabled = false;
    }
});
form.elements.namedItem("cargo").addEventListener("change", () => sugerirJefe().catch(() => undefined));
selJefe.addEventListener("change", () => sugerirJefe().catch(() => undefined));
document.addEventListener("click", async (e) => {
    const t = e.target;
    t.closest("[data-cerrar]")?.closest("dialog")?.close();
    const usarJefe = t.closest("[data-usar-jefe]");
    if (usarJefe) {
        selJefe.value = usarJefe.dataset.usarJefe;
        $("#jefe-sugerido").hidden = true;
    }
    const verCarta = t.closest("[data-carta]");
    if (verCarta)
        await abrirCarta(await api.get(`/api/lideres/${verCarta.dataset.carta}`));
    const editar = t.closest("[data-editar]");
    if (editar)
        await abrir(await api.get(`/api/lideres/${editar.dataset.editar}`));
    const borrar = t.closest("[data-borrar]");
    if (borrar && confirmar("¿Eliminar este líder? Esta acción no se puede deshacer.")) {
        try {
            await api.del(`/api/lideres/${borrar.dataset.borrar}`);
            toast("Líder eliminado");
            await cargar();
        }
        catch (err) {
            toast(err instanceof ApiError ? err.message : "No se pudo eliminar.", "error");
        }
    }
});
async function abrirCarta(l) {
    if (!l.carta)
        return;
    $("#dlg-carta-titulo").textContent = `Carta de ${l.nombre}`;
    $("#carta-cuerpo").innerHTML = `
    <div class="carta-cabecera">
      <div class="carta-rueda">${ruedaZodiacal(l.carta, 240)}</div>
      <div><p class="eyebrow">La regla de los astros</p>
        <p class="parrafo"><strong>${esc(l.carta.resumen)}</strong></p>
        <p class="parrafo">${esc(l.carta.perfil_laboral)}</p></div>
    </div>
    ${panelAtributos(l.carta)}`;
    dlgCarta.showModal();
}
$("#btn-nuevo-lider").addEventListener("click", () => abrir());
iniciarNatal(form).then(() => {
    if (new URLSearchParams(location.search).has("nuevo"))
        abrir();
});
cargar().catch(() => toast("No se pudieron cargar los líderes.", "error"));
