// alunos.js
async function carregarAlunos(escolaId = null) {
    try {
        const filtros = {};
        if (escolaId && escolaId !== '' && escolaId !== 'null') filtros.escola_id = escolaId;
        const selectTurma = document.getElementById('filtro-turma-alunos');
        if (selectTurma && selectTurma.value) filtros.turma_id = selectTurma.value;
        const selectSerie = document.getElementById('filtro-serie-alunos');
        if (selectSerie && selectSerie.value) filtros.serie = selectSerie.value;
        const alunos = await carregarAlunosComCache(filtros);
        const tbody = document.getElementById('tb-alunos');
        if (!tbody) return;
        if (!alunos || alunos.length === 0 || alunos.erro) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3);">Nenhum aluno</td></tr>';
            return;
        }
        const corMap = { '1º Ano': 'badge-purple', '2º Ano': 'badge-purple', '3º Ano': 'badge-blue', '4º Ano': 'badge-blue', '5º Ano': 'badge-blue', '6º Ano': 'badge-cyan', '7º Ano': 'badge-cyan', '8º Ano': 'badge-orange', '9º Ano': 'badge-orange' };
        tbody.innerHTML = alunos.slice(0, 500).map((a, i) => {
            return `<tr data-id="${a.id}" data-nome="${escapeAttr(a.nome)}">
                <td><span class="badge badge-blue">${String(a.numero_chamada || i + 1).padStart(2, '0')}</span></td>
                <td><span class="chip">${escapeHtml(a.matricula || '—')}</span></td>
                <td><strong>${escapeHtml(a.nome)}</strong></td>
                <td><span class="badge ${corMap[a.turma_serie] || 'badge-blue'}">${escapeHtml(a.turma_serie || '—')}</span></td>
                <td>${escapeHtml(a.turma_nome || '—')}</td>
                <td><span class="badge badge-gray">${escapeHtml(a.escola_nome || '—')}</span></td>
                <td><div class="btn-group">
                    <button class="btn btn-outline btn-sm" onclick="editarAluno(${a.id})">✏️</button>
                    <button class="btn-del" onclick="excluirAluno(${a.id}, '${escapeAttr(a.nome)}')">🗑️</button>
                </div></td>
            </tr>`;
        }).join('');
    } catch (erro) { console.error(erro); }
}

async function carregarEscolasFiltroAlunos() {
    try {
        const escolas = await carregarEscolasComCache();
        const select = document.getElementById('filtro-escola-alunos');
        if (select && escolas && !escolas.erro) {
            const current = select.value;
            select.innerHTML = '<option value="">Todas as escolas</option>';
            escolas.forEach(e => { const o = document.createElement('option'); o.value = e.id; o.textContent = e.nome; select.appendChild(o); });
            if (current) { select.value = current; carregarAlunos(current); }
        }
    } catch (erro) { console.error(erro); }
}

async function filtrarAlunosPorEscola(escolaId) {
    const selectTurma = document.getElementById('filtro-turma-alunos');
    if (selectTurma) {
        selectTurma.innerHTML = '<option value="">Todas as turmas</option>';
        if (escolaId) {
            const turmas = await carregarTurmasComCache(escolaId);
            if (turmas && !turmas.erro) {
                turmas.forEach(t => {
                    const o = document.createElement('option');
                    o.value = t.id; o.textContent = t.nome + ' - ' + (t.serie || '');
                    selectTurma.appendChild(o);
                });
            }
        }
    }
    carregarAlunos(escolaId);
}
function filtrarAlunosPorSerie(serie) {
    const escolaId = document.getElementById('filtro-escola-alunos')?.value || '';
    carregarAlunos(escolaId);
}

async function criarAlunoViaAPI(dados) {
    try {
        const response = await apiFetch(API_URL + '/api/alunos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        return await processarRespostaAPI(response);
    } catch (erro) { return { ok: false, data: { erro: erro.message }, status: 0 }; }
}

async function salvarAluno() {
    const nome = document.getElementById('aluno-nome')?.value.trim() || '';
    if (!nome) { showToast('❌ Nome obrigatório!', 'error'); return; }
    const escolaId = document.getElementById('aluno-escola')?.value;
    const turmaId = document.getElementById('aluno-turma')?.value;
    if (!escolaId || !turmaId) { showToast('❌ Escola e turma obrigatórias!', 'error'); return; }
    const num = parseInt(document.getElementById('aluno-numero')?.value || '');
    const dados = { nome, escola_id: parseInt(escolaId), turma_id: parseInt(turmaId), matricula: null, numero_chamada: Number.isFinite(num) && num > 0 ? num : null };
    try {
        const result = await criarAlunoViaAPI(dados);
        if (result.ok && result.data.id) {
            showToast('✅ Aluno salvo!', 'success');
            limparCache(); closeM('m-aluno');
            ['aluno-nome', 'aluno-numero'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            await carregarAlunos();
            tableFeedback.destacarLinha('tb-alunos', result.data.id);
            carregarDashboard(); if (typeof carregarCombos === 'function') carregarCombos();
        } else showToast('❌ ' + (result.data.erro || 'Erro'), 'error');
    } catch (erro) { showToast('❌ ' + erro.message, 'error'); }
}

function editarAluno(id) {
    apiFetch(API_URL + '/api/alunos/' + id).then(r => r.json()).then(aluno => {
        if (aluno.erro) { showToast('❌ ' + aluno.erro, 'error'); return; }
        document.getElementById('editar-aluno-id').value = aluno.id;
        document.getElementById('editar-aluno-nome').value = aluno.nome || '';
        document.getElementById('editar-aluno-numero').value = aluno.numero_chamada || '';
        carregarEscolasComCache().then(escolas => {
            const selectEscola = document.getElementById('editar-aluno-escola');
            selectEscola.innerHTML = '<option value="">Selecione</option>';
            if (escolas && !escolas.erro) {
                escolas.forEach(e => {
                    const o = document.createElement('option');
                    o.value = e.id; o.textContent = e.nome;
                    if (e.id == aluno.escola_id) o.selected = true;
                    selectEscola.appendChild(o);
                });
            }
            if (aluno.escola_id) {
                carregarTurmasPorEscolaParaAluno(aluno.escola_id, 'editar-aluno-turma').then(() => {
                    const selT = document.getElementById('editar-aluno-turma');
                    if (selT) selT.value = aluno.turma_id;
                });
            }
            openM('m-editar-aluno');
        });
    }).catch(e => showToast('❌ ' + e.message, 'error'));
}

async function salvarEdicaoAluno() {
    const id = document.getElementById('editar-aluno-id').value;
    const nome = document.getElementById('editar-aluno-nome').value.trim();
    const escolaId = document.getElementById('editar-aluno-escola').value;
    const turmaId = document.getElementById('editar-aluno-turma').value;
    if (!nome || !escolaId || !turmaId) { showToast('❌ Preencha tudo!', 'error'); return; }
    const num = parseInt(document.getElementById('editar-aluno-numero').value || '');
    const dados = { nome, escola_id: parseInt(escolaId), turma_id: parseInt(turmaId), matricula: null, numero_chamada: Number.isFinite(num) && num > 0 ? num : null };
    try {
        const response = await apiFetch(API_URL + '/api/alunos/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        const result = await processarRespostaAPI(response);
        if (result.ok) {
            showToast('✅ Atualizado!', 'success');
            limparCache(); closeM('m-editar-aluno'); carregarAlunos();
            if (typeof carregarCombos === 'function') carregarCombos();
        } else showToast('❌ ' + (result.data.erro || 'Erro'), 'error');
    } catch (erro) { showToast('❌ ' + erro.message, 'error'); }
}

async function excluirAluno(id, nome) {
    if (!confirm('Excluir o aluno "' + nome + '"?')) return;
    try {
        const response = await apiFetch(API_URL + '/api/alunos/' + id, { method: 'DELETE' });
        const result = await processarRespostaAPI(response);
        if (result.ok) {
            showToast('🗑️ Aluno excluído', 'success');
            limparCache(); carregarAlunos(); carregarDashboard();
            if (typeof carregarCombos === 'function') carregarCombos();
        } else showToast('❌ ' + (result.data.erro || 'Erro'), 'error');
    } catch (erro) { showToast('❌ ' + erro.message, 'error'); }
}

async function carregarTurmasPorEscolaParaAluno(escolaId, selectTurmaId) {
    const selectTurma = document.getElementById(selectTurmaId);
    if (!selectTurma) return;
    selectTurma.innerHTML = '<option value="">Selecione a turma</option>';
    if (!escolaId) return;
    try {
        const turmas = await carregarTurmasComCache(escolaId);
        if (turmas && !turmas.erro) {
            turmas.forEach(t => {
                const o = document.createElement('option');
                o.value = t.id; o.textContent = t.nome + ' - ' + (t.serie || '');
                o.dataset.serie = t.serie || '';
                selectTurma.appendChild(o);
            });
        }
    } catch (e) { console.error(e); }
}

async function processarListaAlunos() {
    const textarea = document.getElementById('multi-alunos-input');
    const linhas = textarea.value.split('\n').filter(l => l.trim() !== '');
    if (linhas.length === 0) { showToast('⚠️ Cole a lista!', 'warning'); return; }
    const escolaId = document.getElementById('aluno-escola')?.value;
    const turmaId = document.getElementById('aluno-turma')?.value;
    if (!escolaId || !turmaId) { showToast('⚠️ Selecione escola e turma!', 'warning'); return; }
    const statusDiv = document.getElementById('multi-status');
    const statusText = document.getElementById('multi-status-text');
    statusDiv.style.display = 'block';
    statusDiv.className = 'multi-status info';
    statusText.textContent = `⏳ Importando ${linhas.length} alunos...`;
    let adicionados = 0, erros = 0;
    for (const linha of linhas) {
        let nome = linha.trim(), matricula = null, numero = null;
        const m1 = linha.match(/^([^,]+),\s*([^,]+),?\s*(\d+)?/);
        const m2 = linha.match(/^([^-]+)\s*-\s*([^-]+)\s*(?:-\s*(\d+))?/);
        const m3 = linha.match(/^([^(]+)\s*\(([^)]+)\)/);
        if (m1) { nome = m1[1].trim(); matricula = m1[2].trim() || null; numero = m1[3] ? parseInt(m1[3]) : null; }
        else if (m2) { nome = m2[1].trim(); matricula = m2[2].trim() || null; numero = m2[3] ? parseInt(m2[3]) : null; }
        else if (m3) { nome = m3[1].trim(); matricula = m3[2].trim() || null; }
        if (!nome) { erros++; continue; }
        const result = await criarAlunoViaAPI({ nome, escola_id: parseInt(escolaId), turma_id: parseInt(turmaId), matricula, numero_chamada: (Number.isFinite(numero) && numero > 0) ? numero : null });
        if (result.ok && result.data.id) adicionados++; else erros++;
    }
    if (adicionados > 0) {
        statusDiv.className = 'multi-status success';
        statusText.textContent = `✅ ${adicionados} importados! ${erros > 0 ? `(${erros} erros)` : ''}`;
        textarea.value = '';
        limparCache(); await carregarAlunos(); carregarDashboard();
        if (typeof carregarCombos === 'function') carregarCombos();
    } else {
        statusDiv.className = 'multi-status error';
        statusText.textContent = '❌ Nenhum aluno importado.';
    }
    setTimeout(() => { statusDiv.style.display = 'none'; }, 6000);
}

async function carregarEscolasParaAluno() {
    try {
        const escolas = await carregarEscolasComCache();
        if (!escolas || escolas.length === 0 || escolas.erro) return;
        const sc = document.getElementById('aluno-escola');
        if (sc) {
            const c = sc.value;
            sc.innerHTML = '<option value="">Selecione a escola</option>';
            escolas.forEach(e => { const o = document.createElement('option'); o.value = e.id; o.textContent = e.nome; sc.appendChild(o); });
            if (c && escolas.some(e => e.id == c)) { sc.value = c; carregarTurmasPorEscolaParaAluno(c, 'aluno-turma'); }
            else { const st = document.getElementById('aluno-turma'); if (st) st.innerHTML = '<option value="">Selecione a turma</option>'; }
        }
        const se = document.getElementById('editar-aluno-escola');
        if (se) {
            const c = se.value;
            se.innerHTML = '<option value="">Selecione a escola</option>';
            escolas.forEach(e => { const o = document.createElement('option'); o.value = e.id; o.textContent = e.nome; se.appendChild(o); });
            if (c && escolas.some(e => e.id == c)) { se.value = c; carregarTurmasPorEscolaParaAluno(c, 'editar-aluno-turma'); }
        }
    } catch (e) { console.error(e); }
}

function imprimirAlunos() {
    const tb = document.getElementById('tb-alunos'); if (!tb) return;
    const rows = tb.querySelectorAll('tr');
    if (rows.length === 0 || (rows.length === 1 && rows[0].textContent.includes('Nenhum'))) { showToast('⚠️ Sem alunos', 'error'); return; }
    const es = document.getElementById('filtro-escola-alunos');
    const tu = document.getElementById('filtro-turma-alunos');
    const se = document.getElementById('filtro-serie-alunos');
    const en = es.options[es.selectedIndex]?.text || 'Todas';
    const tn = tu.options[tu.selectedIndex]?.text || 'Todas';
    const sn = se.options[se.selectedIndex]?.text || 'Todas';
    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Lista</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial;margin:30px;}h1{text-align:center;font-size:24px;margin-bottom:8px;}.filtros{text-align:center;color:#555;margin-bottom:20px;font-size:14px;}table{width:100%;border-collapse:collapse;font-size:12px;}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;}th{background:#f2f2f2;}tr:nth-child(even){background:#fafafa;}.footer{text-align:center;margin-top:20px;color:#999;font-size:12px;}</style></head><body><h1>📋 Lista de Alunos</h1><div class="filtros"><strong>Escola:</strong> ${escapeHtml(en)} | <strong>Turma:</strong> ${escapeHtml(tn)} | <strong>Série:</strong> ${escapeHtml(sn)}</div><table><thead><tr><th>Nº</th><th>Matrícula</th><th>Nome</th><th>Série</th><th>Turma</th><th>Escola</th></tr></thead><tbody>`;
    rows.forEach(r => {
        const c = r.querySelectorAll('td');
        if (c.length >= 6) html += `<tr><td>${escapeHtml(c[0].textContent.trim())}</td><td>${escapeHtml(c[1].textContent.trim())}</td><td>${escapeHtml(c[2].textContent.trim())}</td><td>${escapeHtml(c[3].textContent.trim())}</td><td>${escapeHtml(c[4].textContent.trim())}</td><td>${escapeHtml(c[5].textContent.trim())}</td></tr>`;
    });
    html += `</tbody></table><div class="footer">Gerado em ${new Date().toLocaleString('pt-BR')}</div></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { showToast('⚠️ Pop-up bloqueado!', 'error'); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
}