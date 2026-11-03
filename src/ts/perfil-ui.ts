// Presentación de los perfiles de cargo de la carpeta perfiles/.
import { esc } from "./ui.js";
import type { Perfil } from "./types.js";

const NIVEL_GLIFO: Record<string, string> = { estrategico: "☉", tactico: "☿", operativo: "♂" };

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function nivelRol(nivel?: string): string {
  if (!nivel) return "";
  const clave = sinTildes(nivel).split(/\s+/)[0];
  return `<span class="nivel-rol nivel-${esc(clave)}"><span aria-hidden="true">${NIVEL_GLIFO[clave] ?? "✦"}&#xFE0E;</span> ${esc(nivel)}</span>`;
}

/** <option> de los perfiles, agrupados por división. */
export function opcionesPerfiles(perfiles: Perfil[], seleccionado = ""): string {
  const grupos = new Map<string, Perfil[]>();
  for (const p of perfiles) {
    const g = p.grupo;
    grupos.set(g, [...(grupos.get(g) ?? []), p]);
  }
  return [...grupos]
    .map(
      ([g, lista]) => `<optgroup label="${esc(g)}">${lista
        .map(
          (p) => `<option value="${esc(p.id)}" ${p.id === seleccionado ? "selected" : ""} ${p.error ? "disabled" : ""}>
            ${esc(p.titulo)}${p.nivel ? ` · ${esc(p.nivel)}` : ""}${p.completo ? "" : " · sin diligenciar"}</option>`,
        )
        .join("")}</optgroup>`,
    )
    .join("");
}

const lista = (items: string[] | undefined, ordenada = false) =>
  items?.length ? `<${ordenada ? "ol" : "ul"} class="perfil-lista">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</${ordenada ? "ol" : "ul"}>` : "";

const dato = (etiqueta: string, valor?: string) =>
  valor ? `<div><dt>${esc(etiqueta)}</dt><dd>${esc(valor)}</dd></div>` : "";

const y = (items: string[]) => (items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`);

/** Aviso de texto copiado entre perfiles de cargos distintos. */
export function avisoCopia(p: Perfil): string {
  return (p.compartido ?? [])
    .map((c) => `<p class="aviso-perfil">Tiene el mismo texto que «${esc(c.titulo)}» en ${esc(y(c.campos))}: parece copiado de un
      perfil a otro. Revisa el archivo «${esc(p.archivo)}».</p>`)
    .join("");
}

/** Lo que el cargo espera del nuevo integrante, según su perfil. */
export function expectativasCargo(p: Perfil): string {
  const comp = p.competencias_lista;
  return `<dl class="perfil-datos perfil-datos-ancho">
      ${dato("Formación académica", p.formacion)}
      ${dato("Experiencia", p.experiencia)}
    </dl>
    ${comp.tecnicas.length ? `<h4 class="mini-titulo">Competencias técnicas</h4><p>${comp.tecnicas.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</p>` : ""}
    ${comp.blandas.length ? `<h4 class="mini-titulo">Competencias blandas</h4><p>${comp.blandas.map((c) => `<span class="chip chip-blanda">${esc(c)}</span>`).join("")}</p>` : ""}
    ${p.conocimientos_lista.length ? `<h4 class="mini-titulo">Conocimientos deseables</h4>${lista(p.conocimientos_lista)}` : ""}
    ${avisoCopia(p)}`;
}

/** Ficha completa del perfil: identificación, misión, responsabilidades, perfil del candidato, decisiones y relaciones. */
export function fichaPerfil(p: Perfil, conDescarga = true): string {
  if (p.error) return `<p class="nota">No se pudo leer «${esc(p.archivo)}»: ${esc(p.error)}</p>`;
  const comp = p.competencias_lista;
  const relaciones = (["internas", "externas"] as const)
    .filter((k) => p.relaciones?.[k]?.length)
    .map(
      (k) => `<h4>${k === "internas" ? "Internas" : "Externas"}</h4>
        <div class="tabla-scroll"><table class="tabla tabla-compacta">
          <thead><tr><th>Contacto</th><th>Propósito</th><th>Frecuencia</th></tr></thead>
          <tbody>${p.relaciones![k].map((r) => `<tr><td>${esc(r.contacto)}</td><td>${esc(r.proposito)}</td><td>${esc(r.frecuencia)}</td></tr>`).join("")}</tbody>
        </table></div>`,
    )
    .join("");
  const dimension = (p.dimension ?? []).filter((d) => Object.values(d).some((v) => v && !/^n\/?a$/i.test(v)));
  const ultimoCambio = p.cambios?.length ? p.cambios[p.cambios.length - 1] : null;

  return `<div class="ficha-perfil">
    <dl class="perfil-datos">
      ${dato("Vicerrectoría", p.vicerrectoria)}
      ${dato("División", p.division)}
      <div><dt>Rol</dt><dd>${nivelRol(p.nivel) || "—"}</dd></div>
      ${dato("Superior inmediato", p.superior)}
      ${dato("Superior funcional", p.superior_funcional)}
      ${dato("Cargos a cargo", p.a_cargo)}
      ${dato("Reportan al mismo superior", p.pares)}
    </dl>
    ${p.completo ? "" : `<p class="aviso-perfil">Este archivo está sin diligenciar: solo trae el nombre del cargo.</p>`}
    ${avisoCopia(p)}
    ${p.mision ? `<h3 class="subtitulo">Misión del rol</h3><p class="parrafo">${esc(p.mision)}</p>` : ""}
    ${p.responsabilidades.length ? `<h3 class="subtitulo">Responsabilidades</h3>${lista(p.responsabilidades, true)}` : ""}
    ${p.formacion || p.experiencia || p.conocimientos_lista.length || comp.tecnicas.length
      ? `<h3 class="subtitulo">Perfil del candidato</h3>
        <dl class="perfil-datos perfil-datos-ancho">
          ${dato("Formación académica", p.formacion)}
          ${dato("Experiencia", p.experiencia)}
        </dl>
        ${p.conocimientos_lista.length ? `<h4>Conocimientos deseables</h4>${lista(p.conocimientos_lista)}` : ""}
        ${comp.tecnicas.length ? `<h4>Competencias técnicas</h4><p>${comp.tecnicas.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</p>` : ""}
        ${comp.blandas.length ? `<h4>Competencias blandas</h4><p>${comp.blandas.map((c) => `<span class="chip chip-blanda">${esc(c)}</span>`).join("")}</p>` : ""}`
      : ""}
    ${p.decisiones?.tomar.length || p.decisiones?.proponer.length
      ? `<h3 class="subtitulo">Toma de decisiones</h3>
        <div class="grid-2 decisiones">
          <div><h4>Decide por sí mismo</h4>${lista(p.decisiones.tomar) || `<p class="meta">—</p>`}</div>
          <div><h4>Propone al superior</h4>${lista(p.decisiones.proponer) || `<p class="meta">—</p>`}</div>
        </div>`
      : ""}
    ${relaciones ? `<h3 class="subtitulo">Relaciones más importantes</h3>${relaciones}` : ""}
    ${dimension.length
      ? `<h3 class="subtitulo">Dimensión del rol</h3>${dimension
          .map((d) => `<p class="meta">${[d.descripcion, d.valor, d.funcionarios && `${d.funcionarios} a cargo`, d.roles]
            .filter((v) => v && !/^n\/?a$/i.test(v)).map(esc).join(" · ")}</p>${d.alcance && !/^n\/?a$/i.test(d.alcance) ? `<p class="parrafo">${esc(d.alcance)}</p>` : ""}`)
          .join("")}`
      : ""}
    <p class="perfil-fuente">
      <span>▤ ${esc(p.archivo)}${ultimoCambio ? ` · versión ${esc(ultimoCambio.version)} del ${esc(ultimoCambio.fecha)}` : ""}</span>
      ${conDescarga ? `<a href="/api/perfiles/${encodeURIComponent(p.id)}/archivo?archivo=${encodeURIComponent(p.archivo)}">Descargar el archivo</a>` : ""}
    </p>
  </div>`;
}
