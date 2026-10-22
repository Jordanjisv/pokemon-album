# 🎴 PokéAlbum — Pokémon Card Explorer

Aplicación web **responsiva** que consume la API pública **[TCGdex](https://tcgdex.dev/)** para explorar cartas Pokémon, buscar por nombre, filtrar por series y colecciones, navegar entre páginas y consultar información detallada.

> Proyecto 2 — Programación Web. La interfaz y los nombres del código están en inglés; esta documentación está en español.

## Características

- 🃏 Galería de cartas con imágenes, nombres, sets, series, números y fechas.
- 🔎 **Búsqueda con debounce de 4 segundos**: consulta la API después de que el usuario deja de escribir.
- 🔗 **JOIN lógico de tres endpoints**: cartas (`/cards`), colecciones (`/sets`) y series (`/series`).
- 🧩 Filtros dependientes: al seleccionar una serie se muestran las colecciones de esa serie.
- ⬅️ ➡️ Paginación con botones **Previous** y **Next**; tamaño de página configurado en 9.
- 📖 Modal **View Details** con categoría, HP, tipos, rareza, ilustrador, descripción y ataques cuando estén disponibles.
- 🖼️ Respaldo de imágenes: intenta WebP y PNG antes de mostrar **Image not available**.
- ⚡ Caché para reducir consultas duplicadas y protección frente a respuestas antiguas.
- 📱 Diseño adaptable a móvil, tablet y escritorio con Bootstrap 5.

## Tecnologías

| Tecnología | Para qué se utiliza |
| --- | --- |
| HTML5 | Estructura de la interfaz, buscador, selectores, tarjetas y modal. |
| CSS3 | Estilos, efectos de tarjetas, imagen de respaldo y media queries. |
| Bootstrap 5 | Cuadrícula responsiva, controles y modal de detalles. |
| JavaScript (vanilla) | Eventos, búsqueda, filtros, caché, JOIN y renderizado en el DOM. |
| Fetch API | Peticiones HTTP GET a TCGdex. |
| `Promise.all()` y `Promise.allSettled()` | Coordinar consultas paralelas y manejar fallos parciales. |
| TCGdex REST API | Datos de cartas Pokémon, sets, series e imágenes. |

**No se requiere Java, Spring Boot, PostgreSQL, Maven ni Node.js.** Este proyecto es un **frontend estático** que consume una API de terceros.

## Estructura

```text
pokemon-album/
├── index.html
├── css/
│   └── styles.css
├── js/
│   └── app.js
├── .gitignore
└── README.md
```

## Ejecutar en una computadora

### Opción A: IntelliJ IDEA

1. Abre la carpeta `pokemon-album` en IntelliJ IDEA.
2. Abre `index.html` con **Open in Browser**.
3. Comprueba la búsqueda, los filtros, la paginación y el modal.

### Opción B: servidor web local (recomendado)

Desde la carpeta del proyecto, en PowerShell:

```powershell
py -m http.server 5500
```

Abre en tu navegador: **http://localhost:5500/**.

> Se necesita Internet para acceder a TCGdex y descargar Bootstrap desde su CDN. Si el comando `py` no está disponible, utiliza la función de servidor local de tu IDE o un servidor estático equivalente.

## API REST utilizada

**URL base:** `https://api.tcgdex.net/v2/en`

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/cards?name=Pikachu` | Buscar cartas por nombre. |
| GET | `/sets` | Consultar listado de colecciones. |
| GET | `/series` | Consultar listado de series. |
| GET | `/sets/{id}` | Obtener detalles del set y su serie relacionada. |
| GET | `/series/{id}` | Obtener las colecciones de una serie seleccionada. |
| GET | `/cards/{id}` | Obtener información completa de una carta para el modal. |

Ejemplos para explorar en el navegador:

- [Carta de Pikachu](https://api.tcgdex.net/v2/en/cards/base1-58)
- [Colección Base Set](https://api.tcgdex.net/v2/en/sets/base1)
- [Serie Base](https://api.tcgdex.net/v2/en/series/base)

## JOIN de tres endpoints

Durante la carga inicial, JavaScript inicia las consultas a **cards, sets y series** mediante `Promise.all()`:

```javascript
const [cards, catalogs] = await Promise.all([
    getCached(pageCache, buildCardsUrl(page)),
    getCatalogs() // solicita /sets y /series en paralelo si aún no están cargados
]);
```

**JOIN 1 — Card → Set:** se relaciona el identificador de cada carta con el set correspondiente. Por ejemplo, `base1-58` se vincula con el set `base1`. Para validar la relación, se obtienen detalles del set mediante `/sets/{id}`.

**JOIN 2 — Set → Series:** desde el detalle de set se obtiene el campo `serie.id`; luego se busca el mismo ID dentro del catálogo de series.

Las tres fuentes permiten construir una tarjeta con los datos combinados. **No es un JOIN SQL**: la relación se resuelve mediante objetos JavaScript. Después de la primera carga, se reutilizan sets y series desde caché para evitar descargarlos continuamente.

## Búsqueda con debounce de 4 segundos

En `js/app.js`, el evento `input` cancela el temporizador anterior y crea uno nuevo:

```javascript
clearTimeout(searchTimer);
searchTimer = setTimeout(() => {
    loadPage(1, requestId);
}, 4000);
```

Esto significa que el usuario puede escribir sin generar una petición por cada tecla: cuando deja de escribir durante cuatro segundos, empieza la búsqueda. **La carga inicial, los cambios de filtros y la navegación no esperan cuatro segundos**.

Para evitar que una respuesta antigua sobrescriba una búsqueda nueva, la aplicación compara `requestId` con `latestRequest`.

## Filtros y paginación

- El filtro **Pokémon Series** obtiene los sets relacionados desde `/series/{id}`.
- El filtro **Card Set** limita la búsqueda a cartas del set seleccionado.
- La galería está configurada con `PAGE_SIZE = 9`.
- **Previous** y **Next** permiten navegar entre páginas.
- Los resultados consultados se conservan en `pageCache`; los detalles de sets y series se conservan en otros mapas `Map`.
- La API no entrega necesariamente un número de páginas total; por ello la interfaz comprueba el resultado al navegar.

## Vista detallada de una carta

El botón **View Details** abre un **modal de Bootstrap** y realiza una consulta adicional a `/cards/{id}`. Cuando la API tiene el dato, se muestran categoría, HP, tipos, rareza, ilustrador, descripción y ataques. Algunos atributos pueden ser opcionales según la carta.

## Diseño responsivo

El contenedor principal de las tarjetas utiliza:

```html
<div class="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-4">
```

- Menos de **576 px**: 1 columna.
- Desde **576 px**: 2 columnas.
- Desde **992 px**: 3 columnas.

Los selectores utilizan clases como `col-12 col-md-6`; el modal emplea columnas responsivas y el CSS incluye reglas `@media` para móviles.

## Manejo de errores e imágenes

Las imágenes no siempre están presentes o accesibles. La interfaz prueba `/low.webp` y después `/high.png`; si ambas opciones fallan muestra **Image not available** sin dejar la tarjeta vacía.

Las funciones de red verifican `response.ok` y presentan errores HTTP cuando corresponde. La caché ayuda a evitar solicitudes repetidas, mientras que `Promise.allSettled()` permite conservar información disponible aunque falle el detalle de alguna colección.

## Comprobaciones recomendadas

- [ ] Al cargar la página aparecen cartas.
- [ ] Al escribir `Charizard`, la búsqueda espera 4 segundos desde la última tecla.
- [ ] Seleccionar una serie muestra colecciones relacionadas.
- [ ] `Previous` y `Next` permiten regresar y avanzar.
- [ ] `View Details` abre el modal con los datos disponibles.
- [ ] Las cartas sin imagen muestran un respaldo visual.
- [ ] En modo móvil las tarjetas y controles se acomodan.
- [ ] En F12 → Network aparecen peticiones GET a TCGdex.

## Preguntas comunes para la exposición

**¿Qué tipo de aplicación es?** Un frontend estático cliente-servidor que consume una API REST externa; no tiene backend ni base de datos propia.

**¿Por qué `Promise.all()`?** Porque permite ejecutar peticiones de manera concurrente y esperar sus resultados antes de combinarlos.

**¿Cómo haces el JOIN?** Comparando identificadores de cartas, sets y series; después creamos objetos con los campos combinados.

**¿Por qué debounce?** Reduce las peticiones innecesarias cuando el usuario escribe.

**¿Dónde está el diseño responsivo?** En el Grid de Bootstrap 5 y en las media queries de `styles.css`.

## Documentación extendida

[Guía técnica en Notion — PokéAlbum](https://app.notion.com/p/4015ffe0d8ad81669e79e9cb0640b214?pvs=204) *(página privada del autor)*.

## Fuente de los datos

[TCGdex API](https://tcgdex.dev/rest) es un proyecto de terceros. La disponibilidad de datos e imágenes depende del proveedor.
