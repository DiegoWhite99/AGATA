import { esc } from "./ui.js";
function partirEtiqueta(texto, maxCar = 14) {
    const palabras = texto.split(" ");
    const lineas = [];
    let actual = "";
    for (const p of palabras) {
        if ((actual + " " + p).trim().length > maxCar && actual) {
            lineas.push(actual);
            actual = p;
        }
        else {
            actual = (actual + " " + p).trim();
        }
    }
    if (actual)
        lineas.push(actual);
    return lineas.slice(0, 3);
}
/** Diagrama radial (araña) en SVG puro. */
export function radar(ejes, series, opts = {}) {
    const { max = 100, tam = 440, niveles = 5, titulo = "Diagrama radial" } = opts;
    const margen = 92;
    const cx = tam / 2 + margen;
    const cy = tam / 2 + 40;
    const r = tam / 2 - 20;
    const n = ejes.length;
    const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const punto = (i, v) => {
        const k = (Math.max(0, Math.min(max, v)) / max) * r;
        return [cx + k * Math.cos(ang(i)), cy + k * Math.sin(ang(i))];
    };
    let rejilla = "";
    for (let nv = 1; nv <= niveles; nv++) {
        const pts = ejes.map((_, i) => punto(i, (max * nv) / niveles).join(",")).join(" ");
        rejilla += `<polygon points="${pts}" class="radar-nivel"/>`;
        const [lx, ly] = punto(0, (max * nv) / niveles);
        rejilla += `<text x="${lx + 4}" y="${ly + 3}" class="radar-escala">${Math.round((max * nv) / niveles)}</text>`;
    }
    let radios = "";
    let etiquetas = "";
    ejes.forEach((eje, i) => {
        const [x, y] = punto(i, max);
        radios += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="radar-eje"/>`;
        const lx = cx + (r + 16) * Math.cos(ang(i));
        const ly = cy + (r + 16) * Math.sin(ang(i));
        const cos = Math.cos(ang(i));
        const ancla = Math.abs(cos) < 0.15 ? "middle" : cos > 0 ? "start" : "end";
        const lineas = partirEtiqueta(eje);
        const sin = Math.sin(ang(i));
        const dy0 = sin < -0.5 ? -(lineas.length - 1) * 14 : sin > 0.5 ? 6 : -((lineas.length - 1) * 14) / 2;
        etiquetas += `<text x="${lx}" y="${ly + dy0}" text-anchor="${ancla}" class="radar-label">${lineas
            .map((l, k) => `<tspan x="${lx}" dy="${k === 0 ? 4 : 14}">${esc(l)}</tspan>`)
            .join("")}</text>`;
    });
    const poligonos = series
        .map((s) => {
        const pts = s.valores.map((v, i) => punto(i, v).join(",")).join(" ");
        const puntos = s.valores
            .map((v, i) => {
            const [x, y] = punto(i, v);
            return `<circle cx="${x}" cy="${y}" r="4" fill="${s.color}" class="radar-punto">
                    <title>${esc(s.nombre)} · ${esc(ejes[i])}: ${v.toFixed(0)}</title></circle>`;
        })
            .join("");
        return `<polygon points="${pts}" fill="${s.color}" fill-opacity="${s.punteada ? 0.04 : 0.22}"
                stroke="${s.color}" stroke-width="2.2" ${s.punteada ? 'stroke-dasharray="6 5"' : ""}
                stroke-linejoin="round"/>${s.punteada ? "" : puntos}`;
    })
        .join("");
    const ancho = tam + margen * 2;
    const alto = tam + 80;
    const leyenda = series
        .map((s) => `<span class="leyenda-item"><i style="background:${s.color};${s.punteada ? "opacity:.6" : ""}"></i>${esc(s.nombre)}</span>`)
        .join("");
    return `
    <figure class="radar">
      <svg viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="${esc(titulo)}">
        ${rejilla}${radios}${poligonos}${etiquetas}
      </svg>
      <figcaption class="leyenda">${leyenda}</figcaption>
    </figure>`;
}
