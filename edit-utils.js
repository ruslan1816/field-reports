/**
 * edit-utils.js — Northern Wolves AC
 * ====================================
 * Enables editing/revising submitted reports.
 *
 * Usage: Include in any report HTML, then call initEditMode('service-call')
 * after the form loads. Detects ?edit=CLOUD_ID in the URL, fetches the
 * report from Supabase, and fills the form.
 *
 * On re-submit, forms call saveOrUpdateReport() instead of saveReportToCloud().
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

    var result = await getReportById(editId);
    if (!result.data || !result.data.form_data) {
      if (typeof showToast === 'function') showToast('Could not load report');
      console.error('[edit-utils] Report not found:', editId);
      return false;
    }

    _editingCloudId = editId;
    _editingReportNumber = result.data.report_number;
    _editingReportData = result.data;

    var fd = result.data.form_data;

    // 1. Restore report ID
    if (fd.reportId) {
      var reportIdEl = document.getElementById('reportId');
      if (reportIdEl) reportIdEl.textContent = fd.reportId;
      if (typeof window.reportId !== 'undefined') window.reportId = fd.reportId;
    }

    // 2. Restore simple fields (inputs, selects, textareas)
    _restoreSimpleFields(fd);

    // 3. Restore radio buttons
    _restoreRadios(fd);

    // 4. Restore condition selectors (site-survey style)
    _restoreConditions(fd);

    // 5. Restore checkbox groups
    _restoreCheckboxes(fd);

    // 6. Restore equipment array (site-survey) — MUST run BEFORE _restorePhotos
    //    so the equip_N photo preview containers exist before we try to
    //    populate them.
    _restoreEquipment(fd);

    // 7. Restore parts / labor / readings (service-call, startup, work-order)
    _restorePartsAndLabor(fd);

    // 8. Restore photos (now that equipment cards exist)
    _restorePhotos(fd);

    // 9. Restore project selection
    _restoreProject(result.data);

    // 8. Show edit mode badge
    _showEditBadge();

    if (typeof showToast === 'function') showToast('Report loaded — edit and resend');
    console.log('[edit-utils] Report loaded for editing:', _editingReportNumber);
    return true;

  } catch (err) {
    console.error('[edit-utils] Error loading report:', err);
    if (typeof showToast === 'function') showToast('Error loading report');
    return false;
  }
}

// ========== FIELD RESTORATION ==========

function _restoreSimpleFields(fd) {
  var skip = ['reportId', 'equipment', 'photos', 'photosByEquip', 'parts',
              'readings', 'techSig', 'custSig', 'aiSummary', 'statusByEquip',
              '_parts', '_equipment', '_readings', '_photosByEquip', '_statusByEquip',
              '_photos', '_projectId'];

  Object.keys(fd).forEach(function(key) {
    if (skip.indexOf(key) !== -1) return;
    var value = fd[key];
    if (typeof value !== 'string' && typeof value !== 'number') return;

    var el = document.getElementById(key);
    if (!el) return;
    if (el.type === 'checkbox' || el.type === 'radio') return; // handle separately

    el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function _restoreRadios(fd) {
  // Common radio group names across forms
  var radioNames = ['callType', 'systemStatus', 'priority', 'crane', 'unitOperable'];

  radioNames.forEach(function(name) {
    if (!fd[name]) return;
    var radio = document.querySelector('input[name="' + name + '"][value="' + fd[name] + '"]');
    if (radio) {
      radio.checked = true;
      // Trigger visual selection on parent .check-item
      var item = radio.closest('.check-item');
      if (item) item.classList.add('selected');
    }
  });
}

function _restoreConditions(fd) {
  // Condition selectors use dataset.value on parent div
  var conditionIds = ['ductCondition', 'insCondition', 'pipeCondition'];

  conditionIds.forEach(function(id) {
    var val = fd[id];
    if (!val) return;
    var el = document.getElementById(id);
    if (!el) return;
    el.dataset.value = val;
    // Highlight the matching button
    el.querySelectorAll('.condition-btn').forEach(function(btn) {
      btn.classList.remove('good', 'fair', 'poor', 'eol');
      if (btn.textContent.trim() === val) {
        if (val === 'Good') btn.classList.add('good');
        else if (val === 'Fair') btn.classList.add('fair');
        else if (val === 'Poor') btn.classList.add('poor');
        else if (val === 'End of Life') btn.classList.add('eol');
      }
    });
  });
}

function _restoreCheckboxes(fd) {
  // Purpose checkboxes (site-survey)
  if (fd.purpose) {
    var purposes = fd.purpose.split(', ');
    purposes.forEach(function(val) {
      var cb = document.querySelector('#purposeGroup input[value="' + val + '"]');
      if (cb) {
        cb.checked = true;
        var item = cb.closest('.check-item');
        if (item) item.classList.add('selected');
      }
    });
  }
}

function _restorePhotos(fd) {
  var photoData = fd.photosByEquip || fd._photosByEquip;
  if (!photoData || typeof window.photosByEquip === 'undefined') return;

  Object.keys(photoData).forEach(function(key) {
    var arr = photoData[key];
    if (!arr || !arr.length) return;
    // REPLACE (don't append) — otherwise re-opening a report for edit
    // would duplicate the default-initialized empty arrays or existing
    // saved photos.
    window.photosByEquip[key] = [];
    arr.forEach(function(photo) {
      if (photo && photo.data) {
        window.photosByEquip[key].push({ name: photo.name || '', data: photo.data });
      }
    });
  });

  // Re-render all photo previews
  if (typeof renderEquipPhotos === 'function') {
    Object.keys(window.photosByEquip).forEach(function(key) {
      renderEquipPhotos(key);
    });
  }
}

/**
 * Restore the equipment array (site-survey-style forms that use
 * addEquipment() + .equip-card + photosByEquip.equip_N).
 *
 * Site-survey seeds the page with one empty equipment card on load.
 * We wipe it and recreate one card per item in fd.equipment, filling in
 * every field (type, mfg, model, serial, age/year, capacity, location,
 * condition, notes). photosByEquip.equip_N keys are re-initialized
 * empty — _restorePhotos (called next) populates them with actual photos.
 */
function _restoreEquipment(fd) {
  if (!Array.isArray(fd.equipment) || !fd.equipment.length) return;
  if (typeof window.addEquipment !== 'function') return; // form doesn't have equipment

  var list = document.getElementById('equipList');
  if (!list) return;

  // Clear existing cards (page load creates one default empty one)
  list.innerHTML = '';
  // Reset the equipment counter if the form exposes it
  if (typeof window.equipCount !== 'undefined') window.equipCount = 0;
  // Clear existing equip_N keys from photosByEquip (will be reseeded by addEquipment)
  if (window.photosByEquip) {
    Object.keys(window.photosByEquip).forEach(function(k) {
      if (k.indexOf('equip_') === 0) delete window.photosByEquip[k];
    });
  }

  var condClassMap = { 'Good': 'good', 'Fair': 'fair', 'Poor': 'poor', 'End of Life': 'eol' };

  fd.equipment.forEach(function(eq) {
    window.addEquipment();
    // Find the just-added card (it's the last .equip-card in the list)
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

    // Condition — dataset.value + highlight matching button
    if (eq.condition) {
      var condEl = card.querySelector('[id^="cond_"]');
      if (condEl) {
        condEl.dataset.value = eq.condition;
        var cls = condClassMap[eq.condition];
        condEl.querySelectorAll('.condition-btn').forEach(function(btn) {
          btn.classList.remove('good', 'fair', 'poor', 'eol');
          if (cls && btn.textContent.trim() === eq.condition) {
            btn.classList.add(cls);
          }
        });
      }
    }
  });
}

/**
 * Restore dynamic parts / labor / readings rows for forms that have them
 * (service-call has addPart + addLabor, work-order has addPartRow, etc.).
 * Each row container is cleared and repopulated from the saved arrays.
 */
function _restorePartsAndLabor(fd) {
  // Service Call style: .parts-row in #partsList via addPart()
  if (Array.isArray(fd.parts) && fd.parts.length && typeof window.addPart === 'function') {
    var partsList = document.getElementById('partsList');
    if (partsList) partsList.innerHTML = '';
    fd.parts.forEach(function(p) {
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
  }

  // Labor rows (service-call): .labor-row in #laborList via addLabor()
  if (Array.isArray(fd.labor) && fd.labor.length && typeof window.addLabor === 'function') {
    var laborList = document.getElementById('laborList');
    if (laborList) laborList.innerHTML = '';
    fd.labor.forEach(function(l) {
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

  // Work-Order style: addPartRow() -> #partsList rows with different class names.
  // We try the common shape and fall back gracefully if fields don't match.
  if (Array.isArray(fd.parts) && fd.parts.length && typeof window.addPartRow === 'function' && typeof window.addPart !== 'function') {
    var woList = document.getElementById('partsList');
    if (woList) woList.innerHTML = '';
    fd.parts.forEach(function(p) {
      window.addPartRow();
      var rows = woList ? woList.children : [];
      var row = rows[rows.length - 1];
      if (!row) return;
      var inputs = row.querySelectorAll('input');
      if (inputs[0] && p.desc != null) inputs[0].value = String(p.desc || p.description || '');
      if (inputs[1] && p.qty != null) inputs[1].value = String(p.qty || p.quantity || '');
      if (inputs[2] && p.cost != null) inputs[2].value = String(p.cost || '');
    });
  }

  // Cost calc refresh if available
  if (typeof window.calcCosts === 'function') {
    try { window.calcCosts(); } catch(e) {}
  }
}

function _restoreProject(reportRow) {
  // If report was linked to a project, try to re-select it
  var fd = reportRow.form_data;
  var projectId = fd._projectId;
  if (projectId && typeof selectProject === 'function') {
    try { selectProject(projectId); } catch(e) { console.log('[edit-utils] Could not restore project:', e); }
  }
}

// ========== EDIT MODE UI ==========

function _showEditBadge() {
  // Badge below header
  var badge = document.createElement('div');
  badge.id = 'editModeBadge';
  badge.style.cssText = 'position:sticky;top:48px;z-index:100;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;text-align:center;padding:10px 16px;font-size:13px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.15);';
  badge.innerHTML = '<span style="font-size:15px;vertical-align:middle;margin-right:6px">&#9998;</span> Editing: ' +
    _editingReportNumber +
    ' <span style="font-weight:400;opacity:.85;margin-left:6px">\u2014 changes will update the existing report</span>';

  var header = document.querySelector('header');
  if (header && header.nextSibling) {
    header.parentNode.insertBefore(badge, header.nextSibling);
  } else {
    document.body.insertBefore(badge, document.body.firstChild);
  }

  // Change send button text to "Update & Resend"
  var sendBtns = document.querySelectorAll('.btn-success');
  sendBtns.forEach(function(btn) {
    if (btn.textContent.indexOf('Send') !== -1 || btn.onclick) {
      btn.innerHTML = '&#9998; Update &amp; Resend';
    }
  });

  // Change "Draft" button to "Save Changes" if exists
  var draftBtns = document.querySelectorAll('.btn-primary');
  draftBtns.forEach(function(btn) {
    if (btn.textContent.indexOf('Draft') !== -1) {
      btn.innerHTML = '&#128190; Save Changes';
    }
  });
}

// ========== PUBLIC API ==========

function isEditMode() {
  return !!_editingCloudId;
}

function getEditingCloudId() {
  return _editingCloudId;
}

function getEditingReportNumber() {
  return _editingReportNumber;
}

/**
 * Save or update a report depending on edit mode.
 * Drop-in replacement for saveReportToCloud().
 */
async function saveOrUpdateReport(formType, formData, options) {
  if (isEditMode()) {
    console.log('[edit-utils] Updating existing report:', _editingCloudId);
    var customerName = formData.custName || formData.customerName || formData.customer || '';
    var techName = formData.techName || formData.fromName || '';
    var reportDate = formData.callDate || formData.suDate || formData.pmDate || formData.coDate ||
                     formData.surveyDate || formData.rfiDate || formData.woDate || new Date().toISOString().split('T')[0];
    return updateReportInCloud(_editingCloudId, {
      form_data: formData,
      status: 'submitted',
      customer_name: customerName,
      tech_name: techName,
      report_date: reportDate
    });
  } else {
    return saveReportToCloud(formType, formData, options);
  }
}
