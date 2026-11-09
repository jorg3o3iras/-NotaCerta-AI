// dashboard.js
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