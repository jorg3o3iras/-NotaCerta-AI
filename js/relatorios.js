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
                if (!map.has(num)) map.set(num, { acertos: 0, erros: 0, gabarito: '', bncc: '' });
                const dd = map.get(num);
                const r = q.resposta || '', g = q.gabarito || '';
                // Guarda gabarito oficial (primeiro válido encontrado)
                if (!dd.gabarito && g && g !== '—' && g !== '-') {
                    dd.gabarito = String(g).toUpperCase().trim();
                }
                // Guarda BNCC (primeiro válido)
                if (!dd.bncc && q.bncc) dd.bncc = String(q.bncc).trim();
                const rv = r && r !== '—' && r !== '-';
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

            // ═══════════ CABEÇALHO COM GABARITO OFICIAL COMPLETO - CENTRALIZADO ═══════════
            const gabaritoInline = keys.map(num => {
                const d = map.get(num);
                return `<span style="background:rgba(139,92,246,.15);color:#a78bfa;padding:3px 10px;border-radius:6px;font-weight:700;font-size:12px;font-family:'Courier New',monospace;border:1px solid rgba(139,92,246,.3);">Q${num}: <strong>${d.gabarito || '?'}</strong></span>`;
            }).join(' ');
            const cab = document.createElement('div');
            cab.style.cssText = 'grid-column:1/-1;background:linear-gradient(135deg,rgba(139,92,246,.10),rgba(59,130,246,.10));border-radius:10px;padding:14px 14px;margin-bottom:6px;border:1px solid rgba(139,92,246,.30);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;';
            cab.innerHTML = `
                <div style="font-size:11px;font-weight:800;color:#a78bfa;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:6px;width:100%;text-align:center;">
                    📋 Gabarito Oficial da Prova
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;align-items:center;width:100%;text-align:center;">${gabaritoInline}</div>
            `;
            cont.appendChild(cab);

            // ═══════════ CARDS POR QUESTÃO ═══════════
            keys.forEach(num => {
                const d = map.get(num); const t = d.acertos + d.erros;
                const pa = t > 0 ? Math.round((d.acertos / t) * 100) : 0;
                const div = document.createElement('div');
                div.className = 'acertos-por-questao-item';
                div.style.cssText = 'background:var(--surface);border-radius:10px;padding:12px 8px;border:1px solid var(--border);text-align:center;position:relative;';
                const cb = pa >= 80 ? '#10b981' : pa >= 60 ? '#f59e0b' : '#ef4444';
                div.innerHTML = `
                    <div style="font-size:14px;font-weight:800;margin-bottom:4px;">Q${num}</div>
                    <div style="font-size:11px;font-weight:800;color:#a78bfa;background:rgba(139,92,246,.15);padding:2px 10px;border-radius:6px;display:inline-block;margin-bottom:6px;font-family:'Courier New',monospace;border:1px solid rgba(139,92,246,.25);">GAB: ${d.gabarito || '?'}</div>
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
