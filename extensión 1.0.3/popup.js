// popup.js
let thresholds = { low: 0.03, high: 0.07 };

// Estado global de bloques y ordenamiento
let currentBlocks  = [];
let currentPageUrl = "";
let currentOrder   = "desc"; // "desc" | "asc" | "original"

document.addEventListener("DOMContentLoaded", () => {
    console.log("Popup cargado y listo.");
    
    // 1. Cargar configuración guardada
    loadConfig();
    
    // 2. Inicializar Pestañas
    initTabs();
    
    // 3. Inicializar Modal Acerca de
    initModal();

    // 4. VINCULACIÓN DEL BOTÓN PRINCIPAL (Con verificación)
    const btnExtract = document.getElementById("btnExtract");
    if (btnExtract) {
        btnExtract.onclick = analyze; 
        console.log("Botón 'Extraer' vinculado con éxito.");
    } else {
      console.error("Error: No se encontró el botón con ID 'btnExtract'");
    }

    // 5. VINCULACIÓN BOTÓN GUARDAR
    const btnSave = document.getElementById("btnSaveConfig");
    if (btnSave) {
        btnSave.onclick = saveConfig;
    }

    const btnLogs = document.getElementById("btnLogs");
    if (btnLogs) {
        btnLogs.onclick = () => {
            chrome.tabs.create({ url: "https://hatedetector.online/" });
        };
    }

    const btnSurvey = document.getElementById("btnSurvey");
    if (btnSurvey) {
        btnSurvey.onclick = () => {
            chrome.tabs.create({ url: "https://forms.gle/fFihAmYejmQ1hztK8" });
        };
    }

    // 6. BOTONES DE ORDENAMIENTO
    initSortButtons();
});

function initTabs() {
  const btns = document.querySelectorAll(".tab-btn");
  const panes = document.querySelectorAll(".tab-pane");

  if (btns.length === 0) console.warn("¡Ojo! No encontré botones con la clase .tab-btn");

  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-target");

      btns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      panes.forEach(pane => {
        pane.classList.remove("active");
        pane.style.display = "none"; 
      });

      const activePane = document.getElementById(target);
      if (activePane) {
        activePane.classList.add("active");
        activePane.style.display = "block";
      }
    });
  });
}

function switchTab(targetId) {
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
    pane.style.display = 'none'; 
  });

  const activePane = document.getElementById(targetId);
  if (activePane) {
    activePane.classList.add('active');
    activePane.style.display = 'block';
  }
}

function initModal() {
    const modal = document.getElementById("modalAbout");
    const btnAbout = document.querySelector('.tab-btn[data-target="modalAbout"]');
    const btnClose = document.getElementById("btnAboutClose");

    if (btnAbout && modal) {
        btnAbout.onclick = (e) => {
            e.preventDefault();
            modal.style.display = "block";
        };

        const closeModal = () => {
            modal.style.display = "none";
            const tabAnalisisBtn = document.querySelector('.tab-btn[data-target="tab-analisis"]');
            if (tabAnalisisBtn) tabAnalisisBtn.click();
        };

        if (btnClose) btnClose.onclick = closeModal;
        
        window.onclick = (event) => {
            if (event.target == modal) closeModal();
        };
    }
}

async function analyze() {
    const state = document.getElementById("proxyState");
    const loadingBall = document.getElementById("loadingBall"); 
    const resultDiv = document.getElementById("result");

    try {
        if (state) state.textContent = "Analizando...";
        if (loadingBall) loadingBall.style.display = "inline-block";
        
        const pageData = await extractTextFromPage();
        const pageText = pageData.text;
        const pageUrl = pageData.url;
        
        if (resultDiv) resultDiv.textContent = pageText;
        updateTextStats(pageText);

        chrome.runtime.sendMessage({
            type: "CLASSIFY_TEXT",
            text: pageText,
            url: pageUrl
        }, (response) => {
            if (loadingBall) loadingBall.style.display = "none";

            if (response && response.ok) {
                if (state) state.textContent = "[Texto analizado]";
                paintBlocks(response.data, pageUrl);
                highlightText(pageText, response.data);
            } else {
                if (state) state.textContent = "ERROR SERVIDOR";
            }
        });
    } catch (err) {
        if (loadingBall) loadingBall.style.display = "none";
        if (state) state.textContent = "ERROR: " + err.message;
    }
}

async function extractTextFromPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.body.innerText.slice(0, 25000)
  });
  
  return {
      text: result,
      url: tab.url
  };
}

// ==========================================
// SISTEMA DE LIKE / DISLIKE
// ==========================================

/**
 * Envía el reporte de feedback al servidor.
 * El servidor debe recibir un POST con JSON y guardarlo en un CSV.
 * Campos: timestamp, url, block_index, score, text, feedback (like|dislike)
 */
function sendFeedback(blockData, pageUrl, feedback) {
    const payload = {
        timestamp: new Date().toISOString(),
        url: pageUrl,
        block_index: blockData.i,
        score: blockData.score,
        text: blockData.text,
        feedback: feedback  // "like" o "dislike"
    };

    chrome.runtime.sendMessage({
        type: "SEND_FEEDBACK",
        payload: payload
    }, (response) => {
        if (response && response.ok) {
            console.log(`[Feedback] ${feedback} enviado para bloque #${blockData.i}`);
        } else {
            console.warn(`[Feedback] Error al enviar: ${response?.error}`);
        }
    });
}

/**
 * Crea los iconos de like/dislike para insertar DENTRO del block-row.
 * Estilo emoji, sin caja ni borde.
 */
function createFeedbackButtons(blockData, pageUrl) {
    const wrapper = document.createElement("div");
    wrapper.className = "fb-icons";

    const likeBtn = document.createElement("button");
    likeBtn.className = "fb-icon-btn fb-like";
    likeBtn.title = "Clasificación correcta";
    likeBtn.textContent = "👍";

    const dislikeBtn = document.createElement("button");
    dislikeBtn.className = "fb-icon-btn fb-dislike";
    dislikeBtn.title = "Clasificación incorrecta";
    dislikeBtn.textContent = "👎";

    function handleFeedback(selected, other, value) {
        if (wrapper.dataset.voted === "true") return;
        wrapper.dataset.voted = "true";

        selected.classList.add("fb-icon-voted");
        other.classList.add("fb-icon-faded");
        other.disabled = true;

        sendFeedback(blockData, pageUrl, value);
    }

    likeBtn.onclick    = () => handleFeedback(likeBtn,    dislikeBtn, "like");
    dislikeBtn.onclick = () => handleFeedback(dislikeBtn, likeBtn,    "dislike");

    wrapper.appendChild(likeBtn);
    wrapper.appendChild(dislikeBtn);
    return wrapper;
}

// ==========================================
// ORDENAMIENTO DE BLOQUES
// ==========================================

function initSortButtons() {
    document.querySelectorAll(".sort-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            currentOrder = btn.dataset.order;

            // Marcar activo
            document.querySelectorAll(".sort-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            // Re-renderizar con el nuevo orden
            renderBlocks();
        });
    });
}

// ==========================================
// PINTAR BLOQUES (con feedback FUERA del cuadro)
// ==========================================

/**
 * paintBlocks: guarda los datos y delega el render a renderBlocks().
 */
function paintBlocks(data, pageUrl) {
    currentPageUrl = pageUrl;

    if (Array.isArray(data)) {
        currentBlocks = data;
    } else if (data && data.blocks && Array.isArray(data.blocks)) {
        currentBlocks = data.blocks;
    } else {
        currentBlocks = [];
    }

    console.log("Total de bloques recibidos:", currentBlocks.length);

    // Mostrar la barra de orden solo si hay bloques
    const sortBar = document.getElementById("sort-bar");
    if (sortBar) sortBar.style.display = currentBlocks.length > 0 ? "flex" : "none";

    // Resetear al orden por defecto (mayor → menor) en cada nuevo análisis
    currentOrder = "desc";
    document.querySelectorAll(".sort-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.order === "desc");
    });

    renderBlocks();
}

/**
 * renderBlocks: ordena currentBlocks según currentOrder y los pinta.
 */
function renderBlocks() {
    const cont = document.getElementById("blocks");
    if (!cont) return;

    cont.innerHTML = "";

    if (currentBlocks.length === 0) {
        cont.innerHTML = "<p style='text-align:center; font-size:12px; color:gray;'>No se detectaron bloques de texto.</p>";
        return;
    }

    // Copia para no mutar el array original
    const sorted = [...currentBlocks];

    if (currentOrder === "desc") {
        sorted.sort((a, b) => b.score - a.score);
    } else if (currentOrder === "asc") {
        sorted.sort((a, b) => a.score - b.score);
    } else {
        // "original": orden por índice del servidor
        sorted.sort((a, b) => a.i - b.i);
    }

    // ¿Hay algún bloque que supere el umbral y muestre feedback?
    const hasFeedback = sorted.some(b => b.score >= thresholds.low);

    // Encabezado de columna: una sola vez, alineado sobre los iconos
    if (hasFeedback) {
        const header = document.createElement("div");
        header.className = "block-wrapper fb-header-row";
        header.innerHTML = `
            <div class="fb-header-spacer"></div>
            <div class="fb-header-label">Human<br>in the<br>loop<loop</div>
        `;
        cont.appendChild(header);
    }

    sorted.forEach(b => {
        let sev = "ok";
        if (b.score >= thresholds.high) sev = "err";
        else if (b.score >= thresholds.low) sev = "warn";

        // Wrapper externo: agrupa el bloque coloreado y los iconos fuera de él
        const wrapper = document.createElement("div");
        wrapper.className = "block-wrapper";

        const row = document.createElement("div");
        row.className = `block-row ${sev}`;
        row.innerHTML = `
            <div class="cell idx">#${b.i}</div>
            <div class="cell score ${sev}">${(b.score * 100).toFixed(1)}%</div>
            <div class="cell text">${b.text}</div>
        `;

        wrapper.appendChild(row);

        // Iconos fuera del bloque coloreado, alineados a la derecha del wrapper
        if (b.score >= thresholds.low) {
            wrapper.appendChild(createFeedbackButtons(b, currentPageUrl));
        }

        cont.appendChild(wrapper);
    });
}

function loadConfig() {
  chrome.storage.local.get(["low", "high", "selectedModel"], (res) => {
    if (res.low) { thresholds.low = parseFloat(res.low)/100;
        document.getElementById("inputLow").value = res.low; }
    if (res.high) { thresholds.high = parseFloat(res.high)/100;
        document.getElementById("inputHigh").value = res.high; }
    if (res.selectedModel){
        document.getElementById("modelSelect").value = res.selectedModel;
    }
    });
}

function saveConfig() {
  const modelVal = document.getElementById("modelSelect").value; 
  const highVal = document.getElementById("inputHigh").value;
  const lowVal = document.getElementById("inputLow").value;
  chrome.storage.local.set({ 
    low: lowVal,
    high: highVal,
    selectedModel: modelVal 
  }, () => {
    thresholds.low = parseFloat(lowVal) /100;
    thresholds.high = parseFloat(highVal) /100;
    alert("Configuración guardada correctamente");
  });
}

function updateTextStats(text) {
    const charCountEl = document.getElementById("charCount");
    const wordCountEl = document.getElementById("wordCount");

    if (charCountEl && wordCountEl) {
        const charCount = text.length;
        const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

        charCountEl.textContent = charCount.toLocaleString(); 
        wordCountEl.textContent = wordCount.toLocaleString();
    }
}

// ==========================================
// COLOREADO DE TEXTO
// ==========================================

function highlightText(fullText, data) {
    const resultDiv = document.getElementById("result");
    if (!resultDiv) return;

    let blocks = [];
    if (Array.isArray(data)) blocks = data;
    else if (data && data.blocks && Array.isArray(data.blocks)) blocks = data.blocks;

    if (blocks.length === 0) return;

    blocks.sort((a, b) => a.start - b.start);

    let highlightedHTML = "";
    let lastEnd = 0;

    blocks.forEach(b => {
        if (b.start > lastEnd) {
            highlightedHTML += escapeHTML(fullText.substring(lastEnd, b.start));
        }

        let bgColor = "transparent";
        let textColor = "inherit";
        
        if (b.score >= thresholds.high) {
            bgColor = "#ffcccc";
            textColor = "#990000";
        } else if (b.score >= thresholds.low) {
            bgColor = "#fff2cc";
            textColor = "#b38600";
        }

        let chunkText = escapeHTML(fullText.substring(b.start, b.end));

        if (bgColor !== "transparent") {
            highlightedHTML += `<mark style="background-color: ${bgColor}; color: ${textColor}; border-radius: 4px; padding: 1px 3px; font-weight: 500; display: inline-block;">${chunkText}</mark>`;
        } else {
            highlightedHTML += chunkText;
        }

        lastEnd = b.end;
    });

    if (lastEnd < fullText.length) {
        highlightedHTML += escapeHTML(fullText.substring(lastEnd));
    }

    highlightedHTML = highlightedHTML.replace(/\n/g, "<br><br>");
    resultDiv.innerHTML = highlightedHTML;
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
