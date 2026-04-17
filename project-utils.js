/**
 * project-utils.js — Shared Project Picker for Northern Wolves AC Field Reports
 *
 * Provides a searchable project picker dropdown that can be injected into
 * any report form. Reads/writes projects from localStorage key 'nw_projects'.
 *
 * Global functions:
 *   getProjects()
 *   saveProjectRecord(projectId, record)
 *   injectProjectPicker(containerIdOrElement, options)
 *   getSelectedProjectId()
 *   getSelectedProject()
 *   clearProjectSelection()
 */

(function () {
  'use strict';

  // ─── CSS (injected once) ──────────────────────────────────────────────
  var STYLE_ID = 'project-picker-styles';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.project-picker { margin-bottom: 8px; }' +
      '.section:has(.project-picker) { overflow: visible; }' +
      '.project-picker label { display:block; font-size:13px; font-weight:700; color:#475569; margin-bottom:6px; }' +
      '.project-search-wrap { position: relative; }' +
      '.project-search { width:100%; padding:10px 12px; border:1px solid #e2e8f0; border-radius:8px; font-size:14px; background:#f8fafc; box-sizing:border-box; }' +
      '.project-search:focus { border-color:#0696D7; background:#fff; outline:none; }' +
      '.project-dropdown { display:none; position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #cbd5e1; border-radius:8px; margin-top:4px; max-height:260px; overflow-y:auto; z-index:9999; box-shadow:0 8px 24px rgba(0,0,0,0.18); -webkit-overflow-scrolling:touch; }' +
      '.project-dropdown.open { display:block; }' +
      '.project-option { padding:12px 14px; cursor:pointer; font-size:14px; border-bottom:1px solid #f1f5f9; }' +
      '.project-option:last-child { border-bottom:none; }' +
      '.project-option:hover { background:#f0f9ff; }' +
      '.project-option.selected { background:#eff6ff; color:#0696D7; font-weight:600; }' +
      '.project-option.none-opt { color:#94a3b8; font-style:italic; }' +
      '.project-option.add-opt { color:#0696D7; font-weight:600; }' +
      '.project-quick-add { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-top:8px; }' +
      '.project-quick-add input { width:100%; padding:8px 10px; border:1px solid #e2e8f0; border-radius:6px; font-size:13px; margin-bottom:6px; box-sizing:border-box; }' +
      '.project-quick-add input:focus { border-color:#0696D7; outline:none; }' +
      '.project-selected-badge { display:inline-flex; align-items:center; gap:6px; background:#eff6ff; color:#0696D7; font-size:12px; font-weight:600; padding:4px 10px; border-radius:6px; margin-top:6px; }' +
      '.project-selected-badge .clear-project { cursor:pointer; color:#94a3b8; font-size:14px; line-height:1; }' +
      '.project-selected-badge .clear-project:hover { color:#ef4444; }';
    document.head.appendChild(style);
  }

  // ─── localStorage helpers ─────────────────────────────────────────────

  var STORAGE_KEY = 'nw_projects';

  /**
   * Read all projects from localStorage.
   * @returns {Array} Array of project objects, or empty array.
   */
  function getProjects() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[project-utils] Failed to read projects from localStorage:', e);
      return [];
    }
  }

  /**
   * Save a record (report link) into a project's documents array.
   * @param {string} projectId - The project ID to attach the record to.
   * @param {Object} record - The record object (id, name, category, reportType, reportId, etc.)
   */
  function saveProjectRecord(projectId, record) {
    if (!projectId) {
      console.warn('[project-utils] saveProjectRecord called without projectId');
      return false;
    }
    try {
      var projects = getProjects();
      var found = false;
      for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === projectId) {
          // Ensure documents array exists
          if (!Array.isArray(projects[i].documents)) {
            projects[i].documents = [];
          }
          // Build the record with defaults
          var rec = Object.assign({
            id: 'rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            name: 'Report',
            category: 'Reports',
            reportType: '',
            reportId: '',
            size: '',
            type: 'report-link',
            addedAt: new Date().toISOString()
          }, record);
          projects[i].documents.push(rec);
          found = true;
          break;
        }
      }
      if (!found) {
        console.warn('[project-utils] Project not found for id:', projectId);
        return false;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
      return true;
    } catch (e) {
      console.error('[project-utils] Failed to save project record:', e);
      return false;
    }
  }

  // ─── Picker state (supports one picker per page) ──────────────────────

  var _pickerContainer = null;
  var _pickerOptions = {};

  /**
   * Inject a project picker UI into a container element.
   * @param {string|HTMLElement} containerIdOrElement - Element or its ID.
   * @param {Object} [options]
   * @param {boolean} [options.autoFillCustomer=true] - Auto-fill customer/address fields.
   * @param {string}  [options.customerFieldId='custName'] - ID of customer name input.
   * @param {string}  [options.addressFieldId] - ID of address input (auto-detects 'address' or 'custAddress').
   */
  function injectProjectPicker(containerIdOrElement, options) {
    injectStyles();

    // Resolve container
    var container;
    if (typeof containerIdOrElement === 'string') {
      container = document.getElementById(containerIdOrElement);
    } else {
      container = containerIdOrElement;
    }
    if (!container) {
      console.error('[project-utils] Container not found:', containerIdOrElement);
      return;
    }

    _pickerContainer = container;

    // Ensure parent .section allows dropdown to overflow
    var parentSection = container.closest('.section');
    if (parentSection) parentSection.style.overflow = 'visible';

    _pickerOptions = Object.assign({
      autoFillCustomer: true,
      customerFieldId: 'custName',
      addressFieldId: null // auto-detect
    }, options || {});

    // Build the HTML
    container.innerHTML =
      '<div class="project-picker">' +
        '<label>Project <span style="color:#94a3b8;font-weight:400">(optional)</span></label>' +
        '<div class="project-search-wrap">' +
          '<input type="text" class="project-search" placeholder="Search or select project..." id="projectSearch" autocomplete="off">' +
          '<div class="project-dropdown" id="projectDropdown"></div>' +
        '</div>' +
        '<div id="projectBadgeWrap"></div>' +
        '<input type="hidden" id="selectedProjectId" value="">' +
        '<div class="project-quick-add" id="projectQuickAdd" style="display:none">' +
          '<input type="text" placeholder="Project Name *" id="qaProjectName">' +
          '<input type="text" placeholder="Customer / Company" id="qaCustomer">' +
          '<input type="text" placeholder="Address" id="qaAddress">' +
          '<div style="display:flex;gap:8px;margin-top:8px">' +
            '<button type="button" class="btn btn-primary btn-small" id="qaProjectSaveBtn">Save</button>' +
            '<button type="button" class="btn btn-outline btn-small" id="qaProjectCancelBtn">Cancel</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Cache elements
    var searchInput = document.getElementById('projectSearch');
    var dropdown = document.getElementById('projectDropdown');
    var quickAdd = document.getElementById('projectQuickAdd');

    // Render dropdown options
    renderDropdown('');

    // ── Event: focus on search → open dropdown ──
    searchInput.addEventListener('focus', function () {
      // Only open if no project is currently selected
      if (getSelectedProjectId()) return;
      renderDropdown(searchInput.value);
      dropdown.classList.add('open');
    });

    // ── Event: typing filters the list ──
    searchInput.addEventListener('input', function () {
      if (getSelectedProjectId()) {
        // If selected but user starts typing, clear selection first
        doClearSelection();
      }
      renderDropdown(searchInput.value);
      dropdown.classList.add('open');
    });

    // ── Event: click outside closes dropdown ──
    document.addEventListener('click', function (e) {
      if (!container.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });

    // ── Event: quick-add buttons ──
    document.getElementById('qaProjectSaveBtn').addEventListener('click', function () {
      saveQuickProject();
    });
    document.getElementById('qaProjectCancelBtn').addEventListener('click', function () {
      cancelQuickProject();
    });
  }

  /**
   * Render dropdown options filtered by query string.
   */
  function renderDropdown(query) {
    var dropdown = document.getElementById('projectDropdown');
    if (!dropdown) return;

    var projects = getProjects();
    var q = (query || '').toLowerCase().trim();
    var html = '';

    // "None" option always first
    html += '<div class="project-option none-opt" data-id="">None (no project)</div>';

    // Filtered projects
    var hasResults = false;
    for (var i = 0; i < projects.length; i++) {
      var p = projects[i];
      var searchable = ((p.name || '') + ' ' + (p.customer || '') + ' ' + (p.address || '')).toLowerCase();
      if (q && searchable.indexOf(q) === -1) continue;
      hasResults = true;
      var label = (p.name || 'Untitled') + ' \u2014 ' + (p.customer || 'No customer');
      html += '<div class="project-option" data-id="' + escapeAttr(p.id) + '">' + escapeHtml(label) + '</div>';
    }

    // If no matches (and there was a query)
    if (!hasResults && q) {
      html += '<div class="project-option" style="color:#94a3b8;cursor:default;font-style:italic;">No matching projects</div>';
    }

    // "Quick Add" option always last
    html += '<div class="project-option add-opt" data-action="quick-add">\uff0b Quick Add Project</div>';

    dropdown.innerHTML = html;

    // Attach click handlers to options
    var opts = dropdown.querySelectorAll('.project-option');
    for (var j = 0; j < opts.length; j++) {
      opts[j].addEventListener('click', handleOptionClick);
    }
  }

  /**
   * Handle click on a dropdown option.
   */
  function handleOptionClick(e) {
    var el = e.currentTarget;
    var dropdown = document.getElementById('projectDropdown');
    var action = el.getAttribute('data-action');

    if (action === 'quick-add') {
      dropdown.classList.remove('open');
      showQuickAdd();
      return;
    }

    var projectId = el.getAttribute('data-id');
    dropdown.classList.remove('open');

    if (!projectId) {
      // "None" selected
      doClearSelection();
      return;
    }

    selectProject(projectId);
  }

  /**
   * Select a project by ID — update UI, fill fields, dispatch event.
   */
  function selectProject(projectId) {
    var projects = getProjects();
    var project = null;
    for (var i = 0; i < projects.length; i++) {
      if (projects[i].id === projectId) {
        project = projects[i];
        break;
      }
    }
    if (!project) {
      console.warn('[project-utils] selectProject: project not found:', projectId);
      return;
    }

    // Set hidden input
    var hidden = document.getElementById('selectedProjectId');
    if (hidden) hidden.value = projectId;

    // Update search input to show selected project
    var searchInput = document.getElementById('projectSearch');
    if (searchInput) {
      searchInput.value = (project.name || 'Untitled') + ' \u2014 ' + (project.customer || '');
      searchInput.readOnly = true;
    }

    // Show badge
    var badgeWrap = document.getElementById('projectBadgeWrap');
    if (badgeWrap) {
      badgeWrap.innerHTML =
        '<div class="project-selected-badge">' +
          '<span>' + escapeHtml(project.name || 'Untitled') + '</span>' +
          '<span class="clear-project" id="clearProjectBtn" title="Remove project">&times;</span>' +
        '</div>';
      document.getElementById('clearProjectBtn').addEventListener('click', function () {
        clearProjectSelection();
      });
    }

    // Auto-fill project name field if it exists on the page
    var projNameField = document.getElementById('projectName');
    if (projNameField && project.name) {
      projNameField.value = project.name;
      projNameField.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Auto-fill customer and address fields if enabled
    if (_pickerOptions.autoFillCustomer !== false) {
      var custField = document.getElementById(_pickerOptions.customerFieldId || 'custName');
      if (custField && project.customer) {
        custField.value = project.customer;
        // Trigger input event so any listeners pick up the change
        custField.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Try to find address field
      var addrId = _pickerOptions.addressFieldId;
      var addrField = null;
      if (addrId) {
        addrField = document.getElementById(addrId);
      } else {
        // Auto-detect common IDs
        addrField = document.getElementById('address') || document.getElementById('custAddress');
      }
      if (addrField && project.address) {
        // Build full address string
        var fullAddr = project.address;
        if (project.city) fullAddr += ', ' + project.city;
        if (project.state) fullAddr += ', ' + project.state;
        if (project.zip) fullAddr += ' ' + project.zip;
        addrField.value = fullAddr;
        addrField.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    // Dispatch custom event on the container
    if (_pickerContainer) {
      try {
        var evt = new CustomEvent('projectSelected', { detail: project, bubbles: true });
        _pickerContainer.dispatchEvent(evt);
      } catch (e) {
        // CustomEvent not supported in some old browsers — ignore
      }
    }
  }

  /**
   * Internal clear (no public API noise).
   */
  function doClearSelection() {
    var hidden = document.getElementById('selectedProjectId');
    if (hidden) hidden.value = '';

    var projNameField = document.getElementById('projectName');
    if (projNameField) projNameField.value = '';

    var searchInput = document.getElementById('projectSearch');
    if (searchInput) {
      searchInput.value = '';
      searchInput.readOnly = false;
    }

    var badgeWrap = document.getElementById('projectBadgeWrap');
    if (badgeWrap) badgeWrap.innerHTML = '';
  }

  // ─── Quick Add ────────────────────────────────────────────────────────

  function showQuickAdd() {
    var qa = document.getElementById('projectQuickAdd');
    if (qa) {
      qa.style.display = 'block';
      var nameInput = document.getElementById('qaProjectName');
      if (nameInput) nameInput.focus();
    }
  }

  function cancelQuickProject() {
    var qa = document.getElementById('projectQuickAdd');
    if (qa) qa.style.display = 'none';
    // Clear inputs
    var fields = ['qaProjectName', 'qaCustomer', 'qaAddress'];
    for (var i = 0; i < fields.length; i++) {
      var el = document.getElementById(fields[i]);
      if (el) el.value = '';
    }
  }

  function saveQuickProject() {
    var nameInput = document.getElementById('qaProjectName');
    var custInput = document.getElementById('qaCustomer');
    var addrInput = document.getElementById('qaAddress');

    var name = (nameInput ? nameInput.value : '').trim();
    if (!name) {
      alert('Project name is required.');
      if (nameInput) nameInput.focus();
      return;
    }

    var customer = (custInput ? custInput.value : '').trim();
    var address = (addrInput ? addrInput.value : '').trim();

    // Create new project object (UUID for Supabase compat)
    var projectId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          var r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });

    var newProject = {
      id: projectId,
      name: name,
      customer: customer,
      address: address,
      city: '',
      state: '',
      zip: '',
      projectType: '',
      status: 'active',
      notes: '',
      createdAt: new Date().toISOString(),
      documents: []
    };

    // Save to localStorage
    try {
      var projects = getProjects();
      projects.push(newProject);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (e) {
      console.error('[project-utils] Failed to save quick-add project:', e);
      alert('Failed to save project. Please try again.');
      return;
    }

    // Sync to cloud (fire-and-forget)
    if (typeof saveProject === 'function' && typeof supabaseClient !== 'undefined') {
      saveProject({
        id: newProject.id,
        project_name: newProject.name,
        address: newProject.address || '',
        notes: customer ? 'Customer: ' + customer : '',
        status: 'active'
      }).catch(function(e) { console.error('[project-utils] Cloud sync error:', e); });
    }

    // Hide quick-add form and clear inputs
    cancelQuickProject();

    // Select the newly created project
    selectProject(newProject.id);
  }

  // ─── Public read-only helpers ─────────────────────────────────────────

  /**
   * Get the currently selected project ID, or null.
   */
  function getSelectedProjectId() {
    var hidden = document.getElementById('selectedProjectId');
    var val = hidden ? hidden.value : '';
    return val || null;
  }

  /**
   * Get the full project object for the selected project, or null.
   */
  function getSelectedProject() {
    var id = getSelectedProjectId();
    if (!id) return null;
    var projects = getProjects();
    for (var i = 0; i < projects.length; i++) {
      if (projects[i].id === id) return projects[i];
    }
    return null;
  }

  /**
   * Clear the current project selection and reset the picker UI.
   */
  function clearProjectSelection() {
    doClearSelection();
    // Dispatch event to notify listeners
    if (_pickerContainer) {
      try {
        var evt = new CustomEvent('projectSelected', { detail: null, bubbles: true });
        _pickerContainer.dispatchEvent(evt);
      } catch (e) { /* ignore */ }
    }
  }

  // ─── HTML escape helpers ──────────────────────────────────────────────

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Update a project document's Drive URL after upload completes.
   * @param {string} projectId
   * @param {string} reportId - The reportId used when saveProjectRecord was called
   * @param {string} driveUrl - The Google Drive download URL
   * @param {string} [viewUrl] - The Google Drive view URL
   */
  function updateProjectDocUrl(projectId, reportId, driveUrl, viewUrl) {
    if (!projectId || !reportId) return false;
    try {
      var projects = getProjects();
      for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === projectId) {
          var docs = projects[i].documents || [];
          for (var j = docs.length - 1; j >= 0; j--) {
            if (docs[j].reportId === reportId) {
              docs[j].driveUrl = driveUrl;
              if (viewUrl) docs[j].viewUrl = viewUrl;
              localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
              console.log('[project-utils] Updated doc URL for', reportId);
              return true;
            }
          }
          break;
        }
      }
      return false;
    } catch (e) {
      console.error('[project-utils] Failed to update doc URL:', e);
      return false;
    }
  }

  // ─── Expose as globals ────────────────────────────────────────────────

  window.getProjects = getProjects;
  window.saveProjectRecord = saveProjectRecord;
  window.updateProjectDocUrl = updateProjectDocUrl;
  window.injectProjectPicker = injectProjectPicker;
  window.getSelectedProjectId = getSelectedProjectId;
  window.getSelectedProject = getSelectedProject;
  window.clearProjectSelection = clearProjectSelection;
  window.selectProjectById = selectProject;

  // Legacy globals for inline onclick handlers (if any forms still use them)
  window.saveQuickProject = saveQuickProject;
  window.cancelQuickProject = cancelQuickProject;

})();
