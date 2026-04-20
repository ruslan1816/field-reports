/**
 * pdf-utils.js — Shared PDF generation helpers for Northern Wolves Field Reports
 *
 * Fixes two recurring PDF bugs caused by AI-assisted / pasted text:
 *
 * 1) Letter-spacing glitch
 *    Invisible Unicode (zero-width joiners, non-breaking spaces, smart quotes,
 *    em-dashes, soft hyphens, etc.) makes jsPDF's splitTextToSize compute
 *    wrong line widths. The renderer then stretches letters across the line
 *    to compensate, producing "o l d e r   s y s t e m" artifacts.
 *
 * 2) Long-line overflow
 *    Equipment notes and similar free-text fields rendered with raw
 *    doc.text() overflow past the page margin (no auto-wrap).
 *
 * This module:
 *   - Exposes window.sanitizePdfText(text) — normalizes problematic Unicode
 *   - Monkey-patches jsPDF.API.text and jsPDF.API.splitTextToSize so EVERY
 *     report's PDF generator is automatically protected — no per-file edits
 *     needed for the Unicode fix.
 *
 * Load this AFTER the jsPDF library script tag in each report HTML.
 */
(function () {
  'use strict';

  /**
   * Normalize invisible / exotic Unicode characters so jsPDF (Helvetica WinAnsi)
   * renders them without the letter-spacing artifact. Visible text is preserved;
   * only problematic code points are rewritten or removed.
   */
  function sanitizePdfText(t) {
    if (t == null) return '';
    return String(t)
      // Smart quotes -> ASCII quotes
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      // Dashes -> hyphen
      .replace(/[\u2013\u2014\u2015]/g, '-')
      .replace(/[\u2010\u2011]/g, '-')
      // Ellipsis
      .replace(/\u2026/g, '...')
      // Non-breaking / exotic spaces -> normal space
      .replace(/[\u00A0\u2007\u202F]/g, ' ')
      .replace(/[\u2000-\u2006\u2008-\u200A]/g, ' ')
      // Zero-width / direction marks / BOM -> remove
      .replace(/[\u200B-\u200D\u200E\u200F\uFEFF]/g, '')
      // Soft hyphen -> remove
      .replace(/\u00AD/g, '')
      // Control chars -> remove
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      // Normalize line endings
      .replace(/\r\n?/g, '\n');
  }

  // Expose globally for any code that wants to sanitize explicitly
  window.sanitizePdfText = sanitizePdfText;

  /**
   * Patch jsPDF so every call to .text() and .splitTextToSize() auto-sanitizes
   * its text input. This fixes the letter-spacing glitch across ALL reports
   * without each report needing to import the sanitizer by hand.
   *
   * jsPDF may load asynchronously via CDN — we wait up to ~5s for it to appear.
   */
  var tries = 0;
  function patchJsPDF() {
    var jsPDFCtor =
      (window.jspdf && window.jspdf.jsPDF) ||
      window.jsPDF ||
      null;

    if (!jsPDFCtor || !jsPDFCtor.API) {
      if (tries++ < 50) {
        setTimeout(patchJsPDF, 100);
      } else {
        console.warn('[pdf-utils] jsPDF did not appear — sanitizer patch not applied');
      }
      return;
    }

    if (jsPDFCtor.API.__nwSanitized) return;   // already patched

    var origText = jsPDFCtor.API.text;
    jsPDFCtor.API.text = function (text) {
      var args = Array.prototype.slice.call(arguments);
      if (typeof args[0] === 'string') {
        args[0] = sanitizePdfText(args[0]);
      } else if (Array.isArray(args[0])) {
        args[0] = args[0].map(function (s) {
          return typeof s === 'string' ? sanitizePdfText(s) : s;
        });
      }
      return origText.apply(this, args);
    };

    var origSplit = jsPDFCtor.API.splitTextToSize;
    jsPDFCtor.API.splitTextToSize = function (text) {
      var args = Array.prototype.slice.call(arguments);
      if (typeof args[0] === 'string') {
        args[0] = sanitizePdfText(args[0]);
      }
      return origSplit.apply(this, args);
    };

    jsPDFCtor.API.__nwSanitized = true;
    console.log('[pdf-utils] jsPDF text sanitizer installed');
  }

  patchJsPDF();
})();
