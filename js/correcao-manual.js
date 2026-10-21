// correcao-manual.js
function abrirCorrecaoManual() {
    if (!correcaoManualData.respostasAluno || correcaoManualData.respostasAluno.length === 0) { showToast('❌ Faça uma correção primeiro!', 'error'); return; }
    if (!correcaoManualData.gabarito || correcaoManualData.gabarito.length === 0) { showToast('❌ Gabarito não disponível!', 'error'); return; }
    setText('cm-aluno-nome', correcaoManualData.alunoNome || 'Aluno');
    setText('cm-prova-titulo', correcaoManualData.provaTitulo || 'Prova');
    setText('cm-turma-info', correcaoManualData.serie + ' | Turma: —');
    setText('cm-data-correcao', new Date().toLocaleDateString('pt-BR'));
    gerarGridCorrecaoManual();
    atualizarResumoCorrecaoManual();
    openM('m-correcao-manual');
    setTimeout(() => destacarQuestoesDuvidosas(), 300);
}
function destacarQuestoesDuvidosas() {
    const confiancas = correcaoManualData.confianca_por_questao || [];
    const suspeitas = correcaoManualData.questoes_suspeitas || [];
    const itens = document.querySelectorAll('.correcao-manual-item');
    let totalDuv = 0;
    itens.forEach((item, index) => {
        const conf = confiancas[index] || 100;
        const num = index + 1;
        item.style.borderColor = ''; item.style.borderWidth = ''; item.style.boxShadow = '';
        const old = item.querySelector('.confianca-badge'); if (old) old.remove();
        const isSusp = suspeitas.includes(num) || conf < 70;
        if (isSusp) {
            totalDuv++;
            item.style.borderColor = 'var(--orange)';
            item.style.borderWidth = '2px';
            item.style.boxShadow = '0 0 20px rgba(245,158,11,0.2)';
            const badge = document.createElement('div');
            badge.className = 'confianca-badge';
            badge.style.cssText = 'font-size:8px;font-weight:700;margin-top:4px;padding:2px 8px;border-radius:12px;background:rgba(239,68,68,0.15);color:#ef4444;';
            badge.textContent = `⚠️ Confiança: ${conf}%`;
            const sel = item.querySelector('.q-select');
            if (sel) item.insertBefore(badge, sel); else item.appendChild(badge);
        }
    });
    if (totalDuv > 0) showToast(`🔍 ${totalDuv} baixa confiança`, 'warning');
}
function revisarApenasDuvidosas() {
    const confs = correcaoManualData.confianca_por_questao || [];
    const susps = correcaoManualData.questoes_suspeitas || [];
    const itens = document.querySelectorAll('.correcao-manual-item');
    let totalDuv = 0;
    itens.forEach((item, index) => {
        const conf = confs[index] || 100;
        const num = index + 1;
        const isSusp = susps.includes(num) || conf < 70;
        if (isSusp) { item.style.display = ''; totalDuv++; if (totalDuv === 1) item.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        else item.style.display = 'none';
    });
    if (totalDuv === 0) { showToast('✅ Nenhuma baixa!', 'success'); itens.forEach(i => i.style.display = ''); }
    else showToast(`🔍 Mostrando ${totalDuv}`, 'info');
}
function gerarGridCorrecaoManual() {
    const grid = document.getElementById('cm-grid');
    if (!grid) return;
    const qtd = correcaoManualData.quantidade || 20;
    const alts = correcaoManualData.alternativas || ['A', 'B', 'C', 'D'];
    const resps = correcaoManualData.respostasAluno || [];
    const gab = correcaoManualData.gabarito || [];
    const isProd = (correcaoManualData.disciplina === 'Produção de Texto');
    if (isProd) grid.style.cssText = 'display:flex;flex-direction:column;gap:12px;';
    else grid.style.cssText = 'display:grid;grid-template-columns:repeat(10,1fr);gap:6px;max-height:280px;overflow-y:auto;';
    grid.innerHTML = '';
    for (let i = 0; i < qtd; i++) {
        const div = document.createElement('div');
        div.className = 'correcao-manual-item';
        const resp = (i < resps.length) ? resps[i] : '';
        const gb = (i < gab.length) ? gab[i] : '';
        const isC = resp && gb && resp.toUpperCase() === gb.toUpperCase();
        if (isProd) {
            div.style.cssText = 'background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;display:flex;flex-direction:column;gap:6px;';
            div.innerHTML = `<input class="gab-titulo" type="text" value="Q${i+1}" style="width:100%;padding:4px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px;font-weight:bold;" /><div style="font-size:10px;color:var(--text3);">Gabarito: ${escapeHtml(gb || '—')}</div><textarea class="q-resposta-texto" data-questao="${i}" placeholder="Resposta..." style="width:100%;min-height:50px;padding:4px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px;">${escapeHtml(resp)}</textarea>`;
            const ta = div.querySelector('.q-resposta-texto');
            ta.addEventListener('input', function() { correcaoManualData.respostasAluno[i] = this.value; atualizarResumoCorrecaoManual(); });
        } else {
            let opts = '<option value="">—</option>';
            alts.forEach(a => { const s = resp && resp.toUpperCase() === a ? 'selected' : ''; opts += `<option value="${a}" ${s}>${a}</option>`; });
            let sc = '', st = '';
            if (resp) { if (isC) { sc = 'correta'; st = '✅'; } else { sc = 'errada'; st = '❌'; } }
            div.innerHTML = `<div class="q-num">Q${i+1}</div><div class="q-resposta" style="color:${isC ? 'var(--green)' : (resp ? 'var(--red)' : 'var(--text3)')}">${escapeHtml(resp || '—')}</div><select class="q-select" data-questao="${i}" onchange="atualizarRespostaManual(this)">${opts}</select><div class="q-status ${sc}">${st}</div>`;
            const sel = div.querySelector('.q-select');
            if (resp && isC) sel.className = 'q-select correta';
            else if (resp) sel.className = 'q-select errada';
        }
        grid.appendChild(div);
    }
}
function atualizarRespostaManual(select) {
    const idx = parseInt(select.dataset.questao);
    const nova = select.value;
    correcaoManualData.respostasAluno[idx] = nova ? nova.toUpperCase() : '';
    const item = select.closest('.correcao-manual-item');
    const qr = item.querySelector('.q-resposta');
    const qs = item.querySelector('.q-status');
    const gb = correcaoManualData.gabarito[idx] || '';
    const r = correcaoManualData.respostasAluno[idx] || '';
    const isC = r && gb && r.toUpperCase() === gb.toUpperCase();
    qr.textContent = r || '—';
    qr.style.color = isC ? 'var(--green)' : (r ? 'var(--red)' : 'var(--text3)');
    if (r) {
        if (isC) { qs.textContent = '✅'; qs.className = 'q-status correta'; select.className = 'q-select correta'; }
        else { qs.textContent = '❌'; qs.className = 'q-status errada'; select.className = 'q-select errada'; }
    } else { qs.textContent = ''; qs.className = 'q-status'; select.className = 'q-select'; }
    atualizarResumoCorrecaoManual();
}
function atualizarResumoCorrecaoManual() {
    const qtd = correcaoManualData.quantidade || 20;
    const resps = correcaoManualData.respostasAluno || [];
    const gab = correcaoManualData.gabarito || [];
    const isProd = (correcaoManualData.disciplina === 'Produção de Texto');
    let ac = 0, resp = 0;
    for (let i = 0; i < qtd; i++) {
        const r = i < resps.length ? resps[i] : '';
        const g = i < gab.length ? gab[i] : '';
        if (r) {
            resp++;
            if (isProd) { if (r.trim().toLowerCase() === g.trim().toLowerCase()) ac++; }
            else { if (r.toUpperCase() === g.toUpperCase()) ac++; }
        }
    }
    const er = resp - ac;
    const nota = (ac * correcaoManualData.valorPorQuestao) || 0;
    const notaF = Math.min(nota, correcaoManualData.notaMaxima || 10);
    const pct = qtd > 0 ? Math.round((ac / qtd) * 100) : 0;
    setText('cm-acertos', ac); setText('cm-erros', er); setText('cm-nota', notaF.toFixed(1));
    const sb = document.getElementById('cm-status-badge');
    const sa = document.getElementById('cm-status-atual');
    if (sb && sa) {
        if (notaF >= (correcaoManualData.notaMinima || 5)) { sb.textContent = '✅ APROVADO'; sb.className = 'badge badge-green'; sa.textContent = 'Aprovado'; sa.style.color = 'var(--green)'; }
        else if (notaF >= (correcaoManualData.notaMinima || 5) * 0.8) { sb.textContent = '⚠️ RECUPERAÇÃO'; sb.className = 'badge badge-orange'; sa.textContent = 'Recuperação'; sa.style.color = 'var(--orange)'; }
        else { sb.textContent = '❌ REPROVADO'; sb.className = 'badge badge-red'; sa.textContent = 'Reprovado'; sa.style.color = 'var(--red)'; }
    }
    setText('cm-porcentagem', pct + '% aproveitamento');
}
function preencherGabaritoCM() {
    const qtd = correcaoManualData.quantidade || 20;
    const gab = correcaoManualData.gabarito || [];
    const isProd = (correcaoManualData.disciplina === 'Produção de Texto');
    if (isProd) {
        const inputs = document.querySelectorAll('#cm-grid .q-resposta-texto');
        inputs.forEach((inp, i) => { if (i < gab.length) { inp.value = gab[i] || ''; correcaoManualData.respostasAluno[i] = gab[i] || ''; } });
    } else {
        for (let i = 0; i < qtd; i++) if (i < gab.length && gab[i]) correcaoManualData.respostasAluno[i] = gab[i];
        gerarGridCorrecaoManual();
    }
    atualizarResumoCorrecaoManual();
    showToast('📋 Preenchido!', 'success');
}
function limparRespostasCM() {
    const qtd = correcaoManualData.quantidade || 20;
    const isProd = (correcaoManualData.disciplina === 'Produção de Texto');
    if (isProd) {
        const inputs = document.querySelectorAll('#cm-grid .q-resposta-texto');
        inputs.forEach((inp, i) => { inp.value = ''; correcaoManualData.respostasAluno[i] = ''; });
    } else { for (let i = 0; i < qtd; i++) correcaoManualData.respostasAluno[i] = ''; gerarGridCorrecaoManual(); }
    atualizarResumoCorrecaoManual();
    showToast('🗑️ Limpo!', 'info');
}
function salvarCorrecaoManual() {
    const qtd = correcaoManualData.quantidade || 20;
    const resps = correcaoManualData.respostasAluno || [];
    const gab = correcaoManualData.gabarito || [];
    let ac = 0;
    for (let i = 0; i < qtd; i++) {
        const r = i < resps.length ? resps[i] : '';
        const g = i < gab.length ? gab[i] : '';
        if (r && r.toUpperCase() === g.toUpperCase()) ac++;
    }
    const nota = Math.min((ac * correcaoManualData.valorPorQuestao), correcaoManualData.notaMaxima || 10);
    fetch(API_URL + '/api/corrigir_manual', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Usuario-Username': (getUsuarioAtual?.().username || '') },
        body: JSON.stringify({ prova_id: correcaoManualData.provaId, aluno_id: correcaoManualData.alunoId, respostas: resps, acertos: ac, nota, total: qtd })
    }).then(r => r.json()).then(data => {
        if (data.sucesso) {
            showToast(`✅ Nota ${nota.toFixed(1)}`, 'success');
            limparCache();
            setTimeout(() => { carregarDashboard(); carregarUltimasCorrecoes(); }, 500);
        } else showToast('❌ ' + (data.erro || 'Erro'), 'error');
    }).catch(erro => showToast('❌ ' + erro.message, 'error'));
}

// STANDALONE
function ajustarUIporDisciplina() {
    const isProd = (cmStandaloneData.disciplina === 'Produção de Texto');
    const nc = document.getElementById('cm-nota-manual-container'); if (nc) nc.style.display = isProd ? 'block' : 'none';
    const rs = document.getElementById('cm-sa-resumo'); if (rs) rs.style.display = isProd ? 'none' : 'grid';
    const bd = document.getElementById('cm-sa-badges'); if (bd) bd.style.display = isProd ? 'none' : 'flex';
    const bs = document.getElementById('btn-salvar-correcao-manual'); if (bs) bs.style.display = isProd ? 'none' : 'inline-flex';
}
function abrirCorrecaoManualStandalone() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    ['cm-sa-aluno', 'cm-sa-turma', 'cm-sa-prova', 'cm-sa-data'].forEach(id => setText(id, '—'));
    ['cm-sa-acertos', 'cm-sa-erros'].forEach(id => setText(id, '0'));
    setText('cm-sa-nota', '0,0');
    const sb = document.getElementById('cm-sa-status-badge'); if (sb) { sb.textContent = 'AGUARDANDO'; sb.className = 'badge badge-gray'; }
    setText('cm-sa-porcentagem', '0%');
    document.getElementById('cm-grid-standalone-container').style.display = 'none';
    document.getElementById('cm-info-standalone').style.display = 'none';
    document.getElementById('btn-salvar-correcao-manual').style.display = 'none';
    document.getElementById('cm-grid-standalone').innerHTML = '';
    document.getElementById('cm-selects-container').style.display = 'block';
    const nc = document.getElementById('cm-nota-manual-container'); if (nc) nc.style.display = 'none';
    const nv = document.getElementById('cm-nota-valor'); if (nv) nv.value = '';
    const sd = document.getElementById('cm-nota-status'); if (sd) { sd.style.display = 'none'; sd.textContent = ''; }
    carregarEscolasParaCorrecaoManual();
    document.getElementById('m-correcao-manual-standalone').style.display = 'flex';
}
async function carregarEscolasParaCorrecaoManual() {
    try {
        const escolas = await carregarEscolasComCache();
        const s = document.getElementById('cm-escola-select');
        if (s && escolas && !escolas.erro) {
            const cur = s.value;
            s.innerHTML = '<option value="">Selecione a escola...</option>';
            escolas.forEach(e => { const o = document.createElement('option'); o.value = e.id; o.textContent = e.nome; s.appendChild(o); });
            if (cur) { s.value = cur; carregarTurmasParaCorrecaoManual(cur); }
        }
    } catch (e) { console.error(e); }
}
async function carregarTurmasParaCorrecaoManual(escolaId) {
    const st = document.getElementById('cm-turma-select');
    const sp = document.getElementById('cm-prova-select');
    const sa = document.getElementById('cm-aluno-select');
    if (!st) return;
    st.innerHTML = '<option value="">Selecione a turma...</option>';
    if (sp) sp.innerHTML = '<option value="">Selecione a prova...</option>';
    if (sa) sa.innerHTML = '<option value="">Selecione o aluno...</option>';
    if (!escolaId) return;
    cmStandaloneData.escolaId = parseInt(escolaId);
    try {
        const turmas = await carregarTurmasComCache(escolaId);
        if (turmas && !turmas.erro) turmas.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.nome + ' - ' + (t.serie || ''); o.dataset.serie = t.serie || ''; st.appendChild(o); });
    } catch (e) { console.error(e); }
}
async function carregarAlunosParaCorrecaoManual(turmaId) {
    const sa = document.getElementById('cm-aluno-select');
    if (!sa) return;
    sa.innerHTML = '<option value="">Selecione o aluno...</option>';
    if (!turmaId) return;
    cmStandaloneData.turmaId = parseInt(turmaId);
    const st = document.getElementById('cm-turma-select');
    const to = st.options[st.selectedIndex];
    if (to) { cmStandaloneData.turmaNome = to.text || ''; cmStandaloneData.serie = to.dataset.serie || ''; }
    try {
        const alunos = await carregarAlunosComCache({ turma_id: turmaId });
        if (alunos && !alunos.erro) alunos.forEach(a => { const o = document.createElement('option'); o.value = a.id; o.textContent = a.nome + ' (Nº ' + (a.numero_chamada || '—') + ')'; sa.appendChild(o); });
    } catch (e) { console.error(e); }
}
async function carregarProvasParaCorrecaoManualPorTurma(turmaId) {
    const sp = document.getElementById('cm-prova-select');
    if (!sp) return;
    sp.innerHTML = '<option value="">Selecione a prova...</option>';
    if (!turmaId) return;
    try {
        const provas = await carregarProvasComCache();
        if (provas && !provas.erro) provas.forEach(p => {
            const o = document.createElement('option');
            o.value = p.id;
            o.textContent = p.titulo + ' - ' + (p.serie || '') + ' - ' + (p.disciplina || '');
            o.dataset.serie = p.serie || '';
            o.dataset.quantidade = p.quantidade_questoes || 20;
            o.dataset.tipo = p.tipo_questoes || '4';
            o.dataset.data = p.data_prova || '';
            o.dataset.gabarito = JSON.stringify(p.gabarito || []);
            o.dataset.disciplina = p.disciplina || '';
            sp.appendChild(o);
        });
    } catch (e) { console.error(e); }
}
function carregarGabaritoParaCorrecaoManual() {
    const s = document.getElementById('cm-prova-select');
    const o = s.options[s.selectedIndex];
    if (!o || !o.value) {
        cmStandaloneData.provaId = null; cmStandaloneData.gabarito = []; cmStandaloneData.quantidade = 20;
        cmStandaloneData.alternativas = ['A', 'B', 'C', 'D']; cmStandaloneData.disciplina = '';
        return;
    }
    try {
        const gab = JSON.parse(o.dataset.gabarito || '[]');
        const qtd = parseInt(o.dataset.quantidade) || 20;
        const tipo = o.dataset.tipo || '4';
        cmStandaloneData.provaId = parseInt(o.value);
        cmStandaloneData.provaTitulo = o.text.split(' - ')[0] || 'Prova';
        cmStandaloneData.provaData = o.dataset.data || '';
        cmStandaloneData.gabarito = gab;
        cmStandaloneData.quantidade = qtd;
        cmStandaloneData.alternativas = tipo === '3' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
        cmStandaloneData.disciplina = o.dataset.disciplina || '';
        cmStandaloneData.valorPorQuestao = 10 / qtd;
        cmStandaloneData.respostas = new Array(qtd).fill('');
        if (!cmStandaloneData.serie) cmStandaloneData.serie = o.dataset.serie || '';
        showToast('✅ Gabarito carregado!', 'success');
    } catch (e) { showToast('❌ Erro ao carregar', 'error'); }
}
async function iniciarCorrecaoManualStandalone() {
    const es = document.getElementById('cm-escola-select');
    const tu = document.getElementById('cm-turma-select');
    const pr = document.getElementById('cm-prova-select');
    const al = document.getElementById('cm-aluno-select');
    if (!es.value || !tu.value || !pr.value || !al.value) { showToast('❌ Preencha tudo!', 'error'); return; }
    const ao = al.options[al.selectedIndex];
    cmStandaloneData.alunoId = parseInt(al.value);
    cmStandaloneData.alunoNome = ao.text.split(' (')[0] || 'Aluno';
    try {
        const resp = await apiFetch(`${API_URL}/api/provas/${parseInt(pr.value)}`);
        const prova = await resp.json();
        if (!prova || prova.erro) { showToast('❌ ' + (prova.erro || 'Erro'), 'error'); return; }
        cmStandaloneData.provaId = parseInt(pr.value);
        cmStandaloneData.gabarito = prova.gabarito || [];
        cmStandaloneData.quantidade = prova.quantidade_questoes || 20;
        cmStandaloneData.alternativas = (prova.tipo_questoes == '3') ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
        cmStandaloneData.valorPorQuestao = 10 / cmStandaloneData.quantidade;
        cmStandaloneData.respostas = new Array(cmStandaloneData.quantidade).fill('');
        cmStandaloneData.disciplina = prova.disciplina || '';
        cmStandaloneData.provaTitulo = prova.titulo || 'Prova';
        cmStandaloneData.provaData = prova.data_prova || '';
        cmStandaloneData.serie = prova.serie || cmStandaloneData.serie || '';
        cmStandaloneData.textos_questoes = prova.textos_questoes || [];
        cmStandaloneData.situacoes = new Array(cmStandaloneData.quantidade).fill('');
        if (prova.niveis && Array.isArray(prova.niveis)) for (let i = 0; i < cmStandaloneData.quantidade; i++) cmStandaloneData.situacoes[i] = prova.niveis[i] || '';
    } catch (e) { showToast('❌ ' + e.message, 'error'); return; }
    const tem = cmStandaloneData.gabarito.some(g => g && g.trim() !== '');
    if (!tem) { showToast('⚠️ Prova sem gabarito!', 'warning'); return; }
    setText('cm-sa-aluno', cmStandaloneData.alunoNome);
    setText('cm-sa-turma', cmStandaloneData.serie + ' - ' + cmStandaloneData.turmaNome);
    setText('cm-sa-prova', cmStandaloneData.provaTitulo);
    setText('cm-sa-data', cmStandaloneData.provaData || new Date().toLocaleDateString('pt-BR'));
    document.getElementById('cm-info-standalone').style.display = 'grid';
    document.getElementById('cm-grid-standalone-container').style.display = 'block';
    ajustarUIporDisciplina();
    gerarGridCorrecaoManualSA();
    atualizarResumoCorrecaoManualSA();
    showToast('📝 Correção iniciada!', 'success');
}
function gerarGridCorrecaoManualSA() {
    const grid = document.getElementById('cm-grid-standalone');
    if (!grid) return;
    const qtd = cmStandaloneData.quantidade || 20;
    const alts = cmStandaloneData.alternativas || ['A', 'B', 'C', 'D'];
    const gab = cmStandaloneData.gabarito || [];
    const resps = cmStandaloneData.respostas || [];
    const isProd = (cmStandaloneData.disciplina === 'Produção de Texto');
    if (isProd) grid.style.cssText = 'display:flex;flex-direction:column;gap:14px;';
    else grid.style.cssText = 'display:grid;grid-template-columns:repeat(10,1fr);gap:6px;max-height:280px;overflow-y:auto;';
    grid.innerHTML = '';
    for (let i = 0; i < qtd; i++) {
        const div = document.createElement('div');
        const g = (i < gab.length) ? gab[i] : '';
        const r = (i < resps.length) ? resps[i] : '';
        if (isProd) {
            div.className = 'cm-item-producao';
            const tq = (cmStandaloneData.textos_questoes[i] && cmStandaloneData.textos_questoes[i].titulo) ? cmStandaloneData.textos_questoes[i].titulo : `Q${i+1}`;
            div.innerHTML = `<div style="font-weight:700;margin-bottom:6px;">${escapeHtml(tq)}</div><div style="font-size:10px;color:var(--text3);margin-bottom:6px;">Gabarito: ${escapeHtml(g || '—')}</div><textarea class="cm-q-resposta-texto" placeholder="..." data-questao="${i}">${escapeHtml(r || '')}</textarea>`;
            const ta = div.querySelector('.cm-q-resposta-texto');
            ta.addEventListener('input', function() { cmStandaloneData.respostas[i] = this.value; });
        } else {
            div.className = 'cm-item-standalone';
            let opts = '<option value="">—</option>';
            alts.forEach(a => { const s = r && r.toUpperCase() === a ? 'selected' : ''; opts += `<option value="${a}" ${s}>${a}</option>`; });
            const isC = r && g && r.toUpperCase() === g.toUpperCase();
            div.innerHTML = `<div class="q-num">Q${i+1}</div><div class="q-gabarito">${escapeHtml(g || '—')}</div><select class="q-select-manual" data-questao="${i}" onchange="atualizarRespostaManualSA(this)">${opts}</select><div class="q-status-icon">${r ? (isC ? '✅' : '❌') : ''}</div>`;
        }
        grid.appendChild(div);
    }
}
function atualizarRespostaManualSA(sel) {
    const idx = parseInt(sel.dataset.questao);
    cmStandaloneData.respostas[idx] = sel.value ? sel.value.toUpperCase() : '';
    const item = sel.closest('.cm-item-standalone');
    const sti = item.querySelector('.q-status-icon');
    const g = cmStandaloneData.gabarito[idx] || '';
    const r = cmStandaloneData.respostas[idx] || '';
    const isC = r && g && r.toUpperCase() === g.toUpperCase();
    sel.className = 'q-select-manual';
    if (r) sel.className += isC ? ' correta' : ' errada';
    sti.textContent = r ? (isC ? '✅' : '❌') : '';
    atualizarResumoCorrecaoManualSA();
}
function atualizarResumoCorrecaoManualSA() {
    const qtd = cmStandaloneData.quantidade || 20;
    const resps = cmStandaloneData.respostas || [];
    const gab = cmStandaloneData.gabarito || [];
    const isProd = (cmStandaloneData.disciplina === 'Produção de Texto');
    let ac = 0, resp = 0;
    for (let i = 0; i < qtd; i++) {
        const r = i < resps.length ? resps[i] : '';
        const g = i < gab.length ? gab[i] : '';
        if (r) { resp++; if (isProd) { if (r.trim().toLowerCase() === g.trim().toLowerCase()) ac++; } else { if (r.toUpperCase() === g.toUpperCase()) ac++; } }
    }
    const er = resp - ac;
    const nota = (ac * cmStandaloneData.valorPorQuestao) || 0;
    const nf = Math.min(nota, 10);
    const pct = qtd > 0 ? Math.round((ac / qtd) * 100) : 0;
    setText('cm-sa-acertos', ac); setText('cm-sa-erros', er); setText('cm-sa-nota', nf.toFixed(1));
    const sb = document.getElementById('cm-sa-status-badge');
    if (sb) { if (nf >= 5) { sb.textContent = '✅ APROVADO'; sb.className = 'badge badge-green'; } else if (nf >= 4) { sb.textContent = '⚠️ RECUPERAÇÃO'; sb.className = 'badge badge-orange'; } else { sb.textContent = '❌ REPROVADO'; sb.className = 'badge badge-red'; } }
    setText('cm-sa-porcentagem', pct + '% aproveitamento');
}
function preencherGabaritoManualSA() {
    const gab = cmStandaloneData.gabarito || [];
    const isProd = (cmStandaloneData.disciplina === 'Produção de Texto');
    if (isProd) {
        const ins = document.querySelectorAll('#cm-grid-standalone .cm-q-resposta-texto');
        ins.forEach((i, ix) => { if (ix < gab.length) { i.value = gab[ix] || ''; cmStandaloneData.respostas[ix] = gab[ix] || ''; } });
    } else {
        const sels = document.querySelectorAll('#cm-grid-standalone .q-select-manual');
        sels.forEach((s, i) => { if (i < gab.length && gab[i]) { s.value = gab[i]; cmStandaloneData.respostas[i] = gab[i]; } });
    }
    atualizarResumoCorrecaoManualSA();
    showToast('📋 Preenchido!', 'success');
}
function limparRespostasManualSA() {
    const isProd = (cmStandaloneData.disciplina === 'Produção de Texto');
    if (isProd) {
        const ins = document.querySelectorAll('#cm-grid-standalone .cm-q-resposta-texto');
        ins.forEach((i, ix) => { i.value = ''; cmStandaloneData.respostas[ix] = ''; });
    } else {
        const sels = document.querySelectorAll('#cm-grid-standalone .q-select-manual');
        sels.forEach((s, i) => { s.value = ''; cmStandaloneData.respostas[i] = ''; });
    }
    atualizarResumoCorrecaoManualSA();
    showToast('🗑️ Limpo!', 'info');
}
function revisarApenasDuvidosasSA() {
    const conf = cmStandaloneData.confianca_por_questao || [];
    const susp = cmStandaloneData.questoes_suspeitas || [];
    const itens = document.querySelectorAll('.cm-item-standalone, .cm-item-producao');
    let totalDuv = 0;
    itens.forEach((item, index) => {
        const c = conf[index] || 100;
        const num = index + 1;
        const isS = susp.includes(num) || c < 70;
        if (isS) { item.style.display = ''; totalDuv++; } else item.style.display = 'none';
    });
    if (totalDuv === 0) { showToast('✅ Nenhuma!', 'success'); itens.forEach(i => i.style.display = ''); }
    else showToast(`🔍 ${totalDuv}`, 'info');
}
function salvarCorrecaoManualStandalone() {
    if (!cmStandaloneData) { showToast('❌ Sem dados!', 'error'); return; }
    if (cmStandaloneData.disciplina === 'Produção de Texto') { showToast('⚠️ Use "SALVAR NOTA"', 'warning'); return; }
    const pid = parseInt(cmStandaloneData.provaId);
    const aid = parseInt(cmStandaloneData.alunoId);
    if (!pid || !aid) { showToast('❌ Incompleto!', 'error'); return; }
    const qtd = cmStandaloneData.quantidade || 20;
    const resps = cmStandaloneData.respostas || [];
    const gab = cmStandaloneData.gabarito || [];
    if (!resps.some(r => r && r.trim() !== '')) { showToast('⚠️ Marque uma!', 'warning'); return; }
    let ac = 0;
    for (let i = 0; i < qtd; i++) {
        const r = i < resps.length ? resps[i] : '';
        const g = i < gab.length ? gab[i] : '';
        if (r && g && r.toUpperCase() === g.toUpperCase()) ac++;
    }
    const nota = Math.min((ac * cmStandaloneData.valorPorQuestao), 10);
    apiFetch(API_URL + '/api/corrigir_manual', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prova_id: pid, aluno_id: aid, respostas: resps.map(r => r || ''), acertos: ac, nota, total: qtd })
    }).then(async r => {
        let d; const ct = r.headers.get('content-type');
        if (ct && ct.includes('application/json')) d = await r.json();
        else { const t = await r.text(); try { d = JSON.parse(t); } catch (e) { d = { erro: t || 'Erro' }; } }
        if (!r.ok) throw new Error(d.erro || `Erro ${r.status}`);
        return d;
    }).then(data => {
        if (data.sucesso) {
            showToast(`✅ Nota ${nota.toFixed(1)}`, 'success');
            limparCache();
            setTimeout(() => { carregarDashboard(); carregarUltimasCorrecoes(); }, 400);
        } else showToast('❌ ' + (data.erro || 'Erro'), 'error');
    }).catch(e => { showToast('❌ ' + e.message, 'error'); });
}
async function salvarNotaProducaoCM() {
    const ni = document.getElementById('cm-nota-valor');
    const sd = document.getElementById('cm-nota-status');
    const btn = document.getElementById('btn-salvar-nota-cm');
    const nota = ni ? ni.value : '';
    const aid = cmStandaloneData.alunoId;
    const pid = cmStandaloneData.provaId;
    if (!aid || !pid) { showToast('❌ Sem aluno/prova!', 'error'); return; }
    if (!nota) { showToast('❌ Digite a nota!', 'error'); return; }
    const n = parseFloat(nota);
    if (isNaN(n) || n < 0 || n > 10) { showToast('❌ Nota 0-10!', 'error'); return; }
    if (sd) { sd.style.display = 'block'; sd.textContent = '💾 Salvando...'; sd.style.color = 'var(--blue)'; }
    if (btn) btn.disabled = true;
    try {
        const qs = [];
        const qtd = cmStandaloneData.quantidade || 20;
        const gab = cmStandaloneData.gabarito || [];
        const resp = cmStandaloneData.respostas || [];
        const textos = cmStandaloneData.textos_questoes || [];
        const sits = cmStandaloneData.situacoes || [];
        for (let i = 0; i < qtd; i++) {
            qs.push({ numero: i + 1, titulo: (textos[i] && textos[i].titulo) ? textos[i].titulo : `Q${i+1}`, cabecalho: (textos[i] && textos[i].cabecalho) ? textos[i].cabecalho : '', resposta: (i < resp.length ? resp[i] : '') || '—', gabarito: (i < gab.length ? gab[i] : '') || '—', situacao: (i < sits.length ? sits[i] : '') || '', acertou: false, respondida: !!(i < resp.length && resp[i]), bncc: '', status: `Situação: ${(i < sits.length ? sits[i] : '') || '—'}`, status_texto: `📝 ${(i < sits.length ? sits[i] : '') || '—'}` });
        }
        const r = await apiFetch(`${API_URL}/api/salvar_nota_producao`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aluno_id: parseInt(aid), prova_id: parseInt(pid), nota: n, observacao: '', questoes_status: qs }) });
        const d = await r.json();
        if (d.sucesso) {
            showToast(`✅ Nota ${n.toFixed(1)} salva!`, 'success');
            if (sd) { sd.textContent = `✅ Nota ${n.toFixed(1)}`; sd.style.color = 'var(--green)'; }
            if (ni) ni.value = '';
            limparCache();
            setTimeout(() => { carregarDashboard(); carregarUltimasCorrecoes(); }, 500);
        } else { showToast('❌ ' + (d.erro || 'Erro'), 'error'); if (sd) { sd.textContent = '❌ ' + (d.erro || 'Erro'); sd.style.color = 'var(--red)'; } }
    } catch (e) { showToast('❌ ' + e.message, 'error'); if (sd) { sd.textContent = '❌ ' + e.message; sd.style.color = 'var(--red)'; } }
    finally { if (btn) btn.disabled = false; }
}
async function abrirCorrecaoManualDireta(escolaId, turmaId, alunoId, provaId) {
    try {
        const pr = await apiFetch(`${API_URL}/api/provas/${provaId}`);
        const prova = await pr.json();
        if (!prova || prova.erro) { showToast('❌ Erro prova', 'error'); return; }
        const ar = await apiFetch(`${API_URL}/api/alunos/${alunoId}`);
        const aluno = await ar.json();
        if (!aluno || aluno.erro) { showToast('❌ Erro aluno', 'error'); return; }
        const hr = await apiFetch(`${API_URL}/api/historico?aluno_id=${alunoId}&prova_id=${provaId}`);
        const hist = await hr.json();
        let resps = [];
        if (hist && hist.length > 0 && !hist.erro) resps = hist[0].respostas || [];
        cmStandaloneData.escolaId = parseInt(escolaId);
        cmStandaloneData.turmaId = parseInt(turmaId);
        cmStandaloneData.provaId = parseInt(provaId);
        cmStandaloneData.alunoId = parseInt(alunoId);
        cmStandaloneData.alunoNome = aluno.nome || 'Aluno';
        cmStandaloneData.serie = prova.serie || '';
        cmStandaloneData.gabarito = prova.gabarito || [];
        cmStandaloneData.quantidade = prova.quantidade_questoes || 20;
        cmStandaloneData.alternativas = prova.tipo_questoes == '3' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
        cmStandaloneData.valorPorQuestao = 10 / cmStandaloneData.quantidade;
        cmStandaloneData.respostas = resps.slice(0, cmStandaloneData.quantidade);
        while (cmStandaloneData.respostas.length < cmStandaloneData.quantidade) cmStandaloneData.respostas.push('');
        cmStandaloneData.provaTitulo = prova.titulo || 'Prova';
        cmStandaloneData.provaData = prova.data_prova || '';
        cmStandaloneData.disciplina = prova.disciplina || '';
        openM('m-correcao-manual-standalone');
        const sc = document.getElementById('cm-selects-container'); if (sc) sc.style.display = 'none';
        document.getElementById('cm-grid-standalone-container').style.display = 'block';
        setText('cm-sa-aluno', cmStandaloneData.alunoNome);
        setText('cm-sa-turma', cmStandaloneData.serie);
        setText('cm-sa-prova', cmStandaloneData.provaTitulo);
        setText('cm-sa-data', cmStandaloneData.provaData || new Date().toLocaleDateString('pt-BR'));
        ajustarUIporDisciplina();
        gerarGridCorrecaoManualSA();
        atualizarResumoCorrecaoManualSA();
        showToast('📝 Carregada!', 'success');
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}