# NavManager - Sistema de Controle de Acesso de Visitantes

Este é um sistema moderno, rápido e seguro para o controle de acesso de visitas externas a edifícios corporativos. Desenvolvido sob o padrão visual **NAVMANAGER** (Swiss Design: alta legibilidade, contraste nítido, cantos retos/técnicos e layout corporativo), o sistema foi projetado especificamente para ser hospedado de forma estática no **GitHub Pages** de maneira totalmente gratuita.

---

## ⚓ Recursos e Funcionalidades

1. **Formulário de Cadastro Completo (9 Campos):**
   - **Nome Completo** (Obrigatório)
   - **Tipo de Documento** (Obrigatório - e.g., CPF, RG, CNH, Passaporte)
   - **Número do Documento** (Obrigatório)
   - **Pessoa ou Setor a ser Visitado** (Obrigatório)
   - **Finalidade da Visita** (Obrigatório)
   - **Data e Hora de Entrada** (Obrigatório - com botão de definir hora atual "Agora")
   - **Data e Hora de Saída** (Opcional - com botão de "Agora")
   - **Área Restrita** (Toggle/Checkbox - quando marcado, exibe o campo obrigatório de **Autorizador**)
   - **Observações** (Opcional)

2. **Auto-preenchimento e Reconhecimento Inteligente:**
   - Ao digitar o Nome ou o Número do Documento de um visitante que já esteve no prédio, o sistema exibe sugestões de visitas anteriores.
   - Ao selecionar a sugestão, o formulário é pré-preenchido com todos os dados históricos daquele visitante (Nome, Tipo de Doc, Número de Doc, Setor Visitado Comum, Finalidade Comum, Autorizador se área restrita e Observações), **mantendo vazios apenas os campos de Data e Hora de Entrada e Saída** para o preenchimento do novo acesso, conforme solicitado.

3. **Banco de Dados Local (IndexedDB):**
   - Toda a persistência de dados é feita diretamente no navegador através do IndexedDB. Permite salvar milhares de registros localmente sem perdas e sem custos com servidores.

4. **Ferramenta de Exportação e Importação de Backups:**
   - **Exportar JSON:** Cria um arquivo de backup legível por máquina para guardar com segurança ou transferir para outros computadores.
   - **Exportar CSV:** Gera uma planilha formatada compatível com o Microsoft Excel (separada por ponto e vírgula e com cabeçalho em português), facilitando a extração de relatórios.
   - **Importar JSON:** Restaura a base completa a partir de um backup em segundos.

5. **Interface de Portaria Moderna:**
   - Filtros rápidos por status de visita ("Todos", "Em Andamento", "Finalizados").
   - Busca em tempo real por nome, documento, setor ou observação.
   - **Registrar Saída Rápida (Quick Checkout):** Botão na tabela para finalizar a visita registrando a data e hora do momento em apenas um clique.
   - Modais nativos para edição e exclusão de registros sem comprometer a identidade visual.

---

## 💻 Tecnologias Utilizadas

- **Estrutura:** HTML5 Semântico
- **Estilo:** CSS3 Vanilla (Design Suíço Minimalista, tipografia *Inter* via Google Fonts e ícones *FontAwesome* via CDN)
- **Comportamento:** Javascript Vanilla (sem bibliotecas pesadas adicionais)
- **Persistência:** IndexedDB nativo de navegadores modernos

---

## 🚀 Como Executar Localmente

Como o sistema é construído 100% no lado do cliente (Front-end), a execução é extremamente simples:

### Opção 1: Abertura Direta
Basta dar dois cliques no arquivo [index.html](file:///c:/Users/WilksonAlbuquerqueCa/NAV%20Brasil/PORTAL%20DNIZ%20-%20PORTAL%20DNIZ/SISTEMAS%20DNIZ/ANTIGRAVITY/CONTROLE_ACESSO/index.html) no gerenciador de arquivos e ele rodará no seu navegador padrão.

### Opção 2: Servidor Local Simples (Recomendado)
Se você estiver utilizando o VS Code, pode abrir o projeto e iniciar a extensão **Live Server**.
Alternativamente, no terminal de comando do seu sistema na pasta do projeto, você pode rodar:
```bash
# Se tiver Python instalado
python -m http.server 8000
```
Depois, acesse no navegador: `http://localhost:8000`

---

---

## ☁️ 1. Configuração do Banco de Dados no Supabase (Nuvem)

Siga este passo a passo para criar e preparar seu banco de dados centralizado permanente:

1. **Crie sua conta:**
   - Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita.
2. **Crie um novo projeto:**
   - Clique em **New Project**.
   - Defina um nome (ex: `controle-portaria-predio`).
   - Defina uma senha forte para o banco de dados.
   - Selecione a região física de servidor mais próxima (ex: *Sao Paulo - sa-east-1*).
   - Aguarde cerca de 2 minutos para o provisionamento do banco.
3. **Crie as tabelas (SQL Editor):**
   - No menu lateral esquerdo do Supabase, clique em **SQL Editor** (ícone de terminal `>_`).
   - Clique em **New Query**.
   - Cole o seguinte script SQL de criação das tabelas e clique em **Run** (botão verde no canto inferior direito):
     ```sql
     -- Tabela de Usuários (Operadores e Admins)
     CREATE TABLE IF NOT EXISTS users (
         username TEXT PRIMARY KEY,
         full_name TEXT NOT NULL,
         role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
         password_hash TEXT NOT NULL,
         created_at TIMESTAMPTZ DEFAULT NOW()
     );

     -- Tabela de Visitas (Logs de Acesso da Portaria)
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
     ```
4. **Obtenha suas chaves de acesso:**
   - No menu do rodapé esquerdo, clique em **Project Settings** (ícone de engrenagem).
   - Clique na opção **API**.
   - Copie os valores dos campos:
     - **Project API URL** (ex: `https://xxxxxx.supabase.co`)
     - **`anon` `public` API Key** (chave longa de acesso público)

---

## 🔑 2. Configurando o Projeto Localmente

1. Na pasta do seu projeto no computador, localize o arquivo **[config.js](file:///c:/Users/WilksonAlbuquerqueCa/NAV%20Brasil/PORTAL%20DNIZ%20-%20PORTAL%20DNIZ/SISTEMAS%20DNIZ/ANTIGRAVITY/CONTROLE_ACESSO/config.js)** (que foi criado na raiz).
2. Cole as suas chaves nos campos correspondentes:
   ```javascript
   const SUPABASE_URL = "SUA_URL_DO_SUPABASE_AQUI";
   const SUPABASE_ANON_KEY = "SUA_CHAVE_PUBLICA_ANONIMA_DO_SUPABASE_AQUI";
   ```
3. Atualize o navegador local (`localhost:8000`) e a tela de login já estará ativa! Faça o primeiro acesso com o usuário `admin` e a senha `admin123`.

---

## ☁️ 3. Como Hospedar com Segurança no GitHub Pages

Como este sistema armazena informações de portaria e logins de funcionários (que constituem evidências de auditoria), **é altamente recomendado que o seu repositório no GitHub seja configurado como PRIVADO**.

1. **Crie um repositório PRIVADO no GitHub:**
   - Acesse seu perfil do GitHub e clique em **New Repository**.
   - Defina o nome (ex: `controle-acesso`).
   - Marque a opção **Private** (Privado) e clique em **Create Repository**.
2. **Suba os arquivos para o repositório:**
   - Como o repositório é privado, você pode comitar o arquivo `config.js` com segurança para que o GitHub Pages consiga carregar a conexão com o banco!
   - Execute no terminal local da pasta:
     ```bash
     git init
     # Para podermos subir o config.js em repositório privado, adicione os arquivos manualmente:
     git add index.html style.css app.js config.js config.example.js .gitignore README.md
     git commit -m "Deployment: NavManager Controle Acesso com Supabase"
     git branch -M main
     git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
     git push -u origin main
     ```
3. **Ative o GitHub Pages:**
   - No painel do seu repositório no GitHub, clique na aba **Settings** (Configurações) no menu superior.
   - No menu lateral esquerdo, clique em **Pages**.
   - Sob "Build and deployment", na opção **Source**, selecione **Deploy from a branch**.
   - Em **Branch**, selecione a branch `main` e defina a pasta como `/ (root)`.
   - Clique em **Save**.
4. **Acesse o Sistema Online:**
   Aguarde cerca de 1 minuto. O GitHub Pages fornecerá a URL pública no topo da tela (ex: `https://seu-usuario.github.io/controle-acesso/`). O sistema já estará online e gravando os logs de forma centralizada!

---

## ⚠️ Recomendações de Auditoria e Backup

> [!IMPORTANT]
> 1. **Logs de Auditoria Seguros:** Como os logs residem no banco de dados central do Supabase, eles estão protegidos contra limpeza de cache do navegador local.
> 2. **Senhas Criptografadas:** As senhas dos usuários utilizam algoritmo de hash SHA-256 local, garantindo que mesmo se alguém invadir o painel do Supabase, não poderá ler as senhas originais dos operadores.
> 3. **Exportação Extra:** Para maior redundância de auditoria, faça downloads periódicos da planilha em formato **CSV** no fim de cada ciclo administrativo através da aba "Relatórios & Dados".
