async function carregarDisciplinas() {
  const tb = document.getElementById('tb-disciplinas');
  if (!tb) return;
  tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3);">Carregando...</td></tr>';
  try {
    const r = await apiFetch(API_URL + '/api/disciplinas');
    const lista = await r.json();
    renderizarDisciplinas(Array.isArray(lista) ? lista : []);
  } catch (e) {
    tb.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--red);">Erro: ${escapeHtml(e.message)}</td></tr>`;
  }
}

function renderizarDisciplinas(lista) {
  const tb = document.getElementById('tb-disciplinas');
  if (!tb) return;
  if (!lista.length) {
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3);">Nenhuma disciplina.</td></tr>';
    return;
  }
  window._discCache = lista;
  tb.innerHTML = lista.map(d => {
    const escopo = d.escola_id === null
      ? '<span class="badge badge-blue">🌐 Global</span>'
      : '<span class="badge badge-green">🏫 Escola</span>';
    return `<tr>
      <td style="text-align:center;font-size:22px;">${escapeHtml(d.icone || '📚')}</td>
      <td><strong>${escapeHtml(d.nome)}</strong></td>
      <td><code>${escapeHtml(d.codigo)}</code></td>
      <td><span style="display:inline-block;width:22px;height:22px;border-radius:6px;background:${escapeAttr(d.cor || '#3b82f6')};"></span></td>
      <td>${escopo}</td>
      <td style="text-align:center;">${d.ordem ?? 99}</td>
      <td><div class="btn-group">
        <button class="btn btn-outline btn-sm" onclick="editarDisciplina(${d.id})">✏️</button>
        <button class="btn btn-red btn-sm" onclick="excluirDisciplina(${d.id})">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
}

function abrirModalDisciplina(d) {
  openM('m-disciplina');
  const titulo = document.getElementById('m-disciplina-titulo');
  const inputId = document.getElementById('disciplina-id');
  const inputNome = document.getElementById('disciplina-nome');
  const inputIcone = document.getElementById('disciplina-icone');
  const inputCor = document.getElementById('disciplina-cor');
  const inputOrdem = document.getElementById('disciplina-ordem');
  if (d && d.id) {
    titulo.textContent = '✏️ Editar Disciplina';
    inputId.value = d.id;
    inputNome.value = d.nome || '';
    inputIcone.value = d.icone || '📚';
    inputCor.value = d.cor || '#3b82f6';
    inputOrdem.value = d.ordem ?? 99;
  } else {
    titulo.textContent = '📚 Nova Disciplina';
    inputId.value = '';
    inputNome.value = '';
    inputIcone.value = '📚';
    inputCor.value = '#3b82f6';
    inputOrdem.value = 99;
  }
  setTimeout(() => inputNome && inputNome.focus(), 60);
}

function fecharModalDisciplina() { closeM('m-disciplina'); }

async function salvarDisciplina() {
  const id = (document.getElementById('disciplina-id')?.value || '').trim();
  const nome = (document.getElementById('disciplina-nome')?.value || '').trim();
  const icone = (document.getElementById('disciplina-icone')?.value || '').trim() || '📚';
  const cor = document.getElementById('disciplina-cor')?.value || '#3b82f6';
  const ordem = parseInt(document.getElementById('disciplina-ordem')?.value, 10) || 99;
  if (!nome) { showToast('Digite o nome', 'error'); return; }
  const url = id ? `/api/disciplinas/${id}` : '/api/disciplinas';
  const metodo = id ? 'PUT' : 'POST';
  try {
    const r = await apiFetch(API_URL + url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, icone, cor, ordem }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { showToast(data.erro || 'Erro', 'error'); return; }
    showToast(id ? '✅ Atualizada' : '✅ Criada', 'success');
    fecharModalDisciplina();
    carregarDisciplinas();
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

function editarDisciplina(id) {
  const d = (window._discCache || []).find(x => x.id === id);
  if (d) abrirModalDisciplina(d);
}

async function excluirDisciplina(id) {
  const d = (window._discCache || []).find(x => x.id === id);
  if (!d) return;
  const aviso = d.escola_id === null
    ? `"${d.nome}" é GLOBAL. Confirmar?`
    : `Desativar "${d.nome}"?`;
  if (!confirm(aviso)) return;
  try {
    const r = await apiFetch(API_URL + `/api/disciplinas/${id}`, { method: 'DELETE' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { alert(data.erro || 'Erro'); return; }
    carregarDisciplinas();
  } catch (e) { alert('Erro: ' + e.message); }
}

document.addEventListener('DOMContentLoaded', () => {
  const menuDisc = document.querySelector('.sb-item[data-p="disciplinas"]');
  if (menuDisc) menuDisc.addEventListener('click', () => setTimeout(carregarDisciplinas, 80));
});

if (typeof go === 'function') {
  const _goOriginal = window.go;
  window.go = function(page) {
    _goOriginal(page);
    if (page === 'disciplinas') setTimeout(carregarDisciplinas, 80);
  };
}
