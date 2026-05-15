// background.js

const PROXY_URL = "https://hatedetector.online/analyze";
const FEEDBACK_URL = "https://hatedetector.online/feedback"; // Endpoint CSV en tu servidor

// Permite abrir el panel lateral al hacer clic en el icono de la extensión
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Escucha de mensajes desde popup.js
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
    return true; // Canal abierto para respuesta asíncrona
  }

  // ── 2. Feedback like / dislike ────────────────────────────────────────────
  if (request.type === "SEND_FEEDBACK") {
    (async () => {
      try {
        const { payload } = request;

        console.log("[BG] Enviando feedback:", payload);

        const res = await fetch(FEEDBACK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
          /*
            Estructura del payload que llega al servidor:
            {
              timestamp:   "2026-05-09T14:32:00.000Z",  // ISO 8601 UTC
              url:         "https://ejemplo.com/noticia",
              block_index: 3,
              score:       0.87,
              text:        "Texto del bloque analizado...",
              feedback:    "like" | "dislike"
            }

            El servidor debe agregar una fila al CSV con estos campos.
            Ejemplo de fila CSV resultante:
            2026-05-09T14:32:00.000Z,"https://ejemplo.com/noticia",3,0.87,"Texto del bloque","dislike"
          */
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
  
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      text: fullText, 
      url: pageUrl,
      model: modelToUse
    })
  });

  if (!res.ok) throw new Error("Error en la respuesta del servidor");
  return await res.json();
}
