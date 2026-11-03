# Desplegar AGATA gratis: PythonAnywhere + Firebase

Esta guía monta AGATA en internet **sin pagar nada y sin tarjeta**. Haz los pasos en orden.

> **Producción arranca limpia.** El servidor recibe solo el código de GitHub. `agata.db` y `uploads/` tienen los
> datos de la demo (líderes de ejemplo y postulaciones de prueba) y no están en git, así que no se copian. Lo único
> que subes desde tu computador son los perfiles reales de `perfiles/` (paso 6).

## Qué vas a montar

```
 Navegador ──► PythonAnywhere (https://TU_USUARIO.pythonanywhere.com)
     │            AGATA: Flask, la base SQLite y las hojas de vida en su disco
     │            └─ valida cada inicio de sesión con las llaves públicas de Google
     └──────► Firebase Authentication (plan Spark, gratis): ventana de «Entrar con Google»
```

- **PythonAnywhere** (cuenta gratuita *Beginner*) corre AGATA con su base y sus archivos en un disco que no se borra.
- **Firebase Authentication**, en el plan gratuito **Spark**, muestra la ventana de Google y confirma quién es la
  persona. **No actives Blaze:** aquí no hace falta.
- **Qué ve cada quien lo decide AGATA:** el **administrador** gestiona todo, el **líder** ve los cargos de su cadena de
  mando y decide sobre sus postulantes, y la postulación (`/postular/<id>`) es pública.

## Límites de la cuenta gratuita

- **512 MB de disco**, para el código, las librerías, la base y las hojas de vida. Alcanza para unas 150 a 250 hojas
  de vida, según su tamaño.
- **Internet solo hacia sitios permitidos:** Groq, GitHub y Google sí pasan. Los portafolios en general no, así que
  el informe dirá que no se pudo leer el portafolio. El oráculo igual ve el enlace, y el líder puede abrirlo.
- **Un solo proceso:** las peticiones se atienden una a la vez. Una postulación con IA tarda entre 5 y 20 segundos, y
  mientras tanto los demás esperan. Para un piloto está bien.
- **Hay que renovarlo cada 3 meses** con un clic (paso 9). PythonAnywhere avisa por correo antes.
- **La dirección es `TU_USUARIO.pythonanywhere.com`.** Un dominio propio, como `agata.cun.edu.co`, requiere plan pago.

## 1. Firebase: login con Google (plan Spark)

En <https://console.firebase.google.com>, en tu proyecto **Agata**:

1. **Seguridad** → **Authentication** → **Comenzar** → **Método de acceso** → **Google** → **Habilitar**. Elige el
   correo de asistencia y pulsa **Guardar**.
2. Página principal del proyecto → **+ Agregar app** → ícono **`</>`** (web). Apodo «AGATA web». **No** marques
   Firebase Hosting. Pulsa **Registrar app**.
3. Del bloque `firebaseConfig`, copia **`apiKey`** y **`projectId`**. No son secretos: solo identifican el proyecto.
   El ID también está en **Configuración** → **General**.

La dirección de PythonAnywhere se autoriza en el paso 7, cuando ya tengas tu usuario.

## 2. Crea la cuenta de PythonAnywhere

En <https://www.pythonanywhere.com> → **Pricing & signup** → **Create a Beginner account** (gratis, sin tarjeta).

El **usuario** que elijas será la dirección de AGATA: `https://TU_USUARIO.pythonanywhere.com`. Elige uno claro,
por ejemplo `agatacun`.

## 3. Trae el código e instala

En PythonAnywhere: **Consoles** → **Bash**. En esa consola:

```bash
git clone https://github.com/DiegoWhite99/AGATA.git
cd AGATA
./instalar.sh
python3 --version          # anota la versión (por ejemplo 3.10): la usarás en el paso 5
```

`instalar.sh` crea el entorno `.venv`, instala las librerías y crea el archivo `.env` vacío. En PythonAnywhere no hay
`npm`, así que usa el JavaScript ya compilado; es normal.

## 4. Configura el `.env` del servidor

Primero genera la clave con la que AGATA firma las sesiones. La generas tú, en la misma consola:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

Copia lo que salga y abre el archivo:

```bash
nano .env
```

Completa estas líneas (con `Ctrl+O`, `Enter` guardas y con `Ctrl+X` sales):

| Variable | Valor |
|---|---|
| `GROQ_API_KEY` | tu clave de Groq (<https://console.groq.com/keys>). Sin ella, AGATA funciona sin el componente de IA. |
| `FIREBASE_API_KEY` | la `apiKey` del paso 1 |
| `FIREBASE_PROJECT_ID` | el `projectId` del paso 1 |
| `AGATA_ADMINS` | tu correo de Google, y el de quien más deba ser administrador, separados por comas |
| `AGATA_SECRET_KEY` | la clave que acabas de generar |
| `AGATA_SIN_LOGIN` | **vacío**. Igual no tiene efecto en el servidor. |

Luego protege el archivo, para que solo tu usuario pueda leerlo:

```bash
chmod 600 .env
```

`GITHUB_TOKEN` es opcional. Sin él, GitHub permite unas 60 consultas por hora, y cada postulante usa entre 2 y 5. Si
lo quieres, créalo tú en GitHub → Settings → Developer settings → Fine-grained tokens, solo de lectura pública.

## 5. Crea la web app

En PythonAnywhere: pestaña **Web** → **Add a new web app** → **Next** → **Manual configuration (including
virtualenvs)** → la **misma versión de Python** del paso 3 → **Next**.

En la página de tu web app:

1. **Code:**
   - **Source code** y **Working directory**: `/home/TU_USUARIO/AGATA`.
2. **WSGI configuration file:** abre el enlace (`/var/www/TU_USUARIO_pythonanywhere_com_wsgi.py`), **borra todo** lo
   que trae, pega esto y pulsa **Save**:
   ```python
   import sys

   RUTA = "/home/TU_USUARIO/AGATA"
   if RUTA not in sys.path:
       sys.path.insert(0, RUTA)

   from app import app as application  # noqa: E402
   ```
3. **Virtualenv:** `/home/TU_USUARIO/AGATA/.venv`.
4. **Static files:** URL `/static/`, Directory `/home/TU_USUARIO/AGATA/static`.
5. **Security:** **Force HTTPS** en *Enabled*. La cookie de sesión solo viaja por HTTPS.
6. Arriba, el botón verde **Reload**.

## 6. Sube los perfiles de cargo

Los perfiles reales no están en GitHub, porque traen nombres de personas. Tienes dos formas de subirlos:

- Pestaña **Files** → entra a `AGATA/` → crea la carpeta `perfiles` → **Upload a file** con cada perfil.
- O, más adelante, desde AGATA: **Perfiles** → agregar perfil.

## 7. Autoriza tu dirección en Firebase

En Firebase: **Seguridad** → **Authentication** → **Configuración** → **Dominios autorizados** → **Agregar dominio**
→ `TU_USUARIO.pythonanywhere.com`.

## 8. Primer ingreso y usuarios

1. Abre `https://TU_USUARIO.pythonanywhere.com` → **Entrar con Google** con un correo de `AGATA_ADMINS`. Entras como
   administrador.
2. Arma la base real, que arranca vacía: **Empresa** (su carta) → **Líderes** (con su correo y su jefe inmediato) →
   **Perfiles** → **Cargos y vacantes**.
3. **Usuarios** → **Dar acceso**: el correo de cada líder y su ficha de líder. Esa ficha define qué ve: los cargos de
   su cadena de mando. Si el correo coincide con el de la ficha, se liga solo.
4. Comparte con los postulantes el link de cada vacante (**Copiar link**). No piden iniciar sesión, y al final ven
   una confirmación, sin el puntaje.

Una sesión dura 12 horas. **Salir** cierra todas las sesiones de esa persona. **Quitar acceso** la saca en su siguiente
acción.

## 9. Mantenerlo encendido

En la cuenta gratuita, la web app se apaga si nadie la renueva. Cada 3 meses, entra a la pestaña **Web** y pulsa
**Run until 3 months from today**. PythonAnywhere te avisa por correo una semana antes.

## 10. Actualizar la versión

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
| «Este dominio no está autorizado en Firebase» | Falta el paso 7. |
| «… no tiene acceso a AGATA» | El correo no está en **Usuarios** ni en `AGATA_ADMINS`. |
| Entras con Google y vuelves a la pantalla de login | Abriste la dirección con `http://`. Activa **Force HTTPS** (paso 5) y usa `https://`. |
| No aparecen los perfiles | Deben estar en `/home/TU_USUARIO/AGATA/perfiles/`. |
| «Disk quota exceeded» | Borra respaldos viejos del servidor o postulaciones que ya no sirvan. Mira el uso en la pestaña **Files**. |

## Antes de abrir convocatorias reales

- **Autorización de datos (Ley 1581 de 2012):** el formulario de postulación debe pedir la autorización del
  tratamiento de datos personales, con el texto de la política de la CUN. Ese texto lo define el área jurídica.
- **Dónde quedan los datos:** en los servidores de PythonAnywhere en Estados Unidos. Hay una región en Europa si
  creas la cuenta en `eu.pythonanywhere.com`. Inclúyelo en la política de tratamiento.
- **Quién tiene acceso:** revisa la lista de **Usuarios** de vez en cuando y retira a quien ya no lo necesite.
- **Cuando crezca:** si llegan muchos postulantes o hace falta leer portafolios, el plan pago más pequeño de
  PythonAnywhere quita esos límites. Otra opción es un servidor de la CUN.
