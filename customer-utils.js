/**
 * customer-utils.js — Customer Autocomplete for Northern Wolves AC Field Reports
 *
 * Attaches an autocomplete dropdown to the custName input field.
 * When a customer is selected from the cloud database, auto-fills
 * address, contact, phone, and email fields.
 *
 * Requires: supabase-config.js (getCustomers, saveCustomer)
 *
 * Usage: call initCustomerAutocomplete(options) after DOM is ready.
 *   options.nameFieldId       — default 'custName'
 *   options.addressFieldId    — default auto-detect ('custAddress' or 'address')
 *   options.contactFieldId    — default 'custContact'
 *   options.phoneFieldId      — default 'custPhone'
 *   options.emailFieldId      — default 'custEmail'
 */

(function () {
  'use strict';

  var STYLE_ID = 'customer-autocomplete-styles';
  var _customers = [];
  var _loaded = false;
  var _loading = false;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.cust-ac-wrap { position: relative; }' +
      '.cust-ac-dropdown { display:none; position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #cbd5e1; border-radius:8px; margin-top:4px; max-height:220px; overflow-y:auto; z-index:9999; box-shadow:0 8px 24px rgba(0,0,0,0.18); -webkit-overflow-scrolling:touch; }' +
      '.cust-ac-dropdown.open { display:block; }' +
      '.cust-ac-item { padding:10px 14px; cursor:pointer; font-size:14px; border-bottom:1px solid #f1f5f9; }' +
      '.cust-ac-item:last-child { border-bottom:none; }' +
      '.cust-ac-item:hover, .cust-ac-item.active { background:#f0f9ff; }' +
      '.cust-ac-item-name { font-weight:600; color:#1a2332; }' +
      '.cust-ac-item-addr { font-size:12px; color:#64748b; margin-top:1px; }' +
      '.cust-ac-item-new { color:#0696D7; font-weight:600; font-style:italic; }' +
      '.cust-ac-loading { padding:10px 14px; font-size:13px; color:#94a3b8; text-align:center; }';
    document.head.appendChild(style);
  }

  // Load customers from Supabase (cached for session)
  async function ensureCustomers() {
    if (_loaded) return _customers;
    if (_loading) {
      // Wait for ongoing load
      return new Promise(function(resolve) {
        var check = setInterval(function() {
          if (_loaded) { clearInterval(check); resolve(_customers); }
        }, 100);
      });
    }
    _loading = true;
    try {
      if (typeof getCustomers === 'function') {
        var result = await getCustomers();
        _customers = (result.data || []);
      }
    } catch (e) {
      console.error('[customer-utils] Failed to load customers:', e);
    }
    _loaded = true;
    _loading = false;
    return _customers;
  }

  // Refresh the cache (call after saving a new customer)
  async function refreshCustomers() {
    _loaded = false;
    _loading = false;
    return ensureCustomers();
  }

  /**
   * Initialize autocomplete on the custName field.
   */
  function initCustomerAutocomplete(options) {
    injectStyles();
    options = options || {};

    var nameFieldId = options.nameFieldId || 'custName';
    var nameField = document.getElementById(nameFieldId);
    if (!nameField) {
      console.warn('[customer-utils] Name field not found:', nameFieldId);
      return;
    }

    // Wrap the input for positioning
    var parent = nameField.parentNode;
    var wrap = document.createElement('div');
    wrap.className = 'cust-ac-wrap';
    parent.insertBefore(wrap, nameField);
    wrap.appendChild(nameField);

    // Create dropdown
    var dropdown = document.createElement('div');
    dropdown.className = 'cust-ac-dropdown';
    dropdown.id = 'custAcDropdown';
    wrap.appendChild(dropdown);

    var activeIndex = -1;
    var currentMatches = [];

    // Resolve field IDs
    function getField(id, fallbacks) {
      if (id) {
        var el = document.getElementById(id);
        if (el) return el;
      }
      if (fallbacks) {
        for (var i = 0; i < fallbacks.length; i++) {
          var el2 = document.getElementById(fallbacks[i]);
          if (el2) return el2;
        }
      }
      return null;
    }

    var addrField = getField(options.addressFieldId, ['custAddress', 'address']);
    var contactField = getField(options.contactFieldId, ['custContact']);
    var phoneField = getField(options.phoneFieldId, ['custPhone']);
    var emailField = getField(options.emailFieldId, ['custEmail']);

    function renderDropdown(query) {
      if (!query || query.length < 1) {
        dropdown.classList.remove('open');
        return;
      }

      var q = query.toLowerCase().trim();
      currentMatches = _customers.filter(function(c) {
        var searchable = ((c.name || '') + ' ' + (c.address || '') + ' ' + (c.city || '')).toLowerCase();
        return searchable.indexOf(q) !== -1;
      }).slice(0, 8);

      activeIndex = -1;
      var html = '';

      if (!_loaded) {
        html = '<div class="cust-ac-loading">Loading customers...</div>';
      } else if (currentMatches.length === 0) {
        html = '<div class="cust-ac-item cust-ac-item-new" data-action="new">Use "' + escapeHtml(query.trim()) + '" as new customer</div>';
      } else {
        currentMatches.forEach(function(c, idx) {
          var addr = '';
          if (c.address) addr = c.address;
          if (c.city) addr += (addr ? ', ' : '') + c.city;
          if (c.state) addr += (addr ? ', ' : '') + c.state;
          html += '<div class="cust-ac-item" data-idx="' + idx + '">' +
            '<div class="cust-ac-item-name">' + escapeHtml(c.name) + '</div>' +
            (addr ? '<div class="cust-ac-item-addr">' + escapeHtml(addr) + '</div>' : '') +
            '</div>';
        });

        // Also show "use as new" option if no exact match
        var exactMatch = currentMatches.some(function(c) {
          return (c.name || '').toLowerCase() === q;
        });
        if (!exactMatch) {
          html += '<div class="cust-ac-item cust-ac-item-new" data-action="new">Use "' + escapeHtml(query.trim()) + '" as new customer</div>';
        }
      }

      dropdown.innerHTML = html;
      dropdown.classList.add('open');

      // Click handlers
      dropdown.querySelectorAll('.cust-ac-item').forEach(function(item) {
        item.addEventListener('mousedown', function(e) {
          e.preventDefault(); // Prevent blur
          var action = item.getAttribute('data-action');
          if (action === 'new') {
            dropdown.classList.remove('open');
            return; // Just close, keep typed text
          }
          var idx = parseInt(item.getAttribute('data-idx'));
          selectCustomer(currentMatches[idx]);
        });
      });
    }

    function selectCustomer(c) {
      if (!c) return;
      nameField.value = c.name || '';

      // Auto-fill address
      if (addrField && c.address) {
        var fullAddr = c.address;
        if (c.city) fullAddr += ', ' + c.city;
        if (c.state) fullAddr += ', ' + c.state;
        if (c.zip) fullAddr += ' ' + c.zip;
        addrField.value = fullAddr;
        addrField.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Auto-fill contact
      if (contactField && c.contact_name) {
        contactField.value = c.contact_name;
        contactField.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Auto-fill phone
      if (phoneField && c.contact_phone) {
        phoneField.value = c.contact_phone;
        phoneField.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Auto-fill email
      if (emailField && c.contact_email) {
        emailField.value = c.contact_email;
        emailField.dispatchEvent(new Event('input', { bubbles: true }));
      }

      dropdown.classList.remove('open');

      // Dispatch event
      nameField.dispatchEvent(new Event('input', { bubbles: true }));
      try {
        nameField.dispatchEvent(new CustomEvent('customerSelected', { detail: c, bubbles: true }));
      } catch (e) { /* ignore */ }
    }

    // ── Events ──
    nameField.addEventListener('focus', async function() {
      await ensureCustomers();
      if (nameField.value.trim().length >= 1) {
        renderDropdown(nameField.value);
      }
    });

    nameField.addEventListener('input', function() {
      renderDropdown(nameField.value);
    });

    nameField.addEventListener('blur', function() {
      // Delay to allow click on dropdown item
      setTimeout(function() { dropdown.classList.remove('open'); }, 200);
    });

    nameField.addEventListener('keydown', function(e) {
      if (!dropdown.classList.contains('open')) return;
      var items = dropdown.querySelectorAll('.cust-ac-item[data-idx]');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, items.length - 1);
        highlightItem(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, -1);
        highlightItem(items);
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        selectCustomer(currentMatches[activeIndex]);
      } else if (e.key === 'Escape') {
        dropdown.classList.remove('open');
      }
    });

    function highlightItem(items) {
      items.forEach(function(item, i) {
        item.classList.toggle('active', i === activeIndex);
      });
    }

    // Pre-load customers in background
    ensureCustomers();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Expose globals
  window.initCustomerAutocomplete = initCustomerAutocomplete;
  window.refreshCustomerCache = refreshCustomers;

})();
