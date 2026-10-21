# ============================================================
# INIT_DB — cria/atualiza schema. Idempotente.
# Roda UMA vez ao iniciar (via run.py).
# ============================================================

import traceback

from backend.db import get_db_connection


_DB_INITIALIZED = False


def init_db():
    global _DB_INITIALIZED
    if _DB_INITIALIZED: return
    _DB_INITIALIZED = True
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            print("⚠️ Banco indisponível"); return
        cur = conn.cursor()
        cur.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='escolas')")
        existe = cur.fetchone()[0]
        if not existe:
            print("🔧 Criando tabelas...")
            cur.execute("""CREATE TABLE escolas (id SERIAL PRIMARY KEY, nome TEXT NOT NULL,
                inep TEXT, municipio TEXT, estado TEXT DEFAULT 'PA', telefone TEXT,
                diretor TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
            cur.execute("""CREATE TABLE turmas (id SERIAL PRIMARY KEY,
                escola_id INTEGER REFERENCES escolas(id) ON DELETE CASCADE,
                nome TEXT NOT NULL, serie TEXT, turno TEXT DEFAULT 'Manhã',
                professor TEXT, capacidade INTEGER DEFAULT 35, ano_letivo INTEGER DEFAULT 2025,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
            cur.execute("""CREATE TABLE alunos (id SERIAL PRIMARY KEY,
                escola_id INTEGER REFERENCES escolas(id) ON DELETE CASCADE,
                turma_id INTEGER REFERENCES turmas(id) ON DELETE CASCADE,
                nome TEXT NOT NULL, matricula TEXT, numero_chamada INTEGER,
                data_nascimento DATE, genero TEXT, responsavel TEXT,
                telefone TEXT, email TEXT, observacoes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
            cur.execute("""CREATE TABLE provas (id SERIAL PRIMARY KEY,
                escola_id INTEGER REFERENCES escolas(id) ON DELETE SET NULL,
                titulo TEXT NOT NULL, serie TEXT NOT NULL, disciplina TEXT,
                bimestre TEXT, data_prova DATE, valor_nota DECIMAL(5,2) DEFAULT 10,
                tipo_questoes TEXT DEFAULT '4', quantidade_questoes INTEGER DEFAULT 20,
                gabarito TEXT[], bncc TEXT[], textos_questoes TEXT[], niveis TEXT[],
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
            cur.execute("""CREATE TABLE historico (id SERIAL PRIMARY KEY,
                prova_id INTEGER REFERENCES provas(id) ON DELETE CASCADE,
                aluno_id INTEGER REFERENCES alunos(id) ON DELETE CASCADE,
                respostas TEXT[], acertos INTEGER, nota DECIMAL(5,2), total INTEGER,
                tipo_correcao TEXT DEFAULT 'ia', disciplina TEXT, tipo_avaliacao TEXT,
                questoes_status JSONB DEFAULT '[]', confianca DECIMAL(5,2),
                confianca_por_questao JSONB DEFAULT '[]', bncc TEXT[],
                data_correcao TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
            cur.execute("""CREATE TABLE usuarios (id SERIAL PRIMARY KEY,
                escola_id INTEGER REFERENCES escolas(id) ON DELETE SET NULL,
                nome TEXT, username TEXT UNIQUE NOT NULL, senha_hash TEXT NOT NULL,
                email TEXT, perfil TEXT DEFAULT 'usuario', ativo BOOLEAN DEFAULT TRUE,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
            cur.execute("""CREATE TABLE correcoes_texto (id SERIAL PRIMARY KEY,
                aluno_id INTEGER REFERENCES alunos(id) ON DELETE CASCADE,
                prova_id INTEGER REFERENCES provas(id) ON DELETE SET NULL,
                texto TEXT NOT NULL, nota DECIMAL(5,2),
                metrica_coerencia DECIMAL(5,2), metrica_estrutura DECIMAL(5,2),
                metrica_gramatica DECIMAL(5,2), metrica_vocabulario DECIMAL(5,2),
                feedback TEXT, tipo_correcao TEXT DEFAULT 'ia',
                data_correcao TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
            print("✅ Tabelas criadas!")
        else:
            def _has_col(table, col):
                cur.execute("""SELECT column_name FROM information_schema.columns
                    WHERE table_name=%s AND column_name=%s""", (table, col))
                return cur.fetchone() is not None
            for t, c, sql in [
                ('provas', 'escola_id', "ALTER TABLE provas ADD COLUMN escola_id INTEGER REFERENCES escolas(id) ON DELETE SET NULL"),
                ('usuarios', 'escola_id', "ALTER TABLE usuarios ADD COLUMN escola_id INTEGER REFERENCES escolas(id) ON DELETE SET NULL"),
                ('provas', 'bncc', "ALTER TABLE provas ADD COLUMN bncc TEXT[]"),
                ('provas', 'textos_questoes', "ALTER TABLE provas ADD COLUMN textos_questoes TEXT[]"),
                ('provas', 'niveis', "ALTER TABLE provas ADD COLUMN niveis TEXT[]"),
                ('historico', 'questoes_status', "ALTER TABLE historico ADD COLUMN questoes_status JSONB DEFAULT '[]'"),
                ('historico', 'confianca', "ALTER TABLE historico ADD COLUMN confianca DECIMAL(5,2)"),
                ('historico', 'confianca_por_questao', "ALTER TABLE historico ADD COLUMN confianca_por_questao JSONB DEFAULT '[]'"),
                ('historico', 'bncc', "ALTER TABLE historico ADD COLUMN bncc TEXT[]"),
            ]:
                if not _has_col(t, c):
                    try: cur.execute(sql)
                    except: pass

        # ── Disciplinas (blindado) ──
        cur.execute("""CREATE TABLE IF NOT EXISTS disciplinas (
            id SERIAL PRIMARY KEY,
            escola_id INTEGER REFERENCES escolas(id) ON DELETE CASCADE,
            codigo TEXT NOT NULL, nome TEXT NOT NULL,
            cor TEXT DEFAULT '#3b82f6', icone TEXT DEFAULT '📚',
            ordem INTEGER DEFAULT 0, ativo BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(escola_id, codigo))""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_disciplinas_escola ON disciplinas(escola_id, ordem)")
        cur.execute("""DELETE FROM disciplinas
            WHERE id NOT IN (SELECT MIN(id) FROM disciplinas GROUP BY escola_id, codigo)""")
        for _cod, _nome, _cor, _ico, _ord in [
            ('PORT', 'Português',         '#ef4444', '📖', 1),
            ('MAT',  'Matemática',        '#3b82f6', '🔢', 2),
            ('PROD', 'Produção de Texto', '#8b5cf6', '✍️', 3),
            ('CH',   'Ciências Humanas',  '#f59e0b', '🌍', 4),
            ('CN',   'Ciências Naturais', '#10b981', '🔬', 5),
        ]:
            cur.execute("SELECT 1 FROM disciplinas WHERE escola_id IS NULL AND codigo = %s", (_cod,))
            if cur.fetchone() is None:
                cur.execute("""INSERT INTO disciplinas (escola_id, codigo, nome, cor, icone, ordem)
                    VALUES (NULL, %s, %s, %s, %s, %s)""", (_cod, _nome, _cor, _ico, _ord))

        cur.execute("""CREATE TABLE IF NOT EXISTS cartoes_template (
            id SERIAL PRIMARY KEY, prova_id INTEGER REFERENCES provas(id) ON DELETE CASCADE,
            aluno_id INTEGER REFERENCES alunos(id) ON DELETE CASCADE,
            tipo_questoes INTEGER NOT NULL, quantidade_questoes INTEGER NOT NULL,
            num_colunas INTEGER NOT NULL, mapa_template JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(prova_id, aluno_id))""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_cartoes_template_prova_aluno ON cartoes_template(prova_id, aluno_id)")

        from backend.config import USUARIOS_FIXOS
        for username, d in USUARIOS_FIXOS.items():
            cur.execute("SELECT * FROM usuarios WHERE username = %s", (username,))
            if not cur.fetchone():
                cur.execute("""INSERT INTO usuarios (nome, username, senha_hash, perfil, ativo)
                    VALUES (%s,%s,%s,%s,TRUE)""", (d['nome'], username, d['senha'], d['perfil']))
                print(f"✅ Usuário {username}")

        indices = [
            "CREATE INDEX IF NOT EXISTS idx_alunos_escola_id ON alunos(escola_id)",
            "CREATE INDEX IF NOT EXISTS idx_alunos_turma_id ON alunos(turma_id)",
            "CREATE INDEX IF NOT EXISTS idx_turmas_escola_id ON turmas(escola_id)",
            "CREATE INDEX IF NOT EXISTS idx_historico_aluno_id ON historico(aluno_id)",
            "CREATE INDEX IF NOT EXISTS idx_historico_prova_id ON historico(prova_id)",
            "CREATE INDEX IF NOT EXISTS idx_historico_data_correcao ON historico(data_correcao DESC)",
            "CREATE INDEX IF NOT EXISTS idx_historico_aluno_data ON historico(aluno_id, data_correcao DESC)",
            "CREATE INDEX IF NOT EXISTS idx_correcoes_texto_data ON correcoes_texto(data_correcao DESC)",
            "CREATE INDEX IF NOT EXISTS idx_provas_created_at ON provas(created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_provas_escola_id ON provas(escola_id)",
            "CREATE INDEX IF NOT EXISTS idx_usuarios_username ON usuarios(username)",
            "CREATE INDEX IF NOT EXISTS idx_usuarios_escola_id ON usuarios(escola_id)",
        ]
        for sql in indices:
            try: cur.execute(sql)
            except: pass
        conn.commit(); cur.close()
        print("✅ Banco inicializado!")
    except Exception as e:
        print(f"❌ init_db: {e}")
        traceback.print_exc()
    finally:
        if conn:
            try: conn.close()
            except: pass