// background.js

const PROXY_URL = "https://hatedetector.online/analyze";
// Permite abrir el panel lateral al hacer clic en el icono de la extensión
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));
// 1. Escucha de mensajes desde el popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "CLASSIFY_TEXT") {
    // Ejecución asíncrona para no bloquear el hilo principal
    (async () => {
      try {
        const { text, url } = request;

        // Validamos que haya contenido para enviar
        if (!text || text.trim().length === 0) {
          throw new Error("No hay texto para analizar.");
        }

        console.log("[BG] Iniciando análisis en servidor propio...");
        
        // 2. Llamada a la función del Proxy
        const result = await analyzeViaProxy(text, url);

        // Enviamos la respuesta de vuelta al popup
        sendResponse({ ok: true, data: result });

      } catch (err) {
        console.error("[BG] Error crítico:", err.message);
        sendResponse({ ok: false, error: err.message });
      }
    })();

    // Mantiene el canal de comunicación abierto para la respuesta del fetch
    return true; 
  }
});

// 3. Función de comunicación con el Servidor (Proxy)
async function analyzeViaProxy(fullText, pageUrl) {
  // 1. Obtenemos el modelo guardado (si no hay, usamos beto por defecto)
  const storage = await chrome.storage.local.get("selectedModel");
  const modelToUse = storage.selectedModel || "beto-hate-v3";

  console.log("[BG] Usando modelo:", modelToUse);
  
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      text: fullText, 
      url: pageUrl,
      model: modelToUse // <--- Enviamos el ID del modelo
    })
  });

  if (!res.ok) throw new Error("Error en la respuesta del servidor");
  return await res.json();
}