/**
 * edit-utils.js — Northern Wolves AC
 * ====================================
 * Restores a submitted report from Supabase into the form for editing.
 *
 * Each report type saves a JSONB form_data blob with different field names.
 * This file knows about every shape and restores each piece back onto the DOM
 * so the tech can edit and resubmit without retyping.
 *
 * Usage: included in each report HTML. On load, each report calls
 *        initEditMode('<type>') after the form's DOM is ready.
 */

var _editingCloudId = null;
var _editingReportNumber = null;
var _editingReportData = null;

/**
 * Initialize edit mode if ?edit= param is present.
 * Call AFTER the form DOM is ready and all fields/equipment/photos are set up.
 */
async function initEditMode(formType) {
  var params = new URLSearchParams(window.location.search);
  var editId = params.get('edit');
  if (!editId) return false;

  try {
    if (typeof showToast === 'function') showToast('Loading report...');

    if (typeof getReportById !== 'function') {
      console.error('[edit-utils] getReportById not available — cloud-save.js not loaded?');
      if (typeof showToast === 'function') showToast('Cannot load — cloud module missing');
      return false;
    }

    var result = await getReportById(editId);
    if (!result || !result.data || !result.data.form_data) {
      if (typeof showToast === 'function') showToast('Could not load report');
      console.error('[edit-utils] Report not found:', editId, result && result.error);
      return false;
    }

    _editingCloudId = editId;
    _editingReportNumber = result.data.report_number;
    _editingReportData = result.data;

    var fd = result.data.form_data;

    // 1. Restore reportId (displayed at the top)
    if (fd.reportId) {
      var reportIdEl = document.getElementById('reportId');
      if (reportIdEl) reportIdEl.textContent = fd.reportId;
      if (typeof window.reportId !== 'undefined') window.reportId = fd.reportId;
    }

    // 2. Simple fields (inputs, selects, textareas)
    _restoreSimpleFields(fd);

    // 3. Radio groups (priority, status, callType, result, etc.)
    _restoreRadios(fd);

    // 4. Condition selectors (site-survey ductwork/insulation/piping)
    _restoreConditions(fd);

    // 5. Checkbox multi-select groups (purpose)
    _restoreCheckboxes(fd);

    // 6. Equipment cards — MUST run before photos & readings & per-equipment
    //    status, because those reference equip_N containers that addEquipment()
    //    seeds.
    _restoreEquipment(fd);

    // 7. Parts and labor dynamic rows
    _restorePartsAndLabor(fd);

    // 8. Readings tables (service-call .reading-input, startup cool/heat)
    _restoreReadings(fd);

    // 9. Per-equipment operational status (service-call/work-order/pm-checklist/startup)
    _restoreStatusByEquip(fd);

    // 10. PM-checklist pass/fail/na items
    _restoreChecklistResults(fd);

    // 11. Photos (equipment cards now exist so equip_N containers are present)
    _restorePhotos(fd);

    // 12. Signatures (redraw the saved PNG base64 into the sig pad canvas)
    _restoreSignatures(fd);

    // 13. AI summary panel text
    _restoreAISummary(fd);

    // 14. Project selection
    _restoreProject(result.data);

    // 15. Edit-mode UI (badge + button text)
    _showEditBadge();

    if (typeof showToast === 'function') showToast('Report loaded — edit and resend');
    console.log('[edit-utils] Report loaded for editing:', _editingReportNumber);
    return true;

  } catch (err) {
    console.error('[edit-utils] Error loading report:', err);
    if (typeof showToast === 'function') showToast('Error loading report: ' + (err && err.message ? err.message : 'unknown'));
    return false;
  }
}

// ========== FIELD RESTORATION ==========

function _restoreSimpleFields(fd) {
  // Keys handled by dedicated restorers (skip in the simple-field loop)
  var skip = {
    reportId: 1, equipment: 1, photos: 1, photosByEquip: 1,
    parts: 1, labor: 1, readings: 1, coolReadings: 1, heatReadings: 1,
    techSig: 1, custSig: 1, submitterSig: 1, fmSig: 1,
    aiSummary: 1, statusByEquip: 1, checklistResults: 1,
    _parts: 1, _labor: 1, _equipment: 1, _readings: 1,
    _photosByEquip: 1, _statusByEquip: 1, _photos: 1,
    _projectId: 1, _cloudId: 1, _revisionNumber: 1,
    _coStatus: 1, _rfiStatus: 1
  };

  Object.keys(fd).forEach(function(key) {
    if (skip[key]) return;
    var value = fd[key];
    if (typeof value !== 'string' && typeof value !== 'number') return;

    var el = document.getElementById(key);
    if (!el) return;
    if (el.type === 'checkbox' || el.type === 'radio') return; // handled separately
    // <span>/<div> cost totals etc. — set textContent, not value
    if (el.tagName === 'SPAN' || el.tagName === 'DIV') {
      el.textContent = String(value);
      return;
    }

    el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function _restoreRadios(fd) {
  // Every radio group name that appears across the 7 report forms.
  // If a form doesn't have the radio, the querySelector just returns null and
  // we skip silently.
  var radioNames = [
    'callType',        // service-call
    'systemStatus',    // legacy — harmless
    'priority',        // site-survey + work-order
    'crane',           // site-survey
    'unitOperable',    // legacy — harmless
    'result',          // startup (PASS/CONDITIONAL/FAIL)
    'status',          // work-order
    'coStatus',        // change-order
    'rfiStatus',       // rfi
    'rfiPriority'      // rfi
  ];

  radioNames.forEach(function(name) {
    var val = fd[name];
    if (val == null || val === '') return;
    var radio = document.querySelector('input[name="' + name + '"][value="' + String(val).replace(/"/g, '\\"') + '"]');
    if (!radio) return;
    radio.checked = true;
    var item = radio.closest('.check-item');
    if (item) item.classList.add('selected');
  });
}

function _restoreConditions(fd) {
  // Site-survey-style condition selectors: <div id="xxxCondition" data-value="">
  //   with child buttons that get the good/fair/poor/eol/na classes.
  var conditionIds = ['ductCondition', 'insCondition', 'pipeCondition'];
  var classMap = {
    'Good': 'good', 'Fair': 'fair', 'Poor': 'poor',
    'End of Life': 'eol', 'EOL': 'eol', 'N/A': 'na'
  };

  conditionIds.forEach(function(id) {
    var val = fd[id];
    if (!val) return;
    var el = document.getElementById(id);
    if (!el) return;
    el.dataset.value = val;
    el.querySelectorAll('.condition-btn').forEach(function(btn) {
      btn.classList.remove('good', 'fair', 'poor', 'eol', 'na');
      if (btn.textContent.trim() === val) {
        var cls = classMap[val];
        if (cls) btn.classList.add(cls);
      }
    });
  });
}

function _restoreCheckboxes(fd) {
  // site-survey Purpose checkboxes
  if (fd.purpose) {
    var purposes = String(fd.purpose).split(', ');
    purposes.forEach(function(val) {
      var cb = document.querySelector('#purposeGroup input[value="' + val.replace(/"/g, '\\"') + '"]');
      if (cb) {
        cb.checked = true;
        var item = cb.closest('.check-item');
        if (item) item.classList.add('selected');
      }
    });
  }
}

/**
 * Restore photos across all forms.
 * - Main key: fd.photosByEquip
 * - Legacy: fd._photosByEquip (older saves)
 * - Change-order: fd._photos (flat array, different key)
 */
function _restorePhotos(fd) {
  if (typeof window.photosByEquip === 'undefined') return;

  var source = fd.photosByEquip || fd._photosByEquip || null;
  if (source && typeof source === 'object') {
    Object.keys(source).forEach(function(key) {
      var arr = source[key];
      if (!arr || !arr.length) return;
      window.photosByEquip[key] = [];  // REPLACE, don't append
      arr.forEach(function(photo) {
        if (photo && photo.data) {
          window.photosByEquip[key].push({ name: photo.name || '', data: photo.data });
        }
      });
    });
  }

  // Change-order uses a flat array at fd._photos keyed to the 'additional' bucket.
  if (Array.isArray(fd._photos) && fd._photos.length) {
    window.photosByEquip['additional'] = [];
    fd._photos.forEach(function(p) {
      if (p && p.data) window.photosByEquip['additional'].push({ name: p.name || '', data: p.data });
    });
  }

  if (typeof renderEquipPhotos === 'function') {
    Object.keys(window.photosByEquip).forEach(function(key) {
      try { renderEquipPhotos(key); } catch(e) {}
    });
  }
}

/**
 * Restore the equipment array (site-survey-style forms use addEquipment() +
 * .equip-card). Clears the default empty card and recreates one per saved item.
 */
function _restoreEquipment(fd) {
  if (!Array.isArray(fd.equipment) || !fd.equipment.length) return;
  if (typeof window.addEquipment !== 'function') return;

  var list = document.getElementById('equipList');
  if (!list) return;

  list.innerHTML = '';
  if (typeof window.equipCount !== 'undefined') window.equipCount = 0;
  if (window.photosByEquip) {
    Object.keys(window.photosByEquip).forEach(function(k) {
      if (k.indexOf('equip_') === 0) delete window.photosByEquip[k];
    });
  }

  var condClassMap = {
    'Good': 'good', 'Fair': 'fair', 'Poor': 'poor',
    'End of Life': 'eol', 'EOL': 'eol', 'N/A': 'na'
  };

  fd.equipment.forEach(function(eq) {
    window.addEquipment();
    var cards = list.querySelectorAll('.equip-card');
    var card = cards[cards.length - 1];
    if (!card) return;

    function setField(cls, val) {
      var el = card.querySelector('.' + cls);
      if (el && val != null) el.value = String(val);
    }
    setField('eq-type', eq.type);
    setField('eq-mfg', eq.mfg);
    setField('eq-model', eq.model);
    setField('eq-serial', eq.serial);
    setField('eq-age', eq.age);
    setField('eq-cap', eq.capacity);
    setField('eq-loc', eq.location);
    setField('eq-notes', eq.notes);
    setField('eq-refrigerant', eq.refrigerant);

    if (eq.condition) {
      var condEl = card.querySelector('[id^="cond_"]');
      if (condEl) {
        condEl.dataset.value = eq.condition;
        var cls = condClassMap[eq.condition];
        condEl.querySelectorAll('.condition-btn').forEach(function(btn) {
          btn.classList.remove('good', 'fair', 'poor', 'eol', 'na');
          if (cls && btn.textContent.trim() === eq.condition) btn.classList.add(cls);
        });
      }
    }
  });
}

/**
 * Restore dynamic parts / labor rows.
 *   service-call: addPart() + .parts-row + .part-desc/.part-qty
 *                 addLabor() + .labor-row + .labor-tech/.labor-hrs/.labor-rate
 *   work-order:   addPartRow() + generic inputs[] order
 *   change-order: same as work-order but data lives under fd._parts
 */
function _restorePartsAndLabor(fd) {
  // Combine both key names change-order and work-order use
  var parts = fd.parts || fd._parts || null;
  var labor = fd.labor || fd._labor || null;

  if (Array.isArray(parts) && parts.length) {
    if (typeof window.addPart === 'function') {
      var partsList = document.getElementById('partsList');
      if (partsList) partsList.innerHTML = '';
      parts.forEach(function(p) {
        window.addPart();
        var rows = partsList ? partsList.querySelectorAll('.parts-row') : [];
        var row = rows[rows.length - 1];
        if (!row) return;
        var set = function(cls, val) {
          var el = row.querySelector('.' + cls);
          if (el && val != null) el.value = String(val);
        };
        set('part-desc', p.desc || p.description);
        set('part-qty', p.qty || p.quantity);
        set('part-cost', p.cost || p.price);
      });
    } else if (typeof window.addPartRow === 'function') {
      var woList = document.getElementById('partsList');
      if (woList) woList.innerHTML = '';
      parts.forEach(function(p) {
        window.addPartRow();
        var rows = woList ? woList.children : [];
        var row = rows[rows.length - 1];
        if (!row) return;
        var inputs = row.querySelectorAll('input');
        if (inputs[0]) inputs[0].value = String(p.desc || p.description || '');
        if (inputs[1]) inputs[1].value = String(p.qty || p.quantity || '');
        if (inputs[2]) inputs[2].value = String(p.cost || '');
      });
    }
  }

  if (Array.isArray(labor) && labor.length && typeof window.addLabor === 'function') {
    var laborList = document.getElementById('laborList');
    if (laborList) laborList.innerHTML = '';
    labor.forEach(function(l) {
      window.addLabor();
      var rows = laborList ? laborList.querySelectorAll('.labor-row') : [];
      var row = rows[rows.length - 1];
      if (!row) return;
      var set = function(cls, val) {
        var el = row.querySelector('.' + cls);
        if (el && val != null) el.value = String(val);
      };
      set('labor-tech', l.tech || l.technician);
      set('labor-hrs', l.hrs || l.hours);
      set('labor-rate', l.rate);
    });
  }

  if (typeof window.calcCosts === 'function') {
    try { window.calcCosts(); } catch (e) {}
  }
}

/**
 * Restore per-equipment readings tables.
 *
 * service-call: fd.readings = { '0': {pressure_before:'150', pressure_after:'155', ...}, ... }
 *               reads `.reading-input` with data-equip=N, data-key=X, data-when=before|after
 *
 * startup:      fd.coolReadings and fd.heatReadings have the same shape, but scoped to
 *               cooling vs heating sub-tables. The element IDs / datasets vary per form,
 *               we try the generic selector and fall through silently if no match.
 */
function _restoreReadings(fd) {
  function apply(readings) {
    if (!readings || typeof readings !== 'object') return;
    Object.keys(readings).forEach(function(equipIdx) {
      var perEquip = readings[equipIdx] || {};
      Object.keys(perEquip).forEach(function(keyWhen) {
        var m = keyWhen.match(/^(.+)_(before|after|cool|heat|actual)$/);
        if (!m) return;
        var key = m[1];
        var when = m[2];
        var selector = '.reading-input[data-equip="' + equipIdx + '"][data-key="' + key + '"][data-when="' + when + '"]';
        var input = document.querySelector(selector);
        if (input) input.value = String(perEquip[keyWhen] || '');
      });
    });
  }
  apply(fd.readings);
  apply(fd.coolReadings);
  apply(fd.heatReadings);
}

/**
 * Restore per-equipment operational status.
 *
 * statusByEquip = { '0': {status: 'Operational', notes: '...'}, '1': {...} }
 * Each equipment gets dynamic radios named `eqStatus_0`, `eqStatus_1`, etc.
 * Plus a .eq-status-notes textarea inside the same equipment card.
 */
function _restoreStatusByEquip(fd) {
  var sbe = fd.statusByEquip || fd._statusByEquip;
  if (!sbe || typeof sbe !== 'object') return;

  Object.keys(sbe).forEach(function(idx) {
    var entry = sbe[idx] || {};
    if (entry.status) {
      var radioName = 'eqStatus_' + idx;
      var radio = document.querySelector('input[name="' + radioName + '"][value="' + String(entry.status).replace(/"/g, '\\"') + '"]');
      if (radio) {
        radio.checked = true;
        var item = radio.closest('.check-item');
        if (item) item.classList.add('selected');
      }
    }
    if (entry.notes) {
      // Scope note lookup to the equipment card container matching this index
      var cards = document.querySelectorAll('.equip-card, [data-equip-index]');
      var card = cards[Number(idx)];
      if (card) {
        var notesEl = card.querySelector('.eq-status-notes, textarea[data-role="eq-status-notes"]');
        if (notesEl) notesEl.value = String(entry.notes);
      } else {
        // Fallback: global match by id
        var byId = document.getElementById('eqStatusNotes_' + idx);
        if (byId) byId.value = String(entry.notes);
      }
    }
  });
}

/**
 * Restore PM checklist results — array of { item: 'X', result: 'pass'|'fail'|'na' }.
 * Matches list items by matching the label/text against each saved entry.
 */
function _restoreChecklistResults(fd) {
  if (!Array.isArray(fd.checklistResults) || !fd.checklistResults.length) return;

  var items = document.querySelectorAll('#checklistItems li, .checklist-item');
  fd.checklistResults.forEach(function(r) {
    if (!r || !r.item || !r.result) return;
    // Find the li whose text content matches r.item (prefix match is more tolerant)
    var target = null;
    items.forEach(function(li) {
      if (target) return;
      var text = (li.textContent || '').trim();
      if (text.indexOf(r.item) === 0 || text === r.item) target = li;
    });
    if (!target) return;
    target.classList.remove('pass', 'fail', 'na');
    target.classList.add(r.result); // expects 'pass' | 'fail' | 'na'
    // Also reflect via any .chk buttons inside
    target.querySelectorAll('.chk').forEach(function(chk) {
      chk.classList.remove('pass', 'fail', 'na', 'selected');
      if ((chk.dataset.val || chk.textContent.trim().toLowerCase()).indexOf(r.result) !== -1) {
        chk.classList.add('selected', r.result);
      }
    });
  });
}

/**
 * Restore the signature pads from their saved PNG base64.
 *
 * Each form instantiates a SignaturePad wrapper over a <canvas>. We iterate
 * all the keys we know about (techSig, custSig, submitterSig, fmSig) and if
 * we have both the saved base64 and a live pad object, redraw.
 */
function _restoreSignatures(fd) {
  var pads = [
    ['techSig', window.techSigPad],
    ['custSig', window.custSigPad],
    ['submitterSig', window.submitterSigPad],
    ['fmSig', window.fmSigPad]
  ];
  pads.forEach(function(pair) {
    var key = pair[0], pad = pair[1];
    var data = fd[key];
    if (!data || typeof data !== 'string' || !pad) return;
    // Detect blank data URLs that real signatures can produce (all-white PNG)
    if (data.length < 200) return;
    try {
      _drawDataUrlIntoPad(pad, data);
    } catch (e) {
      console.warn('[edit-utils] Could not restore signature', key, e);
    }
  });
}

function _drawDataUrlIntoPad(pad, dataUrl) {
  // Our SignaturePad wrapper exposes a `.canvas` property. Draw the saved PNG
  // onto the canvas so it looks the same as when originally signed.
  var canvas = pad && pad.canvas;
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;
  var img = new Image();
  img.onload = function() {
    // Preserve aspect by fitting image into canvas (same approach as original draw)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Some wrappers track "isEmpty" — mark as not-empty so collectData() keeps the value
    if (typeof pad._isEmpty === 'boolean') pad._isEmpty = false;
    if (typeof pad.isEmpty === 'function' && pad._isEmpty !== undefined) {
      // keep override set above
    }
  };
  img.onerror = function() { /* bad base64 — silently ignore */ };
  img.src = dataUrl;
}

function _restoreAISummary(fd) {
  if (!fd.aiSummary) return;
  var el = document.getElementById('aiSummaryText');
  if (el) {
    // ai-summary.js reads the contents of #aiSummaryText; keep it in sync
    if ('value' in el) el.value = fd.aiSummary;
    else el.textContent = fd.aiSummary;
  }
  // Show the AI summary panel if it was hidden
  var panel = document.getElementById('aiSummarySection');
  if (panel) panel.style.display = '';
}

function _restoreProject(reportRow) {
  var fd = reportRow.form_data;
  var projectId = fd._projectId;
  if (projectId && typeof selectProject === 'function') {
    try { selectProject(projectId); } catch(e) {
      console.log('[edit-utils] Could not restore project:', e);
    }
  }
}

// ========== EDIT MODE UI ==========

function _showEditBadge() {
  var badge = document.createElement('div');
  badge.id = 'editModeBadge';
  badge.style.cssText =
    'position:sticky;top:0;z-index:99;' +
    'background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;' +
    'text-align:center;padding:10px 16px;font-size:13px;font-weight:700;' +
    'box-shadow:0 2px 8px rgba(0,0,0,.15);';
  badge.innerHTML =
    '<span style="font-size:15px;vertical-align:middle;margin-right:6px">&#9998;</span>' +
    'Editing: ' + (_editingReportNumber || '') +
    ' <span style="font-weight:400;opacity:.85;margin-left:6px">\u2014 changes will update the existing report</span>';

  // Insert right after the header element (works for <header> or .header)
  var header = document.querySelector('header') || document.querySelector('.header');
  if (header && header.parentNode) {
    if (header.nextSibling) header.parentNode.insertBefore(badge, header.nextSibling);
    else header.parentNode.appendChild(badge);
  } else {
    document.body.insertBefore(badge, document.body.firstChild);
  }

  // Change the main Send button text — but ONLY the one wired to the email
  // sender, not every .btn-success on the page. We match by onclick attribute
  // pattern to avoid renaming e.g. "Save Changes" or "Add Row" buttons that
  // happen to share the success class.
  var sendBtns = document.querySelectorAll(
    '.btn-success[onclick*="generateAndEmail"],' +
    '.btn-success[onclick*="sendReport"],' +
    '.btn-success[onclick*="generateAndSend"],' +
    '.btn-success[onclick*="submit"]'
  );
  sendBtns.forEach(function(btn) {
    btn.innerHTML = '&#9998; Update &amp; Resend';
  });

  // Draft button -> Save Changes (match only buttons whose label actually says "Draft")
  document.querySelectorAll('.btn-primary, .btn-secondary, button').forEach(function(btn) {
    var txt = (btn.textContent || '').trim();
    if (/\bDraft\b/.test(txt)) {
      btn.innerHTML = '&#128190; Save Changes';
    }
  });
}

// ========== PUBLIC API ==========

function isEditMode() { return !!_editingCloudId; }
function getEditingCloudId() { return _editingCloudId; }
function getEditingReportNumber() { return _editingReportNumber; }

/**
 * Save or update a report depending on edit mode.
 * Drop-in replacement for saveReportToCloud().
 */
async function saveOrUpdateReport(formType, formData, options) {
  if (isEditMode()) {
    console.log('[edit-utils] Updating existing report:', _editingCloudId);
    var customerName = formData.custName || formData.customerName || formData.customer || '';
    var techName = formData.techName || formData.fromName || formData.requestedBy || '';
    var reportDate = formData.callDate || formData.suDate || formData.pmDate || formData.coDate ||
                     formData.surveyDate || formData.rfiDate || formData.woDate ||
                     new Date().toISOString().split('T')[0];
    return updateReportInCloud(_editingCloudId, {
      form_data: formData,
      status: 'submitted',
      customer_name: customerName,
      tech_name: techName,
      report_date: reportDate
    });
  }
  return saveReportToCloud(formType, formData, options);
}
