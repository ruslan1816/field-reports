/**
 * ai-summary.js — Northern Wolves AC Field Reporting PWA
 * =======================================================
 * Optional AI-powered report summary generation using Claude API.
 * Calls a Google Apps Script proxy that forwards to Anthropic's API.
 *
 * Usage: Include this script in any report form HTML.
 * The tech taps "✨ AI Summary" → form data is sent → Claude writes
 * a professional summary → tech can review/edit before sending.
 */

(function() {
  'use strict';

  // Google Apps Script proxy URL — handles Claude API calls server-side
  var AI_PROXY_URL = 'https://script.google.com/macros/s/AKfycbyliO2PnVCaDfFYsA3hZZOwQYP3ElniEx7YHhM7ZkMXcMo0Fly3R-IQjLQXXbpuM6Rv9w/exec';

  // Report-type-specific prompt context
  var REPORT_PROMPTS = {
    'service-call': {
      label: 'Service Call',
      context: 'This is an HVAC service call report. The technician responded to a customer call, diagnosed equipment issues, and performed repairs or maintenance.'
    },
    'startup': {
      label: 'Start-Up',
      context: 'This is an HVAC equipment start-up/commissioning report. The technician installed or commissioned new equipment, verified proper operation, and recorded initial readings.'
    },
    'pm-checklist': {
      label: 'Preventive Maintenance',
      context: 'This is a preventive maintenance checklist report. The technician performed scheduled maintenance on HVAC equipment, inspecting, cleaning, and servicing components.'
    },
    'site-survey': {
      label: 'Site Survey',
      context: 'This is a site survey report. The technician assessed the location, existing equipment, and conditions to plan for new installation or replacement.'
    },
    'work-order': {
      label: 'Work Order',
      context: 'This is an HVAC work order report. The technician completed assigned work including repairs, installations, or modifications to HVAC systems.'
    },
    'change-order': {
      label: 'Change Order',
      context: 'This is a change order report for an HVAC project. It documents scope changes, additional work, or modifications to the original project plan.'
    },
    'rfi': {
      label: 'RFI',
      context: 'This is a Request for Information (RFI) for an HVAC project. The technician or project team needs clarification on specifications, drawings, or project requirements.'
    }
  };

  /**
   * Build the prompt for Claude based on report type and form data.
   */
  function buildPrompt(reportType, formData) {
    var config = REPORT_PROMPTS[reportType] || { label: 'Report', context: 'This is an HVAC field report.' };

    // Extract key fields (skip photos/signatures/binary data)
    var cleanData = {};
    for (var key in formData) {
      if (!formData.hasOwnProperty(key)) continue;
      var val = formData[key];
      // Skip binary data
      if (typeof val === 'string' && (val.startsWith('data:image') || val.length > 5000)) continue;
      if (key === 'photos' || key === 'photosByEquip' || key === 'techSig' || key === 'custSig') continue;
      // Skip internal tracking fields and large objects (photos, parts, labor arrays)
      if (key.charAt(0) === '_') continue;
      if (typeof val === 'object' && val !== null) continue;
      cleanData[key] = val;
    }

    var prompt = 'You are a professional HVAC report writer for Northern Wolves Air Conditioning, a commercial and residential HVAC company in the NY/NJ area.\n\n'
      + config.context + '\n\n'
      + 'Based on the following field data collected by the technician, write a clear, professional summary paragraph (3-5 sentences). '
      + 'Include: what was done, key findings, equipment details if relevant, and outcome/status. '
      + 'Write in past tense, third person (\"The technician...\"). Be concise and professional. '
      + 'Do NOT include any headers, bullet points, or formatting — just a clean paragraph.\n\n'
      + 'Report Type: ' + config.label + '\n'
      + 'Field Data:\n' + JSON.stringify(cleanData, null, 2);

    return prompt;
  }

  /**
   * Generate an AI summary for the current report.
   * @param {string} reportType - e.g. 'service-call', 'startup'
   * @param {function} collectDataFn - function that returns the form data object
   * @returns {Promise<string>} the generated summary text
   */
  async function generateAISummary(reportType, collectDataFn) {
    if (!AI_PROXY_URL) {
      throw new Error('AI Summary is not configured. Please set the proxy URL.');
    }

    var formData = collectDataFn();

    var prompt = buildPrompt(reportType, formData);

    console.log('[ai-summary] Requesting summary for', reportType);

    var response = await fetch(AI_PROXY_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'generate_summary',
        prompt: prompt
      }),
      headers: { 'Content-Type': 'text/plain' }
    });

    var text = await response.text();
    var result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      throw new Error('AI proxy returned invalid response: ' + text.substring(0, 200));
    }

    if (!result.success) {
      throw new Error('AI summary failed: ' + (result.error || 'Unknown error'));
    }

    console.log('[ai-summary] Summary generated, length:', result.summary.length);
    return result.summary;
  }

  /**
   * Handle the AI Summary button click.
   * Updates the button state, calls the API, fills the textarea.
   * @param {string} reportType
   * @param {function} collectDataFn
   */
  async function handleAISummaryClick(reportType, collectDataFn) {
    var btn = document.getElementById('btnAISummary');
    var textarea = document.getElementById('aiSummaryText');
    var section = document.getElementById('aiSummaryResult');

    if (!btn || !textarea) return;

    // Show loading state
    var origText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:6px"></span>Generating…';

    try {
      var summary = await generateAISummary(reportType, collectDataFn);
      textarea.value = summary;
      if (section) section.style.display = 'block';
      if (typeof showToast === 'function') showToast('AI summary generated!');
    } catch (err) {
      console.error('[ai-summary] Error:', err);
      textarea.value = '';
      if (section) section.style.display = 'block';
      textarea.placeholder = 'AI summary failed: ' + err.message + '. You can type a summary manually.';
      if (typeof showToast === 'function') showToast('AI summary failed — you can type one manually');
    } finally {
      btn.disabled = false;
      btn.innerHTML = origText;
    }
  }

  /**
   * Get the current AI summary text (for including in form data).
   * @returns {string} the summary text, or empty string
   */
  function getAISummary() {
    var textarea = document.getElementById('aiSummaryText');
    return textarea ? textarea.value.trim() : '';
  }

  // Expose on window
  window.generateAISummary = generateAISummary;
  window.handleAISummaryClick = handleAISummaryClick;
  window.getAISummary = getAISummary;

})();
