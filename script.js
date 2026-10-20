// ============================================================
// SCRIPT.JS — MONOLÍTICO (Parte 1/2)
// Assume core.js + auth-nav.js carregados ANTES
// Provas agora são POR ESCOLA
// ============================================================

// ═══ CORRIGIR (tela IA) — combos ═══
async function carregarEscolasCorrigir() {
    try {
        const escolas = await carregarEscolasComCache();
        const select = document.getElementById('corrigir-escola');
        if (select && escolas && !escolas.erro) {
            const current = select.value;
            select.innerHTML = '<option value="">Selecione a escola...</option>';
            escolas.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.id; opt.textContent = e.nome;
                select.appendChild(opt);
            });
            if (current) { select.value = current; carregarTurmasPorEscolaCorrigir(current); }
        }
    } catch (erro) { console.error(erro); }
}

async function carregarTurmasPorEscolaCorrigir(escolaId) {
    const selectTurma = document.getElementById('corrigir-turma');
    const selectProva = document.getElementById('corrigir-prova');
    const selectAluno = document.getElementById('corrigir-aluno');
    if (!selectTurma) return;
    selectTurma.innerHTML = '<option value="">Selecione a turma...</option>';
    if (selectProva) selectProva.innerHTML = '<option value="">Selecione...</option>';
    if (selectAluno) selectAluno.innerHTML = '<option value="">Selecione...</option>';
    if (!escolaId) return;
    try {
        const turmas = await carregarTurmasComCache(escolaId);
        if (turmas && !turmas.erro) {
            turmas.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.nome + ' - ' + (t.serie || '');
                opt.dataset.serie = t.serie || '';
                selectTurma.appendChild(opt);
            });
        }
    } catch (e) { console.error(e); }
}

async function carregarAlunosPorTurmaCorrigir(turmaId) {
    const selectAluno = document.getElementById('corrigir-aluno');
    if (!selectAluno) return;
    selectAluno.innerHTML = '<option value="">Selecione...</option>';
    if (!turmaId) return;
    try {
        const alunos = await carregarAlunosComCache({ turma_id: turmaId });
        if (alunos && !alunos.erro) {
            alunos.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.id;
                opt.textContent = a.nome + ' (Nº ' + (a.numero_chamada || '—') + ')';
                selectAluno.appendChild(opt);
            });
        }
    } catch (e) { console.error(e); }
}

async function carregarProvasPorTurmaCorrigir(turmaId) {
    const selectProva = document.getElementById('corrigir-prova');
    if (!selectProva) return;
    selectProva.innerHTML = '<option value="">Selecione...</option>';
    if (!turmaId) return;
    try {
        const turmas = await carregarTurmasComCache();
        const turmaData = turmas.find(t => t.id == turmaId);
        const escolaIdTurma = turmaData?.escola_id || null;
        const provas = await carregarProvasComCache(false, escolaIdTurma);
        if (provas && !provas.erro) {
            let lista = provas;
            if (turmaData && turmaData.serie) {
                const filtradas = provas.filter(p => p.serie === turmaData.serie);
                if (filtradas.length > 0) lista = filtradas;
            }
            lista.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                const serie = p.serie || 'Série não definida';
                opt.textContent = p.titulo + ' - ' + serie + ' - ' + (p.disciplina || '');
                opt.dataset.serie = serie;
                opt.dataset.quantidade = p.quantidade_questoes || 20;
                opt.dataset.gabarito = JSON.stringify(p.gabarito || []);
                opt.dataset.tipo = p.tipo_questoes || '4';
                opt.dataset.disciplina = p.disciplina || '';
                opt.dataset.bncc = JSON.stringify(p.bncc || []);
                selectProva.appendChild(opt);
            });
        }
    } catch (e) { console.error(e); }
}

async function carregarAlunosPorProvaFiltrados(provaId) {
    const selectAluno = document.getElementById('corrigir-aluno');
    if (!selectAluno) return;
    selectAluno.innerHTML = '<option value="">Selecione...</option>';
    if (!provaId) return;
    try {
        const provaResp = await apiFetch(`${API_URL}/api/provas/${provaId}`);
        const prova = await provaResp.json();
        if (!prova || prova.erro) { showToast('❌ Erro ao carregar prova', 'error'); return; }
        const turmaId = document.getElementById('corrigir-turma').value;
        if (!turmaId) {
            const alunos = await carregarAlunosComCache({ serie: prova.serie || '' });
            if (alunos && !alunos.erro) {
                alunos.forEach(a => {
                    const opt = document.createElement('option');
                    opt.value = a.id;
                    const turmaInfo = a.turma_nome ? ' - ' + a.turma_nome : '';
                    opt.textContent = a.nome + ' (Nº ' + (a.numero_chamada || '—') + ')' + turmaInfo;
                    selectAluno.appendChild(opt);
                });
            }
            return;
        }
        const alunos = await carregarAlunosComCache({ turma_id: turmaId });
        if (alunos && !alunos.erro) {
            alunos.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.id;
                opt.textContent = a.nome + ' (Nº ' + (a.numero_chamada || '—') + ')';
                selectAluno.appendChild(opt);
            });
        }
    } catch (e) { console.error(e); }
}

// ═══ ESCOLAS ═══
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
                    <button class="btn btn-outline btn-sm" onclick="editarEscola(${e.id})">✏️ Editar</button>
                    <button class="btn-del" onclick="excluirEscola(${e.id}, '${escapeAttr(e.nome)}')" title="Excluir">🗑️</button>
                </div></td>
            </tr>`;
        }).join('');
    } catch (erro) { console.error(erro); }
}

async function salvarEscola() {
    const nome = document.getElementById('escola-nome').value.trim();
    if (!nome) { showToast('❌ Nome da escola é obrigatório!', 'error'); return; }
    const dados = {
        nome,
        inep: document.getElementById('escola-inep').value.trim() || null,
        municipio: document.getElementById('escola-municipio').value.trim() || null,
        estado: document.getElementById('escola-estado').value || 'PA',
        telefone: document.getElementById('escola-telefone').value.trim() || null,
        diretor: document.getElementById('escola-diretor').value.trim() || null
    };
    try {
        const btn = document.querySelector('#m-escola .btn-green');
        const orig = btn.textContent; btn.textContent = '⏳ Salvando...'; btn.disabled = true;
        showToast('💾 Salvando escola...', 'info');
        const response = await apiFetch(API_URL + '/api/escolas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        const result = await processarRespostaAPI(response);
        btn.textContent = orig; btn.disabled = false;
        if (result.ok && result.data.id) {
            showToast('✅ Escola "' + nome + '" salva!', 'success');
            limparCache(); closeM('m-escola'); await carregarEscolas();
            setTimeout(() => tableFeedback.destacarLinha('tb-escola', result.data.id, '✅ Nova!'), 300);
            carregarDashboard(); carregarCombos();
        } else showToast('❌ Erro: ' + (result.data.erro || 'Desconhecido'), 'error');
    } catch (erro) {
        showToast('❌ Erro: ' + erro.message, 'error');
        const btn = document.querySelector('#m-escola .btn-green');
        if (btn) { btn.textContent = '💾 Salvar'; btn.disabled = false; }
    }
}

function editarEscola(id) {
    showToast('✏️ Carregando...', 'info');
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
    }).catch(e => showToast('❌ Erro: ' + e.message, 'error'));
}

async function salvarEdicaoEscola() {
    const id = document.getElementById('editar-escola-id').value;
    const nome = document.getElementById('editar-escola-nome').value.trim();
    if (!nome) { showToast('❌ Nome é obrigatório!', 'error'); return; }
    const dados = {
        nome,
        inep: document.getElementById('editar-escola-inep').value.trim() || null,
        municipio: document.getElementById('editar-escola-municipio').value.trim() || null,
        estado: document.getElementById('editar-escola-estado').value || 'PA',
        telefone: document.getElementById('editar-escola-telefone').value.trim() || null,
        diretor: document.getElementById('editar-escola-diretor').value.trim() || null
    };
    try {
        const btn = document.querySelector('#m-editar-escola .btn-primary');
        const orig = btn.textContent; btn.textContent = '⏳ Salvando...'; btn.disabled = true;
        showToast('💾 Atualizando...', 'info');
        const response = await apiFetch(API_URL + '/api/escolas/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        const result = await processarRespostaAPI(response);
        btn.textContent = orig; btn.disabled = false;
        if (result.ok) {
            showToast('✅ Escola atualizada!', 'success');
            limparCache(); closeM('m-editar-escola'); carregarEscolas();
            setTimeout(() => tableFeedback.destacarLinha('tb-escola', id, '✅ Atualizada!'), 300);
            carregarCombos();
        } else showToast('❌ Erro: ' + (result.data.erro || 'Desconhecido'), 'error');
    } catch (erro) { showToast('❌ Erro: ' + erro.message, 'error'); }
}

async function excluirEscola(id, nome) {
    if (!confirm('🗑️ EXCLUIR a escola "' + nome + '"\n\nIsso excluirá TODOS os dados vinculados:\n• Turmas\n• Alunos\n• Provas\n\nNÃO pode ser desfeito!')) return;
    try {
        showToast('⏳ Excluindo escola...', 'info');
        const response = await apiFetch(`${API_URL}/api/escolas/${id}`, { method: 'DELETE' });
        const result = await processarRespostaAPI(response);
        if (result.ok) {
            showToast(`✅ Escola "${nome}" excluída!`, 'success');
            limparCache();
            setTimeout(() => {
                carregarEscolas(); carregarTurmas(); carregarAlunos(); carregarProvas();
                carregarDashboard(); carregarGabaritos(); carregarCombos(); carregarUltimasCorrecoes();
                carregarUsuarios(); carregarEscolasFiltroAlunos(); carregarEscolasCorrigir();
                carregarEscolasTexto(); carregarEscolasParaCorrecaoManual();
                carregarFiltrosRelTurma(); carregarFiltroEscolaTurmas();
            }, 800);
        } else showToast(`❌ Erro: ${result.data.erro || 'Desconhecido'}`, 'error');
    } catch (erro) { showToast('❌ Erro: ' + erro.message, 'error'); }
}

// ═══ TURMAS ═══
async function carregarTurmas() {
    try {
        const turmas = await carregarTurmasComCache(null, true);
        const tbody = document.getElementById('tb-turmas');
        if (!tbody) return;
        if (!turmas || turmas.length === 0 || turmas.erro) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3);">Nenhuma turma cadastrada</td></tr>';
            return;
        }
        const corMap = { '1º Ano': 'badge-purple', '2º Ano': 'badge-purple', '3º Ano': 'badge-blue', '4º Ano': 'badge-blue', '5º Ano': 'badge-blue', '6º Ano': 'badge-cyan', '7º Ano': 'badge-cyan', '8º Ano': 'badge-orange', '9º Ano': 'badge-orange' };
        tbody.innerHTML = turmas.slice(0, 500).map((t, i) => {
            const totalAlunos = t.total_alunos || 0;
            return `<tr data-id="${t.id}" data-nome="${escapeAttr(t.nome)}" data-serie="${escapeAttr(t.serie || '')}" data-escola="${t.escola_id || ''}">
                <td><span class="badge badge-gray">${String(i+1).padStart(2,'0')}</span></td>
                <td><strong>${escapeHtml(t.nome)}</strong></td>
                <td><span class="badge ${corMap[t.serie] || 'badge-blue'}">${escapeHtml(t.serie || '—')}</span></td>
                <td>${escapeHtml(t.turno || 'Manhã')}</td>
                <td>${escapeHtml(t.escola_nome || '—')}</td>
                <td>${escapeHtml(t.professor || '—')}</td>
                <td><span class="badge badge-blue">${totalAlunos}</span></td>
                <td><div class="btn-group">
                    <button class="btn btn-outline btn-sm" onclick="editarTurma(${t.id})">✏️</button>
                    <button class="btn btn-green btn-sm" onclick="verAlunosDaTurma(${t.id})" title="Lista de Alunos">📋</button>
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
            escolas.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.id; opt.textContent = e.nome;
                select.appendChild(opt);
            });
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
    showToast('✕ Filtros limpos!', 'info');
}

async function salvarTurma() {
    const nome = document.getElementById('turma-nome').value.trim();
    const escolaId = document.getElementById('turma-escola').value;
    if (!nome) { showToast('❌ Nome obrigatório!', 'error'); return; }
    if (!escolaId) { showToast('❌ Selecione a escola!', 'error'); return; }
    const dados = {
        nome, escola_id: parseInt(escolaId),
        serie: document.getElementById('turma-serie').value || '1º Ano',
        turno: document.getElementById('turma-turno').value || 'Manhã',
        ano_letivo: parseInt(document.getElementById('turma-ano').value) || 2025,
        capacidade: parseInt(document.getElementById('turma-capacidade').value) || 35,
        professor: document.getElementById('turma-professor').value.trim() || null
    };
    try {
        const btn = document.querySelector('#m-turma .btn-green');
        const orig = btn.textContent; btn.textContent = '⏳ Salvando...'; btn.disabled = true;
        showToast('💾 Salvando turma...', 'info');
        const response = await apiFetch(API_URL + '/api/turmas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        const result = await processarRespostaAPI(response);
        btn.textContent = orig; btn.disabled = false;
        if (result.ok && result.data.id) {
            showToast('✅ Turma "' + nome + '" salva!', 'success');
            limparCache(); closeM('m-turma'); carregarTurmas();
            setTimeout(() => tableFeedback.destacarLinha('tb-turmas', result.data.id, '✅ Nova!'), 300);
            carregarDashboard(); carregarCombos();
        } else showToast('❌ Erro: ' + (result.data.erro || 'Desconhecido'), 'error');
    } catch (erro) {
        showToast('❌ Erro: ' + erro.message, 'error');
        const btn = document.querySelector('#m-turma .btn-green');
        if (btn) { btn.textContent = '💾 Salvar'; btn.disabled = false; }
    }
}

function editarTurma(id) {
    showToast('✏️ Carregando...', 'info');
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
                    const opt = document.createElement('option');
                    opt.value = e.id; opt.textContent = e.nome;
                    if (e.id == turma.escola_id) opt.selected = true;
                    select.appendChild(opt);
                });
            }
            openM('m-editar-turma');
        });
    }).catch(e => showToast('❌ Erro: ' + e.message, 'error'));
}

async function salvarEdicaoTurma() {
    const id = document.getElementById('editar-turma-id').value;
    const nome = document.getElementById('editar-turma-nome').value.trim();
    const escolaId = document.getElementById('editar-turma-escola').value;
    if (!nome) { showToast('❌ Nome obrigatório!', 'error'); return; }
    if (!escolaId) { showToast('❌ Selecione a escola!', 'error'); return; }
    const dados = {
        nome, escola_id: parseInt(escolaId),
        serie: document.getElementById('editar-turma-serie').value || '1º Ano',
        turno: document.getElementById('editar-turma-turno').value || 'Manhã',
        ano_letivo: parseInt(document.getElementById('editar-turma-ano').value) || 2025,
        capacidade: parseInt(document.getElementById('editar-turma-capacidade').value) || 35,
        professor: document.getElementById('editar-turma-professor').value.trim() || null
    };
    try {
        showToast('💾 Atualizando...', 'info');
        const response = await apiFetch(API_URL + '/api/turmas/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        const result = await processarRespostaAPI(response);
        if (result.ok) {
            showToast('✅ Turma atualizada!', 'success');
            limparCache(); closeM('m-editar-turma'); carregarTurmas(); carregarCombos();
        } else showToast('❌ Erro: ' + (result.data.erro || 'Desconhecido'), 'error');
    } catch (erro) { showToast('❌ Erro: ' + erro.message, 'error'); }
}

async function excluirTurma(id, nome) {
    if (!confirm('Excluir a turma "' + nome + '"?')) return;
    try {
        showToast('🗑️ Excluindo...', 'error');
        const response = await apiFetch(API_URL + '/api/turmas/' + id, { method: 'DELETE' });
        const result = await processarRespostaAPI(response);
        if (result.ok) {
            showToast('🗑️ Turma excluída!', 'success');
            limparCache(); carregarTurmas(); carregarDashboard(); carregarCombos();
        } else showToast('❌ Erro: ' + (result.data.erro || 'Desconhecido'), 'error');
    } catch (erro) { showToast('❌ Erro: ' + erro.message, 'error'); }
}

function verAlunosDaTurma(id) {
    const selectTurma = document.getElementById('filtro-turma-alunos');
    if (selectTurma) { selectTurma.value = id; selectTurma.dispatchEvent(new Event('change')); }
    go('alunos');
}

// ═══ ALUNOS ═══
async function carregarAlunos(escolaId = null) {
    try {
        const filtros = {};
        if (escolaId && escolaId !== '' && escolaId !== 'null' && escolaId !== 'undefined') filtros.escola_id = escolaId;
        const selectTurma = document.getElementById('filtro-turma-alunos');
        if (selectTurma && selectTurma.value && selectTurma.value !== '') filtros.turma_id = selectTurma.value;
        const selectSerie = document.getElementById('filtro-serie-alunos');
        if (selectSerie && selectSerie.value && selectSerie.value !== '') filtros.serie = selectSerie.value;
        const alunos = await carregarAlunosComCache(filtros);
        const tbody = document.getElementById('tb-alunos');
        if (!tbody) return;
        if (!alunos || alunos.length === 0 || alunos.erro) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3);">Nenhum aluno encontrado</td></tr>';
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
            escolas.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.id; opt.textContent = e.nome;
                select.appendChild(opt);
            });
            if (current) { select.value = current; carregarAlunos(current); }
        }
    } catch (erro) { console.error(erro); }
}

async function filtrarAlunosPorEscola(escolaId) {
    const selectTurma = document.getElementById('filtro-turma-alunos');
    if (selectTurma) {
        selectTurma.innerHTML = '<option value="">Todas as turmas</option>';
        if (escolaId && escolaId !== '') {
            const turmas = await carregarTurmasComCache(escolaId);
            if (turmas && !turmas.erro) {
                turmas.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.id;
                    opt.textContent = t.nome + ' - ' + (t.serie || '');
                    selectTurma.appendChild(opt);
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
    if (!escolaId) { showToast('❌ Selecione escola!', 'error'); return; }
    const turmaId = document.getElementById('aluno-turma')?.value;
    if (!turmaId) { showToast('❌ Selecione turma!', 'error'); return; }
    const num = parseInt(document.getElementById('aluno-numero')?.value || '');
    const dados = { nome, escola_id: parseInt(escolaId), turma_id: parseInt(turmaId), matricula: null, numero_chamada: Number.isFinite(num) && num > 0 ? num : null };
    try {
        showToast('💾 Salvando aluno...', 'info');
        const result = await criarAlunoViaAPI(dados);
        if (result.ok && result.data.id) {
            showToast('✅ Aluno "' + nome + '" salvo!', 'success');
            limparCache(); closeM('m-aluno');
            ['aluno-nome', 'aluno-numero'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            await carregarAlunos();
            setTimeout(() => tableFeedback.destacarLinha('tb-alunos', result.data.id, '✅ Novo!'), 300);
            carregarDashboard(); carregarCombos();
        } else showToast('❌ Erro: ' + (result.data.erro || 'Desconhecido'), 'error');
    } catch (erro) { showToast('❌ Erro: ' + erro.message, 'error'); }
}

function editarAluno(id) {
    showToast('✏️ Carregando...', 'info');
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
                    const opt = document.createElement('option');
                    opt.value = e.id; opt.textContent = e.nome;
                    if (e.id == aluno.escola_id) opt.selected = true;
                    selectEscola.appendChild(opt);
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
    }).catch(e => showToast('❌ Erro: ' + e.message, 'error'));
}

async function salvarEdicaoAluno() {
    const id = document.getElementById('editar-aluno-id').value;
    const nome = document.getElementById('editar-aluno-nome').value.trim();
    if (!nome) { showToast('❌ Nome obrigatório!', 'error'); return; }
    const escolaId = document.getElementById('editar-aluno-escola').value;
    const turmaId = document.getElementById('editar-aluno-turma').value;
    if (!escolaId) { showToast('❌ Selecione escola!', 'error'); return; }
    if (!turmaId) { showToast('❌ Selecione turma!', 'error'); return; }
    const num = parseInt(document.getElementById('editar-aluno-numero').value || '');
    const dados = { nome, escola_id: parseInt(escolaId), turma_id: parseInt(turmaId), matricula: null, numero_chamada: Number.isFinite(num) && num > 0 ? num : null };
    try {
        showToast('💾 Atualizando...', 'info');
        const response = await apiFetch(API_URL + '/api/alunos/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        const result = await processarRespostaAPI(response);
        if (result.ok) {
            showToast('✅ Aluno atualizado!', 'success');
            limparCache(); closeM('m-editar-aluno'); carregarAlunos(); carregarCombos();
        } else showToast('❌ Erro: ' + (result.data.erro || 'Desconhecido'), 'error');
    } catch (erro) { showToast('❌ Erro: ' + erro.message, 'error'); }
}

async function excluirAluno(id, nome) {
    if (!confirm('Excluir o aluno "' + nome + '"?')) return;
    try {
        showToast('🗑️ Excluindo...', 'error');
        const response = await apiFetch(API_URL + '/api/alunos/' + id, { method: 'DELETE' });
        const result = await processarRespostaAPI(response);
        if (result.ok) {
            showToast('🗑️ Aluno excluído!', 'success');
            limparCache(); carregarAlunos(); carregarDashboard(); carregarCombos();
        } else showToast('❌ Erro: ' + (result.data.erro || 'Desconhecido'), 'error');
    } catch (erro) { showToast('❌ Erro: ' + erro.message, 'error'); }
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
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.nome + ' - ' + (t.serie || '');
                opt.dataset.serie = t.serie || '';
                selectTurma.appendChild(opt);
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
        limparCache(); await carregarAlunos(); carregarDashboard(); carregarCombos();
    } else {
        statusDiv.className = 'multi-status error';
        statusText.textContent = '❌ Nenhum aluno importado.';
    }
    setTimeout(() => { statusDiv.style.display = 'none'; }, 6000);
}

// ═══ PROVAS (por escola) ═══
async function carregarProvas() {
    try {
        const provas = await carregarProvasComCache(true);
        const tbody = document.getElementById('tb-provas');
        if (!tbody) return;
        if (!provas || provas.length === 0 || provas.erro) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3);">Nenhuma prova cadastrada</td></tr>';
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
    showToast('👁️ Carregando prova...', 'info');
    try {
        const response = await apiFetch(`${API_URL}/api/provas/${id}`);
        const prova = await response.json();
        if (!prova || prova.erro) { showToast('❌ Erro: ' + (prova.erro || 'Desconhecido'), 'error'); return; }
        visualizarProvaId = id;
        visualizarProvaData = prova;
        const conteudo = document.getElementById('visualizar-prova-conteudo');
        if (!conteudo) return;
        const gabarito = prova.gabarito || [];
        const bncc = prova.bncc || [];
        const total = prova.quantidade_questoes || 20;
        const isProducao = (prova.disciplina === 'Produção de Texto');
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
            </div>${gabHtml}
        `;
        openM('m-visualizar-prova');
    } catch (erro) { showToast('❌ Erro: ' + erro.message, 'error'); }
}

function editarProvaDireto() {
    if (visualizarProvaId) { closeM('m-visualizar-prova'); editarGabarito(visualizarProvaId); }
    else showToast('❌ Nenhuma prova selecionada.', 'error');
}

async function salvarProva() {
    const titulo = document.getElementById('prova-titulo').value.trim();
    if (!titulo) { showToast('❌ Título obrigatório!', 'error'); return; }
    const serie = document.getElementById('prova-serie').value;
    if (!serie) { showToast('❌ Selecione a série!', 'error'); return; }
    const escolaId = document.getElementById('prova-escola')?.value;
    if (!escolaId) { showToast('❌ Selecione a escola!', 'error'); return; }
    const dados = {
        titulo, serie,
        escola_id: parseInt(escolaId),
        disciplina: document.getElementById('prova-disciplina').value || 'Matemática',
        bimestre: document.getElementById('prova-bimestre').value || '1º e 2º bimestre',
        data_prova: document.getElementById('prova-data').value || null,
        quantidade_questoes: parseInt(document.getElementById('prova-questoes').value) || 20,
        nota_maxima: parseFloat(document.getElementById('prova-nota').value) || 10,
        tipo_questoes: '4'
    };
    try {
        const btn = document.querySelector('#page-prova-upload .btn-green');
        const orig = btn.textContent; btn.textContent = '⏳ Salvando...'; btn.disabled = true;
        showToast('💾 Salvando prova...', 'info');
        const response = await apiFetch(API_URL + '/api/provas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        const result = await processarRespostaAPI(response);
        btn.textContent = orig; btn.disabled = false;
        if (result.ok && result.data.id) {
            showToast('✅ Prova "' + titulo + '" salva!', 'success');
            limparCache();
            document.getElementById('prova-titulo').value = '';
            const upOk = document.getElementById('up-ok');
            if (upOk) { upOk.style.display = 'block'; setTimeout(() => { upOk.style.display = 'none'; }, 3000); }
            carregarProvas();
            setTimeout(() => tableFeedback.destacarLinha('tb-provas', result.data.id, '✅ Nova!'), 300);
            carregarDashboard(); carregarCombos();
        } else showToast('❌ Erro: ' + (result.data.erro || 'Desconhecido'), 'error');
    } catch (erro) {
        showToast('❌ Erro: ' + erro.message, 'error');
        const btn = document.querySelector('#page-prova-upload .btn-green');
        if (btn) { btn.textContent = '💾 Salvar'; btn.disabled = false; }
    }
}

async function excluirProva(id, nome) {
    if (!confirm('Excluir a prova "' + nome + '"?')) return;
    try {
        showToast('🗑️ Excluindo...', 'error');
        const response = await apiFetch(API_URL + '/api/provas/' + id, { method: 'DELETE' });
        const result = await processarRespostaAPI(response);
        if (result.ok) {
            showToast('🗑️ Prova excluída!', 'success');
            limparCache(); carregarProvas(); carregarDashboard(); carregarCombos();
        } else showToast('❌ Erro: ' + (result.data.erro || 'Desconhecido'), 'error');
    } catch (erro) { showToast('❌ Erro: ' + erro.message, 'error'); }
}

function salvarProvaModal() {
    const titulo = document.getElementById('modal-prova-titulo').value.trim();
    if (!titulo) { showToast('❌ Título obrigatório!', 'error'); return; }
    showToast('✅ Prova salva!', 'success');
    closeM('m-prova');
    carregarProvas();
}

// ═══ DASHBOARD ═══
async function carregarDashboard() {
    try {
        const response = await apiFetch(`${API_URL}/api/dashboard`);
        const dados = await response.json();
        setText('totalEscolas', dados.total_escolas || 0);
        setText('totalTurmas', dados.total_turmas || 0);
        setText('totalAlunos', dados.total_alunos || 0);
        setText('totalProvas', dados.total_provas || 0);
    } catch (erro) { console.error(erro); }
}

async function carregarUltimasCorrecoes() {
    try {
        const response = await apiFetch(API_URL + '/api/historico?limit=10');
        const historico = await response.json();
        const tbody = document.getElementById('ultimas-correcoes');
        if (!tbody) return;
        if (!historico || historico.length === 0 || historico.erro) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text3);">Nenhuma correção recente</td></tr>';
        } else {
            tbody.innerHTML = historico.slice(0, 10).map(item => {
                const acertos = item.acertos || 0;
                const total = item.total || 20;
                const pct = total > 0 ? Math.round((acertos / total) * 100) : 0;
                const conceito = calcularConceito(pct);
                const badgeMap = { 'inicial': 'badge-conceito-inicial', 'basico': 'badge-conceito-basico', 'proficiente': 'badge-conceito-proficiente', 'avancado': 'badge-conceito-avancado' };
                const labelMap = { 'inicial': '🔴 Inicial', 'basico': '🟠 Básico', 'proficiente': '🔵 Proficiente', 'avancado': '🟢 Avançado' };
                return `<tr><td><strong>${escapeHtml(item.aluno_nome || 'Aluno')}</strong></td><td>${escapeHtml(item.prova_titulo || 'Prova')}</td><td><strong>${pct}%</strong></td><td><span class="badge ${badgeMap[conceito] || 'badge-gray'}">${labelMap[conceito] || 'Indefinido'}</span></td></tr>`;
            }).join('');
        }
    } catch (erro) { console.error(erro); }
}

// ═══ GABARITOS ═══
async function carregarGabaritos() {
    try {
        const provas = await carregarProvasComCache();
        const tbody = document.getElementById('tb-gabaritos');
        if (!tbody) return;
        const comGabarito = provas.filter(p => p.gabarito && p.gabarito.length > 0);
        if (!comGabarito || comGabarito.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3);">Nenhum gabarito cadastrado</td></tr>';
            return;
        }
        tbody.innerHTML = comGabarito.map((p, i) => {
            let bnccText = '—';
            if (p.bncc && p.bncc.length > 0) {
                const codigos = p.bncc.filter(c => c && c.trim() !== '');
                if (codigos.length > 0) bnccText = codigos.join(', ');
            }
            const tipoTexto = p.disciplina === 'Produção de Texto' ? 'Texto' : (p.tipo_questoes == '3' ? 'A, B, C' : 'A, B, C, D');
            return `<tr data-id="${p.id}" data-nome="${escapeAttr(p.titulo)}">
                <td><span class="badge badge-blue">${String(i+1).padStart(3,'0')}</span></td>
                <td>${escapeHtml(p.titulo)}</td>
                <td><span class="badge badge-purple">${escapeHtml(p.serie || '—')}</span></td>
                <td>${(p.quantidade_questoes || (p.gabarito ? p.gabarito.length : 0) || 0)}</td>
                <td><span class="badge ${tipoTexto === 'Texto' ? 'badge-purple' : (p.tipo_questoes == '3' ? 'badge-purple' : 'badge-blue')}">${tipoTexto}</span></td>
                <td style="font-size:9px;max-width:120px;word-wrap:break-word;">${escapeHtml(bnccText)}</td>
                <td>${escapeHtml(p.data_prova || '—')}</td>
                <td><div class="btn-group">
                    <button class="btn btn-outline btn-sm" onclick="editarGabarito(${p.id})">✏️</button>
                    <button class="btn-del" onclick="excluirGabarito(${p.id}, '${escapeAttr(p.titulo)}')">🗑️</button>
                </div></td>
            </tr>`;
        }).join('');
    } catch (erro) { console.error(erro); }
}
// ============================================================
// SCRIPT.JS — Parte 2/2 (USUÁRIOS, SENHA, TEXTO IA, CORREÇÃO,
// CORREÇÃO MANUAL, GABARITO, RELATÓRIO, IMPRESSÃO, CARTÕES)
// ============================================================

// ═══ USUÁRIOS (com escola) ═══
function atualizarObrigatorioEscolaUsuario() {
    const perfilSel = document.getElementById('usuario-perfil');
    const escolaSel = document.getElementById('usuario-escola');
    const reqEl = document.getElementById('usuario-escola-req');
    if (!perfilSel) return;
    const isUsuario = perfilSel.value !== 'admin';
    if (escolaSel) {
        escolaSel.required = isUsuario;
        if (!isUsuario) escolaSel.value = '';
    }
    if (reqEl) reqEl.style.display = isUsuario ? 'inline' : 'none';
}

async function abrirModalUsuario(usuarioId = null) {
    const sel = document.getElementById('usuario-escola');
    if (sel) {
        sel.innerHTML = '<option value="">Carregando escolas...</option>';
        try {
            const escolas = await carregarEscolasComCache(true);
            sel.innerHTML = '<option value="">Selecione a escola...</option>' +
                escolas.map(e => `<option value="${e.id}">${escapeHtml(e.nome)}</option>`).join('');
        } catch (e) {
            sel.innerHTML = '<option value="">Erro ao carregar escolas</option>';
        }
    }
    document.getElementById('editar-usuario-id').value = usuarioId || '';
    document.getElementById('usuario-nome').value = '';
    document.getElementById('usuario-username').value = '';
    document.getElementById('usuario-senha').value = '';
    document.getElementById('usuario-email').value = '';
    document.getElementById('usuario-perfil').value = 'usuario';
    document.getElementById('usuario-ativo').checked = true;
    if (sel) sel.value = '';
    const h3 = document.querySelector('#m-usuario .modal-header h3');
    if (h3) h3.textContent = usuarioId ? '✏️ Editar Usuário' : '👤 Cadastrar Usuário';
    if (usuarioId) {
        try {
            const r = await apiFetch(API_URL + '/api/usuarios/' + usuarioId);
            const u = await r.json();
            document.getElementById('usuario-nome').value = u.nome || '';
            document.getElementById('usuario-username').value = u.username || '';
            document.getElementById('usuario-email').value = u.email || '';
            document.getElementById('usuario-perfil').value = u.perfil || 'usuario';
            document.getElementById('usuario-ativo').checked = !!u.ativo;
            if (sel) sel.value = (u.escola_id != null) ? String(u.escola_id) : '';
        } catch (e) { showToast('❌ Erro ao carregar usuário: ' + e.message, 'error'); }
    }
    atualizarObrigatorioEscolaUsuario();
    openM('m-usuario');
}

async function editarUsuario(id) { await abrirModalUsuario(id); }

async function salvarUsuario() {
    const id = document.getElementById('editar-usuario-id').value;
    const perfil = document.getElementById('usuario-perfil').value;
    const escolaVal = document.getElementById('usuario-escola')?.value;
    const payload = {
        nome: document.getElementById('usuario-nome').value.trim(),
        username: document.getElementById('usuario-username').value.trim(),
        senha: document.getElementById('usuario-senha').value,
        email: document.getElementById('usuario-email').value.trim(),
        perfil: perfil,
        ativo: document.getElementById('usuario-ativo').checked,
        escola_id: perfil === 'admin' ? null : (escolaVal ? parseInt(escolaVal) : null)
    };
    if (!payload.nome || !payload.username) { showToast('❌ Nome e usuário obrigatórios!', 'error'); return; }
    if (!id && !payload.senha) { showToast('❌ Senha obrigatória!', 'error'); return; }
    if (payload.senha && payload.senha.length < 4) { showToast('❌ Senha deve ter 4+ caracteres!', 'error'); return; }
    if (payload.perfil !== 'admin' && !payload.escola_id) {
        showToast('❌ Escola é obrigatória para não administradores!', 'error'); return;
    }
    try {
        const btn = document.querySelector('#m-usuario .btn-green');
        const orig = btn.textContent; btn.textContent = '⏳ Salvando...'; btn.disabled = true;
        showToast('💾 Salvando usuário...', 'info');
        const url = id ? API_URL + '/api/usuarios/' + id : API_URL + '/api/usuarios';
        const method = id ? 'PUT' : 'POST';
        const response = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await processarRespostaAPI(response);
        btn.textContent = orig; btn.disabled = false;
        if (result.ok) {
            showToast(id ? '✅ Usuário atualizado!' : '✅ Usuário criado!', 'success');
            closeM('m-usuario'); carregarUsuarios();
        } else showToast('❌ Erro: ' + (result.data.erro || 'Desconhecido'), 'error');
    } catch (erro) {
        showToast('❌ Erro: ' + erro.message, 'error');
        const btn = document.querySelector('#m-usuario .btn-green');
        if (btn) { btn.textContent = '💾 Salvar Usuário'; btn.disabled = false; }
    }
}

async function excluirUsuario(id, username) {
    if (username === 'admin') { showToast('⚠️ Não pode excluir admin principal!', 'error'); return; }
    if (!confirm('Excluir o usuário "' + username + '"?')) return;
    try {
        const response = await apiFetch(API_URL + '/api/usuarios/' + id, { method: 'DELETE' });
        const result = await processarRespostaAPI(response);
        if (result.ok) { showToast('🗑️ Usuário excluído!', 'error'); carregarUsuarios(); }
        else showToast('Erro: ' + (result.data.erro || 'Desconhecido'), 'error');
    } catch (erro) { showToast('Erro: ' + erro.message, 'error'); }
}

async function carregarUsuarios() {
    try {
        const response = await apiFetch(API_URL + '/api/usuarios');
        if (response.status === 403) { console.log('⚠️ [carregarUsuarios] não-admin — ignorado'); return; }
        const usuarios = await response.json();
        const tbody = document.getElementById('tb-usuarios');
        if (!tbody) return;
        if (!usuarios || usuarios.length === 0 || usuarios.erro) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text3);">Nenhum usuário cadastrado</td></tr>';
            return;
        }
        tbody.innerHTML = usuarios.map(u => {
            const perfilBadge = u.perfil === 'admin' ? 'badge-orange' : 'badge-blue';
            const statusBadge = u.ativo ? 'badge-green' : 'badge-red';
            const statusText = u.ativo ? 'Ativo' : 'Inativo';
            const isAdmin = u.username === 'admin';
            return `<tr data-id="${u.id}" data-username="${escapeAttr(u.username)}">
                <td><strong>${escapeHtml(u.username)}</strong><br>
                    <small style="color:var(--text3);font-size:10px;">${escapeHtml(u.nome || '')}</small>
                    ${u.escola_nome ? '<br><small style="color:var(--blue);font-size:10px;">🏫 ' + escapeHtml(u.escola_nome) + '</small>' : ''}
                </td>
                <td><span class="badge ${perfilBadge}">${u.perfil === 'admin' ? 'Admin' : 'Usuário'}</span></td>
                <td><span class="badge ${statusBadge}">${statusText}</span></td>
                <td><div class="btn-group">
                    ${isAdmin ? '<span style="font-size:10px;color:var(--text3);">Sistema</span>' :
                    `<button class="btn btn-outline btn-sm" onclick="editarUsuario(${u.id})">✏️</button><button class="btn-del" onclick="excluirUsuario(${u.id}, '${escapeAttr(u.username)}')">🗑️</button>`}
                </div></td>
            </tr>`;
        }).join('');
    } catch (erro) { console.error(erro); }
}

// ═══ SENHA CONFIG — usa o usuário LOGADO ═══
function pedirSenhaConfig() {
    const modal = document.getElementById('m-senha-config');
    if (!modal) return;
    const input = document.getElementById('senha-config-input');
    if (input) input.value = '';
    const erro = document.getElementById('senha-config-erro');
    if (erro) erro.style.display = 'none';
    const loading = document.getElementById('senha-config-loading');
    if (loading) loading.style.display = 'none';
    openM('m-senha-config');
    setTimeout(() => { if (input) input.focus(); }, 200);
}
function cancelarSenhaConfig() { closeM('m-senha-config'); }

async function validarSenhaConfig() {
    const input = document.getElementById('senha-config-input');
    const erroDiv = document.getElementById('senha-config-erro');
    const loadingDiv = document.getElementById('senha-config-loading');
    const btn = document.getElementById('btn-desbloquear-config');
    const senha = input ? input.value.trim() : '';
    if (erroDiv) erroDiv.style.display = 'none';
    if (!senha) { if (erroDiv) { erroDiv.textContent = '❌ Digite a senha.'; erroDiv.style.display = 'block'; } return; }
    let username = 'admin';
    try {
        if (typeof getUsuarioAtual === 'function') {
            const u = getUsuarioAtual();
            if (u && u.username) username = u.username;
        }
    } catch (e) {}
    if (loadingDiv) loadingDiv.style.display = 'block';
    if (btn) btn.disabled = true;
    try {
        const response = await apiFetch(API_URL + '/api/verificar-senha-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senha, username })
        });
        const dados = await response.json();
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (btn) btn.disabled = false;
        if (dados.ok) {
            closeM('m-senha-config');
            showToast('🔓 Acesso liberado!', 'success');
            go('config');
        } else if (erroDiv) {
            erroDiv.textContent = '❌ ' + (dados.erro || 'Senha incorreta');
            erroDiv.style.display = 'block';
        }
    } catch (erro) {
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (btn) btn.disabled = false;
        if (erroDiv) { erroDiv.textContent = '❌ ' + erro.message; erroDiv.style.display = 'block'; }
    }
}

// ═══ TEXTO COM IA ═══
async function prevTexto(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
        const base64 = e.target.result;
        document.getElementById('txt-img-prev').style.display = 'block';
        document.getElementById('txt-img').src = base64;
        showToast('🔍 Lendo texto...', 'info');
        try {
            const response = await apiFetch(API_URL + '/api/extrair_texto_redacao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imagem: base64 }) });
            const dados = await response.json();
            if (dados.sucesso && dados.texto) {
                document.getElementById('txt-aluno').value = dados.texto;
                showToast(`✅ Texto extraído! ${dados.caracteres} caracteres.`, 'success');
            } else showToast('❌ ' + (dados.erro || 'Não foi possível ler'), 'error');
        } catch (err) { showToast('❌ ' + err.message, 'error'); }
    };
    reader.readAsDataURL(file);
}

async function avaliarTexto() {
    let texto = document.getElementById('txt-aluno').value;
    const alunoId = document.getElementById('txt-aluno-select').value;
    const preview = document.getElementById('txt-img-prev');
    const imgEl = document.getElementById('txt-img');
    const temImagem = preview && preview.style.display !== 'none' && imgEl && imgEl.src;
    if ((!texto || texto.trim().length < 5) && temImagem) {
        try {
            const response = await apiFetch(API_URL + '/api/extrair_texto_redacao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imagem: imgEl.src }) });
            const dados = await response.json();
            if (dados.sucesso && dados.texto) { texto = dados.texto; document.getElementById('txt-aluno').value = texto; }
            else { showToast('❌ ' + (dados.erro || 'Erro'), 'error'); return; }
        } catch (err) { showToast('❌ ' + err.message, 'error'); return; }
    }
    if (!texto || texto.trim().length < 5) { showToast('❌ Digite um texto!', 'error'); return; }
    const etapas = [
        { nome: '📝 Preparando texto', descricao: 'Validando...' },
        { nome: '🤖 Analisando com IA', descricao: 'OpenAI avaliando...' },
        { nome: '📊 Gerando resultados', descricao: 'Calculando nota...' }
    ];
    progressManager.iniciar('📝 Avaliando Texto', etapas, '🤖');
    document.getElementById('txt-waiting').style.display = 'none';
    document.getElementById('txt-loading').style.display = 'block';
    document.getElementById('txt-res').style.display = 'none';
    try {
        progressManager.concluirEtapa(0); progressManager.proximaEtapa();
        const response = await apiFetch(API_URL + '/api/corrigir_redacao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, aluno_id: alunoId || null }) });
        progressManager.concluirEtapa(1); progressManager.proximaEtapa();
        const dados = await response.json();
        document.getElementById('txt-loading').style.display = 'none';
        document.getElementById('txt-res').style.display = 'block';
        if (dados.erro) { progressManager.erro(dados.erro); showToast('❌ ' + dados.erro, 'error'); return; }
        progressManager.concluirEtapa(2); progressManager.finalizar('✅ Avaliação concluída!');
        setText('txt-nota', dados.nota || 0);
        const st = document.getElementById('txt-status');
        if (st) { st.textContent = dados.nota >= 6 ? 'APROVADO' : 'REPROVADO'; st.className = 'badge ' + (dados.nota >= 6 ? 'badge-green' : 'badge-red'); }
        if (dados.metricas) {
            setText('c-coe', dados.metricas.nota_coerencia || 0);
            setText('c-tema', dados.metricas.nota_estrutura || 0);
            setText('c-ort', dados.metricas.nota_gramatica || 0);
            setText('c-voc', dados.metricas.nota_vocabulario || 0);
            const b1 = document.getElementById('b-coe'); if (b1) b1.style.width = ((dados.metricas.nota_coerencia || 0) / 10 * 100) + '%';
            const b2 = document.getElementById('b-tema'); if (b2) b2.style.width = ((dados.metricas.nota_estrutura || 0) / 10 * 100) + '%';
            const b3 = document.getElementById('b-ort'); if (b3) b3.style.width = ((dados.metricas.nota_gramatica || 0) / 10 * 100) + '%';
            const b4 = document.getElementById('b-voc'); if (b4) b4.style.width = ((dados.metricas.nota_vocabulario || 0) / 10 * 100) + '%';
        }
        const fb = document.getElementById('txt-fb');
        if (fb) fb.innerHTML = escapeHtml(dados.feedback || 'Feedback gerado.');
        if (alunoId) {
            try { const alunos = await carregarAlunosComCache(); const a = alunos.find(x => x.id == alunoId); setText('txt-aluno-nome', a ? a.nome : '—'); } catch (e) {}
        }
        showToast('✅ Avaliação concluída!', 'success');
    } catch (erro) {
        document.getElementById('txt-loading').style.display = 'none';
        progressManager.erro(erro.message);
        showToast('❌ ' + erro.message, 'error');
    }
}

async function salvarAvaliacaoTexto() {
    const alunoId = document.getElementById('txt-aluno-select').value;
    const provaId = document.getElementById('txt-prova').value;
    const texto = document.getElementById('txt-aluno').value;
    const nota = parseFloat(document.getElementById('txt-nota').textContent) || 0;
    const feedback = document.getElementById('txt-fb').innerHTML || '';
    const metricas = {
        nota_coerencia: parseFloat(document.getElementById('c-coe').textContent) || 0,
        nota_estrutura: parseFloat(document.getElementById('c-tema').textContent) || 0,
        nota_gramatica: parseFloat(document.getElementById('c-ort').textContent) || 0,
        nota_vocabulario: parseFloat(document.getElementById('c-voc').textContent) || 0
    };
    if (!alunoId) { showToast('⚠️ Selecione o aluno!', 'error'); return; }
    if (!texto || texto.trim().length < 5) { showToast('⚠️ Nenhum texto!', 'error'); return; }
    if (!nota || nota === 0) { showToast('⚠️ Avalie antes de salvar!', 'error'); return; }
    showToast('💾 Salvando...', 'info');
    try {
        const response = await apiFetch(API_URL + '/api/salvar_correcao_texto', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aluno_id: parseInt(alunoId), prova_id: provaId ? parseInt(provaId) : null, texto, nota, metricas, feedback })
        });
        const dados = await response.json();
        if (dados.sucesso) showToast(`✅ Salva! Nota: ${nota.toFixed(1)}`, 'success');
        else showToast('❌ ' + (dados.erro || 'Erro'), 'error');
    } catch (err) { showToast('❌ ' + err.message, 'error'); }
}

async function carregarTurmasTexto(escolaId) {
    const st = document.getElementById('txt-turma');
    const sa = document.getElementById('txt-aluno-select');
    if (!st || !sa) return;
    st.innerHTML = '<option value="">Selecione a turma...</option>';
    sa.innerHTML = '<option value="">Selecione...</option>';
    if (!escolaId) return;
    try {
        const turmas = await carregarTurmasComCache(escolaId);
        if (turmas && !turmas.erro) turmas.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.nome + ' - ' + (t.serie || ''); st.appendChild(o); });
    } catch (e) { console.error(e); }
}

async function carregarAlunosPorTurmaTexto(turmaId) {
    const sa = document.getElementById('txt-aluno-select');
    if (!sa) return;
    sa.innerHTML = '<option value="">Selecione...</option>';
    if (!turmaId) return;
    try {
        const alunos = await carregarAlunosComCache({ turma_id: turmaId });
        if (alunos && !alunos.erro) alunos.forEach(a => { const o = document.createElement('option'); o.value = a.id; o.textContent = a.nome + ' (Nº ' + (a.numero_chamada || '—') + ')'; sa.appendChild(o); });
    } catch (e) { console.error(e); }
}

async function carregarEscolasTexto() {
    try {
        const escolas = await carregarEscolasComCache();
        const s = document.getElementById('txt-escola');
        if (s && escolas && !escolas.erro) {
            const cur = s.value;
            s.innerHTML = '<option value="">Selecione a escola...</option>';
            escolas.forEach(e => { const o = document.createElement('option'); o.value = e.id; o.textContent = e.nome; s.appendChild(o); });
            if (cur) s.value = cur;
        }
    } catch (e) { console.error(e); }
}

// ═══ CÂMERA ═══
async function abrirCamera() {
    document.getElementById('cam-modal').classList.add('show');
    try {
        if (camStream) camStream.getTracks().forEach(t => t.stop());
        camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: camFacing, width: { ideal: 1280 }, height: { ideal: 720 } } });
        document.getElementById('cam-video').srcObject = camStream;
    } catch (e) { showToast('❌ Câmera: ' + e.message, 'error'); fecharCamera(); }
}
function trocarCamera() { camFacing = camFacing === 'environment' ? 'user' : 'environment'; abrirCamera(); }
function fecharCamera() {
    document.getElementById('cam-modal').classList.remove('show');
    if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
}
function capturarFoto() {
    const vid = document.getElementById('cam-video');
    const canvas = document.getElementById('cam-canvas');
    canvas.width = vid.videoWidth || 640;
    canvas.height = vid.videoHeight || 480;
    canvas.getContext('2d').drawImage(vid, 0, 0);
    const foto = canvas.toDataURL('image/jpeg', 0.9);
    fecharCamera();
    showToast('📸 Capturada!', 'ai');
    if (typeof autoModoAtivo !== 'undefined' && autoModoAtivo) {
        autoModoAtivo = false;
        window._autoImagem = foto;
        go('corrigir-ia');
        setTimeout(() => {
            const preview = document.getElementById('auto-preview');
            const img = document.getElementById('auto-img-prev');
            if (preview && img) { img.src = foto; preview.style.display = 'block'; }
            corrigirAutomatico();
        }, 500);
        return;
    }
    ultimaImagem = foto;
    processarComIA(foto);
    go('corrigir-ia');
}
function abrirArquivo() { document.getElementById('inp-arq').click(); }
function processarArq(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        showToast('📂 Carregado!', 'ai');
        ultimaImagem = e.target.result;
        processarComIA(e.target.result);
        go('corrigir-ia');
    };
    reader.readAsDataURL(file);
}

// ═══ CORREÇÃO COM IA ═══
async function processarComIA(imagemBase64) {
    const escolaId = document.getElementById('corrigir-escola')?.value;
    const turmaId = document.getElementById('corrigir-turma')?.value;
    const provaId = document.getElementById('corrigir-prova')?.value;
    const alunoId = document.getElementById('corrigir-aluno')?.value;
    if (!escolaId || !turmaId || !provaId || !alunoId) { showToast('❌ Selecione escola, turma, prova e aluno!', 'error'); return; }
    if (!imagemBase64) { showToast('❌ Nenhuma imagem!', 'error'); return; }
    const etapas = [
        { nome: '📸 Preparando imagem', descricao: 'Processando...' },
        { nome: '🎯 Template + Marcadores', descricao: 'Detectando...' },
        { nome: '🔍 Validação OpenCV', descricao: 'Cruzando...' },
        { nome: '🤖 IA (se necessário)', descricao: 'Analisando...' },
        { nome: '📊 Processando', descricao: 'Calculando...' },
        { nome: '💾 Finalizando', descricao: 'Salvando...' }
    ];
    progressManager.iniciar('🤖 Corrigindo', etapas, '🤖');
    try {
        progressManager.atualizarEtapa(0); await sleep(500);
        let imagemEnvio = imagemBase64;
        if (imagemBase64.startsWith('data:image')) { const p = imagemBase64.split(','); if (p.length > 1) imagemEnvio = p[1]; }
        progressManager.atualizarEtapa(1); await sleep(300);
        const prova = await buscarProva(provaId);
        if (!prova) throw new Error('Prova não encontrada');
        const gabarito = prova.gabarito || [];
        const totalQuestoes = prova.quantidade_questoes || 20;
        const tipoQuestoes = prova.tipo_questoes || 4;
        const isProducao = (prova.disciplina === 'Produção de Texto');
        const alternativas = tipoQuestoes == 3 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
        if (!gabarito || gabarito.length === 0) throw new Error('Prova sem gabarito');
        const aluno = await buscarAluno(alunoId);
        if (!aluno) throw new Error('Aluno não encontrado');
        progressManager.atualizarEtapa(2); await sleep(300);
        const respostaIA = await enviarParaCorrecao(imagemEnvio, provaId, alunoId);
        if (respostaIA.erro) throw new Error(respostaIA.erro);
        progressManager.atualizarEtapa(3); await sleep(200);
        const { respostasNormalizadas, confiancasNormalizadas } = normalizarRespostas(respostaIA.respostas_detectadas || [], respostaIA.confianca_por_questao || [], totalQuestoes, isProducao, tipoQuestoes);
        let acertos = 0;
        const resultadoQuestoes = [];
        for (let i = 0; i < totalQuestoes; i++) {
            const resp = respostasNormalizadas[i] || '';
            const gab = (i < gabarito.length) ? (gabarito[i] || '') : '';
            const confianca = confiancasNormalizadas[i] || 0;
            let isCorreto = false, statusMsg = 'NÃO RESPONDEU';
            if (isProducao) {
                if (resp && gab) {
                    const rl = resp.trim().toLowerCase(), gl = gab.trim().toLowerCase();
                    isCorreto = rl === gl || rl.includes(gl) || gl.includes(rl);
                    statusMsg = isCorreto ? '✅ ACERTOU' : '❌ ERROU';
                }
            } else {
                const rn = resp.toString().toUpperCase().trim();
                const gn = gab.toString().toUpperCase().trim();
                if (rn && gn) { isCorreto = rn === gn; statusMsg = isCorreto ? '✅ ACERTOU' : '❌ ERROU'; }
                else if (rn) statusMsg = '❌ INVÁLIDA';
            }
            if (isCorreto) acertos++;
            resultadoQuestoes.push({ numero: i + 1, resposta: resp || '—', gabarito: gab || '—', acertou: isCorreto, status: statusMsg, confianca, respondida: !!resp });
        }
        const valorPorQuestao = 10 / totalQuestoes;
        const nota = Math.min(acertos * valorPorQuestao, 10);
        const porcentagem = Math.round((acertos / totalQuestoes) * 100);
        const conceito = calcularConceito(porcentagem);
        progressManager.atualizarEtapa(4); await sleep(300);
        correcaoManualData = {
            alunoId: parseInt(alunoId), alunoNome: aluno.nome || 'Aluno',
            provaId: parseInt(provaId), provaTitulo: prova.titulo || 'Prova',
            gabarito, respostasAluno: respostasNormalizadas,
            quantidade: totalQuestoes, alternativas, notaMaxima: 10, notaMinima: 5, valorPorQuestao,
            serie: prova.serie || '1º Ano', disciplina: prova.disciplina || '',
            confianca_por_questao: confiancasNormalizadas, questoes_suspeitas: respostaIA.questoes_suspeitas || []
        };
        const metodoUsado = respostaIA.metodo_usado || respostaIA.modo || 'desconhecido';
        atualizarInterfaceCorrecao({ aluno, prova, resultadoQuestoes, acertos, totalQuestoes, nota, porcentagem, conceito, confiancas: confiancasNormalizadas, metodoUsado, requerRevisao: respostaIA.requer_revisao_manual || false, questoesSuspeitas: respostaIA.questoes_suspeitas || [] });
        progressManager.atualizarEtapa(5); await sleep(200);
        progressManager.finalizar(`✅ ${acertos}/${totalQuestoes} acertos — Nota: ${nota.toFixed(1)}`);
        carregarDashboard(); carregarUltimasCorrecoes();
    } catch (erro) {
        progressManager.erro(erro.message || 'Erro');
        showToast('❌ ' + erro.message, 'error');
    }
}

async function buscarProva(provaId) {
    try { const provas = await carregarProvasComCache(); return provas.find(p => p.id == provaId); }
    catch (e) { throw new Error('Erro ao buscar prova'); }
}
async function buscarAluno(alunoId) {
    try { const alunos = await carregarAlunosComCache(); return alunos.find(a => a.id == alunoId); }
    catch (e) { throw new Error('Erro ao buscar aluno'); }
}
async function enviarParaCorrecao(imagemBase64, provaId, alunoId) {
    const response = await apiFetch(`${API_URL}/api/corrigir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagem: imagemBase64, prova_id: parseInt(provaId), aluno_id: parseInt(alunoId) })
    });
    let dados = null;
    try { dados = await response.json(); } catch (e) { dados = null; }
    if (dados && dados.erro) throw new Error(dados.erro);
    if (!response.ok) throw new Error(`Erro ${response.status} ao corrigir`);
    if (!dados) throw new Error(`Resposta inválida do servidor (${response.status})`);
    if (!dados.respostas_detectadas && !dados.questoes_status) throw new Error('A IA não detectou respostas. Tire uma foto mais nítida.');
    return dados;
}
function normalizarRespostas(respostas, confiancas, totalQuestoes, isProducao, tipoQuestoes = 4) {
    let respostasN = [], confiancasN = [];
    const altsVal = tipoQuestoes == 3 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
    for (let i = 0; i < totalQuestoes; i++) {
        let resp = (i < respostas.length) ? (respostas[i] || '') : '';
        let conf = (i < confiancas.length) ? (confiancas[i] || 0) : 0;
        if (isProducao) resp = resp.toString().trim();
        else {
            let s = resp.toString().trim().toUpperCase();
            s = s.replace(/^[\(\[]*/, '').replace(/[\)\]\.\,\;\:\-]*$/, '');
            let enc = '';
            if (altsVal.includes(s)) enc = s;
            else for (const a of altsVal) if (s.includes(a)) { enc = a; break; }
            resp = enc;
        }
        respostasN.push(resp);
        confiancasN.push(Math.min(Math.max(conf, 0), 100));
    }
    return { respostasNormalizadas: respostasN, confiancasNormalizadas: confiancasN };
}
function atualizarInterfaceCorrecao(dados) {
    const box = document.getElementById('ia-result');
    if (box) box.style.display = 'block';
    setText('ia-aluno', dados.aluno.nome || 'Aluno');
    setText('ia-turma', dados.prova.titulo || 'Prova');
    setText('ia-nota', dados.nota.toFixed(1));
    const st = document.getElementById('ia-status');
    if (st) { const ap = dados.nota >= 6; st.textContent = ap ? '✅ APROVADO' : '❌ REPROVADO'; st.className = 'badge ' + (ap ? 'badge-green' : 'badge-red'); }
    const metodo = dados.metodoUsado || 'desconhecido';
    const mb = document.getElementById('ia-metodo');
    if (mb) {
        const labels = { 'template': '🎯 Template', 'template+cv': '🎯 Template+CV', 'ia': '🤖 IA', 'ia+circulos': '🤖 IA+Círculos', 'ia_parcial': '🤖 IA (Parcial)', 'circulos': '⭕ Círculos', 'circulos_parcial': '⭕ Círculos (Parcial)', 'manual': '✏️ Manual' };
        mb.textContent = labels[metodo] || `📌 ${metodo}`;
        mb.className = 'badge ' + (metodo === 'template' || metodo === 'template+cv' ? 'badge-green' : metodo === 'ia' ? 'badge-purple' : metodo.includes('circulos') ? 'badge-orange' : 'badge-gray');
    }
    const cm = dados.confiancas.reduce((a, b) => a + b, 0) / dados.confiancas.length || 0;
    const bc = document.getElementById('confianca-badge');
    if (bc) { bc.textContent = `${cm.toFixed(1)}% conf.`; bc.className = `badge ${cm >= 70 ? 'badge-green' : cm >= 50 ? 'badge-orange' : 'badge-red'}`; }
    const rc = document.getElementById('ia-resumo-confianca');
    if (rc) {
        const totalDuv = dados.questoesSuspeitas.length || dados.confiancas.filter(c => c < 70).length;
        rc.style.display = 'flex';
        rc.innerHTML = `<span>📊 Confiança: <strong>${cm.toFixed(1)}%</strong></span>${totalDuv > 0 ? `<span>⚠️ ${totalDuv} questões baixa conf.</span>` : '<span>✅ Alta confiança!</span>'}<span>🎯 ${dados.acertos} / ${dados.totalQuestoes}</span><span>📌 ${metodo}</span>${dados.requerRevisao ? '<span style="color:var(--orange);font-weight:700;">⚠️ REVISÃO RECOMENDADA</span>' : ''}`;
    }
    const rd = document.getElementById('ia-resp');
    if (rd) {
        rd.innerHTML = dados.resultadoQuestoes.map(q => {
            const cor = q.acertou ? 'rgba(16,185,129,.2)' : 'rgba(239,68,68,.2)';
            const ct = q.acertou ? 'var(--green)' : 'var(--red)';
            const ic = q.acertou ? '✅' : (q.respondida ? '❌' : '—');
            const cc = q.confianca < 70 ? 'var(--orange)' : 'var(--text2)';
            return `<span style="background:${cor};border:1px solid ${q.acertou ? 'rgba(16,185,129,.4)' : 'rgba(239,68,68,.4)'};padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;color:${ct};">Q${q.numero}:${escapeHtml(q.resposta || '—')} ${ic}<span style="font-size:8px;color:${cc};">${q.confianca}%</span></span>`;
        }).join('');
    }
    const grid = document.getElementById('ia-comp');
    if (grid) {
        grid.innerHTML = '';
        const tq = dados.resultadoQuestoes.length;
        let cpl = tq > 25 ? 6 : 5;
        const tOf = document.createElement('div');
        tOf.style.cssText = `grid-column:1/-1;text-align:center;padding:6px 0;background:linear-gradient(135deg,rgba(59,130,246,.1),rgba(139,92,246,.1));border-radius:6px;margin-top:6px;`;
        tOf.innerHTML = `<span style="font-size:12px;font-weight:800;color:var(--blue);">📋 GABARITO OFICIAL (${tq} questões)</span>`;
        grid.appendChild(tOf);
        const gO = document.createElement('div');
        gO.style.cssText = `grid-column:1/-1;display:grid;grid-template-columns:repeat(${cpl},1fr);gap:4px;padding:4px 0;`;
        dados.resultadoQuestoes.forEach(q => {
            const d = document.createElement('div');
            d.style.cssText = 'background:rgba(59,130,246,.05);border-radius:4px;padding:3px;text-align:center;border:1px solid rgba(59,130,246,.1);';
            d.innerHTML = `<div style="font-size:6px;color:var(--text3);">Q${q.numero}</div><div style="font-size:16px;font-weight:900;color:var(--green);">${escapeHtml(q.gabarito || '—')}</div>`;
            gO.appendChild(d);
        });
        grid.appendChild(gO);
        const tA = document.createElement('div');
        tA.style.cssText = `grid-column:1/-1;text-align:center;padding:6px 0;background:linear-gradient(135deg,rgba(139,92,246,.1),rgba(59,130,246,.1));border-radius:6px;margin-top:8px;`;
        tA.innerHTML = `<span style="font-size:12px;font-weight:800;color:var(--purple);">📋 GABARITO DO ALUNO</span>`;
        grid.appendChild(tA);
        const gA = document.createElement('div');
        gA.style.cssText = `grid-column:1/-1;display:grid;grid-template-columns:repeat(${cpl},1fr);gap:4px;padding:4px 0;`;
        dados.resultadoQuestoes.forEach(q => {
            const ac = q.acertou;
            const r = q.resposta || '—';
            const cf = q.confianca || 100;
            let bg, ct, ic;
            if (ac) { bg = 'rgba(16,185,129,.1)'; ct = 'var(--green)'; ic = '✅'; }
            else if (q.respondida) { bg = 'rgba(239,68,68,.1)'; ct = 'var(--red)'; ic = '❌'; }
            else { bg = 'rgba(100,116,139,.05)'; ct = 'var(--text3)'; ic = '—'; }
            const cc = cf < 70 ? 'var(--orange)' : 'var(--text3)';
            const d = document.createElement('div');
            d.style.cssText = `background:${bg};border-radius:4px;padding:3px;text-align:center;border:1px solid ${ac ? 'rgba(16,185,129,.2)' : (q.respondida ? 'rgba(239,68,68,.2)' : 'rgba(100,116,139,.1)')};`;
            d.innerHTML = `<div style="font-size:6px;color:var(--text3);">Q${q.numero}</div><div style="font-size:16px;font-weight:900;color:${ct};">${escapeHtml(r)}</div><div style="font-size:6px;color:${ct};">${ic}</div><div style="font-size:6px;color:${cc};">${Math.round(cf)}%</div>`;
            gA.appendChild(d);
        });
        grid.appendChild(gA);
    }
}

async function salvarCorrecao() {
    if (!correcaoManualData || !correcaoManualData.respostasAluno) { showToast('❌ Nenhuma correção!', 'error'); return; }
    const provaId = correcaoManualData.provaId;
    const alunoId = correcaoManualData.alunoId;
    const respostas = correcaoManualData.respostasAluno;
    const gabarito = correcaoManualData.gabarito;
    const total = correcaoManualData.quantidade;
    if (!provaId || !alunoId) { showToast('❌ Dados incompletos!', 'error'); return; }
    let acertos = 0;
    for (let i = 0; i < total; i++) {
        const r = (i < respostas.length) ? (respostas[i] || '') : '';
        const g = (i < gabarito.length) ? (gabarito[i] || '') : '';
        if (r && g && r.toUpperCase() === g.toUpperCase()) acertos++;
    }
    const nota = Math.min(acertos * (correcaoManualData.valorPorQuestao || (10/total)), 10);
    try {
        showToast('💾 Salvando...', 'info');
        const response = await apiFetch(`${API_URL}/api/corrigir_manual`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prova_id: provaId, aluno_id: alunoId, respostas, acertos, nota, total }) });
        const data = await response.json();
        if (data.sucesso) { showToast(`✅ Salva! Nota: ${nota.toFixed(1)}`, 'success'); limparCache(); carregarDashboard(); carregarUltimasCorrecoes(); }
        else showToast('❌ ' + (data.erro || 'Erro'), 'error');
    } catch (erro) { showToast('❌ ' + erro.message, 'error'); }
}

// ═══ CORREÇÃO MANUAL INLINE ═══
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
            badge.className = 'confianca-badge confianca-baixa';
            badge.style.cssText = 'font-size:8px;font-weight:700;margin-top:4px;padding:2px 8px;border-radius:12px;background:rgba(239,68,68,0.15);color:#ef4444;';
            badge.textContent = `⚠️ Confiança: ${conf}%`;
            const sel = item.querySelector('.q-select');
            if (sel) item.insertBefore(badge, sel); else item.appendChild(badge);
        } else if (conf < 80) item.style.borderColor = 'rgba(245,158,11,0.3)';
    });
    if (totalDuv > 0) showToast(`🔍 ${totalDuv} questões baixa confiança`, 'warning');
    else showToast('✅ Todas alta confiança!', 'success');
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
    else showToast(`🔍 Mostrando ${totalDuv} questões`, 'info');
}
function gerarGridCorrecaoManual() {
    const grid = document.getElementById('cm-grid');
    if (!grid) return;
    const qtd = correcaoManualData.quantidade || 20;
    const alts = correcaoManualData.alternativas || ['A', 'B', 'C', 'D'];
    const resps = correcaoManualData.respostasAluno || [];
    const gab = correcaoManualData.gabarito || [];
    const isProd = (correcaoManualData.disciplina === 'Produção de Texto');
    if (isProd) { grid.style.cssText = 'display:flex;flex-direction:column;gap:12px;max-height:none;overflow-y:visible;'; }
    else { grid.style.cssText = 'display:grid;grid-template-columns:repeat(10,1fr);gap:6px;max-height:280px;overflow-y:auto;'; }
    grid.innerHTML = '';
    for (let i = 0; i < qtd; i++) {
        const div = document.createElement('div');
        div.className = 'correcao-manual-item';
        const resp = (i < resps.length) ? resps[i] : '';
        const gb = (i < gab.length) ? gab[i] : '';
        const isC = resp && gb && resp.toUpperCase() === gb.toUpperCase();
        if (isProd) {
            div.style.cssText = 'background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;text-align:left;display:flex;flex-direction:column;gap:6px;';
            div.innerHTML = `<input class="gab-titulo" type="text" value="Q${i+1}" style="width:100%;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:4px;font-size:12px;font-weight:bold;" /><div style="font-size:10px;color:var(--text3);">Gabarito: ${escapeHtml(gb || '—')}</div><textarea class="q-resposta-texto" placeholder="Resposta..." style="width:100%;min-height:50px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:4px;font-size:11px;resize:vertical;">${escapeHtml(resp)}</textarea>`;
            const ta = div.querySelector('.q-resposta-texto');
            ta.dataset.questao = i;
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
    setText('cm-acertos', ac);
    setText('cm-erros', er);
    setText('cm-nota', notaF.toFixed(1));
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
    const etapas = [{ nome: '📝 Processando', descricao: 'Validando...' }, { nome: '📊 Calculando', descricao: 'Calculando...' }, { nome: '💾 Salvando', descricao: 'Persistindo...' }];
    progressManager.iniciar('💾 Salvando', etapas, '✏️');
    fetch(API_URL + '/api/corrigir_manual', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Usuario-Username': (getUsuarioAtual?.().username || '') },
        body: JSON.stringify({ prova_id: correcaoManualData.provaId, aluno_id: correcaoManualData.alunoId, respostas: resps, acertos: ac, nota, total: qtd })
    })
    .then(r => { progressManager.concluirEtapa(0); progressManager.proximaEtapa(); return r.json(); })
    .then(data => {
        progressManager.concluirEtapa(1); progressManager.proximaEtapa();
        if (data.sucesso) {
            progressManager.concluirEtapa(2); progressManager.finalizar(`✅ Nota: ${nota.toFixed(1)}`);
            limparCache();
            setTimeout(() => { carregarDashboard(); carregarUltimasCorrecoes(); }, 500);
        } else { progressManager.erro(data.erro || 'Erro'); showToast('❌ ' + (data.erro || 'Erro'), 'error'); }
    })
    .catch(erro => { progressManager.erro(erro.message); showToast('❌ ' + erro.message, 'error'); });
}

// ═══ CORREÇÃO MANUAL STANDALONE ═══
function ajustarUIporDisciplina() {
    const isProd = (cmStandaloneData.disciplina === 'Produção de Texto');
    const nc = document.getElementById('cm-nota-manual-container'); if (nc) nc.style.display = isProd ? 'block' : 'none';
    const rs = document.getElementById('cm-sa-resumo'); if (rs) rs.style.display = isProd ? 'none' : 'grid';
    const bd = document.getElementById('cm-sa-badges'); if (bd) bd.style.display = isProd ? 'none' : 'flex';
    const bs = document.getElementById('btn-salvar-correcao-manual'); if (bs) bs.style.display = isProd ? 'none' : 'inline-flex';
    const ba = document.querySelector('#cm-grid-standalone-container > div[style*="justify-content:space-between"]');
    if (ba) ba.style.display = isProd ? 'none' : 'flex';
}
function abrirCorrecaoManualStandalone() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    ['cm-sa-aluno', 'cm-sa-turma', 'cm-sa-prova', 'cm-sa-data'].forEach(id => setText(id, '—'));
    ['cm-sa-acertos', 'cm-sa-erros'].forEach(id => setText(id, '0'));
    setText('cm-sa-nota', '0,0');
    const sb = document.getElementById('cm-sa-status-badge'); if (sb) { sb.textContent = 'AGUARDANDO'; sb.className = 'badge badge-gray'; }
    setText('cm-sa-porcentagem', '0% aproveitamento');
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
        cmStandaloneData.provaId = null; cmStandaloneData.provaTitulo = ''; cmStandaloneData.provaData = '';
        cmStandaloneData.gabarito = []; cmStandaloneData.quantidade = 20;
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
    } catch (e) { showToast('❌ Erro ao carregar gabarito', 'error'); }
}
async function iniciarCorrecaoManualStandalone() {
    const es = document.getElementById('cm-escola-select');
    const tu = document.getElementById('cm-turma-select');
    const pr = document.getElementById('cm-prova-select');
    const al = document.getElementById('cm-aluno-select');
    if (!es.value) { showToast('❌ Selecione escola!', 'error'); return; }
    if (!tu.value) { showToast('❌ Selecione turma!', 'error'); return; }
    if (!pr.value) { showToast('❌ Selecione prova!', 'error'); return; }
    if (!al.value) { showToast('❌ Selecione aluno!', 'error'); return; }
    const ao = al.options[al.selectedIndex];
    cmStandaloneData.alunoId = parseInt(al.value);
    cmStandaloneData.alunoNome = ao.text.split(' (')[0] || 'Aluno';
    const eo = es.options[es.selectedIndex];
    cmStandaloneData.escolaNome = eo.text || '';
    cmStandaloneData.escolaId = parseInt(es.value);
    const provaId = parseInt(pr.value);
    try {
        showToast('🔄 Carregando...', 'info');
        const resp = await apiFetch(`${API_URL}/api/provas/${provaId}`);
        const prova = await resp.json();
        if (!prova || prova.erro) { showToast('❌ ' + (prova.erro || 'Erro'), 'error'); return; }
        cmStandaloneData.provaId = provaId;
        cmStandaloneData.gabarito = prova.gabarito || [];
        cmStandaloneData.quantidade = prova.quantidade_questoes || 20;
        const tipo = prova.tipo_questoes || '4';
        cmStandaloneData.alternativas = tipo == '3' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
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
    const textos = cmStandaloneData.textos_questoes || [];
    const sits = cmStandaloneData.situacoes || [];
    ajustarUIporDisciplina();
    if (isProd) grid.style.cssText = 'display:flex;flex-direction:column;gap:14px;max-height:none;overflow-y:visible;';
    else grid.style.cssText = 'display:grid;grid-template-columns:repeat(10,1fr);gap:6px;max-height:280px;overflow-y:auto;';
    grid.innerHTML = '';
    for (let i = 0; i < qtd; i++) {
        const div = document.createElement('div');
        const g = (i < gab.length) ? gab[i] : '';
        const r = (i < resps.length) ? resps[i] : '';
        if (isProd) {
            div.className = 'cm-item-producao';
            let cab = (textos[i] && textos[i].cabecalho) ? textos[i].cabecalho : '';
            const tq = (textos[i] && textos[i].titulo) ? textos[i].titulo : `Q${i+1}`;
            const ht = cab ? `${tq} - ${cab}` : tq;
            let gfh = '';
            if (g && g.trim() !== '') {
                const blocos = g.split(/\n(?=[A-Z]\))/);
                blocos.forEach(b => { const m = b.match(/^([A-Z])\)\s*([\s\S]*)$/); if (m) gfh += `<div class="alt-bloco"><span class="alt-letra-gab">${escapeHtml(m[1])}</span><span class="alt-texto-gab">${escapeHtml(m[2].trim())}</span></div>`; else if (b.trim()) gfh += `<div class="alt-bloco">${escapeHtml(b.trim())}</div>`; });
            } else gfh = '<div style="color:var(--text3);font-style:italic;">Sem gabarito</div>';
            const si = (i < sits.length) ? (sits[i] || '') : '';
            const ops = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
            let osh = ''; ops.forEach(o => { const s = si === o ? 'selected' : ''; osh += `<option value="${o}" ${s}>${o === '' ? '—' : o}</option>`; });
            div.innerHTML = `<div class="cm-q-cabecalho-inline">${escapeHtml(ht)}</div><div><div class="cm-q-resposta-label">📋 Gabarito:</div><div class="cm-gabarito-formatado">${gfh}</div></div><div><div class="cm-q-resposta-label">✍️ Observação:</div><textarea class="cm-q-resposta-texto" placeholder="..." data-questao="${i}">${escapeHtml(r || '')}</textarea></div><div class="cm-q-situacao-wrapper"><label class="cm-q-situacao-label">📊 Situação:</label><select class="cm-q-situacao-select" data-questao="${i}" onchange="atualizarSituacaoCM(this)">${osh}</select></div>`;
            const ta = div.querySelector('.cm-q-resposta-texto');
            ta.addEventListener('input', function() { cmStandaloneData.respostas[i] = this.value; });
        } else {
            div.className = 'cm-item-standalone';
            let opts = '<option value="">—</option>';
            alts.forEach(a => { const s = r && r.toUpperCase() === a ? 'selected' : ''; opts += `<option value="${a}" ${s}>${a}</option>`; });
            const isC = r && g && r.toUpperCase() === g.toUpperCase();
            let si = ''; if (r) si = isC ? '✅' : '❌';
            let sc = 'q-select-manual';
            if (r) sc += isC ? ' correta' : ' errada';
            div.innerHTML = `<div class="q-num">Q${i+1}</div><div class="q-gabarito">${escapeHtml(g || '—')}</div><select class="${sc}" data-questao="${i}" onchange="atualizarRespostaManualSA(this)">${opts}</select><div class="q-status-icon">${si}</div>`;
        }
        grid.appendChild(div);
    }
}
function atualizarSituacaoCM(sel) {
    const idx = parseInt(sel.dataset.questao);
    if (!cmStandaloneData.situacoes) cmStandaloneData.situacoes = [];
    cmStandaloneData.situacoes[idx] = sel.value;
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
    const nf = Math.min(nota, cmStandaloneData.notaMaxima || 10);
    const pct = qtd > 0 ? Math.round((ac / qtd) * 100) : 0;
    setText('cm-sa-acertos', ac); setText('cm-sa-erros', er); setText('cm-sa-nota', nf.toFixed(1));
    const sb = document.getElementById('cm-sa-status-badge');
    if (sb) { if (nf >= (cmStandaloneData.notaMinima || 5)) { sb.textContent = '✅ APROVADO'; sb.className = 'badge badge-green'; } else if (nf >= (cmStandaloneData.notaMinima || 5) * 0.8) { sb.textContent = '⚠️ RECUPERAÇÃO'; sb.className = 'badge badge-orange'; } else { sb.textContent = '❌ REPROVADO'; sb.className = 'badge badge-red'; } }
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
        if (isS) { item.style.display = ''; totalDuv++; if (totalDuv === 1) item.scrollIntoView({ behavior: 'smooth', block: 'center' }); } else item.style.display = 'none';
    });
    if (totalDuv === 0) { showToast('✅ Nenhuma!', 'success'); itens.forEach(i => i.style.display = ''); }
    else showToast(`🔍 ${totalDuv} questões`, 'info');
}
function salvarCorrecaoManualStandalone() {
    if (!cmStandaloneData) { showToast('❌ Sem dados!', 'error'); return; }
    if (cmStandaloneData.disciplina === 'Produção de Texto') { showToast('⚠️ Use "SALVAR NOTA"', 'warning'); return; }
    const pid = parseInt(cmStandaloneData.provaId);
    const aid = parseInt(cmStandaloneData.alunoId);
    if (!pid || isNaN(pid)) { showToast('❌ Prova inválida!', 'error'); return; }
    if (!aid || isNaN(aid)) { showToast('❌ Aluno inválido!', 'error'); return; }
    const qtd = cmStandaloneData.quantidade || 20;
    const resps = cmStandaloneData.respostas || [];
    const gab = cmStandaloneData.gabarito || [];
    if (!resps.some(r => r && r.trim() !== '')) { showToast('⚠️ Marque pelo menos uma!', 'warning'); return; }
    let ac = 0;
    for (let i = 0; i < qtd; i++) {
        const r = i < resps.length ? resps[i] : '';
        const g = i < gab.length ? gab[i] : '';
        if (r && g && r.toUpperCase() === g.toUpperCase()) ac++;
    }
    const vpq = cmStandaloneData.valorPorQuestao || (10 / qtd);
    const nota = Math.min((ac * vpq), cmStandaloneData.notaMaxima || 10);
    showToast('💾 Salvando...', 'info');
    apiFetch(API_URL + '/api/corrigir_manual', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prova_id: pid, aluno_id: aid, respostas: resps.map(r => r || ''), acertos: ac, nota, total: qtd })
    })
    .then(async r => { let d; const ct = r.headers.get('content-type'); if (ct && ct.includes('application/json')) d = await r.json(); else { const t = await r.text(); try { d = JSON.parse(t); } catch (e) { d = { erro: t || 'Erro' }; } } if (!r.ok) throw new Error(d.erro || d.mensagem || `Erro ${r.status}`); return d; })
    .then(data => {
        if (data.sucesso) {
            showToast(`✅ Salva! Nota: ${nota.toFixed(1)}`, 'success');
            limparCache();
            setTimeout(() => { carregarDashboard(); carregarUltimasCorrecoes(); const p = document.querySelector('.page.active'); if (p && p.id === 'page-rel-turma') carregarRelatorioTurmaFiltrado(); }, 400);
        } else showToast('❌ ' + (data.erro || 'Erro'), 'error');
    })
    .catch(e => { showToast('❌ ' + e.message, 'error'); });
}
async function salvarNotaProducaoCM() {
    const ni = document.getElementById('cm-nota-valor');
    const sd = document.getElementById('cm-nota-status');
    const btn = document.getElementById('btn-salvar-nota-cm');
    const nota = ni ? ni.value : '';
    const aid = cmStandaloneData.alunoId;
    const pid = cmStandaloneData.provaId;
    if (!aid || !pid) { showToast('❌ Sem aluno ou prova!', 'error'); return; }
    if (!nota || nota === '') { showToast('❌ Digite a nota!', 'error'); if (ni) ni.focus(); return; }
    const n = parseFloat(nota);
    if (isNaN(n) || n < 0 || n > 10) { showToast('❌ Nota 0-10!', 'error'); return; }
    if (sd) { sd.className = 'sucesso'; sd.textContent = '💾 Salvando...'; sd.style.display = 'block'; sd.style.background = 'rgba(59,130,246,0.12)'; sd.style.color = 'var(--blue)'; sd.style.border = '1.5px solid rgba(59,130,246,0.3)'; }
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
            if (sd) { sd.className = 'sucesso'; sd.textContent = `✅ Nota ${n.toFixed(1)} salva!`; sd.style.background = 'rgba(16,185,129,0.12)'; sd.style.color = 'var(--green)'; sd.style.border = '1.5px solid rgba(16,185,129,0.3)'; }
            if (ni) ni.value = '';
            limparCache();
            setTimeout(() => { carregarDashboard(); carregarUltimasCorrecoes(); }, 500);
        } else { showToast('❌ ' + (d.erro || 'Erro'), 'error'); if (sd) { sd.className = 'erro'; sd.textContent = '❌ ' + (d.erro || 'Erro'); sd.style.background = 'rgba(239,68,68,0.12)'; sd.style.color = 'var(--red)'; } }
    } catch (e) { showToast('❌ ' + e.message, 'error'); if (sd) { sd.className = 'erro'; sd.textContent = '❌ ' + e.message; sd.style.background = 'rgba(239,68,68,0.12)'; sd.style.color = 'var(--red)'; } }
    finally { if (btn) btn.disabled = false; }
}
async function abrirCorrecaoManualDireta(escolaId, turmaId, alunoId, provaId) {
    try {
        showToast('🔄 Carregando...', 'info');
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
async function editarGabaritoDesempenho() {
    const ei = document.getElementById('filtro-escola-desempenho').value;
    const ti = document.getElementById('filtro-turma-desempenho').value;
    const ai = document.getElementById('filtro-aluno-desempenho').value;
    const pi = document.getElementById('filtro-prova-desempenho').value;
    if (!ei || !ti || !ai || !pi) { showToast('⚠️ Selecione todos!', 'error'); return; }
    await abrirCorrecaoManualDireta(ei, ti, ai, pi);
}

// ═══ QR CODE ═══
function abrirCameraAutomatico() { autoModoAtivo = true; abrirCamera(); }
function processarArqAutomatico(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { showToast('❌ Imagem grande!', 'error'); return; }
    const reader = new FileReader();
    reader.onload = function(e) {
        const base64 = e.target.result;
        const prev = document.getElementById('auto-preview');
        const img = document.getElementById('auto-img-prev');
        if (prev && img) { img.src = base64; prev.style.display = 'block'; }
        const res = document.getElementById('auto-resultado'); if (res) res.style.display = 'none';
        window._autoImagem = base64;
        showToast('✅ Imagem carregada!', 'success');
    };
    reader.readAsDataURL(file);
}
async function corrigirAutomatico() {
    const img = window._autoImagem;
    if (!img) { showToast('❌ Sem imagem!', 'error'); return; }
    const rd = document.getElementById('auto-resultado');
    const cd = document.getElementById('auto-resultado-conteudo');
    if (rd) rd.style.display = 'block';
    if (cd) cd.innerHTML = '<div style="text-align:center;padding:20px;"><div class="spinner" style="margin:0 auto 14px;"></div><p style="font-weight:700;">🔍 Lendo QR Code...</p></div>';
    try {
        const r = await apiFetch(`${API_URL}/api/corrigir-automatico`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imagem: img, salvar_auto: false }) });
        let dados = null;
        try { dados = await r.json(); } catch (e) { dados = null; }
        if (!dados) { mostrarErroAutomatico(`Resposta inválida (${r.status})`); return; }
        if (!r.ok || !dados.sucesso) { mostrarErroAutomatico(dados.erro || 'Erro', dados.dicas); return; }
        mostrarResultadoAutomatico(dados);
        window._autoImagem = null;
        const prev = document.getElementById('auto-preview'); if (prev) prev.style.display = 'none';
    } catch (e) { mostrarErroAutomatico('Erro: ' + e.message); }
}
function mostrarErroAutomatico(msg, dicas) {
    const cd = document.getElementById('auto-resultado-conteudo');
    if (!cd) return;
    let dh = '';
    if (dicas && Array.isArray(dicas)) { dh = '<div style="margin-top:14px;padding:12px;background:rgba(245,158,11,.1);border-radius:8px;border-left:3px solid var(--orange);"><strong>Dicas:</strong><ul style="margin-top:6px;padding-left:20px;font-size:13px;color:var(--text2);line-height:1.7;">'; dicas.forEach(d => { dh += `<li>${escapeHtml(d)}</li>`; }); dh += '</ul></div>'; }
    cd.innerHTML = `<div style="padding:16px;background:rgba(239,68,68,.08);border-radius:10px;border-left:4px solid var(--red);"><div style="font-size:15px;font-weight:700;color:var(--red);margin-bottom:8px;">❌ ${escapeHtml(msg)}</div>${dh}</div>`;
}
function mostrarResultadoAutomatico(dados) {
    const cd = document.getElementById('auto-resultado-conteudo');
    if (!cd) return;
    if (dados.sucesso || !dados.erro) {
        const gab = dados.gabarito || [];
        const resps = dados.respostas_detectadas || [];
        const qtd = dados.total || gab.length || 20;
        const tipo = parseInt(dados.tipo_questoes) || 4;
        const alts = tipo === 3 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
        correcaoManualData = { alunoId: dados.aluno_id || dados.qr_lido?.aluno_id, alunoNome: dados.aluno || 'Aluno', provaId: dados.prova_id || dados.qr_lido?.prova_id, provaTitulo: dados.prova_titulo || 'Prova', gabarito: gab, respostasAluno: resps.slice(), quantidade: qtd, alternativas: alts, notaMaxima: 10, notaMinima: 5, valorPorQuestao: 10/qtd, serie: dados.serie || '', disciplina: dados.disciplina || '', confianca_por_questao: dados.confianca_por_questao || [], questoes_suspeitas: dados.questoes_suspeitas || [], bncc: dados.bncc || [], questoes_status: dados.questoes_status || [] };
    }
    const nota = dados.nota || 0, acertos = dados.acertos || 0, total = dados.total || 0, pct = dados.porcentagem || 0;
    const conceito = dados.conceito?.nome || 'inicial';
    const cor = { 'inicial': '#ef4444', 'basico': '#f59e0b', 'proficiente': '#3b82f6', 'avancado': '#10b981' }[conceito] || '#94a3b8';
    const cLabel = { 'inicial': '🔴 Inicial', 'basico': '🟠 Básico', 'proficiente': '🔵 Proficiente', 'avancado': '🟢 Avançado' }[conceito] || conceito;
    let qh = '';
    if (dados.questoes_status && Array.isArray(dados.questoes_status)) {
        qh = '<div style="display:grid;grid-template-columns:repeat(10,1fr);gap:4px;margin-top:12px;">';
        dados.questoes_status.forEach(q => {
            const ac = q.acertou, r = q.resposta || '—';
            const bg = ac ? 'rgba(16,185,129,.15)' : (q.resposta !== '—' ? 'rgba(239,68,68,.15)' : 'rgba(100,116,139,.1)');
            const ct = ac ? 'var(--green)' : (q.resposta !== '—' ? 'var(--red)' : 'var(--text3)');
            const ic = ac ? '✅' : (q.resposta !== '—' ? '❌' : '—');
            qh += `<div style="background:${bg};border-radius:6px;padding:5px 2px;text-align:center;"><div style="font-size:8px;color:var(--text3);font-weight:700;">Q${q.numero}</div><div style="font-size:13px;font-weight:800;color:${ct};">${escapeHtml(r)}</div><div style="font-size:8px;">${ic}</div></div>`;
        });
        qh += '</div>';
    }
    cd.innerHTML = `<div style="background:linear-gradient(135deg,rgba(139,92,246,.08),rgba(6,182,212,.08));border-radius:12px;padding:16px;border:2px solid rgba(139,92,246,.3);">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px;"><div style="font-size:16px;font-weight:800;color:#a78bfa;">✅ Correção Concluída!</div><span class="badge badge-purple">QR CODE</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;font-size:13px;">
            <div style="background:var(--surface2);border-radius:8px;padding:10px;"><div style="color:var(--text3);font-size:9px;font-weight:700;">ALUNO</div><div style="font-weight:700;">${escapeHtml(dados.aluno || '—')}</div></div>
            <div style="background:var(--surface2);border-radius:8px;padding:10px;"><div style="color:var(--text3);font-size:9px;font-weight:700;">PROVA</div><div style="font-weight:700;">${escapeHtml(dados.prova_titulo || '—')}</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:14px;">
            <div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center;"><div style="font-size:26px;font-weight:900;color:var(--green);">${acertos}</div><div style="font-size:10px;color:var(--text3);font-weight:700;">✅ ACERTOS</div></div>
            <div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center;"><div style="font-size:26px;font-weight:900;color:var(--red);">${total - acertos}</div><div style="font-size:10px;color:var(--text3);font-weight:700;">❌ ERROS</div></div>
            <div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center;"><div style="font-size:26px;font-weight:900;color:var(--blue);">${pct}%</div><div style="font-size:10px;color:var(--text3);font-weight:700;">📊</div></div>
            <div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center;"><div style="font-size:26px;font-weight:900;color:${cor};">${nota.toFixed(1)}</div><div style="font-size:10px;color:var(--text3);font-weight:700;">⭐ NOTA</div></div>
        </div>
        <div style="text-align:center;margin-bottom:10px;"><span style="background:${cor}20;color:${cor};padding:6px 18px;border-radius:20px;font-size:13px;font-weight:800;">${cLabel}</span></div>
        ${qh}
        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;justify-content:center;">
            <button class="btn btn-orange btn-sm" onclick="abrirCorrecaoManualAuto()">✏️ Manual</button>
            <button class="btn btn-green btn-sm" onclick="salvarCorrecaoAuto()">💾 Salvar</button>
            <button class="btn btn-outline btn-sm" onclick="limparResultadoAutomatico()">🔄 Nova</button>
        </div>
    </div>`;
    cd.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast(`✅ Corrigido! Nota ${nota.toFixed(1)}`, 'success');
}
function limparResultadoAutomatico() {
    const r = document.getElementById('auto-resultado'); if (r) r.style.display = 'none';
    const p = document.getElementById('auto-preview'); if (p) p.style.display = 'none';
    const i = document.getElementById('auto-img-prev'); if (i) i.src = '';
    const inp = document.getElementById('inp-arq-auto'); if (inp) inp.value = '';
    window._autoImagem = null;
    showToast('🔄 Pronto!', 'info');
}
function abrirCorrecaoManualAuto() {
    if (!correcaoManualData || !correcaoManualData.respostasAluno || correcaoManualData.respostasAluno.length === 0) { showToast('❌ Nada!', 'error'); return; }
    if (!correcaoManualData.gabarito || correcaoManualData.gabarito.length === 0) { showToast('❌ Gabarito vazio!', 'error'); return; }
    abrirCorrecaoManual();
}
async function salvarCorrecaoAuto() {
    if (!correcaoManualData || !correcaoManualData.respostasAluno) { showToast('❌ Nada!', 'error'); return; }
    if (!correcaoManualData.provaId || !correcaoManualData.alunoId) { showToast('❌ Incompleto!', 'error'); return; }
    await salvarCorrecao();
}

// ═══ GABARITO ═══
function buildGabGrid() {
    const grid = document.getElementById('gab-grid');
    const hc = document.getElementById('gab-header-container');
    const ia = document.getElementById('gab-info-alts');
    const pr = document.getElementById('gab-pts-row');
    if (!grid) return;
    const se = document.getElementById('gab-serie');
    const te = document.getElementById('gab-total');
    const ps = document.getElementById('gab-prova');
    if (!se || !te || !ps) return;
    if (ps.options.length <= 1 && typeof carregarProvasParaGabarito === 'function') carregarProvasParaGabarito();
    const so = ps.options[ps.selectedIndex];
    const pn = so ? so.text || 'Gabarito' : 'Gabarito';
    const disc = so ? so.dataset.disciplina : '';
    const isProd = (disc === 'Produção de Texto');
    if (pr) pr.style.display = isProd ? 'none' : 'grid';
    if (hc) hc.innerHTML = `<div class="gab-header-title"><span class="icon">📝</span><span>Gabarito: <span class="prova-nome">${escapeHtml(pn)}</span></span><span class="badge-disciplina">${escapeHtml(disc || 'Disciplina')}</span></div>`;
    if (ia) ia.innerHTML = isProd ? '<div style="padding:8px 14px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:8px;font-size:12px;font-weight:700;color:var(--orange);">📝 PRODUÇÃO DE TEXTO</div>' : '<div style="padding:8px 14px;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.3);border-radius:8px;font-size:12px;font-weight:700;color:#a78bfa;">📝 4 alternativas A, B, C, D</div>';
    const total = parseInt(te.value) || 20;
    if (isProd) {
        grid.style.cssText = 'display:flex;flex-direction:column;gap:16px;';
        grid.innerHTML = '';
        if (!gabProducaoData.questoes || gabProducaoData.questoes.length === 0) {
            gabProducaoData.questoes = [];
            for (let i = 0; i < total; i++) gabProducaoData.questoes.push({ titulo: `Q${i+1}`, cabecalho: '', alternativas: { A: '', B: '', C: '' }, situacao: '' });
        } else {
            while (gabProducaoData.questoes.length < total) { const idx = gabProducaoData.questoes.length + 1; gabProducaoData.questoes.push({ titulo: `Q${idx}`, cabecalho: '', alternativas: { A: '', B: '', C: '' }, situacao: '' }); }
            if (gabProducaoData.questoes.length > total) gabProducaoData.questoes = gabProducaoData.questoes.slice(0, total);
        }
        for (let i = 0; i < total; i++) {
            const q = gabProducaoData.questoes[i];
            const card = document.createElement('div');
            card.className = 'gab-producao-questao';
            card.dataset.index = i;
            card.innerHTML = `<div class="gab-producao-header"><input class="gab-titulo-editavel" type="text" value="${escapeAttr(q.titulo || 'Q'+(i+1))}" data-index="${i}" onchange="atualizarTituloProducao(this)" placeholder="Ex: Q1"><textarea class="gab-cabecalho" data-index="${i}" onchange="atualizarCabecalhoProducao(this)" placeholder="Cabeçalho...">${escapeHtml(q.cabecalho || '')}</textarea></div><div class="gab-alternativas-lista" id="gab-alts-${i}"></div>`;
            grid.appendChild(card);
            renderizarAlternativasProducao(i, document.getElementById(`gab-alts-${i}`));
        }
        return;
    }
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill, minmax(120px, 1fr));gap:14px;';
    grid.innerHTML = '';
    const alts = ['A', 'B', 'C', 'D'];
    for (let i = 1; i <= total; i++) {
        const div = document.createElement('div');
        div.className = 'gab-item';
        let opts = '<option value="">—</option>'; alts.forEach(a => { opts += '<option>' + a + '</option>'; });
        div.innerHTML = `<div class="gab-num">Q${i}</div><select class="gab-select" onchange="this.classList.toggle('filled', this.value!='')">${opts}</select><input class="gab-bncc" placeholder="BNCC" style="width:100%;margin-top:2px;padding:5px 8px;background:var(--bg);border:2px solid var(--border2);border-radius:6px;color:var(--text);font-size:10px;text-align:center;" />`;
        grid.appendChild(div);
    }
}
function renderizarAlternativasProducao(idx, cont) {
    const q = gabProducaoData.questoes[idx];
    if (!q || !cont) return;
    const ao = Object.keys(q.alternativas).sort();
    cont.innerHTML = '';
    ao.forEach(l => { const it = document.createElement('div'); it.className = 'gab-alternativa-item'; it.innerHTML = `<div class="alt-letra">${escapeHtml(l)}</div><textarea class="alt-texto" placeholder="Resposta ${escapeHtml(l)}..." data-index="${idx}" data-letra="${l}" onchange="atualizarAlternativaProducao(this)">${escapeHtml(q.alternativas[l] || '')}</textarea>${ao.length > 1 ? `<button class="btn-remover-alt" onclick="removerAlternativaProducao(${idx}, '${l}')" title="Remover">×</button>` : ''}`; cont.appendChild(it); });
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const ul = ao[ao.length - 1] || 'C';
    const pl = letras[letras.indexOf(ul) + 1];
    if (pl && letras.indexOf(ul) < 25) { const b = document.createElement('button'); b.className = 'btn btn-outline btn-sm'; b.style.cssText = 'align-self:flex-start;margin-top:4px;'; b.textContent = `➕ Adicionar ${pl}`; b.onclick = () => adicionarAlternativaProducao(idx); cont.appendChild(b); }
}
function atualizarTituloProducao(inp) { const i = parseInt(inp.dataset.index); if (gabProducaoData.questoes[i]) gabProducaoData.questoes[i].titulo = inp.value; }
function atualizarCabecalhoProducao(ta) { const i = parseInt(ta.dataset.index); if (gabProducaoData.questoes[i]) gabProducaoData.questoes[i].cabecalho = ta.value; }
function atualizarAlternativaProducao(ta) {
    const i = parseInt(ta.dataset.index), l = ta.dataset.letra;
    if (!gabProducaoData.questoes[i]) return;
    gabProducaoData.questoes[i].alternativas[l] = ta.value;
    const ls = Object.keys(gabProducaoData.questoes[i].alternativas).sort();
    const ul = ls[ls.length - 1];
    if (l === ul && ta.value.trim() !== '') {
        const l26 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const p = l26[l26.indexOf(ul) + 1];
        if (p && !gabProducaoData.questoes[i].alternativas[p]) {
            gabProducaoData.questoes[i].alternativas[p] = '';
            const c = document.getElementById(`gab-alts-${i}`); if (c) renderizarAlternativasProducao(i, c);
        }
    }
}
function atualizarSituacaoProducao(s) { const i = parseInt(s.dataset.index); if (gabProducaoData.questoes[i]) gabProducaoData.questoes[i].situacao = s.value; }
function adicionarAlternativaProducao(i) { const q = gabProducaoData.questoes[i]; if (!q) return; const l26 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; const at = Object.keys(q.alternativas).sort(); const ul = at[at.length-1] || 'A'; const p = l26[l26.indexOf(ul)+1]; if (p) { q.alternativas[p] = ''; const c = document.getElementById(`gab-alts-${i}`); if (c) renderizarAlternativasProducao(i, c); } }
function removerAlternativaProducao(i, l) { const q = gabProducaoData.questoes[i]; if (!q) return; if (Object.keys(q.alternativas).length <= 1) { showToast('⚠️ Pelo menos uma!', 'warning'); return; } delete q.alternativas[l]; const c = document.getElementById(`gab-alts-${i}`); if (c) renderizarAlternativasProducao(i, c); }
function fillGabRand() {
    const ps = document.getElementById('gab-prova');
    const so = ps.options[ps.selectedIndex];
    if (so && so.dataset.disciplina === 'Produção de Texto') { showToast('🎲 Não pra produção', 'warning'); return; }
    const alts = ['A', 'B', 'C', 'D'];
    document.querySelectorAll('.gab-select').forEach(s => { s.value = alts[Math.floor(Math.random() * alts.length)]; s.classList.add('filled'); });
    showToast('🎲 Preenchido!');
}
function clearGab() {
    const ps = document.getElementById('gab-prova');
    const so = ps.options[ps.selectedIndex];
    if (so && so.dataset.disciplina === 'Produção de Texto') {
        document.querySelectorAll('.gab-titulo-editavel').forEach((i, ix) => i.value = 'Q' + (ix+1));
        document.querySelectorAll('.gab-cabecalho').forEach(t => t.value = '');
        document.querySelectorAll('.alt-texto').forEach(t => t.value = '');
        gabProducaoData.questoes.forEach(q => { q.cabecalho = ''; q.situacao = ''; Object.keys(q.alternativas).forEach(k => q.alternativas[k] = ''); });
    } else {
        document.querySelectorAll('.gab-select').forEach(s => { s.value = ''; s.classList.remove('filled'); });
        document.querySelectorAll('.gab-bncc').forEach(i => i.value = '');
    }
}
async function saveGab() {
    try {
        const ps = document.getElementById('gab-prova');
        const so = ps.options[ps.selectedIndex];
        const disc = so ? so.dataset.disciplina : '';
        const isProd = (disc === 'Produção de Texto');
        const pid = ps.value;
        if (!pid) { showToast('❌ Selecione prova!', 'error'); return; }
        if (isProd) {
            const total = gabProducaoData.questoes.length;
            if (total === 0) { showToast('⚠️ Sem questões', 'error'); return; }
            const tq = gabProducaoData.questoes.map(q => ({ titulo: q.titulo || '', cabecalho: q.cabecalho || '', alternativas: q.alternativas || {} }));
            const resps = gabProducaoData.questoes.map(q => { const a = q.alternativas || {}; return Object.keys(a).sort().map(k => `${k}) ${a[k] || ''}`).join('\n'); });
            const nv = gabProducaoData.questoes.map(q => q.situacao || '');
            const bncc = gabProducaoData.questoes.map(() => '');
            showToast('💾 Salvando...', 'info');
            const r = await apiFetch(`${API_URL}/api/gabaritos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prova_id: parseInt(pid), respostas: resps, bncc, textos_questoes: tq, niveis: nv }) });
            const res = await r.json();
            if (r.ok && res.id) { showToast('✅ ' + (res.mensagem || 'Salvo!'), 'success'); limparCache(); carregarGabaritos(); carregarCombos(); carregarProvas(); }
            else showToast('❌ ' + (res.erro || 'Erro'), 'error');
            return;
        }
        const resps = [], bncc = [];
        const sels = document.querySelectorAll('.gab-select');
        const bis = document.querySelectorAll('.gab-bncc');
        sels.forEach((s, ix) => { resps.push(s.value || ''); if (bis[ix]) bncc.push(bis[ix].value.trim() || ''); });
        if (resps.filter(r => r !== '').length === 0) { showToast('⚠️ Preencha uma!', 'error'); return; }
        showToast('💾 Salvando...', 'info');
        const r = await apiFetch(`${API_URL}/api/gabaritos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prova_id: parseInt(pid), respostas: resps, bncc }) });
        const res = await r.json();
        if (r.ok && res.id) { showToast('✅ ' + (res.mensagem || 'Salvo!'), 'success'); limparCache(); carregarGabaritos(); carregarCombos(); carregarProvas(); }
        else showToast('❌ ' + (res.erro || 'Erro'), 'error');
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}
async function editarGabarito(id) {
    showToast('✏️ Carregando...', 'info');
    try {
        const r = await apiFetch(API_URL + '/api/provas/' + id);
        const prova = await r.json();
        if (!prova || prova.erro) { showToast('❌ ' + (prova.erro || 'Erro'), 'error'); return; }
        go('gabarito');
        if (typeof carregarProvasParaGabarito === 'function') await carregarProvasParaGabarito();
        if (!prova.gabarito || prova.gabarito.length === 0) { showToast('⚠️ Sem gabarito', 'warning'); return; }
        const gab = prova.gabarito, bncc = prova.bncc || [], disc = prova.disciplina || '';
        const isProd = (disc === 'Produção de Texto');
        const sm = { '1º Ano': '1', '2º Ano': '2', '3º Ano': '3', '4º Ano': '4', '5º Ano': '5', '6º Ano': '6', '7º Ano': '7', '8º Ano': '8', '9º Ano': '9' };
        document.getElementById('gab-serie').value = sm[prova.serie] || '2';
        document.getElementById('gab-total').value = prova.quantidade_questoes || 20;
        const sp = document.getElementById('gab-prova'); if (sp) sp.value = String(id);
        if (isProd) {
            const tx = prova.textos_questoes || [], nv = prova.niveis || [], tot = prova.quantidade_questoes || gab.length || 20;
            gabProducaoData.questoes = [];
            for (let i = 0; i < tot; i++) {
                const tq = tx[i] || {};
                gabProducaoData.questoes.push({ titulo: (tq && tq.titulo) ? tq.titulo : `Q${i+1}`, cabecalho: (tq && tq.cabecalho) ? tq.cabecalho : '', alternativas: (tq && tq.alternativas) ? { ...tq.alternativas } : { A: '', B: '', C: '' }, situacao: nv[i] || '' });
            }
        }
        buildGabGrid();
        if (isProd) showToast('📋 Produção carregada!', 'success');
        else {
            const sels = document.querySelectorAll('.gab-select');
            const bis = document.querySelectorAll('.gab-bncc');
            sels.forEach((s, i) => { if (i < gab.length && gab[i]) { s.value = gab[i]; s.classList.add('filled'); } });
            bis.forEach((i, ix) => { if (ix < bncc.length && bncc[ix]) i.value = bncc[ix]; });
            showToast('📋 Carregado!', 'success');
        }
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}
async function excluirGabarito(id, nome) {
    if (!confirm('Excluir gabarito "' + nome + '"?')) return;
    try {
        showToast('🗑️ Excluindo...', 'error');
        const r = await apiFetch(API_URL + '/api/gabaritos/' + id, { method: 'DELETE' });
        const res = await processarRespostaAPI(r);
        if (res.ok) { showToast('🗑️ Excluído!', 'success'); limparCache(); carregarGabaritos(); carregarProvas(); }
        else showToast('❌ ' + (res.data.erro || 'Erro'), 'error');
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
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

// ═══ AUXILIARES ═══
function gerarGabaritoModal(tipo) {
    const grid = document.getElementById('modal-gabarito-grid'); if (!grid) return;
    const n = 20, alts = tipo == '3' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
    grid.innerHTML = '';
    for (let i = 1; i <= n; i++) {
        const inp = document.createElement('input');
        inp.type = 'text'; inp.maxLength = 1;
        inp.style.cssText = 'width:40px;height:35px;text-align:center;background:var(--bg2);border:1.5px solid var(--border2);border-radius:6px;color:var(--text);font-weight:bold;font-size:14px;text-transform:uppercase;';
        inp.placeholder = i; inp.title = 'Questão ' + i;
        inp.addEventListener('input', function() { this.value = this.value.toUpperCase().replace(/[^A-D]/g, ''); if (this.value && !alts.includes(this.value)) this.value = ''; });
        grid.appendChild(inp);
    }
}
function atualizarInfoAlts() {
    const disc = document.getElementById('prova-disciplina')?.value || '';
    const info = document.getElementById('info-alts');
    if (!info) return;
    if (disc === 'Produção de Texto') { info.textContent = '📝 Produção de Texto'; info.style.color = '#a78bfa'; info.style.borderColor = 'rgba(139,92,246,.25)'; info.style.background = 'rgba(139,92,246,.07)'; }
    else { info.textContent = '📝 4 alternativas A, B, C, D'; info.style.color = 'var(--blue)'; info.style.borderColor = 'rgba(59,130,246,.25)'; info.style.background = 'rgba(59,130,246,.07)'; }
}
async function carregarCombos() {
    try {
        const escolas = await carregarEscolasComCache();
        ['turma-escola', 'prova-escola', 'lista-escola', 'editar-turma-escola'].forEach(id => {
            const s = document.getElementById(id);
            if (s) { const c = s.value; s.innerHTML = '<option value="">Selecione a escola</option>'; if (escolas && !escolas.erro) escolas.forEach(e => { const o = document.createElement('option'); o.value = e.id; o.textContent = e.nome; s.appendChild(o); }); if (c) s.value = c; }
        });
        await carregarEscolasParaAluno();
        const turmas = await carregarTurmasComCache();
        ['aluno-turma', 'modal-prova-turma', 'lista-turma', 'editar-aluno-turma'].forEach(id => {
            const s = document.getElementById(id);
            if (s) { const c = s.value; s.innerHTML = '<option value="">Selecione a turma</option>'; if (turmas && !turmas.erro) turmas.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.nome + ' - ' + (t.serie || '—'); s.appendChild(o); }); if (c) s.value = c; }
        });
        const provas = await carregarProvasComCache();
        ['gab-prova', 'corrigir-prova', 'txt-prova'].forEach(id => {
            const s = document.getElementById(id);
            if (s) { const c = s.value; s.innerHTML = '<option value="">Selecione a prova</option>'; if (provas && !provas.erro) provas.forEach(p => { const o = document.createElement('option'); o.value = p.id; const sr = p.serie || '—'; o.textContent = p.titulo + ' - ' + sr + ' - ' + (p.disciplina || ''); o.dataset.serie = sr; o.dataset.quantidade = p.quantidade_questoes || 20; o.dataset.gabarito = JSON.stringify(p.gabarito || []); o.dataset.tipo = p.tipo_questoes || '4'; o.dataset.disciplina = p.disciplina || ''; o.dataset.bncc = JSON.stringify(p.bncc || []); s.appendChild(o); }); if (c) s.value = c; }
        });
        const alunos = await carregarAlunosComCache();
        ['corrigir-aluno', 'txt-aluno-select'].forEach(id => {
            const s = document.getElementById(id);
            if (s) { const c = s.value; s.innerHTML = '<option value="">Selecione o aluno</option>'; if (alunos && !alunos.erro) alunos.forEach(a => { const o = document.createElement('option'); o.value = a.id; o.textContent = a.nome; s.appendChild(o); }); if (c) s.value = c; }
        });
    } catch (e) { console.error(e); }
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
        if (se) { const c = se.value; se.innerHTML = '<option value="">Selecione a escola</option>'; escolas.forEach(e => { const o = document.createElement('option'); o.value = e.id; o.textContent = e.nome; se.appendChild(o); }); if (c && escolas.some(e => e.id == c)) { se.value = c; carregarTurmasPorEscolaParaAluno(c, 'editar-aluno-turma'); } }
    } catch (e) { console.error(e); }
}

// ═══ LISTA / CARTÕES ═══
async function carregarTurmasLista(escolaId) {
    const s = document.getElementById('lista-turma'); if (!s) return;
    s.innerHTML = '<option value="">Selecione a turma</option>';
    if (!escolaId) return;
    try {
        const turmas = await carregarTurmasComCache(escolaId);
        if (turmas && !turmas.erro) turmas.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.nome + ' - ' + (t.serie || ''); s.appendChild(o); });
    } catch (e) { console.error(e); }
}
async function gerarListaTurma() {
    const ei = document.getElementById('lista-escola').value;
    const ti = document.getElementById('lista-turma').value;
    const pi = document.getElementById('lista-prova-select')?.value || '';
    if (!ti || !ei) { showToast('❌ Selecione escola e turma!', 'error'); return; }
    try {
        const alunos = await carregarAlunosComCache({ turma_id: ti });
        const turmas = await carregarTurmasComCache();
        const turma = turmas.find(t => t.id == ti);
        const cont = document.getElementById('lista-resultado'); if (!cont) return;
        if (!alunos || alunos.length === 0 || alunos.erro) { cont.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3);">Nenhum aluno</div>'; return; }
        const provas = await carregarProvasComCache();
        let provasDisp = provas.filter(p => p.serie === turma?.serie);
        if (provasDisp.length === 0) provasDisp = provas;
        let prova = pi ? provas.find(p => p.id == pi) : null;
        if (!prova && provasDisp.length > 0) prova = provasDisp[0];
        if (!prova) { cont.innerHTML = '<div style="text-align:center;padding:30px;color:var(--orange);"><p>Nenhuma prova para esta turma</p><button class="btn btn-primary" style="margin-top:10px;" onclick="go(\'prova-upload\')">+ Cadastrar</button></div>'; return; }
        const escolas = await carregarEscolasComCache();
        const escola = escolas.find(e => e.id == turma?.escola_id);
        let pOpts = ''; provasDisp.forEach(p => { const s = p.id == prova.id ? 'selected' : ''; pOpts += `<option value="${p.id}" ${s}>${escapeHtml(p.titulo)} (${escapeHtml(p.disciplina || '—')})</option>`; });
        let html = `<div style="text-align:center;padding:12px 0 18px;border-bottom:1px solid var(--border);margin-bottom:14px;"><div style="font-size:16px;font-weight:800;">${escapeHtml(escola?.nome || 'Escola')}</div><div style="color:var(--text2);font-size:13px;margin-top:4px;">Turma: ${escapeHtml(turma?.nome || '—')} | Série: ${escapeHtml(turma?.serie || '—')}</div><div style="margin-top:10px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;"><div style="display:flex;align-items:center;gap:8px;"><label style="font-size:12px;font-weight:600;">📖 Prova:</label><select id="lista-prova-select" class="form-control" style="width:250px;padding:6px 10px;font-size:12px;" onchange="gerarListaTurma()">${pOpts}</select></div><button class="btn btn-green" onclick="gerarCartoesTodosAlunos(${ei}, ${ti}, ${prova.id})">📄 TODOS</button><button class="btn btn-primary" onclick="gerarListaTurma()">🔄</button></div></div><div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;max-height:400px;overflow-y:auto;">`;
        alunos.forEach(a => { html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);"><div><strong>${escapeHtml(a.nome)}</strong> <span class="badge badge-blue">Nº ${escapeHtml(a.numero_chamada || '—')}</span></div><button class="btn btn-primary btn-sm" onclick="gerarCartaoResposta(${ei}, ${ti}, ${a.id}, ${prova.id})">📄 Gerar</button></div>`; });
        html += '</div>';
        cont.innerHTML = html;
        showToast(`📋 ${alunos.length} alunos`, 'info');
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}
async function gerarCartaoResposta(escolaId, turmaId, alunoId, provaId) {
    try {
        const aba = window.open('', '_blank');
        if (!aba) { showToast('❌ Permita pop-ups!', 'error'); return; }
        aba.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>...</title></head><body style="text-align:center;padding:50px;font-family:Arial;"><h2>⏳ Gerando...</h2></body></html>');
        aba.document.close();
        const r = await apiFetch(`${API_URL}/api/gerar_gabarito`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ escola_id: parseInt(escolaId), turma_id: parseInt(turmaId), aluno_id: parseInt(alunoId), prova_id: parseInt(provaId) }) });
        if (!r.ok) throw new Error(`Erro ${r.status}`);
        const html = await r.text();
        aba.document.open(); aba.document.write(html); aba.document.close();
        showToast('✅ Cartão gerado!', 'success');
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}
async function gerarCartoesTodosAlunos(escolaId, turmaId, provaId) {
    try {
        showToast('📄 Gerando...', 'info');
        const alunos = await carregarAlunosComCache({ turma_id: turmaId });
        if (!alunos || alunos.length === 0) { showToast('❌ Sem alunos!', 'error'); return; }
        alunos.forEach((a, i) => setTimeout(() => gerarCartaoResposta(escolaId, turmaId, a.id, provaId), i * 300));
        showToast(`✅ Gerando ${alunos.length} cartões...`, 'success');
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

// ═══ IMPRESSÃO ═══
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
    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Lista</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial;margin:30px;}h1{text-align:center;font-size:24px;margin-bottom:8px;}.filtros{text-align:center;color:#555;margin-bottom:20px;font-size:14px;}table{width:100%;border-collapse:collapse;font-size:12px;}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;}th{background:#f2f2f2;font-weight:700;}tr:nth-child(even){background:#fafafa;}.footer{text-align:center;margin-top:20px;color:#999;font-size:12px;}</style></head><body><h1>📋 Lista de Alunos</h1><div class="filtros"><strong>Escola:</strong> ${escapeHtml(en)} | <strong>Turma:</strong> ${escapeHtml(tn)} | <strong>Série:</strong> ${escapeHtml(sn)}</div><table><thead><tr><th>Nº</th><th>Matrícula</th><th>Nome</th><th>Série</th><th>Turma</th><th>Escola</th></tr></thead><tbody>`;
    rows.forEach(r => { const c = r.querySelectorAll('td'); if (c.length >= 6) html += `<tr><td>${escapeHtml(c[0].textContent.trim())}</td><td>${escapeHtml(c[1].textContent.trim())}</td><td>${escapeHtml(c[2].textContent.trim())}</td><td>${escapeHtml(c[3].textContent.trim())}</td><td>${escapeHtml(c[4].textContent.trim())}</td><td>${escapeHtml(c[5].textContent.trim())}</td></tr>`; });
    html += `</tbody></table><div class="footer">Gerado em ${new Date().toLocaleString('pt-BR')}</div></body></html>`;
    const w = window.open('', '_blank'); if (!w) { showToast('⚠️ Pop-up!', 'error'); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
}
function imprimirRelatorioTurma() {
    const table = document.querySelector('#tb-rel-alunos')?.closest('table');
    if (!table) { showToast('❌ Sem dados!', 'error'); return; }
    const rows = table.querySelectorAll('tbody tr');
    if (rows.length === 0 || (rows.length === 1 && rows[0].textContent.includes('Nenhum'))) { showToast('⚠️ Sem dados', 'error'); return; }
    const es = document.getElementById('rel-turma-escola');
    const se = document.getElementById('rel-turma-serie');
    const tu = document.getElementById('rel-turma-turma');
    const pr = document.getElementById('rel-turma-prova');
    const en = es?.options[es.selectedIndex]?.text || 'Todas';
    const sn = se?.options[se.selectedIndex]?.text || 'Todas';
    const tn = tu?.options[tu.selectedIndex]?.text || 'Todas';
    const pn = pr?.options[pr.selectedIndex]?.text || 'Todas';
    const thead = table.querySelector('thead');
    const theadRows = thead?.querySelectorAll('tr') || [];
    const colunas = [];
    if (theadRows.length > 1) {
        const r1 = theadRows[0].querySelectorAll('th');
        const r2 = theadRows[1].querySelectorAll('th');
        let i2 = 0;
        r1.forEach(th1 => {
            const cs = parseInt(th1.getAttribute('colspan')) || 1;
            const rs = parseInt(th1.getAttribute('rowspan')) || 1;
            const txt = th1.textContent.trim();
            if (rs === 2) colunas.push({ tipo: 'fixa', nome: txt });
            else { const sub = []; for (let k = 0; k < cs; k++) sub.push(r2[i2 + k]?.textContent.trim() || ''); i2 += cs; colunas.push({ tipo: 'disc', nome: txt, sub }); }
        });
    } else theadRows[0]?.querySelectorAll('th').forEach(th => colunas.push({ tipo: 'fixa', nome: th.textContent.trim() }));
    const colsFlat = [];
    colunas.forEach(c => { if (c.tipo === 'fixa') colsFlat.push({ nome: c.nome, kind: 'other' }); else c.sub.forEach(s => { const su = s.toUpperCase(); colsFlat.push({ nome: s, kind: su.includes('ACERT') ? 'acertos' : su.includes('ERRO') ? 'erros' : su.includes('NOTA') ? 'nota' : 'other' }); }); });
    let somaAc = 0, somaEr = 0, somaNt = 0, cntNt = 0;
    const dados = [];
    rows.forEach(r => { const c = r.querySelectorAll('td'); if (c.length === 0) return; const ln = []; c.forEach(x => ln.push(x.textContent.trim())); if (ln.length >= 4) dados.push(ln); });
    dados.forEach(ln => { colsFlat.forEach((col, i) => { if (i >= ln.length) return; const v = parseFloat(ln[i].replace(',', '.')); if (isNaN(v)) return; if (col.kind === 'acertos') somaAc += v; else if (col.kind === 'erros') somaEr += v; else if (col.kind === 'nota') { somaNt += v; cntNt++; } }); });
    const media = cntNt > 0 ? somaNt / cntNt : 0;
    let th1 = '<tr>', th2 = '<tr>';
    colunas.forEach(c => { if (c.tipo === 'fixa') { th1 += `<th rowspan="2">${escapeHtml(c.nome)}</th>`; } else { th1 += `<th colspan="${c.sub.length}">${escapeHtml(c.nome)}</th>`; c.sub.forEach(s => { th2 += `<th>${escapeHtml(s)}</th>`; }); } });
    th1 += '</tr>'; th2 += '</tr>';
    let body = '';
    dados.forEach(ln => { body += '<tr>'; ln.forEach((v, i) => { const k = colsFlat[i]?.kind; body += `<td class="${k === 'acertos' ? 'ac' : k === 'erros' ? 'er' : k === 'nota' ? 'nt' : ''}">${escapeHtml(v)}</td>`; }); body += '</tr>'; });
    const data = new Date().toLocaleString('pt-BR');
    const orient = colsFlat.length > 10 ? 'landscape' : 'portrait';
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relatório</title><style>@page{size:A4 ${orient};margin:12mm;}*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',Arial;font-size:10px;}.cab{text-align:center;border-bottom:3px double #1e3a8a;padding-bottom:8px;margin-bottom:10px;}.cab h2{font-size:14px;font-weight:900;color:#1e3a8a;}.cab h3{font-size:11px;font-weight:700;color:#334155;}.tit{text-align:center;background:linear-gradient(90deg,#1e3a8a,#1e40af);color:#fff;padding:8px;margin:10px 0;font-size:14px;font-weight:900;}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:#f8fafc;padding:8px;border-left:4px solid #1e3a8a;margin-bottom:10px;font-size:9px;}.meta strong{display:block;color:#64748b;font-size:7px;text-transform:uppercase;}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px;}.card{padding:8px;border-radius:6px;text-align:center;border:1.5px solid;}.card .v{font-size:20px;font-weight:900;}.card .l{font-size:7px;font-weight:800;text-transform:uppercase;}.az{background:#eff6ff;border-color:#3b82f6;color:#1e40af;}.vd{background:#ecfdf5;border-color:#10b981;color:#047857;}.vm{background:#fef2f2;border-color:#ef4444;color:#b91c1c;}.rx{background:#f5f3ff;border-color:#8b5cf6;color:#6d28d9;}table{width:100%;border-collapse:collapse;font-size:9px;}th{padding:5px;background:#f1f5f9;border:1px solid #cbd5e1;font-size:8px;text-transform:uppercase;}td{padding:4px;border:1px solid #f1f5f9;text-align:center;}tr:nth-child(even) td{background:#fafbfc;}.ac{color:#10b981;font-weight:700;}.er{color:#ef4444;font-weight:700;}.nt{color:#1e40af;font-weight:900;font-size:10px;}.ass{display:grid;grid-template-columns:repeat(3,1fr);gap:30px;margin-top:24px;text-align:center;}.ass .l{border-top:1.5px solid #1e293b;padding-top:3px;font-size:8px;font-weight:700;margin-top:20px;}.ft{margin-top:16px;padding-top:8px;border-top:1px solid #cbd5e1;display:flex;justify-content:space-between;font-size:7px;color:#64748b;}@media print{body{padding:0;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}}</style></head><body><div class="cab"><h2>NotaCerta AI</h2><h3>Sistema de Correção de Provas</h3></div><div class="tit">📊 Relatório de Desempenho por Turma</div><div class="meta"><div><strong>Escola</strong>${escapeHtml(en)}</div><div><strong>Série</strong>${escapeHtml(sn)}</div><div><strong>Turma</strong>${escapeHtml(tn)}</div><div><strong>Prova</strong>${escapeHtml(pn)}</div></div><div class="cards"><div class="card az"><div class="v">${dados.length}</div><div class="l">Alunos</div></div><div class="card vd"><div class="v">${somaAc}</div><div class="l">Acertos</div></div><div class="card vm"><div class="v">${somaEr}</div><div class="l">Erros</div></div><div class="card rx"><div class="v">${media.toFixed(1)}</div><div class="l">Média</div></div></div><table><thead>${th1}${th2}</thead><tbody>${body}</tbody></table><div class="ass"><div><div class="l">Professor(a)</div></div><div><div class="l">Coordenação</div></div><div><div class="l">Direção</div></div></div><div class="ft"><span>Gerado por <strong>NotaCerta AI</strong></span><span>${data}</span></div></body></html>`;
    const w = window.open('', '_blank'); if (!w) { showToast('⚠️ Pop-up!', 'error'); return; }
    w.document.write(html); w.document.close();
    w.onload = () => setTimeout(() => { w.focus(); w.print(); }, 400);
    showToast('🖨️ Preparando impressão...', 'success');
}
function exportarRelatorioPDF() {
    showToast('📄 Gerando PDF...', 'info');
    imprimirRelatorioTurma();
}

// ═══ RELATÓRIO POR TURMA ═══
async function carregarFiltrosRelTurma() {
    try {
        const escolas = await carregarEscolasComCache();
        const se = document.getElementById('rel-turma-escola');
        if (se && escolas && !escolas.erro) {
            const c = se.value;
            se.innerHTML = '<option value="">Selecione a escola</option>';
            escolas.forEach(e => { const o = document.createElement('option'); o.value = e.id; o.textContent = e.nome; se.appendChild(o); });
            if (c) { se.value = c; if (c) carregarTurmasRelTurma(c); }
        }
        const provas = await carregarProvasComCache();
        const sp = document.getElementById('rel-turma-prova');
        if (sp && provas && !provas.erro) {
            const c = sp.value;
            sp.innerHTML = '<option value="">Selecione a prova</option>';
            provas.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.titulo + ' - ' + (p.serie || '') + ' - ' + (p.disciplina || ''); o.dataset.disciplina = p.disciplina || ''; sp.appendChild(o); });
            if (c) sp.value = c;
        }
    } catch (e) { console.error(e); }
}
async function carregarTurmasRelTurma(escolaId) {
    const st = document.getElementById('rel-turma-turma');
    const ss = document.getElementById('rel-turma-serie');
    if (!st) return;
    st.innerHTML = '<option value="">Selecione a turma</option>';
    try {
        const turmas = escolaId ? await carregarTurmasComCache(escolaId) : await carregarTurmasComCache();
        if (turmas && !turmas.erro) turmas.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.nome + ' - ' + (t.serie || ''); o.dataset.serie = t.serie || ''; st.appendChild(o); });
        if (ss) filtrarTurmasPorSerie(ss, st);
    } catch (e) { console.error(e); }
    carregarRelatorioTurmaFiltrado();
}
async function limparFiltrosRelTurma() {
    console.log('🧹 [Limpar] início');
    try {
        // 1) Limpa os valores de todos os selects
        const ids = ['rel-turma-escola', 'rel-turma-serie', 'rel-turma-turma', 'rel-turma-prova'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.value = '';
                console.log(`🧹 [Limpar] ${id} → ""`);
            } else {
                console.warn(`⚠️ [Limpar] #${id} não existe`);
            }
        });

        // 2) Repopula turma
        const st = document.getElementById('rel-turma-turma');
        if (st) {
            st.innerHTML = '<option value="">Selecione a turma</option>';
            const turmas = await carregarTurmasComCache();
            if (turmas && !turmas.erro) {
                turmas.forEach(t => {
                    const o = document.createElement('option');
                    o.value = t.id;
                    o.textContent = t.nome + ' - ' + (t.serie || '');
                    o.dataset.serie = t.serie || '';
                    st.appendChild(o);
                });
                console.log(`🧹 [Limpar] turmas repopuladas: ${turmas.length}`);
            }
        }

        // 3) Repopula prova
        const sp = document.getElementById('rel-turma-prova');
        if (sp) {
            sp.innerHTML = '<option value="">Selecione a prova</option>';
            const provas = await carregarProvasComCache(true);
            if (provas && !provas.erro) {
                provas.forEach(p => {
                    const o = document.createElement('option');
                    o.value = p.id;
                    o.textContent = p.titulo + ' - ' + (p.serie || '') + ' - ' + (p.disciplina || '');
                    o.dataset.disciplina = p.disciplina || '';
                    sp.appendChild(o);
                });
                console.log(`🧹 [Limpar] provas repopuladas: ${provas.length}`);
            }
        }

        // 4) SÓ AGORA recarrega o relatório
        await carregarRelatorioTurmaFiltrado();
        console.log('🧹 [Limpar] relatório recarregado');

        // 5) Feedback visual
        showToast('✕ Filtros limpos!', 'info');
    } catch (e) {
        console.error('❌ [Limpar] erro:', e);
        showToast('❌ Erro ao limpar: ' + e.message, 'error');
    }
}
async function carregarRelatorioTurmaFiltrado() {
    try {
        const ei = document.getElementById('rel-turma-escola').value;
        const se = document.getElementById('rel-turma-serie').value;
        const ti = document.getElementById('rel-turma-turma').value;
        const sp = document.getElementById('rel-turma-prova');
        const pi = sp.value;
        const op = sp.options[sp.selectedIndex];

        // ─── 1) Mapeamento de disciplinas ───
        const dm = {
            'Português':         { k: 'portugues',  label: 'Português' },
            'Matemática':        { k: 'matematica', label: 'Matemática' },
            'Produção de Texto': { k: 'producao',   label: 'Produção', prod: true },
            'Ciências Humanas':  { k: 'ch',         label: 'CH' },
            'Ciências Naturais': { k: 'cn',         label: 'CN' },
            'História':          { k: 'ch',         label: 'CH' },
            'Geografia':         { k: 'ch',         label: 'CH' },
            'Inglês':            { k: 'portugues',  label: 'Português' }
        };

        // ─── 2) Determinar disciplina (SEM default fixo de Português) ───
        let discSel = '';
        if (op && op.value && op.dataset.disciplina) {
            // Tem prova selecionada → usa a disciplina dela
            discSel = op.dataset.disciplina;
        } else {
            // Sem prova selecionada → usa a PRIMEIRA prova da lista
            for (let i = 1; i < sp.options.length; i++) {
                const opt = sp.options[i];
                if (opt.value && opt.dataset.disciplina) {
                    discSel = opt.dataset.disciplina;
                    sp.selectedIndex = i;
                    break;
                }
            }
        }

        // ─── 3) Se NÃO há nenhuma prova → mostra mensagem e para ───
        if (!discSel) {
            const tb = document.getElementById('tb-rel-alunos');
            if (tb) tb.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text3);">📌 Selecione uma prova para visualizar o relatório</td></tr>';
            setText('rel-total-alunos-tabela', '0 alunos');
            setText('rel-total-correcoes', '0 correções');
            setText('rel-disc-acertos', '0');
            setText('rel-disc-erros', '0');
            setText('rel-disc-media', '0.0');
            setText('rel-disciplina-nome', '—');
            setText('rel-disc-conceito', '—');
            const c = document.getElementById('rel-acertos-por-questao');
            if (c) c.style.display = 'none';
            return;
        }

        const info = dm[discSel] || { k: 'portugues', label: 'Português' };
        const discKey = info.k;
        const isProd = !!info.prod;

        // ─── 4) Carregar alunos da turma (se turma selecionada) ───
        let alunosTurma = [];
        if (ti) {
            try {
                const d = await carregarAlunosComCache({ turma_id: ti });
                if (d && !d.erro && Array.isArray(d)) alunosTurma = d;
            } catch (e) { /* ignore */ }
        }

        // ─── 5) Buscar dados agrupados do backend ───
        let url = API_URL + '/api/historico/agrupado';
        const p = new URLSearchParams();
        if (ei) p.append('escola', ei);
        if (se) p.append('serie', se);
        if (ti) p.append('turma', ti);
        if (pi) p.append('prova', pi);
        if (p.toString()) url += '?' + p.toString();
        const r = await apiFetch(url);
        const agrup = await r.json();

        // ─── 6) Separar "com avaliação" vs "sem avaliação" ───
        const com = [];
        const sem = [];
        if (agrup && !agrup.erro && Array.isArray(agrup)) {
            agrup.forEach(a => {
                const dd = a[discKey];
                // Filtra: só entra quem realmente tem avaliação registrada
                if (dd && typeof dd === 'object' && !dd.sem_avaliacao && (dd.data || dd.prova) && (dd.total > 0 || dd.nota > 0)) {
                    const ac = dd.acertos || 0;
                    const tot = (typeof dd.total === 'number' && dd.total > 0) ? dd.total : (dd.nota > 0 ? 10 : 0);
                    const er = Math.max(0, tot - ac);
                    const pct = tot > 0 ? Math.round((ac / tot) * 100) : 0;
                    com.push({ ...a, dados: { ac, er, tot, pct, nota: dd.nota || 0 } });
                }
            });
        }

        // ─── 7) Adicionar alunos SEM avaliação (aparecem como "—") ───
        if (alunosTurma.length > 0) {
            const ids = new Set(com.map(a => a.aluno_id));

            // Pega o total de questões REAL da prova selecionada
            let totalProva = 0;
            const provaIdRef = pi || (op && op.value);
            if (provaIdRef) {
                const opt = Array.from(sp.options).find(o => o.value == provaIdRef);
                if (opt && opt.dataset.quantidade) {
                    totalProva = parseInt(opt.dataset.quantidade) || 0;
                }
            }

            alunosTurma.forEach(a => {
                if (!ids.has(a.id)) {
                    sem.push({
                        aluno_id: a.id,
                        aluno_nome: a.nome,
                        serie: a.turma_serie || se,
                        numero_chamada: a.numero_chamada,
                        dados: { ac: 0, er: 0, tot: totalProva, pct: 0, nota: 0, sem_avaliacao: true }
                    });
                }
            });
        }

        // ─── 8) Preencher cards de resumo ───
        const totalC = com.length;
        setText('rel-total-alunos-tabela', totalC + ' alunos');
        setText('rel-total-correcoes', totalC + ' correções');
        let somaAc = 0, somaEr = 0;
        com.forEach(a => { somaAc += a.dados.ac; somaEr += a.dados.er; });
        setText('rel-disc-acertos', somaAc);
        setText('rel-disc-erros', somaEr);
        setText('rel-disc-media', totalC > 0 ? (somaAc / totalC).toFixed(1) : '0.0');
        const mediaPct = totalC > 0 ? Math.round(com.reduce((s, a) => s + a.dados.pct, 0) / totalC) : 0;
        setText('rel-disciplina-nome', info.label);
        setText('rel-disc-conceito', calcularConceito(mediaPct));

        // ─── 9) Redesenhar o cabeçalho da tabela ───
        const table = document.querySelector('#tb-rel-alunos')?.closest('table');
        const thead = table?.querySelector('thead');
        const cols = isProd ? 1 : 3;
        if (thead) {
            thead.innerHTML = `<tr><th>POS.</th><th>Nº</th><th>NOME</th><th>SÉRIE</th><th colspan="${cols}">${info.label.toUpperCase()}</th></tr><tr>${Array(4).fill('<th></th>').join('')}${isProd ? '<th>NOTA</th>' : '<th>ACERTOS</th><th>ERROS</th><th>NOTA</th>'}</tr>`;
        }

        // ─── 10) Redesenhar o corpo da tabela ───
        const tb = document.getElementById('tb-rel-alunos');
        if (!tb) return;
        const all = [...com, ...sem];
        if (all.length === 0) {
            tb.innerHTML = `<tr><td colspan="${4 + cols}" style="text-align:center;padding:30px;color:var(--text3);">Nenhum aluno encontrado com os filtros selecionados</td></tr>`;
            return;
        }

        all.sort((a, b) => b.dados.pct - a.dados.pct);
        tb.innerHTML = all.map((a, ix) => {
            const d = a.dados;
            const med = ix === 0 ? '🥇' : ix === 1 ? '🥈' : ix === 2 ? '🥉' : (ix + 1);
            const numeroReal = a.numero_chamada || (ix + 1);
            const temAvaliacao = !d.sem_avaliacao && (d.tot > 0 || d.nota > 0);

            let cel;
            if (isProd) {
                cel = `<td style="text-align:center;font-weight:900;color:var(--purple);">${temAvaliacao && d.nota ? Number(d.nota).toFixed(1) : '—'}</td>`;
            } else if (temAvaliacao) {
                cel = `<td style="text-align:center;color:var(--green);font-weight:700;">${d.ac}</td><td style="text-align:center;color:var(--red);font-weight:700;">${d.er}</td><td style="text-align:center;color:var(--blue);font-weight:900;">${d.nota ? Number(d.nota).toFixed(1) : '—'}</td>`;
            } else {
                cel = `<td style="text-align:center;color:var(--text3);">—</td><td style="text-align:center;color:var(--text3);">—</td><td style="text-align:center;color:var(--text3);">—</td>`;
            }

            return `<tr>
                <td style="text-align:center;">${med}</td>
                <td style="text-align:center;">${numeroReal}</td>
                <td style="padding-left:10px;"><strong>${escapeHtml(a.aluno_nome || '—')}</strong></td>
                <td style="text-align:center;"><span class="badge badge-purple" style="font-size:9px;">${escapeHtml(a.serie || '—')}</span></td>
                ${cel}
            </tr>`;
        }).join('');

        // ─── 11) Gráfico de acertos por questão ───
        if (isProd) {
            const c = document.getElementById('rel-acertos-por-questao');
            if (c) c.style.display = 'none';
        } else {
            const c = document.getElementById('rel-acertos-por-questao');
            if (c) c.style.display = 'block';
            atualizarGraficoAcertosPorQuestao(agrup, info.label, discKey);
        }

    } catch (e) {
        console.error('❌ Erro em carregarRelatorioTurmaFiltrado:', e);
        showToast('❌ Erro ao carregar relatório: ' + e.message, 'error');
    }
}
function atualizarGraficoAcertosPorQuestao(agrup, disc, key) {
    try {
        const cont = document.getElementById('rel-acertos-grid');
        const totEl = document.getElementById('rel-total-questoes');
        const dt = document.getElementById('rel-acertos-disciplina');
        const taEl = document.getElementById('rel-total-acertos-disciplina');
        const teEl = document.getElementById('rel-total-erros-disciplina');
        const meEl = document.getElementById('rel-media-disciplina');
        if (dt) dt.textContent = disc;
        if (!agrup || agrup.erro || !Array.isArray(agrup) || agrup.length === 0) { cont.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text3);">Nenhum dado</div>'; totEl.textContent = '0 questões'; taEl.textContent = '0'; teEl.textContent = '0'; meEl.textContent = '0%'; return; }
        const map = new Map(); let totalAc = 0, totalEr = 0, totalAl = 0; const bnccMap = new Map();
        agrup.forEach(a => {
            const d = a[key]; if (!d || typeof d !== 'object') return;
            const qs = d.questoes_status || [], bl = d.bncc || []; totalAl++;
            if (Array.isArray(qs) && qs.length > 0) {
                qs.forEach((q, ix) => {
                    const num = q.numero || q.questao || (ix + 1);
                    if (!map.has(num)) map.set(num, { acertos: 0, erros: 0 });
                    const dd = map.get(num);
                    if (!bnccMap.has(num)) bnccMap.set(num, q.bncc || q.codigo_bncc || (bl[ix] || 'N/A'));
                    const r = q.resposta || '', g = q.gabarito || '';
                    const rv = r && r !== '—' && r !== '-';
                    const ic = rv && r.toUpperCase() === g.toUpperCase();
                    if (ic || q.acertou === true || q.correta === true) { dd.acertos++; totalAc++; } else { dd.erros++; totalEr++; }
                });
            }
        });
        const tot = map.size || 20;
        totEl.textContent = tot + ' questões'; taEl.textContent = totalAc; teEl.textContent = totalEr;
        const med = totalAl > 0 && tot > 0 ? Math.round((totalAc / (totalAl * tot)) * 100) : 0;
        meEl.textContent = med + '%';
        cont.innerHTML = '';
        const keys = Array.from(map.keys()).sort((a, b) => a - b);
        if (keys.length === 0) { cont.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text3);">Nenhum dado</div>'; return; }
        keys.forEach(num => {
            const d = map.get(num); const t = d.acertos + d.erros;
            const bn = bnccMap.get(num) || 'N/A';
            const pa = t > 0 ? Math.round((d.acertos / t) * 100) : 0;
            const pe = t > 0 ? Math.round((d.erros / t) * 100) : 0;
            const div = document.createElement('div');
            div.className = 'acertos-por-questao-item';
            div.style.cssText = 'background:var(--surface);border-radius:10px;padding:12px 10px;border:1px solid var(--border);text-align:center;';
            let cb = pa >= 80 ? '#10b981' : pa >= 60 ? '#f59e0b' : pa >= 40 ? '#f59e0b' : '#ef4444';
            div.innerHTML = `<div style="font-size:14px;font-weight:800;margin-bottom:4px;">Q${num}</div><div style="display:flex;justify-content:center;gap:4px;font-size:16px;font-weight:700;margin:4px 0;"><span style="color:var(--green);">${d.acertos}</span><span style="color:var(--text3);">/</span><span style="color:var(--red);">${d.erros}</span></div><div style="font-size:9px;color:var(--text3);margin-bottom:4px;">Acertos / Erros</div><div style="font-size:11px;font-weight:700;color:#8b5cf6;background:rgba(139,92,246,.12);padding:3px 12px;border-radius:8px;display:inline-block;margin-bottom:4px;font-family:'Courier New',monospace;">${escapeHtml(bn)}</div><div class="progress" style="height:8px;background:var(--bg2);border-radius:6px;overflow:hidden;margin:6px 0;"><div class="progress-fill" style="width:${Math.max(pa, 2)}%;background:${cb};border-radius:6px;"></div></div><div style="display:flex;justify-content:center;gap:10px;font-size:11px;font-weight:700;"><span style="color:var(--green);">${pa}%</span><span style="color:var(--text3);">|</span><span style="color:var(--red);">${pe}%</span></div>`;
            cont.appendChild(div);
        });
    } catch (e) { console.error(e); }
}

// ═══ CARREGAMENTO INICIAL ═══
async function carregarDados() {
    try {
        await Promise.all([carregarEscolas(), carregarTurmas(), carregarAlunos(), carregarProvas(), carregarDashboard()]);
        atualizarDatasImpressao();
        setTimeout(() => carregarDadosSecundarios(), 300);
    } catch (e) { console.error(e); showToast('⚠️ Erro ao carregar', 'error'); }
}
async function carregarDadosSecundarios() {
    try {
        await Promise.all([carregarGabaritos(), carregarUltimasCorrecoes(), carregarUsuarios(), carregarCombos()]);
        await Promise.all([carregarEscolasFiltroAlunos(), carregarEscolasCorrigir(), carregarEscolasTexto(), carregarEscolasParaCorrecaoManual(), carregarFiltrosRelTurma(), carregarFiltroEscolaTurmas()]);
    } catch (e) { console.warn(e); }
}

// ═══ AUXILIARES GERAIS ═══

// ✅ POPULAR SELECTS DE QUESTÕES (faltavam — causava ReferenceError)
function popularSelectQuestoes() {
    const sel = document.getElementById('prova-questoes');
    if (!sel || sel.options.length > 0) return;
    const total = 30;
    sel.innerHTML = '';
    for (let i = 1; i <= total; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i;
        if (i === 20) opt.selected = true;
        sel.appendChild(opt);
    }
    console.log('✅ #prova-questoes populado (1 a ' + total + ')');
}

function popularSelectGabTotal() {
    const sel = document.getElementById('gab-total');
    if (!sel || sel.options.length > 0) return;
    const total = 30;
    sel.innerHTML = '';
    for (let i = 1; i <= total; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i;
        if (i === 20) opt.selected = true;
        sel.appendChild(opt);
    }
    console.log('✅ #gab-total populado (1 a ' + total + ')');
}

function closeM(id) { const m = document.getElementById(id); if (m) { m.style.display = 'none'; m.classList.remove('show'); } }
function openM(id) {
    const m = document.getElementById(id);
    if (m) { m.style.display = 'flex'; m.classList.add('show'); }
    if (id === 'm-turma' || id === 'm-aluno') { carregarCombos(); if (id === 'm-aluno') carregarEscolasParaAluno(); }
    if (id === 'm-prova') { carregarCombos(); const t = document.getElementById('modal-prova-tipo'); if (t) gerarGabaritoModal(t.value); }
}
function switchTab(idx, btn) {
    const p = btn.closest('.tab-nav');
    if (p) { p.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
    const c = btn.closest('.card');
    if (c) c.querySelectorAll('.tab-c').forEach((tc, i) => { tc.style.display = i === idx ? 'block' : 'none'; });
}
function showToast(msg, type) {
    type = type || 'info';
    const c = document.getElementById('toast-c'); if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    const icons = { info: 'ℹ️', success: '✅', error: '❌', ai: '🤖', warning: '⚠️' };
    t.innerHTML = '<span>' + (icons[type] || 'ℹ️') + '</span><span>' + escapeHtml(msg) + '</span>';
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3200);
}
function filtrarTabela(input, tbodyId) {
    const v = input.value.toLowerCase();
    document.querySelectorAll('#' + tbodyId + ' tr').forEach(r => { r.style.display = r.textContent.toLowerCase().includes(v) ? '' : 'none'; });
}
function simUpload() { setTimeout(() => { const e = document.getElementById('up-ok'); if (e) e.style.display = 'block'; showToast('✅ Enviado!', 'success'); }, 600); }
function salvarConfiguracoes() { showToast('✅ Salvo!', 'success'); }
function cancelarDel() { document.getElementById('del-modal').classList.remove('show'); delTarget = null; }
function confirmarDel() {
    document.getElementById('del-modal').classList.remove('show');
    if (!delTarget) return;
    const { row, tipo, nome } = delTarget;
    row.classList.add('deleting');
    setTimeout(() => { row.remove(); showToast('🗑️ ' + nome + ' excluído!', 'error'); delTarget = null; limparCache(); }, 350);
}
function excluir(btn, tipo, nome) {
    const row = btn.closest('tr');
    delTarget = { row, tipo, nome };
    document.getElementById('del-nome-txt').textContent = '"' + nome + '"';
    document.getElementById('del-modal').classList.add('show');
}
function renumerarTabela(tb) {
    if (!tb) return;
    tb.querySelectorAll('tr').forEach((tr, i) => { const b = tr.querySelector('.badge-blue, .badge-gray'); if (b && b.textContent.match(/^\d+$/)) b.textContent = String(i+1).padStart(2, '0'); });
}

// ═══ FECHAR MODAIS AO CLICAR FORA + DOMContentLoaded ═══
document.querySelectorAll('.modal-overlay').forEach(m => { m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); }); });
document.getElementById('del-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) cancelarDel(); });
window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
        const s = document.getElementById('sidebar'), o = document.getElementById('menuOverlay'), t = document.getElementById('menuToggle');
        if (s && o && t) { s.classList.remove('open'); o.classList.remove('show'); t.classList.remove('active'); t.innerHTML = '☰'; }
    }
});

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
    if (typeof carregarProvasParaGabarito === 'function') carregarProvasParaGabarito();
    if (typeof carregarProvasParaTexto === 'function') carregarProvasParaTexto();
    if (typeof carregarProvasParaFiltro === 'function') carregarProvasParaFiltro();
    if (typeof carregarProvasParaDesempenho === 'function') carregarProvasParaDesempenho();

});



// ============================================
// DISCIPLINAS — CRUD
// ============================================

async function carregarDisciplinas() {
  const tb = document.getElementById('tb-disciplinas');
  if (!tb) return;
  tb.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text3);">Carregando disciplinas...</td></tr>';
  try {
    const r = await apiFetch(API_URL + '/api/disciplinas');
    const lista = await r.json();
    renderizarDisciplinas(Array.isArray(lista) ? lista : []);
  } catch (e) {
    console.error('carregarDisciplinas:', e);
    tb.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--red);">Erro: ${escapeHtml(e.message)}</td></tr>`;
  }
}

function renderizarDisciplinas(lista) {
  const tb = document.getElementById('tb-disciplinas');
  if (!tb) return;
  if (!lista.length) {
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text3);">Nenhuma disciplina cadastrada. Clique em "+ Nova Disciplina".</td></tr>';
    return;
  }
  tb.innerHTML = lista.map(d => {
    const escopo = d.escola_id === null
      ? '<span class="badge badge-blue">🌐 Global</span>'
      : '<span class="badge badge-green">🏫 Escola</span>';
    const acoes = d.escola_id !== null
      ? `<button class="btn btn-outline btn-sm" onclick='abrirModalDisciplina(${JSON.stringify(d)})' title="Editar">✏️</button>
         <button class="btn btn-red btn-sm" onclick="excluirDisciplina(${d.id}, '${String(d.nome).replace(/'/g, "\\'")}')" title="Excluir">🗑️</button>`
      : '<span style="font-size:11px;color:var(--text3);">—</span>';
    return `<tr>
      <td style="text-align:center; font-size:22px;">${escapeHtml(d.icone || '📚')}</td>
      <td><strong>${escapeHtml(d.nome)}</strong></td>
      <td><code>${escapeHtml(d.codigo)}</code></td>
      <td><span style="display:inline-block;width:22px;height:22px;border-radius:6px;background:${escapeAttr(d.cor || '#3b82f6')};border:1px solid var(--border);"></span></td>
      <td>${escopo}</td>
      <td style="text-align:center;">${d.ordem ?? 99}</td>
      <td>${acoes}</td>
    </tr>`;
  }).join('');
}

function abrirModalDisciplina(d) {
  if (typeof openM === 'function') openM('m-disciplina');
  else document.getElementById('m-disciplina').style.display = 'flex';

  const titulo = document.getElementById('m-disciplina-titulo');
  const inputId = document.getElementById('disciplina-id');
  const inputNome = document.getElementById('disciplina-nome');
  const inputIcone = document.getElementById('disciplina-icone');
  const inputCor = document.getElementById('disciplina-cor');
  const inputOrdem = document.getElementById('disciplina-ordem');

  if (d && d.id) {
    if (titulo) titulo.textContent = '✏️ Editar Disciplina';
    if (inputId) inputId.value = d.id;
    if (inputNome) inputNome.value = d.nome || '';
    if (inputIcone) inputIcone.value = d.icone || '📚';
    if (inputCor) inputCor.value = d.cor || '#3b82f6';
    if (inputOrdem) inputOrdem.value = d.ordem ?? 99;
  } else {
    if (titulo) titulo.textContent = '📚 Nova Disciplina';
    if (inputId) inputId.value = '';
    if (inputNome) inputNome.value = '';
    if (inputIcone) inputIcone.value = '📚';
    if (inputCor) inputCor.value = '#3b82f6';
    if (inputOrdem) inputOrdem.value = 99;
  }
  setTimeout(() => { if (inputNome) inputNome.focus(); }, 60);
}

function fecharModalDisciplina() {
  if (typeof closeM === 'function') closeM('m-disciplina');
  else document.getElementById('m-disciplina').style.display = 'none';
}

async function salvarDisciplina() {
  const id = (document.getElementById('disciplina-id')?.value || '').trim();
  const nome = (document.getElementById('disciplina-nome')?.value || '').trim();
  const icone = (document.getElementById('disciplina-icone')?.value || '').trim() || '📚';
  const cor = document.getElementById('disciplina-cor')?.value || '#3b82f6';
  const ordem = parseInt(document.getElementById('disciplina-ordem')?.value, 10) || 99;

  if (!nome) {
    if (typeof showToast === 'function') showToast('Digite o nome da disciplina', 'error');
    else alert('Digite o nome da disciplina');
    return;
  }

  const url = id ? `/api/disciplinas/${id}` : '/api/disciplinas';
  const metodo = id ? 'PUT' : 'POST';
  try {
    const r = await apiFetch(API_URL + url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, icone, cor, ordem })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data.erro || 'Erro ao salvar';
      if (typeof showToast === 'function') showToast(msg, 'error');
      else alert(msg);
      return;
    }
    if (typeof showToast === 'function') showToast(id ? '✅ Disciplina atualizada' : '✅ Disciplina criada', 'success');
    fecharModalDisciplina();
    carregarDisciplinas();
  } catch (e) {
    if (typeof showToast === 'function') showToast('Erro: ' + e.message, 'error');
    else alert('Erro: ' + e.message);
  }
}

async function excluirDisciplina(id, nome) {
  if (!confirm(`Desativar a disciplina "${nome}"?\n\nEla não aparecerá mais em novas provas, mas o histórico é preservado.`)) return;
  try {
    const r = await apiFetch(API_URL + `/api/disciplinas/${id}`, { method: 'DELETE' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (typeof showToast === 'function') showToast(data.erro || 'Erro ao excluir', 'error');
      else alert(data.erro || 'Erro ao excluir');
      return;
    }
    if (typeof showToast === 'function') showToast('✅ Disciplina desativada', 'success');
    carregarDisciplinas();
  } catch (e) {
    if (typeof showToast === 'function') showToast('Erro: ' + e.message, 'error');
    else alert('Erro: ' + e.message);
  }
}

// Chamar carregarDisciplinas() ao clicar no menu
document.addEventListener('DOMContentLoaded', () => {
  const menuDisc = document.querySelector('.sb-item[data-p="disciplinas"]');
  if (menuDisc) {
    menuDisc.addEventListener('click', () => setTimeout(carregarDisciplinas, 80));
  }
});

// Interceptar go('disciplinas') para carregar quando navegar
if (typeof go === 'function') {
  const _goOriginal = window.go;
  window.go = function(page) {
    _goOriginal(page);
    if (page === 'disciplinas') setTimeout(carregarDisciplinas, 80);
  };
}
