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

    // 6. Restore photos
    _restorePhotos(fd);

    // 7. Restore project selection
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
    if (!window.photosByEquip[key]) window.photosByEquip[key] = [];
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
