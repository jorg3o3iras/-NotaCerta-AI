// correcao-texto.js
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
                showToast(`✅ ${dados.caracteres} caracteres.`, 'success');
            } else showToast('❌ ' + (dados.erro || 'Erro'), 'error');
        } catch (err) { showToast('❌ ' + err.message, 'error'); }
    };
    reader.readAsDataURL(file);
}
async function avaliarTexto() {
    let texto = document.getElementById('txt-aluno').value;
    const alunoId = document.getElementById('txt-aluno-select').value;
    if (!texto || texto.trim().length < 5) { showToast('❌ Digite um texto!', 'error'); return; }
    document.getElementById('txt-waiting').style.display = 'none';
    document.getElementById('txt-loading').style.display = 'block';
    document.getElementById('txt-res').style.display = 'none';
    try {
        const response = await apiFetch(API_URL + '/api/corrigir_redacao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, aluno_id: alunoId || null }) });
        const dados = await response.json();
        document.getElementById('txt-loading').style.display = 'none';
        document.getElementById('txt-res').style.display = 'block';
        if (dados.erro) { showToast('❌ ' + dados.erro, 'error'); return; }
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
    if (!alunoId || !texto || !nota) { showToast('⚠️ Preencha tudo!', 'error'); return; }
    try {
        const response = await apiFetch(API_URL + '/api/salvar_correcao_texto', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aluno_id: parseInt(alunoId), prova_id: provaId ? parseInt(provaId) : null, texto, nota, metricas, feedback })
        });
        const dados = await response.json();
        if (dados.sucesso) showToast(`✅ Nota ${nota.toFixed(1)}`, 'success');
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
            s.innerHTML = '<option value="">Selecione...</option>';
            escolas.forEach(e => { const o = document.createElement('option'); o.value = e.id; o.textContent = e.nome; s.appendChild(o); });
            if (cur) s.value = cur;
        }
    } catch (e) { console.error(e); }
}