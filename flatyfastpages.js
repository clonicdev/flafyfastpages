/**
 * FlatyFastPages — Prefetch inteligente de enlaces internos
 * -----------------------------------------------------------
 * Precarga páginas del mismo sitio al pasar el mouse por encima de un link
 * o cuando el link entra en el viewport, sin sobrecargar el servidor.
 *
 * CONFIGURACIÓN (opcional, dos formas):
 *
 *   1) Recomendada — llamar a FlatyFastPages.init() DESPUÉS de cargar el script:
 *
 *      <script src="flatyfastpages.js"></script>
 *      <script>
 *        FlatyFastPages.init({
 *          delay: 0,
 *          maxRPS: 3,
 *          hoverOnly: false,
 *          hoverDelay: 80,
 *          ignoreKeywords: ["/carrito", "/logout", "?add-to-cart"]
 *        });
 *      </script>
 *
 *   2) Alternativa — variable global declarada ANTES del script:
 *
 *      <script>
 *        window.FlatyFastPagesConfig = { maxRPS: 5 };
 *      </script>
 *      <script src="flatyfastpages.js"></script>
 *
 * Si no configuras nada, el script arranca con valores por defecto seguros.
 *
 * ATRIBUTOS EN LOS LINKS:
 *   data-forceprefetch  → fuerza el prefetch aunque el link tenga "?" o
 *                         coincida con un ignoreKeyword/ignorePattern.
 *                         Solo con ponerlo alcanza, no necesita valor:
 *                         <a href="/producto?id=1" data-forceprefetch>
 *
 *   data-noprefetch     → excluye ese link puntual, sin importar la config.
 *                         <a href="/algo" data-noprefetch>
 */
(function (global) {
  "use strict";

  const defaults = {
    delay: 0,                 // segundos antes de iniciar el escaneo inicial
    maxRPS: 3,                // nuevas solicitudes que se pueden iniciar por segundo
    maxConcurrent: 4,         // prefetches simultáneos permitidos (avanzado)
    hoverOnly: false,         // true = ignora el viewport, solo precarga con hover/touch
    hoverDelay: 80,           // ms de hover antes de disparar el prefetch
    ignoreKeywords: [],       // lista simple de textos a ignorar si aparecen en la URL
    ignorePatterns: [         // avanzado: expresiones regulares, se suman a ignoreKeywords
      /\/(wp-admin|admin|login|logout|salir|signout|cart|carrito|checkout|cuenta|account|api)(\/|$|\?)/i,
      /\.(pdf|zip|rar|7z|exe|dmg|mp4|mp3|avi|mov|docx?|xlsx?)(\?|$)/i,
    ],
    ignoreQueryStrings: true, // por defecto, ignora links con "?" (se consideran dinámicos)
    forceAttribute: "data-forceprefetch",
    skipAttribute: "data-noprefetch",
    rootMargin: "200px",      // margen de anticipación para el IntersectionObserver
    timeout: 6000,            // ms máximos por prefetch antes de abortarlo
    maxFailures: 5,           // fallos consecutivos antes de pausar el sistema
    cooldown: 20000,          // ms de pausa tras exceder maxFailures (luego reintenta)
    persistKey: "ffp_prefetched_v1",
  };

  const cfg = Object.assign({}, defaults, global.FlatyFastPagesConfig || {});

  function init(options) {
    Object.assign(cfg, options || {});
  }

  // --- Soporte del navegador ---
  const testLink = document.createElement("link");
  const supportsPrefetch =
    testLink.relList && testLink.relList.supports && testLink.relList.supports("prefetch");
  const supportsIO = "IntersectionObserver" in window;

  // --- Conexión lenta / ahorro de datos ---
  function checkSlowConnection() {
    const c = navigator.connection;
    return !!c && (c.saveData || /2g/.test(c.effectiveType || ""));
  }
  let isSlow = checkSlowConnection();

  // --- Persistencia dentro de la sesión ---
  let alreadyPrefetched;
  try {
    alreadyPrefetched = new Set(JSON.parse(sessionStorage.getItem(cfg.persistKey)) || []);
  } catch (e) {
    alreadyPrefetched = new Set();
  }
  function persist() {
    try {
      sessionStorage.setItem(cfg.persistKey, JSON.stringify(Array.from(alreadyPrefetched).slice(-500)));
    } catch (e) {}
  }

  const queue = [];
  const queued = new Set();
  let inFlight = 0;
  let dispatchedThisSecond = 0;
  let consecutiveFailures = 0;
  let paused = false;
  let started = false;

  function isBlockedByKeywordsOrPatterns(pathAndQuery) {
    for (const kw of cfg.ignoreKeywords) {
      if (kw && pathAndQuery.includes(kw)) return true;
    }
    for (const pattern of cfg.ignorePatterns) {
      if (pattern.test(pathAndQuery)) return true;
    }
    return false;
  }

  function isEligible(url, el) {
    if (!url || alreadyPrefetched.has(url) || queued.has(url)) return false;

    let parsed;
    try {
      parsed = new URL(url, location.href);
    } catch (e) {
      return false;
    }

    if (parsed.origin !== location.origin) return false;
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.pathname + parsed.search === location.pathname + location.search) return false;

    if (el) {
      if (el.hasAttribute(cfg.skipAttribute)) return false;
      if (el.hasAttribute("download")) return false;
      const rel = (el.getAttribute("rel") || "").toLowerCase();
      if (rel.includes("nofollow") || rel.includes("external")) return false;
    }

    const forced = el && el.hasAttribute(cfg.forceAttribute);

    if (!forced) {
      if (cfg.ignoreQueryStrings && parsed.search) return false;
      if (isBlockedByKeywordsOrPatterns(parsed.pathname + parsed.search)) return false;
    }

    return true;
  }

  function enqueue(url) {
    if (queued.has(url) || alreadyPrefetched.has(url)) return;
    queued.add(url);
    queue.push(url);
    processQueue();
  }

  function processQueue() {
    if (paused || isSlow) return;
    while (queue.length && inFlight < cfg.maxConcurrent && dispatchedThisSecond < cfg.maxRPS) {
      const url = queue.shift();
      dispatchedThisSecond++;
      doPrefetch(url);
    }
  }

  function doPrefetch(url) {
    inFlight++;
    const link = document.createElement("link");
    let done = false;
    const timer = setTimeout(() => finish(false), cfg.timeout);

    function finish(success) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      inFlight--;
      queued.delete(url);
      alreadyPrefetched.add(url);
      persist();
      link.remove();

      if (success) {
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
        if (consecutiveFailures >= cfg.maxFailures) pause();
      }
      processQueue();
    }

    link.rel = "prefetch";
    link.href = url;
    link.onload = () => finish(true);
    link.onerror = () => finish(false);
    document.head.appendChild(link);
  }

  function pause() {
    paused = true;
    queue.length = 0;
    queued.clear();
    setTimeout(() => {
      paused = false;
      consecutiveFailures = 0;
      processQueue();
    }, cfg.cooldown);
  }

  // --- Observador de viewport (se ignora si cfg.hoverOnly === true) ---
  let linksObserver = null;
  if (supportsIO) {
    linksObserver = new IntersectionObserver(
      (entries) => {
        if (cfg.hoverOnly) return; // toggle dinámico: si se activó hoverOnly, no hace nada
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            linksObserver.unobserve(el);
            if (isEligible(el.href, el)) enqueue(el.href);
          }
        });
      },
      { rootMargin: cfg.rootMargin }
    );
  }

  function observeLink(el) {
    if (!linksObserver || el.dataset.ffpObserved) return;
    el.dataset.ffpObserved = "1";
    linksObserver.observe(el);
  }

  function scanLinks(root) {
    root.querySelectorAll("a[href]").forEach(observeLink);
  }

  // --- Hover / touch ---
  let hoverTimer = null;
  function onMouseOver(e) {
    const el = e.target.closest("a[href]");
    if (!el) return;
    hoverTimer = setTimeout(() => {
      if (isEligible(el.href, el)) enqueue(el.href);
    }, cfg.hoverDelay);
  }
  function onMouseOut(e) {
    if (e.target.closest("a[href]")) clearTimeout(hoverTimer);
  }
  function onTouchStart(e) {
    const el = e.target.closest("a[href]");
    if (el && isEligible(el.href, el)) enqueue(el.href);
  }

  const listenerOpts = { capture: true, passive: true };

  let mutationObserver = null;

  function boot() {
    if (started || !supportsPrefetch || !supportsIO) return;
    started = true;

    if (navigator.connection && navigator.connection.addEventListener) {
      navigator.connection.addEventListener("change", () => {
        isSlow = checkSlowConnection();
        if (!isSlow) processQueue();
      });
    }
    if (isSlow) return; // no arranca nada en conexión lenta / data saver

    document.addEventListener("mouseover", onMouseOver, listenerOpts);
    document.addEventListener("mouseout", onMouseOut, listenerOpts);
    document.addEventListener("touchstart", onTouchStart, listenerOpts);

    mutationObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches && node.matches("a[href]")) observeLink(node);
          if (node.querySelectorAll) scanLinks(node);
        });
      }
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("visibilitychange", () => {
      paused = document.hidden;
      if (!paused) processQueue();
    });

    setInterval(() => {
      dispatchedThisSecond = 0;
      processQueue();
    }, 1000);

    const idle =
      window.requestIdleCallback ||
      function (cb) {
        return setTimeout(() => cb({ timeRemaining: () => 50 }), 1);
      };

    idle(() => {
      setTimeout(() => scanLinks(document), cfg.delay * 1000);
    });
  }

  // Arranca en el siguiente "tick": deja que cualquier script de configuración
  // colocado justo después de este <script src="..."> (incluyendo un init())
  // se ejecute primero.
  setTimeout(boot, 0);

  global.FlatyFastPages = {
    init,
    stop() {
      paused = true;
      if (mutationObserver) mutationObserver.disconnect();
      if (linksObserver) linksObserver.disconnect();
      document.removeEventListener("mouseover", onMouseOver, listenerOpts);
      document.removeEventListener("mouseout", onMouseOut, listenerOpts);
      document.removeEventListener("touchstart", onTouchStart, listenerOpts);
    },
    resume() {
      paused = false;
      processQueue();
    },
  };
})(window);
