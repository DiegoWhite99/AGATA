import { api } from "./api.js";

// Navegación animada: hilo dorado que sigue al cursor, chispas al pasar y barra que se compacta al bajar.
// El trabajo del día (Panel, Vacantes, Líderes, Red) va a la vista; la configuración (Empresa, Perfiles,
// Usuarios) en un menú desplegable, y la sesión en el círculo con las iniciales. En celular, todo cabe en
// el botón ☰.
const topbar = document.querySelector<HTMLElement>(".topbar");
const nav = document.querySelector<HTMLElement>(".nav");
const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const celular = window.matchMedia("(max-width: 900px)");

/** Un botón que abre y cierra el panel que controla (aria-controls). */
interface Desplegable {
  boton: HTMLButtonElement;
  abrir(si: boolean): void;
}

const desplegables: Desplegable[] = [];

function desplegable(boton: HTMLButtonElement | null, alAbrir?: (si: boolean) => void): Desplegable | null {
  if (!boton) return null;
  const d: Desplegable = {
    boton,
    abrir(si: boolean) {
      boton.setAttribute("aria-expanded", String(si));
      alAbrir?.(si);
    },
  };
  boton.addEventListener("click", () => {
    const abrir = boton.getAttribute("aria-expanded") !== "true";
    // En pantalla ancha solo uno abierto a la vez; en celular el menú ☰ contiene a los demás.
    for (const otro of desplegables) if (otro !== d && !(celular.matches && otro.boton.id === "nav-boton")) otro.abrir(false);
    d.abrir(abrir);
  });
  desplegables.push(d);
  return d;
}

const menu = desplegable(document.querySelector("#nav-boton"), (si) => {
  topbar?.classList.toggle("abierta", si);
  // Al abrir el menú en celular, la configuración se ve desplegada si estás en una de sus páginas.
  if (si && document.querySelector(".nav-grupo.activo")) config?.abrir(true);
});
const config = desplegable(document.querySelector(".nav-grupo-boton"));
desplegable(document.querySelector("#sesion-boton"));

const cerrarTodo = () => desplegables.forEach((d) => d.abrir(false));

// Un clic fuera cierra lo que esté abierto; Escape también, y devuelve el foco al botón.
document.addEventListener("click", (e) => {
  if (!(e.target as Element).closest(".topbar")) cerrarTodo();
  else if (!celular.matches && !(e.target as Element).closest(".nav-grupo, .sesion")) {
    desplegables.filter((d) => d !== menu).forEach((d) => d.abrir(false));
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const abierto = [...desplegables].reverse().find((d) => d.boton.getAttribute("aria-expanded") === "true");
  if (abierto) {
    abierto.abrir(false);
    abierto.boton.focus();
  }
});
celular.addEventListener("change", cerrarTodo);

if (nav && topbar) {
  // Los elementos de primer nivel: los enlaces y el botón de Configuración (no los del submenú).
  const principales = Array.from(nav.querySelectorAll<HTMLElement>(":scope > a, :scope > .nav-grupo > .nav-grupo-boton"));
  const activo = nav.querySelector<HTMLElement>(':scope > a[aria-current="page"]')
    ?? nav.querySelector<HTMLElement>(".nav-grupo.activo > .nav-grupo-boton");
  const hilo = document.createElement("span");
  hilo.className = "nav-hilo sin-transicion";
  hilo.setAttribute("aria-hidden", "true");
  nav.append(hilo);

  const mover = (a: HTMLElement | null) => {
    // En celular los enlaces van en columna: ahí la página activa se marca con su propio brillo, sin hilo.
    if (!a || celular.matches) {
      hilo.style.opacity = "0";
      return;
    }
    const caja = a.getBoundingClientRect();
    hilo.style.opacity = "1";
    hilo.style.width = `${caja.width}px`;
    hilo.style.transform = `translateX(${caja.left - nav.getBoundingClientRect().left}px)`;
  };

  const chispas = (a: HTMLElement) => {
    if (sinMovimiento) return;
    for (let i = 0; i < 4; i++) {
      const c = document.createElement("span");
      c.className = "chispa";
      c.textContent = "✦";
      c.style.left = `${15 + Math.random() * 70}%`;
      c.style.setProperty("--dx", `${(Math.random() - 0.5) * 30}px`);
      c.style.animationDelay = `${i * 70}ms`;
      a.append(c);
      setTimeout(() => c.remove(), 1100 + i * 70);
    }
  };

  for (const a of principales) {
    a.addEventListener("mouseenter", () => {
      mover(a);
      if (!celular.matches) chispas(a);
    });
    a.addEventListener("focus", () => mover(a));
  }
  nav.addEventListener("mouseleave", () => mover(activo));
  nav.addEventListener("focusout", () => mover(activo));

  // Ubica el hilo cuando las fuentes ya cargaron (cambian el ancho de los enlaces).
  const ubicar = () => {
    mover(activo);
    requestAnimationFrame(() => hilo.classList.remove("sin-transicion"));
  };
  document.fonts?.ready.then(ubicar);
  setTimeout(ubicar, 900);
  window.addEventListener("resize", () => mover(activo));

  const compactar = () => topbar.classList.toggle("compacta", window.scrollY > 12);
  window.addEventListener("scroll", compactar, { passive: true });
  compactar();
}

// Cerrar sesión: el servidor invalida la cookie y se vuelve al inicio de sesión.
document.querySelector("#btn-salir")?.addEventListener("click", async () => {
  await api.del("/api/sesion").catch(() => undefined);
  location.href = "/login";
});
