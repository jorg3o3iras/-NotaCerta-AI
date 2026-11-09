/* =========================================================
   sidebar.js — delegação de cliques na sidebar
   (elimina os 14 onclick repetidos dos .sb-item)
   ========================================================= */
(function () {
  'use strict';

  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  sidebar.addEventListener('click', function (e) {
    const item = e.target.closest('.sb-item');
    if (!item) return;

    const page = item.dataset.p;
    const action = item.dataset.action;

    if (page && typeof window.go === 'function') window.go(page);
    if (action && typeof window[action] === 'function') window[action]();

    if (window.innerWidth <= 768 && typeof window.toggleMenu === 'function') {
      window.toggleMenu();
    }
  });
})();
