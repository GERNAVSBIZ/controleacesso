# ⚓ NavManager - Sistema de Controle de Acesso de Visitantes

Este documento serve como o **manual completo de referência e arquitetura** do sistema de Controle de Acesso de Visitantes. Aqui estão registrados todos os detalhes técnicos, locais de hospedagem, banco de dados, credenciais de acesso, scripts de manutenção e procedimentos para consulta e manutenção futura.

---

## 📌 1. Visão Geral do Sistema

O **NavManager Controle de Acesso** é uma aplicação web SPA (Single Page Application) desenvolvida sob o padrão visual corporativo escuro (**Swiss Design / Glassmorphism**). Ele foi projetado para registrar o fluxo de entrada e saída de visitantes externos com auditabilidade total, centralizando os registros em um banco de dados relacional permanente na nuvem.

### 🔗 Links Oficiais do Projeto:
- **URL de Acesso Online (GitHub Pages):** [https://gernavsbiz.github.io/controleacesso/](https://gernavsbiz.github.io/controleacesso/)
- **Repositório de Código Fonte (GitHub):** [https://github.com/GERNAVSBIZ/controleacesso](https://github.com/GERNAVSBIZ/controleacesso)
- **Servidor Local de Testes:** `http://localhost:8000`

---

## 🗄️ 2. Arquitetura do Banco de Dados (Supabase PostgreSQL)

Os dados não dependem do navegador do operador e não são apagados ao limpar o histórico de navegação. Eles ficam salvos em um banco de dados **PostgreSQL** profissional hospedado na nuvem do **Supabase**.

### ⚙️ Credenciais e Endereço do Servidor:
- **Plataforma:** [Supabase Cloud](https://supabase.com)
- **URL do Projeto:** `https://zyxvjgpjghkkpsdxwxlk.supabase.co`
- **Arquivo de Chaves Local:** `config.js` (localizado na raiz do projeto)

```javascript
// Conteúdo do arquivo config.js
const SUPABASE_URL = "https://zyxvjgpjghkkpsdxwxlk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_x72E8KkmmzoqsLRSLCav1w_SJhHei-8";
```

---

## 📜 3. Esquema das Tabelas e Scripts SQL

### 3.1. Tabelas do Banco de Dados

1. **`users`** (Controle de Operadores e Administradores):
   - `username` (TEXT - Chave Primária): Nome de login do operador (em minúsculas).
   - `full_name` (TEXT): Nome completo do usuário.
   - `role` (TEXT): Perfil de acesso (`admin` ou `operator`).
   - `password_hash` (TEXT): Hash criptográfico SHA-256 da senha.
   - `created_at` (TIMESTAMPTZ): Data e hora de criação do cadastro.

2. **`visits`** (Logs de Auditoria de Acesso de Visitantes):
   - `id` (BIGINT - Identity Autoincremental): Identificador único do registro.
   - `full_name` (TEXT): Nome completo do visitante.
   - `doc_type` (TEXT): Tipo de documento (CPF, RG, CNH, PASSAPORTE, OUTRO).
   - `doc_number` (TEXT): Número do documento fornecido.
   - `visited_person_or_sector` (TEXT): Pessoa ou Setor visitado (Ex: GERÊNCIA).
   - `purpose` (TEXT): Finalidade da visita.
   - `entry_date_time` (TIMESTAMPTZ): Data e hora de entrada.
   - `exit_date_time` (TIMESTAMPTZ - Nulo se em andamento): Data e hora de saída.
   - `is_restricted` (BOOLEAN): Indicador de acesso a área restrita.
   - `authorizer` (TEXT - Opcional): Nome do responsável que autorizou a entrada em área restrita.
   - `observations` (TEXT - Opcional): Notas adicionais sobre o acesso.
   - `created_at` (TIMESTAMPTZ): Data de registro no sistema.

### 3.2. Script SQL Completo de Criação das Tabelas e Permissões

Para criar ou reconstruir o banco de dados no **SQL Editor** do Supabase, execute o código abaixo:

```sql
-- 1. Tabela de Usuários
CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Visitas
CREATE TABLE IF NOT EXISTS visits (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name TEXT NOT NULL,
    doc_type TEXT NOT NULL,
    doc_number TEXT NOT NULL,
    visited_person_or_sector TEXT NOT NULL,
    purpose TEXT NOT NULL,
    entry_date_time TIMESTAMPTZ NOT NULL,
    exit_date_time TIMESTAMPTZ,
    is_restricted BOOLEAN NOT NULL DEFAULT FALSE,
    authorizer TEXT,
    observations TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Liberação de Permissões de Acesso (Desabilita RLS e concede privilégios ao aplicativo)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE visits DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE users TO anon;
GRANT ALL ON TABLE visits TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
```

---

## 🔐 4. Autenticação, Perfis e Reset de Senha

### 4.1. Perfis de Acesso
- **Administrador (`admin`):** Tem acesso total ao sistema, incluindo o menu **"Gerenciar Usuários"** (para criar/editar/excluir operadores) e a aba **"Relatórios & Dados"** (para exportar planilhas CSV e backups JSON).
- **Operador (`operator`):** Tem acesso apenas ao registro de novas entradas, pesquisa de visitantes e marcação de saída rápida. Não visualiza guias de gestão nem pode excluir registros de visitas.

### 4.2. Credencial Padrão Inicial
- **Usuário:** `admin`
- **Senha Inicial:** `admin123`

### 🔑 4.3. Como Resetar a Senha de Admin (Se esquecer o Login/Senha)
Caso a senha seja perdida e você precise zerar a senha do `admin` para a senha padrão `admin123`:

1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard) e entre na sua conta.
2. Abra o menu **SQL Editor** (`>_`) e execute a seguinte query SQL:

```sql
-- Reseta a senha do usuário 'admin' para 'admin123'
UPDATE users 
SET password_hash = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9' 
WHERE username = 'admin';

-- Caso o usuário tenha sido deletado, recria a conta com a senha padrão 'admin123'
INSERT INTO users (username, full_name, role, password_hash)
VALUES ('admin', 'ADMINISTRADOR PADRÃO', 'admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9')
ON CONFLICT (username) DO UPDATE 
SET password_hash = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
```

---

## 📂 5. Estrutura de Arquivos da Aplicação

```
CONTROLE_ACESSO/
├── index.html           # Interface SPA completa (HTML5)
├── style.css            # Estilização visual (Swiss Design / NavManager Dark)
├── app.js               # Lógica em JavaScript Vanilla e integração Supabase
├── config.js            # Credenciais ativas do banco de dados (URL e Anon Key)
├── config.example.js    # Modelo de exemplo do arquivo de configuração
├── .gitignore           # Regras de exclusão do Git
└── README.md            # Este manual de referência do sistema
```

---

## 🛠️ 6. Histórico de Melhorias e Ajustes Realizados

1. **Alinhamento e Normalização Visual:**
   - Padronização de altura de todos os campos para `48px`.
   - Ajuste fino do alinhamento vertical dos títulos de cada campo (`min-height: 28px; display: flex; align-items: flex-end;`).
   - Correção do contraste das listas suspensas (drop-downs) no Windows Chromium com fundo escuro `#121a2f`.
   - Inclusão do texto de exemplo no campo de destino: **`EX: GERÊNCIA`**.

2. **Segurança e Criptografia:**
   - Criptografia de senhas usando **SHA-256**.
   - Implementado fallback puro em JS para permitir hash de senhas em redes de intranet ou domínios HTTP não-seguros (onde o `crypto.subtle` nativo do navegador fica desativado por regra de segurança do browser).

3. **Correção de Persistência no PostgreSQL:**
   - Solucionado o erro HTTP 400 em Saídas Rápida e Edição: O payload enviava a propriedade `id` em atualizações (`UPDATE`). Como a coluna `id` do PostgreSQL é do tipo `GENERATED ALWAYS AS IDENTITY`, ela não pode ser alterada. O código do `app.js` foi ajustado para remover o campo `id` da lista de alterações e utilizá-lo somente no filtro `.eq('id', visitId)`.

---

## 🚨 7. Solução de Problemas Frequentes

### 1. "O site não carrega ou o login diz falha de comunicação"
- **Causa:** No plano gratuito do Supabase, o banco entra em modo de pausa se ficar 7 dias consecutivos sem nenhum acesso.
- **Solução:** Acesse o painel em [supabase.com/dashboard](https://supabase.com/dashboard) e clique em **Restore Project**. O banco voltará a responder em 1 minuto.

### 2. "Como enviar novas alterações para o GitHub?"
No terminal da pasta do projeto, execute:
```bash
git add .
git commit -m "Descricao das alteracoes feitas"
git push origin main
```
O GitHub Pages atualizará o site online automaticamente em cerca de 30 segundos.
