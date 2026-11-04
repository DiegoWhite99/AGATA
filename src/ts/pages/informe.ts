import { api, ApiError } from "../api.js";
import {
  chipArquetipo, fichaConflicto, itemAspecto, itemConflicto, MODOS, panelAtributos, rejillaSinastria, TEMA_CORTO,
  tarjetaCarta,
} from "../astro-ui.js";
import { radar } from "../radar.js";
import {
  $, $$, anillo, badgeDecision, barra, colorPuntaje, confirmar, esAdmin, esc, fecha, laurel, mostrarErrores, toast, vacio,
} from "../ui.js";
import type {
  CampoEnlace, Carta, Decision, DictamenIA, EnlaceBase, EnlaceGithub, EnlacePagina, EnlaceRepositorio,
  Informe, ResultadoIA, Sinastria,
} from "../types.js";

const raiz = $("#informe");
const id = Number(raiz.dataset.id);
let datos: Informe;
let pestana: "lider" | "empresa" = "lider";
let dicta: "postulante" | "lider" | "empresa" = "postulante";

const ESTADO_TXT = { cumple: "Cumple", parcial: "Parcial", brecha: "Por explorar", sin_lectura: "Sin lectura IA" };

const EVIDENCIA_TXT = { directa: "Directa", deducida: "Deducida de proyectos", "sin evidencia": "Sin evidencia" };

const NOMBRE_EXCLUYENTE = { titulo: "Título", experiencia: "Experiencia", proyectos: "Proyectos" };
const CUMPLE_TXT = { si: "Cumple", no: "No cumple", dudoso: "Por validar", "sin verificar": "Sin verificar" };

function seccionRequisitos(): string {
  const reqs = datos.candidato.resultado.requisitos ?? [];
  if (!reqs.length) return "";
  return `<section class="tarjeta requisitos-excl">
      <header class="tarjeta-cab"><div><p class="eyebrow">Lo innegociable del cargo</p><h2>Requisitos excluyentes</h2></div></header>
      <ul class="lista">${reqs.map((r) => `<li class="lista-item">
          <div><strong class="lista-titulo">${NOMBRE_EXCLUYENTE[r.tipo]}</strong><span class="meta">${esc(r.texto)}</span>
            ${r.evidencia ? `<p class="evidencia-ia">${esc(r.evidencia)}</p>` : ""}</div>
          <span class="estado-req estado-req-${r.cumple.replace(" ", "-")}">${CUMPLE_TXT[r.cumple]}</span>
        </li>`).join("")}</ul>
      ${reqs.some((r) => r.cumple === "sin verificar") && datos.ia.activa
        ? `<p class="meta">Algún requisito aún no se verificó: vuelve a consultar a la IA.</p>` : ""}
    </section>`;
}

function seccionRedireccion(): string {
  const r = datos.redireccion;
  if (!r) return "";
  return `<section class="tarjeta redireccion">
      <div>
        <p class="eyebrow">Para no perder el talento</p>
        <h2>↪ Podría encajar mejor en «${esc(r.cargo)}»</h2>
        <p class="parrafo">${esc(r.area)}. Su perfil profesional (hoja de vida, habilidades y trabajo en línea) encaja
          <strong>${r.perfil.toFixed(0)}%</strong> allá frente a <strong>${r.perfil_aqui.toFixed(0)}%</strong> aquí, comparado sin la IA.
          La astrología no decide esta sugerencia. Si lo postulas, AGATA lo evalúa frente a ese cargo y su líder.</p>
      </div>
      <div class="acciones-wrap no-print">
        <a class="btn btn-sec btn-sm" href="/vacantes/${r.vacante_id}">Ver el cargo</a>
        <button class="btn btn-sm" id="btn-redirigir" data-vacante="${r.vacante_id}">Postularlo también a ese cargo</button>
      </div>
    </section>`;
}

const COMPONENTES: { clave: keyof Informe["candidato"]["resultado"]["componentes"]; nombre: string }[] = [
  { clave: "lider", nombre: "Sinastría con el líder" },
  { clave: "empresa", nombre: "Sinastría con la empresa" },
  { clave: "elemento", nombre: "Elemento afín al cargo" },
  { clave: "conflicto", nombre: "Manejo de conflictos" },
  { clave: "cv", nombre: "Hoja de vida" },
  { clave: "ia", nombre: "Ajuste con el líder (IA)" },
];

const dictamenOk = (ia: ResultadoIA | undefined): ia is DictamenIA => !!ia && !("error" in ia);
const primerNombre = (n: string) => n.split(" ")[0].charAt(0).toUpperCase() + n.split(" ")[0].slice(1).toLowerCase();

function lectura(nombre: string, detalle: string, valor: number | null): string {
  return `<div class="lectura">
      <strong>${valor == null ? "—" : `${valor.toFixed(0)}%`}</strong>
      <span>${nombre}</span><small class="meta">${detalle}</small>
    </div>`;
}

function componente(nombre: string, valor: number | null, peso: number, total: number): string {
  if (valor == null) {
    return `<div class="componente apagado">
      <div class="componente-cab"><span>${nombre}</span><span class="meta">sin datos</span></div>
      <div class="componente-fila">${barra(0)}<strong class="num">—</strong></div>
    </div>`;
  }
  return `<div class="componente">
      <div class="componente-cab"><span>${nombre}</span><span class="meta">peso ${Math.round((peso / total) * 100)}%</span></div>
      <div class="componente-fila">${barra(valor)}<strong class="num">${valor.toFixed(0)}%</strong></div>
    </div>`;
}

function lista(items: string[], vacioTxt: string): string {
  return items.length ? `<ul class="lista-oraculo">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : `<p class="meta">${vacioTxt}</p>`;
}

// --- Sinastría ------------------------------------------------------------------

/** `color` identifica a quién se compara (líder, empresa o elemento) y es el mismo del radar. */
function kpiSinastria(titulo: string, sin: Sinastria | null, faltante: string, color: string): string {
  if (!sin) return `<div class="kpi kpi-sinastria apagado" style="--c:${color}"><strong>—</strong><span><i class="marca-serie"></i>${titulo}</span><p class="meta">${faltante}</p></div>`;
  return `<div class="kpi kpi-sinastria" style="--c:${color}">
      <strong>${sin.puntaje.toFixed(0)}%</strong>
      <span><i class="marca-serie"></i>${titulo}</span>
      <p class="meta">${sin.armonicos} aspectos armónicos · ${sin.tensos} tensos · afinidad elemental ${sin.elemental.toFixed(0)}%</p>
    </div>`;
}

function detalleSinastria(sin: Sinastria | null, otra: Carta | null, nombreOtra: string): string {
  const c = datos.candidato;
  if (!sin || !otra) {
    return `<p class="nota">No hay carta de ${esc(nombreOtra)} para comparar.</p>`;
  }
  const aspectos = sin.aspectos.map(itemAspecto).join("");
  return `<div class="sinastria-detalle">
      <div>${rejillaSinastria(sin, c.carta, otra, primerNombre(c.nombre), nombreOtra)}</div>
      <div><h3 class="subtitulo">Aspectos más fuertes</h3><ul class="aspectos">${aspectos || `<li class="meta">Sin aspectos dentro de orbe.</li>`}</ul></div>
    </div>`;
}

function seccionSinastria(): string {
  const { candidato: c, lider: l, empresa: e } = datos;
  const sin = c.resultado.sinastria ?? { lider: null, empresa: null };
  const claves = Object.keys(TEMA_CORTO).filter((k) => c.carta.posiciones[k]);
  const series = [];
  if (sin.lider) series.push({ nombre: `Con ${primerNombre(l.nombre)}`, valores: claves.map((k) => sin.lider!.por_astro[k] ?? 50), color: "var(--c-lider)" });
  if (sin.empresa) series.push({ nombre: `Con ${e?.nombre ?? "la empresa"}`, valores: claves.map((k) => sin.empresa!.por_astro[k] ?? 50), color: "var(--c-empresa)" });
  const radarSin = series.length
    ? radar(claves.map((k) => TEMA_CORTO[k]), series, { tam: 340, titulo: "Armonía de cada astro del postulante" })
    : `<p class="nota">Faltan las cartas del líder y de la empresa para medir la sinastría.</p>`;

  return `<section class="tarjeta sinastria">
      <header class="tarjeta-cab"><div><p class="eyebrow">El corazón del match</p><h2>Sinastría</h2></div></header>
      <div class="sinastria-cab">
        <div class="sinastria-kpis">
          ${kpiSinastria(`Con ${esc(l.nombre)} (líder)`, sin.lider, "El líder no tiene datos natales.", "var(--c-lider)")}
          ${kpiSinastria(`Con ${esc(e?.nombre ?? "la empresa")}`, sin.empresa, "Falta la carta de la empresa.", "var(--c-empresa)")}
          ${c.resultado.elemento?.afin ? `<div class="kpi kpi-sinastria" style="--c:var(--c-elemento)"><strong>${(c.resultado.elemento.puntaje ?? 0).toFixed(0)}%</strong>
            <span><i class="marca-serie"></i>Presencia de ${esc(c.resultado.elemento.afin)}, elemento del cargo</span></div>` : ""}
        </div>
        <div class="sinastria-radar">
          <h3 class="subtitulo centro">Armonía de cada astro de ${esc(primerNombre(c.nombre))}</h3>
          ${radarSin}
        </div>
      </div>
      <div class="filtros" role="tablist" aria-label="Sinastría con">
        <button class="filtro" role="tab" data-pestana="lider" aria-selected="${pestana === "lider"}">Con ${esc(primerNombre(l.nombre))}</button>
        <button class="filtro" role="tab" data-pestana="empresa" aria-selected="${pestana === "empresa"}">Con ${esc(e?.nombre ?? "la empresa")}</button>
      </div>
      <div id="sinastria-detalle">${pestana === "lider"
        ? detalleSinastria(sin.lider, l.carta, primerNombre(l.nombre))
        : detalleSinastria(sin.empresa, e?.carta ?? null, e?.nombre ?? "la empresa")}</div>
    </section>`;
}

// --- Manejo de conflictos ----------------------------------------------------------

function seccionConflictos(): string {
  const { candidato: c, lider: l, empresa: e } = datos;
  const din = c.resultado.conflicto?.lider ?? null;
  const dinEmpresa = c.resultado.conflicto?.empresa ?? null;
  const series = [{ nombre: primerNombre(c.nombre), valores: MODOS.map((m) => c.carta.conflicto?.modos[m] ?? 0), color: "var(--violet)" }];
  if (l.carta?.conflicto) series.push({ nombre: primerNombre(l.nombre), valores: MODOS.map((m) => l.carta!.conflicto.modos[m]), color: "var(--gold)" });
  if (e?.carta?.conflicto) series.push({ nombre: e.nombre, valores: MODOS.map((m) => e.carta!.conflicto.modos[m]), color: "var(--aire)" });

  const dinamica = din
    ? `<div class="dinamica">
        <h3 class="subtitulo">Dinámica entre ${esc(primerNombre(c.nombre))} y ${esc(primerNombre(l.nombre))}</h3>
        <p class="dinamica-riesgo">${esc(din.riesgo)}</p>
        <div class="grid-2">
          <div><h4 class="mini-titulo">Puntos de fricción</h4>
            <ul class="aspectos">${din.fricciones.map((a) => itemConflicto(a, "tenso")).join("") || `<li class="meta">Sin fricciones fuertes entre sus cartas.</li>`}</ul></div>
          <div><h4 class="mini-titulo">Puentes para resolver</h4>
            <ul class="aspectos">${din.puentes.map((a) => itemConflicto(a, "armonico")).join("") || `<li class="meta">Pocos puentes naturales: habrá que acordar cómo discrepar.</li>`}</ul></div>
        </div>
        <div class="consejos">
          <div class="consejo"><strong>Para ${esc(l.nombre)}</strong><p>${esc(din.consejo_para_b)}</p></div>
          <div class="consejo"><strong>Para ${esc(c.nombre)}</strong><p>${esc(din.consejo_para_a)}</p></div>
        </div>
      </div>`
    : `<p class="nota">El líder no tiene carta: no se puede leer la dinámica de conflicto entre ambos.</p>`;

  return `<section class="tarjeta conflictos">
      <header class="tarjeta-cab">
        <div><p class="eyebrow">Perfiles · Thomas-Kilmann</p><h2>Manejo de conflictos</h2></div>
        ${din ? `<div class="conflicto-puntaje"><strong style="color:${colorPuntaje(din.puntaje)}">${din.puntaje.toFixed(0)}%</strong>
          <span>Encaje ante el conflicto con ${esc(primerNombre(l.nombre))}</span></div>` : ""}
      </header>
      <div class="conflictos-grid">
        ${fichaConflicto("Postulante", c.nombre, c.carta.conflicto)}
        ${fichaConflicto("Líder", l.nombre, l.carta?.conflicto)}
        <div class="conflictos-radar">
          <h3 class="subtitulo centro">Estilos frente a frente</h3>
          ${radar(MODOS, series, { max: 50, tam: 300, niveles: 5, titulo: "Estilos ante el conflicto" })}
          ${e?.carta?.conflicto ? `<p class="meta centro">La cultura de ${esc(e.nombre)} tiende a ${e.carta.conflicto.dominante.toLowerCase()}.</p>` : ""}
        </div>
      </div>
      ${dinamica}
      ${dinEmpresa && e ? `<p class="parrafo"><strong>Con la cultura de ${esc(e.nombre)} (${dinEmpresa.puntaje.toFixed(0)}%):</strong> ${esc(dinEmpresa.riesgo)}</p>` : ""}
    </section>`;
}

// --- Dictamen de la IA ----------------------------------------------------

function seccionDictamen(): string {
  const ia = datos.candidato.resultado.ia;
  const estado = datos.ia;
  const boton = (txt: string) =>
    estado.activa ? `<button class="btn btn-sec btn-sm no-print" id="btn-oraculo">✦ ${txt}</button>` : "";

  if (!dictamenOk(ia)) {
    const mensaje = ia && "error" in ia
      ? `<p class="ia-error">${esc(ia.error)}</p>`
      : estado.activa
        ? `<p class="meta">Este postulante se evaluó antes de activar la IA.</p>`
        : `<p class="meta">La IA está apagada. Agrega <code>GROQ_API_KEY</code> al archivo <code>.env</code> para activarlo.</p>`;
    return `<section class="tarjeta dictamen">
        <div class="dictamen-cab"><h2>Dictamen de la IA</h2>${boton("Consultar a la IA")}</div>
        ${mensaje}
      </section>`;
  }
  const lecturaLider = ia.lectura_sinastria_lider || ia.lectura_astral || "";
  const desactualizado = (!ia.lectura_sinastria_lider || ia.manejo_conflictos === undefined) && estado.activa
    ? `<p class="nota">Este dictamen es anterior a las últimas mejoras: vuelve a consultar a la IA para que lea la sinastría y el manejo de conflictos.</p>`
    : "";

  return `<section class="tarjeta dictamen">
      <div class="dictamen-cab">
        <div><p class="eyebrow">Agente de IA · ${esc(ia.modelo)}</p><h2>Dictamen de la IA</h2></div>
        ${boton("Volver a consultar a la IA")}
      </div>
      ${desactualizado}
      <p class="dictamen-resumen">${esc(ia.resumen)}</p>
      ${ia.potencial ? `<div class="potencial">
          <strong>${ia.potencial.puntaje}%</strong>
          <div><h3 class="subtitulo">Potencial de crecimiento</h3><p class="parrafo">${esc(ia.potencial.lectura)}</p>
            ${ia.potencial.senales.length ? `<ul class="chips">${ia.potencial.senales.map((s) => `<li class="chip chip-potencial">${esc(s)}</li>`).join("")}</ul>` : ""}</div>
        </div>` : ""}
      <div class="dictamen-grid">
        <div class="ajuste">
          <strong style="color:${colorPuntaje(ia.ajuste_lider)}">${ia.ajuste_lider}%</strong>
          <span>Ajuste con el líder</span>
          <p>${esc(ia.ajuste_explicacion)}</p>
        </div>
        <div>
          ${lecturaLider ? `<h3 class="subtitulo">Lectura de la sinastría con el líder</h3><p class="parrafo">${esc(lecturaLider)}</p>` : ""}
          ${ia.lectura_sinastria_empresa ? `<h3 class="subtitulo">Lectura de la sinastría con la empresa</h3><p class="parrafo">${esc(ia.lectura_sinastria_empresa)}</p>` : ""}
          ${ia.manejo_conflictos ? `<h3 class="subtitulo">Manejo de conflictos</h3><p class="parrafo">${esc(ia.manejo_conflictos)}</p>` : ""}
          ${ia.evidencia_en_linea ? `<h3 class="subtitulo">Lo que muestra su trabajo en línea</h3><p class="parrafo">${esc(ia.evidencia_en_linea)}</p>` : ""}
          <h3 class="subtitulo">Lo que ve la IA</h3>
          ${lista(ia.fortalezas, "—")}
        </div>
        <div>
          <h3 class="subtitulo">Riesgos a validar</h3>
          ${lista(ia.riesgos, "Sin riesgos relevantes")}
          <h3 class="subtitulo">Preguntas para la entrevista</h3>
          ${lista(ia.preguntas_entrevista, "—")}
        </div>
      </div>
      ${ia.recomendacion ? `<p class="parrafo"><strong>Recomendación de la IA:</strong> ${esc(ia.recomendacion)}</p>` : ""}
    </section>`;
}

// --- Trabajo en línea ---------------------------------------------------------------

const CAMPOS_TECNICO: { clave: CampoEnlace; nombre: string; ayuda: string }[] = [
  { clave: "portafolio", nombre: "Portafolio", ayuda: "tu-sitio.com" },
  { clave: "github", nombre: "GitHub", ayuda: "usuario o github.com/usuario" },
  { clave: "repositorio", nombre: "Repositorio destacado", ayuda: "github.com/usuario/proyecto · vacío: el más destacado de su GitHub" },
  { clave: "linkedin", nombre: "LinkedIn", ayuda: "linkedin.com/in/usuario" },
];

/** Todo postulante comparte su portafolio; en los cargos técnicos, también GitHub, repositorio y LinkedIn. */
const camposEnlace = () => (datos.vacante.tecnico ? CAMPOS_TECNICO : CAMPOS_TECNICO.slice(0, 1));

const ORIGEN_TXT: Record<string, string> = { "hoja de vida": "de la hoja de vida", github: "elegido de su GitHub" };

// El backend solo guarda URLs http(s); esc() protege el atributo.
const enlace = (url: string, texto = url) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(texto)}</a>`;

function estadoEnlace(e: EnlaceBase): string {
  const origen = ORIGEN_TXT[e.origen] ? `<span class="chip">${ORIGEN_TXT[e.origen]}</span>` : "";
  const estado = e.leido
    ? `<span class="chip chip-ok">leído por la IA</span>`
    : e.error ? `<span class="ia-error">${esc(e.error)}</span>` : `<span class="meta">${esc(e.nota ?? "")}</span>`;
  return origen + estado;
}

function fichaGithub(gh: EnlaceGithub): string {
  if (!gh.leido) return "";
  const repos = (gh.repos ?? []).slice(0, 6).map((r) => `<li>
      <div>${enlace(r.url, r.nombre)} ${r.lenguaje ? `<span class="chip">${esc(r.lenguaje)}</span>` : ""}
        ${r.estrellas ? `<span class="meta-inline">★ ${r.estrellas}</span>` : ""}
        <span class="meta-inline">· ${esc(r.actualizado)}</span></div>
      ${r.descripcion ? `<p class="meta">${esc(r.descripcion)}</p>` : ""}
    </li>`).join("");
  return `<div class="ficha-enlace">
      <h3 class="subtitulo">GitHub · @${esc(gh.usuario)}</h3>
      <p class="meta">${gh.repos_publicos ?? 0} repositorios públicos · ${gh.seguidores ?? 0} seguidores
        ${gh.desde ? ` · en GitHub desde ${esc(gh.desde.slice(0, 4))}` : ""}</p>
      ${gh.bio ? `<p class="parrafo">${esc(gh.bio)}</p>` : ""}
      ${gh.lenguajes?.length ? `<ul class="chips">${gh.lenguajes.map((l) => `<li class="chip">${esc(l)}</li>`).join("")}</ul>` : ""}
      <h4 class="mini-titulo">Actividad reciente</h4>
      <ul class="repos">${repos || `<li class="meta">Sin repositorios propios públicos.</li>`}</ul>
    </div>`;
}

function fichaPagina(titulo: string, p: EnlacePagina): string {
  if (!p.leido) return "";
  return `<div class="ficha-enlace">
      <h3 class="subtitulo">${titulo}${p.titulo ? ` · ${esc(p.titulo)}` : ""}</h3>
      ${p.descripcion ? `<p class="parrafo">${esc(p.descripcion)}</p>` : ""}
      ${p.poco_texto ? `<p class="nota">La página se arma con JavaScript: la IA solo pudo leer su título y su descripción.</p>` : ""}
    </div>`;
}

function fichaRepo(r: EnlaceRepositorio): string {
  if (!r.leido) return "";
  if (r.tipo === "pagina") return fichaPagina("Repositorio destacado", r);
  return `<div class="ficha-enlace">
      <h3 class="subtitulo">Repositorio destacado · ${esc(r.nombre)}</h3>
      ${r.descripcion ? `<p class="parrafo">${esc(r.descripcion)}</p>` : ""}
      <p class="meta">${(r.lenguajes ?? []).filter((l) => l.pct > 0).map((l) => `${esc(l.nombre)} ${l.pct}%`).join(" · ")}
        ${r.actualizado ? ` · actualizado ${esc(r.actualizado)}` : ""}</p>
      ${r.readme ? `<details><summary>README</summary><p class="parrafo">${esc(r.readme.slice(0, 1200))}${r.readme.length > 1200 ? "…" : ""}</p></details>`
        : `<p class="meta">El repositorio no tiene README.</p>`}
    </div>`;
}

function seccionEnlaces(): string {
  const en = datos.candidato.enlaces;
  const filas = camposEnlace().map(({ clave, nombre }) => {
    const e = en?.[clave];
    return `<li class="lista-item">
        <div><strong class="lista-titulo">${nombre}</strong><span class="meta">${e ? enlace(e.url) : "No lo compartió"}</span></div>
        <div class="lista-acciones">${e ? estadoEnlace(e) : ""}</div>
      </li>`;
  }).join("");
  const fichas = [
    en?.github ? fichaGithub(en.github) : "",
    en?.repositorio ? fichaRepo(en.repositorio) : "",
    en?.portafolio ? fichaPagina("Portafolio", en.portafolio) : "",
  ].filter(Boolean).join("");

  return `<section class="tarjeta enlaces">
      <header class="tarjeta-cab">
        <div><p class="eyebrow">Lo que ha construido</p><h2>Trabajo en línea</h2></div>
        ${en?.revisado ? `<span class="meta">Revisado ${esc(en.revisado)}</span>` : ""}
      </header>
      <ul class="lista">${filas}</ul>
      ${fichas ? `<div class="grid-2 fichas-enlace">${fichas}</div>` : ""}
      <details class="no-print editar-enlaces">
        <summary>Agregar o corregir enlaces</summary>
        <form id="form-enlaces" novalidate>
          <div class="grid-2">${camposEnlace().map(({ clave, nombre, ayuda }) => `<label class="campo"><span>${nombre}</span>
            <input name="${clave}" value="${esc(en?.[clave]?.origen === "github" ? "" : en?.[clave]?.url ?? "")}" placeholder="${ayuda}" autocomplete="off">
            <small class="error" data-error="${clave}" hidden></small></label>`).join("")}</div>
          <div class="acciones-wrap">
            <button class="btn btn-sm" type="submit">Guardar y volver a leer</button>
            <span class="meta">Un campo vacío toma el enlace de la hoja de vida, si lo trae. Con la IA activa, se recalcula el dictamen.</span>
          </div>
        </form>
      </details>
    </section>`;
}

async function guardarEnlaces(form: HTMLFormElement): Promise<void> {
  const boton = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
  boton.disabled = true;
  boton.textContent = "Leyendo los enlaces…";
  const cuerpo = Object.fromEntries(
    camposEnlace().map(({ clave }) => [clave, (form.elements.namedItem(clave) as HTMLInputElement).value.trim()]));
  try {
    await api.put(`/api/candidatos/${id}/enlaces`, cuerpo);
    toast("Enlaces leídos y match recalculado");
    await cargar();
  } catch (err) {
    boton.disabled = false;
    boton.textContent = "Guardar y volver a leer";
    mostrarErrores(form, err);
  }
}

// --- Lo que dictan las cartas --------------------------------------------------------

function dictaDe(quien: "postulante" | "lider" | "empresa"): string {
  const { candidato: c, lider: l, empresa: e } = datos;
  const carta = quien === "postulante" ? c.carta : quien === "lider" ? l.carta : e?.carta ?? null;
  if (!carta) {
    return `<p class="nota">${quien === "empresa" ? "La empresa aún no tiene carta: complétala en la sección Empresa."
      : "No hay datos natales para trazar esta carta."}</p>`;
  }
  return `<p class="parrafo"><strong>${esc(carta.resumen)}</strong></p>${panelAtributos(carta)}`;
}

// --- Página ------------------------------------------------------------------------

function pintar(): void {
  const { candidato: c, vacante: v, lider: l, empresa: e } = datos;
  const r = c.resultado;
  const totalPesos = Object.values(r.pesos).reduce((a, b) => a + (b ?? 0), 0) || 1;
  const nuevo = new URLSearchParams(location.search).has("nuevo");
  document.title = `Informe: ${c.nombre} · AGATA`;

  const radarHabilidades = r.habilidades.length >= 3
    ? radar(r.habilidades.map((h) => h.nombre), [
        { nombre: "Nivel requerido", valores: r.habilidades.map((h) => h.requerido), color: "var(--gold)", punteada: true },
        { nombre: c.nombre, valores: r.habilidades.map((h) => h.cv ?? 0), color: "var(--violet)" },
      ], { tam: 380, titulo: `Habilidades de ${c.nombre} según su hoja de vida` })
    : "";

  raiz.innerHTML = `
    ${nuevo ? `<div class="aviso">✦ Postulación registrada. AGATA ya preparó su informe.</div>` : ""}
    <a class="migas no-print" href="/vacantes/${v.id}">← ${esc(v.cargo)}</a>
    <header class="pagina-cab">
      <div>
        <p class="eyebrow">Informe de match astral · ${fecha(c.creado)}</p>
        <h1>${esc(c.nombre)}</h1>
        ${chipArquetipo(c.carta, true)}
        <p class="lead">${esc(v.cargo)} · ${esc(v.area)} · Líder: ${esc(l.nombre)}${e ? ` · ${esc(e.nombre)}` : ""}</p>
        <p class="meta">${esc(c.email)}${c.telefono ? ` · ${esc(c.telefono)}` : ""}</p>
      </div>
      <div class="acciones-wrap no-print">
        <a class="btn btn-sec" href="/api/candidatos/${c.id}/cv">✒ Hoja de vida</a>
        ${l.cv_archivo ? `<a class="btn btn-sec" href="/api/lideres/${l.id}/cv">✒ Hoja de vida del líder</a>` : ""}
        <button class="btn btn-sec" id="btn-imprimir">Imprimir / PDF</button>
      </div>
    </header>

    ${r.alertas?.length ? `<div class="alertas-informe" role="note">${r.alertas
      .map((a) => `<p class="alerta alerta-${a.clave}">⚠ ${esc(a.texto)}</p>`).join("")}</div>` : ""}

    <section class="tarjeta veredicto">
      <div class="corona">${laurel(230)}${anillo(r.puntaje, 150, 10, "var(--gold)")}</div>
      <div class="veredicto-texto">
        <p class="eyebrow">Lectura de AGATA · puesto ${datos.ranking.posicion} de ${datos.ranking.total} en esta vacante</p>
        <h2>${badgeDecision(c.decision_lider, c.decision_direccion)}${r.cumple_requisitos === false ? ` <span class="badge badge-no-cumple">No cumple requisitos</span>` : ""}</h2>
        <p>${r.cumple_requisitos === false
          ? "No cumple un requisito excluyente del cargo: queda al final del ranking y el líder confirma."
          : "Nadie queda descartado: el puntaje ordena a los postulantes, el líder decide quién avanza y la dirección da la aprobación final."}</p>
        <div class="lecturas">
          ${lectura("Perfil profesional", "Hoja de vida + IA", r.lecturas.profesional)}
          ${lectura("Afinidad astral", "Líder, empresa, elemento y conflictos", r.lecturas.astral)}
          ${r.potencial ? lectura("Potencial", "Capacidad de crecer (IA) · no suma al puntaje", r.potencial.puntaje) : ""}
        </div>
        ${r.destaca.length ? `<h3 class="subtitulo">Destaca en</h3>
          <ul class="chips">${r.destaca.map((d) => `<li class="chip chip-ok">${esc(d.nombre)} · ${d.puntaje.toFixed(0)}%</li>`).join("")}</ul>` : ""}
      </div>
      <div class="componentes">
        ${COMPONENTES.map((k) => componente(k.nombre, r.componentes[k.clave] ?? null, r.pesos[k.clave] ?? 0, totalPesos)).join("")}
      </div>
    </section>

    ${seccionRequisitos()}

    ${seccionRedireccion()}

    <section class="tarjeta">
      <h2>Las tres cartas</h2>
      <div class="cartas-trio">
        ${tarjetaCarta("Postulante", c.nombre, c.carta)}
        ${tarjetaCarta("Líder", l.nombre, l.carta)}
        ${tarjetaCarta("Empresa", e?.nombre ?? "La empresa", e?.carta ?? null,
          "Aún no hay carta de la empresa: complétala en la sección Empresa.")}
      </div>
    </section>

    <section class="tarjeta">
      <header class="tarjeta-cab">
        <div><p class="eyebrow">La regla de los astros</p><h2>Lo que dictan las cartas</h2></div>
        <div class="filtros" role="tablist" aria-label="Carta">
          <button class="filtro" role="tab" data-dicta="postulante" aria-selected="${dicta === "postulante"}">${esc(primerNombre(c.nombre))}</button>
          <button class="filtro" role="tab" data-dicta="lider" aria-selected="${dicta === "lider"}">${esc(primerNombre(l.nombre))}</button>
          <button class="filtro" role="tab" data-dicta="empresa" aria-selected="${dicta === "empresa"}">${esc(e?.nombre ?? "Empresa")}</button>
        </div>
      </header>
      <div id="dicta-detalle">${dictaDe(dicta)}</div>
    </section>

    ${seccionSinastria()}

    ${seccionConflictos()}

    ${seccionDictamen()}

    ${seccionEnlaces()}

    <div class="grid-2">
      <section class="tarjeta">
        <h2>Hoja de vida frente al cargo</h2>
        ${radarHabilidades}
        <dl class="datos-cv">
          <dt>Experiencia detectada</dt><dd>${r.experiencia_anios != null ? `${r.experiencia_anios} años` : "No especificada"}</dd>
          <dt>Nivel educativo</dt><dd>${esc(r.nivel_educativo ?? "No detectado")}</dd>
          <dt>Palabras analizadas</dt><dd>${r.cv_palabras}</dd>
        </dl>
      </section>
      <section class="tarjeta">
        <h2>Recomendación</h2>
        <p class="parrafo">${esc(r.recomendacion)}</p>
        <div class="grid-2 mini-grid">
          <div><h3 class="subtitulo">Puntos a favor</h3>${r.fortalezas.length ? `<ul class="chips">${r.fortalezas.map((f) => `<li class="chip chip-ok">${esc(f)}</li>`).join("")}</ul>` : `<p class="meta">En las habilidades aún no hay evidencia fuerte; mira «Destaca en», arriba.</p>`}</div>
          <div><h3 class="subtitulo">Para explorar en la entrevista</h3>${r.brechas.length ? `<ul class="chips">${r.brechas.map((f) => `<li class="chip">${esc(f)}</li>`).join("")}</ul>` : `<p class="meta">Nada pendiente en las habilidades del cargo</p>`}</div>
        </div>
        ${bloqueDecision()}
        ${c.nota_lider ? `<p class="nota solo-print">Nota del líder: ${esc(c.nota_lider)}</p>` : ""}
      </section>
    </div>

    <section class="tarjeta">
      <h2>Matriz de habilidades</h2>
      <div class="tabla-scroll"><table class="tabla matriz">
        <thead><tr>
          <th>Habilidad</th><th class="num">Peso</th><th class="num">Requerido</th><th class="num">Palabras clave</th>
          <th class="num">Lectura IA</th><th class="num">Hoja de vida</th><th>Cobertura</th><th>Estado</th><th>Evidencia</th>
        </tr></thead>
        <tbody>${r.habilidades
          .map(
            (h) => `<tr>
              <td><strong>${esc(h.nombre)}</strong><span class="meta">${h.tipo === "blanda" ? "Blanda" : "Técnica"}</span></td>
              <td class="num">${h.peso}</td>
              <td class="num">${h.requerido.toFixed(0)}</td>
              ${h.tipo === "blanda"
                ? `<td class="num" title="Las blandas no se buscan por palabras clave"><span class="meta-inline">—</span></td>`
                : `<td class="num celda-calor" style="--v:${h.cv_claves / 100}">${h.cv_claves.toFixed(0)}</td>`}
              <td class="num celda-calor" style="--v:${(h.cv_ia ?? 0) / 100}">${h.cv_ia != null ? h.cv_ia.toFixed(0) : "—"}</td>
              <td class="num"><strong>${h.cv != null ? h.cv.toFixed(0) : "—"}</strong></td>
              <td>${h.cobertura != null ? `<div class="cobertura">${barra(h.cobertura)}<span class="num">${h.cobertura.toFixed(0)}%</span></div>` : `<span class="meta">—</span>`}</td>
              <td><span class="estado-hab estado-${h.estado}">${ESTADO_TXT[h.estado]}</span></td>
              <td class="claves">
                ${h.evidencia_tipo ? `<span class="chip ${h.evidencia_tipo === "deducida" ? "chip-potencial" : h.evidencia_tipo === "directa" ? "chip-ok" : ""}">${EVIDENCIA_TXT[h.evidencia_tipo]}</span>` : ""}
                ${h.fuente ? `<span class="meta-inline">${esc(h.fuente)}</span>` : ""}
                ${h.tipo !== "blanda" && h.claves_encontradas.length ? h.claves_encontradas.map((k) => `<span class="chip">${esc(k)}</span>`).join("") : ""}
                ${h.evidencia_ia ? `<p class="evidencia-ia">${esc(h.evidencia_ia)}</p>` : ""}
                ${!h.evidencia_tipo && !h.evidencia_ia && !h.claves_encontradas.length ? `<span class="meta">Sin evidencia</span>` : ""}</td>
            </tr>`,
          )
          .join("")}</tbody>
      </table></div>
    </section>`;
}

async function cargar(): Promise<void> {
  datos = await api.get<Informe>(`/api/candidatos/${id}`);
  pintar();
}

// --- Decisión del líder y aprobación final de la dirección ------------------------------------
// El líder aprueba; luego el cargo de dirección que encabeza su cadena de mando da la aprobación final, y con ella
// la persona entra al equipo del líder. Si el cargo es de esa misma dirección, su aprobación como líder basta.

const direccionPropia = () => datos.soy_direccion && datos.direccion?.id === datos.lider.id;

function bloqueDecision(): string {
  const { candidato: c, direccion: dir } = datos;
  const fijada = c.decision_direccion != null && !direccionPropia();
  return `<div class="decision no-print" id="decision">
      <h3 class="subtitulo">Decisión del líder</h3>
      ${fijada
        ? `<p class="nota">${esc(dir?.nombre ?? "La dirección")} ya dio la decisión final. Para cambiar la del líder, primero debe retirarla.</p>`
        : `<textarea id="nota" rows="2" placeholder="Nota para el equipo de selección (opcional)">${esc(c.nota_lider ?? "")}</textarea>`}
      <div class="acciones-wrap">
        ${fijada ? "" : `<button class="btn btn-ok btn-sm" data-decision="aprobado">✓ Aprobar</button>
          <button class="btn btn-peligro btn-sm" data-decision="rechazado">✕ Rechazar</button>
          ${c.decision_lider ? `<button class="btn btn-sec btn-sm" data-decision="">Quitar decisión</button>` : ""}`}
        ${esAdmin ? `<button class="btn btn-fantasma btn-sm" id="btn-borrar">Eliminar postulación</button>` : ""}
      </div>
    </div>
    ${bloqueDireccion()}`;
}

function bloqueDireccion(): string {
  const { candidato: c, direccion: dir, lider: l } = datos;
  const quien = dir ? `<strong>${esc(dir.nombre)}</strong> (${esc(dir.cargo)})` : "";
  let cuerpo: string;
  if (!dir) {
    cuerpo = `<p class="nota">La cadena de mando de ${esc(l.nombre)} no tiene un cargo de dirección, así que nadie puede dar
      la aprobación final. Asígnale su jefe inmediato en Líderes.</p>`;
  } else if (c.decision_direccion) {
    const entro = c.decision_direccion === "aprobado";
    cuerpo = `<p class="${entro ? "direccion-entro" : "nota"}">${entro
        ? `★ ${esc(c.nombre)} es parte del equipo de ${esc(l.nombre)}.`
        : "✖ La dirección no aprobó su ingreso al equipo."}
        <span class="meta-inline">${esc(c.direccion_por ?? dir.nombre)}${c.fecha_direccion ? ` · ${fecha(c.fecha_direccion)}` : ""}</span></p>
      ${c.nota_direccion ? `<p class="parrafo">«${esc(c.nota_direccion)}»</p>` : ""}
      ${datos.soy_direccion && !direccionPropia()
        ? `<div class="acciones-wrap no-print"><button class="btn btn-sec btn-sm" data-direccion="">Quitar decisión final</button></div>` : ""}`;
  } else if (c.decision_lider !== "aprobado") {
    cuerpo = direccionPropia()
      ? `<p class="meta">Este cargo es tuyo y ocupas la dirección: al aprobar como líder, la persona entra a tu equipo.</p>`
      : `<p class="meta">Cuando ${esc(l.nombre)} apruebe, ${quien} da la aprobación final para que entre a su equipo.</p>`;
  } else {
    cuerpo = `<p class="meta">◷ Espera la aprobación final de ${quien}.</p>
      ${datos.soy_direccion ? `<div class="no-print">
          <textarea id="nota-direccion" rows="2" placeholder="Nota de la dirección (opcional)"></textarea>
          <div class="acciones-wrap">
            <button class="btn btn-ok btn-sm" data-direccion="aprobado">★ Aprobar ingreso al equipo</button>
            <button class="btn btn-peligro btn-sm" data-direccion="rechazado">✕ No aprobar</button>
          </div></div>` : ""}`;
  }
  return `<div class="decision decision-direccion" id="decision-direccion">
      <h3 class="subtitulo">Aprobación de la dirección</h3>${cuerpo}</div>`;
}

/** Al entrar alguien al equipo, se pregunta si la vacante se cierra (un cargo puede tener varias plazas). */
function preguntarCierre(): boolean {
  return datos.vacante.estado === "abierta" && confirmar(
    `${datos.candidato.nombre} entra al equipo. ¿Cerrar también la vacante «${datos.vacante.cargo}»?\n\n` +
    "Aceptar: se cierra y deja de recibir postulaciones.\nCancelar: sigue abierta (por si hay más plazas).");
}

async function decidir(decision: Decision): Promise<void> {
  const nota = $<HTMLTextAreaElement>("#nota").value;
  const cerrar_vacante = decision === "aprobado" && direccionPropia() && preguntarCierre();
  try {
    await api.patch(`/api/candidatos/${id}/decision`, { decision, nota, cerrar_vacante });
    toast(decision === "aprobado"
      ? (direccionPropia() ? `${datos.candidato.nombre} entró a tu equipo` : "Postulante aprobado: falta la aprobación de la dirección")
      : decision === "rechazado" ? "Postulante rechazado" : "Decisión retirada");
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "No se pudo guardar la decisión.", "error");
  }
  await cargar();
}

async function decidirDireccion(decision: Decision): Promise<void> {
  const nota = document.querySelector<HTMLTextAreaElement>("#nota-direccion")?.value ?? "";
  const cerrar_vacante = decision === "aprobado" && preguntarCierre();
  try {
    const r = await api.patch<{ vacante_cerrada: boolean }>(`/api/candidatos/${id}/direccion`, { decision, nota, cerrar_vacante });
    toast(decision === "aprobado"
      ? `${datos.candidato.nombre} entró al equipo de ${datos.lider.nombre}${r.vacante_cerrada ? " · vacante cerrada" : ""}`
      : decision === "rechazado" ? "Ingreso no aprobado" : "Decisión final retirada");
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "No se pudo guardar la decisión.", "error");
  }
  await cargar();
}

async function reconsultar(btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true;
  btn.textContent = "La IA está leyendo…";
  try {
    await api.post(`/api/candidatos/${id}/oraculo`, {});
    toast("La IA dio un nuevo dictamen");
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "No se pudo consultar a la IA.", "error");
  }
  await cargar();
}

raiz.addEventListener("click", async (e) => {
  const t = e.target as HTMLElement;
  const d = t.closest<HTMLElement>("[data-decision]");
  if (d) await decidir((d.dataset.decision || null) as Decision);
  const dd = t.closest<HTMLElement>("[data-direccion]");
  if (dd) await decidirDireccion((dd.dataset.direccion || null) as Decision);
  const q = t.closest<HTMLElement>("[data-dicta]");
  if (q) {
    dicta = q.dataset.dicta as typeof dicta;
    $$("[data-dicta]", raiz).forEach((b) => b.setAttribute("aria-selected", String(b === q)));
    $("#dicta-detalle").innerHTML = dictaDe(dicta);
  }
  const p = t.closest<HTMLElement>("[data-pestana]");
  if (p) {
    pestana = p.dataset.pestana as "lider" | "empresa";
    $$("[data-pestana]", raiz).forEach((b) => b.setAttribute("aria-selected", String(b === p)));
    const { candidato: c, lider: l, empresa: em } = datos;
    $("#sinastria-detalle").innerHTML = pestana === "lider"
      ? detalleSinastria(c.resultado.sinastria.lider, l.carta, primerNombre(l.nombre))
      : detalleSinastria(c.resultado.sinastria.empresa, em?.carta ?? null, em?.nombre ?? "la empresa");
  }
  if (t.closest("#btn-imprimir")) window.print();
  const redirigir = t.closest<HTMLButtonElement>("#btn-redirigir");
  if (redirigir) {
    redirigir.disabled = true;
    redirigir.textContent = "AGATA lo está evaluando…";
    try {
      const nuevo = await api.post<{ id: number; cargo: string; visible: boolean }>(
        `/api/candidatos/${id}/postular-a/${redirigir.dataset.vacante}`, {});
      if (nuevo.visible) {
        location.href = `/candidatos/${nuevo.id}?nuevo=1`;
        return;
      }
      // Es un cargo de otra área: su líder lo verá en su vacante.
      toast(`Quedó postulado a ${nuevo.cargo}. Su líder ya lo ve en esa vacante.`);
      redirigir.textContent = "Postulado a ese cargo ✓";
      return;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No se pudo postular a ese cargo.", "error");
      redirigir.disabled = false;
      redirigir.textContent = "Postularlo también a ese cargo";
    }
  }
  const oraculo = t.closest<HTMLButtonElement>("#btn-oraculo");
  if (oraculo) await reconsultar(oraculo);
  if (t.closest("#btn-borrar") && confirmar("¿Eliminar esta postulación y su hoja de vida?")) {
    await api.del(`/api/candidatos/${id}`);
    location.href = `/vacantes/${datos.vacante.id}`;
  }
});

raiz.addEventListener("submit", async (e) => {
  const form = (e.target as HTMLElement).closest<HTMLFormElement>("#form-enlaces");
  if (!form) return;
  e.preventDefault();
  await guardarEnlaces(form);
});

cargar().catch(() => {
  raiz.innerHTML = vacio("∅", "Informe no encontrado", "Puede que la postulación haya sido eliminada.", `<a class="btn" href="/vacantes">Volver</a>`);
});
