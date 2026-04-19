/**
 * equipment-utils.js — Shared Multi-Equipment Component for Northern Wolves AC Field Reports
 * Provides reusable UI for adding multiple equipment entries to any report form.
 */
(function() {
  'use strict';

  var _equipOptions = {};
  var _equipCardCount = 0;

  function _injectStyles() {
    if (document.getElementById('equipment-utils-styles')) return;
    var style = document.createElement('style');
    style.id = 'equipment-utils-styles';
    style.textContent =
      '.equip-card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin-bottom:10px; }' +
      '.equip-card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }' +
      '.equip-card-header .eq-name { font-size:13px; font-weight:700; color:#0696D7; border:none; background:transparent; outline:none; padding:0; flex:1; min-width:0; }' +
      '.equip-card-header .eq-name:focus { border-bottom:2px solid #0696D7; }' +
      '.equip-card-header .remove-equip { background:none; border:none; color:#94a3b8; font-size:12px; cursor:pointer; padding:4px 8px; }' +
      '.equip-card-header .remove-equip:hover { color:#ef4444; }' +
      '.equip-card .field { margin-bottom:8px; }' +
      '.equip-card .field label { display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px; }' +
      '.equip-card .field input, .equip-card .field select, .equip-card .field textarea { width:100%; padding:8px 10px; border:1px solid #e2e8f0; border-radius:6px; font-size:13px; background:#fff; box-sizing:border-box; }' +
      '.equip-card .field input:focus, .equip-card .field select:focus, .equip-card .field textarea:focus { border-color:#0696D7; outline:none; }' +
      '.equip-card .row { display:flex; gap:8px; }' +
      '.equip-card .row .field { flex:1; }' +
      '.equip-card .condition-btns { display:flex; gap:6px; flex-wrap:wrap; }' +
      '.equip-card .condition-btns button { padding:6px 12px; border:1px solid #e2e8f0; border-radius:6px; font-size:12px; background:#fff; cursor:pointer; }' +
      '.equip-card .condition-btns button.active { background:#0696D7; color:#fff; border-color:#0696D7; }';
    document.head.appendChild(style);
  }

  var _equipTypeOptions =
    '<option value="">Select equipment...</option>' +
    '<optgroup label="Residential">' +
      '<option>Split System (AC)</option>' +
      '<option>Split System (Heat Pump)</option>' +
      '<option>Mini-Split / Ductless</option>' +
      '<option>Furnace (Gas)</option>' +
      '<option>Furnace (Oil)</option>' +
      '<option>Boiler (Residential)</option>' +
    '</optgroup>' +
    '<optgroup label="Commercial - Cooling">' +
      '<option>RTU (Rooftop Unit)</option>' +
      '<option>AHU (Air Handling Unit)</option>' +
      '<option>Chiller (Air-Cooled)</option>' +
      '<option>Chiller (Water-Cooled)</option>' +
      '<option>Cooling Tower</option>' +
      '<option>VRF System</option>' +
      '<option>WSHP (Water Source Heat Pump)</option>' +
    '</optgroup>' +
    '<optgroup label="Commercial - Heating">' +
      '<option>Boiler (Fire-Tube)</option>' +
      '<option>Boiler (Water-Tube)</option>' +
      '<option>Boiler (Condensing)</option>' +
      '<option>Unit Heater</option>' +
      '<option>Hydronic System</option>' +
    '</optgroup>' +
    '<optgroup label="Ventilation &amp; Exhaust">' +
      '<option>DOAS Unit</option>' +
      '<option>ERV / HRV</option>' +
      '<option>Exhaust Fan</option>' +
      '<option>MAU (Make-Up Air)</option>' +
      '<option>Kitchen Hood System</option>' +
      '<option>Garage Ventilation</option>' +
    '</optgroup>' +
    '<optgroup label="Controls &amp; Terminal">' +
      '<option>VAV Box</option>' +
      '<option>Fan Powered Box (FPB)</option>' +
      '<option>VFD</option>' +
      '<option>BMS / BAS Controls</option>' +
      '<option>Thermostat / Controller</option>' +
    '</optgroup>' +
    '<optgroup label="Other">' +
      '<option>Other (specify below)</option>' +
    '</optgroup>';

  var _refrigerantOptions =
    '<option value="">N/A</option>' +
    '<option>R-410A</option>' +
    '<option>R-22</option>' +
    '<option>R-407C</option>' +
    '<option>R-134a</option>' +
    '<option>R-404A</option>' +
    '<option>R-454B</option>' +
    '<option>R-32</option>' +
    '<option>Other</option>';

  function injectEquipmentList(containerId, options) {
    _injectStyles();
    options = options || {};
    _equipOptions = {
      showRefrigerant: options.showRefrigerant === true,
      showLocation: options.showLocation !== false,
      showCondition: options.showCondition === true,
      showNotes: options.showNotes === true,
      showCapacity: options.showCapacity === true,
      showAge: options.showAge === true,
      startWithOne: options.startWithOne !== false
    };
    _equipCardCount = 0;

    var container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML =
      '<p style="font-size:12px;color:#94a3b8;margin-bottom:10px">Add each piece of equipment serviced.</p>' +
      '<div id="equipmentList"></div>' +
      '<button class="btn btn-secondary btn-small" style="margin-top:8px" onclick="addEquipmentCard()">+ Add Equipment</button>';

    if (_equipOptions.startWithOne) {
      addEquipmentCard();
    }
  }

  function addEquipmentCard() {
    _equipCardCount++;
    var num = _equipCardCount;
    var list = document.getElementById('equipmentList');
    if (!list) return;

    var card = document.createElement('div');
    card.className = 'equip-card';
    card.setAttribute('data-equip-num', num);

    var html = '';
    // Header with editable name
    html += '<div class="equip-card-header">';
    html += '<input type="text" class="eq-name" value="Equipment #' + num + '" placeholder="Equipment name" oninput="onEquipNameChange()">';
    html += '<button type="button" class="remove-equip" onclick="removeEquipmentCard(this)">Remove</button>';
    html += '</div>';

    // Equipment Type
    html += '<div class="field">';
    html += '<label>Equipment Type</label>';
    html += '<select class="eq-type">' + _equipTypeOptions + '</select>';
    html += '</div>';

    // Manufacturer + Model row
    html += '<div class="row">';
    html += '<div class="field"><label>Manufacturer</label><input type="text" class="eq-mfg" placeholder="Brand"></div>';
    html += '<div class="field"><label>Model #</label><input type="text" class="eq-model"></div>';
    html += '</div>';

    // Serial + (Refrigerant or Location) row
    html += '<div class="row">';
    html += '<div class="field"><label>Serial #</label><input type="text" class="eq-serial"></div>';
    if (_equipOptions.showRefrigerant) {
      html += '<div class="field"><label>Refrigerant</label><select class="eq-refrigerant">' + _refrigerantOptions + '</select></div>';
    } else if (_equipOptions.showLocation) {
      html += '<div class="field"><label>Location / Tag</label><input type="text" class="eq-location" placeholder="Roof, mech room, etc."></div>';
    }
    html += '</div>';

    // Location row (if both refrigerant and location are shown)
    if (_equipOptions.showRefrigerant && _equipOptions.showLocation) {
      html += '<div class="field"><label>Location / Tag</label><input type="text" class="eq-location" placeholder="Roof, mech room, etc."></div>';
    }

    // Capacity + Age row
    if (_equipOptions.showCapacity || _equipOptions.showAge) {
      html += '<div class="row">';
      if (_equipOptions.showCapacity) {
        html += '<div class="field"><label>Capacity</label><input type="text" class="eq-capacity" placeholder="e.g. 5 Ton"></div>';
      }
      if (_equipOptions.showAge) {
        html += '<div class="field"><label>Age / Year</label><input type="text" class="eq-age" placeholder="e.g. 2018"></div>';
      }
      html += '</div>';
    }

    // Condition buttons
    if (_equipOptions.showCondition) {
      html += '<div class="field"><label>Condition</label>';
      html += '<div class="condition-btns">';
      html += '<button type="button" onclick="selectEquipCondition(this,\'Good\')">Good</button>';
      html += '<button type="button" onclick="selectEquipCondition(this,\'Fair\')">Fair</button>';
      html += '<button type="button" onclick="selectEquipCondition(this,\'Poor\')">Poor</button>';
      html += '<button type="button" onclick="selectEquipCondition(this,\'End of Life\')">End of Life</button>';
      html += '</div>';
      html += '<input type="hidden" class="eq-condition" value="">';
      html += '</div>';
    }

    // Notes
    if (_equipOptions.showNotes) {
      html += '<div class="field"><label>Notes</label><textarea class="eq-notes" rows="2" placeholder="Equipment notes..."></textarea></div>';
    }

    card.innerHTML = html;
    list.appendChild(card);
    _updateRemoveButtons();
  }

  function removeEquipmentCard(btn) {
    var card = btn.closest('.equip-card');
    if (card) card.remove();
    _renumberCards();
    _updateRemoveButtons();
  }

  function _renumberCards() {
    var cards = document.querySelectorAll('#equipmentList .equip-card');
    cards.forEach(function(card, i) {
      var nameInput = card.querySelector('.eq-name');
      // Only rename if it still has the default "Equipment #N" pattern
      if (nameInput && /^Equipment #\d+$/.test(nameInput.value)) {
        nameInput.value = 'Equipment #' + (i + 1);
      }
      card.setAttribute('data-equip-num', i + 1);
    });
    _equipCardCount = cards.length;
    onEquipNameChange();
  }

  function _updateRemoveButtons() {
    var cards = document.querySelectorAll('#equipmentList .equip-card');
    cards.forEach(function(card) {
      var btn = card.querySelector('.remove-equip');
      if (btn) {
        btn.style.display = cards.length <= 1 ? 'none' : '';
      }
    });
  }

  function selectEquipCondition(btn, value) {
    var card = btn.closest('.equip-card');
    if (!card) return;
    card.querySelectorAll('.condition-btns button').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    var hidden = card.querySelector('.eq-condition');
    if (hidden) hidden.value = value;
  }

  function collectEquipmentData() {
    var cards = document.querySelectorAll('#equipmentList .equip-card');
    var result = [];
    cards.forEach(function(card) {
      var typeEl = card.querySelector('.eq-type');
      var type = typeEl ? typeEl.value : '';
      if (!type) return;
      var nameEl = card.querySelector('.eq-name');
      var obj = {
        name: nameEl ? nameEl.value : '',
        type: type,
        mfg: (card.querySelector('.eq-mfg') || {}).value || '',
        model: (card.querySelector('.eq-model') || {}).value || '',
        serial: (card.querySelector('.eq-serial') || {}).value || '',
        refrigerant: (card.querySelector('.eq-refrigerant') || {}).value || '',
        location: (card.querySelector('.eq-location') || {}).value || '',
        condition: (card.querySelector('.eq-condition') || {}).value || '',
        capacity: (card.querySelector('.eq-capacity') || {}).value || '',
        age: (card.querySelector('.eq-age') || {}).value || '',
        notes: (card.querySelector('.eq-notes') || {}).value || ''
      };
      result.push(obj);
    });
    return result;
  }

  function getEquipmentCount() {
    return document.querySelectorAll('#equipmentList .equip-card').length;
  }

  // Get all equipment names (for labels in readings, photos, status)
  function getEquipmentNames() {
    var cards = document.querySelectorAll('#equipmentList .equip-card');
    var names = [];
    cards.forEach(function(card) {
      var nameEl = card.querySelector('.eq-name');
      names.push(nameEl ? nameEl.value : 'Equipment #' + (names.length + 1));
    });
    return names;
  }

  // Called when equipment name changes — dispatches event for other sections to listen
  function onEquipNameChange() {
    var evt = new CustomEvent('equipmentNamesChanged', { detail: { names: getEquipmentNames() } });
    document.dispatchEvent(evt);
  }

  // Expose on window
  window.injectEquipmentList = injectEquipmentList;
  window.addEquipmentCard = addEquipmentCard;
  window.removeEquipmentCard = removeEquipmentCard;
  window.selectEquipCondition = selectEquipCondition;
  window.collectEquipmentData = collectEquipmentData;
  window.getEquipmentCount = getEquipmentCount;
  window.getEquipmentNames = getEquipmentNames;
  window.onEquipNameChange = onEquipNameChange;

})();
