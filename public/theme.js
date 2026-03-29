(function () {
  const KEY = 'jl-theme';
  const mq  = window.matchMedia('(prefers-color-scheme: dark)');

  function effectiveTheme() {
    return localStorage.getItem(KEY) || (mq.matches ? 'dark' : 'light');
  }

  // Apply immediately to prevent flash before CSS renders
  document.documentElement.dataset.theme = effectiveTheme();

  // Keep in sync if the system preference changes and no manual override is saved
  mq.addEventListener('change', function () {
    if (!localStorage.getItem(KEY)) {
      document.documentElement.dataset.theme = effectiveTheme();
      sync();
    }
  });

  var btn;

  function sync() {
    if (!btn) return;
    const dark = document.documentElement.dataset.theme === 'dark';
    btn.textContent = dark ? '☀' : '🌙';
    btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  }

  document.addEventListener('DOMContentLoaded', function () {
    btn = document.createElement('button');
    btn.id = 'theme-toggle';
    sync();

    btn.addEventListener('click', function () {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem(KEY, next);
      sync();
    });

    // Place inside #user-info if present, otherwise fixed bottom-right
    const bar = document.getElementById('user-info');
    if (bar) {
      bar.appendChild(btn);
    } else {
      btn.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:9999;';
      document.body.appendChild(btn);
    }
  });
}());
