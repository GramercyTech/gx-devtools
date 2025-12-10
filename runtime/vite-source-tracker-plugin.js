/**
 * GxP Source Tracker Vite Plugin
 *
 * Transforms Vue templates at compile time to add data-gxp-expr attributes
 * to elements that contain template expressions or dynamic directives.
 *
 * This uses a more reliable approach - adding attributes directly to the
 * elements rather than using comments.
 *
 * Example transformations:
 *
 *   <span>{{ title }}</span>
 * Becomes:
 *   <span data-gxp-expr="title">{{ title }}</span>
 *
 *   <div v-html="content"></div>
 * Becomes:
 *   <div v-html="content" data-gxp-expr="v-html:content"></div>
 */

/**
 * Create the source tracker plugin
 */
export function gxpSourceTrackerPlugin(options = {}) {
  const {
    enabled = true,
    attrName = 'data-gxp-expr'
  } = options;

  return {
    name: 'gxp-source-tracker',
    enforce: 'pre',

    apply(config, { command }) {
      return enabled && command === 'serve';
    },

    transform(code, id) {
      if (!id.endsWith('.vue')) {
        return null;
      }

      const templateMatch = code.match(/<template>([\s\S]*?)<\/template>/);
      if (!templateMatch) {
        return null;
      }

      // Debug: log which file we're processing
      const fileName = id.split('/').pop();
      console.log(`[GxP Source Tracker] Processing: ${fileName}`);

      let template = templateMatch[1];
      let modified = false;

      // Track which elements we've already processed to avoid duplicates
      const processed = new Set();

      // Process each element that has {{ expression }} as its content
      // We need to find the element that DIRECTLY contains the expression
      // Strategy: Find all {{ expr }} and trace back to their parent element

      // Strategy: Find each {{ expression }} and trace back to find its parent element
      // This handles cases where expressions are nested or mixed with other content

      const exprPattern = /\{\{([\s\S]*?)\}\}/g;
      let match;

      // Map to track which elements we've already added attributes to
      // Key: element start position, Value: array of expressions
      const elementExpressions = new Map();

      while ((match = exprPattern.exec(template)) !== null) {
        const exprStart = match.index;
        const expression = match[1].trim();

        // Find the opening tag that contains this expression
        // Look backwards from the expression to find the nearest unclosed tag
        const beforeExpr = template.substring(0, exprStart);

        // Find the last opening tag before this expression
        // We need to find a tag that hasn't been closed yet
        let depth = 0;
        let tagMatch;
        let parentTagInfo = null;

        // Find all tags before this expression
        const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
        const tags = [];

        while ((tagMatch = tagPattern.exec(beforeExpr)) !== null) {
          const isClosing = tagMatch[0].startsWith('</');
          const isSelfClosing = tagMatch[0].endsWith('/>') ||
            ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'].includes(tagMatch[1].toLowerCase());

          tags.push({
            tagName: tagMatch[1],
            attrs: tagMatch[2],
            start: tagMatch.index,
            fullMatch: tagMatch[0],
            isClosing,
            isSelfClosing
          });
        }

        // Walk through tags to find the immediate parent (last unclosed tag)
        const stack = [];
        for (const tag of tags) {
          if (tag.isSelfClosing) continue;

          if (tag.isClosing) {
            // Pop from stack
            if (stack.length > 0 && stack[stack.length - 1].tagName.toLowerCase() === tag.tagName.toLowerCase()) {
              stack.pop();
            }
          } else {
            stack.push(tag);
          }
        }

        // The last item in the stack is our parent element
        if (stack.length > 0) {
          parentTagInfo = stack[stack.length - 1];

          // Skip script/style tags
          if (['script', 'style'].includes(parentTagInfo.tagName.toLowerCase())) {
            continue;
          }

          // Skip if already has data-gxp-expr in the original attrs
          if (parentTagInfo.attrs.includes(attrName)) {
            continue;
          }

          // Add this expression to the parent element's list
          const key = parentTagInfo.start;
          if (!elementExpressions.has(key)) {
            elementExpressions.set(key, {
              tagInfo: parentTagInfo,
              expressions: []
            });
          }
          elementExpressions.get(key).expressions.push(expression);
        }
      }

      // Now build replacements for each element that has expressions
      const replacements = [];

      for (const [start, data] of elementExpressions) {
        const { tagInfo, expressions } = data;

        // Only add expressions that are direct children (not from nested elements)
        // For now, take all unique expressions
        const uniqueExprs = [...new Set(expressions)];
        const exprValue = uniqueExprs.join('; ');

        const oldOpenTag = tagInfo.fullMatch;
        // Insert the attribute before the closing >
        const newOpenTag = oldOpenTag.replace(/>$/, ` ${attrName}="${escapeAttr(exprValue)}">`);

        replacements.push({
          start: tagInfo.start,
          oldText: oldOpenTag,
          newText: newOpenTag
        });

        modified = true;
      }

      // Apply replacements in reverse order to preserve indices
      replacements.sort((a, b) => b.start - a.start);
      for (const r of replacements) {
        template = template.substring(0, r.start) +
                   r.newText +
                   template.substring(r.start + r.oldText.length);
      }

      // Also handle v-html, v-text directives
      // Add data-gxp-expr to elements that have these
      template = template.replace(
        /<([a-zA-Z][a-zA-Z0-9-]*)([^>]*)(v-html)="([^"]+)"([^>]*)>/g,
        (match, tag, before, directive, expr, after) => {
          if (match.includes(attrName)) return match;
          return `<${tag}${before}${directive}="${expr}"${after} ${attrName}="${escapeAttr('v-html:' + expr)}">`;
        }
      );

      template = template.replace(
        /<([a-zA-Z][a-zA-Z0-9-]*)([^>]*)(v-text)="([^"]+)"([^>]*)>/g,
        (match, tag, before, directive, expr, after) => {
          if (match.includes(attrName)) return match;
          modified = true;
          return `<${tag}${before}${directive}="${expr}"${after} ${attrName}="${escapeAttr('v-text:' + expr)}">`;
        }
      );

      // Handle :textContent binding
      template = template.replace(
        /<([a-zA-Z][a-zA-Z0-9-]*)([^>]*):textContent="([^"]+)"([^>]*)>/g,
        (match, tag, before, expr, after) => {
          if (match.includes(attrName)) return match;
          modified = true;
          return `<${tag}${before}:textContent="${expr}"${after} ${attrName}="${escapeAttr(':textContent:' + expr)}">`;
        }
      );

      if (!modified) {
        console.log(`[GxP Source Tracker] No expressions found in: ${fileName}`);
        return null;
      }

      console.log(`[GxP Source Tracker] Added data-gxp-expr to ${elementExpressions.size} elements in: ${fileName}`);
      const newCode = code.replace(/<template>[\s\S]*?<\/template>/, `<template>${template}</template>`);

      return {
        code: newCode,
        map: null
      };
    }
  };
}

function escapeAttr(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default gxpSourceTrackerPlugin;
