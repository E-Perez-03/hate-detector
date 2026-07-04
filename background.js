// background.js

const PROXY_URL = "https://hatedetector.online/analyze";
const FEEDBACK_URL = "https://hatedetector.online/feedback"; 

const EXTENSION_API_KEY = "TZ3Yws6BqA_ZEZ_NornoaopeQtPpc8yvOnVzGBEyovM"; 

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "X-API-Key": EXTENSION_API_KEY
  };
}

const FETCH_TIMEOUT_MS = 15000;


async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("El servidor tardó demasiado en responder. Intenta nuevamente.");
    }
    throw new Error("No se pudo conectar con el servidor. Revisa tu conexión.");
  } finally {
    clearTimeout(timer);
  }
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // ── 1. Análisis de texto ──────────────────────────────────────────────────
  if (request.type === "CLASSIFY_TEXT") {
    (async () => {
      try {
        const { text, url } = request;

        if (!text || text.trim().length === 0) {
          throw new Error("No hay texto para analizar.");
        }

        console.log("[BG] Iniciando análisis en servidor propio...");
        const result = await analyzeViaProxy(text, url);
        sendResponse({ ok: true, data: result });

      } catch (err) {
        console.error("[BG] Error crítico:", err.message);
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true; 
  }

  // ── 2. Feedback like / dislike ────────────────────────────────────────────
  if (request.type === "SEND_FEEDBACK") {
    (async () => {
      try {
        const { payload } = request;

        console.log("[BG] Enviando feedback:", payload);

        const res = await fetchWithTimeout(FEEDBACK_URL, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        sendResponse({ ok: true });

      } catch (err) {
        console.error("[BG] Error enviando feedback:", err.message);
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true; // Canal abierto para respuesta asíncrona
  }

});

// Función de comunicación con el Servidor (Proxy)
async function analyzeViaProxy(fullText, pageUrl) {
  const storage = await chrome.storage.local.get("selectedModel");
  const modelToUse = storage.selectedModel || "beto-hate-v3";

  console.log("[BG] Usando modelo:", modelToUse);
  
  const res = await fetchWithTimeout(PROXY_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ 
      text: fullText, 
      url: pageUrl,
      model: modelToUse
    })
  });

  if (!res.ok) throw new Error(`Error en la respuesta del servidor (HTTP ${res.status})`);
  return await res.json();
}
