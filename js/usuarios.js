// usuarios.js
function atualizarObrigatorioEscolaUsuario() {
    const perfilSel = document.getElementById('usuario-perfil');
    const escolaSel = document.getElementById('usuario-escola');
    const reqEl = document.getElementById('usuario-escola-req');
    if (!perfilSel) return;
    const isUsuario = perfilSel.value !== 'admin';
    if (escolaSel) { escolaSel.required = isUsuario; if (!isUsuario) escolaSel.value = ''; }
    if (reqEl) reqEl.style.display = isUsuario ? 'inline' : 'none';
}

async function abrirModalUsuario(usuarioId = null) {
    const sel = document.getElementById('usuario-escola');
    if (sel) {
        sel.innerHTML = '<option value="">Carregando...</option>';
        try {
            const escolas = await carregarEscolasComCache(true);
            sel.innerHTML = '<option value="">Selecione...</option>' + escolas.map(e => `<option value="${e.id}">${escapeHtml(e.nome)}</option>`).join('');
        } catch (e) { sel.innerHTML = '<option value="">Erro</option>'; }
    }
    document.getElementById('editar-usuario-id').value = usuarioId || '';
    document.getElementById('usuario-nome').value = '';
    document.getElementById('usuario-username').value = '';
    document.getElementById('usuario-senha').value = '';
    document.getElementById('usuario-email').value = '';
    document.getElementById('usuario-perfil').value = 'usuario';
    document.getElementById('usuario-ativo').checked = true;
    if (sel) sel.value = '';
    const h3 = document.querySelector('#m-usuario .modal-header h3');
    if (h3) h3.textContent = usuarioId ? '✏️ Editar Usuário' : '👤 Cadastrar Usuário';
    if (usuarioId) {
        try {
            const r = await apiFetch(API_URL + '/api/usuarios/' + usuarioId);
            const u = await r.json();
            document.getElementById('usuario-nome').value = u.nome || '';
            document.getElementById('usuario-username').value = u.username || '';
            document.getElementById('usuario-email').value = u.email || '';
            document.getElementById('usuario-perfil').value = u.perfil || 'usuario';
            document.getElementById('usuario-ativo').checked = !!u.ativo;
            if (sel) sel.value = (u.escola_id != null) ? String(u.escola_id) : '';
        } catch (e) { showToast('❌ ' + e.message, 'error'); }
    }
    atualizarObrigatorioEscolaUsuario();
    openM('m-usuario');
}

async function editarUsuario(id) { await abrirModalUsuario(id); }

async function salvarUsuario() {
    const id = document.getElementById('editar-usuario-id').value;
    const perfil = document.getElementById('usuario-perfil').value;
    const escolaVal = document.getElementById('usuario-escola')?.value;
    const payload = {
        nome: document.getElementById('usuario-nome').value.trim(),
        username: document.getElementById('usuario-username').value.trim(),
        senha: document.getElementById('usuario-senha').value,
        email: document.getElementById('usuario-email').value.trim(),
        perfil, ativo: document.getElementById('usuario-ativo').checked,
        escola_id: perfil === 'admin' ? null : (escolaVal ? parseInt(escolaVal) : null)
    };
    if (!payload.nome || !payload.username) { showToast('❌ Nome e usuário obrigatórios!', 'error'); return; }
    if (!id && !payload.senha) { showToast('❌ Senha obrigatória!', 'error'); return; }
    if (payload.senha && payload.senha.length < 4) { showToast('❌ Senha 4+ caracteres!', 'error'); return; }
    if (payload.perfil !== 'admin' && !payload.escola_id) { showToast('❌ Escola obrigatória!', 'error'); return; }
    try {
        const url = id ? API_URL + '/api/usuarios/' + id : API_URL + '/api/usuarios';
        const method = id ? 'PUT' : 'POST';
        const response = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await processarRespostaAPI(response);
        if (result.ok) { showToast(id ? '✅ Atualizado!' : '✅ Criado!', 'success'); closeM('m-usuario'); carregarUsuarios(); }
        else showToast('❌ ' + (result.data.erro || 'Erro'), 'error');
    } catch (erro) { showToast('❌ ' + erro.message, 'error'); }
}

async function excluirUsuario(id, username) {
    if (username === 'admin') { showToast('⚠️ Não pode excluir admin!', 'error'); return; }
    if (!confirm('Excluir "' + username + '"?')) return;
    try {
        const response = await apiFetch(API_URL + '/api/usuarios/' + id, { method: 'DELETE' });
        const result = await processarRespostaAPI(response);
        if (result.ok) { showToast('🗑️ Excluído', 'success'); carregarUsuarios(); }
        else showToast('❌ ' + (result.data.erro || 'Erro'), 'error');
    } catch (erro) { showToast('❌ ' + erro.message, 'error'); }
}

async function carregarUsuarios() {
    try {
        const response = await apiFetch(API_URL + '/api/usuarios');
        if (response.status === 403) return;
        const usuarios = await response.json();
        const tbody = document.getElementById('tb-usuarios');
        if (!tbody) return;
        if (!usuarios || usuarios.length === 0 || usuarios.erro) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text3);">Nenhum usuário</td></tr>';
            return;
        }
        tbody.innerHTML = usuarios.map(u => {
            const perfilBadge = u.perfil === 'admin' ? 'badge-orange' : 'badge-blue';
            const statusBadge = u.ativo ? 'badge-green' : 'badge-red';
            const statusText = u.ativo ? 'Ativo' : 'Inativo';
            const isAdmin = u.username === 'admin';
            return `<tr data-id="${u.id}" data-username="${escapeAttr(u.username)}">
                <td><strong>${escapeHtml(u.username)}</strong><br><small style="color:var(--text3);font-size:10px;">${escapeHtml(u.nome || '')}</small>${u.escola_nome ? '<br><small style="color:var(--blue);font-size:10px;">🏫 ' + escapeHtml(u.escola_nome) + '</small>' : ''}</td>
                <td><span class="badge ${perfilBadge}">${u.perfil === 'admin' ? 'Admin' : 'Usuário'}</span></td>
                <td>${u.escola_nome ? escapeHtml(u.escola_nome) : '—'}</td>
                <td><span class="badge ${statusBadge}">${statusText}</span></td>
                <td><div class="btn-group">
                    ${isAdmin ? '<span style="font-size:10px;color:var(--text3);">Sistema</span>' :
                    `<button class="btn btn-outline btn-sm" onclick="editarUsuario(${u.id})">✏️</button><button class="btn-del" onclick="excluirUsuario(${u.id}, '${escapeAttr(u.username)}')">🗑️</button>`}
                </div></td>
            </tr>`;
        }).join('');
    } catch (erro) { console.error(erro); }
}

function pedirSenhaConfig() {
    const modal = document.getElementById('m-senha-config');
    if (!modal) return;
    const input = document.getElementById('senha-config-input');
    if (input) input.value = '';
    const erro = document.getElementById('senha-config-erro');
    if (erro) erro.style.display = 'none';
    openM('m-senha-config');
    setTimeout(() => { if (input) input.focus(); }, 200);
}
function cancelarSenhaConfig() { closeM('m-senha-config'); }
async function validarSenhaConfig() {
    const input = document.getElementById('senha-config-input');
    const erroDiv = document.getElementById('senha-config-erro');
    const senha = input ? input.value.trim() : '';
    if (erroDiv) erroDiv.style.display = 'none';
    if (!senha) { if (erroDiv) { erroDiv.textContent = '❌ Digite a senha.'; erroDiv.style.display = 'block'; } return; }
    let username = 'admin';
    try { const u = getUsuarioAtual(); if (u && u.username) username = u.username; } catch (e) {}
    try {
        const response = await apiFetch(API_URL + '/api/verificar-senha-admin', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senha, username })
        });
        const dados = await response.json();
        if (dados.ok) { closeM('m-senha-config'); showToast('🔓 Liberado!', 'success'); go('config'); }
        else if (erroDiv) { erroDiv.textContent = '❌ ' + (dados.erro || 'Senha incorreta'); erroDiv.style.display = 'block'; }
    } catch (erro) { if (erroDiv) { erroDiv.textContent = '❌ ' + erro.message; erroDiv.style.display = 'block'; } }
}