// Navegación animada: hilo dorado que sigue al cursor, chispas al pasar y barra que se compacta al bajar.
const topbar = document.querySelector<HTMLElement>(".topbar");
const nav = document.querySelector<HTMLElement>(".nav");
const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (nav && topbar) {
  const enlaces = Array.from(nav.querySelectorAll<HTMLAnchorElement>("a"));
  const activo = nav.querySelector<HTMLAnchorElement>('[aria-current="page"]');
  const hilo = document.createElement("span");
  hilo.className = "nav-hilo sin-transicion";
  hilo.setAttribute("aria-hidden", "true");
  nav.append(hilo);

  const mover = (a: HTMLElement | null) => {
    if (!a) {
      hilo.style.opacity = "0";
      return;
    }
    hilo.style.opacity = "1";
    hilo.style.width = `${a.offsetWidth}px`;
    hilo.style.transform = `translateX(${a.offsetLeft}px)`;
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

  for (const a of enlaces) {
    a.addEventListener("mouseenter", () => {
      mover(a);
      chispas(a);
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

export {};
