from flask import Blueprint, jsonify

from backend.auth import get_escola_id
from backend.db import get_db_connection
from backend.services.card_generator import gerar_cartao_html

cartao_bp = Blueprint('cartao', __name__, url_prefix='/api')


@cartao_bp.route('/gerar_gabarito', methods=['POST'])
def gerar_gabarito():
    from flask import request
    data = request.json or {}
    for campo in ['escola_id','turma_id','aluno_id','prova_id']:
        if not data.get(campo):
            return jsonify({'erro': f'Campo "{campo}" obrigatório'}), 400
    escola_id = data['escola_id']; turma_id = data['turma_id']
    aluno_id = data['aluno_id']; prova_id = data['prova_id']
    try: escola_sessao = get_escola_id()
    except PermissionError as e: return jsonify({'erro': str(e)}), 403
    if escola_sessao is not None and int(escola_id) != escola_sessao:
        return jsonify({'erro': 'Acesso negado'}), 403
    html, status, headers = gerar_cartao_html(escola_id, turma_id, aluno_id, prova_id)
    if html is None:
        return jsonify({'erro': 'Não foi possível gerar o cartão'}), status
    return html, status, headers