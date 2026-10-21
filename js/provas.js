// provas.js
async function carregarProvas() {
    try {
        const provas = await carregarProvasComCache(true);
        const tbody = document.getElementById('tb-provas');
        if (!tbody) return;
        if (!provas || provas.length === 0 || provas.erro) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3);">Nenhuma prova</td></tr>';
            return;
        }
        tbody.innerHTML = provas.map((p, i) => {
            return `<tr data-id="${p.id}" data-nome="${escapeAttr(p.titulo)}">
                <td><span class="badge badge-blue">${String(i+1).padStart(3,'0')}</span></td>
                <td><strong>${escapeHtml(p.titulo)}</strong></td>
                <td><span class="badge badge-purple">${escapeHtml(p.serie || '—')}</span></td>
                <td><span class="badge badge-gray">${escapeHtml(p.disciplina || '—')}</span></td>
                <td>${escapeHtml(p.data_prova || '—')}</td>
                <td><span class="badge ${p.gabarito && p.gabarito.length > 0 ? 'badge-green' : 'badge-orange'}">${p.gabarito && p.gabarito.length > 0 ? 'Com Gabarito' : 'Sem Gabarito'}</span></td>
                <td><div class="btn-group">
                    <button class="btn btn-outline btn-sm" onclick="visualizarProva(${p.id})">👁️</button>
                    ${p.gabarito && p.gabarito.length > 0 ? '' : '<button class="btn btn-primary btn-sm" onclick="go(\'gabarito\')">+ Gabarito</button>'}
                    <button class="btn-del" onclick="excluirProva(${p.id}, '${escapeAttr(p.titulo)}')">🗑️</button>
                </div></td>
            </tr>`;
        }).join('');
    } catch (erro) { console.error(erro); }
}

let visualizarProvaId = null;
let visualizarProvaData = null;

async function visualizarProva(id) {
    try {
        const response = await apiFetch(`${API_URL}/api/provas/${id}`);
        const prova = await response.json();
        if (!prova || prova.erro) { showToast('❌ ' + (prova.erro || 'Erro'), 'error'); return; }
        visualizarProvaId = id;
        visualizarProvaData = prova;
        const conteudo = document.getElementById('visualizar-prova-conteudo');
        if (!conteudo) return;
        const gabarito = prova.gabarito || [];
        const bncc = prova.bncc || [];
        const total = prova.quantidade_questoes || 20;
        let gabHtml = '';
        if (gabarito.length > 0) {
            gabHtml = '<div style="margin-top:12px;"><strong>📋 Gabarito:</strong><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px;margin-top:6px;">';
            for (let i = 0; i < Math.min(gabarito.length, total); i++) {
                const t = gabarito[i] || '—';
                const c = (i < bncc.length && bncc[i]) ? bncc[i] : '';
                gabHtml += `<div style="background:var(--bg2);border-radius:6px;padding:4px 6px;text-align:center;border:1px solid var(--border);">
                    <div style="font-size:8px;color:var(--text3);font-weight:700;">Q${i+1}</div>
                    <div style="font-weight:700;font-size:12px;color:var(--green);">${escapeHtml(t)}</div>
                    ${c ? `<div style="font-size:7px;color:var(--purple);margin-top:2px;">BNCC: ${escapeHtml(c)}</div>` : ''}
                </div>`;
            }
            gabHtml += '</div></div>';
        } else {
            gabHtml = '<div style="margin-top:12px;color:var(--text3);font-size:13px;">⚠️ Nenhum gabarito cadastrado.</div>';
        }
        conteudo.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                <div><strong>📝 Título</strong><br>${escapeHtml(prova.titulo || '—')}</div>
                <div><strong>📚 Disciplina</strong><br>${escapeHtml(prova.disciplina || '—')}</div>
                <div><strong>🎓 Série</strong><br>${escapeHtml(prova.serie || '—')}</div>
                <div><strong>📅 Data</strong><br>${escapeHtml(prova.data_prova || '—')}</div>
                <div><strong>📊 Bimestre</strong><br>${escapeHtml(prova.bimestre || '—')}</div>
                <div><strong>🔢 Questões</strong><br>${prova.quantidade_questoes || 20}</div>
            </div>${gabHtml}`;
        openM('m-visualizar-prova');
    } catch (erro) { showToast('❌ ' + erro.message, 'error'); }
}

function editarProvaDireto() {
    if (visualizarProvaId) { closeM('m-visualizar-prova'); editarGabarito(visualizarProvaId); }
    else showToast('❌ Nenhuma prova selecionada.', 'error');
}

async function salvarProva() {
    const titulo = document.getElementById('prova-titulo').value.trim();
    const serie = document.getElementById('prova-serie').value;
    const escolaId = document.getElementById('prova-escola')?.value;
    if (!titulo) { showToast('❌ Título obrigatório!', 'error'); return; }
    if (!serie) { showToast('❌ Série obrigatória!', 'error'); return; }
    if (!escolaId) { showToast('❌ Escola obrigatória!', 'error'); return; }
    const dados = {
        titulo, serie, escola_id: parseInt(escolaId),
        disciplina: document.getElementById('prova-disciplina').value || 'Matemática',
        bimestre: document.getElementById('prova-bimestre').value || '1º e 2º bimestre',
        data_prova: document.getElementById('prova-data').value || null,
        quantidade_questoes: parseInt(document.getElementById('prova-questoes').value) || 20,
        nota_maxima: parseFloat(document.getElementById('prova-nota').value) || 10,
        tipo_questoes: '4'
    };
    try {
        const response = await apiFetch(API_URL + '/api/provas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        const result = await processarRespostaAPI(response);
        if (result.ok && result.data.id) {
            showToast('✅ Prova salva!', 'success');
            limparCache();
            document.getElementById('prova-titulo').value = '';
            const upOk = document.getElementById('up-ok');
            if (upOk) { upOk.style.display = 'block'; setTimeout(() => upOk.style.display = 'none', 3000); }
            carregarProvas();
            tableFeedback.destacarLinha('tb-provas', result.data.id);
            carregarDashboard(); if (typeof carregarCombos === 'function') carregarCombos();
        } else showToast('❌ ' + (result.data.erro || 'Erro'), 'error');
    } catch (erro) { showToast('❌ ' + erro.message, 'error'); }
}

async function excluirProva(id, nome) {
    if (!confirm('Excluir a prova "' + nome + '"?')) return;
    try {
        const response = await apiFetch(API_URL + '/api/provas/' + id, { method: 'DELETE' });
        const result = await processarRespostaAPI(response);
        if (result.ok) {
            showToast('🗑️ Prova excluída', 'success');
            limparCache(); carregarProvas(); carregarDashboard();
            if (typeof carregarCombos === 'function') carregarCombos();
        } else showToast('❌ ' + (result.data.erro || 'Erro'), 'error');
    } catch (erro) { showToast('❌ ' + erro.message, 'error'); }
}

async function carregarProvasParaGabarito() {
    const s = document.getElementById('gab-prova'); if (!s) return;
    try {
        const provas = await carregarProvasComCache();
        s.innerHTML = '<option value="">Selecione...</option>' + provas.map(p => `<option value="${p.id}" data-disciplina="${escapeAttr(p.disciplina || '')}">${escapeHtml(p.titulo)} — ${escapeHtml(p.serie || '')} (${escapeHtml(p.disciplina || 'Sem disc.')})</option>`).join('');
    } catch (e) { console.error(e); }
}
async function carregarProvasParaTexto() {
    const s = document.getElementById('txt-prova'); if (!s) return;
    try {
        const provas = await carregarProvasComCache();
        s.innerHTML = '<option value="">Selecione...</option>' + provas.map(p => `<option value="${p.id}">${escapeHtml(p.titulo)} — ${escapeHtml(p.serie || '')}</option>`).join('');
    } catch (e) { console.error(e); }
}
async function carregarProvasParaFiltro() {
    try {
        const provas = await carregarProvasComCache();
        ['filtro-prova', 'rel-turma-prova'].forEach(id => {
            const s = document.getElementById(id);
            if (s) {
                const label = id === 'rel-turma-prova' ? 'Selecione a prova' : 'Todas as provas';
                s.innerHTML = `<option value="">${label}</option>` + provas.map(p => `<option value="${p.id}" data-disciplina="${escapeAttr(p.disciplina || '')}">${escapeHtml(p.titulo)}</option>`).join('');
            }
        });
    } catch (e) { console.error(e); }
}
async function carregarProvasParaDesempenho() {
    const s = document.getElementById('filtro-prova-desempenho'); if (!s) return;
    try {
        const provas = await carregarProvasComCache();
        s.innerHTML = '<option value="">Selecione a prova...</option>' + provas.map(p => `<option value="${p.id}" data-disciplina="${escapeAttr(p.disciplina || '')}">${escapeHtml(p.titulo)} — ${escapeHtml(p.serie || '')}</option>`).join('');
    } catch (e) { console.error(e); }
}