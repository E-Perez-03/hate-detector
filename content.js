// content.js
(function() {
  // Evitar múltiples inyecciones
  if (window.hasHateDetectorInjected) return;
  window.hasHateDetectorInjected = true;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extractText") {
      try {
        // 1. Clonamos el cuerpo para no afectar la web original
        const bodyClone = document.body.cloneNode(true);

        // 2. Limpieza de elementos que ensucian el texto
        const selector = "script, style, nav, footer, header, noscript, iframe, ad, .ads";
        bodyClone.querySelectorAll(selector).forEach(el => el.remove());

        // 3. Obtención de texto
        let rawText = bodyClone.innerText || bodyClone.textContent || "";

     
        const cleanText = rawText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join('\n');

        sendResponse({ 
          text: cleanText, 
          url: window.location.href 
        });
      } catch (err) {
        console.error("Error en extracción:", err);
        sendResponse({ text: "Error al extraer contenido", url: window.location.href });
      }
    }
    return true; 
  });
})();