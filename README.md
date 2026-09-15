# FlatyFastPages

Script ligero en JavaScript puro (sin dependencias) que precarga (`prefetch`) páginas internas de tu sitio cuando un link entra en el viewport o cuando el usuario pasa el mouse por encima, para que la navegación se sienta instantánea — sin sobrecargar tu servidor.

## Características

- Precarga por **viewport** (IntersectionObserver) y por **hover/touch**.
- Límite real de peticiones simultáneas y por segundo (no satura el servidor).
- Se pausa solo si detecta varios fallos seguidos, y se reactiva después de un tiempo de espera (cooldown).
- Ignora por defecto rutas sensibles (admin, login, cart, checkout, etc.) y cualquier URL con `?` (se asume dinámica).
- Permite forzar o excluir links puntuales con atributos HTML.
- Detecta links agregados dinámicamente (SPA, scroll infinito, contenido cargado por AJAX).
- Se pausa si la pestaña está oculta o si el usuario tiene activado el ahorro de datos / conexión lenta (2G).
- No requiere frameworks ni build step — un solo archivo `.js`.

## Instalación

Sube `flatyfastpages.js` a tu proyecto e inclúyelo antes de cerrar `</body>`:

```html
<script src="flatyfastpages.js"></script>
```

Con esto ya funciona, usando la configuración por defecto (ver tabla abajo). **No es obligatorio configurar nada.**

## Instalación / CDN

Puedes incluir **FlatyFastPages** directamente en tu proyecto usando la CDN de [jsDelivr](https://www.jsdelivr.com/):

### Producción (Recomendado - Minificado)

```html
<script src="[https://cdn.jsdelivr.net/gh/clonicdev/flafyfastpages@v0.1.0/flatyfastpages.min.js](https://cdn.jsdelivr.net/gh/clonicdev/flafyfastpages@v0.1.0/flatyfastpages.min.js)"></script>
```

## Configuración rápida

Si quieres personalizar el comportamiento, agrega otro `<script>` inmediatamente después, llamando a `FlatyFastPages.init()`:

```html
<script src="flatyfastpages.js"></script>
<script>
  FlatyFastPages.init({
    delay: 1,
    maxRPS: 3,
    hoverOnly: false,
    hoverDelay: 100,
    ignoreKeywords: ["/carrito", "/mi-cuenta", "?add-to-cart"]
  });
</script>
```

> El orden importa: `init()` debe llamarse **después** de incluir `flatyfastpages.js`, pero puede ir en el mismo `<head>`/`<body>`, no hace falta esperar a que la página termine de cargar.

### Alternativa: variable global

Si prefieres no llamar a una función (por ejemplo porque tu config la genera un plugin o un CMS), puedes declarar el objeto de configuración **antes** de incluir el script:

```html
<script>
  window.FlatyFastPagesConfig = { maxRPS: 5 };
</script>
<script src="flatyfastpages.js"></script>
```

Ambas formas son compatibles entre sí; si usas las dos, `init()` tiene la última palabra.

## Opciones disponibles

| Opción | Tipo | Default | Descripción |
|---|---|---|---|
| `delay` | número (segundos) | `0` | Tiempo de espera antes de escanear los links de la página al cargar. |
| `maxRPS` | número | `3` | Máximo de peticiones **nuevas** de prefetch que se inician por segundo. |
| `maxConcurrent` | número | `4` | Máximo de prefetches **simultáneos** en curso (control de concurrencia real). |
| `hoverOnly` | booleano | `false` | Si es `true`, ignora el scroll/viewport y solo precarga por hover (o tap en móvil). |
| `hoverDelay` | número (ms) | `80` | Tiempo que el mouse debe permanecer sobre el link antes de precargarlo. |
| `ignoreKeywords` | array de strings | `[]` | Si la URL contiene cualquiera de estos textos, no se precarga (salvo `data-forceprefetch`). |
| `ignorePatterns` | array de RegExp | rutas admin/cart/checkout + archivos descargables | Avanzado: patrones adicionales a `ignoreKeywords`, con expresiones regulares. |
| `ignoreQueryStrings` | booleano | `true` | Trata cualquier URL con `?` como "dinámica" y no la precarga por defecto. |
| `rootMargin` | string (CSS) | `"200px"` | Margen de anticipación del IntersectionObserver (precarga un poco antes de que el link sea 100% visible). |
| `timeout` | número (ms) | `6000` | Tiempo máximo que se espera un prefetch antes de darlo por fallido. |
| `maxFailures` | número | `5` | Fallos consecutivos antes de pausar el sistema temporalmente. |
| `cooldown` | número (ms) | `20000` | Tiempo de pausa tras superar `maxFailures`, antes de reintentar. |
| `forceAttribute` | string | `"data-forceprefetch"` | Nombre del atributo HTML que fuerza el prefetch de un link. |
| `skipAttribute` | string | `"data-noprefetch"` | Nombre del atributo HTML que excluye un link puntual. |
| `persistKey` | string | `"ffp_prefetched_v1"` | Clave usada en `sessionStorage` para no re-precargar lo mismo al navegar por el sitio. |

## Atributos en los links

```html
<!-- Fuerza el prefetch aunque la URL tenga "?" o coincida con un ignoreKeyword/ignorePattern -->
<a href="/producto?id=123" data-forceprefetch>Ver producto</a>

<!-- Excluye este link puntual, sin importar la configuración global -->
<a href="/cerrar-sesion" data-noprefetch>Cerrar sesión</a>
```

No necesitan valor — basta con que el atributo esté presente en la etiqueta `<a>`.

## Ejemplos de uso

### 1. Uso básico (valores por defecto)

```html
<script src="flatyfastpages.js"></script>
```

### 2. Solo precargar con hover, ideal para catálogos con muchos links en pantalla

```html
<script src="flatyfastpages.js"></script>
<script>
  FlatyFastPages.init({
    hoverOnly: true,
    hoverDelay: 150
  });
</script>
```

### 3. Sitio con carrito de compras: excluir rutas propias además de las que ya vienen por defecto

```html
<script src="flatyfastpages.js"></script>
<script>
  FlatyFastPages.init({
    ignoreKeywords: [
      "/carrito",
      "/finalizar-compra",
      "/mi-cuenta",
      "?add-to-cart",
      "?remove_item"
    ]
  });
</script>
```

### 4. Forzar el prefetch de una paginación aunque use "?"

```html
<a href="/blog?page=2" data-forceprefetch>Página siguiente</a>
```

### 5. Servidor modesto: bajar la velocidad de precarga

```html
<script src="flatyfastpages.js"></script>
<script>
  FlatyFastPages.init({
    maxRPS: 1,
    maxConcurrent: 2,
    delay: 2
  });
</script>
```

## Control manual (API)

```js
FlatyFastPages.stop();    // detiene todo: listeners, observers y cola pendiente
FlatyFastPages.resume();  // reanuda si estaba pausado
FlatyFastPages.init({});  // puede llamarse en cualquier momento para actualizar la configuración
```

## Requisitos del navegador

Usa `IntersectionObserver` y `<link rel="prefetch">`. Si el navegador no soporta alguno de los dos, el script simplemente no hace nada (no genera errores). También se desactiva automáticamente si el usuario tiene activado el modo de ahorro de datos o está en una conexión 2G.

## Notas

- El script nunca precarga dominios externos, ni links `mailto:`, `tel:`, `javascript:`, con atributo `download`, o con `rel="nofollow"`/`rel="external"`.
- Las páginas ya precargadas se recuerdan durante la sesión de navegación (`sessionStorage`), para no repetir trabajo al moverse entre páginas del mismo sitio.
