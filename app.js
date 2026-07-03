/* ==========================================================================
   APP.JS - LÓGICA E COMPORTAMENTO COM CONEXÃO CENTRALIZADA AO SUPABASE (POSTGRESQL)
   ========================================================================== */

// --- ESTADO GLOBAL DA APLICAÇÃO ---
let supabaseClient = null; // Cliente Supabase global (evita conflito de nome com a biblioteca CDN)
let currentUser = null; // Usuário autenticado ativo
let allVisits = [];
let filteredVisits = [];
let allUsers = []; // Lista de todos os usuários (apenas para Admin)
let currentFilter = "todos"; // "todos" | "ativo" | "concluido"
let searchQuery = "";
let currentPage = 1;
const itemsPerPage = 10;

let editVisitId = null;
let deleteVisitId = null;
let editingUsername = null; // nulo se criando, string se editando usuário
let deleteUsernameVal = null; // username do usuário sendo deletado

// --- INICIALIZAÇÃO E EVENTOS ---
document.addEventListener("DOMContentLoaded", () => {
    initClock();
    
    try {
        // Inicializa o cliente do Supabase
        initSupabase();
        updateDbStatus(true, "Nuvem OK");
        console.log("Supabase inicializado com sucesso.");
        
        // Garante a inserção do administrador padrão e carrega sessão
        ensureDefaultAdmin()
            .then(() => {
                console.log("Verificação de usuário administrador padrão concluída.");
                checkActiveSession();
            })
            .catch(err => {
                console.error("Falha ao garantir administrador padrão:", err);
                updateDbStatus(false, "Erro Admin");
                showToast("Erro ao conectar com o banco de dados do servidor.", "error");
            });
    } catch (err) {
        console.error("Configuração de chaves do Supabase ausente:", err);
        updateDbStatus(false, "Aguardando config.js");
        
        // Exibe um card informativo amigável no lugar da tela de login se a configuração estiver em branco
        document.getElementById("login-screen").innerHTML = `
            <div class="card login-card" style="max-width: 500px; text-align: center; padding: 40px 30px;">
                <div class="login-logo-container">
                    <div class="login-logo" style="background-color: var(--accent); box-shadow: 0 4px 15px rgba(239, 91, 37, 0.4);">⚠️</div>
                    <h2 class="login-title" style="margin-top: 10px;">Banco de Dados Pendente</h2>
                    <span class="login-subtitle" style="color: var(--accent);">Configuração de Servidor Necessária</span>
                </div>
                <div style="margin-top: 20px; font-size: 13px; color: var(--text-dark-muted); line-height: 1.6; text-align: left; border-top: 1px solid var(--border-dark); padding-top: 20px;">
                    <p>Para o sistema funcionar com o banco de dados centralizado em nuvem, configure o arquivo local <strong>config.js</strong>:</p>
                    <ol style="margin-left: 20px; margin-top: 12px; list-style-type: decimal; display: flex; flex-direction: column; gap: 8px;">
                        <li>Acesse o painel em <a href="https://supabase.com" target="_blank" style="color: var(--accent); text-decoration: underline; font-weight: 600;">supabase.com</a> e crie um projeto gratuito.</li>
                        <li>Abra o **SQL Editor** do projeto, cole o código SQL contido no arquivo <strong>implementation_plan.md</strong> e clique em <strong>Run</strong>.</li>
                        <li>Vá em **Project Settings** -> **API** e copie os campos URL e anon key.</li>
                        <li>Abra o arquivo <strong>config.js</strong> na pasta do projeto e insira as chaves entre as aspas.</li>
                        <li>Atualize esta página (F5) para acessar o painel de portaria.</li>
                    </ol>
                </div>
            </div>
        `;
    }

    // Registrar transformação automática para maiúsculas e minúsculas
    document.querySelectorAll(".text-uppercase").forEach(input => {
        input.addEventListener("blur", (e) => {
            e.target.value = e.target.value.toUpperCase().trim();
        });
    });

    document.querySelectorAll(".text-lowercase").forEach(input => {
        input.addEventListener("blur", (e) => {
            e.target.value = e.target.value.toLowerCase().trim();
        });
    });

    // Fechar autocomplete ao clicar fora
    document.addEventListener("click", (e) => {
        if (!e.target.closest("#visitor-name") && !e.target.closest("#name-autocomplete-list")) {
            closeAutocomplete("name-autocomplete-list");
        }
        if (!e.target.closest("#visitor-doc-number") && !e.target.closest("#doc-autocomplete-list")) {
            closeAutocomplete("doc-autocomplete-list");
        }
    });

    // Definir data/hora padrão de entrada
    setDateTimeNow('visit-entry-time');
});

// --- CONTROLE E INICIALIZAÇÃO DO SUPABASE ---
function initSupabase() {
    if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined' || !SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes("SUA_URL") || SUPABASE_ANON_KEY.includes("SUA_CHAVE")) {
        throw new Error("Credenciais do Supabase não foram preenchidas no config.js.");
    }
    
    // Inicia o cliente global do Supabase utilizando o objeto da biblioteca carregada da CDN
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// --- MAPEADORES DE DADOS (Snake Case PostgreSQL <=> Camel Case Javascript) ---
function mapVisitToDB(visit) {
    return {
        // Envia undefined para inserções para permitir que o PostgreSQL use a sequence autoincremental
        id: visit.id || undefined, 
        full_name: visit.fullName,
        doc_type: visit.docType,
        doc_number: visit.docNumber,
        visited_person_or_sector: visit.visitedPersonOrSector,
        purpose: visit.purpose,
        entry_date_time: visit.entryDateTime ? new Date(visit.entryDateTime).toISOString() : null,
        exit_date_time: visit.exitDateTime ? new Date(visit.exitDateTime).toISOString() : null,
        is_restricted: visit.isRestricted,
        authorizer: visit.authorizer || null,
        observations: visit.observations || null
    };
}

function mapVisitFromDB(dbVisit) {
    return {
        id: parseInt(dbVisit.id),
        fullName: dbVisit.full_name,
        docType: dbVisit.doc_type,
        docNumber: dbVisit.doc_number,
        visitedPersonOrSector: dbVisit.visited_person_or_sector,
        purpose: dbVisit.purpose,
        // Converte data ISO do banco para formato do datetime-local (YYYY-MM-DDTHH:MM)
        entryDateTime: dbVisit.entry_date_time ? convertISOToLocalFormat(dbVisit.entry_date_time) : "", 
        exitDateTime: dbVisit.exit_date_time ? convertISOToLocalFormat(dbVisit.exit_date_time) : "",
        isRestricted: dbVisit.is_restricted,
        authorizer: dbVisit.authorizer || "",
        observations: dbVisit.observations || "",
        createdAt: new Date(dbVisit.created_at).getTime()
    };
}

function mapUserToDB(user) {
    return {
        username: user.username,
        full_name: user.fullName,
        role: user.role,
        password_hash: user.passwordHash
    };
}

function mapUserFromDB(dbUser) {
    return {
        username: dbUser.username,
        fullName: dbUser.full_name,
        role: dbUser.role,
        passwordHash: dbUser.password_hash,
        createdAt: new Date(dbUser.created_at).getTime()
    };
}

// Converte string ISO para data-hora compatível com input datetime-local no fuso horário do sistema
function convertISOToLocalFormat(isoStr) {
    const d = new Date(isoStr);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// --- CRIPTOGRAFIA DE SENHAS (SHA-256 COM FALLBACK PARA REDES COMUNS HTTP) ---
function sha256Fallback(ascii) {
    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }
    
    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var lengthProperty = 'length';
    var i, j;

    var result = '';
    var words = [];
    var asciiLength = ascii[lengthProperty];
    
    var hash = [];
    var k = [];
    var primeCounter = 0;

    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (i = 0; i < 313; i += candidate) {
                isComposite[i] = 1;
            }
            if (primeCounter < 8) {
                hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
            }
            k[primeCounter] = (mathPow(candidate, 1/3) * maxWord) | 0;
            primeCounter++;
        }
    }
    
    ascii += '\x80';
    while (ascii[lengthProperty] % 64 - 56) {
        ascii += '\x00';
    }
    for (i = 0; i < ascii[lengthProperty]; i++) {
        j = ascii.charCodeAt(i);
        if (j >> 8) return;
        words[i >> 2] |= j << ((3 - i % 4) * 8);
    }
    words[words[lengthProperty]] = ((asciiLength * 8) / maxWord) | 0;
    words[words[lengthProperty]] = (asciiLength * 8) | 0;
    
    for (j = 0; j < words[lengthProperty]; j += 16) {
        var w = words.slice(j, j + 16);
        var oldHash = hash.slice(0);
        
        for (i = 0; i < 64; i++) {
            var wItem = w[i];
            if (i >= 16) {
                var s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                var s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                wItem = w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
            }
            
            var ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
            var maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
            var s0_h = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
            var s1_h = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
            
            var temp1 = (hash[7] + s1_h + ch + k[i] + wItem) | 0;
            var temp2 = (s0_h + maj) | 0;
            
            hash = [(temp1 + temp2) | 0].concat(hash);
            hash[4] = (hash[4] + temp1) | 0;
            hash.length = 8;
        }
        
        for (i = 0; i < 8; i++) {
            hash[i] = (hash[i] + oldHash[i]) | 0;
        }
    }
    
    for (i = 0; i < 8; i++) {
        var val = hash[i];
        if (val < 0) {
            val += maxWord;
        }
        result += val.toString(16).padStart(8, '0');
    }
    
    return result;
}

async function hashPassword(password) {
    if (window.crypto && window.crypto.subtle) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(password);
            const hashBuffer = await crypto.subtle.digest("SHA-256", data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return hashHex;
        } catch (e) {
            console.warn("Subtle Crypto falhou, usando fallback nativo em JS:", e);
        }
    }
    return sha256Fallback(password);
}

// Garantir o administrador padrão na primeira execução do Supabase
async function ensureDefaultAdmin() {
    if (!supabaseClient) return;

    // Busca contagem exata da tabela users no Supabase
    const { count, error } = await supabaseClient
        .from('users')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error("Erro ao contar usuários no Supabase:", error);
        throw error;
    }

    if (count === 0) {
        console.log("Banco de dados vazio no servidor. Cadastrando administrador padrão...");
        const passHash = await hashPassword("admin123");
        const defaultAdmin = {
            username: "admin",
            full_name: "ADMINISTRADOR PADRÃO",
            role: "admin",
            password_hash: passHash
        };

        const { error: insertError } = await supabaseClient
            .from('users')
            .insert([defaultAdmin]);

        if (insertError) {
            console.error("Erro ao registrar admin padrão:", insertError);
            throw insertError;
        }
        console.log("Administrador padrão criado com sucesso no Supabase.");
    }
}

function updateDbStatus(isOnline, text) {
    const pill = document.getElementById("db-status-pill");
    const statusText = document.getElementById("db-status-text");
    if (!pill || !statusText) return;
    
    if (isOnline) {
        pill.className = "db-status-pill online";
        statusText.textContent = text;
    } else {
        pill.className = "db-status-pill error";
        statusText.textContent = text;
    }
}

// --- RELÓGIO EM TEMPO REAL ---
function initClock() {
    const clockEl = document.getElementById("live-clock");
    if (!clockEl) return;
    
    const updateTime = () => {
        const now = new Date();
        const options = { 
            day: '2-digit', 
            month: 'long', 
            year: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit', 
            hour12: false 
        };
        clockEl.textContent = now.toLocaleDateString('pt-BR', options).replace(' às ', ', ');
    };
    
    updateTime();
    setInterval(updateTime, 1000);
}

// --- SISTEMA DE SESSÃO & LOGIN ---
function checkActiveSession() {
    const sessionData = sessionStorage.getItem("currentUser") || localStorage.getItem("currentUser");
    
    if (sessionData) {
        try {
            currentUser = JSON.parse(sessionData);
            console.log("Sessão ativa encontrada:", currentUser.username);
            loginUser(currentUser);
        } catch (e) {
            console.error("Erro na leitura de sessão", e);
            showLoginScreen();
        }
    } else {
        showLoginScreen();
    }
}

function showLoginScreen() {
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("app-layout").classList.add("hidden");
    currentUser = null;
}

function loginUser(userData) {
    currentUser = userData;
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-layout").classList.remove("hidden");
    
    // Configurar permissões do perfil
    adjustRolePermissions();
    
    // Carregar visitas e resetar abas
    switchTab("acessos");
    loadVisitsFromDB();
}

function adjustRolePermissions() {
    const btnRelatorios = document.getElementById("menu-btn-relatorios");
    const btnUsuarios = document.getElementById("menu-btn-usuarios");
    
    if (currentUser.role === "admin") {
        btnRelatorios.classList.remove("hidden");
        btnUsuarios.classList.remove("hidden");
    } else {
        btnRelatorios.classList.add("hidden");
        btnUsuarios.classList.add("hidden");
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    
    const username = document.getElementById("login-username").value.toLowerCase().trim();
    const pass = document.getElementById("login-password").value;
    const remember = document.getElementById("login-remember").checked;
    
    if (!username || !pass) {
        showToast("Insira o usuário e a senha.", "warning");
        return;
    }
    
    try {
        const userObj = await getUserFromDB(username);
        if (!userObj) {
            showToast("Usuário não cadastrado.", "error");
            return;
        }
        
        const passHashInput = await hashPassword(pass);
        if (userObj.passwordHash === passHashInput) {
            const sessionObj = {
                username: userObj.username,
                fullName: userObj.fullName,
                role: userObj.role
            };
            
            const storage = remember ? localStorage : sessionStorage;
            storage.setItem("currentUser", JSON.stringify(sessionObj));
            
            // Limpar formulário de login
            document.getElementById("login-form").reset();
            
            loginUser(sessionObj);
        } else {
            showToast("Senha incorreta.", "error");
        }
    } catch (e) {
        console.error("Erro na autenticação:", e);
        showToast("Falha de comunicação com o servidor.", "error");
    }
}

function handleLogout() {
    sessionStorage.removeItem("currentUser");
    localStorage.removeItem("currentUser");
    showLoginScreen();
    showToast("Sessão finalizada com sucesso.", "info");
}

async function getUserFromDB(username) {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient
        .from('users')
        .select('*')
        .eq('username', username)
        .maybeSingle(); // Retorna nulo se não encontrar, sem disparar exceção
        
    if (error) {
        console.error("Erro ao obter usuário:", error);
        throw error;
    }
    
    return data ? mapUserFromDB(data) : null;
}

// --- CONTROLE DE ABAS (TABS) ---
function switchTab(tabId) {
    if (currentUser && currentUser.role !== "admin" && (tabId === "relatorios" || tabId === "usuarios")) {
        tabId = "acessos";
    }

    document.querySelectorAll(".content-container").forEach(el => {
        el.classList.add("hidden");
    });
    
    document.querySelectorAll(".menu-item").forEach(el => {
        el.classList.remove("active");
    });

    document.getElementById(`tab-${tabId}`).classList.remove("hidden");
    
    if (tabId === 'acessos') {
        document.getElementById("menu-btn-acessos").classList.add("active");
        document.getElementById("page-title").textContent = "Controle de Portaria";
    } else if (tabId === 'relatorios') {
        document.getElementById("menu-btn-relatorios").classList.add("active");
        document.getElementById("page-title").textContent = "Relatórios & Dados";
        calculateStats();
    } else if (tabId === 'usuarios') {
        document.getElementById("menu-btn-usuarios").classList.add("active");
        document.getElementById("page-title").textContent = "Gerenciar Usuários";
        loadUsersFromDB();
        clearUserForm(true);
    }
}

// --- OPERAÇÕES DO FORMULÁRIO DE PORTARIA ---
function setDateTimeNow(fieldId) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    const field = document.getElementById(fieldId);
    if (field) {
        field.value = `${year}-${month}-${day}T${hours}:${minutes}`;
    }
}

// Mostrar/ocultar autorizador
function toggleRestrictedField() {
    const isRestricted = document.getElementById("visit-restricted").checked;
    const authorizerGroup = document.getElementById("group-authorizer");
    const authorizerInput = document.getElementById("visit-authorizer");
    
    if (isRestricted) {
        authorizerGroup.classList.remove("hidden");
        authorizerInput.required = true;
    } else {
        authorizerGroup.classList.add("hidden");
        authorizerInput.required = false;
        authorizerInput.value = "";
    }
}

function toggleEditRestrictedField() {
    const isRestricted = document.getElementById("edit-visit-restricted").checked;
    const authorizerGroup = document.getElementById("edit-group-authorizer");
    const authorizerInput = document.getElementById("edit-visit-authorizer");
    
    if (isRestricted) {
        authorizerGroup.classList.remove("hidden");
        authorizerInput.required = true;
    } else {
        authorizerGroup.classList.add("hidden");
        authorizerInput.required = false;
        authorizerInput.value = "";
    }
}

function clearForm(resetEntryTime = false) {
    document.getElementById("visit-id").value = "";
    document.getElementById("visitor-name").value = "";
    document.getElementById("visitor-doc-type").value = "CPF";
    document.getElementById("visitor-doc-number").value = "";
    document.getElementById("visit-target").value = "";
    document.getElementById("visit-purpose").value = "";
    document.getElementById("visit-exit-time").value = "";
    document.getElementById("visit-restricted").checked = false;
    document.getElementById("visit-authorizer").value = "";
    document.getElementById("visit-notes").value = "";
    
    toggleRestrictedField();
    
    if (resetEntryTime) {
        setDateTimeNow('visit-entry-time');
    } else {
        document.getElementById("visit-entry-time").value = "";
    }

    closeAutocomplete("name-autocomplete-list");
    closeAutocomplete("doc-autocomplete-list");
}

async function handleFormSubmit(event) {
    event.preventDefault();

    const name = document.getElementById("visitor-name").value.toUpperCase().trim();
    const docType = document.getElementById("visitor-doc-type").value;
    const docNumber = document.getElementById("visitor-doc-number").value.trim();
    const target = document.getElementById("visit-target").value.toUpperCase().trim();
    const purpose = document.getElementById("visit-purpose").value.toUpperCase().trim();
    const entryTime = document.getElementById("visit-entry-time").value;
    const exitTime = document.getElementById("visit-exit-time").value;
    const isRestricted = document.getElementById("visit-restricted").checked;
    const authorizer = document.getElementById("visit-authorizer").value.toUpperCase().trim();
    const notes = document.getElementById("visit-notes").value.toUpperCase().trim();

    if (!name || !docType || !docNumber || !target || !purpose || !entryTime) {
        showToast("Por favor, preencha todos os campos obrigatórios (*).", "warning");
        return;
    }

    if (isRestricted && !authorizer) {
        showToast("O autorizador é obrigatório para visitas em área restrita.", "warning");
        return;
    }

    if (exitTime && new Date(exitTime) < new Date(entryTime)) {
        showToast("A data/hora de saída não pode ser anterior à data/hora de entrada.", "warning");
        return;
    }

    const visitData = {
        fullName: name,
        docType: docType,
        docNumber: docNumber,
        visitedPersonOrSector: target,
        purpose: purpose,
        entryDateTime: entryTime,
        exitDateTime: exitTime || null,
        isRestricted: isRestricted,
        authorizer: isRestricted ? authorizer : null,
        observations: notes || null
    };

    try {
        await saveVisitToDB(visitData);
        showToast("Registro de acesso gravado no servidor!", "success");
        clearForm(true);
        loadVisitsFromDB();
    } catch (err) {
        console.error("Erro ao gravar:", err);
        showToast("Erro ao gravar dados no servidor.", "error");
    }
}

// --- AUTOCOMPLETE E SUGESTÕES ---
function handleNameInput(event) {
    const value = event.target.value.toUpperCase();
    
    if (value.length < 2) {
        closeAutocomplete("name-autocomplete-list");
        return;
    }

    const matches = findUniqueVisitorsByName(value);
    
    if (matches.length === 0) {
        closeAutocomplete("name-autocomplete-list");
        return;
    }

    renderAutocompleteDropdown("name-autocomplete-list", matches);
}

function handleDocNumberInput(event) {
    const value = event.target.value.trim();

    if (value.length < 3) {
        closeAutocomplete("doc-autocomplete-list");
        return;
    }

    const matches = findUniqueVisitorsByDoc(value);

    if (matches.length === 0) {
        closeAutocomplete("doc-autocomplete-list");
        return;
    }

    renderAutocompleteDropdown("doc-autocomplete-list", matches);
}

function findUniqueVisitorsByName(query) {
    const unique = new Map();
    const sorted = [...allVisits].sort((a, b) => b.createdAt - a.createdAt);
    
    for (const v of sorted) {
        if (v.fullName.includes(query)) {
            const key = `${v.docType}_${v.docNumber}`;
            if (!unique.has(key) && unique.size < 5) {
                unique.set(key, v);
            }
        }
    }
    return Array.from(unique.values());
}

function findUniqueVisitorsByDoc(query) {
    const unique = new Map();
    const sorted = [...allVisits].sort((a, b) => b.createdAt - a.createdAt);

    for (const v of sorted) {
        if (v.docNumber.includes(query)) {
            const key = `${v.docType}_${v.docNumber}`;
            if (!unique.has(key) && unique.size < 5) {
                unique.set(key, v);
            }
        }
    }
    return Array.from(unique.values());
}

function renderAutocompleteDropdown(dropdownId, items) {
    const dropdown = document.getElementById(dropdownId);
    dropdown.innerHTML = "";
    dropdown.classList.remove("hidden");

    items.forEach(item => {
        const div = document.createElement("div");
        div.className = "autocomplete-item";
        div.innerHTML = `
            <div class="autocomplete-name">${item.fullName}</div>
            <div class="autocomplete-detail">${item.docType}: ${item.docNumber} | Destino Comum: ${item.visitedPersonOrSector}</div>
        `;
        
        div.addEventListener("click", () => {
            prefillForm(item);
            closeAutocomplete(dropdownId);
        });

        dropdown.appendChild(div);
    });
}

function prefillForm(visitorData) {
    document.getElementById("visitor-name").value = visitorData.fullName;
    document.getElementById("visitor-doc-type").value = visitorData.docType;
    document.getElementById("visitor-doc-number").value = visitorData.docNumber;
    document.getElementById("visit-target").value = visitorData.visitedPersonOrSector;
    document.getElementById("visit-purpose").value = visitorData.purpose;
    
    document.getElementById("visit-entry-time").value = "";
    document.getElementById("visit-exit-time").value = "";
    
    document.getElementById("visit-restricted").checked = visitorData.isRestricted;
    document.getElementById("visit-authorizer").value = visitorData.authorizer || "";
    toggleRestrictedField();
    
    document.getElementById("visit-notes").value = visitorData.observations || "";

    const fieldsToHighlight = [
        "visitor-name", "visitor-doc-type", "visitor-doc-number", 
        "visit-target", "visit-purpose", "visit-notes"
    ];
    
    fieldsToHighlight.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.backgroundColor = "rgba(16, 185, 129, 0.2)";
            setTimeout(() => {
                el.style.transition = "background-color 0.8s ease";
                el.style.backgroundColor = "";
                setTimeout(() => el.style.transition = "", 800);
            }, 100);
        }
    });

    showToast(`Cadastro pré-preenchido para ${visitorData.fullName}!`, "info");
}

function closeAutocomplete(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (dropdown) {
        dropdown.innerHTML = "";
        dropdown.classList.add("hidden");
    }
}

// --- PERSISTÊNCIA DAS VISITAS NO SUPABASE ---
async function saveVisitToDB(visit) {
    if (!supabaseClient) throw new Error("Supabase não inicializado.");
    const dbVisit = mapVisitToDB(visit);
    
    let error = null;
    if (dbVisit.id) {
        // Atualização (Update)
        const { error: updateError } = await supabaseClient
            .from('visits')
            .update(dbVisit)
            .eq('id', dbVisit.id);
        error = updateError;
    } else {
        // Inserção (Insert)
        const { error: insertError } = await supabaseClient
            .from('visits')
            .insert([dbVisit]);
        error = insertError;
    }
    
    if (error) {
        console.error("Erro ao salvar visita no Supabase:", error);
        throw error;
    }
}

async function deleteVisitFromDB(id) {
    if (!supabaseClient) throw new Error("Supabase não inicializado.");
    const { error } = await supabaseClient
        .from('visits')
        .delete()
        .eq('id', id);
        
    if (error) {
        console.error("Erro ao deletar visita no Supabase:", error);
        throw error;
    }
}

async function loadVisitsFromDB() {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
        .from('visits')
        .select('*')
        .order('entry_date_time', { ascending: false });

    if (error) {
        console.error("Erro ao buscar dados do Supabase:", error);
        showToast("Erro ao carregar dados do servidor.", "error");
        return;
    }

    allVisits = data.map(mapVisitFromDB);
    applyFiltersAndRender();
    updateFilterBadges();
}

// --- RENDERIZAÇÃO DA TABELA DE ACESSOS ---
function setFilter(filterType) {
    currentFilter = filterType;
    
    document.querySelectorAll(".filter-tab").forEach(tab => {
        tab.classList.remove("active");
    });
    document.getElementById(`tab-filter-${filterType}`).classList.add("active");
    
    currentPage = 1;
    applyFiltersAndRender();
}

function handleSearch() {
    searchQuery = document.getElementById("search-input").value.toUpperCase().trim();
    currentPage = 1;
    applyFiltersAndRender();
}

function applyFiltersAndRender() {
    filteredVisits = allVisits.filter(visit => {
        if (currentFilter === "ativo") {
            return !visit.exitDateTime;
        } else if (currentFilter === "concluido") {
            return !!visit.exitDateTime;
        }
        return true;
    });

    if (searchQuery) {
        filteredVisits = filteredVisits.filter(visit => {
            return (
                visit.fullName.includes(searchQuery) ||
                visit.docNumber.includes(searchQuery) ||
                visit.visitedPersonOrSector.includes(searchQuery) ||
                visit.entryDateTime.includes(searchQuery) ||
                (visit.observations && visit.observations.includes(searchQuery))
            );
        });
    }

    renderTable();
}

function updateFilterBadges() {
    const totalCount = allVisits.length;
    const activeCount = allVisits.filter(v => !v.exitDateTime).length;
    const completedCount = totalCount - activeCount;

    document.getElementById("count-todos").textContent = totalCount;
    document.getElementById("count-ativo").textContent = activeCount;
    document.getElementById("count-concluido").textContent = completedCount;
}

function renderTable() {
    const tbody = document.getElementById("access-table-body");
    const noRecordsMsg = document.getElementById("no-records-message");
    const tableElement = document.getElementById("access-table");
    
    tbody.innerHTML = "";

    const totalRecords = filteredVisits.length;
    document.getElementById("pagination-total").textContent = totalRecords;

    if (totalRecords === 0) {
        tableElement.classList.add("hidden");
        noRecordsMsg.classList.remove("hidden");
        document.getElementById("pagination-range").textContent = "0-0";
        document.getElementById("btn-prev-page").disabled = true;
        document.getElementById("btn-next-page").disabled = true;
        return;
    }

    tableElement.classList.remove("hidden");
    noRecordsMsg.classList.add("hidden");

    const totalPages = Math.ceil(totalRecords / itemsPerPage);
    if (currentPage > totalPages) currentPage = Math.max(1, totalPages);

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalRecords);
    
    document.getElementById("pagination-range").textContent = `${startIndex + 1}-${endIndex}`;
    
    document.getElementById("btn-prev-page").disabled = currentPage === 1;
    document.getElementById("btn-next-page").disabled = currentPage === totalPages;

    const pageVisits = filteredVisits.slice(startIndex, endIndex);

    pageVisits.forEach(visit => {
        const tr = document.createElement("tr");
        
        const entryStr = formatDateTime(visit.entryDateTime);
        const exitStr = visit.exitDateTime ? formatDateTime(visit.exitDateTime) : "—";
        const hasCheckedOut = !!visit.exitDateTime;

        const statusBadge = hasCheckedOut 
            ? `<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Finalizado</span>` 
            : `<span class="badge badge-warning"><i class="fa-solid fa-clock-rotate-left animate-spin-slow"></i> Em Andamento</span>`;

        const restrictedBadge = visit.isRestricted 
            ? `<div class="visit-detail-text text-danger font-bold"><i class="fa-solid fa-lock"></i> ÁREA RESTRITA (AUTOR: ${visit.authorizer})</div>` 
            : "";

        const checkoutBtn = !hasCheckedOut 
            ? `<button class="btn-action btn-action-checkout" onclick="quickCheckout(${visit.id})" title="Registrar Saída"><i class="fa-solid fa-door-closed"></i> Saída</button>` 
            : "";

        const deleteBtn = currentUser.role === "admin"
            ? `<button class="btn-action btn-action-delete" onclick="openDeleteModal(${visit.id}, '${visit.fullName}')" title="Excluir Registro"><i class="fa-solid fa-trash-can"></i></button>`
            : "";

        tr.innerHTML = `
            <td>
                <div class="visitor-main-info">
                    ${visit.fullName} 
                    ${visit.isRestricted ? '<i class="fa-solid fa-triangle-exclamation text-warning" title="Acesso a área restrita"></i>' : ''}
                </div>
                <div class="visitor-sub-info">${visit.docType}: ${visit.docNumber}</div>
            </td>
            <td>
                <div class="visitor-main-info">${visit.visitedPersonOrSector}</div>
                <div class="visitor-sub-info">Motivo: ${visit.purpose}</div>
                ${restrictedBadge}
                ${visit.observations ? `<div class="visitor-sub-info italic">Obs: "${visit.observations}"</div>` : ''}
            </td>
            <td>
                <div class="visit-time-block">
                    <div class="time-row entry"><i class="fa-solid fa-right-to-bracket text-success"></i> ${entryStr}</div>
                    <div class="time-row exit"><i class="fa-solid fa-right-from-bracket text-secondary"></i> ${exitStr}</div>
                </div>
            </td>
            <td>${statusBadge}</td>
            <td class="text-right">
                <div class="table-actions">
                    ${checkoutBtn}
                    <button class="btn-action btn-action-edit" onclick="openEditModal(${visit.id})" title="Editar Acesso"><i class="fa-solid fa-pencil"></i></button>
                    ${deleteBtn}
                </div>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
}

function nextPage() {
    const totalRecords = filteredVisits.length;
    const totalPages = Math.ceil(totalRecords / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderTable();
    }
}

function formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return "";
    try {
        const [datePart, timePart] = dateTimeStr.split("T");
        const [year, month, day] = datePart.split("-");
        return `${day}/${month}/${year} às ${timePart}`;
    } catch (e) {
        return dateTimeStr;
    }
}

// --- QUICK CHECKOUT & MODAL EDIT VISITA ---
async function quickCheckout(id) {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('visits')
            .select('*')
            .eq('id', id)
            .single();
            
        if (error) throw error;
        
        const visit = mapVisitFromDB(data);
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        
        visit.exitDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;

        await saveVisitToDB(visit);
        showToast(`Saída de ${visit.fullName} registrada com sucesso!`, "success");
        loadVisitsFromDB();
    } catch (err) {
        console.error("Erro ao registrar saída rápida:", err);
        showToast("Erro ao registrar saída rápida.", "error");
    }
}

async function openEditModal(id) {
    editVisitId = id;
    if (!supabaseClient) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('visits')
            .select('*')
            .eq('id', id)
            .single();
            
        if (error) throw error;
        
        const visit = mapVisitFromDB(data);
        
        document.getElementById("edit-visit-id").value = visit.id;
        document.getElementById("edit-visitor-name").value = visit.fullName;
        document.getElementById("edit-visitor-doc-type").value = visit.docType;
        document.getElementById("edit-visitor-doc-number").value = visit.docNumber;
        document.getElementById("edit-visit-target").value = visit.visitedPersonOrSector;
        document.getElementById("edit-visit-purpose").value = visit.purpose;
        document.getElementById("edit-visit-entry-time").value = visit.entryDateTime;
        document.getElementById("edit-visit-exit-time").value = visit.exitDateTime || "";
        document.getElementById("edit-visit-restricted").checked = visit.isRestricted;
        document.getElementById("edit-visit-authorizer").value = visit.authorizer || "";
        document.getElementById("edit-visit-notes").value = visit.observations || "";
        
        toggleEditRestrictedField();
        document.getElementById("edit-modal").classList.remove("hidden");
    } catch (err) {
        console.error("Erro ao buscar dados para edição:", err);
        showToast("Erro ao abrir modal de edição.", "error");
    }
}

function closeEditModal() {
    document.getElementById("edit-modal").classList.add("hidden");
    document.getElementById("edit-visit-form").reset();
    editVisitId = null;
}

async function handleEditFormSubmit(event) {
    event.preventDefault();

    const id = parseInt(document.getElementById("edit-visit-id").value);
    const name = document.getElementById("edit-visitor-name").value.toUpperCase().trim();
    const docType = document.getElementById("edit-visitor-doc-type").value;
    const docNumber = document.getElementById("edit-visitor-doc-number").value.trim();
    const target = document.getElementById("edit-visit-target").value.toUpperCase().trim();
    const purpose = document.getElementById("edit-visit-purpose").value.toUpperCase().trim();
    const entryTime = document.getElementById("edit-visit-entry-time").value;
    const exitTime = document.getElementById("edit-visit-exit-time").value;
    const isRestricted = document.getElementById("edit-visit-restricted").checked;
    const authorizer = document.getElementById("edit-visit-authorizer").value.toUpperCase().trim();
    const notes = document.getElementById("edit-visit-notes").value.toUpperCase().trim();

    if (!name || !docType || !docNumber || !target || !purpose || !entryTime) {
        showToast("Por favor, preencha os campos obrigatórios (*).", "warning");
        return;
    }

    if (isRestricted && !authorizer) {
        showToast("O autorizador é obrigatório para áreas restritas.", "warning");
        return;
    }

    if (exitTime && new Date(exitTime) < new Date(entryTime)) {
        showToast("A data/hora de saída não pode ser anterior à data/hora de entrada.", "warning");
        return;
    }

    const updatedVisit = {
        id: id,
        fullName: name,
        docType: docType,
        docNumber: docNumber,
        visitedPersonOrSector: target,
        purpose: purpose,
        entryDateTime: entryTime,
        exitDateTime: exitTime || null,
        isRestricted: isRestricted,
        authorizer: isRestricted ? authorizer : null,
        observations: notes || null
    };

    try {
        await saveVisitToDB(updatedVisit);
        showToast("Registro atualizado com sucesso no servidor!", "success");
        closeEditModal();
        loadVisitsFromDB();
    } catch (err) {
        console.error("Erro ao atualizar visita:", err);
        showToast("Erro ao salvar alterações no servidor.", "error");
    }
}

function openDeleteModal(id, name) {
    deleteVisitId = id;
    document.getElementById("delete-visitor-name-span").textContent = name;
    
    const confirmBtn = document.getElementById("btn-confirm-delete-action");
    confirmBtn.onclick = () => {
        executeDelete(id);
    };

    document.getElementById("delete-confirm-modal").classList.remove("hidden");
}

function closeDeleteModal() {
    document.getElementById("delete-confirm-modal").classList.add("hidden");
    deleteVisitId = null;
}

async function executeDelete(id) {
    try {
        await deleteVisitFromDB(id);
        showToast("Registro excluído permanentemente do servidor.", "success");
        closeDeleteModal();
        loadVisitsFromDB();
    } catch (err) {
        console.error("Erro ao excluir visita:", err);
        showToast("Erro ao excluir registro no servidor.", "error");
    }
}

// --- RELÓGIO E BACKUPS ---
function calculateStats() {
    const total = allVisits.length;
    const active = allVisits.filter(v => !v.exitDateTime).length;
    const restricted = allVisits.filter(v => v.isRestricted).length;

    const todayStr = new Date().toISOString().split("T")[0];
    const todayCheckout = allVisits.filter(v => {
        if (!v.exitDateTime) return false;
        return v.exitDateTime.startsWith(todayStr);
    }).length;

    document.getElementById("stat-total-visits").textContent = total;
    document.getElementById("stat-active-visits").textContent = active;
    document.getElementById("stat-today-checkout").textContent = todayCheckout;
    document.getElementById("stat-restricted-visits").textContent = restricted;
}

function getFormattedDateCompact() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function exportDatabaseJSON() {
    if (allVisits.length === 0) {
        showToast("Não há dados para exportar.", "warning");
        return;
    }

    try {
        const dataStr = JSON.stringify(allVisits, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = url;
        a.download = `navmanager_backup_acessos_${getFormattedDateCompact()}.json`;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Backup JSON exportado com sucesso!", "success");
    } catch (e) {
        console.error(e);
        showToast("Falha ao exportar backup JSON.", "error");
    }
}

function exportDatabaseCSV() {
    if (allVisits.length === 0) {
        showToast("Não há dados para exportar.", "warning");
        return;
    }

    try {
        const headers = [
            "ID", "Nome Completo", "Tipo Documento", "Numero Documento", 
            "Destino/Setor Visitado", "Finalidade da Visita", 
            "Data e Hora Entrada", "Data e Hora Saida", "Area Restrita", 
            "Autorizador", "Observacoes"
        ];
        
        let csvContent = headers.join(";") + "\n";

        allVisits.forEach(v => {
            const row = [
                v.id || "",
                escapeCSVField(v.fullName),
                escapeCSVField(v.docType),
                escapeCSVField(v.docNumber),
                escapeCSVField(v.visitedPersonOrSector),
                escapeCSVField(v.purpose),
                v.entryDateTime ? formatDateTime(v.entryDateTime) : "",
                v.exitDateTime ? formatDateTime(v.exitDateTime) : "",
                v.isRestricted ? "SIM" : "NAO",
                v.isRestricted ? escapeCSVField(v.authorizer) : "",
                escapeCSVField(v.observations)
            ];
            csvContent += row.join(";") + "\n";
        });

        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = url;
        a.download = `navmanager_export_acessos_${getFormattedDateCompact()}.csv`;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Exportação CSV concluída com sucesso!", "success");
    } catch (e) {
        console.error(e);
        showToast("Falha ao exportar planilha CSV.", "error");
    }
}

function escapeCSVField(val) {
    if (val === null || val === undefined) return "";
    let str = String(val);
    str = str.replace(/\r?\n|\r/g, " ");
    if (str.includes(";") || str.includes('"')) {
        str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

// Importar visitas de arquivo de backup JSON enviando diretamente ao Supabase
async function importDatabaseJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!Array.isArray(data)) {
                throw new Error("O arquivo de backup deve conter um array de visitas.");
            }

            const valid = data.every(v => v.fullName && v.docNumber && v.entryDateTime);
            if (!valid && data.length > 0) {
                throw new Error("Os dados do arquivo JSON estão em formato incompatível.");
            }

            if (data.length === 0) {
                showToast("Arquivo JSON está vazio.", "warning");
                return;
            }

            showToast("Importando dados para o servidor... Aguarde.", "info");

            // Mapeia os dados removendo IDs antigos para evitar colisão de chaves
            const dbItems = data.map(v => {
                const dbVisit = mapVisitToDB(v);
                delete dbVisit.id;
                return dbVisit;
            });

            // Envia em lote para o Supabase
            const { error } = await supabaseClient
                .from('visits')
                .insert(dbItems);

            if (error) {
                throw error;
            }

            showToast(`${data.length} registros importados com sucesso para o servidor!`, "success");
            loadVisitsFromDB();
            document.getElementById("import-file-input").value = "";

        } catch (err) {
            console.error("Erro na importação:", err);
            showToast(`Erro na importação: ${err.message}`, "error");
        }
    };
    reader.readAsText(file);
}

// Limpar banco de dados centralizado do Supabase
async function triggerClearAllDatabase() {
    const confirmMessage = "VOCÊ TEM ABSOLUTA CERTEZA? Isso apagará permanentemente TODOS os acessos gravados no servidor central do Supabase e não poderá ser desfeito.";
    
    if (confirm(confirmMessage)) {
        if (!supabaseClient) return;
        
        try {
            const { error } = await supabaseClient
                .from('visits')
                .delete()
                .gt('id', 0);

            if (error) throw error;

            showToast("Toda a base de dados de portaria foi reiniciada no servidor.", "success");
            loadVisitsFromDB();
            calculateStats();
        } catch (err) {
            console.error("Erro ao limpar banco de dados no Supabase:", err);
            showToast("Erro ao limpar banco de dados no servidor.", "error");
        }
    }
}

// --- GESTÃO DE USUÁRIOS NO SUPABASE (ADMIN APENAS) ---
async function loadUsersFromDB() {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
        .from('users')
        .select('*')
        .order('full_name', { ascending: true });

    if (error) {
        console.error("Erro ao obter usuários no servidor:", error);
        showToast("Erro ao carregar usuários do servidor.", "error");
        return;
    }

    allUsers = data.map(mapUserFromDB);
    renderUsersTable();
}

function renderUsersTable() {
    const tbody = document.getElementById("users-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    allUsers.forEach(u => {
        const tr = document.createElement("tr");
        
        const roleBadge = u.role === "admin" 
            ? `<span class="badge badge-success"><i class="fa-solid fa-user-shield"></i> Administrador</span>`
            : `<span class="badge badge-warning"><i class="fa-solid fa-user-pen"></i> Operador</span>`;
            
        const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString("pt-BR") : "—";

        // Impedir auto-exclusão
        const isSelf = currentUser && currentUser.username === u.username;
        const deleteBtn = isSelf 
            ? `<button class="btn-action" disabled style="opacity: 0.3;" title="Você não pode excluir a si mesmo"><i class="fa-solid fa-trash-can"></i></button>`
            : `<button class="btn-action btn-action-delete" onclick="deleteUser('${u.username}')" title="Excluir Usuário"><i class="fa-solid fa-trash-can"></i></button>`;

        tr.innerHTML = `
            <td><strong class="visitor-main-info">${u.fullName}</strong></td>
            <td><code>${u.username}</code></td>
            <td>${roleBadge}</td>
            <td>${dateStr}</td>
            <td class="text-right">
                <div class="table-actions">
                    <button class="btn-action btn-action-edit" onclick="editUser('${u.username}')" title="Editar Usuário"><i class="fa-solid fa-pencil"></i></button>
                    ${deleteBtn}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function handleUserFormSubmit(event) {
    event.preventDefault();

    const username = document.getElementById("user-username").value.toLowerCase().trim();
    const fullName = document.getElementById("user-fullname").value.toUpperCase().trim();
    const role = document.getElementById("user-role").value;
    const password = document.getElementById("user-password").value;

    if (!username || !fullName || !role) {
        showToast("Preencha todos os campos obrigatórios (*).", "warning");
        return;
    }

    if (!editingUsername && !password) {
        showToast("A senha é obrigatória para novos usuários.", "warning");
        return;
    }

    try {
        if (!editingUsername) {
            // Criar novo usuário
            const existing = await getUserFromDB(username);
            if (existing) {
                showToast("Este nome de usuário já está cadastrado.", "error");
                return;
            }

            const hash = await hashPassword(password);
            const newUser = {
                username: username,
                fullName: fullName,
                role: role,
                passwordHash: hash
            };

            await saveUserToDB(newUser);
            showToast(`Usuário ${username} cadastrado no servidor!`, "success");
            clearUserForm(true);
            loadUsersFromDB();
        } else {
            // Editar usuário existente
            const oldUser = await getUserFromDB(editingUsername);
            if (!oldUser) {
                showToast("Erro ao buscar dados do usuário no servidor.", "error");
                return;
            }

            let hash = oldUser.passwordHash;
            if (password) {
                hash = await hashPassword(password);
            }

            const updatedUser = {
                username: editingUsername,
                fullName: fullName,
                role: role,
                passwordHash: hash
            };

            // Trava para evitar despromover o único administrador ativo
            if (currentUser && currentUser.username === editingUsername) {
                if (role !== "admin" && oldUser.role === "admin") {
                    const otherAdmins = allUsers.filter(u => u.role === "admin" && u.username !== editingUsername);
                    if (otherAdmins.length === 0) {
                        showToast("Você não pode mudar seu perfil para Operador sendo o único Administrador ativo.", "error");
                        return;
                    }
                }
            }

            await saveUserToDB(updatedUser);
            showToast(`Usuário ${editingUsername} atualizado no servidor!`, "success");
            
            // Se o próprio administrador editou seu cadastro, atualiza a sessão local
            if (currentUser && currentUser.username === editingUsername) {
                currentUser.fullName = fullName;
                currentUser.role = role;
                const storage = localStorage.getItem("currentUser") ? localStorage : sessionStorage;
                storage.setItem("currentUser", JSON.stringify(currentUser));
                adjustRolePermissions();
            }

            clearUserForm(true);
            loadUsersFromDB();
        }
    } catch (e) {
        console.error("Erro no processamento do formulário de usuário:", e);
        showToast("Erro ao salvar usuário no servidor.", "error");
    }
}

async function saveUserToDB(userObj) {
    if (!supabaseClient) throw new Error("Supabase não inicializado.");
    const dbUser = mapUserToDB(userObj);
    
    const { error } = await supabaseClient
        .from('users')
        .upsert([dbUser]);
        
    if (error) {
        console.error("Erro ao upsert usuário no Supabase:", error);
        throw error;
    }
}

function editUser(username) {
    const user = allUsers.find(u => u.username === username);
    if (!user) return;

    editingUsername = username;

    document.getElementById("user-form-title").textContent = "Editar Usuário";
    document.getElementById("user-fullname").value = user.fullName;
    
    const userField = document.getElementById("user-username");
    userField.value = user.username;
    userField.disabled = true;

    document.getElementById("user-role").value = user.role;
    
    const passField = document.getElementById("user-password");
    passField.required = false;
    passField.placeholder = "DEIXE EM BRANCO PARA MANTER";
    document.getElementById("user-password-star").classList.add("hidden");
    document.getElementById("user-password-helper").classList.remove("hidden");

    document.getElementById("btn-submit-user").innerHTML = `<i class="fa-solid fa-user-pen"></i> Salvar Alterações`;
}

function clearUserForm(resetState = true) {
    document.getElementById("user-fullname").value = "";
    
    const userField = document.getElementById("user-username");
    userField.value = "";
    userField.disabled = false;
    
    document.getElementById("user-role").value = "operator";
    
    const passField = document.getElementById("user-password");
    passField.value = "";
    passField.required = true;
    passField.placeholder = "SENHA DE ACESSO";

    document.getElementById("user-password-star").classList.remove("hidden");
    document.getElementById("user-password-helper").classList.add("hidden");

    if (resetState) {
        editingUsername = null;
        document.getElementById("user-form-title").textContent = "Novo Usuário";
        document.getElementById("btn-submit-user").innerHTML = `<i class="fa-solid fa-circle-check"></i> Cadastrar Usuário`;
    }
}

async function deleteUser(username) {
    if (currentUser && currentUser.username === username) {
        showToast("Você não pode excluir a sua própria conta.", "error");
        return;
    }

    const targetUser = allUsers.find(u => u.username === username);
    if (targetUser && targetUser.role === "admin") {
        const admins = allUsers.filter(u => u.role === "admin");
        if (admins.length <= 1) {
            showToast("Não é possível excluir o último Administrador do sistema.", "error");
            return;
        }
    }

    if (confirm(`Deseja realmente excluir permanentemente o acesso do usuário "${username}"?`)) {
        try {
            await deleteUserFromDB(username);
            showToast(`Usuário "${username}" removido do servidor.`, "success");
            loadUsersFromDB();
            clearUserForm(true);
        } catch (err) {
            console.error("Erro ao deletar usuário:", err);
            showToast("Erro ao remover usuário do servidor.", "error");
        }
    }
}

async function deleteUserFromDB(username) {
    if (!supabaseClient) throw new Error("Supabase não inicializado.");
    const { error } = await supabaseClient
        .from('users')
        .delete()
        .eq('username', username);
        
    if (error) {
        console.error("Erro ao deletar usuário no Supabase:", error);
        throw error;
    }
}

// --- NOTIFICAÇÕES TOAST DE DESIGN PREMIUM ---
function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    let iconClass = "fa-info-circle";
    if (type === "success") iconClass = "fa-check-circle";
    if (type === "error") iconClass = "fa-exclamation-circle";
    if (type === "warning") iconClass = "fa-exclamation-triangle";

    toast.innerHTML = `
        <i class="fa-solid ${iconClass} toast-icon"></i>
        <div class="toast-content">${message}</div>
    `;
    
    container.appendChild(toast);
    
    // Fechar automaticamente
    setTimeout(() => {
        toast.style.animation = "toastSlideIn 0.2s reverse forwards";
        setTimeout(() => {
            toast.remove();
        }, 200);
    }, 4000);
}
