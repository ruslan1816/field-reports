/**
 * ai-chat.js — Northern Wolves AC Field Reporting PWA
 * =====================================================
 * Shared AI chat module. Two modes:
 *   - 'form-fill': tech describes work, AI asks follow-ups, then fills form fields
 *   - 'support':   login/support help chat
 *
 * Usage:
 *   openAIChat({
 *     mode: 'form-fill',
 *     reportType: 'service-call',
 *     fields: [{id:'complaint', label:'Customer Complaint', type:'textarea'}, ...],
 *     onFill: function(data){ ... }  // called with {fieldId: value, ...}
 *   });
 *
 *   openAIChat({ mode: 'support' });
 */
(function() {
  'use strict';

  var AI_PROXY_URL = 'https://script.google.com/macros/s/AKfycbyliO2PnVCaDfFYsA3hZZOwQYP3ElniEx7YHhM7ZkMXcMo0Fly3R-IQjLQXXbpuM6Rv9w/exec';

  var REPORT_CONTEXT = {
    'service-call':  'HVAC service call — diagnose and repair.',
    'startup':       'HVAC equipment start-up/commissioning.',
    'pm-checklist':  'HVAC preventive maintenance visit.',
    'site-survey':   'HVAC site survey / assessment for new install or replacement.',
    'work-order':    'HVAC work order — assigned repair/install/modification.',
    'change-order':  'Construction/HVAC change order — scope change, cost adjustment, schedule impact.',
    'rfi':           'Request for Information — clarification on drawings, specs, or project scope.'
  };

  // Inject shared styles once
  function injectStyles() {
    if (document.getElementById('aiChatStyles')) return;
    var s = document.createElement('style');
    s.id = 'aiChatStyles';
    s.textContent = [
      '.ai-chat-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);display:none;align-items:flex-end;justify-content:center;z-index:9999}',
      '.ai-chat-overlay.open{display:flex}',
      '.ai-chat-panel{background:#fff;width:100%;max-width:520px;height:85vh;border-radius:16px 16px 0 0;display:flex;flex-direction:column;box-shadow:0 -8px 32px rgba(0,0,0,.2);font-family:"Inter",sans-serif}',
      '@media(min-width:640px){.ai-chat-overlay{align-items:center}.ai-chat-panel{border-radius:16px;height:80vh;max-height:720px}}',
      '.ai-chat-head{padding:14px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#0696D7,#0580b8);color:#fff;border-radius:16px 16px 0 0}',
      '.ai-chat-head h3{flex:1;font-size:15px;font-weight:700;margin:0}',
      '.ai-chat-head p{font-size:11px;opacity:.9;margin:0}',
      '.ai-chat-close{background:rgba(255,255,255,.2);border:none;color:#fff;width:30px;height:30px;border-radius:50%;font-size:18px;cursor:pointer;line-height:1}',
      '.ai-chat-body{flex:1;overflow-y:auto;padding:14px;background:#f8fafc;display:flex;flex-direction:column;gap:10px}',
      '.ai-bubble{max-width:85%;padding:10px 14px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}',
      '.ai-bubble.ai{background:#fff;border:1px solid #e2e8f0;color:#1a2332;align-self:flex-start;border-bottom-left-radius:4px}',
      '.ai-bubble.user{background:#0696D7;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}',
      '.ai-bubble.sys{align-self:center;background:#fef3c7;color:#92400e;font-size:12px;padding:6px 12px;border-radius:8px}',
      '.ai-typing{align-self:flex-start;color:#64748b;font-size:12px;font-style:italic;padding:4px 8px}',
      '.ai-chat-foot{padding:10px 12px;border-top:1px solid #e2e8f0;background:#fff;display:flex;gap:8px;align-items:flex-end;border-radius:0 0 16px 16px}',
      '.ai-chat-foot textarea{flex:1;resize:none;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;max-height:120px;background:#f8fafc}',
      '.ai-chat-foot textarea:focus{outline:none;border-color:#0696D7;background:#fff}',
      '.ai-chat-send{background:#0696D7;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit}',
      '.ai-chat-send:disabled{background:#94a3b8;cursor:not-allowed}',
      '.ai-chat-mic{background:#5D822C;color:#fff;border:none;border-radius:10px;padding:10px 12px;font-size:16px;cursor:pointer}',
      '.ai-chat-mic.rec{background:#dc2626;animation:aiPulse 1s infinite}',
      '@keyframes aiPulse{0%,100%{opacity:1}50%{opacity:.6}}',
      '.ai-fill-btn{margin:8px 0 0 0;background:#5D822C;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}',
      '.ai-fab{position:fixed;right:18px;bottom:18px;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#0696D7,#5D822C);color:#fff;border:none;box-shadow:0 4px 16px rgba(6,150,215,.4);font-size:22px;cursor:pointer;z-index:100}',
      '.ai-chat-banner{display:flex;align-items:center;gap:10px;padding:12px 14px;background:linear-gradient(135deg,#eff6ff,#ecfccb);border:1px solid #bae6fd;border-radius:12px;margin-bottom:14px;cursor:pointer}',
      '.ai-chat-banner:hover{background:linear-gradient(135deg,#dbeafe,#d9f99d)}',
      '.ai-chat-banner .icon{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#0696D7,#5D822C);color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}',
      '.ai-chat-banner .txt{flex:1}',
      '.ai-chat-banner .txt b{display:block;font-size:14px;color:#1a2332}',
      '.ai-chat-banner .txt span{font-size:12px;color:#64748b}',
      '.ai-chat-banner .arrow{color:#0696D7;font-size:18px;font-weight:700}'
    ].join('');
    document.head.appendChild(s);
  }

  // Build (or get) the modal
  function getModal() {
    var el = document.getElementById('aiChatOverlay');
    if (el) return el;
    injectStyles();
    el = document.createElement('div');
    el.id = 'aiChatOverlay';
    el.className = 'ai-chat-overlay';
    el.innerHTML =
      '<div class="ai-chat-panel" onclick="event.stopPropagation()">' +
        '<div class="ai-chat-head">' +
          '<div style="flex:1">' +
            '<h3 id="aiChatTitle">AI Assistant</h3>' +
            '<p id="aiChatSubtitle">Powered by Claude</p>' +
          '</div>' +
          '<button class="ai-chat-close" onclick="closeAIChat()">×</button>' +
        '</div>' +
        '<div class="ai-chat-body" id="aiChatBody"></div>' +
        '<div class="ai-chat-foot">' +
          '<button class="ai-chat-mic" id="aiChatMic" title="Voice input" onclick="toggleAIChatMic()">🎤</button>' +
          '<textarea id="aiChatInput" rows="1" placeholder="Type your message..."></textarea>' +
          '<button class="ai-chat-send" id="aiChatSend" onclick="sendAIChatMessage()">Send</button>' +
        '</div>' +
      '</div>';
    el.addEventListener('click', function(e) {
      if (e.target === el) closeAIChat();
    });
    document.body.appendChild(el);

    // Auto-grow textarea + Enter to send (Shift+Enter = newline)
    var ta = document.getElementById('aiChatInput');
    ta.addEventListener('input', function() {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    });
    ta.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAIChatMessage();
      }
    });
    return el;
  }

  // State
  var state = {
    mode: 'support',
    history: [],  // [{role:'user'|'assistant', content:''}]
    config: null,
    busy: false
  };

  function addBubble(who, text) {
    var body = document.getElementById('aiChatBody');
    var div = document.createElement('div');
    div.className = 'ai-bubble ' + who;
    div.textContent = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  }

  function addTyping() {
    var body = document.getElementById('aiChatBody');
    var div = document.createElement('div');
    div.className = 'ai-typing';
    div.id = 'aiChatTyping';
    div.textContent = 'Claude is thinking…';
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }
  function removeTyping() {
    var t = document.getElementById('aiChatTyping');
    if (t) t.remove();
  }

  function buildSystemPrompt() {
    if (state.mode === 'support') {
      return 'You are a friendly support assistant for the Northern Wolves AC Field Reporting PWA. ' +
        'Help HVAC technicians who are having trouble logging in or signing up. ' +
        'Common issues: forgot password (tell them to click "Forgot password?"), email not confirmed (check inbox/spam for confirmation link), wrong email, account not yet created (tap Sign Up). ' +
        'If they cannot resolve it, tell them to contact their manager Russ / Northern Wolves AC office. ' +
        'Keep answers short (1-3 sentences), plain language, no markdown.';
    }
    // form-fill
    var ctx = REPORT_CONTEXT[state.config.reportType] || 'HVAC field report.';
    var fieldList = (state.config.fields || []).map(function(f) {
      return '- ' + f.id + ' (' + (f.label || f.id) + ')';
    }).join('\n');
    return 'You are an HVAC field report assistant for Northern Wolves AC (NY/NJ). ' +
      'Context: ' + ctx + '\n' +
      'The technician will describe what happened on the job. Your goal: collect enough detail to fill this report form, then output the filled values.\n\n' +
      'FORM FIELDS:\n' + fieldList + '\n\n' +
      'RULES:\n' +
      '1. Ask short, focused follow-up questions one or two at a time (equipment, symptoms, diagnosis, work done, parts, readings, recommendations). Do not ask everything at once.\n' +
      '2. Use plain conversational language. No markdown, no lists in chat replies.\n' +
      '3. When you have enough info OR when the tech says "fill it in" / "done" / "generate", reply with ONLY a JSON code block in this exact format (no prose before or after):\n' +
      '```json\n{"fill": {"fieldId": "value", ...}}\n```\n' +
      'Only include fields you have real info for. Write values in professional past tense ("Technician found..."). Keep textareas to 2-5 sentences.';
  }

  async function callClaude(messages) {
    // Stitch history into a single prompt the existing proxy supports
    var sys = buildSystemPrompt();
    var convo = messages.map(function(m) {
      return (m.role === 'user' ? 'Technician: ' : 'Assistant: ') + m.content;
    }).join('\n\n');
    var prompt = sys + '\n\n---\n\n' + convo + '\n\nAssistant:';

    var res = await fetch(AI_PROXY_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'generate_summary', prompt: prompt }),
      headers: { 'Content-Type': 'text/plain' }
    });
    var text = await res.text();
    var result;
    try { result = JSON.parse(text); }
    catch(e) { throw new Error('AI returned invalid response'); }
    if (!result.success) throw new Error(result.error || 'AI request failed');
    return (result.summary || '').trim();
  }

  function tryParseFill(reply) {
    // Look for ```json ... ``` block
    var m = reply.match(/```json\s*([\s\S]*?)```/);
    var jsonStr = m ? m[1] : null;
    if (!jsonStr) {
      // Maybe raw JSON
      var trimmed = reply.trim();
      if (trimmed.charAt(0) === '{' && trimmed.indexOf('"fill"') !== -1) jsonStr = trimmed;
    }
    if (!jsonStr) return null;
    try {
      var obj = JSON.parse(jsonStr);
      if (obj && obj.fill && typeof obj.fill === 'object') return obj.fill;
    } catch(e) {}
    return null;
  }

  async function sendAIChatMessage() {
    if (state.busy) return;
    var ta = document.getElementById('aiChatInput');
    var text = (ta.value || '').trim();
    if (!text) return;
    ta.value = '';
    ta.style.height = 'auto';
    addBubble('user', text);
    state.history.push({ role: 'user', content: text });
    state.busy = true;
    document.getElementById('aiChatSend').disabled = true;
    addTyping();
    try {
      var reply = await callClaude(state.history);
      removeTyping();
      var fill = (state.mode === 'form-fill') ? tryParseFill(reply) : null;
      if (fill) {
        state.history.push({ role: 'assistant', content: reply });
        var count = Object.keys(fill).length;
        var b = addBubble('ai', 'I have enough to fill in ' + count + ' field' + (count===1?'':'s') + '. Tap below to apply to your report.');
        var btn = document.createElement('button');
        btn.className = 'ai-fill-btn';
        btn.textContent = '✨ Fill Report (' + count + ' fields)';
        btn.onclick = function() {
          if (state.config && typeof state.config.onFill === 'function') {
            try { state.config.onFill(fill); } catch(e) { console.error(e); }
          }
          addBubble('sys', 'Fields applied. Review before submitting.');
          btn.remove();
        };
        b.appendChild(document.createElement('br'));
        b.appendChild(btn);
      } else {
        state.history.push({ role: 'assistant', content: reply });
        addBubble('ai', reply);
      }
    } catch(err) {
      removeTyping();
      addBubble('sys', 'Error: ' + err.message);
    } finally {
      state.busy = false;
      document.getElementById('aiChatSend').disabled = false;
    }
  }

  // ---- Voice input via Web Speech API ----
  var recog = null;
  function toggleAIChatMic() {
    var btn = document.getElementById('aiChatMic');
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      addBubble('sys', 'Voice input not supported on this device. Please type.');
      return;
    }
    if (recog) { try { recog.stop(); } catch(e){} recog = null; btn.classList.remove('rec'); return; }
    recog = new SR();
    recog.lang = 'en-US';
    recog.interimResults = true;
    recog.continuous = true;
    var ta = document.getElementById('aiChatInput');
    var baseline = ta.value;
    recog.onresult = function(e) {
      var txt = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        txt += e.results[i][0].transcript;
      }
      ta.value = (baseline ? baseline + ' ' : '') + txt;
      ta.dispatchEvent(new Event('input'));
    };
    recog.onend = function() { btn.classList.remove('rec'); recog = null; };
    recog.onerror = function() { btn.classList.remove('rec'); recog = null; };
    try { recog.start(); btn.classList.add('rec'); } catch(e) {}
  }

  function openAIChat(config) {
    config = config || {};
    state.mode = config.mode || 'support';
    state.config = config;
    state.history = [];
    state.busy = false;
    getModal();
    var body = document.getElementById('aiChatBody');
    body.innerHTML = '';
    document.getElementById('aiChatTitle').textContent =
      state.mode === 'form-fill' ? 'AI Report Assistant' : 'Login Help';
    document.getElementById('aiChatSubtitle').textContent =
      state.mode === 'form-fill'
        ? 'Describe your job — I\'ll fill in the report'
        : 'Having trouble logging in? Ask me anything.';
    var greeting = state.mode === 'form-fill'
      ? 'Hey! Tell me what you did on this ' + (REPORT_CONTEXT[config.reportType] ? config.reportType.replace('-', ' ') : 'job') + ' — the customer, equipment, what you found, and what you did. You can talk naturally or tap the mic 🎤 to dictate.'
      : 'Hi! I can help with login issues. What\'s going on — can\'t log in, forgot password, didn\'t get a confirmation email, or something else?';
    addBubble('ai', greeting);
    state.history.push({ role: 'assistant', content: greeting });
    document.getElementById('aiChatOverlay').classList.add('open');
    setTimeout(function() {
      var ta = document.getElementById('aiChatInput');
      if (ta) ta.focus();
    }, 100);
  }

  function closeAIChat() {
    var el = document.getElementById('aiChatOverlay');
    if (el) el.classList.remove('open');
    if (recog) { try { recog.stop(); } catch(e){} recog = null; }
  }

  // Expose
  window.openAIChat = openAIChat;
  window.closeAIChat = closeAIChat;
  window.sendAIChatMessage = sendAIChatMessage;
  window.toggleAIChatMic = toggleAIChatMic;
})();
