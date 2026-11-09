// turmas.js
async function carregarTurmas() {
    try {
        const turmas = await carregarTurmasComCache(null, true);
        const tbody = document.getElementById('tb-turmas');
        if (!tbody) return;
        if (!turmas || turmas.length === 0 || turmas.erro) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3);">Nenhuma turma</td></tr>';
            return;
        }
        const corMap = { '1º Ano': 'badge-purple', '2º Ano': 'badge-purple', '3º Ano': 'badge-blue', '4º Ano': 'badge-blue', '5º Ano': 'badge-blue', '6º Ano': 'badge-cyan', '7º Ano': 'badge-cyan', '8º Ano': 'badge-orange', '9º Ano': 'badge-orange' };
        tbody.innerHTML = turmas.slice(0, 500).map((t, i) => {
            return `<tr data-id="${t.id}" data-nome="${escapeAttr(t.nome)}" data-serie="${escapeAttr(t.serie || '')}" data-escola="${t.escola_id || ''}">
                <td><span class="badge badge-gray">${String(i+1).padStart(2,'0')}</span></td>
                <td><strong>${escapeHtml(t.nome)}</strong></td>
                <td><span class="badge ${corMap[t.serie] || 'badge-blue'}">${escapeHtml(t.serie || '—')}</span></td>
                <td>${escapeHtml(t.turno || 'Manhã')}</td>
                <td>${escapeHtml(t.escola_nome || '—')}</td>
                <td>${escapeHtml(t.professor || '—')}</td>
                <td><span class="badge badge-blue">${t.total_alunos || 0}</span></td>
                <td><div class="btn-group">
                    <button class="btn btn-outline btn-sm" onclick="editarTurma(${t.id})">✏️</button>
                    <button class="btn btn-green btn-sm" onclick="verAlunosDaTurma(${t.id})">📋</button>
                    <button class="btn-del" onclick="excluirTurma(${t.id}, '${escapeAttr(t.nome)}')">🗑️</button>
                </div></td>
            </tr>`;
        }).join('');
    } catch (erro) { console.error(erro); }
}

async function carregarFiltroEscolaTurmas() {
    try {
        const escolas = await carregarEscolasComCache();
        const select = document.getElementById('filtro-escola-turmas');
        if (select && escolas && !escolas.erro) {
            const current = select.value;
            select.innerHTML = '<option value="">Todas as escolas</option>';
            escolas.forEach(e => { const o = document.createElement('option'); o.value = e.id; o.textContent = e.nome; select.appendChild(o); });
            if (current) select.value = current;
        }
    } catch (erro) { console.error(erro); }
}
function aplicarFiltrosTurmas() {
    const escolaId = document.getElementById('filtro-escola-turmas').value;
    const serie = document.getElementById('filtro-serie-turmas').value;
    document.querySelectorAll('#tb-turmas tr').forEach(row => {
        let mostrar = true;
        if (escolaId && row.dataset.escola !== escolaId) mostrar = false;
        if (serie && row.dataset.serie !== serie) mostrar = false;
        row.style.display = mostrar ? '' : 'none';
    });
}
function limparFiltrosTurmas() {
    document.getElementById('filtro-escola-turmas').value = '';
    document.getElementById('filtro-serie-turmas').value = '';
    document.querySelectorAll('#tb-turmas tr').forEach(row => row.style.display = '');
    showToast('✕ Filtros limpos', 'info');
}

async function salvarTurma() {
    const nome = document.getElementById('turma-nome').value.trim();
    const escolaId = document.getElementById('turma-escola').value;
    if (!nome || !escolaId) { showToast('❌ Nome e escola obrigatórios!', 'error'); return; }
    const dados = {
        nome, escola_id: parseInt(escolaId),
        serie: document.getElementById('turma-serie').value || '1º Ano',
        turno: document.getElementById('turma-turno').value || 'Manhã',
        ano_letivo: parseInt(document.getElementById('turma-ano').value) || 2025,
        capacidade: parseInt(document.getElementById('turma-capacidade').value) || 35,
        professor: document.getElementById('turma-professor').value.trim() || null
    };
    try {
        const response = await apiFetch(API_URL + '/api/turmas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        const result = await processarRespostaAPI(response);
        if (result.ok && result.data.id) {
            showToast('✅ Turma salva!', 'success');
            limparCache(); closeM('m-turma'); carregarTurmas();
            tableFeedback.destacarLinha('tb-turmas', result.data.id);
            carregarDashboard(); if (typeof carregarCombos === 'function') carregarCombos();
        } else showToast('❌ ' + (result.data.erro || 'Erro'), 'error');
    } catch (erro) { showToast('❌ ' + erro.message, 'error'); }
}

function editarTurma(id) {
    apiFetch(API_URL + '/api/turmas/' + id).then(r => r.json()).then(turma => {
        if (turma.erro) { showToast('❌ ' + turma.erro, 'error'); return; }
        document.getElementById('editar-turma-id').value = turma.id;
        document.getElementById('editar-turma-nome').value = turma.nome || '';
        document.getElementById('editar-turma-serie').value = turma.serie || '1º Ano';
        document.getElementById('editar-turma-turno').value = turma.turno || 'Manhã';
        document.getElementById('editar-turma-ano').value = turma.ano_letivo || 2025;
        document.getElementById('editar-turma-capacidade').value = turma.capacidade || 35;
        document.getElementById('editar-turma-professor').value = turma.professor || '';
        carregarEscolasComCache().then(escolas => {
            const select = document.getElementById('editar-turma-escola');
            select.innerHTML = '<option value="">Selecione</option>';
            if (escolas && !escolas.erro) {
                escolas.forEach(e => {
                    const o = document.createElement('option');
                    o.value = e.id; o.textContent = e.nome;
                    if (e.id == turma.escola_id) o.selected = true;
                    select.appendChild(o);
                });
            }
            openM('m-editar-turma');
        });
    }).catch(e => showToast('❌ ' + e.message, 'error'));
}

async function salvarEdicaoTurma() {
    const id = document.getElementById('editar-turma-id').value;
    const nome = document.getElementById('editar-turma-nome').value.trim();
    const escolaId = document.getElementById('editar-turma-escola').value;
    if (!nome || !escolaId) { showToast('❌ Nome e escola obrigatórios!', 'error'); return; }
    const dados = {
        nome, escola_id: parseInt(escolaId),
        serie: document.getElementById('editar-turma-serie').value || '1º Ano',
        turno: document.getElementById('editar-turma-turno').value || 'Manhã',
        ano_letivo: parseInt(document.getElementById('editar-turma-ano').value) || 2025,
        capacidade: parseInt(document.getElementById('editar-turma-capacidade').value) || 35,
        professor: document.getElementById('editar-turma-professor').value.trim() || null
    };
    try {
        const response = await apiFetch(API_URL + '/api/turmas/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        const result = await processarRespostaAPI(response);
        if (result.ok) {
            showToast('✅ Atualizada!', 'success');
            limparCache(); closeM('m-editar-turma'); carregarTurmas();
            if (typeof carregarCombos === 'function') carregarCombos();
        } else showToast('❌ ' + (result.data.erro || 'Erro'), 'error');
    } catch (erro) { showToast('❌ ' + erro.message, 'error'); }
}

async function excluirTurma(id, nome) {
    if (!confirm('Excluir a turma "' + nome + '"?')) return;
    try {
        const response = await apiFetch(API_URL + '/api/turmas/' + id, { method: 'DELETE' });
        const result = await processarRespostaAPI(response);
        if (result.ok) {
            showToast('🗑️ Turma excluída', 'success');
            limparCache(); carregarTurmas(); carregarDashboard();
            if (typeof carregarCombos === 'function') carregarCombos();
        } else showToast('❌ ' + (result.data.erro || 'Erro'), 'error');
    } catch (erro) { showToast('❌ ' + erro.message, 'error'); }
}

function verAlunosDaTurma(id) {
    const selectTurma = document.getElementById('filtro-turma-alunos');
    if (selectTurma) { selectTurma.value = id; selectTurma.dispatchEvent(new Event('change')); }
    go('alunos');
}