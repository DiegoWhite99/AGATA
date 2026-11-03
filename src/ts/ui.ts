import { ApiError } from "./api.js";
import type { Decision } from "./types.js";

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;

export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll(sel)) as T[];

export function esc(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i] ?? "") : ""), "");
}

export function badgeDecision(d: Decision): string {
  if (!d) return `<span class="badge badge-pendiente">Por decidir</span>`;
  return d === "aprobado"
    ? `<span class="badge badge-aprobado">✔ Aprobado por líder</span>`
    : `<span class="badge badge-rechazado">✖ Rechazado por líder</span>`;
}

export function colorPuntaje(p: number): string {
  return p >= 80 ? "var(--match)" : p >= 60 ? "var(--decision)" : "var(--descartado)";
}

/** Anillo de progreso SVG con el puntaje en el centro. */
export function anillo(puntaje: number, tam = 140, grosor = 12, color = colorPuntaje(puntaje)): string {
  const r = (tam - grosor) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, puntaje)) / 100);
  return `
    <svg class="anillo" viewBox="0 0 ${tam} ${tam}" width="${tam}" height="${tam}" role="img"
         aria-label="Puntaje ${puntaje.toFixed(1)} por ciento">
      <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${grosor}"/>
      <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${color}"
              stroke-width="${grosor}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
              transform="rotate(-90 ${tam / 2} ${tam / 2})"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" class="anillo-num">
        ${puntaje.toFixed(0)}<tspan class="anillo-pct">%</tspan>
      </text>
    </svg>`;
}

/** Corona de laurel en SVG (usa currentColor) para rodear el puntaje. */
export function laurel(tam = 230): string {
  const c = tam / 2;
  const r = tam / 2 - 18;
  let trazos = "";
  for (const lado of [-1, 1]) {
    const tallo: string[] = [];
    for (let t = 0.22; t <= 2.78; t += 0.04) tallo.push(`${c + lado * r * Math.sin(t)},${c + r * Math.cos(t)}`);
    trazos += `<polyline points="${tallo.join(" ")}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`;
    for (let i = 0; i < 11; i++) {
      const t = 0.38 + i * 0.22;
      const x = c + lado * r * Math.sin(t);
      const y = c + r * Math.cos(t);
      // Dirección del tallo (hacia arriba) y una hoja a cada lado.
      const tangente = (Math.atan2(-Math.sin(t), lado * Math.cos(t)) * 180) / Math.PI;
      for (const k of [-1, 1]) {
        const ang = tangente + k * 36;
        const rad = (ang * Math.PI) / 180;
        const largo = 10 - i * 0.35;
        const hx = x + Math.cos(rad) * largo;
        const hy = y + Math.sin(rad) * largo;
        trazos += `<ellipse cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" rx="${largo.toFixed(1)}" ry="${(largo * 0.38).toFixed(1)}"
          transform="rotate(${ang.toFixed(1)} ${hx.toFixed(1)} ${hy.toFixed(1)})" fill="currentColor" opacity="${k === 1 ? 0.95 : 0.7}"/>`;
      }
    }
  }
  const lazo = `<path d="M${c - 14},${c + r + 2} Q${c},${c + r - 10} ${c + 14},${c + r + 2} M${c},${c + r - 3} l-9,16 M${c},${c + r - 3} l9,16"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
  return `<svg class="laurel" viewBox="0 0 ${tam} ${tam}" width="${tam}" height="${tam}" aria-hidden="true">${trazos}${lazo}</svg>`;
}

/**
 * Zona para arrastrar o elegir una hoja de vida. `alCambiar` recibe el archivo elegido.
 * La zona debe ser un <label class="dropzone"> que contenga el <input type="file">.
 */
export function iniciarDropzone(zona: HTMLElement, input: HTMLInputElement, alCambiar?: (f: File | null) => void): () => void {
  const nombre = zona.querySelector<HTMLElement>(".dropzone-archivo");
  const mostrar = () => {
    const f = input.files?.[0] ?? null;
    if (nombre) nombre.textContent = f ? `✔ ${f.name} (${(f.size / 1024).toFixed(0)} KB)` : "";
    zona.classList.toggle("con-archivo", !!f);
    alCambiar?.(f);
  };
  input.addEventListener("change", mostrar);
  ["dragenter", "dragover"].forEach((ev) =>
    zona.addEventListener(ev, (e) => {
      e.preventDefault();
      zona.classList.add("arrastrando");
    }),
  );
  ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, () => zona.classList.remove("arrastrando")));
  zona.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = (e as DragEvent).dataTransfer?.files?.[0];
    if (!f) return;
    const dt = new DataTransfer();
    dt.items.add(f);
    input.files = dt.files;
    mostrar();
  });
  return mostrar;
}

export function barra(valor: number, color = colorPuntaje(valor)): string {
  return `<div class="barra"><span style="width:${Math.min(100, valor)}%;background:${color}"></span></div>`;
}

export function fecha(iso: string): string {
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

export function toast(mensaje: string, tipo: "ok" | "error" = "ok"): void {
  let cont = $("#toasts");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "toasts";
    document.body.append(cont);
  }
  const t = document.createElement("div");
  t.className = `toast toast-${tipo}`;
  t.setAttribute("role", tipo === "error" ? "alert" : "status");
  t.textContent = mensaje;
  cont.append(t);
  setTimeout(() => t.classList.add("salir"), 3800);
  setTimeout(() => t.remove(), 4300);
}

/** Pinta los errores de validación del backend junto a cada campo. */
export function mostrarErrores(form: HTMLElement, err: unknown): void {
  limpiarErrores(form);
  if (!(err instanceof ApiError)) {
    toast("No se pudo conectar con el servidor.", "error");
    return;
  }
  let primero: HTMLElement | null = null;
  for (const [campo, msg] of Object.entries(err.campos)) {
    const slot = form.querySelector<HTMLElement>(`[data-error="${campo}"]`);
    if (slot) {
      slot.textContent = msg;
      slot.hidden = false;
      primero ??= slot;
    } else {
      toast(msg, "error");
    }
  }
  toast(err.message, "error");
  primero?.closest(".campo, fieldset, section")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function limpiarErrores(form: HTMLElement): void {
  $$("[data-error]", form).forEach((s) => {
    s.textContent = "";
    s.hidden = true;
  });
}

export function confirmar(mensaje: string): boolean {
  return window.confirm(mensaje);
}

export function vacio(icono: string, titulo: string, texto: string, accion = ""): string {
  return `<div class="vacio"><div class="vacio-icono">${icono}</div><h3>${esc(titulo)}</h3><p>${esc(texto)}</p>${accion}</div>`;
}
