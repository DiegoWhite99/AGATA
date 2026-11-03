import { api, ApiError } from "../api.js";
import {
  COLOR_ELEMENTO, fichaConflicto, MODOS, panelAtributos, rejillaSinastria, TEMA_CORTO,
  tarjetaCarta,
} from "../astro-ui.js";
import { radar } from "../radar.js";
import {
  $, $$, anillo, badgeDecision, badgeVeredicto, barra, colorPuntaje, confirmar, esc, fecha, laurel, toast, vacio,
} from "../ui.js";
import type { AspectoConflicto, Carta, Decision, DictamenIA, Informe, ResultadoIA, Sinastria } from "../types.js";

const raiz = $("#informe");
const id = Number(raiz.dataset.id);
let datos: Informe;
let pestana: "lider" | "empresa" = "lider";
let dicta: "postulante" | "lider" | "empresa" = "postulante";

const ESTADO_TXT = { cumple: "Cumple", parcial: "Parcial", brecha: "Brecha" };

const EXPLICACION = {
  match: "Las cartas y el perfil cubren 80% o más: el oráculo lo corona y pasa directo a entrevista con el líder.",
  decision: "El match está entre 60% y 79%. El líder decide si avanza.",
  descartado: "El match está por debajo del 60%. Se descarta para esta vacante.",
};

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

function escala(p: number): string {
  return `<div class="escala" aria-hidden="true">
      <div class="escala-tramos"><span class="t-desc"></span><span class="t-dec"></span><span class="t-match"></span></div>
      <i class="escala-marca" style="left:${Math.min(100, p)}%"></i>
      <div class="escala-num"><span>0</span><span style="left:60%">60</span><span style="left:80%">80</span><span style="left:100%">100</span></div>
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

function kpiSinastria(titulo: string, sin: Sinastria | null, faltante: string): string {
  if (!sin) return `<div class="kpi kpi-sinastria apagado"><strong>—</strong><span>${titulo}</span><p class="meta">${faltante}</p></div>`;
  return `<div class="kpi kpi-sinastria">
      <strong style="color:${colorPuntaje(sin.puntaje)}">${sin.puntaje.toFixed(0)}%</strong>
      <span>${titulo}</span>
      <p class="meta">${sin.armonicos} aspectos armónicos · ${sin.tensos} tensos · afinidad elemental ${sin.elemental.toFixed(0)}%</p>
    </div>`;
}

function detalleSinastria(sin: Sinastria | null, otra: Carta | null, nombreOtra: string): string {
  const c = datos.candidato;
  if (!sin || !otra) {
    return `<p class="nota">No hay carta de ${esc(nombreOtra)} para comparar.</p>`;
  }
  const aspectos = sin.aspectos
    .map(
      (a) => `<li class="aspecto ${a.armonico ? "armonico" : "tenso"}">
        <span class="aspecto-glifos">${a.glifo_a}<b>${a.glifo}</b>${a.glifo_b}</span>
        <div><strong>${esc(a.astro_a)} en ${esc(a.signo_a)} ${esc(a.aspecto.toLowerCase())} ${esc(a.astro_b)} en ${esc(a.signo_b)}</strong>
          <p>${esc(a.lectura)}</p></div>
        <span class="meta">orbe ${a.orbe}°</span>
      </li>`,
    )
    .join("");
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
  if (sin.lider) series.push({ nombre: `Con ${primerNombre(l.nombre)}`, valores: claves.map((k) => sin.lider!.por_astro[k] ?? 50), color: "var(--gold)" });
  if (sin.empresa) series.push({ nombre: `Con ${e?.nombre ?? "la empresa"}`, valores: claves.map((k) => sin.empresa!.por_astro[k] ?? 50), color: "var(--aire)" });
  const radarSin = series.length
    ? radar(claves.map((k) => TEMA_CORTO[k]), series, { tam: 340, titulo: "Armonía de cada astro del postulante" })
    : `<p class="nota">Faltan las cartas del líder y de la empresa para medir la sinastría.</p>`;

  return `<section class="tarjeta sinastria">
      <header class="tarjeta-cab"><div><p class="eyebrow">El corazón del match</p><h2>Sinastría</h2></div></header>
      <div class="sinastria-cab">
        <div class="sinastria-kpis">
          ${kpiSinastria(`Con ${esc(l.nombre)} (líder)`, sin.lider, "El líder no tiene datos natales.")}
          ${kpiSinastria(`Con ${esc(e?.nombre ?? "la empresa")}`, sin.empresa, "Falta la carta de la empresa.")}
          ${c.resultado.elemento?.afin ? `<div class="kpi kpi-sinastria"><strong style="color:${COLOR_ELEMENTO[c.resultado.elemento.afin]}">${(c.resultado.elemento.puntaje ?? 0).toFixed(0)}%</strong>
            <span>Presencia de ${esc(c.resultado.elemento.afin)}, elemento del cargo</span></div>` : ""}
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

function itemConflicto(a: AspectoConflicto, clase: string): string {
  return `<li class="aspecto ${clase}">
      <span class="aspecto-glifos">${a.glifo_a}<b>${a.glifo}</b>${a.glifo_b}</span>
      <div><strong>${esc(a.astro_a)} ${esc(a.aspecto.toLowerCase())} ${esc(a.astro_b)}</strong><p>${esc(a.lectura)}</p></div>
    </li>`;
}

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

// --- Dictamen del oráculo IA ----------------------------------------------------

function seccionDictamen(): string {
  const ia = datos.candidato.resultado.ia;
  const estado = datos.ia;
  const boton = (txt: string) =>
    estado.activa ? `<button class="btn btn-sec btn-sm no-print" id="btn-oraculo">✦ ${txt}</button>` : "";

  if (!dictamenOk(ia)) {
    const mensaje = ia && "error" in ia
      ? `<p class="ia-error">${esc(ia.error)}</p>`
      : estado.activa
        ? `<p class="meta">Este postulante se evaluó antes de activar el oráculo IA.</p>`
        : `<p class="meta">El oráculo IA está apagado. Agrega <code>GROQ_API_KEY</code> al archivo <code>.env</code> para activarlo.</p>`;
    return `<section class="tarjeta dictamen">
        <div class="dictamen-cab"><h2>Dictamen del oráculo</h2>${boton("Consultar al oráculo")}</div>
        ${mensaje}
      </section>`;
  }
  const lecturaLider = ia.lectura_sinastria_lider || ia.lectura_astral || "";
  const desactualizado = (!ia.lectura_sinastria_lider || ia.manejo_conflictos === undefined) && estado.activa
    ? `<p class="nota">Este dictamen es anterior a las últimas mejoras: reconsulta al oráculo para que lea la sinastría y el manejo de conflictos.</p>`
    : "";

  return `<section class="tarjeta dictamen">
      <div class="dictamen-cab">
        <div><p class="eyebrow">Agente de IA · ${esc(ia.modelo)}</p><h2>Dictamen del oráculo</h2></div>
        ${boton("Reconsultar al oráculo")}
      </div>
      ${desactualizado}
      <p class="dictamen-resumen">${esc(ia.resumen)}</p>
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
          <h3 class="subtitulo">Lo que el oráculo ve</h3>
          ${lista(ia.fortalezas, "—")}
        </div>
        <div>
          <h3 class="subtitulo">Riesgos a validar</h3>
          ${lista(ia.riesgos, "Sin riesgos relevantes")}
          <h3 class="subtitulo">Preguntas para la entrevista</h3>
          ${lista(ia.preguntas_entrevista, "—")}
        </div>
      </div>
      ${ia.recomendacion ? `<p class="parrafo"><strong>Recomendación del oráculo:</strong> ${esc(ia.recomendacion)}</p>` : ""}
    </section>`;
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
        { nombre: c.nombre, valores: r.habilidades.map((h) => h.cv), color: "var(--violet)" },
      ], { tam: 380, titulo: `Habilidades de ${c.nombre} según su hoja de vida` })
    : "";

  raiz.innerHTML = `
    ${nuevo ? `<div class="aviso">✦ Postulación registrada. El oráculo ha pronunciado su informe.</div>` : ""}
    <a class="migas no-print" href="/vacantes/${v.id}">← ${esc(v.cargo)}</a>
    <header class="pagina-cab">
      <div>
        <p class="eyebrow">Informe de match astral · ${fecha(c.creado)}</p>
        <h1>${esc(c.nombre)}</h1>
        <p class="lead">${esc(v.cargo)} · ${esc(v.area)} · Líder: ${esc(l.nombre)}${e ? ` · ${esc(e.nombre)}` : ""}</p>
        <p class="meta">${esc(c.email)}${c.telefono ? ` · ${esc(c.telefono)}` : ""}</p>
      </div>
      <div class="acciones-wrap no-print">
        <a class="btn btn-sec" href="/api/candidatos/${c.id}/cv">✒ Hoja de vida</a>
        ${l.cv_archivo ? `<a class="btn btn-sec" href="/api/lideres/${l.id}/cv">✒ Hoja de vida del líder</a>` : ""}
        <button class="btn btn-sec" id="btn-imprimir">Imprimir / PDF</button>
      </div>
    </header>

    <section class="tarjeta veredicto veredicto-${r.veredicto}">
      <div class="corona">${laurel(230)}${anillo(r.puntaje, 150, 10)}</div>
      <div class="veredicto-texto">
        <p class="eyebrow">Veredicto del oráculo</p>
        <h2>${badgeVeredicto(r.veredicto)} ${badgeDecision(c.decision_lider)}</h2>
        <p>${EXPLICACION[r.veredicto]}</p>
        ${escala(r.puntaje)}
      </div>
      <div class="componentes">
        ${COMPONENTES.map((k) => componente(k.nombre, r.componentes[k.clave] ?? null, r.pesos[k.clave] ?? 0, totalPesos)).join("")}
      </div>
    </section>

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
          <div><h3 class="subtitulo">Fortalezas</h3>${r.fortalezas.length ? `<ul class="chips">${r.fortalezas.map((f) => `<li class="chip chip-ok">${esc(f)}</li>`).join("")}</ul>` : `<p class="meta">—</p>`}</div>
          <div><h3 class="subtitulo">Brechas</h3>${r.brechas.length ? `<ul class="chips">${r.brechas.map((f) => `<li class="chip chip-mal">${esc(f)}</li>`).join("")}</ul>` : `<p class="meta">Sin brechas críticas</p>`}</div>
        </div>
        <div class="decision no-print" id="decision">
          <h3 class="subtitulo">Decisión del líder</h3>
          <textarea id="nota" rows="2" placeholder="Nota para el equipo de selección (opcional)">${esc(c.nota_lider ?? "")}</textarea>
          <div class="acciones-wrap">
            <button class="btn btn-ok btn-sm" data-decision="aprobado">✓ Aprobar</button>
            <button class="btn btn-peligro btn-sm" data-decision="rechazado">✕ Rechazar</button>
            ${c.decision_lider ? `<button class="btn btn-sec btn-sm" data-decision="">Quitar decisión</button>` : ""}
            <button class="btn btn-fantasma btn-sm" id="btn-borrar">Eliminar postulación</button>
          </div>
        </div>
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
              <td><strong>${esc(h.nombre)}</strong></td>
              <td class="num">${h.peso}</td>
              <td class="num">${h.requerido.toFixed(0)}</td>
              <td class="num celda-calor" style="--v:${h.cv_claves / 100}">${h.cv_claves.toFixed(0)}</td>
              <td class="num celda-calor" style="--v:${(h.cv_ia ?? 0) / 100}">${h.cv_ia != null ? h.cv_ia.toFixed(0) : "—"}</td>
              <td class="num"><strong>${h.cv.toFixed(0)}</strong></td>
              <td><div class="cobertura">${barra(h.cobertura)}<span class="num">${h.cobertura.toFixed(0)}%</span></div></td>
              <td><span class="estado-hab estado-${h.estado}">${ESTADO_TXT[h.estado]}</span></td>
              <td class="claves">${h.claves_encontradas.length ? h.claves_encontradas.map((k) => `<span class="chip">${esc(k)}</span>`).join("") : `<span class="meta">Sin palabras clave</span>`}
                ${h.evidencia_ia ? `<p class="evidencia-ia">${esc(h.evidencia_ia)}</p>` : ""}</td>
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

async function decidir(decision: Decision): Promise<void> {
  const nota = ($("#nota") as HTMLTextAreaElement).value;
  await api.patch(`/api/candidatos/${id}/decision`, { decision, nota });
  datos.candidato.decision_lider = decision;
  datos.candidato.nota_lider = nota || null;
  toast(decision === "aprobado" ? "Postulante aprobado" : decision === "rechazado" ? "Postulante rechazado" : "Decisión retirada");
  pintar();
}

async function reconsultar(btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true;
  btn.textContent = "El oráculo está leyendo…";
  try {
    await api.post(`/api/candidatos/${id}/oraculo`, {});
    toast("El oráculo pronunció un nuevo dictamen");
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "No se pudo consultar al oráculo.", "error");
  }
  await cargar();
}

raiz.addEventListener("click", async (e) => {
  const t = e.target as HTMLElement;
  const d = t.closest<HTMLElement>("[data-decision]");
  if (d) await decidir((d.dataset.decision || null) as Decision);
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
  const oraculo = t.closest<HTMLButtonElement>("#btn-oraculo");
  if (oraculo) await reconsultar(oraculo);
  if (t.closest("#btn-borrar") && confirmar("¿Eliminar esta postulación y su hoja de vida?")) {
    await api.del(`/api/candidatos/${id}`);
    location.href = `/vacantes/${datos.vacante.id}`;
  }
});

cargar().catch(() => {
  raiz.innerHTML = vacio("∅", "Informe no encontrado", "Puede que la postulación haya sido eliminada.", `<a class="btn" href="/vacantes">Volver</a>`);
});
