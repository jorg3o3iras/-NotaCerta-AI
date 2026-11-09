/* =========================================================
   boot.js — orquestrador: carrega partials, depois scripts,
   depois dispara init.js e a navegação inicial.
   ========================================================= */
(function () {
  'use strict';

  // Páginas do sistema (ordem original do index.html)
  const PAGES = [
    'dashboard', 'escola', 'turmas', 'lista-turma', 'alunos',
    'prova-upload', 'gabarito', 'corrigir-ia', 'correcao-texto',
    'gabaritos', 'provas', 'rel-turma', 'config', 'disciplinas',
  ];

  // Placeholders de "usuário" que existiam vazios no original
  const EMPTY_PAGES = [
    'u-dashboard', 'u-escola', 'u-turmas', 'u-alunos',
    'u-resultados', 'u-relatorios',
  ];

  // Modais (ordem original do index.html)
  const MODALS = [
    'cam-modal',
    'correcao-manual',
    'correcao-manual-standalone',
    'editar-escola',
    'editar-turma',
    'editar-aluno',
    'del-modal',
    'escola',
    'turma',
    'aluno',
    'prova',
    'usuario',
    'disciplina',
    'visualizar-prova',
    'ver-cartao',
    'progress-modal',
  ];

  // Scripts — ordem original do index.html (mantém ?v=)
  const SCRIPTS = [
    'js/core.js',
    'js/ui.js',
    'js/menu.js',
    'js/progress.js',
    'js/sidebar.js',
    'js/nav.js',
    'js/dashboard.js',
    'js/escolas.js',
    'js/turmas.js',
    'js/alunos.js',
    'js/provas.js?v=5002',
    'js/gabaritos.js',
    'js/usuarios.js',
    'js/disciplinas.js?v=5001',
    'js/camera.js',
    'js/correcao-ia.js',
    'js/correcao-manual.js',
    'js/correcao-texto.js',
    'js/relatorios.js?v=5001',
    'js/cartoes.js',
    'js/init.js?v=5001',
  ];

  async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Falha ao carregar ' + url + ': ' + res.status);
    return res.text();
  }

  async function loadSidebar() {
    document.getElementById('sidebar-mount').innerHTML =
      await fetchText('partials/layout/sidebar.html');
  }

  async function loadPages() {
    const htmls = await Promise.all(
      PAGES.map((p) => fetchText('partials/pages/' + p + '.html'))
    );
    // placeholders vazios (mesmo formato do original)
    const empties = EMPTY_PAGES
      .map((p) => '<div class="page" id="page-' + p + '"></div>')
      .join('\n');
    document.getElementById('pages-mount').innerHTML = htmls.join('\n') + '\n' + empties;
  }

  async function loadModals() {
    const htmls = await Promise.all(
      MODALS.map((m) => fetchText('partials/modals/' + m + '.html'))
    );
    document.getElementById('modals-mount').innerHTML = htmls.join('\n');
  }

  function loadScriptsSequentially(srcs) {
    return srcs.reduce(
      (chain, src) =>
        chain.then(
          () =>
            new Promise((resolve, reject) => {
              const s = document.createElement('script');
              s.src = src;
              s.onload = resolve;
              s.onerror = () => reject(new Error('Falha no script: ' + src));
              document.body.appendChild(s);
            })
        ),
      Promise.resolve()
    );
  }

  async function boot() {
    try {
      await loadSidebar();
      await loadPages();
      await loadModals();
      await loadScriptsSequentially(SCRIPTS);

      // Mostra o app e dispara navegação inicial (equivalente ao
      // antigo DOMContentLoaded inline no final do index.html)
      document.getElementById('app').style.display = 'flex';
      if (typeof window.go === 'function') window.go('dashboard');
    } catch (err) {
      console.error('[boot]', err);
      document.body.insertAdjacentHTML(
        'afterbegin',
        '<div style="padding:20px;background:#fee;color:#900;font-family:sans-serif;">' +
          'Erro ao iniciar a aplicação: ' + err.message +
          '</div>'
      );
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
