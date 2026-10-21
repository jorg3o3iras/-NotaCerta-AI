async function carregarFiltrosRelTurma() {
    try {
        const escolas = await carregarEscolasComCache();
        const se = document.getElementById('rel-turma-escola');
        if (se && escolas && !escolas.erro) {
            const c = se.value;
            se.innerHTML = '<option value="">Selecione a escola</option>';
            escolas.forEach(e => {
                const o = document.createElement('option');
                o.value = e.id;
                o.textContent = e.nome;
                se.appendChild(o);
            });
            if (c) se.value = c;
        }
        const escolaAtual = se ? se.value : '';
        await carregarTurmasRelTurma(escolaAtual);
    } catch (e) { console.error('carregarFiltrosRelTurma:', e); }
}

async function carregarTurmasRelTurma(escolaId) {
    const st = document.getElementById('rel-turma-turma');
    const ss = document.getElementById('rel-turma-serie');
    const sp = document.getElementById('rel-turma-prova');
    if (!st || !ss || !sp) return;
    st.innerHTML = '<option value="">Selecione a turma</option>';
    ss.innerHTML = '<option value="">Selecione a série</option>';
    sp.innerHTML = '<option value="">Selecione a prova</option>';
    try {
        const turmas = escolaId ? await carregarTurmasComCache(escolaId) : await carregarTurmasComCache();
        if (turmas && !turmas.erro) {
            const seriesUnicas = [...new Set(turmas.map(t => t.serie).filter(s => s && s.trim()))].sort((a, b) => {
                const na = parseInt((a.match(/\d+/) || [0])[0]);
                const nb = parseInt((b.match(/\d+/) || [0])[0]);
                return na - nb;
            });
            seriesUnicas.forEach(s => {
                const o = document.createElement('option');
                o.value = s;
                o.textContent = s;
                ss.appendChild(o);
            });
            turmas.forEach(t => {
                const o = document.createElement('option');
                o.value = t.id;
                o.textContent = t.nome + ' - ' + (t.serie || '');
                o.dataset.serie = t.serie || '';
                st.appendChild(o);
            });
        }
        await carregarProvasRelTurma(escolaId, null);
    } catch (e) { console.error('carregarTurmasRelTurma:', e); }
    carregarRelatorioTurmaFiltrado();
}

async function carregarProvasRelTurma(escolaId, serie) {
    const sp = document.getElementById('rel-turma-prova');
    if (!sp) return;
    sp.innerHTML = '<option value="">Selecione a prova</option>';
    try {
        const provas = await carregarProvasComCache();
        if (provas && !provas.erro) {
            let lista = provas;
            if (escolaId) {
                const eid = parseInt(escolaId);
                lista = lista.filter(p => parseInt(p.escola_id) === eid);
            }
            if (serie) {
                lista = lista.filter(p => p.serie === serie);
            }
            lista.forEach(p => {
                const o = document.createElement('option');
                o.value = p.id;
                o.textContent = p.titulo + ' - ' + (p.serie || '') + ' - ' + (p.disciplina || '');
                o.dataset.disciplina = p.disciplina || '';
                o.dataset.serie = p.serie || '';
                sp.appendChild(o);
            });
        }
    } catch (e) { console.error('carregarProvasRelTurma:', e); }
}

function onRelTurmaEscolaChange(escolaId) { carregarTurmasRelTurma(escolaId); }
function onRelTurmaSerieChange(serie) {
    const st = document.getElementById('rel-turma-turma');
    if (st) {
        const optAtual = st.options[st.selectedIndex];
        if (optAtual && optAtual.dataset.serie && optAtual.dataset.serie !== serie) st.value = '';
        Array.from(st.options).forEach(opt => {
            if (!opt.dataset.serie) return;
            opt.style.display = (!serie || opt.dataset.serie === serie) ? '' : 'none';
        });
    }
    const escolaId = document.getElementById('rel-turma-escola')?.value || '';
    carregarProvasRelTurma(escolaId, serie || null);
    carregarRelatorioTurmaFiltrado();
}
function onRelTurmaTurmaChange(turmaId) {
    const st = document.getElementById('rel-turma-turma');
    const ss = document.getElementById('rel-turma-serie');
    const opt = st?.options[st.selectedIndex];
    const serie = opt?.dataset?.serie || '';
    if (serie && ss && !ss.value) {
        ss.value = serie;
        const escolaId = document.getElementById('rel-turma-escola')?.value || '';
        carregarProvasRelTurma(escolaId, serie);
    }
    carregarRelatorioTurmaFiltrado();
}
async function limparFiltrosRelTurma() {
    try {
        ['rel-turma-escola', 'rel-turma-serie', 'rel-turma-turma', 'rel-turma-prova'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        await carregarFiltrosRelTurma();
        await carregarRelatorioTurmaFiltrado();
        showToast('✕ Filtros limpos!', 'info');
    } catch (e) {
        console.error('limparFiltrosRelTurma:', e);
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
        const dm = {
            'Português': { k: 'portugues', label: 'Português' },
            'Matemática': { k: 'matematica', label: 'Matemática' },
            'Produção de Texto': { k: 'producao', label: 'Produção', prod: true },
            'Ciências Humanas': { k: 'ch', label: 'CH' },
            'Ciências Naturais': { k: 'cn', label: 'CN' },
            'História': { k: 'ch', label: 'CH' },
            'Geografia': { k: 'ch', label: 'CH' },
            'Inglês': { k: 'ingles', label: 'Inglês' }
        };
        if (!pi || !op || !op.dataset.disciplina) {
            const tb = document.getElementById('tb-rel-alunos');
            if (tb) tb.innerHTML = '<tr><td colspan="17" style="text-align:center;padding:30px;color:var(--text3);">📌 Selecione uma prova para visualizar o relatório</td></tr>';
            setText('rel-total-alunos-tabela', '0 alunos');
            setText('rel-total-correcoes', '0 correções');
            setText('rel-disc-acertos', '0');
            setText('rel-disc-erros', '0');
            setText('rel-disc-media', '0.0');
            setText('rel-disciplina-nome', '—');
            setText('rel-disc-conceito', '—');
            return;
        }
        const discSel = op.dataset.disciplina;
        const info = dm[discSel] || { k: 'portugues', label: 'Português' };
        const discKey = info.k;
        const isProd = !!info.prod;
        let alunosTurma = [];
        if (ti) {
            try {
                const d = await carregarAlunosComCache({ turma_id: ti });
                if (d && !d.erro && Array.isArray(d)) alunosTurma = d;
            } catch (e) {}
        }
        let url = API_URL + '/api/historico/agrupado';
        const p = new URLSearchParams();
        if (ei) p.append('escola', ei);
        if (se) p.append('serie', se);
        if (ti) p.append('turma', ti);
        if (pi) p.append('prova', pi);
        if (p.toString()) url += '?' + p.toString();
        const r = await apiFetch(url);
        const agrup = await r.json();
        const com = [];
        if (agrup && !agrup.erro && Array.isArray(agrup)) {
            agrup.forEach(a => {
                const dd = a[discKey];
                if (dd && typeof dd === 'object' && !dd.sem_avaliacao && (dd.data || dd.prova) && (dd.total > 0 || dd.nota > 0)) {
                    const ac = dd.acertos || 0;
                    const tot = (typeof dd.total === 'number' && dd.total > 0) ? dd.total : (dd.nota > 0 ? 10 : 0);
                    com.push({ ...a, dados: { ac, er: Math.max(0, tot - ac), tot, pct: tot > 0 ? Math.round((ac / tot) * 100) : 0, nota: dd.nota || 0 } });
                }
            });
        }
        const sem = [];
        if (alunosTurma.length > 0) {
            const ids = new Set(com.map(a => a.aluno_id));
            alunosTurma.forEach(a => {
                if (!ids.has(a.id)) {
                    sem.push({ aluno_id: a.id, aluno_nome: a.nome, serie: a.turma_serie || se, numero_chamada: a.numero_chamada, dados: { ac: 0, er: 0, tot: 0, pct: 0, nota: 0, sem_avaliacao: true } });
                }
            });
        }
        const totalC = com.length;
        setText('rel-total-alunos-tabela', totalC + ' alunos');
        setText('rel-total-correcoes', totalC + ' correções');
        let somaAc = 0; com.forEach(a => somaAc += a.dados.ac);
        setText('rel-disc-acertos', somaAc);
        setText('rel-disc-erros', totalC > 0 ? com.reduce((s, a) => s + a.dados.er, 0) : 0);
        setText('rel-disc-media', totalC > 0 ? (somaAc / totalC).toFixed(1) : '0.0');
        const mediaPct = totalC > 0 ? Math.round(com.reduce((s, a) => s + a.dados.pct, 0) / totalC) : 0;
        setText('rel-disciplina-nome', info.label);
        setText('rel-disc-conceito', calcularConceito(mediaPct));
        const table = document.querySelector('#tb-rel-alunos')?.closest('table');
        const thead = table?.querySelector('thead');
        const cols = isProd ? 1 : 3;
        if (thead) thead.innerHTML = `<tr><th>POS.</th><th>Nº</th><th>NOME</th><th>SÉRIE</th><th colspan="${cols}">${info.label.toUpperCase()}</th></tr><tr>${Array(4).fill('<th></th>').join('')}${isProd ? '<th>NOTA</th>' : '<th>ACERTOS</th><th>ERROS</th><th>NOTA</th>'}</tr>`;
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
            const temAvaliacao = !d.sem_avaliacao && (d.tot > 0 || d.nota > 0);
            let cel;
            if (isProd) cel = `<td style="text-align:center;font-weight:900;color:var(--purple);">${temAvaliacao && d.nota ? Number(d.nota).toFixed(1) : '—'}</td>`;
            else if (temAvaliacao) cel = `<td style="text-align:center;color:var(--green);font-weight:700;">${d.ac}</td><td style="text-align:center;color:var(--red);font-weight:700;">${d.er}</td><td style="text-align:center;color:var(--blue);font-weight:900;">${d.nota ? Number(d.nota).toFixed(1) : '—'}</td>`;
            else cel = `<td style="text-align:center;color:var(--text3);">—</td><td style="text-align:center;color:var(--text3);">—</td><td style="text-align:center;color:var(--text3);">—</td>`;
            return `<tr><td style="text-align:center;">${med}</td><td style="text-align:center;">${a.numero_chamada || (ix + 1)}</td><td style="padding-left:10px;"><strong>${escapeHtml(a.aluno_nome || '—')}</strong></td><td style="text-align:center;"><span class="badge badge-purple" style="font-size:9px;">${escapeHtml(a.serie || '—')}</span></td>${cel}</tr>`;
        }).join('');
    } catch (e) {
        console.error('❌ carregarRelatorioTurmaFiltrado:', e);
        showToast('❌ Erro: ' + e.message, 'error');
    }
}

function imprimirRelatorioTurma() {
    const table = document.querySelector('#tb-rel-alunos')?.closest('table');
    if (!table) { showToast('❌ Sem dados!', 'error'); return; }
    const rows = table.querySelectorAll('tbody tr');
    if (rows.length === 0) { showToast('⚠ Sem dados', 'error'); return; }

    // ─── Captura dados dos filtros ───────────────────────
    const es = document.getElementById('rel-turma-escola');
    const se = document.getElementById('rel-turma-serie');
    const tu = document.getElementById('rel-turma-turma');
    const pr = document.getElementById('rel-turma-prova');
    const en = es?.options[es.selectedIndex]?.text || '—';
    const sn = se?.options[se.selectedIndex]?.text || '—';
    const tn = tu?.options[tu.selectedIndex]?.text || '—';
    const pn = pr?.options[pr.selectedIndex]?.text || '—';
    const disciplina = document.getElementById('rel-disciplina-nome')?.textContent || '—';

    // ─── Captura métricas dos cards de resumo ────────────
    const totalAlunos = document.getElementById('rel-total-alunos-tabela')?.textContent || '0';
    const totalAcertos = document.getElementById('rel-disc-acertos')?.textContent || '0';
    const totalErros = document.getElementById('rel-disc-erros')?.textContent || '0';
    const media = document.getElementById('rel-disc-media')?.textContent || '0.0';
    const conceito = document.getElementById('rel-disc-conceito')?.textContent || '—';
    const totalCorrecoes = document.getElementById('rel-total-correcoes')?.textContent || '0 correções';

    // ─── Mapeia cabeçalhos da tabela ─────────────────────
    const thead = table.querySelector('thead');
    const theadRows = thead?.querySelectorAll('tr') || [];
    let colunas = [];
    if (theadRows.length > 1) {
        const r1 = theadRows[0].querySelectorAll('th');
        const r2 = theadRows[1].querySelectorAll('th');
        let i2 = 0;
        r1.forEach(th1 => {
            const cs = parseInt(th1.getAttribute('colspan')) || 1;
            const rs = parseInt(th1.getAttribute('rowspan')) || 1;
            const txt = th1.textContent.trim();
            if (rs === 2) colunas.push({ tipo: 'fixa', nome: txt });
            else {
                const subs = [];
                for (let k = 0; k < cs; k++) subs.push(r2[i2 + k]?.textContent.trim() || '');
                i2 += cs;
                colunas.push({ tipo: 'disc', nome: txt, sub: subs });
            }
        });
    } else {
        theadRows[0]?.querySelectorAll('th').forEach(th => colunas.push({ tipo: 'fixa', nome: th.textContent.trim() }));
    }

    // ─── Coleta linhas de dados ──────────────────────────
    const dados = [];
    rows.forEach(r => {
        const c = r.querySelectorAll('td');
        if (c.length === 0) return;
        const ln = [];
        c.forEach(x => ln.push(x.textContent.trim()));
        if (ln.length >= 4) dados.push(ln);
    });
    if (dados.length === 0) { showToast('⚠ Sem alunos', 'error'); return; }

    // ─── Monta HTML do cabeçalho ─────────────────────────
    let th1 = '<tr>', th2 = '<tr>';
    colunas.forEach(c => {
        if (c.tipo === 'fixa') {
            th1 += `<th rowspan="2">${escapeHtml(c.nome)}</th>`;
        } else {
            th1 += `<th colspan="${c.sub.length}" class="col-disc">${escapeHtml(c.nome)}</th>`;
            c.sub.forEach(s => { th2 += `<th class="sub-header">${escapeHtml(s)}</th>`; });
        }
    });
    th1 += '</tr>';
    th2 += '</tr>';

    // ─── Monta linhas do body ────────────────────────────
    let body = '';
    dados.forEach(ln => {
        body += '<tr>';
        ln.forEach((v, i) => {
            const sub = colunas.find(c => c.tipo === 'fixa') ? null : null;
            // Colore colunas numéricas (acertos/erros/nota)
            const isMedal = i === 0 && (v === '🥇' || v === '🥈' || v === '🥉');
            const isNota = i > 0 && /^\d+\.?\d*$/.test(v) && v.length < 6;
            const cls = isMedal ? 'medal' : '';
            body += `<td class="${cls}" ${isMedal ? 'style="font-size:16px;text-align:center;"' : ''}>${escapeHtml(v)}</td>`;
        });
        body += '</tr>';
    });

    // ─── Data por extenso ────────────────────────────────
    const data = new Date();
    const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    const dataExt = `${data.getDate()} de ${meses[data.getMonth()]} de ${data.getFullYear()}`;
    const dataCurta = data.toLocaleDateString('pt-BR');
    const hora = data.toLocaleTimeString('pt-BR').slice(0, 5);
    const orient = colunas.length > 8 ? 'landscape' : 'portrait';

    // ─── HTML final ──────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório por Turma — ${escapeHtml(tn)}</title>
<style>
  @page { size: A4 ${orient}; margin: 12mm 10mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 10px;
    color: #1f2937;
    line-height: 1.4;
  }

  /* ─── Cabeçalho institucional ─── */
  .header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding-bottom: 10px;
    border-bottom: 3px double #1e3a8a;
    margin-bottom: 12px;
  }
  .logo {
    width: 55px; height: 55px;
    background: linear-gradient(135deg, #1e40af, #7c3aed);
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 30px;
    flex-shrink: 0;
    box-shadow: 0 3px 8px rgba(30, 64, 175, 0.25);
  }
  .header-text { flex: 1; }
  .header-text h1 {
    font-size: 14pt;
    font-weight: 900;
    color: #1e3a8a;
    letter-spacing: -0.3px;
    margin-bottom: 2px;
  }
  .header-text h1 span { color: #7c3aed; }
  .header-text .sub {
    font-size: 8.5pt;
    color: #6b7280;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    font-weight: 600;
  }
  .header-text .system {
    font-size: 7.5pt;
    color: #9ca3af;
    margin-top: 2px;
  }
  .header-meta {
    text-align: right;
    font-size: 7.5pt;
    color: #6b7280;
    line-height: 1.6;
  }
  .header-meta strong { color: #1e3a8a; }

  /* ─── Título do relatório ─── */
  .title-bar {
    background: linear-gradient(90deg, #1e3a8a 0%, #3b82f6 100%);
    color: #fff;
    padding: 10px 16px;
    border-radius: 8px;
    text-align: center;
    margin-bottom: 12px;
    box-shadow: 0 2px 6px rgba(30, 58, 138, 0.2);
  }
  .title-bar h2 {
    font-size: 13pt;
    font-weight: 900;
    letter-spacing: 0.5px;
  }
  .title-bar .subtitle {
    font-size: 8.5pt;
    opacity: 0.9;
    margin-top: 2px;
  }

  /* ─── Grid de metadados ─── */
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    background: #f8fafc;
    padding: 10px 12px;
    border-left: 4px solid #1e3a8a;
    border-radius: 0 6px 6px 0;
    margin-bottom: 12px;
    font-size: 8.5pt;
  }
  .meta-item strong {
    display: block;
    color: #64748b;
    font-size: 7pt;
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
  }
  .meta-item span {
    color: #1f2937;
    font-weight: 700;
    font-size: 9pt;
  }

  /* ─── Cards de resumo ─── */
  .summary-cards {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    margin-bottom: 14px;
  }
  .card {
    padding: 10px 8px;
    border-radius: 8px;
    text-align: center;
    border: 1.5px solid;
    background: #fff;
  }
  .card .value {
    font-size: 18pt;
    font-weight: 900;
    line-height: 1;
    margin-bottom: 3px;
  }
  .card .label {
    font-size: 6.5pt;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    opacity: 0.85;
  }
  .card-blue { background: #eff6ff; border-color: #3b82f6; color: #1e40af; }
  .card-green { background: #ecfdf5; border-color: #10b981; color: #047857; }
  .card-red { background: #fef2f2; border-color: #ef4444; color: #b91c1c; }
  .card-purple { background: #f5f3ff; border-color: #8b5cf6; color: #6d28d9; }
  .card-orange { background: #fff7ed; border-color: #f59e0b; color: #c2410c; }

  /* ─── Tabela ─── */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8.5pt;
    margin-bottom: 12px;
    border: 1.5px solid #1e3a8a;
    border-radius: 6px;
    overflow: hidden;
  }
  thead tr:first-child th {
    background: #1e3a8a;
    color: #fff;
    padding: 7px 6px;
    font-size: 7.5pt;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    border: 1px solid #1e40af;
  }
  thead tr:nth-child(2) th.sub-header {
    background: #3b82f6;
    color: #fff;
    padding: 5px 4px;
    font-size: 6.5pt;
    font-weight: 700;
    text-transform: uppercase;
    border: 1px solid #2563eb;
  }
  thead th.col-disc { background: #0f172a; }
  tbody td {
    padding: 5px 6px;
    border: 1px solid #e2e8f0;
    text-align: center;
    color: #334155;
  }
  tbody td:nth-child(3) {
    text-align: left;
    font-weight: 700;
    color: #0f172a;
    padding-left: 8px;
  }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  tbody tr:hover td { background: #eff6ff; }
  tbody td.medal {
    font-size: 14px;
    background: #fefce8 !important;
    border-color: #fde047;
  }
  tbody tr:first-child td { background: #fefce8 !important; font-weight: 700; }
  tbody tr:nth-child(2) td { background: #f0f9ff !important; }
  tbody tr:nth-child(3) td { background: #fff7ed !important; }

  /* ─── Rodapé ─── */
  .footer-info {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 8pt;
    color: #64748b;
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
  }
  .footer-info strong { color: #1e3a8a; }

  .signatures {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 30px;
    margin-top: 40px;
    margin-bottom: 15px;
  }
  .signature-line {
    border-top: 1.5px solid #1e293b;
    padding-top: 4px;
    text-align: center;
    font-size: 8pt;
    font-weight: 700;
    color: #334155;
    margin-top: 25px;
  }
  .signature-line small {
    display: block;
    font-size: 7pt;
    color: #94a3b8;
    font-weight: 400;
    margin-top: 2px;
  }

  .footer {
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid #cbd5e1;
    display: flex;
    justify-content: space-between;
    font-size: 7pt;
    color: #94a3b8;
  }
  .footer strong { color: #1e3a8a; }

  /* ─── Impressão ─── */
  @media print {
    body { padding: 0; }
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    tbody tr:hover td { background: inherit !important; }
  }
</style>
</head>
<body>

<!-- ═══════ CABEÇALHO INSTITUCIONAL ═══════ -->
<div class="header">
  <div class="logo">🤖</div>
  <div class="header-text">
    <h1>Nota<span>Certa</span> AI</h1>
    <div class="sub">Sistema Inteligente de Correção de Provas</div>
    <div class="system">SECRETARIA MUNICIPAL DE EDUCAÇÃO — SISAM 2026</div>
  </div>
  <div class="header-meta">
    <div><strong>Emissão:</strong> ${dataCurta} às ${hora}</div>
    <div><strong>Página:</strong> 1 de 1</div>
    <div><strong>Doc:</strong> REL-TURMA</div>
  </div>
</div>

<!-- ═══════ TÍTULO DO RELATÓRIO ═══════ -->
<div class="title-bar">
  <h2>📊 RELATÓRIO DE DESEMPENHO POR TURMA</h2>
  <div class="subtitle">Análise de acertos, erros e conceito por aluno · ${escapeHtml(disciplina)}</div>
</div>

<!-- ═══════ METADADOS DOS FILTROS ═══════ -->
<div class="meta-grid">
  <div class="meta-item">
    <strong>🏫 Escola</strong>
    <span>${escapeHtml(en)}</span>
  </div>
  <div class="meta-item">
    <strong>🎓 Série</strong>
    <span>${escapeHtml(sn)}</span>
  </div>
  <div class="meta-item">
    <strong>👥 Turma</strong>
    <span>${escapeHtml(tn)}</span>
  </div>
  <div class="meta-item">
    <strong>📑 Prova</strong>
    <span>${escapeHtml(pn)}</span>
  </div>
</div>

<!-- ═══════ CARDS DE RESUMO ═══════ -->
<div class="summary-cards">
  <div class="card card-blue">
    <div class="value">${escapeHtml(totalAlunos.replace('alunos', '').trim())}</div>
    <div class="label">Alunos</div>
  </div>
  <div class="card card-green">
    <div class="value">${escapeHtml(totalAcertos)}</div>
    <div class="label">Acertos</div>
  </div>
  <div class="card card-red">
    <div class="value">${escapeHtml(totalErros)}</div>
    <div class="label">Erros</div>
  </div>
  <div class="card card-purple">
    <div class="value">${escapeHtml(media)}</div>
    <div class="label">Média</div>
  </div>
  <div class="card card-orange">
    <div class="value" style="font-size:11pt;">${escapeHtml(conceito)}</div>
    <div class="label">Conceito</div>
  </div>
</div>

<!-- ═══════ TABELA DE ALUNOS ═══════ -->
<table>
  <thead>
    ${th1}
    ${th2}
  </thead>
  <tbody>
    ${body}
  </tbody>
</table>

<!-- ═══════ RODAPÉ INFORMATIVO ═══════ -->
<div class="footer-info">
  <span>📋 <strong>Total de correções:</strong> ${escapeHtml(totalCorrecoes)}</span>
  <span>📅 <strong>Data de emissão:</strong> ${dataExt}</span>
  <span>🎓 <strong>Disciplina:</strong> ${escapeHtml(disciplina)}</span>
  <span>📊 <strong>Conceito geral:</strong> ${escapeHtml(conceito)}</span>
</div>

<!-- ═══════ ASSINATURAS ═══════ -->
<div class="signatures">
  <div>
    <div class="signature-line">
      Professor(a) Responsável
      <small>${escapeHtml(disciplina)}</small>
    </div>
  </div>
  <div>
    <div class="signature-line">
      Coordenação Pedagógica
      <small>Visto / Carimbo</small>
    </div>
  </div>
  <div>
    <div class="signature-line">
      Direção da Escola
      <small>Visto / Carimbo</small>
    </div>
  </div>
</div>

<!-- ═══════ RODAPÉ LEGAL ═══════ -->
<div class="footer">
  <span>Gerado por <strong>NotaCerta AI</strong> · ${dataCurta} ${hora}</span>
  <span>Documento oficial — válido com assinatura e carimbo</span>
  <span>www.notacerta.com.br</span>
</div>

</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) { showToast('⚠ Permitir pop-ups para imprimir', 'error'); return; }
    w.document.write(html);
    w.document.close();
    w.onload = () => setTimeout(() => { w.focus(); w.print(); }, 500);
    showToast('🖨 Preparando impressão...', 'success');
}
