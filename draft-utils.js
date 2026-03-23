// ===== DRAFT MANAGEMENT UTILITIES =====
// Shared across all report forms

const DRAFTS_STORAGE_KEY = 'nw_drafts';
const HISTORY_STORAGE_KEY = 'nw_history';

// Generate unique draft ID (timestamp-based)
function generateDraftId() {
  return 'draft_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Initialize form with draft data if loading from draft
function initializeDraftForm(formType, storageKey) {
  const params = new URLSearchParams(window.location.search);
  const draftId = params.get('draft');

  if (draftId) {
    const drafts = JSON.parse(localStorage.getItem(DRAFTS_STORAGE_KEY) || '[]');
    const draft = drafts.find(d => d.id === draftId);
    if (draft && draft.data) {
      // Load from saved draft data
      const savedData = JSON.parse(localStorage.getItem(draft.data) || '{}');
      restoreFormData(savedData);
      window.__currentDraftId = draftId;
      return draftId;
    }
  }

  // New form - generate new draft ID
  const newId = generateDraftId();
  window.__currentDraftId = newId;
  return newId;
}

// Save current form as draft entry
function saveDraftEntry(formType, reportForm) {
  const draftId = window.__currentDraftId;
  if (!draftId) return;

  const drafts = JSON.parse(localStorage.getItem(DRAFTS_STORAGE_KEY) || '[]');

  // Generate title from form data
  const customerName = document.getElementById('custName')?.value || 'Untitled';
  const equipType = document.getElementById('equipType')?.value || '';
  const title = customerName + (equipType ? ' - ' + equipType : '');

  // Find or create draft entry
  let draftEntry = drafts.find(d => d.id === draftId);
  if (!draftEntry) {
    draftEntry = {
      id: draftId,
      type: formType,
      title: title,
      customer: customerName,
      date: new Date().toLocaleDateString(),
      lastModified: new Date().toISOString(),
      formPage: reportForm,
      data: 'nw_draft_' + draftId  // localStorage key for form data
    };
    drafts.push(draftEntry);
  } else {
    draftEntry.title = title;
    draftEntry.customer = customerName;
    draftEntry.lastModified = new Date().toISOString();
  }

  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  return draftId;
}

// Save report as completed history entry
function saveToHistory(formType, data) {
  const history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
  const draftId = window.__currentDraftId;

  // Remove draft entry if it exists
  if (draftId) {
    const drafts = JSON.parse(localStorage.getItem(DRAFTS_STORAGE_KEY) || '[]');
    const filtered = drafts.filter(d => d.id !== draftId);
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(filtered));
  }

  // Add history entry
  const historyEntry = {
    id: generateDraftId(),
    type: formType,
    title: (data.custName || 'Report') + (data.equipType ? ' - ' + data.equipType : ''),
    customer: data.custName || '',
    address: data.custAddress || '',
    date: data.callDate || new Date().toLocaleDateString(),
    completedAt: new Date().toISOString(),
    techName: data.techName || '',
    reportId: data.reportId || ''
  };

  history.push(historyEntry);
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));

  // Clear the draft data
  if (draftId) {
    localStorage.removeItem('nw_draft_' + draftId);
  }
}

// Helper to restore form data from saved state
function restoreFormData(data) {
  Object.keys(data).forEach(key => {
    const el = document.getElementById(key);
    if (el) {
      if (el.type === 'checkbox') el.checked = data[key];
      else if (el.type === 'radio') {
        const radio = document.querySelector(`input[name="${key}"][value="${data[key]}"]`);
        if (radio) radio.checked = true;
      } else {
        el.value = data[key];
      }
    }
  });
}
