# -NotaCerta-AI

# 🤖 NotaCerta AI

Sistema de correção de provas com Inteligência Artificial (OMR + OpenAI) para escolas do Ensino Fundamental.

Corrige cartões-resposta por foto, avalia redações com IA, gera relatórios por turma e gerencia todo o ciclo de avaliação — de cadastros a resultados.

---

## 📋 Índice

- [Visão Geral](#-visão-geral)
- [Funcionalidades](#-funcionalidades)
- [Tecnologias](#-tecnologias)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Como Rodar Localmente](#-como-rodar-localmente)
- [Variáveis de Ambiente](#-variáveis-de-ambiente)
- [Deploy no Render](#-deploy-no-render)
- [API — Endpoints Principais](#-api--endpoints-principais)
- [Testes](#-testes)
- [Arquitetura](#-arquitetura)

---

## 🎯 Visão Geral

O **NotaCerta AI** é uma aplicação web full-stack que automatiza a correção de provas em escolas:

1. **Cadastro** — escolas, turmas, alunos, provas e gabaritos
2. **Geração** — cartões-resposta personalizados com QR Code
3. **Correção** — por IA (OpenAI Vision) ou OMR (OpenCV + marcadores fiduciais)
4. **Resultados** — notas, conceitos, relatórios por turma e por questão

---

## ✨ Funcionalidades

### 📚 Cadastros
- **Escolas** — nome, INEP, município, diretor, contato
- **Turmas** — série (1º ao 9º), turno, professor, capacidade
- **Alunos** — matrícula, número de chamada, cadastro múltiplo (colar lista)
- **Disciplinas** — globais e por escola, com ícone, cor e ordem
- **Usuários** — admin (vê tudo) ou usuário (só a própria escola)

### 📝 Avaliações
- **Provas** — título, série, disciplina, bimestre, valor, quantidade de questões
- **Gabaritos** — 3 ou 4 alternativas, códigos BNCC opcionais
- **Gabarito de Produção de Texto** — múltiplas alternativas por questão
- **QR Code único** por cartão (identifica aluno + prova + escola + turma)

### 🤖 Correção
- **Correção IA (OpenAI Vision)** — leitura automática do cartão
- **Correção por OMR (OpenCV)** — marcadores fiduciais + perspectiva + template
- **Correção Automática por QR** — só tirar foto, IA identifica tudo
- **Correção Manual** — marcar respostas com selects
- **Nota Manual** — para Produção de Texto
- **Avaliação de Redação** — coerência, coesão, gramática, vocabulário
- **OCR de Redação** — extrai texto da foto

### 📊 Relatórios
- **Dashboard** — totais e últimas correções
- **Relatório por Turma** — distribuição por disciplina, posição, conceito
- **Acertos por Questão** — gráfico de aproveitamento por questão
- **Impressão** — cartões e relatórios formatados para A4

---

## 🛠 Tecnologias

### Backend
- **Python 3.11+**
- **Flask** — framework web
- **Flask-CORS** — comunicação com frontend
- **Flask-Compress** — gzip de respostas
- **PostgreSQL (Supabase)** — banco relacional
- **psycopg2** — driver + connection pool
- **OpenAI SDK** — GPT-4o / GPT-4o-mini
- **OpenCV** — processamento de imagem (OMR)
- **NumPy / Pillow** — manipulação de imagens
- **qrcode** — geração de QR Code

### Frontend
- **HTML5 + CSS3 + JavaScript** (vanilla)
- **Módulos JS** separados por domínio
- **Sem framework** — leve, rápido, zero build

### DevOps
- **Render** — hospedagem backend + frontend
- **Supabase** — PostgreSQL gerenciado
- **GitHub** — versionamento

---

## 📁 Estrutura do Projeto
