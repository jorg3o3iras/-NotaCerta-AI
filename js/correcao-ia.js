// correcao-ia.js
async function carregarEscolasCorrigir() {
    try {
        const escolas = await carregarEscolasComCache();
        const select = document.getElementById('corrigir-escola');
        if (select && escolas && !escolas.erro) {
            const current = select.value;
            select.innerHTML = '<option value="">Selecione a escola...</option>';
            escolas.forEach(e => { const opt = document.createElement('option'); opt.value = e.id; opt.textContent = e.nome; select.appendChild(opt); });
            if (current) { select.value = current; carregarTurmasPorEscolaCorrigir(current); }
        }
    } catch (erro) { console.error(erro); }
}
async function carregarTurmasPorEscolaCorrigir(escolaId) {
    const selectTurma = document.getElementById('corrigir-turma');
    const selectProva = document.getElementById('corrigir-prova');
    const selectAluno = document.getElementById('corrigir-aluno');
    if (!selectTurma) return;
    selectTurma.innerHTML = '<option value="">Selecione...</option>';
    if (selectProva) selectProva.innerHTML = '<option value="">Selecione...</option>';
    if (selectAluno) selectAluno.innerHTML = '<option value="">Selecione...</option>';
    if (!escolaId) return;
    try {
        const turmas = await carregarTurmasComCache(escolaId);
        if (turmas && !turmas.erro) {
            turmas.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id; opt.textContent = t.nome + ' - ' + (t.serie || '');
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
                opt.value = a.id; opt.textContent = a.nome + ' (Nº ' + (a.numero_chamada || '—') + ')';
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
                opt.textContent = p.titulo + ' - ' + (p.serie || '') + ' - ' + (p.disciplina || '');
                opt.dataset.serie = p.serie || '';
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
        if (!prova || prova.erro) { showToast('❌ Erro', 'error'); return; }
        const turmaId = document.getElementById('corrigir-turma').value;
        if (!turmaId) {
            const alunos = await carregarAlunosComCache({ serie: prova.serie || '' });
            if (alunos && !alunos.erro) {
                alunos.forEach(a => {
                    const opt = document.createElement('option');
                    opt.value = a.id;
                    opt.textContent = a.nome + ' (Nº ' + (a.numero_chamada || '—') + ')' + (a.turma_nome ? ' - ' + a.turma_nome : '');
                    selectAluno.appendChild(opt);
                });
            }
            return;
        }
        const alunos = await carregarAlunosComCache({ turma_id: turmaId });
        if (alunos && !alunos.erro) {
            alunos.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.id; opt.textContent = a.nome + ' (Nº ' + (a.numero_chamada || '—') + ')';
                selectAluno.appendChild(opt);
            });
        }
    } catch (e) { console.error(e); }
}

async function processarComIA(imagemBase64) {
    const escolaId = document.getElementById('corrigir-escola')?.value;
    const turmaId = document.getElementById('corrigir-turma')?.value;
    const provaId = document.getElementById('corrigir-prova')?.value;
    const alunoId = document.getElementById('corrigir-aluno')?.value;
    if (!escolaId || !turmaId || !provaId || !alunoId) { showToast('❌ Selecione escola, turma, prova e aluno!', 'error'); return; }
    if (!imagemBase64) { showToast('❌ Nenhuma imagem!', 'error'); return; }
    const etapas = [
        { nome: '📸 Preparando imagem' }, { nome: '🎯 Template + Marcadores' },
        { nome: '🔍 Validação OpenCV' }, { nome: '🤖 IA (se necessário)' },
        { nome: '📊 Processando' }, { nome: '💾 Finalizando' }
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagem: imagemBase64, prova_id: parseInt(provaId), aluno_id: parseInt(alunoId) })
    });
    let dados = null;
    try { dados = await response.json(); } catch (e) { dados = null; }
    if (dados && dados.erro) throw new Error(dados.erro);
    if (!response.ok) throw new Error(`Erro ${response.status}`);
    if (!dados) throw new Error(`Resposta inválida (${response.status})`);
    if (!dados.respostas_detectadas && !dados.questoes_status) throw new Error('IA não detectou respostas. Foto mais nítida.');
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
        const labels = { 'template': '🎯 Template', 'template+cv': '🎯 Template+CV', 'ia': '🤖 IA', 'manual': '✏️ Manual' };
        mb.textContent = labels[metodo] || `📌 ${metodo}`;
        mb.className = 'badge ' + (metodo.includes('template') ? 'badge-green' : 'badge-purple');
    }
    const cm = dados.confiancas.reduce((a, b) => a + b, 0) / dados.confiancas.length || 0;
    const bc = document.getElementById('confianca-badge');
    if (bc) { bc.textContent = `${cm.toFixed(1)}% conf.`; bc.className = `badge ${cm >= 70 ? 'badge-green' : cm >= 50 ? 'badge-orange' : 'badge-red'}`; }
    const rc = document.getElementById('ia-resumo-confianca');
    if (rc) {
        const totalDuv = dados.questoesSuspeitas.length || dados.confiancas.filter(c => c < 70).length;
        rc.style.display = 'flex';
        rc.innerHTML = `<span>📊 Confiança: <strong>${cm.toFixed(1)}%</strong></span>${totalDuv > 0 ? `<span>⚠️ ${totalDuv} baixa</span>` : '<span>✅ Alta!</span>'}<span>🎯 ${dados.acertos} / ${dados.totalQuestoes}</span><span>📌 ${metodo}</span>`;
    }
    const rd = document.getElementById('ia-resp');
    if (rd) {
        rd.innerHTML = dados.resultadoQuestoes.map(q => {
            const cor = q.acertou ? 'rgba(16,185,129,.2)' : 'rgba(239,68,68,.2)';
            const ct = q.acertou ? 'var(--green)' : 'var(--red)';
            const ic = q.acertou ? '✅' : (q.respondida ? '❌' : '—');
            return `<span style="background:${cor};padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;color:${ct};">Q${q.numero}:${escapeHtml(q.resposta || '—')} ${ic}</span>`;
        }).join('');
    }
    const grid = document.getElementById('ia-comp');
    if (grid) {
        grid.innerHTML = '';
        const tq = dados.resultadoQuestoes.length;
        let cpl = tq > 25 ? 6 : 5;
        const tOf = document.createElement('div');
        tOf.style.cssText = `grid-column:1/-1;text-align:center;padding:6px 0;background:rgba(59,130,246,.1);border-radius:6px;margin-top:6px;`;
        tOf.innerHTML = `<span style="font-size:12px;font-weight:800;color:var(--blue);">📋 GABARITO OFICIAL</span>`;
        grid.appendChild(tOf);
        const gO = document.createElement('div');
        gO.style.cssText = `grid-column:1/-1;display:grid;grid-template-columns:repeat(${cpl},1fr);gap:4px;`;
        dados.resultadoQuestoes.forEach(q => {
            const d = document.createElement('div');
            d.style.cssText = 'background:rgba(59,130,246,.05);border-radius:4px;padding:3px;text-align:center;';
            d.innerHTML = `<div style="font-size:6px;color:var(--text3);">Q${q.numero}</div><div style="font-size:16px;font-weight:900;color:var(--green);">${escapeHtml(q.gabarito || '—')}</div>`;
            gO.appendChild(d);
        });
        grid.appendChild(gO);
        const tA = document.createElement('div');
        tA.style.cssText = `grid-column:1/-1;text-align:center;padding:6px 0;background:rgba(139,92,246,.1);border-radius:6px;margin-top:8px;`;
        tA.innerHTML = `<span style="font-size:12px;font-weight:800;color:var(--purple);">📋 GABARITO DO ALUNO</span>`;
        grid.appendChild(tA);
        const gA = document.createElement('div');
        gA.style.cssText = `grid-column:1/-1;display:grid;grid-template-columns:repeat(${cpl},1fr);gap:4px;`;
        dados.resultadoQuestoes.forEach(q => {
            const ac = q.acertou;
            const bg = ac ? 'rgba(16,185,129,.1)' : (q.respondida ? 'rgba(239,68,68,.1)' : 'rgba(100,116,139,.05)');
            const ct = ac ? 'var(--green)' : (q.respondida ? 'var(--red)' : 'var(--text3)');
            const ic = ac ? '✅' : (q.respondida ? '❌' : '—');
            const d = document.createElement('div');
            d.style.cssText = `background:${bg};border-radius:4px;padding:3px;text-align:center;`;
            d.innerHTML = `<div style="font-size:6px;color:var(--text3);">Q${q.numero}</div><div style="font-size:16px;font-weight:900;color:${ct};">${escapeHtml(q.resposta || '—')}</div><div style="font-size:6px;">${ic}</div>`;
            gA.appendChild(d);
        });
        grid.appendChild(gA);
    }
}

async function salvarCorrecao() {
    if (!correcaoManualData || !correcaoManualData.respostasAluno) { showToast('❌ Nada!', 'error'); return; }
    const { provaId, alunoId, respostasAluno: respostas, gabarito, quantidade: total } = correcaoManualData;
    if (!provaId || !alunoId) { showToast('❌ Incompleto!', 'error'); return; }
    let acertos = 0;
    for (let i = 0; i < total; i++) {
        const r = (i < respostas.length) ? (respostas[i] || '') : '';
        const g = (i < gabarito.length) ? (gabarito[i] || '') : '';
        if (r && g && r.toUpperCase() === g.toUpperCase()) acertos++;
    }
    const nota = Math.min(acertos * (correcaoManualData.valorPorQuestao || (10/total)), 10);
    try {
        const response = await apiFetch(`${API_URL}/api/corrigir_manual`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prova_id: provaId, aluno_id: alunoId, respostas, acertos, nota, total }) });
        const data = await response.json();
        if (data.sucesso) { showToast(`✅ Nota ${nota.toFixed(1)}`, 'success'); limparCache(); carregarDashboard(); carregarUltimasCorrecoes(); }
        else showToast('❌ ' + (data.erro || 'Erro'), 'error');
    } catch (erro) { showToast('❌ ' + erro.message, 'error'); }
}