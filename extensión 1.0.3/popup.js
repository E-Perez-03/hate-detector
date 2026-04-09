// popup.js
let thresholds = { low: 0.03, high: 0.07 };

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
});

function initTabs() {
  const btns = document.querySelectorAll(".tab-btn");
  const panes = document.querySelectorAll(".tab-pane");

  if (btns.length === 0) console.warn("¡Ojo! No encontré botones con la clase .tab-btn");

  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-target");

      // A. Quitamos la clase active de todos los botones
      btns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // B. Ocultamos TODOS los paneles manualmente para mayor seguridad
      panes.forEach(pane => {
        pane.classList.remove("active");
        pane.style.display = "none"; 
      });

      // C. Mostramos SOLAMENTE el panel elegido
      const activePane = document.getElementById(target);
      if (activePane) {
        activePane.classList.add("active");
        activePane.style.display = "block";
      }
    });
  });
}

function switchTab(targetId) {
  // Ocultar todos los paneles
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
    pane.style.display = 'none'; 
  });

  // Mostrar solo el seleccionado
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
            // ESTO DEVUELVE EL FOCO A LA PRIMERA VENTANA
            const tabAnalisisBtn = document.querySelector('.tab-btn[data-target="tab-analisis"]');
            if (tabAnalisisBtn) tabAnalisisBtn.click();
        };

        if (btnClose) btnClose.onclick = closeModal;
        
        // Cerrar si hacen clic en el fondo oscuro
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
        
        // Insertar el texto limpio mientras analiza
        if (resultDiv) resultDiv.textContent = pageText;
        updateTextStats(pageText);

        chrome.runtime.sendMessage({
            type: "CLASSIFY_TEXT",
            text: pageText,
            url: pageUrl // Enviamos URL real
        }, (response) => {
            // PROTECCIÓN AL VOLVER DEL SERVIDOR
            if (loadingBall) loadingBall.style.display = "none";

            if (response && response.ok) {
                if (state) state.textContent = "[Texto analizado]";
                paintBlocks(response.data);
                
                // LLAMADA A LA NUEVA FUNCIÓN DE COLOREADO
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
  
  // Retornamos texto y URL
  return {
      text: result,
      url: tab.url
  };
}

function paintBlocks(data) {
    const cont = document.getElementById("blocks");
    if (!cont) return;
    
    cont.innerHTML = ""; // Limpiar resultados anteriores
    
    // Extraer el array de bloques
    let blocks = [];
    if (Array.isArray(data)) {
        blocks = data;
    } else if (data && data.blocks && Array.isArray(data.blocks)) {
        blocks = data.blocks;
    }

    console.log("Total de bloques recibidos:", blocks.length); 

    // Ordenar por score (Mayor odio arriba)
    blocks.sort((a, b) => b.score - a.score);

    blocks.forEach(b => {
        let sev = "ok";
        if (b.score >= thresholds.high) sev = "err";
        else if (b.score >= thresholds.low) sev = "warn";

        const row = document.createElement("div");
        row.className = `block-row ${sev}`; 
        
        row.innerHTML = `
            <div class="cell idx">#${b.i}</div>
            <div class="cell score ${sev}">${(b.score * 100).toFixed(1)}%</div>
            <div class="cell text">${b.text}</div>
        `;
        cont.appendChild(row);
    });

    if (blocks.length === 0) {
        cont.innerHTML = "<p style='text-align:center; font-size:12px; color:gray;'>No se detectaron bloques de texto.</p>";
    }
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
    alert("Configuración guardada correctamenete")
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
// NUEVAS FUNCIONES PARA EL COLOREADO
// ==========================================

function highlightText(fullText, data) {
    const resultDiv = document.getElementById("result");
    if (!resultDiv) return;

    let blocks = [];
    if (Array.isArray(data)) blocks = data;
    else if (data && data.blocks && Array.isArray(data.blocks)) blocks = data.blocks;

    if (blocks.length === 0) return;

    // Ordenamos los bloques por dónde empiezan en el texto
    blocks.sort((a, b) => a.start - b.start);

    let highlightedHTML = "";
    let lastEnd = 0;

    blocks.forEach(b => {
        // Rellenar huecos de texto que no fue analizado
        if (b.start > lastEnd) {
            highlightedHTML += escapeHTML(fullText.substring(lastEnd, b.start));
        }

        // Definir color según el score y tus umbrales
        let bgColor = "transparent";
        let textColor = "inherit";
        
        if (b.score >= thresholds.high) {
            bgColor = "#ffcccc"; // Fondo rojo pastel
            textColor = "#990000"; // Letra roja oscura
        } else if (b.score >= thresholds.low) {
            bgColor = "#fff2cc"; // Fondo amarillo pastel
            textColor = "#b38600"; // Letra mostaza
        }

        // Extraer la frase exacta
        let chunkText = escapeHTML(fullText.substring(b.start, b.end));

        // Poner la etiqueta <mark> si tiene odio
        if (bgColor !== "transparent") {
            highlightedHTML += `<mark style="background-color: ${bgColor}; color: ${textColor}; border-radius: 4px; padding: 1px 3px; font-weight: 500; display: inline-block;">${chunkText}</mark>`;
        } else {
            highlightedHTML += chunkText;
        }

        lastEnd = b.end;
    });

    // Añadir lo que quede de texto al final
    if (lastEnd < fullText.length) {
        highlightedHTML += escapeHTML(fullText.substring(lastEnd));
    }

    // Convertir los saltos de línea de texto a saltos de línea HTML
    highlightedHTML = highlightedHTML.replace(/\n/g, "<br><br>");

    // Inyectar el texto coloreado
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