// progress.js
window.progressManager = {
    overlay: null,
    iniciar(titulo, etapas, icone) {
        this.overlay = document.getElementById('progress-modal');
        if (!this.overlay) return;
        setText('progress-titulo', '⏳ ' + (titulo || 'Processando...'));
        setText('progress-icone', icone || '🤖');
        setText('progress-status', 'Iniciando...');
        setText('progress-porcentagem', '0%');
        setText('progress-tempo', '⏱️ estimado: --');
        const bar = document.getElementById('progress-barra');
        if (bar) bar.style.width = '0%';
        const e = document.getElementById('progress-etapas');
        if (e && etapas) e.innerHTML = etapas.map((et, i) => `<div style="display:flex;align-items:center;gap:6px;opacity:${i === 0 ? 1 : 0.4};"><span>${i === 0 ? '⏳' : '⏸️'}</span><span>${escapeHtml(et.nome || 'Etapa')}</span></div>`).join('');
        this.overlay.style.display = 'flex';
    },
    atualizarEtapa(idx) {
        const e = document.getElementById('progress-etapas');
        if (!e) return;
        Array.from(e.children).forEach((c, i) => {
            c.style.opacity = i <= idx ? 1 : 0.4;
            const ic = c.querySelector('span');
            if (ic) ic.textContent = i < idx ? '✅' : (i === idx ? '⏳' : '⏸️');
        });
    },
    concluirEtapa(idx) { this.atualizarEtapa(idx + 1); },
    proximaEtapa() {},
    erro(msg) { setText('progress-status', '❌ ' + msg); },
    finalizar(msg) { setText('progress-status', msg || '✅ Concluído'); setTimeout(() => this.fechar(), 1000); },
    fechar() { if (this.overlay) this.overlay.style.display = 'none'; }
};

window.tableFeedback = {
    destacarLinha(tbodyId, id, texto) {
        setTimeout(() => {
            const tb = document.getElementById(tbodyId);
            if (!tb) return;
            const tr = tb.querySelector(`tr[data-id="${id}"]`);
            if (!tr) return;
            tr.style.transition = 'background 0.5s';
            tr.style.background = 'rgba(16,185,129,0.15)';
            setTimeout(() => { tr.style.background = ''; }, 2500);
        }, 300);
    }
};
