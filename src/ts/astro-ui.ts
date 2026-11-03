import { esc } from "./ui.js";
import type { Carta, Ciudad, DatosNatales, ModoConflicto, PerfilConflicto, Sinastria } from "./types.js";
import { api } from "./api.js";

export const SIGNOS = [
  ["Aries", "♈\uFE0E", "Fuego"], ["Tauro", "♉\uFE0E", "Tierra"], ["Géminis", "♊\uFE0E", "Aire"], ["Cáncer", "♋\uFE0E", "Agua"],
  ["Leo", "♌\uFE0E", "Fuego"], ["Virgo", "♍\uFE0E", "Tierra"], ["Libra", "♎\uFE0E", "Aire"], ["Escorpio", "♏\uFE0E", "Agua"],
  ["Sagitario", "♐\uFE0E", "Fuego"], ["Capricornio", "♑\uFE0E", "Tierra"], ["Acuario", "♒\uFE0E", "Aire"], ["Piscis", "♓\uFE0E", "Agua"],
] as const;

export const COLOR_ELEMENTO: Record<string, string> = {
  Fuego: "var(--fuego)",
  Tierra: "var(--tierra)",
  Aire: "var(--aire)",
  Agua: "var(--agua)",
};

// Fecha de inicio (mes, día) de cada signo solar, empezando por Capricornio.
const CORTES: [number, number, number][] = [
  [1, 20, 10], [2, 19, 11], [3, 21, 0], [4, 20, 1], [5, 21, 2], [6, 21, 3],
  [7, 23, 4], [8, 23, 5], [9, 23, 6], [10, 23, 7], [11, 22, 8], [12, 22, 9],
];

/** Signo solar aproximado (para la vista previa mientras se escribe la fecha). */
export function signoSolar(fechaIso: string): (typeof SIGNOS)[number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaIso);
  if (!m) return null;
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  let idx = 9; // Capricornio
  for (const [cm, cd, si] of CORTES) {
    if (mes > cm || (mes === cm && dia >= cd)) idx = si;
  }
  return SIGNOS[idx];
}

/** Rueda zodiacal en SVG con los astros ubicados por su longitud eclíptica. */
export function ruedaZodiacal(carta: Carta, tam = 360): string {
  const c = tam / 2;
  const rExt = c - 6;
  const rSig = rExt - 34;
  const rAst = rSig - 30;
  const asc = carta.posiciones.ascendente?.longitud ?? 0;
  // El ascendente queda a la izquierda y el zodiaco avanza en sentido antihorario,
  // como en una carta tradicional.
  const aPantalla = (lon: number) => ((180 + (lon - asc)) * Math.PI) / 180;
  const xy = (rad: number, lon: number): [number, number] => [
    c + rad * Math.cos(aPantalla(lon)),
    c - rad * Math.sin(aPantalla(lon)),
  ];

  let sectores = "";
  SIGNOS.forEach(([nombre, glifo, elem], i) => {
    const a0 = i * 30;
    const a1 = a0 + 30;
    const [x0, y0] = xy(rExt, a0);
    const [x1, y1] = xy(rExt, a1);
    const [x2, y2] = xy(rSig, a1);
    const [x3, y3] = xy(rSig, a0);
    sectores += `<path d="M${x0},${y0} A${rExt},${rExt} 0 0 0 ${x1},${y1} L${x2},${y2} A${rSig},${rSig} 0 0 1 ${x3},${y3} Z"
      fill="${COLOR_ELEMENTO[elem]}" fill-opacity="0.16" stroke="var(--border)" stroke-width="1"><title>${nombre}</title></path>`;
    const [gx, gy] = xy((rExt + rSig) / 2, a0 + 15);
    sectores += `<text x="${gx}" y="${gy}" class="rueda-signo" fill="${COLOR_ELEMENTO[elem]}">${glifo}</text>`;
  });

  // Separar astros muy cercanos para que no se monten.
  const astros = Object.entries(carta.posiciones)
    .filter(([k]) => k !== "ascendente")
    .map(([, p]) => ({ ...p, visual: p.longitud }))
    .sort((a, b) => a.longitud - b.longitud);
  for (let pase = 0; pase < 3; pase++) {
    for (let i = 1; i < astros.length; i++) {
      if (astros[i].visual - astros[i - 1].visual < 11) astros[i].visual = astros[i - 1].visual + 11;
    }
  }

  let marcas = "";
  for (const p of astros) {
    const [mx, my] = xy(rSig, p.longitud);
    const [ix, iy] = xy(rSig - 8, p.longitud);
    const [gx, gy] = xy(rAst, p.visual);
    marcas += `<line x1="${mx}" y1="${my}" x2="${ix}" y2="${iy}" stroke="var(--gold)" stroke-width="2"/>
      <text x="${gx}" y="${gy}" class="rueda-astro"><title>${esc(p.astro)} en ${esc(p.signo)} ${p.grado}°</title>${p.glifo}</text>`;
  }

  let ejes = "";
  if (carta.posiciones.ascendente) {
    const [ax, ay] = xy(rSig, asc);
    const [dx, dy] = xy(rSig, asc + 180);
    ejes = `<line x1="${ax}" y1="${ay}" x2="${dx}" y2="${dy}" class="rueda-horizonte"/>
      <text x="${ax + 8}" y="${ay - 6}" class="rueda-ac">AC</text>`;
  }

  return `
    <svg class="rueda" viewBox="0 0 ${tam} ${tam}" role="img" aria-label="Rueda zodiacal: ${esc(carta.resumen)}">
      <circle cx="${c}" cy="${c}" r="${rExt}" class="rueda-borde"/>
      ${sectores}
      <circle cx="${c}" cy="${c}" r="${rSig}" class="rueda-interior"/>
      <circle cx="${c}" cy="${c}" r="${rAst - 22}" class="rueda-centro"/>
      ${ejes}${marcas}
    </svg>`;
}

export function tablaPosiciones(carta: Carta): string {
  const filas = Object.values(carta.posiciones)
    .map(
      (p) => `<tr>
        <td><span class="glifo">${p.glifo}</span> ${esc(p.astro)}</td>
        <td><span style="color:${COLOR_ELEMENTO[p.elemento]}">${p.simbolo}</span> ${esc(p.signo)}</td>
        <td class="num">${p.grado.toFixed(1)}°</td>
        <td><span class="chip-elem" style="--c:${COLOR_ELEMENTO[p.elemento]}">${esc(p.elemento)}</span></td>
      </tr>`,
    )
    .join("");
  return `<table class="tabla tabla-compacta">
      <thead><tr><th>Astro</th><th>Signo</th><th class="num">Grado</th><th>Elemento</th></tr></thead>
      <tbody>${filas}</tbody></table>
      ${carta.hora_conocida ? "" : '<p class="nota">Sin hora de nacimiento: no se calcula el ascendente y la Luna es aproximada.</p>'}`;
}

export function barrasElementos(carta: Carta): string {
  return `<div class="elementos">${Object.entries(carta.elementos)
    .map(
      ([e, v]) => `<div class="elem-fila">
        <span class="elem-nombre">${esc(e)}</span>
        <div class="barra"><span style="width:${v}%;background:${COLOR_ELEMENTO[e]}"></span></div>
        <span class="num">${v.toFixed(0)}%</span></div>`,
    )
    .join("")}</div>`;
}

// --- Formulario de datos natales (compartido por líderes y postulantes) ---

let ciudadesCache: Promise<Ciudad[]> | null = null;
const OTRA = "__otra__";

export function cargarCiudades(): Promise<Ciudad[]> {
  ciudadesCache ??= api.get<Ciudad[]>("/api/ciudades");
  return ciudadesCache;
}

export async function iniciarNatal(root: HTMLElement): Promise<void> {
  const ciudades = await cargarCiudades();
  const sel = root.querySelector<HTMLSelectElement>("[name=ciudad]")!;
  const manual = root.querySelector<HTMLElement>(".coords")!;
  const fechaInput = root.querySelector<HTMLInputElement>("[name=fecha_nac]")!;
  const preview = root.querySelector<HTMLElement>(".preview-signo");

  sel.innerHTML =
    `<option value="">Selecciona una ciudad…</option>` +
    ciudades.map((c) => `<option value="${esc(c.nombre)}">${esc(c.nombre)}</option>`).join("") +
    `<option value="${OTRA}">Otra ciudad (ingresar coordenadas)</option>`;

  sel.addEventListener("change", () => {
    const c = ciudades.find((x) => x.nombre === sel.value);
    manual.hidden = sel.value !== OTRA;
    if (c) {
      setCampo(root, "lat", c.lat);
      setCampo(root, "lon", c.lon);
      setCampo(root, "utc", c.utc);
    }
  });

  const actualizarPreview = () => {
    if (!preview) return;
    const s = signoSolar(fechaInput.value);
    preview.innerHTML = s
      ? `<span style="color:${COLOR_ELEMENTO[s[2]]}">${s[1]}</span> Sol en <strong>${s[0]}</strong> · ${s[2]}`
      : "";
  };
  fechaInput.addEventListener("input", actualizarPreview);
  actualizarPreview();
}

function setCampo(root: HTMLElement, nombre: string, valor: unknown): void {
  const input = root.querySelector<HTMLInputElement>(`[name=${nombre}]`);
  if (input) input.value = valor == null ? "" : String(valor);
}

export async function rellenarNatal(root: HTMLElement, d: Partial<DatosNatales>): Promise<void> {
  const ciudades = await cargarCiudades();
  setCampo(root, "fecha_nac", d.fecha_nac);
  setCampo(root, "hora_nac", d.hora_nac);
  setCampo(root, "lat", d.lat);
  setCampo(root, "lon", d.lon);
  setCampo(root, "utc", d.utc);
  const sel = root.querySelector<HTMLSelectElement>("[name=ciudad]")!;
  const conocida = ciudades.some((c) => c.nombre === d.ciudad);
  sel.value = conocida ? d.ciudad! : d.fecha_nac && d.lat != null ? OTRA : "";
  root.querySelector<HTMLElement>(".coords")!.hidden = sel.value !== OTRA;
  if (sel.value === OTRA) setCampo(root, "ciudad_otra", d.ciudad);
  root.querySelector<HTMLInputElement>("[name=fecha_nac]")!.dispatchEvent(new Event("input"));
}

export function leerNatal(root: HTMLElement): Record<string, string> {
  const val = (n: string) => root.querySelector<HTMLInputElement>(`[name=${n}]`)?.value.trim() ?? "";
  const ciudad = val("ciudad") === OTRA ? val("ciudad_otra") || "Coordenadas manuales" : val("ciudad");
  return {
    fecha_nac: val("fecha_nac"),
    hora_nac: val("hora_nac"),
    ciudad,
    lat: val("lat"),
    lon: val("lon"),
    utc: val("utc"),
  };
}

// --- Lo que dicta la carta ---------------------------------------------------------

export const TEMA_CORTO: Record<string, string> = {
  sol: "Propósito", luna: "Emociones", mercurio: "Comunicación", venus: "Trato",
  marte: "Empuje", jupiter: "Visión", saturno: "Disciplina", ascendente: "Estilo",
};

const ELEMENTO_REGLA: Record<string, string> = {
  Fuego: "impulso, acción y entusiasmo",
  Tierra: "practicidad, método y constancia",
  Aire: "ideas, comunicación y análisis",
  Agua: "intuición, empatía y cohesión",
};

const MODALIDAD_REGLA: Record<string, string> = {
  Cardinal: "inicia, abre caminos y toma la iniciativa",
  Fija: "sostiene, da continuidad y lleva las cosas hasta el final",
  Mutable: "se adapta, conecta y se mueve con el cambio",
};

/** Las reglas que fija la carta: elemento, modalidad y estilo ante el conflicto. */
export function reglasCarta(carta: Carta): string {
  const modalidad = Object.entries(carta.modalidades).sort((a, b) => b[1] - a[1])[0][0];
  const e = carta.elemento_dominante;
  return `<div class="reglas">
      <div class="regla" style="--c:${COLOR_ELEMENTO[e]}">
        <span class="regla-cab">Elemento</span><strong>${esc(e)}</strong>
        <p>${ELEMENTO_REGLA[e]}</p></div>
      <div class="regla">
        <span class="regla-cab">Modalidad</span><strong>${esc(modalidad)}</strong>
        <p>${MODALIDAD_REGLA[modalidad]}</p></div>
      ${carta.conflicto ? `<div class="regla" style="--c:var(--flame)">
        <span class="regla-cab">Ante el conflicto</span><strong>${carta.conflicto.dominante}</strong>
        <p>${MODO_DESC[carta.conflicto.dominante].replace(/\.$/, "").toLowerCase()}</p></div>` : ""}
    </div>`;
}

/** Lo que dicta la carta: las reglas y un rasgo por astro, tal como los fijan los astros. */
export function panelAtributos(carta: Carta): string {
  const filas = (carta.atributos ?? [])
    .map(
      (a) => `<li class="atributo">
          <span class="atributo-glifo" style="color:${COLOR_ELEMENTO[a.elemento]}">${a.glifo}</span>
          <div class="atributo-texto">
            <strong>${esc(a.tema)}</strong> <span class="meta-inline">${esc(a.astro)} en ${a.simbolo} ${esc(a.signo)}</span>
            <p>${esc(a.texto)}</p>
          </div>
        </li>`,
    )
    .join("");
  return `${reglasCarta(carta)}<ul class="atributos">${filas}</ul>`;
}

// --- Tarjeta resumen de una carta --------------------------------------------------

export function tarjetaCarta(rol: string, nombre: string, carta: Carta | null, vacioTxt = ""): string {
  if (!carta) {
    return `<article class="carta-mini carta-mini-vacia">
        <p class="eyebrow">${esc(rol)}</p><h3>${esc(nombre)}</h3>
        <p class="nota">${esc(vacioTxt || "Sin datos natales: no se puede trazar la carta.")}</p>
      </article>`;
  }
  const clave = (k: string) => carta.posiciones[k];
  return `<article class="carta-mini">
      <p class="eyebrow">${esc(rol)}</p>
      <h3>${esc(nombre)}</h3>
      <div class="carta-mini-rueda">${ruedaZodiacal(carta, 260)}</div>
      <p class="astros-mini">${["sol", "luna", "ascendente"]
        .map(clave)
        .filter(Boolean)
        .map((p) => `<span><b>${p.glifo}</b> <i style="color:${COLOR_ELEMENTO[p.elemento]}">${p.simbolo}</i> ${esc(p.signo)}</span>`)
        .join("")}</p>
      <p class="meta">Elemento <b style="color:${COLOR_ELEMENTO[carta.elemento_dominante]}">${esc(carta.elemento_dominante)}</b>
        ${carta.conflicto ? ` · ante el conflicto: <b>${carta.conflicto.dominante.toLowerCase()}</b>` : ""}</p>
    </article>`;
}

// --- Rejilla de aspectos de la sinastría --------------------------------------------

const ORDEN = ["sol", "luna", "mercurio", "venus", "marte", "jupiter", "saturno", "ascendente"];

export function rejillaSinastria(sin: Sinastria, a: Carta, b: Carta, nombreA: string, nombreB: string): string {
  const filas = ORDEN.filter((k) => a.posiciones[k]);
  const cols = ORDEN.filter((k) => b.posiciones[k]);
  const cab = cols
    .map((k) => `<th scope="col" title="${esc(b.posiciones[k].astro)} de ${esc(nombreB)}">${b.posiciones[k].glifo}</th>`)
    .join("");
  const cuerpo = filas
    .map((fa) => {
      const celdas = cols
        .map((cb) => {
          const asp = sin.rejilla[fa]?.[cb];
          return asp
            ? `<td class="${asp.armonico ? "asp-armonico" : "asp-tenso"}" title="${esc(a.posiciones[fa].astro)} ${esc(asp.aspecto)} ${esc(b.posiciones[cb].astro)} · orbe ${asp.orbe}°">${asp.glifo}</td>`
            : `<td></td>`;
        })
        .join("");
      return `<tr><th scope="row" title="${esc(a.posiciones[fa].astro)} de ${esc(nombreA)}">${a.posiciones[fa].glifo} <span>${esc(TEMA_CORTO[fa])}</span></th>${celdas}</tr>`;
    })
    .join("");
  return `<div class="tabla-scroll"><table class="rejilla" aria-label="Aspectos entre la carta de ${esc(nombreA)} y la de ${esc(nombreB)}">
      <thead><tr><th><span class="sr">Astro</span><span class="rejilla-esquina">${esc(nombreA)} ↓ · ${esc(nombreB)} →</span></th>${cab}</tr></thead>
      <tbody>${cuerpo}</tbody></table></div>
    <p class="leyenda-asp"><span class="asp-armonico">△ ⚹ ☌</span> armonizan · <span class="asp-tenso">□ ☍ ⚻</span> tensan</p>`;
}

// --- Manejo de conflictos ------------------------------------------------------------

export const MODOS: ModoConflicto[] = ["Competir", "Colaborar", "Negociar", "Evitar", "Complacer"];

export const MODO_DESC: Record<ModoConflicto, string> = {
  Competir: "Defiende su posición con firmeza; resuelve rápido, pero puede imponerse.",
  Colaborar: "Busca soluciones en las que ganen ambas partes y dialoga a fondo.",
  Negociar: "Cede en algo para llegar a un punto medio práctico.",
  Evitar: "Pospone o esquiva el conflicto; prefiere enfriar antes de hablar.",
  Complacer: "Prioriza la relación y cede ante el otro para mantener la armonía.",
};

/** Ficha del estilo de conflicto de una carta: barras por estilo y lo que la detona o calma. */
export function fichaConflicto(rol: string, nombre: string, p: PerfilConflicto | undefined): string {
  if (!p) {
    return `<article class="ficha-conflicto vacia"><p class="eyebrow">${esc(rol)}</p><h3>${esc(nombre)}</h3>
      <p class="nota">Sin carta astral: no se puede leer su forma de manejar conflictos.</p></article>`;
  }
  const barras = MODOS.map(
    (m) => `<div class="modo-fila ${m === p.dominante ? "dominante" : ""}">
        <span>${m}</span>
        <div class="barra"><span style="width:${Math.min(100, p.modos[m] * 2.2)}%;background:${m === p.dominante ? "var(--flame)" : "var(--gold)"}"></span></div>
        <span class="num">${p.modos[m].toFixed(0)}%</span>
      </div>`,
  ).join("");
  return `<article class="ficha-conflicto">
      <p class="eyebrow">${esc(rol)}</p>
      <h3>${esc(nombre)}</h3>
      <p class="estilo-dominante">Tiende a <strong>${p.dominante.toLowerCase()}</strong> · luego a ${p.secundario.toLowerCase()}</p>
      <div class="modos">${barras}</div>
      <dl class="conflicto-dl">
        <dt>♂ Ante el conflicto</dt><dd>${esc(p.ante_conflicto)}</dd>
        <dt>☽ Lo detona</dt><dd>${esc(p.detonante[0].toUpperCase() + p.detonante.slice(1))}.</dd>
        <dt>☽ Necesita</dt><dd>${esc(p.necesita[0].toUpperCase() + p.necesita.slice(1))}.</dd>
      </dl>
    </article>`;
}
