// Tipos mínimos del SDK web de Firebase. Se carga como módulo desde su CDN (AGATA no usa bundler), así que
// la versión de estas rutas debe ser la misma que importa pages/login.ts.

declare module "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js" {
  export interface FirebaseApp {
    readonly name: string;
  }
  export function initializeApp(opciones: { apiKey: string; authDomain: string; projectId: string }): FirebaseApp;
}

declare module "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js" {
  import type { FirebaseApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";

  export interface User {
    getIdToken(forzarRenovacion?: boolean): Promise<string>;
  }
  export interface Auth {
    readonly currentUser: User | null;
  }
  export interface Persistence {
    readonly type: string;
  }
  export interface UserCredential {
    readonly user: User;
  }
  export class GoogleAuthProvider {
    setCustomParameters(parametros: Record<string, string>): GoogleAuthProvider;
  }
  export const inMemoryPersistence: Persistence;
  export function getAuth(app?: FirebaseApp): Auth;
  export function setPersistence(auth: Auth, persistencia: Persistence): Promise<void>;
  export function signInWithPopup(auth: Auth, proveedor: GoogleAuthProvider): Promise<UserCredential>;
  export function signOut(auth: Auth): Promise<void>;
}
