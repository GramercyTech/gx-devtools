/**
 * GxP Component Inspector
 *
 * Browser extension content script that provides:
 * - Component highlighting on hover
 * - Vue component detection
 * - String extraction panel
 * - File editing via Vite dev server API
 *
 * This script injects itself into the page's main world so that
 * DevTools panel can access window.gxpInspector via eval().
 */

// Check if we're in the page context (already injected) vs content script context
// In page context, neither 'browser' nor 'chrome' runtime APIs are available
const isContentScriptContext = (typeof browser !== 'undefined' && browser.runtime) ||
                                (typeof chrome !== 'undefined' && chrome.runtime);

if (isContentScriptContext && typeof window.__gxpInspectorInjected === 'undefined') {
  // We're in the content script context - inject into page
  const runtime = typeof browser !== 'undefined' ? browser : chrome;
  const script = document.createElement('script');
  script.src = runtime.runtime.getURL('inspector.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);

  // Also set up message relay from page to extension
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'GXP_INSPECTOR_MESSAGE') {
      runtime.runtime.sendMessage(event.data.payload);
    }
  });

  // Mark that content script has run (for content script context)
  window.__gxpInspectorContentScriptLoaded = true;
}

// Mark as injected (for both contexts)
window.__gxpInspectorInjected = true;

(function () {
  'use strict';

  // If gxpInspector already exists, we're done (prevent double init)
  if (window.gxpInspector) {
    return;
  }

  // Configuration
  const DEV_SERVER_URL = 'https://localhost:3060';
  const API_PREFIX = '/__gxp-inspector';

  // State
  let inspectorEnabled = false;
  let highlightOverlay = null;
  let inspectorPanel = null;
  let selectedElement = null;
  let hoveredElement = null;
  let selectionHighlight = null; // Persistent highlight for selected element

  // ============================================================
  // API Communication
  // ============================================================

  async function apiCall(endpoint, options = {}) {
    const url = `${DEV_SERVER_URL}${API_PREFIX}${endpoint}`;
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      return await response.json();
    } catch (error) {
      console.error('[GxP Inspector] API Error:', error);
      return { success: false, error: error.message };
    }
  }

  async function ping() {
    return apiCall('/ping');
  }

  async function extractString(data) {
    return apiCall('/extract-string', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async function getStrings() {
    return apiCall('/strings');
  }

  // ============================================================
  // Vue Component Detection
  // ============================================================

  function getVueInstance(el) {
    // Vue 3 detection
    if (el.__vueParentComponent) {
      return el.__vueParentComponent;
    }
    // Walk up to find Vue component
    let current = el;
    while (current) {
      if (current.__vueParentComponent) {
        return current.__vueParentComponent;
      }
      current = current.parentElement;
    }
    return null;
  }

  function getComponentInfo(vueInstance) {
    if (!vueInstance) return null;

    const type = vueInstance.type;
    const name = type?.name || type?.__name || type?.__file?.split('/').pop()?.replace('.vue', '') || 'Anonymous';
    const file = type?.__file || null;

    // Helper to safely serialize a value (handles circular refs, functions, etc.)
    function safeSerialize(value) {
      if (value === null || value === undefined) return value;
      if (typeof value === 'function') return '[Function]';
      if (typeof value !== 'object') return value;

      try {
        // Try JSON stringify/parse to get a clean copy
        return JSON.parse(JSON.stringify(value));
      } catch {
        // If that fails, return a string representation
        if (Array.isArray(value)) return `[Array(${value.length})]`;
        return '{...}';
      }
    }

    // Get props
    const props = {};
    if (vueInstance.props) {
      Object.keys(vueInstance.props).forEach(key => {
        props[key] = safeSerialize(vueInstance.props[key]);
      });
    }

    // Get component data/state
    const data = {};
    if (vueInstance.setupState) {
      Object.keys(vueInstance.setupState).forEach(key => {
        const value = vueInstance.setupState[key];
        if (typeof value !== 'function') {
          data[key] = safeSerialize(value);
        }
      });
    }

    return { name, file, props, data };
  }

  function getTextContent(el) {
    // Get direct text content, excluding child elements
    const texts = [];
    el.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) texts.push(text);
      }
    });
    return texts;
  }

  /**
   * Check if an element has a gxp-string attribute (indicating it's already extracted)
   */
  function getGxpStringKey(el) {
    return el?.getAttribute?.('gxp-string') || null;
  }

  /**
   * Check for a data-gxp-expr attribute on the element
   * The vite-source-tracker-plugin adds this attribute in dev mode
   * @param {Element} el - The element to check
   * @returns {string|null} - The source expression or null
   */
  function getGxpSourceExpression(el) {
    if (!el || !el.getAttribute) return null;
    return el.getAttribute('data-gxp-expr') || null;
  }

  /**
   * Get text content with gxp-string attribute info
   * Returns array of objects: { text, gxpStringKey, isExtracted, sourceExpression, isDynamic }
   */
  function getTextContentWithAttributes(el) {
    const results = [];

    // Check if this element itself has gxp-string
    const elementKey = getGxpStringKey(el);
    // Check for data-gxp-source attribute (injected by vite plugin for {{ expressions }})
    const sourceExpression = getGxpSourceExpression(el);

    el.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) {
          results.push({
            text: text,
            gxpStringKey: elementKey,
            isExtracted: elementKey !== null,
            sourceExpression: sourceExpression,
            isDynamic: sourceExpression !== null
          });
        }
      }
    });

    return results;
  }

  /**
   * Find all child elements with gxp-string attributes
   */
  function findChildGxpStrings(el) {
    const strings = [];
    const elements = el.querySelectorAll('[gxp-string]');

    elements.forEach(child => {
      const key = child.getAttribute('gxp-string');
      const text = child.textContent.trim();
      if (key && text) {
        strings.push({
          key: key,
          text: text,
          element: child.tagName.toLowerCase()
        });
      }
    });

    return strings;
  }

  /**
   * Analyze text content to detect if it comes from getString() calls
   * Returns an array of text info objects with type: 'raw' or 'getString'
   */
  function analyzeTextContent(el, vueInstance) {
    const textInfos = [];
    const texts = getTextContent(el);

    // Get the component's source info to help detect getString usage
    const componentFile = vueInstance?.type?.__file || null;

    // Try to detect getString calls by checking if this element's text
    // is likely from a getString call. We look for patterns in the rendered output
    // and can cross-reference with the app-manifest.json via API later.

    texts.forEach((text, index) => {
      // Default to raw text
      const textInfo = {
        text: text,
        type: 'raw',
        index: index
      };

      // We'll mark it as potentially from getString if we can detect it
      // The panel will verify against the manifest
      textInfos.push(textInfo);
    });

    return textInfos;
  }

  /**
   * Try to find getString calls in the Vue component by inspecting
   * the component's template bindings (if accessible)
   */
  function findGetStringCalls(vueInstance, filePath) {
    const getStringCalls = [];

    if (!vueInstance) return getStringCalls;

    // Check setupState for gxpStore reference
    const hasGxpStore = vueInstance.setupState?.gxpStore !== undefined;

    // We can't directly see the template, but we can check for gxpStore usage
    // The actual verification happens on the server side by checking the source file

    return { hasGxpStore, getStringCalls };
  }

  // ============================================================
  // Overlay UI
  // ============================================================

  function createHighlightOverlay() {
    if (highlightOverlay) return highlightOverlay;

    highlightOverlay = document.createElement('div');
    highlightOverlay.id = 'gxp-inspector-highlight';

    const style = document.createElement('style');
    style.id = 'gxp-highlight-style';
    style.textContent = `
      /* Pointer cursor when in selection mode */
      body.gxp-inspector-selecting,
      body.gxp-inspector-selecting * {
        cursor: crosshair !important;
      }
      #gxp-inspector-highlight {
        position: fixed;
        pointer-events: none;
        z-index: 999999;
        display: none;
        border: 2px dashed #f59e0b;
        background: rgba(245, 158, 11, 0.1);
        border-radius: 4px;
        box-shadow: 0 0 8px rgba(245, 158, 11, 0.4);
      }
      #gxp-inspector-highlight .gxp-highlight-label {
        position: absolute;
        top: -24px;
        left: -2px;
        background: #f59e0b;
        color: #1e1e1e;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 3px 3px 0 0;
        white-space: nowrap;
      }
    `;

    highlightOverlay.innerHTML = `<div class="gxp-highlight-label"></div>`;

    if (!document.getElementById('gxp-highlight-style')) {
      document.head.appendChild(style);
    }
    document.body.appendChild(highlightOverlay);
    return highlightOverlay;
  }

  function updateHighlight(el) {
    if (!el || !highlightOverlay) return;

    const rect = el.getBoundingClientRect();
    const label = highlightOverlay.querySelector('.gxp-highlight-label');

    // Position the highlight overlay directly
    highlightOverlay.style.display = 'block';
    highlightOverlay.style.left = `${rect.left}px`;
    highlightOverlay.style.top = `${rect.top}px`;
    highlightOverlay.style.width = `${rect.width}px`;
    highlightOverlay.style.height = `${rect.height}px`;

    // Build label: Component::element::gxp-string-key
    label.textContent = buildElementLabel(el);
  }

  function hideHighlight() {
    if (highlightOverlay) {
      highlightOverlay.style.display = 'none';
    }
  }

  // ============================================================
  // Selection Highlight (persistent border on selected element)
  // ============================================================

  function createSelectionHighlight() {
    if (selectionHighlight) return selectionHighlight;

    selectionHighlight = document.createElement('div');
    selectionHighlight.id = 'gxp-inspector-selection';

    const style = document.createElement('style');
    style.id = 'gxp-selection-style';
    style.textContent = `
      #gxp-inspector-selection {
        position: fixed;
        pointer-events: none;
        z-index: 999998;
        display: none;
        border: 3px solid #61dafb;
        background: rgba(97, 218, 251, 0.1);
        border-radius: 4px;
        box-shadow: 0 0 0 1px rgba(97, 218, 251, 0.3),
                    0 0 12px 3px rgba(97, 218, 251, 0.5),
                    0 0 24px 6px rgba(97, 218, 251, 0.25),
                    inset 0 0 20px rgba(97, 218, 251, 0.1);
        animation: gxp-selection-pulse 2s ease-in-out infinite;
      }
      #gxp-inspector-selection .gxp-selection-label {
        position: absolute;
        top: -26px;
        left: -3px;
        background: #61dafb;
        color: #1e1e1e;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 11px;
        font-weight: 600;
        padding: 3px 10px;
        border-radius: 4px 4px 0 0;
        white-space: nowrap;
        box-shadow: 0 0 10px rgba(97, 218, 251, 0.6);
      }
      @keyframes gxp-selection-pulse {
        0%, 100% {
          box-shadow: 0 0 0 1px rgba(97, 218, 251, 0.3),
                      0 0 12px 3px rgba(97, 218, 251, 0.5),
                      0 0 24px 6px rgba(97, 218, 251, 0.25),
                      inset 0 0 20px rgba(97, 218, 251, 0.1);
        }
        50% {
          box-shadow: 0 0 0 2px rgba(97, 218, 251, 0.5),
                      0 0 20px 5px rgba(97, 218, 251, 0.7),
                      0 0 40px 10px rgba(97, 218, 251, 0.35),
                      inset 0 0 30px rgba(97, 218, 251, 0.15);
        }
      }
    `;

    selectionHighlight.innerHTML = `<div class="gxp-selection-label"></div>`;

    if (!document.getElementById('gxp-selection-style')) {
      document.head.appendChild(style);
    }
    document.body.appendChild(selectionHighlight);
    return selectionHighlight;
  }

  function updateSelectionHighlight(el) {
    if (!el) {
      hideSelectionHighlight();
      return;
    }

    createSelectionHighlight();
    const rect = el.getBoundingClientRect();
    const label = selectionHighlight.querySelector('.gxp-selection-label');

    // Position the main overlay element directly
    selectionHighlight.style.display = 'block';
    selectionHighlight.style.left = `${rect.left}px`;
    selectionHighlight.style.top = `${rect.top}px`;
    selectionHighlight.style.width = `${rect.width}px`;
    selectionHighlight.style.height = `${rect.height}px`;

    // Build label: Component::element::gxp-string-key
    label.textContent = buildElementLabel(el);
  }

  function hideSelectionHighlight() {
    if (selectionHighlight) {
      selectionHighlight.style.display = 'none';
    }
  }

  // Update selection highlight position on scroll/resize
  function updateSelectionPosition() {
    if (selectedElement && selectionHighlight && selectionHighlight.style.display !== 'none') {
      updateSelectionHighlight(selectedElement);
    }
  }

  // ============================================================
  // Inspector Panel
  // ============================================================

  function createInspectorPanel() {
    if (inspectorPanel) return inspectorPanel;

    inspectorPanel = document.createElement('div');
    inspectorPanel.id = 'gxp-inspector-panel';
    inspectorPanel.innerHTML = `
      <div class="gxp-panel-header">
        <span class="gxp-panel-title">GxP Component Inspector</span>
        <button class="gxp-panel-close">&times;</button>
      </div>
      <div class="gxp-panel-content">
        <div class="gxp-panel-section gxp-component-info">
          <div class="gxp-section-title">Component</div>
          <div class="gxp-component-name">Click on an element to inspect</div>
          <div class="gxp-component-file"></div>
        </div>
        <div class="gxp-panel-section gxp-strings-section" style="display: none;">
          <div class="gxp-section-title">Text Content</div>
          <div class="gxp-strings-list"></div>
        </div>
        <div class="gxp-panel-section gxp-extract-section" style="display: none;">
          <div class="gxp-section-title">Extract String</div>
          <div class="gxp-extract-form">
            <div class="gxp-form-group">
              <label>Text:</label>
              <input type="text" class="gxp-extract-text" readonly>
            </div>
            <div class="gxp-form-group">
              <label>Key:</label>
              <input type="text" class="gxp-extract-key" placeholder="e.g., welcome_title">
            </div>
            <div class="gxp-form-group">
              <label>File:</label>
              <input type="text" class="gxp-extract-file" readonly>
            </div>
            <button class="gxp-extract-button">Extract to getString()</button>
          </div>
          <div class="gxp-extract-status"></div>
        </div>
        <div class="gxp-panel-section gxp-props-section" style="display: none;">
          <div class="gxp-section-title">Props</div>
          <pre class="gxp-props-content"></pre>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #gxp-inspector-panel {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 380px;
        max-height: 500px;
        background: #1e1e1e;
        border: 1px solid #3d3d3d;
        border-radius: 8px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        color: #e0e0e0;
        z-index: 999998;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .gxp-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: #2d2d2d;
        border-bottom: 1px solid #3d3d3d;
      }
      .gxp-panel-title {
        font-weight: 600;
        color: #61dafb;
      }
      .gxp-panel-close {
        background: none;
        border: none;
        color: #888;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        line-height: 1;
      }
      .gxp-panel-close:hover {
        color: #ff6b6b;
      }
      .gxp-panel-content {
        padding: 16px;
        overflow-y: auto;
        flex: 1;
      }
      .gxp-panel-section {
        margin-bottom: 16px;
      }
      .gxp-section-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        color: #888;
        margin-bottom: 8px;
      }
      .gxp-component-name {
        font-size: 15px;
        font-weight: 600;
        color: #61dafb;
        margin-bottom: 4px;
      }
      .gxp-component-file {
        font-size: 11px;
        color: #888;
        word-break: break-all;
      }
      .gxp-strings-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .gxp-string-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 10px;
        background: #2d2d2d;
        border-radius: 4px;
        cursor: pointer;
      }
      .gxp-string-item:hover {
        background: #3d3d3d;
      }
      .gxp-string-text {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .gxp-string-extract {
        background: #61dafb;
        color: #1e1e1e;
        border: none;
        padding: 4px 10px;
        border-radius: 3px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        margin-left: 8px;
      }
      .gxp-string-extract:hover {
        background: #4fc3f7;
      }
      .gxp-extract-form {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .gxp-form-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .gxp-form-group label {
        font-size: 11px;
        color: #888;
      }
      .gxp-form-group input {
        background: #2d2d2d;
        border: 1px solid #3d3d3d;
        border-radius: 4px;
        padding: 8px 10px;
        color: #e0e0e0;
        font-size: 12px;
      }
      .gxp-form-group input:focus {
        outline: none;
        border-color: #61dafb;
      }
      .gxp-extract-button {
        background: #28a745;
        color: white;
        border: none;
        padding: 10px 16px;
        border-radius: 4px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        margin-top: 8px;
      }
      .gxp-extract-button:hover {
        background: #218838;
      }
      .gxp-extract-button:disabled {
        background: #6c757d;
        cursor: not-allowed;
      }
      .gxp-extract-status {
        margin-top: 10px;
        padding: 10px;
        border-radius: 4px;
        font-size: 12px;
        display: none;
      }
      .gxp-extract-status.success {
        display: block;
        background: #28a74520;
        border: 1px solid #28a745;
        color: #28a745;
      }
      .gxp-extract-status.error {
        display: block;
        background: #dc354520;
        border: 1px solid #dc3545;
        color: #dc3545;
      }
      .gxp-props-content {
        background: #2d2d2d;
        padding: 10px;
        border-radius: 4px;
        font-size: 11px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        overflow-x: auto;
        max-height: 150px;
        margin: 0;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(inspectorPanel);

    // Event handlers
    inspectorPanel.querySelector('.gxp-panel-close').addEventListener('click', () => {
      disableInspector();
    });

    inspectorPanel.querySelector('.gxp-extract-button').addEventListener('click', handleExtract);

    return inspectorPanel;
  }

  function updatePanel(el) {
    if (!inspectorPanel || !el) return;

    const vueInstance = getVueInstance(el);
    const info = getComponentInfo(vueInstance);
    const texts = getTextContent(el);

    // Update component info
    const nameEl = inspectorPanel.querySelector('.gxp-component-name');
    const fileEl = inspectorPanel.querySelector('.gxp-component-file');

    if (info) {
      nameEl.textContent = `<${info.name}>`;
      fileEl.textContent = info.file || 'Unknown file';
    } else {
      nameEl.textContent = `<${el.tagName.toLowerCase()}>`;
      fileEl.textContent = 'Not a Vue component';
    }

    // Update strings list
    const stringsSection = inspectorPanel.querySelector('.gxp-strings-section');
    const stringsList = inspectorPanel.querySelector('.gxp-strings-list');

    if (texts.length > 0) {
      stringsSection.style.display = 'block';
      stringsList.innerHTML = texts.map(text => `
        <div class="gxp-string-item" data-text="${escapeHtml(text)}">
          <span class="gxp-string-text">${escapeHtml(text)}</span>
          <button class="gxp-string-extract">Extract</button>
        </div>
      `).join('');

      // Add click handlers
      stringsList.querySelectorAll('.gxp-string-item').forEach(item => {
        item.querySelector('.gxp-string-extract').addEventListener('click', (e) => {
          e.stopPropagation();
          showExtractForm(item.dataset.text, info?.file);
        });
      });
    } else {
      stringsSection.style.display = 'none';
    }

    // Update props section
    const propsSection = inspectorPanel.querySelector('.gxp-props-section');
    const propsContent = inspectorPanel.querySelector('.gxp-props-content');

    if (info && Object.keys(info.props).length > 0) {
      propsSection.style.display = 'block';
      propsContent.textContent = JSON.stringify(info.props, null, 2);
    } else {
      propsSection.style.display = 'none';
    }
  }

  function showExtractForm(text, filePath) {
    const extractSection = inspectorPanel.querySelector('.gxp-extract-section');
    const textInput = inspectorPanel.querySelector('.gxp-extract-text');
    const keyInput = inspectorPanel.querySelector('.gxp-extract-key');
    const fileInput = inspectorPanel.querySelector('.gxp-extract-file');
    const statusEl = inspectorPanel.querySelector('.gxp-extract-status');

    extractSection.style.display = 'block';
    textInput.value = text;
    keyInput.value = textToKey(text);
    fileInput.value = filePath || '';
    statusEl.style.display = 'none';
    statusEl.className = 'gxp-extract-status';
  }

  async function handleExtract() {
    const textInput = inspectorPanel.querySelector('.gxp-extract-text');
    const keyInput = inspectorPanel.querySelector('.gxp-extract-key');
    const fileInput = inspectorPanel.querySelector('.gxp-extract-file');
    const button = inspectorPanel.querySelector('.gxp-extract-button');
    const statusEl = inspectorPanel.querySelector('.gxp-extract-status');

    const text = textInput.value;
    const key = keyInput.value;
    const filePath = fileInput.value;

    if (!text || !key || !filePath) {
      statusEl.textContent = 'All fields are required';
      statusEl.className = 'gxp-extract-status error';
      return;
    }

    button.disabled = true;
    button.textContent = 'Extracting...';

    try {
      const result = await extractString({
        text,
        key,
        filePath
      });

      if (result.success) {
        statusEl.textContent = `Success! Added getString('${key}') to ${filePath}`;
        statusEl.className = 'gxp-extract-status success';
      } else {
        statusEl.textContent = result.error || 'Extraction failed';
        statusEl.className = 'gxp-extract-status error';
      }
    } catch (error) {
      statusEl.textContent = error.message;
      statusEl.className = 'gxp-extract-status error';
    } finally {
      button.disabled = false;
      button.textContent = 'Extract to getString()';
    }
  }

  // ============================================================
  // Event Handlers
  // ============================================================

  function handleMouseMove(e) {
    if (!inspectorEnabled) return;

    const el = e.target;
    if (el === highlightOverlay || highlightOverlay?.contains(el) ||
        el === inspectorPanel || inspectorPanel?.contains(el)) {
      return;
    }

    if (el !== hoveredElement) {
      hoveredElement = el;
      updateHighlight(el);
    }
  }

  function handleClick(e) {
    if (!inspectorEnabled) return;

    const el = e.target;
    if (el === highlightOverlay || highlightOverlay?.contains(el) ||
        el === inspectorPanel || inspectorPanel?.contains(el) ||
        el === selectionHighlight || selectionHighlight?.contains(el)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    selectedElement = el;
    // Store for DevTools panel access via eval
    window.__gxpSelectedElement = el;

    updatePanel(el);

    // Show persistent selection highlight
    updateSelectionHighlight(el);

    // Hide hover highlight
    hideHighlight();

    // Disable inspector (selection mode) after selecting
    // This prevents accidental re-selection on next click
    disableInspector();

    // Send selection to background for DevTools panel
    sendElementToDevTools(el);
  }

  function sendElementToDevTools(el) {
    const vueInstance = getVueInstance(el);
    const info = getComponentInfo(vueInstance);
    const texts = getTextContent(el);
    const textsWithAttrs = getTextContentWithAttributes(el);
    const childGxpStrings = findChildGxpStrings(el);

    // Check if the element itself has gxp-string
    const gxpStringKey = getGxpStringKey(el);
    // Check for data-gxp-source attribute (injected by vite plugin)
    const sourceExpression = getGxpSourceExpression(el);

    const data = {
      tagName: el.tagName.toLowerCase(),
      component: info,
      texts: texts,
      textsWithAttributes: textsWithAttrs,
      childGxpStrings: childGxpStrings,
      gxpStringKey: gxpStringKey,
      isExtracted: gxpStringKey !== null,
      sourceExpression: sourceExpression,
      isDynamic: sourceExpression !== null
    };

    // Send to content script via postMessage (since we're in page context)
    // The content script will relay to the background script
    window.postMessage({
      type: 'GXP_INSPECTOR_MESSAGE',
      payload: {
        type: 'elementSelected',
        data: data
      }
    }, '*');
  }

  function handleKeyDown(e) {
    // Escape to disable inspector
    if (e.key === 'Escape' && inspectorEnabled) {
      disableInspector();
    }

    // Ctrl+Shift+I to toggle inspector
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
      e.preventDefault();
      toggleInspector();
    }
  }

  // ============================================================
  // Public API
  // ============================================================

  function enableInspector() {
    if (inspectorEnabled) return;

    inspectorEnabled = true;
    createHighlightOverlay();
    createInspectorPanel();

    // Add selecting class for pointer cursor
    document.body.classList.add('gxp-inspector-selecting');

    // Hide previous selection highlight when entering selection mode
    hideSelectionHighlight();
    selectedElement = null;
    window.__gxpSelectedElement = null;

    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    window.addEventListener('scroll', updateSelectionPosition, true);
    window.addEventListener('resize', updateSelectionPosition);

    console.log('[GxP Inspector] Enabled - Hover over elements to inspect');
  }

  function disableInspector() {
    if (!inspectorEnabled) return;

    inspectorEnabled = false;
    hideHighlight();

    // Remove selecting class for pointer cursor
    document.body.classList.remove('gxp-inspector-selecting');

    if (inspectorPanel) {
      inspectorPanel.remove();
      inspectorPanel = null;
    }

    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);
    // Keep scroll/resize listeners for selection highlight position updates
    // They will be removed when a new selection starts

    // Don't clear selectedElement here - we want to keep the selection
    hoveredElement = null;

    console.log('[GxP Inspector] Disabled - Selection preserved');
  }

  // Clear selection completely (called when user wants to deselect)
  function clearSelection() {
    hideSelectionHighlight();
    selectedElement = null;
    window.__gxpSelectedElement = null;
    window.removeEventListener('scroll', updateSelectionPosition, true);
    window.removeEventListener('resize', updateSelectionPosition);
  }

  function toggleInspector() {
    if (inspectorEnabled) {
      disableInspector();
    } else {
      enableInspector();
    }
  }

  // ============================================================
  // Utility Functions
  // ============================================================

  /**
   * Build a descriptive label for an element
   * Format: ComponentName::element::gxp-string-key
   * Examples:
   *   - DemoPage::h1::welcome_title
   *   - DemoPage::h1 (no gxp-string)
   *   - div::gxp-string-key (no Vue component)
   *   - div (plain element)
   */
  function buildElementLabel(el) {
    const parts = [];

    // Get Vue component name
    const vueInstance = getVueInstance(el);
    const info = getComponentInfo(vueInstance);
    if (info && info.name) {
      parts.push(info.name);
    }

    // Add element tag name
    parts.push(el.tagName.toLowerCase());

    // Check for gxp-string attribute
    const gxpStringKey = el.getAttribute('gxp-string');
    if (gxpStringKey) {
      parts.push(gxpStringKey);
    }

    // Check for gxp-src attribute (for images/assets)
    const gxpSrcKey = el.getAttribute('gxp-src');
    if (gxpSrcKey && !gxpStringKey) {
      parts.push(gxpSrcKey);
    }

    return parts.join('::');
  }

  function textToKey(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 40)
      .replace(/_+$/, '');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================================
  // Initialize
  // ============================================================

  // Add keyboard listener
  document.addEventListener('keydown', handleKeyDown);

  // Expose API
  window.gxpInspector = {
    enable: enableInspector,
    disable: disableInspector,
    toggle: toggleInspector,
    isEnabled: () => inspectorEnabled,
    clearSelection: clearSelection,
    ping: ping
  };

  // Listen for messages from content script (which relays from popup/background)
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'GXP_INSPECTOR_ACTION') {
      const action = event.data.action;
      if (action === 'toggleInspector') {
        toggleInspector();
      } else if (action === 'enable') {
        enableInspector();
      } else if (action === 'disable') {
        disableInspector();
      }
    }
  });

  console.log('[GxP Inspector] Loaded in page context. Press Ctrl+Shift+I to toggle inspector.');
})();
