import { api } from "../api.js";
import { COLOR_ELEMENTO, SIGNOS } from "../astro-ui.js";
import { $, badgeDecision, barra, esc, fecha, toast, vacio } from "../ui.js";
import type { Panel } from "../types.js";

function kpi(valor: number, etiqueta: string, clase = ""): string {
  return `<div class="kpi ${clase}"><strong>${valor}</strong><span>${etiqueta}</span></div>`;
}

/** Rueda zodiacal decorativa que gira detrás de los umbrales. */
function ruedaFondo(): string {
  const c = 200;
  let marcas = "";
  SIGNOS.forEach(([nombre, glifo, elem], i) => {
    const a = ((i * 30 + 15 - 90) * Math.PI) / 180;
    const l = ((i * 30 - 90) * Math.PI) / 180;
    marcas += `<line x1="${c + 150 * Math.cos(l)}" y1="${c + 150 * Math.sin(l)}" x2="${c + 196 * Math.cos(l)}" y2="${c + 196 * Math.sin(l)}"/>
      <text x="${c + 173 * Math.cos(a)}" y="${c + 173 * Math.sin(a)}" fill="${COLOR_ELEMENTO[elem]}"><title>${nombre}</title>${glifo}</text>`;
  });
  return `<svg viewBox="0 0 400 400" fill="none" stroke="var(--gold)" stroke-width="1"
      font-size="20" text-anchor="middle" dominant-baseline="central">
    <circle cx="${c}" cy="${c}" r="196"/><circle cx="${c}" cy="${c}" r="150"/><circle cx="${c}" cy="${c}" r="100" stroke-dasharray="2 6"/>
    <g stroke-width="0.8">${marcas}</g></svg>`;
}

function ritual(d: Panel): void {
  const pasos = [
    { hecho: !!d.empresa?.carta, titulo: "Traza la carta de la empresa", texto: "Su nombre, misión y la fecha y lugar de fundación.",
      accion: `<a class="btn btn-sm" href="/empresa">Trazar carta</a>` },
    { hecho: d.lideres > 0, titulo: "Registra al líder", texto: "Su carta astral, su descripción detallada y su hoja de vida.",
      accion: `<a class="btn btn-sm" href="/lideres?nuevo=1">Registrar líder</a>` },
    { hecho: d.vacantes.length > 0, titulo: "Define el cargo", texto: "Área, líder, habilidades y el peso de cada carta en el match.",
      accion: `<a class="btn btn-sm" href="/vacantes?nueva=1">Crear cargo</a>` },
    { hecho: d.candidatos > 0, titulo: "Convoca a los postulantes", texto: "Comparte el link: registran sus astros y suben su hoja de vida. Sin tests ni preguntas.",
      accion: d.vacantes[0] ? `<button class="btn btn-sm" data-copiar="${d.vacantes[0].id}">Copiar link</button>` : "" },
  ];
  $("#ritual").hidden = pasos.every((p) => p.hecho);
  $("#ritual-pasos").innerHTML = pasos
    .map((p) => `<li class="rito ${p.hecho ? "hecho" : ""}"><strong>${p.titulo}</strong><p>${p.texto}</p>${p.hecho ? "" : p.accion}</li>`)
    .join("");
}

async function cargar(): Promise<void> {
  const d = await api.get<Panel>("/api/panel");
  const total = Math.max(1, d.candidatos);

  const ia = $("#ia-estado");
  ia.hidden = false;
  ia.classList.toggle("apagada", !d.ia.activa);
  ia.innerHTML = d.ia.activa
    ? `<i></i> Oráculo IA activo · ${esc(d.ia.modelo)} en Groq`
    : `<i></i> Oráculo IA apagado: agrega GROQ_API_KEY al archivo .env`;

  ritual(d);

  $("#kpis").innerHTML = `
    ${kpi(d.vacantes_abiertas, "Vacantes abiertas")}
    ${kpi(d.candidatos, "Postulantes evaluados")}
    ${kpi(d.pendientes, "Por decidir", "kpi-pendiente")}
    ${kpi(d.aprobados, "Aprobados por el líder", "kpi-aprobado")}
    ${kpi(d.rechazados, "Rechazados por el líder", "kpi-rechazado")}
    <div class="kpi kpi-distribucion" aria-label="Decisiones del líder">
      <div class="apilada">
        <span style="flex:${d.pendientes / total};background:var(--decision)"></span>
        <span style="flex:${d.aprobados / total};background:var(--match)"></span>
        <span style="flex:${d.rechazados / total};background:var(--descartado)"></span>
      </div>
      <span>Decisiones del líder</span>
    </div>`;

  $("#vacantes-abiertas").innerHTML = d.vacantes.length
    ? `<ul class="lista">${d.vacantes
        .map(
          (v) => `<li class="lista-item">
            <div>
              <a class="lista-titulo" href="/vacantes/${v.id}">${esc(v.cargo)}</a>
              <span class="meta">${esc(v.area)} · Líder: ${esc(v.lider_nombre)}</span>
            </div>
            <div class="lista-acciones">
              <span class="conteos" title="Por decidir / Aprobados / Rechazados">
                <i class="punto punto-pendiente"></i>${v.n_pendientes ?? 0}
                <i class="punto punto-aprobado"></i>${v.n_aprobados ?? 0}
                <i class="punto punto-rechazado"></i>${v.n_rechazados ?? 0}
              </span>
              <button class="btn btn-sec btn-sm" data-copiar="${v.id}">Copiar link</button>
            </div>
          </li>`,
        )
        .join("")}</ul>`
    : vacio("△", "Sin vacantes abiertas", "Crea un cargo para empezar a recibir postulaciones.",
        `<a class="btn btn-sm" href="/vacantes?nueva=1">+ Nuevo cargo</a>`);

  $("#recientes").innerHTML = d.recientes.length
    ? `<ul class="lista">${d.recientes
        .map(
          (c) => `<li class="lista-item">
            <div>
              <a class="lista-titulo" href="/candidatos/${c.id}">${esc(c.nombre)}</a>
              ${c.arquetipo ? `<span class="rol-mini" style="--c:${COLOR_ELEMENTO[c.arquetipo.elemento]}">✦ ${esc(c.arquetipo.nombre)}</span>` : ""}
              <span class="meta">${esc(c.cargo)} · ${fecha(c.creado)}</span>
            </div>
            <div class="lista-puntaje">
              <span class="num puntaje-neutro">${c.puntaje.toFixed(1)}%</span>
              ${barra(c.puntaje, "var(--gold)")}
              <span>${badgeDecision(c.decision_lider)}</span>
            </div>
          </li>`,
        )
        .join("")}</ul>`
    : vacio("☽", "Aún no hay postulaciones", "Comparte el link de una vacante con los candidatos.");
}

document.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-copiar]");
  if (!btn) return;
  const url = `${location.origin}/postular/${btn.dataset.copiar}`;
  try {
    await navigator.clipboard.writeText(url);
    toast("Link de postulación copiado");
  } catch {
    window.prompt("Copia el link de postulación:", url);
  }
});

$("#rueda-fondo").innerHTML = ruedaFondo();
cargar().catch(() => toast("No se pudo cargar el panel.", "error"));
