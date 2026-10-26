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
    // ✨ Salva a imagem para o modal "Ver cartão"
    window._ultimaImagemCorrigida = imagemBase64;

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


// ═══════════════════════════════════════════════════════════════════
// ✨ CORREÇÃO AUTOMÁTICA POR QR CODE
// ═══════════════════════════════════════════════════════════════════

let autoModoAtivo = false;

function abrirCameraAutomatico() {
    autoModoAtivo = true;
    if (typeof abrirCamera === 'function') abrirCamera();
}

function processarArqAutomatico(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
        showToast('❌ Imagem muito grande (máx. 20MB)', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
        const base64 = e.target.result;
        const preview = document.getElementById('auto-preview');
        const img = document.getElementById('auto-img-prev');
        if (preview && img) { img.src = base64; preview.style.display = 'block'; }
        const resultado = document.getElementById('auto-resultado');
        if (resultado) resultado.style.display = 'none';
        window._autoImagem = base64;
        showToast('✅ Imagem carregada! Clique em "CORRIGIR AUTOMATICAMENTE"', 'success');
    };
    reader.readAsDataURL(file);
}

async function corrigirAutomatico() {
    const imagem = window._autoImagem;
    if (!imagem) { showToast('❌ Nenhuma imagem carregada', 'error'); return; }

    // ✨ Guarda a imagem para o modal "Ver cartão"
    window._ultimaImagemCorrigida = imagem;

    const resultadoDiv = document.getElementById('auto-resultado');
    const conteudoDiv = document.getElementById('auto-resultado-conteudo');
    if (resultadoDiv) resultadoDiv.style.display = 'block';
    if (conteudoDiv) {
        conteudoDiv.innerHTML = `
            <div style="text-align:center; padding:20px;">
                <div class="spinner" style="margin:0 auto 14px;"></div>
                <p style="font-size:15px; font-weight:700;">🔍 Lendo o QR Code do cartão...</p>
                <p style="font-size:13px; color:var(--text2); margin-top:6px;">Identificando aluno, prova, escola e turma automaticamente</p>
            </div>
        `;
    }

    try {
        const response = await apiFetch(`${API_URL}/api/corrigir-automatico`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imagem: imagem, salvar_auto: false })
        });
        const dados = await response.json();

        if (!response.ok || !dados.sucesso) {
            mostrarErroAutomatico(dados.erro || 'Erro na correção automática', dados.dicas);
            return;
        }

        mostrarResultadoAutomatico(dados);
        window._autoImagem = null;
        const preview = document.getElementById('auto-preview');
        if (preview) preview.style.display = 'none';
    } catch (erro) {
        console.error('Erro na correção automática:', erro);
        mostrarErroAutomatico('Erro de conexão: ' + erro.message);
    }
}

function mostrarErroAutomatico(mensagem, dicas) {
    const conteudoDiv = document.getElementById('auto-resultado-conteudo');
    if (!conteudoDiv) return;
    let dicasHtml = '';
    if (dicas && Array.isArray(dicas)) {
        dicasHtml = '<div style="margin-top:14px; padding:12px; background:rgba(245,158,11,0.1); border-radius:8px; border-left:3px solid var(--orange);"><strong style="color:var(--orange);">Dicas:</strong><ul style="margin-top:6px; padding-left:20px; font-size:13px; color:var(--text2); line-height:1.7;">';
        dicas.forEach(d => { dicasHtml += `<li>${escapeHtml(d)}</li>`; });
        dicasHtml += '</ul></div>';
    }
    conteudoDiv.innerHTML = `
        <div style="padding:16px; background:rgba(239,68,68,0.08); border-radius:10px; border-left:4px solid var(--red);">
            <div style="font-size:15px; font-weight:700; color:var(--red); margin-bottom:8px;">❌ ${escapeHtml(mensagem)}</div>
            ${dicasHtml}
            <div style="margin-top:14px; padding-top:14px; border-top:1px solid var(--border); font-size:13px; color:var(--text2);">
                <strong>Alternativa:</strong> use os campos abaixo (Escola / Turma / Prova / Aluno) para corrigir manualmente.
            </div>
        </div>
    `;
}

function mostrarResultadoAutomatico(dados) {
    const conteudoDiv = document.getElementById('auto-resultado-conteudo');
    if (!conteudoDiv) return;

    if (dados.sucesso || !dados.erro) {
        const gabarito = dados.gabarito || [];
        const respostas = dados.respostas_detectadas || [];
        const quantidade = dados.total || gabarito.length || 20;
        const tipoQuestoes = parseInt(dados.tipo_questoes) || 4;
        const alternativas = tipoQuestoes === 3 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
        const valorPorQuestao = quantidade > 0 ? (10 / quantidade) : 0.5;
        correcaoManualData = {
            alunoId: dados.aluno_id || dados.qr_lido?.aluno_id,
            alunoNome: dados.aluno || 'Aluno',
            provaId: dados.prova_id || dados.qr_lido?.prova_id,
            provaTitulo: dados.prova_titulo || 'Prova',
            gabarito: gabarito, respostasAluno: respostas.slice(),
            quantidade: quantidade, alternativas: alternativas,
            notaMaxima: 10, notaMinima: 5, valorPorQuestao: valorPorQuestao,
            serie: dados.serie || '', disciplina: dados.disciplina || '',
            confianca_por_questao: dados.confianca_por_questao || [],
            questoes_suspeitas: dados.questoes_suspeitas || [],
            bncc: dados.bncc || [], questoes_status: dados.questoes_status || []
        };
        window.ultimoResultadoAuto = dados;
    }

    const nota = dados.nota || 0;
    const acertos = dados.acertos || 0;
    const total = dados.total || 0;
    const porcentagem = dados.porcentagem || 0;
    const conceito = dados.conceito?.nome || 'inicial';
    const aluno = dados.aluno || 'Aluno';
    const prova = dados.prova_titulo || 'Prova';
    const escola = dados.escola_nome || '';
    const turma = dados.turma_nome || '';

    const conceitoCores = { 'inicial': '#ef4444', 'basico': '#f59e0b', 'proficiente': '#3b82f6', 'avancado': '#10b981' };
    const cor = conceitoCores[conceito] || '#94a3b8';
    const conceitoLabel = { 'inicial': '🔴 Inicial', 'basico': '🟠 Básico', 'proficiente': '🔵 Proficiente', 'avancado': '🟢 Avançado' }[conceito] || conceito;

    const questoesStatus = Array.isArray(dados.questoes_status) ? dados.questoes_status : [];

    let questoesHtml = '';
    if (questoesStatus.length > 0) {
        questoesHtml = '<div style="display:grid; grid-template-columns:repeat(10,1fr); gap:4px; margin-top:12px;">';
        questoesStatus.forEach(q => {
            const acertou = q.acertou;
            const resp = q.resposta || '—';
            let corQ, corTexto, icone;
            if (acertou) { corQ = 'rgba(16,185,129,0.15)'; corTexto = 'var(--green)'; icone = '✅'; }
            else if (resp === '—' || !resp) { corQ = 'rgba(100,116,139,0.1)'; corTexto = 'var(--text3)'; icone = '—'; }
            else { corQ = 'rgba(239,68,68,0.15)'; corTexto = 'var(--red)'; icone = '❌'; }
            questoesHtml += `<div style="background:${corQ}; border-radius:6px; padding:5px 2px; text-align:center;"><div style="font-size:8px; font-weight:700; color:var(--text3);">Q${q.numero}</div><div style="font-size:13px; font-weight:800; color:${corTexto};">${escapeHtml(resp)}</div><div style="font-size:8px;">${icone}</div></div>`;
        });
        questoesHtml += '</div>';
    }

    conteudoDiv.innerHTML = `
        <div style="background:linear-gradient(135deg, rgba(139,92,246,0.08), rgba(6,182,212,0.08)); border-radius:12px; padding:16px; border:2px solid rgba(139,92,246,0.3);">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
                <div style="font-size:16px; font-weight:800; color:#a78bfa;">✅ Correção Automática Concluída!</div>
                <span class="badge badge-purple" style="font-size:10px;">VIA QR CODE</span>
            </div>
            <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:14px; font-size:13px;">
                <div style="background:var(--surface2); border-radius:8px; padding:10px;"><div style="color:var(--text3); font-size:9px; font-weight:700; margin-bottom:3px;">ALUNO</div><div style="font-weight:700;">${escapeHtml(aluno)}</div></div>
                <div style="background:var(--surface2); border-radius:8px; padding:10px;"><div style="color:var(--text3); font-size:9px; font-weight:700; margin-bottom:3px;">PROVA</div><div style="font-weight:700;">${escapeHtml(prova)}</div></div>
                <div style="background:var(--surface2); border-radius:8px; padding:10px;"><div style="color:var(--text3); font-size:9px; font-weight:700; margin-bottom:3px;">ESCOLA</div><div style="font-weight:700; font-size:12px;">${escapeHtml(escola)}</div></div>
                <div style="background:var(--surface2); border-radius:8px; padding:10px;"><div style="color:var(--text3); font-size:9px; font-weight:700; margin-bottom:3px;">TURMA</div><div style="font-weight:700; font-size:12px;">${escapeHtml(turma)}</div></div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:8px; margin-bottom:14px;">
                <div style="background:var(--surface2); border-radius:8px; padding:10px; text-align:center;"><div style="font-size:26px; font-weight:900; color:var(--green);">${acertos}</div><div style="font-size:10px; color:var(--text3); font-weight:700;">✅ ACERTOS</div></div>
                <div style="background:var(--surface2); border-radius:8px; padding:10px; text-align:center;"><div style="font-size:26px; font-weight:900; color:var(--red);">${total - acertos}</div><div style="font-size:10px; color:var(--text3); font-weight:700;">❌ NÃO ACERTOS</div></div>
                <div style="background:var(--surface2); border-radius:8px; padding:10px; text-align:center;"><div style="font-size:26px; font-weight:900; color:var(--blue);">${porcentagem}%</div><div style="font-size:10px; color:var(--text3); font-weight:700;">📊 APROVEIT.</div></div>
                <div style="background:var(--surface2); border-radius:8px; padding:10px; text-align:center;"><div style="font-size:26px; font-weight:900; color:${cor};">${nota.toFixed(1)}</div><div style="font-size:10px; color:var(--text3); font-weight:700;">⭐ NOTA</div></div>
            </div>
            <div style="text-align:center; margin-bottom:10px;"><span style="background:${cor}20; color:${cor}; padding:6px 18px; border-radius:20px; font-size:13px; font-weight:800;">${conceitoLabel}</span></div>
            ${questoesHtml}
            <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-top:14px;">
                <button type="button" class="btn btn-outline btn-sm no-print" onclick="verCartaoOriginal()">🖼️ Ver cartão</button>
                <button type="button" class="btn btn-orange btn-sm no-print" onclick="abrirCorrecaoManualAuto()">✏️ Correção Manual</button>
                <button type="button" class="btn btn-green btn-sm no-print" onclick="salvarCorrecaoAuto()">💾 Salvar</button>
                <button type="button" class="btn btn-primary btn-sm no-print" onclick="go('rel-turma')">📊 Resultados</button>
                <button type="button" class="btn btn-outline btn-sm no-print" onclick="limparResultadoAutomatico()">🔄 Nova Correção</button>
            </div>
        </div>
    `;
    conteudoDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast(`✅ Corrigido! ${aluno} — Nota ${nota.toFixed(1)}`, 'success');
}

function limparResultadoAutomatico() {
    const resultado = document.getElementById('auto-resultado');
    const preview = document.getElementById('auto-preview');
    const img = document.getElementById('auto-img-prev');
    const input = document.getElementById('inp-arq-auto');
    if (resultado) resultado.style.display = 'none';
    if (preview) preview.style.display = 'none';
    if (img) img.src = '';
    if (input) input.value = '';
    window._autoImagem = null;
    showToast('🔄 Pronto para nova correção', 'info');
}

function abrirCorrecaoManualAuto() {
    if (!correcaoManualData || !correcaoManualData.respostasAluno || correcaoManualData.respostasAluno.length === 0) {
        showToast('❌ Nenhuma correção para editar!', 'error'); return;
    }
    if (!correcaoManualData.gabarito || correcaoManualData.gabarito.length === 0) {
        showToast('❌ Gabarito não disponível para esta prova!', 'error'); return;
    }
    if (typeof abrirCorrecaoManual === 'function') abrirCorrecaoManual();
}

async function salvarCorrecaoAuto() {
    if (!correcaoManualData || !correcaoManualData.respostasAluno) {
        showToast('❌ Nenhuma correção para salvar!', 'error'); return;
    }
    if (!correcaoManualData.provaId || !correcaoManualData.alunoId) {
        showToast('❌ Dados incompletos: prova ou aluno ausentes!', 'error'); return;
    }
    await salvarCorrecao();
}


// ═══════════════════════════════════════════════════════════════════
// ✨ MODAL "VER CARTÃO ORIGINAL"
// ═══════════════════════════════════════════════════════════════════

function verCartaoOriginal() {
    const imagem = window._ultimaImagemCorrigida;
    if (!imagem) {
        showToast('⚠️ Foto do cartão não disponível. Faça uma nova correção para visualizar.', 'warning');
        return;
    }
    const modal = document.getElementById('m-ver-cartao');
    const img = document.getElementById('ver-cartao-img');
    if (!modal || !img) {
        showToast('❌ Modal não encontrado. Adicione <div id="m-ver-cartao"> ao index.html', 'error');
        console.error('[verCartaoOriginal] Elemento #m-ver-cartao não existe no DOM');
        return;
    }
    img.src = imagem;
    modal.style.display = 'flex';
    document.addEventListener('keydown', _fecharCartaoComEsc);
}

function _fecharCartaoComEsc(e) {
    if (e.key === 'Escape') {
        fecharCartaoOriginal();
    }
}

function fecharCartaoOriginal() {
    const modal = document.getElementById('m-ver-cartao');
    const img = document.getElementById('ver-cartao-img');
    if (modal) modal.style.display = 'none';
    if (img) img.src = '';
    document.removeEventListener('keydown', _fecharCartaoComEsc);
}

function abrirCartaoNovaAba() {
    const imagem = window._ultimaImagemCorrigida;
    if (!imagem) return;
    const w = window.open('', '_blank');
    if (w) {
        w.document.write(`<!DOCTYPE html><html><head><title>Cartão resposta — NotaCerta AI</title>
        <style>body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;font-family:system-ui,sans-serif;}
        img{max-width:100%;max-height:95vh;object-fit:contain;box-shadow:0 10px 40px rgba(0,0,0,0.6);}
        .bar{position:fixed;top:12px;right:12px;display:flex;gap:8px;}
        .bar button{background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;}
        .bar button:hover{background:rgba(255,255,255,0.25);}
        </style></head><body>
        <div class="bar"><button onclick="window.print()">🖨️ Imprimir</button></div>
        <img src="${imagem}" alt="Cartão original">
        </body></html>`);
        w.document.close();
    } else {
        showToast('⚠️ Bloqueador de pop-up impediu abrir a nova aba', 'warning');
    }
}

function baixarCartaoOriginal() {
    const imagem = window._ultimaImagemCorrigida;
    if (!imagem) return;
    const a = document.createElement('a');
    a.href = imagem;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `cartao_${timestamp}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('✅ Download iniciado!', 'success');
}

// Fechar modal ao clicar fora da imagem
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('m-ver-cartao');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'm-ver-cartao') {
                fecharCartaoOriginal();
            }
        });
    }
});

console.log('✅ correcao-ia.js carregado (fluxo QR Code + modal Ver Cartão + câmera auto)');
