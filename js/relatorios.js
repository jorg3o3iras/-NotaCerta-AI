// relatorios.js

// ─── FILTROS EM CASCATA ──────────────────────────────

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
    const valorAnterior = sp.value;
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
            if (valorAnterior) {
                const existe = Array.from(sp.options).some(o => o.value === valorAnterior);
                if (existe) sp.value = valorAnterior;
            }
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
            'Inglês': { k: 'portugues', label: 'Português' }
        };

        // ═══════════════════════════════════════════════════════════
        // ✅ FIX: SEM auto-seleção de prova. Só renderiza se o usuário
        //         escolheu uma prova explicitamente.
        // ═══════════════════════════════════════════════════════════
        let discSel = '';
        if (op && op.value && op.dataset.disciplina) {
            discSel = op.dataset.disciplina;
        }

        if (!discSel) {
            const tb = document.getElementById('tb-rel-alunos');
            if (tb) tb.innerHTML = '<tr><td colspan="17" style="text-align:center;padding:30px;color:var(--text3);">📌 Selecione uma prova para visualizar o relatório</td></tr>';
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
        if (isProd) {
            const c = document.getElementById('rel-acertos-por-questao');
            if (c) c.style.display = 'none';
        } else {
            const c = document.getElementById('rel-acertos-por-questao');
            if (c) c.style.display = 'block';
            atualizarGraficoAcertosPorQuestao(agrup, info.label, discKey);
        }
    } catch (e) {
        console.error('❌ carregarRelatorioTurmaFiltrado:', e);
        showToast('❌ Erro: ' + e.message, 'error');
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
        if (!agrup || agrup.erro || !Array.isArray(agrup) || agrup.length === 0) {
            cont.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text3);">Nenhum dado</div>';
            return;
        }
        const map = new Map();
        let totalAc = 0, totalEr = 0, totalAl = 0;
        agrup.forEach(a => {
            const d = a[key]; if (!d || typeof d !== 'object') return;
            const qs = d.questoes_status || []; totalAl++;
            if (Array.isArray(qs) && qs.length > 0) qs.forEach((q, ix) => {
                const num = q.numero || ix + 1;
                if (!map.has(num)) map.set(num, { acertos: 0, erros: 0, gabarito: '', bncc: '', contagem: {} });
                const dd = map.get(num);
                const r = q.resposta || '', g = q.gabarito || '';
                if (!dd.gabarito && g && g !== '—' && g !== '-') dd.gabarito = String(g).toUpperCase().trim();
                if (!dd.bncc && q.bncc) dd.bncc = String(q.bncc).trim();
                const rv = r && r !== '—' && r !== '-';
                if (rv) { const letra = String(r).toUpperCase().trim(); dd.contagem[letra] = (dd.contagem[letra] || 0) + 1; }
                const ic = rv && r.toUpperCase() === g.toUpperCase();
                if (ic || q.acertou === true) { dd.acertos++; totalAc++; } else { dd.erros++; totalEr++; }
            });
        });
        const tot = map.size || 20;
        if (totEl) totEl.textContent = tot + ' questões';
        if (taEl) taEl.textContent = totalAc;
        if (teEl) teEl.textContent = totalEr;
        if (meEl) meEl.textContent = (totalAl > 0 && tot > 0 ? Math.round((totalAc / (totalAl * tot)) * 100) : 0) + '%';
        if (cont) {
            cont.innerHTML = '';
            const keys = Array.from(map.keys()).sort((a, b) => a - b);
            if (keys.length === 0) {
                cont.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text3);">Nenhum dado</div>';
                return;
            }
            const gabaritoInline = keys.map(num => {
                const d = map.get(num);
                return `<span style="background:rgba(139,92,246,.15);color:#a78bfa;padding:3px 10px;border-radius:6px;font-weight:700;font-size:12px;font-family:'Courier New',monospace;border:1px solid rgba(139,92,246,.3);">Q${num}: <strong>${d.gabarito || '?'}</strong></span>`;
            }).join(' ');
            const cab = document.createElement('div');
            cab.style.cssText = 'grid-column:1/-1;background:linear-gradient(135deg,rgba(139,92,246,.10),rgba(59,130,246,.10));border-radius:10px;padding:12px 14px;margin-bottom:6px;border:1px solid rgba(139,92,246,.30);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;';
            cab.innerHTML = `
                <div style="font-size:11px;font-weight:800;color:#a78bfa;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:6px;width:100%;text-align:center;">
                    📋 Gabarito Oficial da Prova
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:5px;justify-content:center;align-items:center;width:100%;">${gabaritoInline}</div>
            `;
            cont.appendChild(cab);
            keys.forEach(num => {
                const d = map.get(num); const t = d.acertos + d.erros;
                const pa = t > 0 ? Math.round((d.acertos / t) * 100) : 0;
                const div = document.createElement('div');
                div.className = 'acertos-por-questao-item';
                div.style.cssText = 'background:var(--surface);border-radius:10px;padding:12px 8px;border:1px solid var(--border);text-align:center;position:relative;';
                const cb = pa >= 80 ? '#10b981' : pa >= 60 ? '#f59e0b' : '#ef4444';
                const respOrdenado = Object.entries(d.contagem).sort((a, b) => b[1] - a[1]);
                const respTop = respOrdenado.length > 0 ? respOrdenado[0][0] : '';
                const respAcertou = respTop && d.gabarito && respTop === d.gabarito;
                const corResp = !respTop ? '#94a3b8' : (respAcertou ? '#10b981' : '#ef4444');
                const letras = Object.keys(d.contagem).sort();
                const breakdown = letras.length > 0 ? letras.map(l => {
                    const qtd = d.contagem[l];
                    const isGab = l === d.gabarito;
                    return `<span style="font-size:9px;font-weight:700;color:${isGab ? '#10b981' : '#ef4444'};background:${isGab ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.10)'};padding:1px 5px;border-radius:3px;font-family:'Courier New',monospace;border:1px solid ${isGab ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.2)'};">${l}:${qtd}</span>`;
                }).join(' ') : '<span style="font-size:9px;color:var(--text3);">sem respostas</span>';
                div.innerHTML = `
                    <div style="font-size:14px;font-weight:800;margin-bottom:5px;">Q${num}</div>
                    <div style="display:flex;justify-content:center;gap:4px;margin-bottom:6px;flex-wrap:wrap;">
                        <span style="font-size:10px;font-weight:800;color:#a78bfa;background:rgba(139,92,246,.15);padding:2px 8px;border-radius:5px;font-family:'Courier New',monospace;border:1px solid rgba(139,92,246,.3);" title="Gabarito oficial">GAB: ${d.gabarito || '?'}</span>
                        ${respTop ? `<span style="font-size:10px;font-weight:800;color:${corResp};background:${corResp}22;padding:2px 8px;border-radius:5px;font-family:'Courier New',monospace;border:1px solid ${corResp}55;" title="Resposta do aluno">RESP: ${respTop} ${respAcertou ? '✓' : '✗'}</span>` : ''}
                    </div>
                    <div style="display:flex;justify-content:center;gap:3px;flex-wrap:wrap;margin-bottom:7px;">${breakdown}</div>
                    <div style="display:flex;justify-content:center;gap:4px;font-size:16px;font-weight:700;">
                        <span style="color:var(--green);">${d.acertos}</span>
                        <span style="color:var(--text3);">/</span>
                        <span style="color:var(--red);">${d.erros}</span>
                    </div>
                    <div style="font-size:9px;color:var(--text3);margin-bottom:4px;">Acertos / Erros</div>
                    <div class="progress" style="height:8px;background:var(--bg2);border-radius:6px;overflow:hidden;margin:6px 0;">
                        <div class="progress-fill" style="width:${Math.max(pa, 2)}%;background:${cb};border-radius:6px;"></div>
                    </div>
                    <div style="display:flex;justify-content:center;gap:10px;font-size:11px;font-weight:700;">
                        <span style="color:${cb};">${pa}%</span>
                    </div>
                    ${d.bncc ? `<div style="font-size:8px;color:var(--purple);margin-top:3px;font-weight:600;" title="Código BNCC">${d.bncc}</div>` : ''}
                `;
                cont.appendChild(div);
            });
        }
    } catch (e) { console.error(e); }
}

function imprimirRelatorioTurma() {
    const table = document.querySelector('#tb-rel-alunos')?.closest('table');
    if (!table) { showToast('❌ Sem dados!', 'error'); return; }
    const rows = table.querySelectorAll('tbody tr');
    if (rows.length === 0) { showToast('⚠ Sem dados', 'error'); return; }
    let html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relatório</title><style>body{font-family:Arial;margin:20px;font-size:11px;}h1{text-align:center;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:5px;text-align:center;}th{background:#f2f2f2;}</style></head><body>';
    html += '<h1>📊 Relatório por Turma</h1>';
    html += table.outerHTML;
    html += '</body></html>';
    const w = window.open('', '_blank');
    if (!w) { showToast('⚠ Pop-up!', 'error'); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
}
