/**
 * GxP Inspector DevTools Panel
 *
 * This script runs in the DevTools panel context and communicates
 * with the content script via chrome.devtools.inspectedWindow.eval()
 * and the background script for messaging.
 */

(function() {
  'use strict';

  // Configuration
  const DEV_SERVER_URL = 'https://localhost:3060';
  const API_PREFIX = '/__gxp-inspector';

  // State
  let isSelectMode = false;
  let isConnected = false;
  let currentComponent = null;
  let selectedString = null;
  let hasSelection = false; // Track if an element is currently selected

  // DOM Elements
  const statusIndicator = document.getElementById('statusIndicator');
  const selectBtn = document.getElementById('selectBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const emptyState = document.getElementById('emptyState');
  const inspectorContent = document.getElementById('inspectorContent');
  const componentName = document.getElementById('componentName');
  const componentFile = document.getElementById('componentFile');
  const stringsSection = document.getElementById('stringsSection');
  const stringsCount = document.getElementById('stringsCount');
  const stringsList = document.getElementById('stringsList');
  const extractForm = document.getElementById('extractForm');
  const extractText = document.getElementById('extractText');
  const extractKey = document.getElementById('extractKey');
  const extractFile = document.getElementById('extractFile');
  const cancelExtract = document.getElementById('cancelExtract');
  const doExtract = document.getElementById('doExtract');
  const extractStatus = document.getElementById('extractStatus');
  const propsSection = document.getElementById('propsSection');
  const propsTree = document.getElementById('propsTree');
  const dataSection = document.getElementById('dataSection');
  const dataTree = document.getElementById('dataTree');

  // Edit form elements
  const editForm = document.getElementById('editForm');
  const editKey = document.getElementById('editKey');
  const editValue = document.getElementById('editValue');
  const editFile = document.getElementById('editFile');
  const cancelEdit = document.getElementById('cancelEdit');
  const doEdit = document.getElementById('doEdit');
  const editStatus = document.getElementById('editStatus');

  // Track string info for editing
  let currentStringInfo = null;

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
      console.error('[GxP Panel] API Error:', error);
      return { success: false, error: error.message };
    }
  }

  async function checkConnection() {
    try {
      const result = await apiCall('/ping');
      isConnected = result.success;
      updateConnectionStatus();
      return isConnected;
    } catch {
      isConnected = false;
      updateConnectionStatus();
      return false;
    }
  }

  async function extractString(data) {
    return apiCall('/extract-string', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async function lookupString(text, filePath) {
    return apiCall('/lookup-string', {
      method: 'POST',
      body: JSON.stringify({ text, filePath })
    });
  }

  async function updateString(data) {
    return apiCall('/update-string', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async function getStrings() {
    return apiCall('/strings');
  }

  async function analyzeText(text, filePath) {
    return apiCall('/analyze-text', {
      method: 'POST',
      body: JSON.stringify({ text, filePath })
    });
  }

  // ============================================================
  // Content Script Communication
  // ============================================================

  function evalInPage(code) {
    return new Promise((resolve, reject) => {
      chrome.devtools.inspectedWindow.eval(code, (result, exceptionInfo) => {
        if (exceptionInfo) {
          reject(exceptionInfo);
        } else {
          resolve(result);
        }
      });
    });
  }

  async function enableInspectorInPage() {
    try {
      await evalInPage(`
        if (window.gxpInspector) {
          window.gxpInspector.enable();
          true;
        } else {
          false;
        }
      `);
      return true;
    } catch (error) {
      console.error('Failed to enable inspector:', error);
      return false;
    }
  }

  async function disableInspectorInPage() {
    try {
      await evalInPage(`
        if (window.gxpInspector) {
          window.gxpInspector.disable();
          true;
        } else {
          false;
        }
      `);
    } catch (error) {
      console.error('Failed to disable inspector:', error);
    }
  }

  async function clearSelectionInPage() {
    try {
      await evalInPage(`
        if (window.gxpInspector) {
          window.gxpInspector.clearSelection();
          true;
        } else {
          false;
        }
      `);
    } catch (error) {
      console.error('Failed to clear selection:', error);
    }
  }

  async function getSelectedElement() {
    // Uses $0 which is the last selected element in Elements panel
    // or we can use our custom selection from inspector.js
    try {
      const result = await evalInPage(`
        (function() {
          // Try to get from our inspector's selected element
          if (window.__gxpSelectedElement) {
            const el = window.__gxpSelectedElement;

            // Get Vue instance
            function getVueInstance(el) {
              if (el.__vueParentComponent) return el.__vueParentComponent;
              let current = el;
              while (current) {
                if (current.__vueParentComponent) return current.__vueParentComponent;
                current = current.parentElement;
              }
              return null;
            }

            const vueInstance = getVueInstance(el);

            // Get component info
            let componentInfo = null;
            if (vueInstance) {
              const type = vueInstance.type;
              componentInfo = {
                name: type?.name || type?.__name || type?.__file?.split('/').pop()?.replace('.vue', '') || 'Anonymous',
                file: type?.__file || null,
                props: {},
                data: {}
              };

              // Get props
              if (vueInstance.props) {
                Object.keys(vueInstance.props).forEach(key => {
                  try {
                    componentInfo.props[key] = JSON.parse(JSON.stringify(vueInstance.props[key]));
                  } catch {
                    componentInfo.props[key] = String(vueInstance.props[key]);
                  }
                });
              }

              // Get data/state
              if (vueInstance.setupState) {
                Object.keys(vueInstance.setupState).forEach(key => {
                  const value = vueInstance.setupState[key];
                  if (typeof value !== 'function') {
                    try {
                      componentInfo.data[key] = JSON.parse(JSON.stringify(value));
                    } catch {
                      componentInfo.data[key] = String(value);
                    }
                  }
                });
              }
            }

            // Get text content (plain)
            const texts = [];
            el.childNodes.forEach(node => {
              if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) texts.push(text);
              }
            });

            // Check for gxp-string attribute on this element
            const gxpStringKey = el.getAttribute ? el.getAttribute('gxp-string') : null;

            // Check for data-gxp-expr attribute (injected by vite plugin)
            const sourceExpression = el.getAttribute ? el.getAttribute('data-gxp-expr') : null;

            // Get text content with gxp-string attribute info
            const textsWithAttributes = [];
            el.childNodes.forEach(node => {
              if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) {
                  textsWithAttributes.push({
                    text: text,
                    gxpStringKey: gxpStringKey,
                    isExtracted: gxpStringKey !== null,
                    sourceExpression: sourceExpression,
                    isDynamic: sourceExpression !== null
                  });
                }
              }
            });

            // Find child elements with gxp-string attributes
            const childGxpStrings = [];
            const gxpElements = el.querySelectorAll ? el.querySelectorAll('[gxp-string]') : [];
            gxpElements.forEach(child => {
              const key = child.getAttribute('gxp-string');
              const text = child.textContent.trim();
              if (key && text) {
                childGxpStrings.push({
                  key: key,
                  text: text,
                  element: child.tagName.toLowerCase()
                });
              }
            });

            return {
              tagName: el.tagName.toLowerCase(),
              component: componentInfo,
              texts: texts,
              textsWithAttributes: textsWithAttributes,
              childGxpStrings: childGxpStrings,
              gxpStringKey: gxpStringKey,
              isExtracted: gxpStringKey !== null,
              sourceExpression: sourceExpression,
              isDynamic: sourceExpression !== null
            };
          }
          return null;
        })()
      `);
      return result;
    } catch (error) {
      console.error('Failed to get selected element:', error);
      return null;
    }
  }

  // ============================================================
  // UI Updates
  // ============================================================

  function updateConnectionStatus() {
    if (isConnected) {
      statusIndicator.classList.add('connected');
      statusIndicator.title = 'Connected to Vite dev server';
    } else {
      statusIndicator.classList.remove('connected');
      statusIndicator.title = 'Not connected - start Vite dev server';
    }
  }

  function showEmptyState() {
    emptyState.classList.remove('hidden');
    inspectorContent.classList.add('hidden');
    currentComponent = null;
  }

  function showInspectorContent() {
    emptyState.classList.add('hidden');
    inspectorContent.classList.remove('hidden');
  }

  async function updateComponentInfo(data) {
    if (!data) {
      showEmptyState();
      return;
    }

    showInspectorContent();
    currentComponent = data;

    // Update component name and file
    if (data.component) {
      componentName.textContent = `<${data.component.name}>`;
      componentFile.textContent = data.component.file || 'Unknown file';
    } else {
      componentName.textContent = `<${data.tagName}>`;
      componentFile.textContent = 'Not a Vue component';
    }

    // Build string info list from attribute detection
    const stringInfos = [];
    const filePath = data.component?.file || null;

    // Add strings from textsWithAttributes (direct element text with gxp-string detection)
    if (data.textsWithAttributes && data.textsWithAttributes.length > 0) {
      data.textsWithAttributes.forEach(info => {
        stringInfos.push({
          text: info.text,
          isExtracted: info.isExtracted,
          key: info.gxpStringKey || null,
          // Use injected data-gxp-source attribute if available (from vite plugin)
          isDynamic: info.isDynamic || false,
          expression: info.sourceExpression || null,
          expressionType: info.sourceExpression ? detectExpressionType(info.sourceExpression) : null
        });
      });
    } else if (data.texts && data.texts.length > 0) {
      // Fallback to plain texts if textsWithAttributes not available
      data.texts.forEach(text => {
        stringInfos.push({
          text: text,
          isExtracted: data.isExtracted || false,
          key: data.gxpStringKey || null,
          // Check element-level source expression
          isDynamic: data.isDynamic || false,
          expression: data.sourceExpression || null,
          expressionType: data.sourceExpression ? detectExpressionType(data.sourceExpression) : null
        });
      });
    }

    // Also add child elements with gxp-string attributes
    if (data.childGxpStrings && data.childGxpStrings.length > 0) {
      data.childGxpStrings.forEach(child => {
        // Check if this text is already in the list
        const exists = stringInfos.some(info => info.text === child.text && info.key === child.key);
        if (!exists) {
          stringInfos.push({
            text: child.text,
            isExtracted: true,
            key: child.key,
            element: child.element,
            isDynamic: false,
            expression: null,
            expressionType: null
          });
        }
      });
    }

    // Analyze each string to check if it's dynamic (from a template expression)
    // Only call API for strings that don't already have source info from data-gxp-source attribute
    if (isConnected && filePath) {
      for (const info of stringInfos) {
        // Skip if already extracted with gxp-string or already has source expression
        if (info.isExtracted || info.isDynamic) continue;

        try {
          const analysis = await analyzeText(info.text, filePath);
          if (analysis.success && analysis.isDynamic) {
            info.isDynamic = true;
            info.expression = analysis.expression;
            info.expressionType = analysis.expressionType;
            info.sourceKey = analysis.sourceKey;
          }
        } catch (e) {
          // Ignore analysis errors, treat as static
          console.warn('[GxP Panel] Failed to analyze text:', e);
        }
      }
    }

    // Update strings list display
    if (stringInfos.length > 0) {
      stringsSection.classList.remove('hidden');
      stringsCount.textContent = stringInfos.length;

      // Render the strings with their status
      stringsList.innerHTML = stringInfos.map((info, index) => {
        let badgeClass, badgeText, actionText, itemClass, showAction;

        if (info.isExtracted) {
          badgeClass = 'extracted';
          badgeText = 'gxp-string';
          actionText = 'Edit';
          itemClass = 'string-item extracted';
          showAction = true;
        } else if (info.isDynamic) {
          badgeClass = 'dynamic';
          badgeText = info.expressionType || 'dynamic';
          actionText = '';
          itemClass = 'string-item dynamic';
          showAction = false;
        } else {
          badgeClass = 'raw';
          badgeText = 'raw text';
          actionText = 'Extract';
          itemClass = 'string-item';
          showAction = true;
        }

        const expressionHtml = info.expression
          ? `<span class="string-expression" title="Source: ${escapeHtml(info.expression)}">${escapeHtml(info.expression)}</span>`
          : '';

        const actionHtml = showAction
          ? `<div class="string-actions"><button class="action-btn" data-action="${info.isExtracted ? 'edit' : 'extract'}">${actionText}</button></div>`
          : '';

        return `
          <div class="${itemClass}" data-index="${index}" data-text="${escapeHtml(info.text)}"
               data-extracted="${info.isExtracted}" data-key="${info.key || ''}"
               data-dynamic="${info.isDynamic}" data-expression="${escapeHtml(info.expression || '')}">
            <div class="string-content">
              <span class="string-text">"${escapeHtml(info.text)}"</span>
              ${expressionHtml}
            </div>
            <span class="string-badge ${badgeClass}">${badgeText}</span>
            ${actionHtml}
          </div>
        `;
      }).join('');

      // Add click handlers
      stringsList.querySelectorAll('.string-item').forEach(item => {
        item.addEventListener('click', () => {
          selectStringItem(item);
        });

        const actionBtn = item.querySelector('.action-btn');
        if (actionBtn) {
          const action = actionBtn.dataset.action;

          actionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (action === 'edit') {
              showEditForm(item.dataset.text, item.dataset.key);
            } else if (action === 'extract') {
              showExtractForm(item.dataset.text);
            }
          });
        }
      });
    } else {
      stringsSection.classList.add('hidden');
    }

    // Update props
    if (data.component && Object.keys(data.component.props).length > 0) {
      propsSection.classList.remove('hidden');
      propsTree.innerHTML = formatProps(data.component.props);
    } else {
      propsSection.classList.add('hidden');
    }

    // Update data
    if (data.component && Object.keys(data.component.data).length > 0) {
      dataSection.classList.remove('hidden');
      dataTree.innerHTML = formatProps(data.component.data);
    } else {
      dataSection.classList.add('hidden');
    }

    // Hide extract form
    hideExtractForm();
  }

  function formatProps(obj, indent = 0) {
    let html = '';
    const indentStr = '  '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
      const type = typeof value;
      let valueHtml = '';

      if (value === null) {
        valueHtml = '<span class="prop-value boolean">null</span>';
      } else if (type === 'boolean') {
        valueHtml = `<span class="prop-value boolean">${value}</span>`;
      } else if (type === 'number') {
        valueHtml = `<span class="prop-value number">${value}</span>`;
      } else if (type === 'string') {
        valueHtml = `<span class="prop-value">"${escapeHtml(value)}"</span>`;
      } else if (Array.isArray(value)) {
        if (value.length === 0) {
          valueHtml = '<span class="prop-value">[]</span>';
        } else {
          valueHtml = `<span class="prop-value">[${value.length} items]</span>`;
        }
      } else if (type === 'object') {
        valueHtml = `<span class="prop-value">{...}</span>`;
      } else {
        valueHtml = `<span class="prop-value">${escapeHtml(String(value))}</span>`;
      }

      html += `<div class="prop-item">${indentStr}<span class="prop-key">${key}</span>: ${valueHtml}</div>`;
    }

    return html;
  }

  function selectStringItem(item) {
    // Remove selection from all items
    stringsList.querySelectorAll('.string-item').forEach(i => {
      i.classList.remove('selected');
    });

    // Select this item
    item.classList.add('selected');
    selectedString = item.dataset.text;
  }

  function showExtractForm(text) {
    extractForm.classList.remove('hidden');
    extractText.value = text;
    extractKey.value = textToKey(text);
    extractFile.value = currentComponent?.component?.file || '';
    extractStatus.classList.add('hidden');
    selectedString = text;
  }

  function hideExtractForm() {
    extractForm.classList.add('hidden');
    extractStatus.classList.add('hidden');
    selectedString = null;
  }

  function showEditForm(text, key) {
    // Hide extract form if visible
    hideExtractForm();

    editForm.classList.remove('hidden');
    editKey.value = key || '';
    editValue.value = text;
    editFile.value = currentComponent?.component?.file || '';
    editStatus.classList.add('hidden');

    // Store current string info for the update
    currentStringInfo = {
      oldKey: key,
      text: text,
      filePath: currentComponent?.component?.file || ''
    };
  }

  function hideEditForm() {
    editForm.classList.add('hidden');
    editStatus.classList.add('hidden');
    currentStringInfo = null;
  }

  function showEditStatus(message, type = 'info') {
    editStatus.textContent = message;
    editStatus.className = `status-message ${type}`;
    editStatus.classList.remove('hidden');
  }

  function showStatus(message, type = 'info') {
    extractStatus.textContent = message;
    extractStatus.className = `status-message ${type}`;
    extractStatus.classList.remove('hidden');
  }

  // ============================================================
  // Event Handlers
  // ============================================================

  selectBtn.addEventListener('click', async () => {
    if (isSelectMode) {
      // Cancel selection mode (clicking during selection)
      isSelectMode = false;
      selectBtn.classList.remove('active');
      selectBtn.querySelector('span').textContent = hasSelection ? 'Cancel Selection' : 'Select Element';
      await disableInspectorInPage();
    } else if (hasSelection) {
      // Clear selection (clicking when element is already selected)
      hasSelection = false;
      currentComponent = null;
      await clearSelectionInPage();
      showEmptyState();
      selectBtn.querySelector('span').textContent = 'Select Element';
    } else {
      // Start selection mode
      isSelectMode = true;
      selectBtn.classList.add('active');
      selectBtn.querySelector('span').textContent = 'Cancel Selection';
      await enableInspectorInPage();
    }
  });

  refreshBtn.addEventListener('click', async () => {
    await checkConnection();
    const data = await getSelectedElement();
    updateComponentInfo(data);
  });

  cancelExtract.addEventListener('click', () => {
    hideExtractForm();
  });

  cancelEdit.addEventListener('click', () => {
    hideEditForm();
  });

  doEdit.addEventListener('click', async () => {
    if (!currentStringInfo) {
      showEditStatus('No string selected for editing', 'error');
      return;
    }

    const newKey = editKey.value;
    const newValue = editValue.value;
    const filePath = editFile.value;

    if (!newKey) {
      showEditStatus('String key is required', 'error');
      return;
    }

    if (!filePath) {
      showEditStatus('Cannot determine source file', 'error');
      return;
    }

    if (!isConnected) {
      showEditStatus('Not connected to Vite dev server', 'error');
      return;
    }

    doEdit.disabled = true;
    doEdit.textContent = 'Updating...';

    try {
      const result = await updateString({
        oldKey: currentStringInfo.oldKey,
        newKey: newKey,
        newValue: newValue,
        filePath: filePath
      });

      if (result.success) {
        showEditStatus(`Success! Updated gxp-string="${newKey}"`, 'success');

        // Refresh the component info to reflect changes
        setTimeout(async () => {
          hideEditForm();
          const data = await getSelectedElement();
          updateComponentInfo(data);
        }, 1500);
      } else {
        showEditStatus(result.error || 'Update failed', 'error');
      }
    } catch (error) {
      showEditStatus(error.message, 'error');
    } finally {
      doEdit.disabled = false;
      doEdit.textContent = 'Update gxp-string';
    }
  });

  doExtract.addEventListener('click', async () => {
    const text = extractText.value;
    const key = extractKey.value;
    const filePath = extractFile.value;

    if (!text || !key) {
      showStatus('Text and key are required', 'error');
      return;
    }

    if (!filePath) {
      showStatus('Cannot determine source file', 'error');
      return;
    }

    if (!isConnected) {
      showStatus('Not connected to Vite dev server', 'error');
      return;
    }

    doExtract.disabled = true;
    doExtract.textContent = 'Extracting...';

    try {
      const result = await extractString({ text, key, filePath });

      if (result.success) {
        showStatus(`Success! Added gxp-string="${key}" attribute`, 'success');
        // Refresh the component info to reflect changes
        setTimeout(async () => {
          hideExtractForm();
          const data = await getSelectedElement();
          updateComponentInfo(data);
        }, 1500);
      } else {
        showStatus(result.error || 'Extraction failed', 'error');
      }
    } catch (error) {
      showStatus(error.message, 'error');
    } finally {
      doExtract.disabled = false;
      doExtract.textContent = 'Extract to gxp-string';
    }
  });

  // ============================================================
  // Message Listener for Content Script Updates
  // ============================================================

  // Create a connection to the background script
  const backgroundConnection = chrome.runtime.connect({
    name: 'gxp-devtools-panel'
  });

  backgroundConnection.postMessage({
    name: 'init',
    tabId: chrome.devtools.inspectedWindow.tabId
  });

  backgroundConnection.onMessage.addListener((message) => {
    if (message.type === 'elementSelected') {
      updateComponentInfo(message.data);
      isSelectMode = false;
      hasSelection = true;
      selectBtn.classList.remove('active');
      selectBtn.querySelector('span').textContent = 'Cancel Selection';
    }
  });

  // Also listen for selection changes via polling
  // (backup method since content script communication can be tricky)
  setInterval(async () => {
    if (isSelectMode) {
      const data = await getSelectedElement();
      if (data && JSON.stringify(data) !== JSON.stringify(currentComponent)) {
        updateComponentInfo(data);
      }
    }
  }, 500);

  // ============================================================
  // Utility Functions
  // ============================================================

  function textToKey(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 40)
      .replace(/_+$/, '');
  }

  /**
   * Detect the type of expression from a source expression string
   * @param {string} expression - The source expression (e.g., "gxpStore.getString('key')")
   * @returns {string} - The expression type: 'getString', 'store', 'variable', 'computed'
   */
  function detectExpressionType(expression) {
    if (!expression) return null;

    // Check for getString calls
    if (expression.includes('getString')) {
      return 'getString';
    }

    // Check for store access
    if (expression.includes('Store') || expression.includes('store.')) {
      return 'store';
    }

    // Check for computed/method calls
    if (expression.includes('(')) {
      return 'computed';
    }

    // Default to variable
    return 'variable';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================================
  // Panel Lifecycle
  // ============================================================

  // Called when panel becomes visible
  window.panelShown = function() {
    checkConnection();
  };

  // Initial setup
  checkConnection();

  // Check connection periodically
  setInterval(checkConnection, 10000);

  console.log('[GxP Panel] DevTools panel initialized');
})();
