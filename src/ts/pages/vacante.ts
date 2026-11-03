import { api } from "../api.js";
import { COLOR_ELEMENTO, tarjetaCarta } from "../astro-ui.js";
import { avisoCopia, expectativasCargo, fichaPerfil, nivelRol } from "../perfil-ui.js";
import { radar } from "../radar.js";
import { $, $$, badgeDecision, badgeVeredicto, barra, colorPuntaje, esc, fecha, toast, vacio } from "../ui.js";
import type { CandidatoFila, Vacante, Veredicto } from "../types.js";

const raiz = $("#vacante");
const id = Number(raiz.dataset.id);
let vac: Vacante;
let filtro: Veredicto | "todos" = "todos";

const celda = (v: number | null | undefined) =>
  v == null ? `<td class="num meta">—</td>` : `<td class="num" style="color:${colorPuntaje(v)}">${v.toFixed(0)}</td>`;

const puntos = (n: number) =>
  `<span class="nivel" aria-label="Nivel ${n} de 5">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= n ? "on" : ""}"></i>`).join("")}</span>`;

function filaCandidato(c: CandidatoFila, i: number): string {
  const comp = c.componentes;
  return `<tr>
    <td class="num">${i + 1}</td>
    <td><a href="/candidatos/${c.id}" class="lista-titulo">${esc(c.nombre)}</a><span class="meta">${esc(c.email)} · ${fecha(c.creado)}</span></td>
    <td>${c.signo_sol ? `☉ ${esc(c.signo_sol)}` : "—"}</td>
    ${celda(comp?.lider)}${celda(comp?.empresa)}${celda(comp?.elemento)}${celda(comp?.conflicto)}${celda(comp?.cv)}${celda(comp?.ia)}
    <td class="celda-puntaje"><strong style="color:${colorPuntaje(c.puntaje)}">${c.puntaje.toFixed(1)}%</strong>${barra(c.puntaje)}</td>
    <td>${badgeVeredicto(c.veredicto)}${badgeDecision(c.decision_lider)}</td>
    <td><a class="btn btn-sec btn-sm" href="/candidatos/${c.id}">Informe</a></td>
  </tr>`;
}

function pintarCandidatos(): void {
  const lista = vac.candidatos.filter((c) => filtro === "todos" || c.veredicto === filtro);
  $("#tabla-candidatos").innerHTML = lista.length
    ? `<div class="tabla-scroll"><table class="tabla">
        <thead><tr><th class="num">#</th><th>Postulante</th><th>Signo</th><th class="num" title="Sinastría con el líder">Líder ✶</th>
          <th class="num" title="Sinastría con la empresa">Empresa ✶</th><th class="num">Elemento</th><th class="num" title="Manejo de conflictos con el líder">Conflictos</th><th class="num">CV</th>
          <th class="num">IA</th><th>Puntaje</th><th>Veredicto</th><th><span class="sr">Acciones</span></th></tr></thead>
        <tbody>${lista.map(filaCandidato).join("")}</tbody></table></div>`
    : vacio("☌", "Sin postulantes en esta categoría", "Comparte el link de postulación para recibir candidatos.");
}

function seccionPerfil(): string {
  const p = vac.perfil;
  if (!p) {
    return `<section class="tarjeta perfil-cargo sin-perfil">
      <h2>Perfil institucional</h2>
      <p class="parrafo">${vac.perfil_id
        ? `El perfil con el que se creó este cargo («${esc(vac.perfil_archivo ?? vac.perfil_id)}») ya no está en Perfiles.`
        : "Este cargo no está ligado a ningún perfil."}</p>
      <a class="btn btn-sec btn-sm" href="/vacantes?editar=${vac.id}&volver=1">Ligar a un perfil</a>
    </section>`;
  }
  return `<section class="tarjeta perfil-cargo">
    <header class="tarjeta-cab">
      <div><p class="eyebrow">Perfil institucional</p><h2>${esc(p.titulo)}</h2></div>
      ${nivelRol(p.nivel)}
    </header>
    <p class="meta">▤ ${esc(p.archivo)}${p.division ? ` · ${esc(p.division)}` : ""}. La descripción, la matriz de habilidades y lo que
      se espera del nuevo integrante salen de este perfil, y el oráculo IA compara cada hoja de vida con él.</p>
    ${avisoCopia(p)}
    <details class="perfil-plegable"><summary>Ver el perfil completo</summary>${fichaPerfil(p)}</details>
  </section>`;
}

function pintar(): void {
  const l = vac.lider;
  const cuenta = (v: Veredicto) => vac.candidatos.filter((c) => c.veredicto === v).length;
  document.title = `${vac.cargo} · AGATA`;

  raiz.innerHTML = `
    <a class="migas" href="/vacantes">← Cargos y vacantes</a>
    <header class="pagina-cab">
      <div>
        <p class="eyebrow">${esc(vac.area)} <span class="estado estado-${vac.estado}">${vac.estado === "abierta" ? "Abierta" : "Cerrada"}</span></p>
        <h1>${esc(vac.cargo)}</h1>
        <p class="lead">Líder: <strong>${esc(l.nombre)}</strong> · ${esc(l.cargo)}</p>
      </div>
      <div class="acciones-wrap">
        ${vac.estado === "abierta" ? `<a class="btn" href="/postular/${vac.id}">+ Postular candidato</a>
        <button class="btn btn-sec" id="btn-copiar">Copiar link</button>` : ""}
        <a class="btn btn-sec" href="/vacantes?editar=${vac.id}&volver=1">Editar cargo</a>
      </div>
    </header>

    <div class="grid-2">
      <section class="tarjeta">
        <h2>Descripción del cargo</h2>
        <p class="parrafo">${esc(vac.descripcion)}</p>
        ${vac.perfil
          ? `<h3 class="subtitulo">Qué espera el cargo del nuevo integrante</h3>${expectativasCargo(vac.perfil)}`
          : `<h3 class="subtitulo">Qué espera el líder de su equipo</h3>
             <p class="nota">Este cargo no tiene perfil: se muestra lo que el líder espera en general, no de este cargo.</p>
             <p class="parrafo">${esc(l.expectativas)}</p>`}
        <h3 class="subtitulo">El líder</h3>
        ${vac.perfil?.superior
          ? `<p class="meta">Según su perfil, el cargo reporta a <strong>${esc(vac.perfil.superior)}</strong>.</p>
             ${vac.perfil_lider_coincide === false
               ? `<p class="aviso-perfil">El líder asignado, ${esc(l.nombre)} (${esc(l.cargo)}), no es ese superior. La sinastría y el
                   manejo de conflictos se miden con ${esc(l.nombre)}: si el cargo reporta a otra persona, regístrala en Líderes y
                   asígnala al editar el cargo.</p>`
               : ""}`
          : ""}
        <div class="lider-bloque">
          <details><summary>Área y rol del líder</summary><p class="parrafo">${esc(l.descripcion)}</p></details>
          <details><summary>Estilo de liderazgo</summary><p class="parrafo">${esc(l.estilo_liderazgo)}</p></details>
          ${l.equipo ? `<p class="meta">Equipo: ${esc(l.equipo)}</p>` : ""}
          ${l.cv_archivo ? `<a class="cv-enlace" href="/api/lideres/${l.id}/cv">✒ Hoja de vida del líder</a>` : `<span class="cv-enlace falta">El líder aún no subió su hoja de vida</span>`}
        </div>
      </section>
      <section class="tarjeta">
        <h2>Las cartas que recibirán al postulante</h2>
        <div class="cartas-duo">
          ${tarjetaCarta("Líder", l.nombre, l.carta)}
          ${tarjetaCarta("Empresa", vac.empresa?.nombre ?? "La empresa", vac.empresa?.carta ?? null,
            "Aún no hay carta de la empresa: complétala en la sección Empresa.")}
        </div>
        ${vac.empresa ? "" : `<p class="centro"><a class="btn btn-sec btn-sm" href="/empresa">Trazar la carta de la empresa</a></p>`}
        <p class="meta centro">Match = Líder ✶ ${vac.peso_lider} · Empresa ✶ ${vac.peso_empresa} · Elemento ${vac.peso_elemento} · Conflictos ${vac.peso_conflicto} · CV ${vac.peso_cv} · IA ${vac.peso_ia}
          ${vac.elemento_afin ? ` · Elemento afín: <b style="color:${COLOR_ELEMENTO[vac.elemento_afin]}">${esc(vac.elemento_afin)}</b>` : ""}</p>
      </section>
    </div>

    ${seccionPerfil()}

    <div class="grid-2">
      <section class="tarjeta">
        <h2>Perfil requerido</h2>
        ${radar(
          vac.habilidades.map((h) => h.nombre),
          [{ nombre: "Nivel requerido", valores: vac.habilidades.map((h) => h.nivel * 20), color: "var(--gold)" }],
          { titulo: "Perfil requerido del cargo" },
        )}
      </section>
      <section class="tarjeta">
      <h2>Matriz de habilidades del cargo</h2>
      <div class="tabla-scroll"><table class="tabla">
        <thead><tr><th>Habilidad</th><th>Peso</th><th>Nivel</th><th>Palabras clave en el CV</th></tr></thead>
        <tbody>${vac.habilidades
          .map(
            (h) => `<tr><td><strong>${esc(h.nombre)}</strong></td><td>${puntos(h.peso)}</td><td>${puntos(h.nivel)}</td>
              <td class="claves">${h.palabras_clave.split(",").filter((k) => k.trim()).map((k) => `<span class="chip">${esc(k.trim())}</span>`).join("")}</td></tr>`,
          )
          .join("")}</tbody></table></div>
      </section>
    </div>

    <section class="tarjeta">
      <header class="tarjeta-cab">
        <h2>Ranking de postulantes</h2>
        <div class="filtros" role="tablist" aria-label="Filtrar por veredicto">
          <button class="filtro" role="tab" data-f="todos" aria-selected="true">Todos (${vac.candidatos.length})</button>
          <button class="filtro f-match" role="tab" data-f="match" aria-selected="false">Match (${cuenta("match")})</button>
          <button class="filtro f-decision" role="tab" data-f="decision" aria-selected="false">En decisión (${cuenta("decision")})</button>
          <button class="filtro f-descartado" role="tab" data-f="descartado" aria-selected="false">Descartados (${cuenta("descartado")})</button>
        </div>
      </header>
      <div id="tabla-candidatos"></div>
    </section>`;
  pintarCandidatos();
}

raiz.addEventListener("click", async (e) => {
  const t = e.target as HTMLElement;
  const f = t.closest<HTMLElement>("[data-f]");
  if (f) {
    filtro = f.dataset.f as Veredicto | "todos";
    $$("[data-f]", raiz).forEach((b) => b.setAttribute("aria-selected", String(b === f)));
    pintarCandidatos();
  }
  if (t.closest("#btn-copiar")) {
    const url = `${location.origin}/postular/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link de postulación copiado");
    } catch {
      window.prompt("Copia el link de postulación:", url);
    }
  }
});

api
  .get<Vacante>(`/api/vacantes/${id}`)
  .then((v) => {
    vac = v;
    pintar();
  })
  .catch(() => {
    raiz.innerHTML = vacio("∅", "Cargo no encontrado", "Puede que haya sido eliminado.", `<a class="btn" href="/vacantes">Volver</a>`);
  });
