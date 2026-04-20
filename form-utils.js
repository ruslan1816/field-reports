/**
 * form-utils.js — Northern Wolves Field Reports
 *
 * Shared handlers for the clickable status controls:
 *   - .check-item / toggleCheck()     — multi-select pill group (checkboxes)
 *   - .check-item / selectRadio()     — single-select pill group (radios)
 *   - .condition-btn / selectCondition() — Good / Fair / Poor / End of Life / N/A
 *
 * Behavior (per Russ's spec):
 *   Click once   → highlights / selects.
 *   Click again  → turns off (deselects). Even radio groups toggle off.
 *
 * Bugs this file fixes:
 *   1) toggleCheck — labels contain a hidden <input>. The browser's default
 *      label-click behavior forwards a synthetic click to the input which
 *      toggles .checked AGAIN after our onclick handler already set it,
 *      leaving class and .checked out of sync. We now call preventDefault()
 *      on the event and set both states explicitly.
 *   2) selectCondition — didn't remove the 'eol' class when switching
 *      values, and added an empty-string class for 'End of Life' / 'N/A',
 *      meaning those buttons never highlighted. Now removes all four
 *      state classes and uses a proper map.
 *   3) selectRadio — no toggle-off support; you could select but not
 *      un-select a radio. Now clicking the already-selected item deselects.
 *
 * This file defines the functions on window AFTER each report's inline
 * script runs, so the shared versions take precedence.
 */
(function () {
  'use strict';

  // Pull the current event even if the inline onclick didn't pass it
  // (falls back to the non-standard-but-widely-supported window.event).
  function _currentEvent(explicit) {
    return explicit || window.event || null;
  }

  // ---------- Checkbox-style pill toggle ----------
  // Wrapped <label class="check-item"> contains a hidden <input type="checkbox">.
  // Usage in HTML: onclick="toggleCheck(this)"  or  onclick="toggleCheck(this, event)"
  function toggleCheck(item, evt) {
    evt = _currentEvent(evt);
    if (evt && typeof evt.preventDefault === 'function') {
      evt.preventDefault();
      evt.stopPropagation();
    }
    if (!item) return;
    var input = item.querySelector('input');
    var nowSelected = !item.classList.contains('selected');
    if (nowSelected) item.classList.add('selected');
    else item.classList.remove('selected');
    if (input) {
      input.checked = nowSelected;
      try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
    }
    if (typeof window.autoSave === 'function') {
      try { window.autoSave(); } catch (e) {}
    }
  }

  // ---------- Radio-style pill toggle (single-select with click-to-deselect) ----------
  // Wrapped <label class="check-item"> contains a hidden <input type="radio">.
  // Usage in HTML: onclick="selectRadio(this, 'groupId', event)"
  function selectRadio(item, gid, evt) {
    evt = _currentEvent(evt);
    if (evt && typeof evt.preventDefault === 'function') {
      evt.preventDefault();
      evt.stopPropagation();
    }
    if (!item || !gid) return;

    var group = document.getElementById(gid);
    // If caller gave us a radio group name instead of container id,
    // try to find the radios by name and operate on their parent .check-item.
    var items;
    if (group) {
      items = group.querySelectorAll('.check-item');
    } else {
      var radiosByName = document.querySelectorAll('input[type="radio"][name="' + gid + '"]');
      items = Array.prototype.map.call(radiosByName, function (r) {
        return r.closest('.check-item') || r.parentElement;
      });
    }

    var wasSelected = item.classList.contains('selected');

    // Clear every sibling and its input
    Array.prototype.forEach.call(items, function (el) {
      if (!el) return;
      el.classList.remove('selected');
      var input = el.querySelector && el.querySelector('input');
      if (input) input.checked = false;
    });

    // If it was already selected, leave everyone off (toggle-off). Otherwise select this one.
    if (!wasSelected) {
      item.classList.add('selected');
      var input = item.querySelector('input');
      if (input) {
        input.checked = true;
        try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
      }
    }

    if (typeof window.autoSave === 'function') {
      try { window.autoSave(); } catch (e) {}
    }
  }

  // ---------- Condition button (Good / Fair / Poor / End of Life / N/A) ----------
  // Usage in HTML: onclick="selectCondition(this, 'containerId', 'Good', event)"
  // All five state classes are removed each time so switching is clean, and
  // clicking the same button again turns it off (clears dataset.value too).
  var COND_CLASSES = ['good', 'fair', 'poor', 'eol', 'na'];
  var COND_CLASS_MAP = {
    'Good': 'good',
    'Fair': 'fair',
    'Poor': 'poor',
    'End of Life': 'eol',
    'EOL': 'eol',
    'N/A': 'na'
  };

  function selectCondition(btn, gid, val, evt) {
    evt = _currentEvent(evt);
    if (evt && typeof evt.preventDefault === 'function') {
      evt.preventDefault();
      evt.stopPropagation();
    }
    if (!btn || !gid) return;
    var container = document.getElementById(gid);
    if (!container) container = btn.parentElement;

    var alreadySelected = !!COND_CLASSES.find(function (c) { return btn.classList.contains(c); });

    // Clear every button's state
    container.querySelectorAll('.condition-btn').forEach(function (b) {
      b.classList.remove.apply(b.classList, COND_CLASSES);
    });

    if (alreadySelected) {
      // Toggle off
      container.dataset.value = '';
    } else {
      var cls = COND_CLASS_MAP[val] || '';
      if (cls) btn.classList.add(cls);
      container.dataset.value = val || '';
    }

    if (typeof window.autoSave === 'function') {
      try { window.autoSave(); } catch (e) {}
    }
  }

  // Expose (overwrite any previous report-local definitions)
  window.toggleCheck = toggleCheck;
  window.selectRadio = selectRadio;
  window.selectCondition = selectCondition;
})();
