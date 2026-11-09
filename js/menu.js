/* =========================================================
   menu.js — toggleMenu + handler de resize
   (substitui o <script> inline do final do index.html)
   ========================================================= */
(function () {
  'use strict';

  function toggleMenu() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('menuOverlay');
    if (!sb || !ov) return;
    sb.classList.toggle('open');
    ov.classList.toggle('active');
    document.body.style.overflow = sb.classList.contains('open') ? 'hidden' : '';
  }

  // exposto para os onclick="toggleMenu()" do HTML
  window.toggleMenu = toggleMenu;

  const btnToggle = document.getElementById('menuToggle');
  const overlay = document.getElementById('menuOverlay');
  if (btnToggle) btnToggle.addEventListener('click', toggleMenu);
  if (overlay) overlay.addEventListener('click', toggleMenu);

  window.addEventListener('resize', function () {
    if (window.innerWidth > 768) {
      const sb = document.getElementById('sidebar');
      const ov = document.getElementById('menuOverlay');
      if (sb) sb.classList.remove('open');
      if (ov) ov.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
})();
