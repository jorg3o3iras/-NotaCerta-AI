// nav.js — navegação e datas de impressão
function atualizarDatasImpressao() {
    const d = new Date().toLocaleString('pt-BR');
    ['print-data-dash', 'print-data-resultados', 'print-data-rel-turma', 'print-data-desempenho'].forEach(id => setText(id, d));
}
function go(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');
    document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
    const sb = document.querySelector(`.sb-item[data-p="${page}"]`);
    if (sb) sb.classList.add('active');
    if (window.innerWidth < 900) {
        const s = document.getElementById('sidebar'), o = document.getElementById('menuOverlay');
        if (s) s.classList.remove('open');
        if (o) o.classList.remove('show');
    }
}
function toggleMenu() {
    const s = document.getElementById('sidebar'), o = document.getElementById('menuOverlay'), t = document.getElementById('menuToggle');
    if (!s || !o || !t) return;
    const open = s.classList.toggle('open');
    o.classList.toggle('show', open);
    t.classList.toggle('active', open);
    t.innerHTML = open ? '×' : '☰';
}
function filtrarTurmasPorSerie(serieSelect, turmaSelect) {
    if (!serieSelect || !turmaSelect) return;
    const serie = serieSelect.value;
    Array.from(turmaSelect.options).forEach(opt => {
        if (!opt.dataset.serie) return;
        opt.style.display = (!serie || opt.dataset.serie === serie) ? '' : 'none';
    });
}
function fecharAbaMulti() {
    closeM('m-aluno');
    go('lista-turma');
    showToast('📋 Abrindo lista...', 'info');
}