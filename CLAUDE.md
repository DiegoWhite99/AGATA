# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

AGATA is a Flask + SQLite job-matching app that scores applicants mainly on astrological synastry with the hiring leader and the company, plus a CV reading by an LLM (Groq). Everything in the code is in Spanish: identifiers, comments, docstrings, UI strings and error messages. Keep new code in Spanish too.

## Commands

```bash
./instalar.sh                        # fresh machine: .venv + requirements + npm build + .env from .env.example
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py              # dev server on http://localhost:5000 (debug=True)
.venv/bin/python seed.py             # demo data; refuses if the DB has records
.venv/bin/python seed.py --forzar    # wipes agata.db AND everything in uploads/, then seeds

npm run build                        # tsc: src/ts/ → static/js/
npm run watch
npx tsc -p tsconfig.json --noEmit    # type-check only
```

There is no test suite and no linter. To exercise backend logic, call modules directly, e.g.
`.venv/bin/python -c "import astro; print(astro.calcular_carta('1990-05-01','10:30',4.71,-74.07,-5)['resumen'])"`.
`astro`, `evaluador` and `perfiles` don't need a Flask context. Importing `app` runs `preparar_db()`, which migrates `agata.db` and may rewrite stored results.

`GROQ_API_KEY` (and optionally `GROQ_MODEL`, default `openai/gpt-oss-120b`) goes in `.env`, which `oraculo.cargar_env` loads without overriding existing env vars. Without a key the app still works: the AI component drops out of the score.

## Architecture

**Request flow for a new application** (`POST /api/vacantes/<id>/postulaciones` in `app.py`):
`_datos_natales` validates birth data and calls `astro.calcular_carta` → `_guardar_cv` stores the file in `uploads/` and extracts its text (`evaluador.extraer_texto_cv`) → `_evaluar` runs `evaluador.evaluar` once without AI, passes that result to `oraculo.consultar` (Groq), then runs `evaluador.evaluar` again with the AI verdict → the result JSON, AI JSON, score and verdict are saved on the `candidatos` row.

**Scoring (`evaluador.evaluar`)**: six components (`lider`, `empresa`, `elemento`, `conflicto`, `cv`, `ia`), each 0–100, weighted by the vacancy's `peso_<componente>` columns. A component that is `None` (company without a chart, no AI key, etc.) is dropped and its weight is spread over the rest. Since 1.2.0 the score never classifies or discards anyone; there are no thresholds. It ranks candidates within a vacancy. `LECTURAS` splits it into a professional reading (`cv`, `ia`) and an astral reading, and `destaca` lists each candidate's two strongest components. The only gate is the leader's `decision_lider`, and the old `candidatos.veredicto` column is unused. Each skill has `habilidades.tipo` (`tecnica`/`blanda`; `perfiles.tipo_habilidad` suggests it). With an AI reading, keywords can only raise a technical skill's score and are ignored for soft skills. Without AI, soft skills are `sin_lectura` and left out. The oracle returns `tipo_evidencia` (directa/deducida/sin evidencia) and `fuente` per skill, plus a `potencial` reading that is stored in the result but never added to `puntaje`. Adding a component means updating the `vacantes` schema plus `MIGRACIONES`, `PESOS` in `app.py`, the `componentes` dict, and the frontend.

**Astrology (`astro.py`)**: hand-written ephemeris (Meeus + JPL Keplerian elements, no dependencies). A chart is a dict with `posiciones`, `elementos`, `modalidades`, etc. Derived fields (`conflicto`, `atributos`) are added by `completar_carta` and versioned with `VERSION_CARTA`. `sinastria()` is calibrated so two random charts average ≈65; changing aspect weights or orbs shifts every verdict. Latitude is limited to ±66 because the ascendant formula breaks down near the poles.

**AI (`oraculo.py`)**: plain `urllib` calls to Groq's OpenAI-compatible endpoint with `response_format: json_object`. `_limpiar` validates the response and matches skill scores back to the vacancy's skills by normalized name. The system prompts treat CVs and documents as data, not instructions; keep that rule. On failure it returns `{"error": ...}` rather than raising, and the score is computed without AI.

**Exclusion requirements, alerts, redirection**: `vacantes.excluyentes` holds the non-negotiable requirements. Only `titulo`, `experiencia` and `proyectos` are allowed, and the oracle is told to ignore administrative documents. The oracle returns `requisitos` (si/no/dudoso). `evaluador` aligns them with the vacancy's current requirements, sets `cumple_requisitos` and builds `alertas` (thresholds are the `UMBRAL_*` constants). `ORDEN_RANKING` sorts anyone who fails a requirement last; the score itself is unchanged. `_redirecciones` compares the candidate against the other open vacancies without AI on both sides, and `POST /api/candidatos/<id>/postular-a/<vid>` copies the application, including its own copy of the CV file.

**Roles and network**: `astro.arquetipo` maps dominant element × modality to one of 12 archetypes. It is stored in `carta["arquetipo"]` (a derived field, so changing it needs a `VERSION_CARTA` bump). `lideres.jefe_id` is the chain of command, and `_jefe_valido` rejects cycles. `/api/lideres/jefe-sugerido` suggests a boss from the job profile matching the leader's role. `/api/red` feeds `src/ts/pages/red.ts`, which builds the tree (company → leaders by `jefe_id` → vacancies → candidates) and lays it out radially in SVG. Each edge's weight is the synastry with the node above.

**AI request budget**: Groq's free tier allows 8000 tokens per minute, and each request counts prompt plus `MAX_RESPUESTA`. `oraculo._compactar` trims the case to fit `GROQ_TPM`. It cuts the least useful parts first (the leader's CV, text that repeats the job profile, READMEs) and the candidate's CV last. On a 413 it retries once, trimmed in proportion to the size Groq reports. A failed re-consult keeps the previous verdict (`cand["error_ia"]`).

**Online work (`enlaces.py`)**: every vacancy asks for a portfolio. Vacancies with `vacantes.tecnico = 1` also ask for GitHub, LinkedIn and a featured repo (`campos_para`). `perfiles.es_tecnico` suggests the flag from the role name and skills. `filtrar` drops links that don't apply if a vacancy stops being technical. Any field left empty is filled from the CV, including PDF link annotations and DOCX hyperlinks hidden behind icons. With GitHub but no featured repo, `destacado()` picks one; that repo is stored with `origen: "github"` and re-picked on every re-read. `leer()` makes live network calls: the GitHub REST API (optional `GITHUB_TOKEN`) and a plain HTTP fetch of portfolio pages. LinkedIn is never fetched. Fetches only run on a new application, when the oracle is re-consulted, or on `PUT /api/candidatos/<id>/enlaces`. The result is stored in `candidatos.enlaces`, and re-evaluations reuse it. That text is added to the CV text for keyword matching, and `resumen_ia()` passes it to the oracle. `_url_publica` blocks non-public IPs and non-web ports, including after redirects, so the server can't be used to reach its own network; keep that guard on any new fetch.

**Job profiles (`perfiles.py`, `perfil_cargo.py`)**: the `perfiles/` folder is the catalog. Every new vacancy must be linked to one. `perfiles.py` parses the institutional Excel format (ASL-FOR-001) section by section. Any other format (PDF, DOCX, TXT, CSV, free-form Excel) goes to `perfil_cargo.extraer`: it reads tables for CSV/XLSX, asks the AI to fill any missing fields, and falls back to heading/bullet heuristics when the AI is off or fails. A profile's id is the slug of its filename with any ` (n)` copy suffix removed. Several files can therefore share one id, and `catalogo()` picks the most complete file. Vacancies store both `perfil_id` and `perfil_archivo` (the exact version used). Parsed results are cached in the `perfiles_cache` table, keyed by `VERSION_LECTURA:size:mtime`.

**Re-evaluation cascades**: saving the company re-scores every vacancy, editing a leader re-scores that leader's vacancies, and editing a vacancy re-scores it (`_reevaluar_vacante`). These recalculations reuse the stored AI verdict (`candidatos.ia`). Groq is called again only on a new application or `POST /api/candidatos/<id>/oraculo`.

**Startup (`preparar_db` in `app.py`)**: runs on import. It creates and migrates the schema, upgrades stored charts whose `version < astro.VERSION_CARTA`, and re-scores vacancies whose results are outdated.

## Conventions and gotchas

- **Schema changes**: add the column to `SCHEMA` in `db.py` *and* append it to `MIGRACIONES` so existing databases get an `ALTER TABLE`. Columns in `JSON_COLS` are decoded automatically by `row_to_dict`.
- **Version bumps**: bump `astro.VERSION_CARTA` when derived chart fields change. Bump `perfiles.VERSION_LECTURA` when profile parsing changes; this invalidates the cache.
- **Validation**: raise `ErrorValidacion({campo: mensaje})`. It becomes a 400 response `{"error", "campos"}`, which the frontend turns into `ApiError.campos` and shows per field with `mostrarErrores`.
- **Privacy**: `cv_texto` must not reach the browser (`_lider_publico`, `api_candidato`). Profile occupants (`ocupantes`) are stripped by `perfiles.publico` and are never sent to the AI (`_resumen_perfil`).
- **Uploaded files**: CVs live in `uploads/` with a random prefix. Code that deletes a leader, candidate or vacancy also unlinks their files.
- **Frontend**: TypeScript in `src/ts/` compiles straight to `static/js/` as native ES modules with no bundler. Imports must therefore use the `.js` extension (`from "../api.js"`). Each Jinja template loads `static/js/pages/<pagina>.js`. The compiled JS is checked in, so edit only `src/ts/` and run `npm run build`. Shared helpers: `api.ts` (fetch wrapper), `ui.ts` (DOM, toasts, form errors), `astro-ui.ts` (zodiac wheel and chart widgets), `radar.ts`, `types.ts` (API response types).
