// Inicio de sesión: Google (vía Firebase) en una ventana emergente. El servidor valida el token, revisa que
// el correo esté autorizado y deja la cookie de sesión; el navegador no guarda la sesión de Firebase.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  GoogleAuthProvider, getAuth, inMemoryPersistence, setPersistence, signInWithPopup, signOut,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { api, ApiError } from "../api.js";
import { $ } from "../ui.js";

const raiz = $("#login");
const boton = $<HTMLButtonElement>("#btn-google");
const error = $("#login-error");
const d = raiz.dataset;
const auth = getAuth(initializeApp({ apiKey: d.apiKey!, authDomain: d.authDomain!, projectId: d.projectId! }));
const listo = setPersistence(auth, inMemoryPersistence);

const MENSAJES: Record<string, string> = {
  "auth/popup-closed-by-user": "Cerraste la ventana de Google antes de terminar.",
  "auth/cancelled-popup-request": "Cerraste la ventana de Google antes de terminar.",
  "auth/popup-blocked": "El navegador bloqueó la ventana de Google: permite las ventanas emergentes de este sitio.",
  "auth/unauthorized-domain":
    "Este dominio no está autorizado en Firebase (Authentication → Configuración → Dominios autorizados).",
  "auth/network-request-failed": "No hay conexión con Google. Revisa tu red.",
};

boton.addEventListener("click", async () => {
  error.hidden = true;
  boton.disabled = true;
  try {
    await listo;
    const { user } = await signInWithPopup(auth, new GoogleAuthProvider().setCustomParameters({ prompt: "select_account" }));
    await api.post("/api/sesion", { id_token: await user.getIdToken() });
    await signOut(auth);
    location.href = d.siguiente || "/";
  } catch (err) {
    await signOut(auth).catch(() => undefined);
    const codigo = (err as { code?: string }).code ?? "";
    error.textContent = err instanceof ApiError ? err.message : MENSAJES[codigo] ?? "No se pudo iniciar sesión. Inténtalo de nuevo.";
    error.hidden = false;
    boton.disabled = false;
  }
});
