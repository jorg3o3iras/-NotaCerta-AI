// cartoes.js
async function carregarTurmasLista(escolaId) {
    const s = document.getElementById('lista-turma'); if (!s) return;
    s.innerHTML = '<option value="">Selecione...</option>';
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
        if (!alunos || alunos.length === 0) { cont.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3);">Nenhum aluno</div>'; return; }
        const provas = await carregarProvasComCache();
        let provasDisp = provas.filter(p => p.serie === turma?.serie);
        if (provasDisp.length === 0) provasDisp = provas;
        let prova = pi ? provas.find(p => p.id == pi) : null;
        if (!prova && provasDisp.length > 0) prova = provasDisp[0];
        if (!prova) { cont.innerHTML = '<div style="text-align:center;padding:30px;color:var(--orange);">Nenhuma prova</div>'; return; }
        const escolas = await carregarEscolasComCache();
        const escola = escolas.find(e => e.id == turma?.escola_id);
        let pOpts = '';
        provasDisp.forEach(p => { const s = p.id == prova.id ? 'selected' : ''; pOpts += `<option value="${p.id}" ${s}>${escapeHtml(p.titulo)} (${escapeHtml(p.disciplina || '—')})</option>`; });
        let html = `<div style="text-align:center;padding:12px 0 18px;border-bottom:1px solid var(--border);margin-bottom:14px;"><div style="font-size:16px;font-weight:800;">${escapeHtml(escola?.nome || 'Escola')}</div><div style="color:var(--text2);font-size:13px;margin-top:4px;">Turma: ${escapeHtml(turma?.nome || '—')} | Série: ${escapeHtml(turma?.serie || '—')}</div><div style="margin-top:10px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;"><select id="lista-prova-select" class="form-control" style="width:250px;padding:6px 10px;font-size:12px;" onchange="gerarListaTurma()">${pOpts}</select><button class="btn btn-green" onclick="gerarCartoesTodosAlunos(${ei}, ${ti}, ${prova.id})">📄 TODOS</button></div></div><div style="display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto;">`;
        alunos.forEach(a => { html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);"><div><strong>${escapeHtml(a.nome)}</strong> <span class="badge badge-blue">Nº ${escapeHtml(a.numero_chamada || '—')}</span></div><button class="btn btn-primary btn-sm" onclick="gerarCartaoResposta(${ei}, ${ti}, ${a.id}, ${prova.id})">📄 Gerar</button></div>`; });
        html += '</div>';
        cont.innerHTML = html;
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}
async function gerarCartaoResposta(escolaId, turmaId, alunoId, provaId) {
    try {
        const aba = window.open('', '_blank');
        if (!aba) { showToast('❌ Pop-ups!', 'error'); return; }
        aba.document.write('<!DOCTYPE html><html><body style="text-align:center;padding:50px;font-family:Arial;"><h2>⏳ Gerando...</h2></body></html>');
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
        showToast(`✅ ${alunos.length} cartões...`, 'success');
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}