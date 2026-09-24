/*
 * docs.js — shared behaviour for every page of the human documentation site.
 *
 * Load it in <head> WITHOUT defer: the theme is applied before first paint.
 * Everything else waits for DOMContentLoaded.
 *
 *   - theme: stored choice (localStorage 'docs-theme') or the system preference;
 *     inside the portal (docs/index.html) the shell sets the theme instead
 *   - a floating toggle button on standalone pages
 *   - a copy button on every <pre>
 *   - a '#' anchor on every h2/h3 that has an id
 */
(function () {
  const KEY = 'docs-theme';
  const root = document.documentElement;
  let inPortal = false;
  try {
    inPortal = window.self !== window.top && window.parent.location.pathname !== undefined;
  }
  catch {
    inPortal = false;
  }
  if (inPortal) {
    root.classList.add('in-portal');
  }

  function stored() {
    try {
      return localStorage.getItem(KEY);
    }
    catch {
      return null;
    }
  }

  function apply(theme) {
    if (theme === 'dark' || theme === 'light') {
      root.setAttribute('data-theme', theme);
    }
    else {
      root.removeAttribute('data-theme');
    }
  }

  function current() {
    const explicit = root.getAttribute('data-theme');
    if (explicit) {
      return explicit;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  apply(stored());

  function addThemeToggle() {
    if (inPortal) {
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Cambiar tema claro/oscuro');
    const paint = function () {
      btn.textContent = current() === 'dark' ? '☀' : '☾';
    };
    btn.addEventListener('click', () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      apply(next);
      try {
        localStorage.setItem(KEY, next);
      }
      catch {
        /* storage blocked: the choice lasts for this page only */
      }
      paint();
    });
    paint();
    document.body.appendChild(btn);
  }

  function addCopyButtons() {
    const blocks = document.querySelectorAll('pre');
    for (let i = 0; i < blocks.length; i++) {
      (function (pre) {
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.type = 'button';
        btn.textContent = 'Copiar';
        btn.addEventListener('click', () => {
          const code = pre.querySelector('code') || pre;
          const text = code.textContent.replace(/Copia(r|do)$/, '');
          const done = function () {
            btn.textContent = 'Copiado';
            setTimeout(() => {
              btn.textContent = 'Copiar';
            }, 1400);
          };
          if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(done, () => {});
          }
        });
        pre.appendChild(btn);
      })(blocks[i]);
    }
  }

  function addAnchors() {
    const heads = document.querySelectorAll('h2[id], h3[id]');
    for (let i = 0; i < heads.length; i++) {
      const a = document.createElement('a');
      a.className = 'anchor';
      a.href = `#${heads[i].id}`;
      a.textContent = '#';
      a.setAttribute('aria-hidden', 'true');
      heads[i].appendChild(a);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    addThemeToggle();
    addCopyButtons();
    addAnchors();
  });
})();
