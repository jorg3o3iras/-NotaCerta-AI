// camera.js
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
    if (dicas && Array.isArray(dicas)) {
        dh = '<div style="margin-top:14px;padding:12px;background:rgba(245,158,11,.1);border-radius:8px;border-left:3px solid var(--orange);"><strong>Dicas:</strong><ul style="margin-top:6px;padding-left:20px;font-size:13px;color:var(--text2);line-height:1.7;">';
        dicas.forEach(d => { dh += `<li>${escapeHtml(d)}</li>`; });
        dh += '</ul></div>';
    }
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
    showToast(`✅ Nota ${nota.toFixed(1)}`, 'success');
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