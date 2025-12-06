// Create the GxP DevTools panel
// Firefox uses the same API as Chrome for creating panels
browser.devtools.panels.create(
  "GxP Inspector",           // Panel title
  "icons/gx_on_32.png",      // Icon path (32x32)
  "panel.html"               // Panel HTML page
).then(function(panel) {
  // Panel created callback
  console.log("GxP Inspector panel created");

  // Optional: Handle panel show/hide events
  panel.onShown.addListener(function(panelWindow) {
    // Panel is now visible
    if (panelWindow.panelShown) {
      panelWindow.panelShown();
    }
  });

  panel.onHidden.addListener(function() {
    // Panel is now hidden
  });
}).catch(function(error) {
  console.error("Failed to create GxP Inspector panel:", error);
});
