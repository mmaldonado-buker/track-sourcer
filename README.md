# SourcerTrack v4 — Gemini Edition

Tracker de sourcing para equipos de Talent Acquisition. SPA en vanilla JS con persistencia en Google Sheets (vía Apps Script) y fallback a `localStorage`.

## Stack

- HTML + CSS + JavaScript vanilla (sin build step, sin dependencias npm)
- Google Apps Script como backend (Sheets como base de datos)
- Gemini API para análisis e insights de candidatos
- `localStorage` como caché y modo offline

## Estructura

```
.
├── index.html      # Markup: pantallas setup, login, app, modales, panel lateral
├── styles.css      # Tokens de diseño (:root), layout, componentes
├── app.js          # Capa API, estado, vistas, integración Gemini, boot
└── README.md
```

Tres archivos, cero configuración. Para abrir el proyecto basta con servir la carpeta.

## Cómo correr en local

Por restricciones de CORS y `fetch`, **no funciona abriendo `index.html` directo en el navegador** (file://). Hay que servir por HTTP. Cualquiera de estas opciones sirve:

```bash
# Opción 1: Python (viene preinstalado en macOS y Linux)
python3 -m http.server 8080

# Opción 2: Node
npx serve

# Opción 3: VS Code
# Instalar la extensión "Live Server" y click derecho > "Open with Live Server"
```

Luego abrir `http://localhost:8080`.

## Cómo conectar Google Sheets

1. Crear un Google Sheet nuevo.
2. Extensions → Apps Script → pegar el backend (no incluido en este repo todavía; pendiente).
3. Deploy → New deployment → Web app → ejecutar como "Me", acceso "Anyone".
4. Copiar la URL del deployment y pegarla en la pantalla de setup de la app.

Si no se configura Sheets, la app corre en **modo demo** con datos seed y persiste en `localStorage`.

## Convenciones del código

- **Nombres abreviados**: `ni` = nav item, `nb` = nav badge, `sbl` = sidebar label, `est` = estado, `pid` = pool id. Optimizado para que el archivo sea compacto; al modularizar conviene renombrar.
- **Estado global** en variables top-level de `app.js`: `CU` (current user), `HAT` (rol activo), `pools`, `cands`, `currentPool`, `thresholds`.
- **Permisos por rol**: 5 hats — `sourcer`, `recruiter`, `owner`, `supervisor`, `viewer`. Las funciones `canSeeCandidate`, `canEdit`, `canEditFull` centralizan la lógica.
- **Onclick inline** en el HTML llaman directamente a funciones globales. Si en algún momento se modulariza, hay que reemplazar por `addEventListener`.

## Flujo de trabajo Git sugerido

```bash
git init
git add .
git commit -m "Initial commit: separación en 3 archivos"
git branch -M main
git remote add origin <url-del-repo>
git push -u origin main
```

Para trabajar en paralelo:

```bash
git checkout -b feat/nombre-feature
# ...cambios...
git add . && git commit -m "feat: descripción"
git push origin feat/nombre-feature
# Luego abrir Pull Request en GitHub
```

## Roadmap de mejoras (cuando duela el mono-archivo)

Esta es la separación mínima. Cuando `app.js` empiece a pesar (estimación: >1500 líneas, o cuando dos personas necesiten editar la misma sección simultáneamente), conviene modularizar. Sugerencia:

```
src/
├── api/
│   ├── sheets.js          # sheetsAPI, apiCall, syncNow
│   └── localFallback.js
├── state/
│   ├── store.js           # estado global, getters
│   └── permissions.js     # canSee, canEdit, hats
├── data/
│   ├── users.js           # USERS, SQUADS
│   └── seed.js            # SEED, DEFAULT_POOLS
├── views/
│   ├── pool.js
│   ├── pipeline.js
│   ├── kanban.js
│   ├── analytics.js
│   └── config.js
├── ai/
│   └── gemini.js          # autoInsights, deepAnalysis, aiCand
├── utils/
│   ├── dates.js
│   ├── toast.js
│   └── modal.js
└── main.js                # boot, event listeners
```

Pasos para llegar ahí:
1. Convertir a ES modules nativos (`<script type="module">`).
2. Reemplazar `onclick="fn()"` en HTML por `addEventListener` en JS.
3. Mover funciones por carpeta, exportar/importar lo necesario.
4. (Opcional) Adoptar Vite si se quiere HMR y bundling.

## Áreas conocidas para mejorar

- **API keys**: la key de Gemini se guarda en `localStorage` y se envía desde el cliente. Para producción debería ir por un proxy backend.
- **Error handling**: muchos `fetch` no tienen retry; el modo offline cubre la mayoría de casos pero los errores parciales (Sheets responde pero con datos corruptos) no están manejados.
- **Tests**: cero cobertura actualmente. Al modularizar, vale la pena agregar Vitest para la capa de permisos y helpers de fechas.
- **Accesibilidad**: faltan `aria-label` en varios botones de icono y los modales no atrapan el foco.
