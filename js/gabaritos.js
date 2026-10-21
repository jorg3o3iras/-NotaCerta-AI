// gabaritos.js
async function carregarGabaritos() {
    try {
        const provas = await carregarProvasComCache();
        const tbody = document.getElementById('tb-gabaritos');
        if (!tbody) return;
        const comGabarito = provas.filter(p => p.gabarito && p.gabarito.length > 0);
        if (!comGabarito || comGabarito.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3);">Nenhum gabarito</td></tr>';
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
        let opts = '<option value="">—</option>';
        alts.forEach(a => { opts += '<option>' + a + '</option>'; });
        div.innerHTML = `<div class="gab-num">Q${i}</div><select class="gab-select" onchange="this.classList.toggle('filled', this.value!='')">${opts}</select><input class="gab-bncc" placeholder="BNCC" style="width:100%;margin-top:2px;padding:5px 8px;background:var(--bg);border:2px solid var(--border2);border-radius:6px;color:var(--text);font-size:10px;text-align:center;" />`;
        grid.appendChild(div);
    }
}

function renderizarAlternativasProducao(idx, cont) {
    const q = gabProducaoData.questoes[idx];
    if (!q || !cont) return;
    const ao = Object.keys(q.alternativas).sort();
    cont.innerHTML = '';
    ao.forEach(l => {
        const it = document.createElement('div');
        it.className = 'gab-alternativa-item';
        it.innerHTML = `<div class="alt-letra">${escapeHtml(l)}</div><textarea class="alt-texto" placeholder="Resposta ${escapeHtml(l)}..." data-index="${idx}" data-letra="${l}" onchange="atualizarAlternativaProducao(this)">${escapeHtml(q.alternativas[l] || '')}</textarea>${ao.length > 1 ? `<button class="btn-remover-alt" onclick="removerAlternativaProducao(${idx}, '${l}')" title="Remover">×</button>` : ''}`;
        cont.appendChild(it);
    });
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const ul = ao[ao.length - 1] || 'C';
    const pl = letras[letras.indexOf(ul) + 1];
    if (pl && letras.indexOf(ul) < 25) {
        const b = document.createElement('button');
        b.className = 'btn btn-outline btn-sm';
        b.style.cssText = 'align-self:flex-start;margin-top:4px;';
        b.textContent = `➕ Adicionar ${pl}`;
        b.onclick = () => adicionarAlternativaProducao(idx);
        cont.appendChild(b);
    }
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
function adicionarAlternativaProducao(i) {
    const q = gabProducaoData.questoes[i]; if (!q) return;
    const l26 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const at = Object.keys(q.alternativas).sort();
    const ul = at[at.length-1] || 'A';
    const p = l26[l26.indexOf(ul)+1];
    if (p) { q.alternativas[p] = ''; const c = document.getElementById(`gab-alts-${i}`); if (c) renderizarAlternativasProducao(i, c); }
}
function removerAlternativaProducao(i, l) {
    const q = gabProducaoData.questoes[i]; if (!q) return;
    if (Object.keys(q.alternativas).length <= 1) { showToast('⚠️ Pelo menos uma!', 'warning'); return; }
    delete q.alternativas[l];
    const c = document.getElementById(`gab-alts-${i}`); if (c) renderizarAlternativasProducao(i, c);
}
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
            if (r.ok && res.id) { showToast('✅ ' + (res.mensagem || 'Salvo!'), 'success'); limparCache(); carregarGabaritos(); if (typeof carregarCombos === 'function') carregarCombos(); carregarProvas(); }
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
        if (r.ok && res.id) { showToast('✅ ' + (res.mensagem || 'Salvo!'), 'success'); limparCache(); carregarGabaritos(); if (typeof carregarCombos === 'function') carregarCombos(); carregarProvas(); }
        else showToast('❌ ' + (res.erro || 'Erro'), 'error');
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}
async function editarGabarito(id) {
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
        const r = await apiFetch(API_URL + '/api/gabaritos/' + id, { method: 'DELETE' });
        const res = await processarRespostaAPI(r);
        if (res.ok) { showToast('🗑️ Excluído', 'success'); limparCache(); carregarGabaritos(); carregarProvas(); }
        else showToast('❌ ' + (res.data.erro || 'Erro'), 'error');
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

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
    if (disc === 'Produção de Texto') { info.textContent = '📝 Produção de Texto'; info.style.color = '#a78bfa'; }
    else { info.textContent = '📝 4 alternativas A, B, C, D'; info.style.color = 'var(--blue)'; }
}