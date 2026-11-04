import { api, ApiError } from "../api.js";
import { fichaPerfil, nivelRol } from "../perfil-ui.js";
import { $, confirmar, esc, fecha, iniciarDropzone, toast, vacio } from "../ui.js";
const dlg = $("#dlg-perfil");
const buscar = $("#buscar-perfil");
const resultado = $("#resultado-subida");
let perfiles = [];
const sinTildes = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function tarjetaPerfil(p) {
    const comp = p.competencias_lista;
    const vacantes = p.vacantes ?? [];
    return `<article class="tarjeta tarjeta-perfil ${p.completo ? "" : "incompleto"}">
    <header class="tarjeta-cab">
      <div>
        <h3>${esc(p.titulo)}</h3>
        ${p.cargo && sinTildes(p.cargo).trim() !== sinTildes(p.titulo).trim() ? `<span class="meta">En el formato: ${esc(p.cargo)}</span>` : ""}
      </div>
      ${nivelRol(p.nivel)}
    </header>
    ${p.error
        ? `<p class="nota">No se pudo leer: ${esc(p.error)}</p>`
        : p.completo
            ? `${p.superior ? `<p class="meta">Reporta a <strong>${esc(p.superior)}</strong></p>` : ""}
           <p class="texto-corto">${esc(p.mision ?? "")}</p>
           <p class="chips-linea">${comp.tecnicas.slice(0, 3).map((c) => `<span class="chip">${esc(c.length > 42 ? c.slice(0, 40) + "…" : c)}</span>`).join("")}</p>`
            : `<p class="aviso-perfil">Formato sin diligenciar: solo trae el nombre del cargo.</p>`}
    ${(p.compartido ?? []).map((c) => `<p class="perfil-ligado falta">⚠ Mismo texto que «${esc(c.titulo)}» en ${esc(c.campos.join(", "))}</p>`).join("")}
    <p class="meta perfil-ligado">${vacantes.length
        ? `Ligado a ${vacantes.map((v) => `<a href="/vacantes/${v.id}">${esc(v.cargo)}</a>`).join(", ")}`
        : "Aún no hay cargos con este perfil"}</p>
    <footer class="tarjeta-pie acciones-wrap">
      <button class="btn btn-sec btn-sm" data-ver="${esc(p.id)}" ${p.error ? "disabled" : ""}>Ver perfil</button>
      <a class="btn btn-sm" href="/vacantes?nueva=1&perfil=${encodeURIComponent(p.id)}">+ Crear cargo</a>
      <button class="btn btn-peligro btn-sm" data-eliminar="${esc(p.id)}" ${vacantes.length
        ? `disabled title="No se puede eliminar: lo usa${vacantes.length > 1 ? "n" : ""} ${vacantes.length} cargo(s). Cámbiales el perfil primero."`
        : ""}>Eliminar</button>
    </footer>
  </article>`;
}
function pintar() {
    const q = sinTildes(buscar.value.trim());
    const visibles = perfiles.filter((p) => !q ||
        sinTildes([p.titulo, p.cargo, p.grupo, p.division, p.superior, p.nivel, p.mision, p.formacion,
            ...p.competencias_lista.tecnicas, ...p.competencias_lista.blandas, ...p.conocimientos_lista].join(" ")).includes(q));
    const grupos = new Map();
    for (const p of visibles) {
        const g = p.grupo;
        grupos.set(g, [...(grupos.get(g) ?? []), p]);
    }
    const ligados = perfiles.filter((p) => p.vacantes?.length).length;
    $("#resumen-perfiles").textContent =
        `${perfiles.length} perfiles · ${ligados} con cargos ligados` + (q ? ` · ${visibles.length} coinciden` : "");
    $("#lista-perfiles").innerHTML = visibles.length
        ? [...grupos]
            .map(([g, lista]) => `<section class="grupo-perfiles"><h2 class="grupo-titulo">${esc(g)} <span class="meta">${lista.length}</span></h2>
          <div class="grid-cards">${lista.map(tarjetaPerfil).join("")}</div></section>`)
            .join("")
        : perfiles.length
            ? vacio("∅", "Ningún perfil coincide", "Prueba con otra palabra.")
            : vacio("▤", "Aún no hay perfiles", "Sube aquí el formato de cada cargo.");
}
async function cargar() {
    const [lista, eliminados] = await Promise.all([
        api.get("/api/perfiles"), api.get("/api/perfiles/papelera"),
    ]);
    perfiles = lista;
    pintar();
    pintarPapelera(eliminados);
}
// --- Eliminar y papelera ---------------------------------------------------------------------
// Un perfil con cargos ligados no se puede eliminar (esos cargos perderían sus requisitos). Uno sin cargos pasa
// a la papelera con todas sus versiones; desde ahí se restaura o se borra para siempre.
function pintarPapelera(eliminados) {
    $("#papelera").hidden = !eliminados.length;
    $("#papelera-lista").innerHTML = eliminados
        .map((e) => `<li class="lista-item">
        <div>
          <span class="lista-titulo">${esc(e.titulo)}</span>
          <span class="meta">${esc(e.archivo)} · eliminado el ${fecha(new Date(e.eliminado * 1000).toISOString())}</span>
        </div>
        <div class="lista-acciones">
          <button class="btn btn-sec btn-sm" data-restaurar="${esc(e.archivo)}">↺ Restaurar</button>
          <button class="btn btn-peligro btn-sm" data-borrar="${esc(e.archivo)}">Borrar para siempre</button>
        </div>
      </li>`)
        .join("");
}
async function eliminar(pid) {
    const p = perfiles.find((x) => x.id === pid);
    if (!p)
        return;
    const versiones = p.archivos?.length ?? 1;
    if (!confirmar(`¿Eliminar el perfil «${p.titulo}»?${versiones > 1 ? ` Se van sus ${versiones} versiones.` : ""}\n\n` +
        "Pasa a la papelera: desde ahí lo puedes restaurar."))
        return;
    try {
        await api.del(`/api/perfiles/${encodeURIComponent(pid)}`);
        toast(`«${p.titulo}» pasó a la papelera`);
    }
    catch (err) {
        toast(err instanceof ApiError ? err.message : "No se pudo eliminar el perfil.", "error");
    }
    await cargar();
}
async function restaurar(archivo) {
    try {
        await api.post(`/api/perfiles/papelera/${encodeURIComponent(archivo)}/restaurar`, {});
        toast(`«${archivo}» volvió a Perfiles`);
    }
    catch (err) {
        toast(err instanceof ApiError ? err.message : "No se pudo restaurar.", "error");
    }
    await cargar();
}
async function borrar(archivo) {
    if (!confirmar(`¿Borrar «${archivo}» para siempre?\n\nEsta acción no se puede deshacer.`))
        return;
    try {
        await api.del(`/api/perfiles/papelera/${encodeURIComponent(archivo)}`);
        toast(`«${archivo}» se borró para siempre`);
    }
    catch (err) {
        toast(err instanceof ApiError ? err.message : "No se pudo borrar.", "error");
    }
    await cargar();
}
function abrir(d) {
    const p = d.perfil;
    $("#dlg-perfil-eyebrow").textContent = [p.division, p.nivel].filter(Boolean).join(" · ");
    $("#dlg-perfil-titulo").textContent = p.titulo;
    $("#perfil-cuerpo").innerHTML = fichaPerfil(p);
    $("#perfil-pie").innerHTML = `
    <span class="meta">${d.vacantes.length ? `Ligado a ${d.vacantes.length} cargo(s)` : "Sin cargos ligados"}</span>
    <button type="button" class="btn btn-sec" data-cerrar>Cerrar</button>
    <a class="btn" href="/vacantes?nueva=1&perfil=${encodeURIComponent(p.id)}">+ Crear cargo con este perfil</a>`;
    dlg.showModal();
}
document.addEventListener("click", async (e) => {
    const t = e.target;
    if (t.closest("[data-cerrar]"))
        dlg.close();
    const ver = t.closest("[data-ver]");
    if (ver)
        abrir(await api.get(`/api/perfiles/${encodeURIComponent(ver.dataset.ver)}`));
    const quitar = t.closest("[data-eliminar]");
    if (quitar && !quitar.disabled)
        await eliminar(quitar.dataset.eliminar);
    const volver = t.closest("[data-restaurar]");
    if (volver)
        await restaurar(volver.dataset.restaurar);
    const borrarPara = t.closest("[data-borrar]");
    if (borrarPara)
        await borrar(borrarPara.dataset.borrar);
});
buscar.addEventListener("input", pintar);
const inputSubir = $("#zona-subir-perfil input[type=file]");
iniciarDropzone($("#zona-subir-perfil"), inputSubir, async (f) => {
    if (!f)
        return;
    resultado.hidden = false;
    resultado.className = "resultado-archivo leyendo";
    resultado.innerHTML = `<span class="mini-orbita" aria-hidden="true"></span> Leyendo «${esc(f.name)}»…`;
    const fd = new FormData();
    fd.append("perfil", f);
    try {
        const d = await api.post("/api/perfiles", fd);
        resultado.className = "resultado-archivo listo";
        resultado.innerHTML = `<strong>✓ ${d.nuevo ? `«${esc(d.perfil.archivo)}» quedó guardado en Perfiles` : `Ese archivo ya estaba en Perfiles como «${esc(d.perfil.archivo)}»`}</strong>
      <span class="meta">${esc(d.perfil.titulo)} · <a href="/vacantes?nueva=1&perfil=${encodeURIComponent(d.perfil.id)}">Crear un cargo con este perfil</a></span>`;
        await cargar();
    }
    catch (err) {
        resultado.className = "resultado-archivo con-error";
        resultado.textContent = err instanceof ApiError ? err.message : "No se pudo agregar el archivo.";
    }
    inputSubir.value = "";
});
cargar().catch(() => toast("No se pudieron leer los perfiles.", "error"));
