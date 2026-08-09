-- ═══════════════════════════════════════════════════════════════════
-- Seed estimate_assemblies from Procore CustomParts.xlsx  (2026-08-09)
-- Per Russ's decision: import only Piping + Custom Equipment + selected
-- devices/services items. Air Outlets + Equipment weight tiers stay in
-- code PRESETS with Standards-accurate rates (Procore has stale numbers).
-- Total items: 31
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- Remove any prior seeded assemblies so this is idempotent
-- (broad match — covers Procore export items AND the standalone/disposal/disconnect rows
--  whose notes don't literally start with "From Procore CustomParts export")
DELETE FROM estimate_assemblies
 WHERE notes LIKE 'From Procore CustomParts export%'
    OR notes LIKE 'Standalone controls %'
    OR notes IN ('Equipment disconnect labor', 'Debris disposal / dumpster');

INSERT INTO estimate_assemblies
  (name, category, description, quantity_default, unit, unit_material_cost, unit_labor_hours, labor_crew_type, vendor_name, notes, is_active)
VALUES
  ('Air Curtain', 'equipment', 'Air Curtain', 1.0, 'ea', 0.0, 0.0, 'none', NULL, 'From Procore CustomParts export (Custom Equipment)', TRUE),
  ('Exhaust Fan', 'equipment', '150cfm', 1.0, 'ea', 500.0, 0.0, 'none', NULL, 'From Procore CustomParts export (Custom Equipment)', TRUE),
  ('Thermostats', 'equipment', 'Standalone controls (per NWAC Standards $500 ea, adjust if BMS in scope)', 1.0, 'ea', 0.0, 1.16, 'startup', NULL, 'Standalone controls (per NWAC Standards $500 ea, adjust if BMS in scope)', TRUE),
  ('Sensor temp.', 'equipment', 'Standalone controls (per NWAC Standards $400 ea)', 1.0, 'ea', 0.0, 1.16, 'startup', NULL, 'Standalone controls (per NWAC Standards $400 ea)', TRUE),
  ('Wiring per thermostat', 'equipment', 'Standalone controls wiring per thermostat ($50 per NWAC Standards)', 1.0, 'ft', 0.0, 0.07, 'startup', NULL, 'Standalone controls wiring per thermostat ($50 per NWAC Standards)', TRUE),
  ('disconnect', 'disconnects', 'Equipment disconnect labor', 1.0, 'ea', 0.0, 1.16, 'other', NULL, 'Equipment disconnect labor', TRUE),
  ('Disposal', 'services', 'Debris disposal / dumpster', 1.0, 'ea', 500.0, 0.0, 'none', NULL, 'Debris disposal / dumpster', TRUE),
  ('Copper M-Type — 3/4" copper pipe & 1" insulation', 'pipework', 'M Type & 1" Fiberglass', 1.0, 'ft', 17.4, 0.6, 'pipe', NULL, 'From Procore CustomParts export (Copper M-Type)', TRUE),
  ('Copper M-Type — 1" copper pipe & 1" insulation', 'pipework', 'M Type & 1" Fiberglass', 1.0, 'ft', 21.2, 0.6, 'pipe', NULL, 'From Procore CustomParts export (Copper M-Type)', TRUE),
  ('Copper M-Type — 1-1/4" copper pipe & 1" insulation', 'pipework', 'M Type & 1" Fiberglass', 1.0, 'ft', 28.32, 0.6, 'pipe', NULL, 'From Procore CustomParts export (Copper M-Type)', TRUE),
  ('Copper M-Type — 1-1/2" copper pipe & 1" insulation', 'pipework', 'M Type & 1" Fiberglass', 1.0, 'ft', 36.48, 0.6, 'pipe', NULL, 'From Procore CustomParts export (Copper M-Type)', TRUE),
  ('Copper M-Type — 2" copper pipe & 1" insulation', 'pipework', 'M Type & 1" Fiberglass', 1.0, 'ft', 54.6, 1.2, 'pipe', NULL, 'From Procore CustomParts export (Copper M-Type)', TRUE),
  ('Copper M-Type — 2-1/2" copper pipe & 1" insulation', 'pipework', 'M Type & 1" Fiberglass', 1.0, 'ft', 73.4, 1.2, 'pipe', NULL, 'From Procore CustomParts export (Copper M-Type)', TRUE),
  ('Copper M-Type — 3" copper pipe & 1" insulation', 'pipework', 'M Type & 1" Fiberglass', 1.0, 'ft', 93.2, 1.2, 'pipe', NULL, 'From Procore CustomParts export (Copper M-Type)', TRUE),
  ('Copper M-Type — 4" copper pipe & 1" insulation', 'pipework', 'M Type & 1" Fiberglass', 1.0, 'ft', 169.8, 1.2, 'pipe', NULL, 'From Procore CustomParts export (Copper M-Type)', TRUE),
  ('Copper L-Type — 3/4" copper pipe & 1" insulation', 'pipework', 'L Type & 1" Fiberglass', 1.0, 'ft', 17.4, 0.6, 'pipe', NULL, 'From Procore CustomParts export (Copper L-Type)', TRUE),
  ('Copper L-Type — 1" copper pipe & 1" insulation', 'pipework', 'L Type & 1" Fiberglass', 1.0, 'ft', 21.2, 0.6, 'pipe', NULL, 'From Procore CustomParts export (Copper L-Type)', TRUE),
  ('Copper L-Type — 1-1/4" copper pipe & 1" insulation', 'pipework', 'L Type & 1" Fiberglass', 1.0, 'ft', 34.56, 0.6, 'pipe', NULL, 'From Procore CustomParts export (Copper L-Type)', TRUE),
  ('Copper L-Type — 1-1/2" copper pipe & 1" insulation', 'pipework', 'L Type & 1" Fiberglass', 1.0, 'ft', 46.72, 0.6, 'pipe', NULL, 'From Procore CustomParts export (Copper L-Type)', TRUE),
  ('Copper L-Type — 2" copper pipe & 1" insulation', 'pipework', 'L Type & 1" Fiberglass', 1.0, 'ft', 55.72, 1.2, 'pipe', NULL, 'From Procore CustomParts export (Copper L-Type)', TRUE),
  ('Copper L-Type — 2-1/2" copper pipe & 1" insulation', 'pipework', 'L Type & 1" Fiberglass', 1.0, 'ft', 81.8, 1.2, 'pipe', NULL, 'From Procore CustomParts export (Copper L-Type)', TRUE),
  ('Copper L-Type — 3" copper pipe & 1" insulation', 'pipework', 'L Type & 1" Fiberglass', 1.0, 'ft', 108.0, 1.2, 'pipe', NULL, 'From Procore CustomParts export (Copper L-Type)', TRUE),
  ('Copper L-Type — 4" copper pipe & 1" insulation', 'pipework', 'L Type & 1" Fiberglass', 1.0, 'ft', 180.8, 1.2, 'pipe', NULL, 'From Procore CustomParts export (Copper L-Type)', TRUE),
  ('PVC — 3/4" PVC & 1" insulation', 'pipework', '1" Fiberglass', 1.0, 'ft', 6.25, 0.37, 'pipe', NULL, 'From Procore CustomParts export (PVC)', TRUE),
  ('PVC — 1" PVC & 1" insulation', 'pipework', '1" Fiberglass', 1.0, 'ft', 8.25, 0.37, 'pipe', NULL, 'From Procore CustomParts export (PVC)', TRUE),
  ('PVC — 1-1/4" PVC & 1" insulation', 'pipework', '1" Fiberglass', 1.0, 'ft', 9.375, 0.37, 'pipe', NULL, 'From Procore CustomParts export (PVC)', TRUE),
  ('PVC — 1-1/2" PVC & 1" insulation', 'pipework', '1" Fiberglass', 1.0, 'ft', 10.0, 0.37, 'pipe', NULL, 'From Procore CustomParts export (PVC)', TRUE),
  ('PVC — 2" PVC & 1" insulation', 'pipework', '1" Fiberglass', 1.0, 'ft', 12.5, 0.49, 'pipe', NULL, 'From Procore CustomParts export (PVC)', TRUE),
  ('PVC — 2-1/2" PVC & 1" insulation', 'pipework', '1" Fiberglass', 1.0, 'ft', 17.0, 0.49, 'pipe', NULL, 'From Procore CustomParts export (PVC)', TRUE),
  ('PVC — 3" PVC & 1" insulation', 'pipework', '1" Fiberglass', 1.0, 'ft', 20.0, 0.49, 'pipe', NULL, 'From Procore CustomParts export (PVC)', TRUE),
  ('PVC — 4" PVC & 1" insulation', 'pipework', '1" Fiberglass', 1.0, 'ft', 26.5, 0.6, 'pipe', NULL, 'From Procore CustomParts export (PVC)', TRUE);

COMMIT;

-- Verify
SELECT category, COUNT(*) AS cnt FROM estimate_assemblies
  WHERE notes LIKE 'From Procore CustomParts export%'
  GROUP BY category ORDER BY category;
