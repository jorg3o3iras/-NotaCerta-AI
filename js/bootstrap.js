/**
 * Bootstrap — carrega partials, monta DOM e executa scripts na ordem correta.
 * Substitui o antigo index.html monolítico.
 */
(function () {
  'use strict';

  const ASSETS = {
    menuToggle: 'partials/menu-toggle.html',
    sidebar:    'partials/sidebar.html',
    toast:      'partials/toast-container.html',
    pages: [
      'partials/pages/dashboard.html',
      'partials/pages/escola.html',
      'partials/pages/turmas.html',
      'partials/pages/lista-turma.html',
      'partials/pages/alunos.html',
      'partials/pages/prova-upload.html',
      'partials/pages/gabarito.html',
      'partials/pages/corrigir-ia.html',
      'partials/pages/correcao-texto.html',
      'partials/pages/gabaritos.html',
      'partials/pages/provas.html',
      'partials/pages/rel-turma.html',
      'partials/pages/config.html',
      'partials/pages/disciplinas.html',
      'partials/pages/user-pages.html'
    ],
    modals: [
      'partials/modals/cam-modal.html',
      'partials/modals/m-correcao-manual.html',
      'partials/modals/m-correcao-manual-standalone.html',
      'partials/modals/m-editar-escola.html',
      'partials/modals/m-editar-turma.html',
      'partials/modals/m-editar-aluno.html',
      'partials/modals/del-modal.html',
      'partials/modals/m-escola.html',
      'partials/modals/m-turma.html',
      'partials/modals/m-aluno.html',
      'partials/modals/m-prova.html',
      'partials/modals/m-usuario.html',
      'partials/modals/m-disciplina.html',
      'partials/modals/m-visualizar-prova.html',
      'partials/modals/m-ver-cartao.html',
      'partials/modals/progress-modal.html'
    ],
    scripts: [
      'js/core.js',
      'js/progress.js',
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
      'js/inline-init.js'   // substitui o <script> inline original
    ]
  };

  async function fetchText(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Falha ao carregar "${url}" (HTTP ${res.status})`);
    return res.text();
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload  = () => resolve();
      s.onerror = () => reject(new Error(`Falha ao carregar script "${src}"`));
      document.body.appendChild(s);
    });
  }

  async function boot() {
    try {
      // 1) Busca todos os partials em paralelo
      const [menuToggle, sidebar, toast, ...rest] = await Promise.all([
        fetchText(ASSETS.menuToggle),
        fetchText(ASSETS.sidebar),
        fetchText(ASSETS.toast),
        ...ASSETS.pages.map(fetchText),
        ...ASSETS.modals.map(fetchText)
      ]);

      const pagesHtml  = rest.slice(0, ASSETS.pages.length).join('\n');
      const modalsHtml = rest.slice(ASSETS.pages.length).join('\n');

      // 2) Monta a estrutura idêntica ao index.html original
      const fullHtml = [
        menuToggle,
        '<div id="app">',
        sidebar,
        '<div class="content">',
        pagesHtml,
        '</div>',
        '</div>',
        modalsHtml,
        toast
      ].join('\n');

      // 3) Injeta no DOM (substitui o boot-root)
      const root = document.getElementById('boot-root');
      root.outerHTML = fullHtml;

      // 4) Carrega os scripts na ordem original
      for (const src of ASSETS.scripts) {
        await loadScript(src);
      }

      // 5) Se o DOMContentLoaded já passou (scripts carregados async),
      //    dispara um sintético para os listeners que o aguardam
      if (document.readyState !== 'loading') {
        document.dispatchEvent(new Event('DOMContentLoaded'));
      }
    } catch (err) {
      console.error('[bootstrap] erro:', err);
      document.body.innerHTML =
        '<div style="padding:24px;font-family:sans-serif;max-width:720px;margin:40px auto;">' +
        '<h2>⚠ Erro ao carregar o sistema</h2>' +
        '<pre style="background:#f5f5f5;padding:12px;border-radius:8px;overflow:auto;">' +
        String(err.message || err) +
        '</pre>' +
        '<p>Verifique se está acessando via servidor Flask — o sistema usa <code>fetch()</code> e não funciona em <code>file://</code>.</p>' +
        '</div>';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
