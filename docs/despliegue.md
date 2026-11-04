# Desplegar AGATA gratis: PythonAnywhere + Firebase

Esta guía monta AGATA en internet **sin pagar nada y sin tarjeta**. Es la ruta con la que se montó la demo actual;
haz los pasos en orden.

| Despliegue actual | |
|---|---|
| Dirección | <https://diegowhite99.pythonanywhere.com> |
| Servidor | PythonAnywhere, cuenta gratuita `diegowhite99`, Python 3.13 |
| Login | Firebase Authentication, proyecto `agata-bdfe0`, plan Spark |
| Código | `/home/diegowhite99/AGATA`, clonado de <https://github.com/DiegoWhite99/AGATA> |

> **Producción arranca limpia.** El servidor recibe solo el código de GitHub. `agata.db` y `uploads/` tienen los
> datos de la demo local (líderes de ejemplo y postulaciones de prueba) y no están en git, así que no se copian. Lo
> único que se sube desde tu computador son los perfiles reales de `perfiles/` (paso 6).

## Qué vas a montar

```
 Navegador ──► PythonAnywhere (https://TU_USUARIO.pythonanywhere.com)
     │            AGATA: Flask, la base SQLite y las hojas de vida en su disco
     │            └─ valida cada inicio de sesión con las llaves públicas de Google
     └──────► Firebase Authentication (plan Spark, gratis): ventana de «Entrar con Google»
```

- **PythonAnywhere** (cuenta gratuita *Beginner*) corre AGATA con su base y sus archivos en un disco que no se borra.
- **Firebase Authentication**, en el plan gratuito **Spark**, muestra la ventana de Google y confirma quién es la
  persona. **No actives Blaze:** aquí no hace falta. Firebase Hosting tampoco: el plan gratis solo sirve páginas
  estáticas, y AGATA necesita su servidor en Python.
- **Qué ve cada quien lo decide AGATA:** el **administrador** gestiona todo, el **líder** ve los cargos de su cadena de
  mando y decide sobre sus postulantes, y la postulación (`/postular/<id>`) es pública.

## Límites de la cuenta gratuita

- **512 MB de disco**, para el código, las librerías (unos 75 MB), la base y las hojas de vida. Alcanza para unas
  150 a 250 hojas de vida, según su tamaño.
- **Internet solo hacia sitios permitidos:** Groq, GitHub y Google sí pasan. Los portafolios en general no, así que
  el informe dirá que no se pudo leer el portafolio. La IA igual ve el enlace, y el líder puede abrirlo.
- **Un solo proceso:** las peticiones se atienden una a la vez. Una postulación con IA tarda entre 5 y 20 segundos, y
  mientras tanto los demás esperan. Para una demo está bien.
- **Hay que renovarlo cada mes** con un clic (paso 9). PythonAnywhere avisa por correo una semana antes.
- **La dirección es `TU_USUARIO.pythonanywhere.com`.** Un dominio propio, como `agata.cun.edu.co`, requiere plan pago.

## 1. Firebase: login con Google (plan Spark)

En <https://console.firebase.google.com>, crea el proyecto (o abre **Agata**). Google Analytics no hace falta.

1. Barra izquierda: **Seguridad** → **Authentication** → **Comenzar** → **Método de acceso** → **Google** →
   **Habilitar**. En el recuadro que aparece:
   - **Nombre público del proyecto:** `AGATA`. Es lo que verán en la ventana de Google («Continuar a AGATA»).
   - **Correo electrónico de asistencia:** elige tu correo.
   - Pulsa **Guardar**. Lo demás de esa pantalla (huella SHA-1, que es solo para Android, entidades seguras,
     configuración del SDK web y SMS) no se toca.
2. Página principal del proyecto (**Descripción general**) → **+ Agregar app** → el ícono **`</>`** (web). Apodo
   «AGATA web». **No** marques Firebase Hosting. Pulsa **Registrar app**.
3. Del bloque `firebaseConfig` que aparece, copia **`apiKey`** y **`projectId`**. No son secretos: solo identifican
   el proyecto, y la página de login de AGATA los muestra de todas formas. No hace falta instalar nada de lo que
   sugiere (`npm install firebase`), porque AGATA ya lo trae.

**No toques** **Configuración** → **Uso y facturación** (es para pasar a Blaze) ni **Cuentas de servicio** (genera
llaves privadas que aquí no se usan).

## 2. Crea la cuenta de PythonAnywhere

En <https://www.pythonanywhere.com> → **Pricing & signup** → **Create a Beginner account** (gratis, sin tarjeta) y
confirma tu correo.

El **usuario** que elijas será la dirección de AGATA: `https://TU_USUARIO.pythonanywhere.com`.

## 3. Trae el código e instala

En el **Dashboard**, bajo **New console**, pulsa **`$ Bash`**. Se abre una terminal negra. Pega esta línea y pulsa
Enter:

```bash
git clone https://github.com/DiegoWhite99/AGATA.git && cd AGATA && ./instalar.sh && python3 --version
```

Tarda 2 o 3 minutos. Al final dice «✦ Listo» y muestra la versión de Python (por ejemplo `Python 3.13.1`): anótala
para el paso 5. Que diga «npm no está instalado» es normal: usa el JavaScript ya compilado.

## 4. Configura el `.env` del servidor

En la misma consola, dos pegadas.

**Pegada 1:** pregunta el correo de Google del primer administrador (el tuyo) y escribe la configuración de Firebase.
Cambia los dos valores de Firebase por los tuyos del paso 1:

```bash
read -rp "Tu correo de Google: " C && printf 'FIREBASE_API_KEY=TU_API_KEY\nFIREBASE_PROJECT_ID=TU_PROJECT_ID\nAGATA_ADMINS=%s\n' "$C" > .env
```

**Pegada 2:** genera la clave con la que AGATA firma las sesiones, pide la clave de Groq
(<https://console.groq.com/keys>) y protege el archivo. Las dos claves quedan solo en tu servidor: no se muestran en
pantalla ni quedan en el historial.

```bash
echo "AGATA_SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')" >> .env && read -rsp "Clave de Groq: " K && echo "GROQ_API_KEY=$K" >> .env; unset K; echo; chmod 600 .env; cut -d= -f1 .env
```

Al final muestra solo los nombres, sin los valores:

```
FIREBASE_API_KEY
FIREBASE_PROJECT_ID
AGATA_ADMINS
AGATA_SECRET_KEY
GROQ_API_KEY
```

Sin clave de Groq, AGATA funciona igual, sin el componente de IA (deja la respuesta vacía y pulsa Enter).
`GITHUB_TOKEN` es opcional: sin él, GitHub permite unas 60 consultas por hora, y cada postulante usa entre 2 y 5.

## 5. Crea la web app

Abre la pestaña **Web** (en el menú de arriba, o en `https://www.pythonanywhere.com/user/TU_USUARIO/webapps/`):

1. **Add a new web app** → **Next** (avisa que la dirección será `TU_USUARIO.pythonanywhere.com`).
2. **Manual configuration (including virtualenvs)**. No elijas «Flask»: esa opción crea una app de ejemplo.
3. La **misma versión de Python** del paso 3 (por ejemplo **Python 3.13**) → **Next**.

Queda abierta la página de configuración de tu web app. Para cambiar cada campo, haz clic en el texto (rojo o
subrayado), escribe y pulsa ✓ o Enter:

| Sección | Campo | Valor |
|---|---|---|
| **Code** | Source code | `/home/TU_USUARIO/AGATA` |
| **Code** | Working directory | `/home/TU_USUARIO/AGATA` |
| **Virtualenv** | Enter path to a virtualenv | `/home/TU_USUARIO/AGATA/.venv` (con el punto) |
| **Static files** | URL / Directory | `/static/` / `/home/TU_USUARIO/AGATA/static` |
| **Security** | Force HTTPS | **Enabled** (la cookie de sesión solo viaja por HTTPS) |

**Archivo WSGI:** en **Code**, abre el enlace `/var/www/TU_USUARIO_pythonanywhere_com_wsgi.py`. En el editor, borra
todo (`Ctrl+A` y Suprimir), pega esto y pulsa **Save**:

```python
import sys

RUTA = "/home/TU_USUARIO/AGATA"
if RUTA not in sys.path:
    sys.path.insert(0, RUTA)

from app import app as application  # noqa: E402,F401
```

Si el editor marca un triángulo amarillo en la última línea, es solo un aviso suyo: PythonAnywhere usa la variable
`application`.

Para terminar, arriba en la pestaña **Web**, pulsa el botón verde **Reload TU_USUARIO.pythonanywhere.com**.

## 6. Sube los perfiles de cargo

Los perfiles reales no están en GitHub, porque traen nombres de personas. Tienes dos formas de subirlos:

- Pestaña **Files** → entra a `AGATA/` → crea la carpeta `perfiles` → **Upload a file** con cada perfil.
- O desde AGATA, ya con sesión de administrador: **Configuración** → **Perfiles** → agregar perfil.

## 7. Autoriza tu dirección en Firebase

Sin este paso, el login dice «Este dominio no está autorizado en Firebase».

En Firebase: **Authentication** (también aparece en la barra izquierda, en «Accesos directos a proyectos») → pestaña
**Configuración** → **Dominios autorizados** → **Agregar un dominio** → `TU_USUARIO.pythonanywhere.com`. Va sin
`https://` y sin `/` al final. Debe quedar en la lista con tipo **Custom**, junto a `localhost` y los de Firebase.

## 8. Primer ingreso y usuarios

1. Abre `https://TU_USUARIO.pythonanywhere.com` → **Entrar con Google** con el correo de `AGATA_ADMINS`. Entras como
   administrador.
2. Arma la base real, que arranca vacía: **Configuración → Empresa** (su carta) → **Líderes** (con su correo y su
   jefe inmediato) → **Configuración → Perfiles** → **Vacantes**.
3. Comparte con los postulantes el link de cada vacante (**Copiar link**). No piden iniciar sesión, y al final ven una
   confirmación, sin el puntaje.

**Dar acceso a otra persona.** Siempre entra con su cuenta Google; AGATA no crea contraseñas.

- **Como administradora, desde la consola.** Sirve aunque nadie haya entrado aún. Agrega su correo a `AGATA_ADMINS`
  (separados por comas) y pulsa **Reload** en la pestaña **Web**:
  ```bash
  sed -i 's/^AGATA_ADMINS=.*/AGATA_ADMINS=tu.correo@gmail.com,otra.persona@cun.edu.co/' ~/AGATA/.env && grep ^AGATA_ADMINS ~/AGATA/.env
  ```
- **Desde AGATA** → **Configuración** → **Usuarios** → **Dar acceso**, con su correo y su rol:
  - **Administrador**: gestiona todo.
  - **Líder**: ve los cargos de su cadena de mando. Para este rol, antes hay que crear su ficha en **Líderes**. Si el
    correo coincide con el de la ficha, se liga solo.

Una sesión dura 12 horas. **Salir** cierra todas las sesiones de esa persona. **Quitar acceso** la saca en su siguiente
acción. Si una cuenta `@cun.edu.co` ve «Acceso bloqueado» en la ventana de Google, es una política de la cuenta
Google de la CUN, no de AGATA: la habilita TI.

## 9. Mantenerlo encendido

En la cuenta gratuita, la web app se apaga si nadie la renueva. **Cada mes**, entra a la pestaña **Web** y pulsa el
botón amarillo **Run until 1 month from today**. PythonAnywhere te avisa por correo una semana antes de apagarla.

## 10. Actualizar la versión

**Los datos se conservan.** `git pull` solo trae código: `agata.db` (la base), `uploads/` (las hojas de vida), `.env`
y `perfiles/` no están en git, así que no se tocan. Si quieres ir a la segura, haz antes el respaldo del paso 11.

En una consola **Bash**:

```bash
cd ~/AGATA
git pull
.venv/bin/pip install -r requirements.txt
```

Luego, en la pestaña **Web**, pulsa **Reload**. Al arrancar, AGATA migra la base sola y no borra datos.

## 11. Respaldos

En una consola **Bash**:

```bash
cd ~/AGATA
.venv/bin/python -c "import sqlite3; sqlite3.connect('agata.db').backup(sqlite3.connect('respaldo.db'))"
zip -qr respaldo-uploads.zip uploads
```

Descarga `respaldo.db` y `respaldo-uploads.zip` desde la pestaña **Files**, y luego bórralos del servidor, que también
ocupan espacio. Tienen datos personales de los postulantes: guárdalos cifrados.

## Probar el login en tu computador (opcional)

En local, `AGATA_SIN_LOGIN=1` en `.env` entra sin login, como administrador, y solo funciona con `python app.py`.
Para probar el login real en `http://localhost:5000`:

1. En tu `.env`: `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, `AGATA_ADMINS`, una `AGATA_SECRET_KEY` propia (genérala
   con el comando del paso 4) y `AGATA_SIN_LOGIN=` vacío.
2. Reinicia `.venv/bin/python app.py`. `localhost` ya está autorizado en Firebase.

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| «Something went wrong :-(» al abrir la web | Mira **Web** → **Log files** → *error log*. Lo más común es una ruta mal escrita en el archivo WSGI o en *Virtualenv*, o una versión de Python distinta a la del `.venv`. |
| «El inicio de sesión aún no está configurado» | Falta alguna variable en `.env` (la página dice cuál). Corrígela y pulsa **Reload**. |
| «Este dominio no está autorizado en Firebase» | Falta el paso 7, o Firebase aún no lo aplica: espera un minuto y recarga. |
| «… no tiene acceso a AGATA» | El correo no está en **Usuarios** ni en `AGATA_ADMINS`. |
| Cambié el `.env` y no pasa nada | Hay que pulsar **Reload** en la pestaña **Web**. |
| Entras con Google y vuelves a la pantalla de login | Abriste la dirección con `http://`. Activa **Force HTTPS** (paso 5) y usa `https://`. |
| No aparecen los perfiles | Deben estar en `/home/TU_USUARIO/AGATA/perfiles/`. |
| «Disk quota exceeded» | Borra respaldos viejos del servidor, postulaciones que ya no sirvan o los perfiles de la **Papelera** (en **Perfiles**). Mira el uso en el **Dashboard**. |

## Antes de abrir convocatorias reales

- **Autorización de datos (Ley 1581 de 2012):** el formulario de postulación debe pedir la autorización del
  tratamiento de datos personales, con el texto de la política de la CUN. Ese texto lo define el área jurídica.
- **Dónde quedan los datos:** en los servidores de PythonAnywhere en Estados Unidos. Hay una región en Europa si
  creas la cuenta en `eu.pythonanywhere.com`. Inclúyelo en la política de tratamiento.
- **Quién tiene acceso:** revisa la lista de **Usuarios** de vez en cuando y retira a quien ya no lo necesite.
- **Cuando crezca:** si llegan muchos postulantes o hace falta leer portafolios, el plan pago más pequeño de
  PythonAnywhere quita esos límites. Otra opción es un servidor de la CUN.
