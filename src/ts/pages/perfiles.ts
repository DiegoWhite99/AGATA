import { api, ApiError } from "../api.js";
import { fichaPerfil, nivelRol } from "../perfil-ui.js";
import { $, esc, iniciarDropzone, toast, vacio } from "../ui.js";
import type { Perfil, PerfilDetalle } from "../types.js";

const dlg = $<HTMLDialogElement>("#dlg-perfil");
const buscar = $<HTMLInputElement>("#buscar-perfil");
const resultado = $("#resultado-subida");
let perfiles: Perfil[] = [];

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function tarjetaPerfil(p: Perfil): string {
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
    </footer>
  </article>`;
}

function pintar(): void {
  const q = sinTildes(buscar.value.trim());
  const visibles = perfiles.filter(
    (p) =>
      !q ||
      sinTildes(
        [p.titulo, p.cargo, p.grupo, p.division, p.superior, p.nivel, p.mision, p.formacion,
          ...p.competencias_lista.tecnicas, ...p.competencias_lista.blandas, ...p.conocimientos_lista].join(" "),
      ).includes(q),
  );
  const grupos = new Map<string, Perfil[]>();
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

async function cargar(): Promise<void> {
  perfiles = await api.get<Perfil[]>("/api/perfiles");
  pintar();
}

function abrir(d: PerfilDetalle): void {
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
  const t = e.target as HTMLElement;
  if (t.closest("[data-cerrar]")) dlg.close();
  const ver = t.closest<HTMLElement>("[data-ver]");
  if (ver) abrir(await api.get<PerfilDetalle>(`/api/perfiles/${encodeURIComponent(ver.dataset.ver!)}`));
});

buscar.addEventListener("input", pintar);

const inputSubir = $<HTMLInputElement>("#zona-subir-perfil input[type=file]");
iniciarDropzone($("#zona-subir-perfil"), inputSubir, async (f) => {
  if (!f) return;
  resultado.hidden = false;
  resultado.className = "resultado-archivo leyendo";
  resultado.innerHTML = `<span class="mini-orbita" aria-hidden="true"></span> Leyendo «${esc(f.name)}»…`;
  const fd = new FormData();
  fd.append("perfil", f);
  try {
    const d = await api.post<PerfilDetalle>("/api/perfiles", fd);
    resultado.className = "resultado-archivo listo";
    resultado.innerHTML = `<strong>✓ ${d.nuevo ? `«${esc(d.perfil.archivo)}» quedó guardado en Perfiles` : `Ese archivo ya estaba en Perfiles como «${esc(d.perfil.archivo)}»`}</strong>
      <span class="meta">${esc(d.perfil.titulo)} · <a href="/vacantes?nueva=1&perfil=${encodeURIComponent(d.perfil.id)}">Crear un cargo con este perfil</a></span>`;
    await cargar();
  } catch (err) {
    resultado.className = "resultado-archivo con-error";
    resultado.textContent = err instanceof ApiError ? err.message : "No se pudo agregar el archivo.";
  }
  inputSubir.value = "";
});

cargar().catch(() => toast("No se pudieron leer los perfiles.", "error"));
