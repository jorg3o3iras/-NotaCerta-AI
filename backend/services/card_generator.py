import logging
import traceback
from datetime import datetime

from psycopg2.extras import RealDictCursor

from backend.db import get_db_connection
from backend.services.evalbee import gerar_mapa_template_padrao, salvar_mapa_template
from backend.services.qrcode_utils import carregar_logo_base64, gerar_qrcode_base64


def gerar_cartao_html(escola_id, turma_id, aluno_id, prova_id):
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return None, 503, {'Content-Type': 'application/json'}
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""SELECT a.nome, a.escola_id, e.nome as escola_nome,
            t.nome as turma_nome, t.serie FROM alunos a
            LEFT JOIN turmas t ON a.turma_id = t.id
            LEFT JOIN escolas e ON a.escola_id = e.id WHERE a.id = %s""", (aluno_id,))
        aluno = cur.fetchone()
        cur.execute("SELECT p.* FROM provas p WHERE p.id = %s", (prova_id,))
        prova = cur.fetchone()
        cur.close()
        if not aluno or not prova:
            return None, 404, {'Content-Type': 'application/json'}
        nome_aluno = aluno['nome']; escola_nome = aluno['escola_nome'] or ''
        turma_nome = aluno['turma_nome'] or ''
        logo_b64 = carregar_logo_base64('logotipo cartão resposta.png')
        logo_html = (f'<img src="{logo_b64}" alt="Logo" style="height:20mm;max-width:100%;object-fit:contain;margin:0 auto 1.5mm auto;display:block;">' if logo_b64 else '')
        serie = prova.get('serie', ''); titulo_prova = prova.get('titulo', 'Prova')
        disc_prova = (prova.get('disciplina') or '').strip()
        tipo_q = int(prova.get('tipo_questoes', 4))
        alts = ['A','B','C','D','E'][:tipo_q]
        qt_q = int(prova.get('quantidade_questoes', 20))
        if disc_prova == 'Redação':
            qr = gerar_qrcode_base64(f"ALUNO:{aluno_id}|PROVA:{prova_id}|ESCOLA:{escola_id}|TURMA:{turma_id}")
            nl = min(qt_q if qt_q >= 10 else 30, 50)
            linhas = ''
            for i in range(1, nl+1):
                linhas += f'<div style="display:flex;align-items:center;margin-bottom:1.5mm;"><div style="width:8mm;font-size:7pt;color:#999;text-align:right;padding-right:1.5mm;font-family:monospace;">{i:02d}</div><div style="flex:1;border-bottom:0.25mm solid #ccc;height:7.5mm;"></div></div>'
            html_red = f"""<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Redação - {nome_aluno}</title><style>
.btn-print{{position:absolute;bottom:5mm;left:50%;transform:translateX(-50%);padding:3mm 10mm;background:#000;color:#fff;border:none;font-size:11pt;cursor:pointer;}}@media print{{body{{background:#fff;padding:0;}}.btn-print{{display:none;}}}}
</style></head><body><div class="folha"><div class="fiducial fiducial-tl"></div><div class="fiducial fiducial-tr"></div><div class="fiducial fiducial-bl"></div><div class="fiducial fiducial-br"></div><div class="qr-code-bloco"><img src="data:image/png;base64,{qr}" alt="QR"></div><div class="header">{logo_html}<div class="header-titulo">SECRETARIA MUN. DE EDUCAÇÃO — SISAM 2026</div><div style="text-align:center"><div class="header-cartao">FOLHA DE REDAÇÃO</div></div><div class="header-prova">{titulo_prova}</div><div class="header-escola">{escola_nome} | Série: {serie} | Turma: {turma_nome}</div><div class="header-aluno"><strong>Aluno(a):</strong> {nome_aluno}</div></div><div class="area-redacao"><div class="area-redacao-titulo">✍️ TEXTO DEFINITIVO</div>{linhas}</div><button class="btn-print" onclick="window.print()">🖨️ IMPRIMIR</button></div></body></html>"""
            return html_red, 200, {'Content-Type': 'text/html'}
        num_col = 1 if qt_q <= 12 else 2
        mapa = gerar_mapa_template_padrao(qt_q, alts, num_col)
        salvar_mapa_template(prova_id, aluno_id, tipo_q, qt_q, num_col, mapa)
        qr = gerar_qrcode_base64(f"ALUNO:{aluno_id}|PROVA:{prova_id}|ESCOLA:{escola_id}|TURMA:{turma_id}")
        bolhas = ''; nums = ''; qs = {}
        for b in mapa:
            q = b['questao']
            if q not in qs: qs[q] = []
            qs[q].append(b)
        for q in sorted(qs.keys()):
            for b in qs[q]:
                bolhas += f'<div class="bolha-abs" style="left:{b["x_mm"]-3.5}mm;top:{b["y_mm"]-3.5}mm;">{b["alternativa"]}</div>'
            y = qs[q][0]['y_mm']; x = qs[q][0]['x_mm'] - 12
            nums += f'<div class="num-abs" style="left:{x}mm;top:{y-3.5}mm;">{q:02d}</div>'
        html = f"""<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cartão - {nome_aluno}</title><style>
*{{margin:0;padding:0;box-sizing:border-box;}}@page{{size:A4 portrait;margin:0;}}body{{font-family:Arial,sans-serif;}}.folha{{width:210mm;height:297mm;background:#fff;position:relative;}}.fiducial{{position:absolute;width:10mm;height:10mm;background:#000;border:5mm solid #000;box-sizing:border-box;}}.fiducial-tl{{left:15mm;top:15mm;}}.fiducial-tr{{right:15mm;top:15mm;}}.fiducial-bl{{left:15mm;bottom:15mm;}}.fiducial-br{{right:15mm;bottom:15mm;}}.bolha-abs{{position:absolute;width:7mm;height:7mm;border:1.5px solid #666;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:9pt;font-weight:900;}}.num-abs{{position:absolute;font-size:9pt;font-weight:900;width:10mm;}}.btn-print{{position:absolute;bottom:5mm;left:50%;transform:translateX(-50%);padding:3mm 10mm;background:#000;color:#fff;border:none;}}
</style></head><body><div class="folha"><div class="fiducial fiducial-tl"></div><div class="fiducial fiducial-tr"></div><div class="fiducial fiducial-bl"></div><div class="fiducial fiducial-br"></div>{bolhas}{nums}<button class="btn-print" onclick="window.print()">🖨️ IMPRIMIR</button></div></body></html>"""
        return html, 200, {'Content-Type': 'text/html'}
    except Exception as e:
        logging.error(f"❌ Erro cartão: {e}"); traceback.print_exc()
        return None, 500, {'Content-Type': 'application/json'}
    finally:
        if conn:
            try: conn.close()
            except: pass