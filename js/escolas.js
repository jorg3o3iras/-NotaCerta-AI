// escolas.js
async function carregarEscolas() {
    try {
        const escolas = await carregarEscolasComCache(true);
        const tbody = document.getElementById('tb-escola');
        if (!tbody) return;
        if (!escolas || escolas.length === 0 || escolas.erro) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3);">Nenhuma escola cadastrada</td></tr>';
            return;
        }
        const turmas = await carregarTurmasComCache();
        const alunos = await carregarAlunosComCache();
        tbody.innerHTML = escolas.map((e, i) => {
            const turmasCount = turmas.filter(t => t.escola_id === e.id).length;
            const alunosCount = alunos.filter(a => a.escola_id === e.id).length;
            return `<tr data-id="${e.id}" data-nome="${escapeAttr(e.nome)}">
                <td><span class="badge badge-blue">${String(i+1).padStart(3,'0')}</span></td>
                <td><strong>${escapeHtml(e.nome)}</strong></td>
                <td>${escapeHtml(e.municipio || '—')}${e.estado ? ' — ' + escapeHtml(e.estado) : ''}</td>
                <td><span class="chip">${escapeHtml(e.inep || '—')}</span></td>
                <td>${escapeHtml(e.diretor || '—')}</td>
                <td>${turmasCount}</td>
                <td>${alunosCount}</td>
                <td><div class="btn-group">
                    <button class="btn btn-outline btn-sm" onclick="editarEscola(${e.id})">✏️</button>
                    <button class="btn-del" onclick="excluirEscola(${e.id}, '${escapeAttr(e.nome)}')">🗑️</button>
                </div></td>
            </tr>`;
        }).join('');
    } catch (erro) { console.error(erro); }
}

async function salvarEscola() {
    const nome = document.getElementById('escola-nome').value.trim();
    if (!nome) { showToast('❌ Nome obrigatório!', 'error'); return; }
    const dados = {
        nome,
        inep: document.getElementById('escola-inep').value.trim() || null,
        municipio: document.getElementById('escola-municipio').value.trim() || null,
        estado: document.getElementById('escola-estado').value || 'PA',
        telefone: document.getElementById('escola-telefone').value.trim() || null,
        diretor: document.getElementById('escola-diretor').value.trim() || null
    };
    try {
        const response = await apiFetch(API_URL + '/api/escolas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        const result = await processarRespostaAPI(response);
        if (result.ok && result.data.id) {
            showToast('✅ Escola salva!', 'success');
            limparCache(); closeM('m-escola'); await carregarEscolas();
            tableFeedback.destacarLinha('tb-escola', result.data.id);
            carregarDashboard(); if (typeof carregarCombos === 'function') carregarCombos();
        } else showToast('❌ ' + (result.data.erro || 'Erro'), 'error');
    } catch (erro) { showToast('❌ ' + erro.message, 'error'); }
}

function editarEscola(id) {
    apiFetch(API_URL + '/api/escolas/' + id).then(r => r.json()).then(escola => {
        if (escola.erro) { showToast('❌ ' + escola.erro, 'error'); return; }
        document.getElementById('editar-escola-id').value = escola.id;
        document.getElementById('editar-escola-nome').value = escola.nome || '';
        document.getElementById('editar-escola-inep').value = escola.inep || '';
        document.getElementById('editar-escola-municipio').value = escola.municipio || '';
        document.getElementById('editar-escola-estado').value = escola.estado || 'PA';
        document.getElementById('editar-escola-telefone').value = escola.telefone || '';
        document.getElementById('editar-escola-diretor').value = escola.diretor || '';
        openM('m-editar-escola');
    }).catch(e => showToast('❌ ' + e.message, 'error'));
}

async function salvarEdicaoEscola() {
    const id = document.getElementById('editar-escola-id').value;
    const nome = document.getElementById('editar-escola-nome').value.trim();
    if (!nome) { showToast('❌ Nome obrigatório!', 'error'); return; }
    const dados = {
        nome,
        inep: document.getElementById('editar-escola-inep').value.trim() || null,
        municipio: document.getElementById('editar-escola-municipio').value.trim() || null,
        estado: document.getElementById('editar-escola-estado').value || 'PA',
        telefone: document.getElementById('editar-escola-telefone').value.trim() || null,
        diretor: document.getElementById('editar-escola-diretor').value.trim() || null
    };
    try {
        const response = await apiFetch(API_URL + '/api/escolas/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        const result = await processarRespostaAPI(response);
        if (result.ok) {
            showToast('✅ Atualizada!', 'success');
            limparCache(); closeM('m-editar-escola'); carregarEscolas();
            tableFeedback.destacarLinha('tb-escola', id);
            if (typeof carregarCombos === 'function') carregarCombos();
        } else showToast('❌ ' + (result.data.erro || 'Erro'), 'error');
    } catch (erro) { showToast('❌ ' + erro.message, 'error'); }
}

async function excluirEscola(id, nome) {
    if (!confirm('🗑️ EXCLUIR a escola "' + nome + '"\n\nTodos os dados vinculados serão apagados.\n\nConfirmar?')) return;
    try {
        const response = await apiFetch(`${API_URL}/api/escolas/${id}`, { method: 'DELETE' });
        const result = await processarRespostaAPI(response);
        if (result.ok) {
            showToast(`✅ Escola "${nome}" excluída!`, 'success');
            limparCache();
            setTimeout(() => {
                carregarEscolas(); carregarTurmas(); carregarAlunos(); carregarProvas();
                carregarDashboard(); carregarGabaritos();
                if (typeof carregarCombos === 'function') carregarCombos();
                if (typeof carregarUltimasCorrecoes === 'function') carregarUltimasCorrecoes();
                if (typeof carregarUsuarios === 'function') carregarUsuarios();
                if (typeof carregarEscolasFiltroAlunos === 'function') carregarEscolasFiltroAlunos();
                if (typeof carregarEscolasCorrigir === 'function') carregarEscolasCorrigir();
                if (typeof carregarEscolasTexto === 'function') carregarEscolasTexto();
                if (typeof carregarEscolasParaCorrecaoManual === 'function') carregarEscolasParaCorrecaoManual();
                if (typeof carregarFiltrosRelTurma === 'function') carregarFiltrosRelTurma();
                if (typeof carregarFiltroEscolaTurmas === 'function') carregarFiltroEscolaTurmas();
            }, 800);
        } else showToast(`❌ ${result.data.erro || 'Erro'}`, 'error');
    } catch (erro) { showToast('❌ ' + erro.message, 'error'); }
}