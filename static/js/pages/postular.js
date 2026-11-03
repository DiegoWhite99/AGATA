import { api, ApiError } from "../api.js";
import { fichaConflicto, iniciarNatal, leerNatal, panelAtributos, ruedaZodiacal } from "../astro-ui.js";
import { $, $$, esc, iniciarDropzone, limpiarErrores, mostrarErrores, vacio } from "../ui.js";
const raiz = $("#postular");
const id = Number(raiz.dataset.id);
const form = $("#form-post");
const pasos = $$(".paso", form);
const inputCv = form.querySelector("[name=cv]");
const EXT = [".pdf", ".docx", ".txt"];
const PASO_CARTA = 2;
let paso = 0;
let carta = null;
let firmaCarta = "";
function error(campo, msg) {
    const slot = form.querySelector(`[data-error="${campo}"]`);
    if (slot) {
        slot.textContent = msg;
        slot.hidden = false;
    }
    return false;
}
const valor = (n) => form.elements.namedItem(n)?.value.trim() ?? "";
function validarPaso(n) {
    limpiarErrores(pasos[n]);
    let ok = true;
    if (n === 0) {
        if (!valor("nombre"))
            ok = error("nombre", "Escribe tu nombre completo.");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor("email")))
            ok = error("email", "Escribe un correo válido.");
    }
    if (n === 1) {
        const natal = leerNatal(form);
        if (!natal.fecha_nac)
            ok = error("fecha_nac", "La fecha de nacimiento es obligatoria.");
        if (!natal.ciudad || natal.lat === "" || natal.lon === "" || natal.utc === "")
            ok = error("ciudad", "Selecciona tu ciudad de nacimiento o ingresa sus coordenadas.");
    }
    if (n === PASO_CARTA && !carta)
        ok = false;
    if (n === 3) {
        const f = inputCv.files?.[0];
        if (!f)
            ok = error("cv", "Sube tu hoja de vida.");
        else if (!EXT.some((e) => f.name.toLowerCase().endsWith(e)))
            ok = error("cv", "Formato no válido: usa PDF, DOCX o TXT.");
        else if (f.size > 5 * 1024 * 1024)
            ok = error("cv", "El archivo supera los 5 MB.");
    }
    return ok;
}
/** Traza la carta con los datos natales actuales (solo si cambiaron). */
async function trazarCarta() {
    const natal = leerNatal(form);
    const firma = JSON.stringify(natal);
    if (carta && firma === firmaCarta)
        return;
    const caja = $("#tu-carta");
    caja.innerHTML = `<p class="cargando">Trazando tu carta…</p>`;
    try {
        carta = await api.post("/api/carta", natal);
    }
    catch (err) {
        carta = null;
        caja.innerHTML = `<p class="ia-error">${esc(err instanceof ApiError ? err.message : "No se pudo trazar la carta.")}</p>`;
        return;
    }
    firmaCarta = firma;
    caja.innerHTML = `
    <div class="carta-cabecera">
      <div class="carta-rueda">${ruedaZodiacal(carta, 260)}</div>
      <div>
        <p class="parrafo"><strong>${esc(carta.resumen)}</strong></p>
        <p class="parrafo">${esc(carta.perfil_laboral)}</p>
      </div>
    </div>
    ${panelAtributos(carta)}
    <h3 class="subtitulo">Tu forma de manejar los conflictos</h3>
    ${fichaConflicto("Según tu carta", valor("nombre") || "Tú", carta.conflicto)}`;
}
async function irA(n, desplazar = true) {
    paso = n;
    pasos.forEach((p, i) => (p.hidden = i !== n));
    $$("#pasos li").forEach((li, i) => {
        li.classList.toggle("activo", i === n);
        li.classList.toggle("hecho", i < n);
        if (i === n)
            li.setAttribute("aria-current", "step");
        else
            li.removeAttribute("aria-current");
    });
    $("#btn-atras").hidden = n === 0;
    $("#btn-siguiente").hidden = n === pasos.length - 1;
    $("#btn-enviar").hidden = n !== pasos.length - 1;
    $("#wizard-progreso").textContent = `Paso ${n + 1} de ${pasos.length}`;
    if (n === PASO_CARTA)
        await trazarCarta();
    if (n === pasos.length - 1)
        pintarResumen();
    if (!desplazar)
        return;
    pasos[n].querySelector("input:not([type=hidden]):not([hidden]), select")?.focus({ preventScroll: true });
    $("#pasos").scrollIntoView({ behavior: "smooth", block: "start" });
}
function pintarResumen() {
    const natal = leerNatal(form);
    $("#resumen").innerHTML = `<dl class="resumen">
      <dt>Postulante</dt><dd>${esc(valor("nombre"))} · ${esc(valor("email"))}</dd>
      <dt>Nacimiento</dt><dd>${esc(natal.fecha_nac)} ${esc(natal.hora_nac || "(sin hora)")} · ${esc(natal.ciudad)}</dd>
      <dt>Carta</dt><dd>${esc(carta?.resumen ?? "—")}</dd>
      <dt>Ante el conflicto</dt><dd>${carta?.conflicto ? `Tiende a ${carta.conflicto.dominante.toLowerCase()}` : "—"}</dd>
      <dt>Hoja de vida</dt><dd>${esc(inputCv.files?.[0]?.name ?? "—")}</dd>
    </dl>
    <p class="ayuda">Al enviar, el oráculo cruza tu carta con la del líder y la de la empresa, lee tu hoja de vida
      y pronuncia el informe de match.</p>`;
}
// --- Eventos ------------------------------------------------------------------
$("#btn-siguiente").addEventListener("click", () => {
    if (validarPaso(paso))
        irA(paso + 1);
});
$("#btn-atras").addEventListener("click", () => irA(paso - 1));
$$("#pasos li").forEach((li, i) => li.addEventListener("click", () => {
    if (i < paso)
        irA(i);
}));
iniciarDropzone($("#dropzone"), inputCv);
form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT" && paso < pasos.length - 1) {
        e.preventDefault();
        $("#btn-siguiente").click();
    }
});
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    for (let i = 0; i < pasos.length - 1; i++) {
        if (!validarPaso(i))
            return irA(i);
    }
    const fd = new FormData();
    fd.append("nombre", valor("nombre"));
    fd.append("email", valor("email"));
    fd.append("telefono", valor("telefono"));
    for (const [k, v] of Object.entries(leerNatal(form)))
        fd.append(k, v);
    fd.append("cv", inputCv.files[0]);
    const overlay = $("#calculando");
    overlay.hidden = false;
    try {
        const [r] = await Promise.all([
            api.post(`/api/vacantes/${id}/postulaciones`, fd),
            new Promise((ok) => setTimeout(ok, 1400)), // deja ver la animación
        ]);
        location.href = `/candidatos/${r.id}?nuevo=1`;
    }
    catch (err) {
        overlay.hidden = true;
        mostrarErrores(form, err);
        if (err instanceof ApiError) {
            const primero = Object.keys(err.campos)[0];
            const destino = primero && form.querySelector(`[data-error="${primero}"]`)?.closest(".paso");
            if (destino) {
                await irA(pasos.indexOf(destino));
                mostrarErrores(form, err);
            }
        }
    }
});
// --- Inicio -------------------------------------------------------------------
Promise.all([api.get(`/api/vacantes/${id}/publica`), iniciarNatal(form)])
    .then(([v]) => {
    document.title = `Postulación: ${v.cargo} · AGATA`;
    $("#post-cargo").textContent = v.cargo;
    $("#post-sub").textContent = `${v.empresa ? `${v.empresa} · ` : ""}${v.area} · Líder: ${v.lider_nombre} (${v.lider_cargo})`;
    $("#post-desc p").textContent = v.descripcion;
    const req = v.requisitos;
    if (req) {
        const caja = $("#post-requisitos");
        caja.hidden = false;
        caja.innerHTML = [["Formación académica", req.formacion], ["Experiencia", req.experiencia], ["Conocimientos deseables", req.conocimientos]]
            .filter(([, valor]) => valor)
            .map(([etiqueta, valor]) => `<div><dt>${etiqueta}</dt><dd>${esc(valor)}</dd></div>`)
            .join("");
    }
    if (v.estado !== "abierta") {
        form.outerHTML = vacio("✕", "Vacante cerrada", "Esta vacante ya no recibe postulaciones.", `<a class="btn" href="/vacantes">Ver cargos</a>`);
        $("#pasos").remove();
        return;
    }
    irA(0, false);
})
    .catch(() => {
    raiz.innerHTML = vacio("∅", "Vacante no encontrada", "Revisa el link de postulación.", `<a class="btn" href="/vacantes">Ver cargos</a>`);
});
