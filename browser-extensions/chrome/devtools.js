// Create the GxP DevTools panel
chrome.devtools.panels.create(
  "GxP Inspector",           // Panel title
  "icons/gx_on_32.png",      // Icon path (32x32)
  "panel.html",              // Panel HTML page
  function(panel) {
    // Panel created callback
    console.log("GxP Inspector panel created");

    // Optional: Handle panel show/hide events
    panel.onShown.addListener(function(panelWindow) {
      // Panel is now visible
      // Send message to panel that it's shown
      if (panelWindow.panelShown) {
        panelWindow.panelShown();
      }
    });

    panel.onHidden.addListener(function() {
      // Panel is now hidden
    });
  }
);
