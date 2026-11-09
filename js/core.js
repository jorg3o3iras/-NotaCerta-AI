// core.js — infraestrutura: API, cache, helpers, toast, modais
const API_URL = '';

function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function calcularConceito(pct) {
    if (pct <= 40) return 'inicial';
    if (pct <= 60) return 'basico';
    if (pct <= 80) return 'proficiente';
    return 'avancado';
}
function getUsuarioAtual() {
    try {
        const u = localStorage.getItem('usuarioLogado') || sessionStorage.getItem('usuarioLogado');
        if (u) return JSON.parse(u);
    } catch (e) {}
    return { username: 'admin', perfil: 'admin', nome: 'Administrador' };
}
async function apiFetch(url, options = {}) {
    const u = getUsuarioAtual();
    const headers = { ...(options.headers || {}) };
    if (u && u.username) headers['X-Usuario-Username'] = u.username;
    return fetch(url, { ...options, headers });
}
async function processarRespostaAPI(response) {
    const status = response.status;
    const ct = response.headers.get('content-type') || '';
    let data = {};
    if (ct.includes('application/json')) {
        try { data = await response.json(); } catch (e) { data = {}; }
    } else {
        const txt = await response.text();
        try { data = JSON.parse(txt); } catch (e) { data = { erro: txt || 'Erro' }; }
    }
    return { ok: response.ok, data, status };
}

const cache = { escolas: null, turmas: {}, alunos: {}, provas: null };
function limparCache() { cache.escolas = null; cache.turmas = {}; cache.alunos = {}; cache.provas = null; }

async function carregarEscolasComCache(force = false) {
    if (!force && cache.escolas) return cache.escolas;
    try {
        const r = await apiFetch(API_URL + '/api/escolas');
        const data = await r.json();
        if (Array.isArray(data)) cache.escolas = data;
        return cache.escolas || [];
    } catch (e) { console.error('Escolas:', e); return []; }
}
async function carregarTurmasComCache(escolaId = null, force = false) {
    const key = escolaId || 'all';
    if (!force && cache.turmas[key]) return cache.turmas[key];
    try {
        const url = API_URL + '/api/turmas' + (escolaId ? '?escola_id=' + escolaId : '');
        const r = await apiFetch(url);
        const data = await r.json();
        if (Array.isArray(data)) cache.turmas[key] = data;
        return cache.turmas[key] || [];
    } catch (e) { return []; }
}
async function carregarAlunosComCache(filtros = null, force = false) {
    const key = filtros ? JSON.stringify(filtros) : 'all';
    if (!force && cache.alunos[key]) return cache.alunos[key];
    try {
        let url = API_URL + '/api/alunos';
        const p = [];
        if (filtros) {
            if (filtros.escola_id) p.push('escola_id=' + filtros.escola_id);
            if (filtros.turma_id) p.push('turma_id=' + filtros.turma_id);
            if (filtros.serie) p.push('serie=' + encodeURIComponent(filtros.serie));
        }
        if (p.length) url += '?' + p.join('&');
        const r = await apiFetch(url);
        const data = await r.json();
        if (Array.isArray(data)) cache.alunos[key] = data;
        return cache.alunos[key] || [];
    } catch (e) { return []; }
}
async function carregarProvasComCache(force = false, escolaId = null) {
    if (!force && cache.provas) return cache.provas;
    try {
        const url = API_URL + '/api/provas' + (escolaId ? '?escola_id=' + escolaId : '');
        const r = await apiFetch(url);
        const data = await r.json();
        if (Array.isArray(data)) cache.provas = data;
        return cache.provas || [];
    } catch (e) { return []; }
}

function showToast(msg, type = 'info') {
    const c = document.getElementById('toast-c');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    const icons = { info: 'ℹ️', success: '✅', error: '❌', ai: '🤖', warning: '⚠️' };
    t.innerHTML = '<span>' + (icons[type] || 'ℹ️') + '</span><span>' + escapeHtml(msg) + '</span>';
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3200);
}
function filtrarTabela(input, tbodyId) {
    const v = input.value.toLowerCase();
    document.querySelectorAll('#' + tbodyId + ' tr').forEach(r => {
        r.style.display = r.textContent.toLowerCase().includes(v) ? '' : 'none';
    });
}
function closeM(id) { const m = document.getElementById(id); if (m) { m.style.display = 'none'; m.classList.remove('show'); } }
function openM(id) {
    const m = document.getElementById(id);
    if (m) { m.style.display = 'flex'; m.classList.add('show'); }
    if (id === 'm-turma' || id === 'm-aluno') {
        if (typeof carregarCombos === 'function') carregarCombos();
        if (id === 'm-aluno' && typeof carregarEscolasParaAluno === 'function') carregarEscolasParaAluno();
    }
    if (id === 'm-prova') {
        if (typeof carregarCombos === 'function') carregarCombos();
        const t = document.getElementById('modal-prova-tipo');
        if (t && typeof gerarGabaritoModal === 'function') gerarGabaritoModal(t.value);
    }
}
function switchTab(idx, btn) {
    const p = btn.closest('.tab-nav');
    if (p) { p.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
    const c = btn.closest('.card');
    if (c) c.querySelectorAll('.tab-c').forEach((tc, i) => { tc.style.display = i === idx ? 'block' : 'none'; });
}
function simUpload() { setTimeout(() => { const e = document.getElementById('up-ok'); if (e) e.style.display = 'block'; showToast('✅ Enviado!', 'success'); }, 600); }
function salvarConfiguracoes() { showToast('✅ Salvo!', 'success'); }
function renumerarTabela(tb) {
    if (!tb) return;
    tb.querySelectorAll('tr').forEach((tr, i) => {
        const b = tr.querySelector('.badge-blue, .badge-gray');
        if (b && b.textContent.match(/^\d+$/)) b.textContent = String(i+1).padStart(2, '0');
    });
}

let camStream = null;
let camFacing = 'environment';
let ultimaImagem = null;
let autoModoAtivo = false;
let delTarget = null;
let correcaoManualData = {};
let cmStandaloneData = {};
let gabProducaoData = { questoes: [] };