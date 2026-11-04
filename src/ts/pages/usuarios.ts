import { api, ApiError } from "../api.js";
import { $, confirmar, esc, fecha, limpiarErrores, mostrarErrores, toast, vacio } from "../ui.js";
import type { Lider, Usuario } from "../types.js";

const dlg = $<HTMLDialogElement>("#dlg-usuario");
const form = $<HTMLFormElement>("#form-usuario");
const selRol = $<HTMLSelectElement>("#usuario-rol");
const selLider = $<HTMLSelectElement>("#usuario-lider");
const inputEmail = form.elements.namedItem("email") as HTMLInputElement;
let usuarios: Usuario[] = [];
let lideres: Lider[] = [];
let editandoId: number | null = null;

/** Lo que verá un líder: su ficha y toda la cadena que le reporta (igual que en el servidor). */
function cadenaDe(lid: number): Lider[] {
  const visto = new Set<number>();
  const pendientes = [lid];
  while (pendientes.length) {
    const l = pendientes.pop()!;
    if (visto.has(l)) continue;
    visto.add(l);
    pendientes.push(...lideres.filter((o) => o.jefe_id === l).map((o) => o.id));
  }
  return lideres.filter((l) => visto.has(l.id));
}

function explicarAlcance(): void {
  const lid = Number(selLider.value);
  const admin = selRol.value === "admin";
  // Para un líder la ficha es obligatoria (define qué ve); para un administrador, opcional: dice qué lugar ocupa
  // en la cadena de mando (por ejemplo, para dar la aprobación final como superior de la dirección).
  $("#usuario-lider-label").innerHTML = admin
    ? `Su ficha de líder <em class="opcional">(opcional: su lugar en la cadena de mando)</em>`
    : `Su ficha de líder <b class="req">*</b>`;
  $("#usuario-alcance").textContent = admin
    ? "Verá y gestionará todo: empresa, perfiles, líderes, cargos, postulantes y usuarios." +
      (lid ? " Con su ficha, AGATA sabe qué lugar ocupa en la cadena de mando." : "")
    : lid
      ? `Verá los cargos y postulantes de: ${cadenaDe(lid).map((l) => l.nombre).join(", ")}.`
      : "Elige su ficha de líder: define qué cargos verá.";
}

function fila(u: Usuario): string {
  const ficha = u.rol === "admin"
    ? u.lider_nombre
      ? `${esc(u.lider_nombre)} <span class="meta-inline">${esc(u.lider_cargo)} · ve todo</span>`
      : `<span class="meta-inline">Todo</span>`
    : u.lider_nombre
      ? `${esc(u.lider_nombre)} <span class="meta-inline">${esc(u.lider_cargo)}</span>`
      : `<span class="meta-inline">Sin ficha ligada: no ve ningún cargo</span>`;
  return `<tr>
    <td><strong>${esc(u.nombre ?? "Sin nombre aún")}</strong>${u.yo ? " <span class=\"chip\">tú</span>" : ""}
      <br><span class="meta-inline">${esc(u.email)}</span></td>
    <td>${u.rol === "admin" ? "Administrador" : "Líder"}${u.fijo ? ` <span class="chip" title="Definido en AGATA_ADMINS">fijo</span>` : ""}</td>
    <td>${ficha}</td>
    <td>${u.ultimo_ingreso ? fecha(u.ultimo_ingreso) : `<span class="meta-inline">Aún no entra</span>`}</td>
    <td class="lista-acciones">
      <button class="btn btn-sec btn-sm" data-editar="${u.id}">Editar</button>
      ${u.yo ? "" : `<button class="btn btn-peligro btn-sm" data-borrar="${u.id}" data-fijo="${u.fijo ? 1 : ""}" aria-label="Quitar el acceso a ${esc(u.email)}">Quitar acceso</button>`}
    </td>
  </tr>`;
}

async function cargar(): Promise<void> {
  [usuarios, lideres] = await Promise.all([api.get<Usuario[]>("/api/usuarios"), api.get<Lider[]>("/api/lideres")]);
  $("#lista-usuarios").innerHTML = usuarios.length
    ? `<div class="tabla-scroll"><table class="tabla">
        <thead><tr><th>Persona</th><th>Rol</th><th>Ficha de líder</th><th>Último ingreso</th><th></th></tr></thead>
        <tbody>${usuarios.map(fila).join("")}</tbody></table></div>`
    : vacio("⚷", "Aún no hay usuarios", "Los correos de AGATA_ADMINS aparecen aquí al entrar por primera vez.");
}

function abrir(u?: Usuario): void {
  form.reset();
  limpiarErrores(form);
  editandoId = u?.id ?? null;
  $("#dlg-usuario-titulo").textContent = u ? `Editar el acceso de ${u.nombre ?? u.email}` : "Dar acceso";
  selLider.innerHTML = `<option value="">Elige su ficha…</option>` + lideres
    .map((l) => `<option value="${l.id}">${esc(l.nombre)} · ${esc(l.cargo)}</option>`).join("");
  inputEmail.value = u?.email ?? "";
  (form.elements.namedItem("nombre") as HTMLInputElement).value = u?.nombre ?? "";
  selRol.value = u?.rol ?? "lider";
  selLider.value = u?.lider_id ? String(u.lider_id) : "";
  explicarAlcance();
  dlg.showModal();
}

selRol.addEventListener("change", explicarAlcance);
selLider.addEventListener("change", explicarAlcance);
// Si el correo es el de una ficha de líder, se liga sola.
inputEmail.addEventListener("change", () => {
  const ficha = lideres.find((l) => l.email && l.email.toLowerCase() === inputEmail.value.trim().toLowerCase());
  if (ficha && !selLider.value) {
    selLider.value = String(ficha.id);
    explicarAlcance();
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiarErrores(form);
  const datos = Object.fromEntries(new FormData(form));
  try {
    if (editandoId) await api.put(`/api/usuarios/${editandoId}`, datos);
    else await api.post("/api/usuarios", datos);
    dlg.close();
    toast(editandoId ? "Acceso actualizado" : "Acceso concedido: ya puede entrar con su cuenta Google");
    await cargar();
  } catch (err) {
    mostrarErrores(form, err);
  }
});

document.addEventListener("click", async (e) => {
  const t = e.target as HTMLElement;
  t.closest("[data-cerrar]")?.closest("dialog")?.close();
  const editar = t.closest<HTMLElement>("[data-editar]");
  if (editar) abrir(usuarios.find((u) => u.id === Number(editar.dataset.editar)));
  const borrar = t.closest<HTMLElement>("[data-borrar]");
  if (borrar && confirmar("¿Quitarle el acceso a AGATA? Su sesión se cierra en su próxima acción." + (borrar.dataset.fijo
    ? "\n\nEstá en AGATA_ADMINS, pero aun así dejará de entrar. Para devolverle el acceso, usa «Dar acceso»." : ""))) {
    try {
      await api.del(`/api/usuarios/${borrar.dataset.borrar}`);
      toast("Acceso retirado");
      await cargar();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No se pudo quitar el acceso.", "error");
    }
  }
});

$("#btn-nuevo-usuario").addEventListener("click", () => abrir());
cargar().catch(() => toast("No se pudieron cargar los usuarios.", "error"));
