import base64
import logging
import os

import cv2
import numpy as np

PYZBAR_AVAILABLE = False


def gerar_qrcode_base64(dados):
    try:
        import qrcode
        from io import BytesIO
        qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=10, border=2)
        qr.add_data(dados); qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buffer = BytesIO(); img.save(buffer, format="PNG"); buffer.seek(0)
        return base64.b64encode(buffer.getvalue()).decode('utf-8')
    except Exception as e:
        logging.error(f"❌ QR: {e}"); return ""


def carregar_logo_base64(nome_arquivo):
    try:
        if not nome_arquivo or not os.path.isfile(nome_arquivo): return ''
        with open(nome_arquivo, 'rb') as f: dados = f.read()
        b64 = base64.b64encode(dados).decode('utf-8')
        ext = nome_arquivo.lower().rsplit('.',1)[-1]
        mime = {'png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg',
                'gif':'image/gif','svg':'image/svg+xml','webp':'image/webp'}.get(ext, 'image/png')
        return f"data:{mime};base64,{b64}"
    except Exception as e:
        logging.error(f"❌ Logo: {e}"); return ''


def extrair_dados_qrcode(imagem_base64):
    try:
        if ',' in imagem_base64 and imagem_base64.strip().startswith('data:'):
            imagem_base64 = imagem_base64.split(',', 1)[1]
        imagem_base64 = imagem_base64.strip().replace('\n', '').replace('\r', '').replace(' ', '')
        image_data = base64.b64decode(imagem_base64, validate=False)
        np_arr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None: return None
        dados_str = None
        if PYZBAR_AVAILABLE:
            try:
                from pyzbar.pyzbar import decode as _decode
                codigos = _decode(img)
                if not codigos:
                    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
                    codigos = _decode(clahe.apply(gray))
                for c in codigos:
                    d = c.data.decode('utf-8', errors='replace')
                    if d.startswith('ALUNO:'):
                        dados_str = d; break
            except Exception: pass
        if not dados_str:
            try:
                detector = cv2.QRCodeDetector()
                for tent in (img, cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)):
                    try:
                        d, _, _ = detector.detectAndDecode(tent)
                        if d and d.startswith('ALUNO:'):
                            dados_str = d; break
                    except Exception: continue
            except Exception: pass
        if not dados_str:
            logging.warning("⚠️ QR: nenhum código encontrado")
            return None
        r = {}
        for parte in dados_str.split('|'):
            if ':' in parte:
                k, v = parte.split(':', 1)
                k = k.strip().upper(); v = v.strip()
                if v.isdigit():
                    if k == 'ALUNO':    r['aluno_id'] = int(v)
                    elif k == 'PROVA':  r['prova_id'] = int(v)
                    elif k == 'ESCOLA': r['escola_id'] = int(v)
                    elif k == 'TURMA':  r['turma_id'] = int(v)
        if 'aluno_id' in r and 'prova_id' in r:
            logging.info(f"✅ QR lido: {r}")
            return r
        return None
    except Exception as e:
        logging.error(f"❌ Erro ao ler QR: {e}")
        return None