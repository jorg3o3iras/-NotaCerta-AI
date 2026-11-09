// init.js — inicialização e combos globais
async function carregarCombos() {
    try {
        const escolas = await carregarEscolasComCache();
        ['turma-escola', 'prova-escola', 'lista-escola', 'editar-turma-escola'].forEach(id => {
            const s = document.getElementById(id);
            if (s) { const c = s.value; s.innerHTML = '<option value="">Selecione a escola</option>'; if (escolas && !escolas.erro) escolas.forEach(e => { const o = document.createElement('option'); o.value = e.id; o.textContent = e.nome; s.appendChild(o); }); if (c) s.value = c; }
        });
        if (typeof carregarEscolasParaAluno === 'function') await carregarEscolasParaAluno();
        const turmas = await carregarTurmasComCache();
        ['aluno-turma', 'modal-prova-turma', 'lista-turma', 'editar-aluno-turma'].forEach(id => {
            const s = document.getElementById(id);
            if (s) { const c = s.value; s.innerHTML = '<option value="">Selecione a turma</option>'; if (turmas && !turmas.erro) turmas.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.nome + ' - ' + (t.serie || '—'); s.appendChild(o); }); if (c) s.value = c; }
        });
        const provas = await carregarProvasComCache();
        ['gab-prova', 'corrigir-prova', 'txt-prova'].forEach(id => {
            const s = document.getElementById(id);
            if (s) { const c = s.value; s.innerHTML = '<option value="">Selecione a prova</option>'; if (provas && !provas.erro) provas.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.titulo + ' - ' + (p.serie || '—') + ' - ' + (p.disciplina || ''); o.dataset.serie = p.serie || ''; o.dataset.quantidade = p.quantidade_questoes || 20; o.dataset.gabarito = JSON.stringify(p.gabarito || []); o.dataset.tipo = p.tipo_questoes || '4'; o.dataset.disciplina = p.disciplina || ''; o.dataset.bncc = JSON.stringify(p.bncc || []); s.appendChild(o); }); if (c) s.value = c; }
        });
        const alunos = await carregarAlunosComCache();
        ['corrigir-aluno', 'txt-aluno-select'].forEach(id => {
            const s = document.getElementById(id);
            if (s) { const c = s.value; s.innerHTML = '<option value="">Selecione...</option>'; if (alunos && !alunos.erro) alunos.forEach(a => { const o = document.createElement('option'); o.value = a.id; o.textContent = a.nome; s.appendChild(o); }); if (c) s.value = c; }
        });
    } catch (e) { console.error(e); }
}
function popularSelectQuestoes() {
    const sel = document.getElementById('prova-questoes');
    if (!sel || sel.options.length > 0) return;
    sel.innerHTML = '';
    for (let i = 1; i <= 30; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = i;
        if (i === 20) opt.selected = true;
        sel.appendChild(opt);
    }
}
function popularSelectGabTotal() {
    const sel = document.getElementById('gab-total');
    if (!sel || sel.options.length > 0) return;
    sel.innerHTML = '';
    for (let i = 1; i <= 30; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = i;
        if (i === 20) opt.selected = true;
        sel.appendChild(opt);
    }
}
async function carregarDados() {
    try {
        await Promise.all([carregarEscolas(), carregarTurmas(), carregarAlunos(), carregarProvas(), carregarDashboard()]);
        atualizarDatasImpressao();
        setTimeout(() => carregarDadosSecundarios(), 300);
    } catch (e) { console.error(e); showToast('⚠️ Erro', 'error'); }
}
async function carregarDadosSecundarios() {
    try {
        await Promise.all([carregarGabaritos(), carregarUltimasCorrecoes(), carregarUsuarios(), carregarCombos()]);
        await Promise.all([
            carregarEscolasFiltroAlunos(),
            carregarEscolasCorrigir(),
            carregarEscolasTexto(),
            carregarEscolasParaCorrecaoManual(),
            carregarFiltrosRelTurma(),
            carregarFiltroEscolaTurmas()
        ]);
        if (typeof carregarDisciplinasParaSelects === 'function') await carregarDisciplinasParaSelects();
    } catch (e) { console.warn(e); }
}

// Fechar modais clicando fora
document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
});

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    const tp = document.getElementById('modal-prova-tipo');
    if (tp) tp.addEventListener('change', function() { gerarGabaritoModal(this.value); });
    const dp = document.getElementById('prova-disciplina');
    if (dp) dp.addEventListener('change', atualizarInfoAlts);
    const gp = document.getElementById('gab-prova');
    if (gp) gp.addEventListener('change', buildGabGrid);

    popularSelectQuestoes();
    popularSelectGabTotal();
    buildGabGrid();
    carregarCombos();
    carregarEscolasCorrigir();
    carregarDados();
    carregarEscolasFiltroAlunos();
    const tp2 = document.getElementById('modal-prova-tipo');
    if (tp2) gerarGabaritoModal(tp2.value);
    atualizarDatasImpressao();
    carregarEscolasParaCorrecaoManual();
    carregarFiltrosRelTurma();
    carregarFiltroEscolaTurmas();
    carregarEscolasParaAluno();
    if (typeof carregarDisciplinasParaSelects === 'function') carregarDisciplinasParaSelects();
    if (typeof carregarProvasParaGabarito === 'function') carregarProvasParaGabarito();
    if (typeof carregarProvasParaTexto === 'function') carregarProvasParaTexto();
    if (typeof carregarProvasParaFiltro === 'function') carregarProvasParaFiltro();
    if (typeof carregarProvasParaDesempenho === 'function') carregarProvasParaDesempenho();
});
