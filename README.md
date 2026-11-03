# ✦ AGATA · Oráculo de selección

Plataforma web de match laboral centrada en la **carta astral**. Cruza la carta del postulante con la del
**líder** y la de la **empresa** (sinastría), lee la hoja de vida con un **agente de IA (Groq)** y entrega un
informe con puntaje.

**Nadie queda descartado.** El puntaje no clasifica: ordena a los postulantes de cada vacante (ranking) y se
lee en dos partes, **perfil profesional** (hoja de vida + IA) y **afinidad astral** (líder, empresa, elemento y
conflictos). Cada postulante muestra en qué **destaca**, aunque su puntaje total sea bajo, y lo que conviene
explorar en la entrevista. La única decisión es la del **líder**: aprobar o rechazar.

## Ejecutar

En una máquina nueva, después de clonar el repositorio:

```bash
./instalar.sh                    # crea .venv, instala las librerías, compila el frontend y crea .env
.venv/bin/python app.py          # http://localhost:5000
```

O paso a paso:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env             # opcional: la clave de Groq para la IA
.venv/bin/python app.py
```

En Ubuntu, si `python3 -m venv` falla, instala antes `python3-venv`. La carpeta `perfiles/` no viene en el
repositorio (los perfiles de cargo traen datos de personas): copia ahí los archivos o súbelos desde **Perfiles**.

Para cargar datos de demostración en una base vacía: `.venv/bin/python seed.py`. Si la base ya tiene
registros, el script se niega a borrarlos (solo lo hace con `--forzar`).

### Agente de IA (Groq)

La clave va en el archivo `.env` (no se sube a git; parte de `.env.example`):

```
GROQ_API_KEY=gsk_...
GROQ_MODEL=            # opcional; por defecto openai/gpt-oss-120b
```

Sin clave, o si Groq no responde, el match se calcula igual sin el componente de IA.

### Frontend (TypeScript)

El código fuente está en `src/ts/` y se compila a `static/js/` (el JS compilado ya viene incluido).

```bash
npm install
npm run build      # o: npm run watch
```

## Flujo

1. **Empresa**: nombre, sector, misión, valores, cultura y fecha, hora y ciudad de **fundación**, con las que se
   traza su carta astral.
2. **Líderes**: datos, hoja de vida, descripción detallada y datos natales.
3. **Perfiles** (`/perfiles`, archivos en `perfiles/`): los perfiles de cargo. Cada Excel con el formato
   institucional «Descripción del rol y responsabilidades» (ASL-FOR-001) se lee sección por sección:
   identificación (división, rol estratégico/táctico/operativo, superior inmediato), misión, responsabilidades,
   toma de decisiones, relaciones, dimensión y perfil del candidato (formación, experiencia, conocimientos y
   competencias técnicas y blandas). También acepta PDF, Word, TXT, CSV o Excel libre (los interpreta el oráculo IA
   o la lectura por tabla). Se pueden subir perfiles nuevos y un archivo idéntico a otro no se duplica. La lectura se
   guarda en la base y se renueva cuando el archivo cambia. Si dos perfiles de cargos distintos tienen el mismo texto
   en una sección (misión, formación, experiencia, conocimientos o competencias), se marca como copiado.
4. **Cargos y vacantes**: **todo cargo nuevo se liga a un perfil** (obligatorio). Al elegirlo se llenan
   cargo, área, descripción (misión + responsabilidades), la matriz de habilidades (desde las competencias y los
   conocimientos deseables, con nivel según el rol) y el elemento afín sugerido. El líder se elige solo cuando el
   superior inmediato del perfil coincide con el cargo de un líder registrado (tolera género, plural, tildes y errores
   de digitación) o con quien ocupa ese cargo según el perfil del superior. Si el superior no está registrado, o el
   líder asignado no es ese superior, se avisa. Los cargos creados antes de Perfiles pueden ligarse al editarlos.
   **Lo que se espera del nuevo integrante sale del perfil del cargo** (formación, experiencia, competencias y
   conocimientos), no del texto general del líder; así lo ve la vacante y así lo usa el oráculo IA.
   Plantilla para un perfil propio: `/api/perfiles/plantilla.xlsx` o `.csv`.
5. **Postulación** (`/postular/<id>`): muestra los requisitos del perfil (formación, experiencia y
   conocimientos) y sigue con: datos → registro de los astros → **lo que dicta su carta** → hoja de vida y
   **trabajo en línea** → envío. Sin tests ni preguntas: la carta astral es la regla.

   **Trabajo en línea** (opcional): todo postulante comparte su **portafolio**. En los **cargos técnicos**
   (ingeniería, desarrollo, datos o IA; la casilla se marca sola al elegir el perfil y se puede cambiar) también
   GitHub, LinkedIn y su repositorio destacado. Si el postulante no los escribe, se toman de la hoja de vida,
   incluidos los hipervínculos escondidos tras íconos en un PDF o un Word. Si no indica repositorio destacado,
   AGATA elige el más destacado de su GitHub (estrellas y forks en escala logarítmica, actividad reciente,
   documentación y relación con las habilidades del cargo). GitHub se lee con su API pública y el portafolio
   como página web. LinkedIn no permite que un programa lea sus perfiles: se guarda el enlace para el líder. En
   los cargos técnicos, el oráculo IA pesa esa evidencia tanto o más que la hoja de vida. Desde el informe se
   pueden agregar o corregir los enlaces, y **Reconsultar al oráculo** los vuelve a leer.
6. **Informe**: puesto en el ranking de la vacante, perfil profesional y afinidad astral, en qué destaca, las tres
   cartas, sinastría (rejilla de aspectos, radar por astro y lecturas), manejo de conflictos, lo que dictan las tres
   cartas, dictamen del oráculo IA, hoja de vida (puntos a favor y lo que conviene explorar) y decisión del líder.

**Roles y Red**: cada carta (líder, postulante y empresa) recibe un rol arquetípico según su elemento y su modalidad
dominantes: El Pionero, El Guardián de la llama, El Explorador, El Arquitecto, El Constructor, El Artesano, El
Estratega, El Visionario, El Mensajero, El Guía, El Oráculo y El Alquimista. En **Líderes** se registra el **jefe
inmediato** de cada líder (cadena de mando; se sugiere desde el perfil de su cargo y no admite ciclos). La sección
**Red** (`/red`) dibuja esa cadena como una red neuronal: el líder (o la empresa) es el nodo central y la red se
despliega hacia los líderes de su equipo, sus cargos y los postulantes. Cada sinapsis brilla y se engrosa según la
sinastría con quien está arriba.

**Lo que dicta la carta**: cada carta (postulante, líder y empresa) fija sus reglas: elemento dominante,
modalidad dominante y estilo ante el conflicto, más un rasgo por astro, por ejemplo "Comunicación: precisa,
analítica y servicial (Mercurio en Virgo)". Nadie los confirma ni los responde: los dictan los astros.

**Manejo de conflictos**: cada carta tiene un perfil con los cinco estilos de Thomas-Kilmann
(competir, colaborar, negociar, evitar y complacer). Sale sobre todo de Marte (cómo enfrenta), la Luna
(qué lo detona y qué necesita) y Mercurio (cómo discute). El informe muestra el perfil del postulante, del
líder y de la cultura de la empresa; la dinámica entre postulante y líder (riesgo, puntos de fricción y puentes)
y un consejo para cada uno.

## Cómo se calcula el match

| Componente | Peso por defecto | Qué mide |
|---|---|---|
| Sinastría con el líder | 35 | Aspectos reales (en grados, con orbe) entre los astros de ambas cartas + afinidad de elementos |
| Sinastría con la empresa | 25 | Lo mismo, contra la carta de fundación de la empresa |
| Elemento afín al cargo | 10 | Presencia en la carta del elemento que pide el cargo |
| Manejo de conflictos | 10 | Compatibilidad de estilos de conflicto con el líder + aspectos entre Marte, Luna, Mercurio, Sol y Saturno |
| Hoja de vida | 20 | Lectura de la IA en la hoja de vida y el trabajo en línea, frente al nivel requerido y al perfil institucional del cargo. En las habilidades técnicas, las palabras clave (40 %) solo pueden subir la nota; las blandas no se buscan por palabras clave |
| Ajuste con el líder (IA) | 10 | El oráculo compara el perfil con lo que espera el líder |

**Habilidades técnicas y blandas**: cada habilidad del cargo es técnica o blanda (sale del perfil y se puede
cambiar). Una hoja de vida centrada en proyectos rara vez escribe "trabajo en equipo" o "proactividad", así que la
IA deduce las blandas de los proyectos (integrar hardware y software, construir herramientas propias, documentar,
entregar productos…). Cada nota dice si la evidencia es **directa**, **deducida de proyectos** o no hay, y de dónde
salió; las preguntas de entrevista validan lo deducido.

**Potencial**: una lectura aparte de la IA, que no suma al puntaje, sobre la capacidad de crecer: tecnologías nuevas
con el tiempo (la trayectoria de GitHub), proyectos cada vez más complejos, constancia e iniciativa. Así un perfil
con poca experiencia formal pero que aprende rápido no pasa inadvertido.

Lo astral pesa cerca del 73 % por defecto; cada cargo puede cambiar los pesos. Si falta un componente (por ejemplo, la
empresa aún no tiene carta), queda fuera y los demás se reparten su peso. El puntaje total sirve para ordenar; el
perfil profesional y la afinidad astral son el promedio ponderado de sus componentes.

**Sinastría**: trígonos y sextiles suman armonía; cuadraturas, oposiciones y quincuncios suman tensión; la
conjunción depende de los astros. Cada par se pondera por la importancia del astro en el trabajo (Sol, Luna,
Mercurio y Saturno pesan más). El resultado se calibra para que dos cartas al azar promedien ≈ 65 %.

La carta astral se calcula en `astro.py` sin librerías externas (Meeus y elementos keplerianos del JPL, ≈ 1°).

## Estructura

```
app.py          Flask: páginas y API REST
oraculo.py      Agente de IA (Groq): lectura del CV, ajuste con el líder y dictamen
evaluador.py    Lectura del CV y cálculo del match
enlaces.py      Trabajo en línea: detecta y lee GitHub, portafolio y repositorio (LinkedIn solo como enlace)
perfiles.py     Catálogo de la carpeta perfiles/: lectura del formato institucional y propuesta del cargo
perfil_cargo.py Lectura general de perfiles en PDF, Word, TXT, CSV o Excel libre
perfiles/       Perfiles de cargo (fuente de todo cargo nuevo)
astro.py        Carta astral, lo que dicta cada carta, sinastría y manejo de conflictos
db.py           SQLite (con migraciones de columnas)
seed.py         Datos de demostración (opcional)
ciudades.py     Ciudades con coordenadas y huso horario
templates/      HTML (Jinja)
src/ts/         TypeScript (páginas, menú animado, radar, rueda zodiacal, corona de laurel)
static/         CSS (estilo oráculo de Delfos) y JS compilado
```
