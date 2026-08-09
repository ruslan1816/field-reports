-- Seed vendors + contacts + manufacturers from Kastriot's /Reference/Vendors/
BEGIN;

-- Idempotent — cascade delete via vendors' children
DELETE FROM vendors WHERE name IN ('ADE', 'Trane', 'Daikin Applied NY', 'Homans Associates', 'Engineered Air Solutions', 'SRS Enterprises', 'CaptiveAire', 'Dolphin Equipment Corp', 'Gil-Bar', 'Klimany', 'AWACP', 'MWSK Equipment', 'Lennox Commercial', 'Klimor', 'DNT Enterprises');

-- ── ADE ──
WITH v AS (
  INSERT INTO vendors (name, quote_email, extra_emails, notes) VALUES (
    'ADE', 'drawings@adehvac.com', 'ADEdrawingsNJ@adehvac.com', 'Air Distribution / Engineered Solutions. Most-contacted vendor.'
  ) RETURNING id
)
, contacts_inserted AS (INSERT INTO vendor_contacts (vendor_id, name, email, phone, title, notes, is_primary) VALUES ((SELECT id FROM v), 'Ryan Adams', 'radams@adehvac.com', 'Direct 516-256-7664 / Cell 516-615-1724', 'Sales', 'Air outlets, diffusers, fans, dehumidifiers, Runtal baseboard heaters', TRUE), ((SELECT id FROM v), 'Khrystyna Cooney', 'kcooney@adehvac.com', 'Direct 516-568-6556', 'Inside Sales Engineer', NULL, FALSE) RETURNING 1)
, mfrs AS (INSERT INTO vendor_manufacturers (vendor_id, manufacturer_name) VALUES ((SELECT id FROM v), 'Titus'), ((SELECT id FROM v), 'Price Industries'), ((SELECT id FROM v), 'Greenheck'), ((SELECT id FROM v), 'Neptronic'), ((SELECT id FROM v), 'Antec Controls'), ((SELECT id FROM v), 'Yaskawa'), ((SELECT id FROM v), 'Seiho'), ((SELECT id FROM v), 'Zehnder Rittling'), ((SELECT id FROM v), 'Carver Group'), ((SELECT id FROM v), 'Runtal'), ((SELECT id FROM v), 'Trion'), ((SELECT id FROM v), 'Aldes'), ((SELECT id FROM v), 'Franklin Control Systems'), ((SELECT id FROM v), 'Vimco'), ((SELECT id FROM v), 'Prihoda'), ((SELECT id FROM v), 'Bioclimatic'), ((SELECT id FROM v), 'CoolBreeze'), ((SELECT id FROM v), 'AJ Manufacturing'), ((SELECT id FROM v), 'Chromalox'), ((SELECT id FROM v), 'Stelpro'), ((SELECT id FROM v), 'EASI (Efficient Air Systems)'), ((SELECT id FROM v), 'DCA'), ((SELECT id FROM v), 'Thermoscreens'), ((SELECT id FROM v), 'RUKS'), ((SELECT id FROM v), 'Airtecnics'), ((SELECT id FROM v), 'SolutionAir'), ((SELECT id FROM v), 'Gripple'), ((SELECT id FROM v), 'Pyure'), ((SELECT id FROM v), 'Quest'), ((SELECT id FROM v), 'AQC'), ((SELECT id FROM v), 'Cambridgeport') RETURNING 1)
SELECT 1 FROM v;

-- ── Trane ──
WITH v AS (
  INSERT INTO vendors (name, quote_email, extra_emails, notes) VALUES (
    'Trane', 'nycbids@trane.com', NULL, 'Trane NYC — VRF, condensers, applied equipment.'
  ) RETURNING id
)
, contacts_inserted AS (INSERT INTO vendor_contacts (vendor_id, name, email, phone, title, notes, is_primary) VALUES ((SELECT id FROM v), 'Nathan Porter', 'nathan.porter@trane.com', '347-578-5588', 'Systems Account Manager', 'VRF/condenser equipment', TRUE), ((SELECT id FROM v), 'Jackie Casquarelli', 'nycbids@trane.com', '516-460-3941', 'Bid Coordinator', NULL, FALSE) RETURNING 1)
, mfrs AS (INSERT INTO vendor_manufacturers (vendor_id, manufacturer_name) VALUES ((SELECT id FROM v), 'Trane') RETURNING 1)
SELECT 1 FROM v;

-- ── Daikin Applied NY ──
WITH v AS (
  INSERT INTO vendors (name, quote_email, extra_emails, notes) VALUES (
    'Daikin Applied NY', 'biddesk@daikinapplied.com', NULL, 'Send quote requests to bid desk with Carl on cc.'
  ) RETURNING id
)
, contacts_inserted AS (INSERT INTO vendor_contacts (vendor_id, name, email, phone, title, notes, is_primary) VALUES ((SELECT id FROM v), 'Carl Caserta', 'carl.caserta@daikinapplied.com', 'Mobile 201-320-8111', 'Sales Engineer', 'VRF / applied equipment', TRUE) RETURNING 1)
, mfrs AS (INSERT INTO vendor_manufacturers (vendor_id, manufacturer_name) VALUES ((SELECT id FROM v), 'Daikin') RETURNING 1)
SELECT 1 FROM v;

-- ── Homans Associates ──
WITH v AS (
  INSERT INTO vendors (name, quote_email, extra_emails, notes) VALUES (
    'Homans Associates', 'rajiv.dyal@homans.com', NULL, 'Mitsubishi rep.'
  ) RETURNING id
)
, contacts_inserted AS (INSERT INTO vendor_contacts (vendor_id, name, email, phone, title, notes, is_primary) VALUES ((SELECT id FROM v), 'Rajiv Dyal', 'rajiv.dyal@homans.com', 'Mobile 646-276-3300', 'Mitsubishi Product Specialist', NULL, TRUE) RETURNING 1)
, mfrs AS (INSERT INTO vendor_manufacturers (vendor_id, manufacturer_name) VALUES ((SELECT id FROM v), 'Mitsubishi') RETURNING 1)
SELECT 1 FROM v;

-- ── Engineered Air Solutions ──
WITH v AS (
  INSERT INTO vendors (name, quote_email, extra_emails, notes) VALUES (
    'Engineered Air Solutions', 'rsapoff@engineeredairsolutions.com', NULL, 'Coils, fans, submittals.'
  ) RETURNING id
)
, contacts_inserted AS (INSERT INTO vendor_contacts (vendor_id, name, email, phone, title, notes, is_primary) VALUES ((SELECT id FROM v), 'Randy Sapoff', 'rsapoff@engineeredairsolutions.com', 'Office 973-536-2220 / Cell 201-214-6014', NULL, 'Coils, fans, submittals', TRUE), ((SELECT id FROM v), 'Kevin Fitzpatrick', 'kfitzpatrick@engineeredairsolutions.com', 'Cell 973-879-6319', NULL, NULL, FALSE) RETURNING 1)
SELECT 1 FROM v;

-- ── SRS Enterprises ──
WITH v AS (
  INSERT INTO vendors (name, quote_email, extra_emails, notes) VALUES (
    'SRS Enterprises', 'mrichter@srs-enterprises.com', NULL, 'Multi-line rep. Some brands NY-only / NJ-only — check notes.'
  ) RETURNING id
)
, contacts_inserted AS (INSERT INTO vendor_contacts (vendor_id, name, email, phone, title, notes, is_primary) VALUES ((SELECT id FROM v), 'Mark Richter', 'mrichter@srs-enterprises.com', '732-740-6120', NULL, 'Primary rep', TRUE) RETURNING 1)
, mfrs AS (INSERT INTO vendor_manufacturers (vendor_id, manufacturer_name) VALUES ((SELECT id FROM v), 'Mars'), ((SELECT id FROM v), 'Berner'), ((SELECT id FROM v), 'Loren Cook'), ((SELECT id FROM v), 'DuctSox'), ((SELECT id FROM v), 'Metalaire'), ((SELECT id FROM v), 'United Enertech'), ((SELECT id FROM v), 'S&P/Soler Palau'), ((SELECT id FROM v), 'SystemAir'), ((SELECT id FROM v), 'Dunham Bush'), ((SELECT id FROM v), 'Hydron Module'), ((SELECT id FROM v), 'Jetson'), ((SELECT id FROM v), 'Nyle'), ((SELECT id FROM v), 'Unilux'), ((SELECT id FROM v), 'Fisair'), ((SELECT id FROM v), 'Samsung'), ((SELECT id FROM v), 'eFlow USA'), ((SELECT id FROM v), 'Alfa Laval'), ((SELECT id FROM v), 'American Wheatley'), ((SELECT id FROM v), 'Spirotherm'), ((SELECT id FROM v), 'The Glacier Group'), ((SELECT id FROM v), 'Aerotech'), ((SELECT id FROM v), 'Armstrong (radiant ceiling panels)'), ((SELECT id FROM v), 'Detroit Radiant'), ((SELECT id FROM v), 'Markel'), ((SELECT id FROM v), 'Modine'), ((SELECT id FROM v), 'Thermolec') RETURNING 1)
SELECT 1 FROM v;

-- ── CaptiveAire ──
WITH v AS (
  INSERT INTO vendors (name, quote_email, extra_emails, notes) VALUES (
    'CaptiveAire', 'reg17@captiveaire.com', NULL, 'Region 17 NYC. Kitchen ventilation & DOAS equipment.'
  ) RETURNING id
)
, contacts_inserted AS (INSERT INTO vendor_contacts (vendor_id, name, email, phone, title, notes, is_primary) VALUES ((SELECT id FROM v), 'Matt Morana', 'matt.morana@captiveaire.com', 'Office 646-723-3365 / Cell 646-661-2271', NULL, 'Kitchen ventilation / DOAS', TRUE), ((SELECT id FROM v), 'Robert Cooper', 'robert.cooper@captiveaire.com', 'Office 646-723-3365 / Mobile 305-710-6110', 'Regional Sales Manager', NULL, FALSE) RETURNING 1)
, mfrs AS (INSERT INTO vendor_manufacturers (vendor_id, manufacturer_name) VALUES ((SELECT id FROM v), 'CaptiveAire') RETURNING 1)
SELECT 1 FROM v;

-- ── Dolphin Equipment Corp ──
WITH v AS (
  INSERT INTO vendors (name, quote_email, extra_emails, notes) VALUES (
    'Dolphin Equipment Corp', 'estimating@dolphinequipment.com', NULL, 'Pumps / hydronic / plumbing equipment rep.'
  ) RETURNING id
)
, contacts_inserted AS (INSERT INTO vendor_contacts (vendor_id, name, email, phone, title, notes, is_primary) VALUES ((SELECT id FROM v), 'Lisa Greco', 'estimating@dolphinequipment.com', 'Direct 914-380-4247 (Main 914-663-8355)', NULL, 'Send quote requests here', TRUE), ((SELECT id FROM v), 'Barry Brar', 'barry@dolphinequipment.com', 'Direct 914-380-4244 / Mobile 929-208-7280', NULL, NULL, FALSE) RETURNING 1)
, mfrs AS (INSERT INTO vendor_manufacturers (vendor_id, manufacturer_name) VALUES ((SELECT id FROM v), 'Grundfos'), ((SELECT id FROM v), 'PACO Pumps'), ((SELECT id FROM v), 'Federal Pumps'), ((SELECT id FROM v), 'Amtrol'), ((SELECT id FROM v), 'Thrush Pumps'), ((SELECT id FROM v), 'Tigerflow'), ((SELECT id FROM v), 'HCi (Terminator System)'), ((SELECT id FROM v), 'Griswold Controls'), ((SELECT id FROM v), 'Armstrong International'), ((SELECT id FROM v), 'Sulzer (vertical turbine pumps)'), ((SELECT id FROM v), 'Eaton Cutler-Hammer'), ((SELECT id FROM v), 'Danfoss (VFDs & PICV)'), ((SELECT id FROM v), 'Spirotherm'), ((SELECT id FROM v), 'Polaris (heat exchangers)'), ((SELECT id FROM v), 'John Wood Co.'), ((SELECT id FROM v), 'Wessels (ASME tanks/air separators)'), ((SELECT id FROM v), 'American HVAC-Wheatley'), ((SELECT id FROM v), 'Twin City Hose'), ((SELECT id FROM v), 'Schneider Electric') RETURNING 1)
SELECT 1 FROM v;

-- ── Gil-Bar ──
WITH v AS (
  INSERT INTO vendors (name, quote_email, extra_emails, notes) VALUES (
    'Gil-Bar', 'bcarrara@gil-bar.com', NULL, 'Samsung VRF + general equipment.'
  ) RETURNING id
)
, contacts_inserted AS (INSERT INTO vendor_contacts (vendor_id, name, email, phone, title, notes, is_primary) VALUES ((SELECT id FROM v), 'Blake Carrara', 'bcarrara@gil-bar.com', 'Office 212-331-8272 / Cell 631-905-8380', 'HVAC Sales Engineer', 'Samsung VRF, general equipment', TRUE) RETURNING 1)
, mfrs AS (INSERT INTO vendor_manufacturers (vendor_id, manufacturer_name) VALUES ((SELECT id FROM v), 'Aaon'), ((SELECT id FROM v), 'York'), ((SELECT id FROM v), 'Samsung'), ((SELECT id FROM v), 'Mammoth'), ((SELECT id FROM v), 'ClimateMaster'), ((SELECT id FROM v), 'Smardt'), ((SELECT id FROM v), 'Hitachi'), ((SELECT id FROM v), 'Huntair'), ((SELECT id FROM v), 'Friedrich'), ((SELECT id FROM v), 'Governair'), ((SELECT id FROM v), 'Temtrol'), ((SELECT id FROM v), 'Ventrol'), ((SELECT id FROM v), 'IEC'), ((SELECT id FROM v), 'AboveAir'), ((SELECT id FROM v), 'Klimor'), ((SELECT id FROM v), 'Acoustiflo'), ((SELECT id FROM v), 'AirMonitor'), ((SELECT id FROM v), 'Airzone'), ((SELECT id FROM v), 'AQC Industries'), ((SELECT id FROM v), 'Armstrong (humidifiers)'), ((SELECT id FROM v), 'AtmosAir'), ((SELECT id FROM v), 'BASX'), ((SELECT id FROM v), 'Blender Products'), ((SELECT id FROM v), 'Brasch'), ((SELECT id FROM v), 'Cancoil'), ((SELECT id FROM v), 'Continental Fan'), ((SELECT id FROM v), 'Cincinnati Fan'), ((SELECT id FROM v), 'ClimaCool'), ((SELECT id FROM v), 'ClimateCraft'), ((SELECT id FROM v), 'Critical Room Control'), ((SELECT id FROM v), 'Dadanco'), ((SELECT id FROM v), 'Dectron'), ((SELECT id FROM v), 'Direct Coil'), ((SELECT id FROM v), 'DuraSystems'), ((SELECT id FROM v), 'Dynamic Air Quality'), ((SELECT id FROM v), 'Epsilon Industries'), ((SELECT id FROM v), 'Flo Fab'), ((SELECT id FROM v), 'Fraser-Johnston'), ((SELECT id FROM v), 'HealthWay'), ((SELECT id FROM v), 'Heat Pipe Technology'), ((SELECT id FROM v), 'JCI (air distribution)'), ((SELECT id FROM v), 'Konvekta'), ((SELECT id FROM v), 'Miller Picking'), ((SELECT id FROM v), 'Motivair'), ((SELECT id FROM v), 'Nest Pro'), ((SELECT id FROM v), 'Nortek'), ((SELECT id FROM v), 'Olimpia Splendid'), ((SELECT id FROM v), 'Pace Air Systems'), ((SELECT id FROM v), 'Paragon Controls'), ((SELECT id FROM v), 'Plastec'), ((SELECT id FROM v), 'Plastic Air'), ((SELECT id FROM v), 'Quantech'), ((SELECT id FROM v), 'RAE Coils'), ((SELECT id FROM v), 'Roberts Gordon'), ((SELECT id FROM v), 'Rosemex'), ((SELECT id FROM v), 'Semco'), ((SELECT id FROM v), 'Sigma'), ((SELECT id FROM v), 'Technical Systems'), ((SELECT id FROM v), 'TMI Climate Solutions'), ((SELECT id FROM v), 'TCF Fans'), ((SELECT id FROM v), 'UCA'), ((SELECT id FROM v), 'UV Resources'), ((SELECT id FROM v), 'Venmar') RETURNING 1)
SELECT 1 FROM v;

-- ── Klimany ──
WITH v AS (
  INSERT INTO vendors (name, quote_email, extra_emails, notes) VALUES (
    'Klimany', 'michaelm@klimany.com', NULL, 'LG rep (Klima NJ).'
  ) RETURNING id
)
, contacts_inserted AS (INSERT INTO vendor_contacts (vendor_id, name, email, phone, title, notes, is_primary) VALUES ((SELECT id FROM v), 'Michael Micara', 'michaelm@klimany.com', NULL, NULL, 'LG rep', TRUE) RETURNING 1)
, mfrs AS (INSERT INTO vendor_manufacturers (vendor_id, manufacturer_name) VALUES ((SELECT id FROM v), 'LG') RETURNING 1)
SELECT 1 FROM v;

-- ── AWACP ──
WITH v AS (
  INSERT INTO vendors (name, quote_email, extra_emails, notes) VALUES (
    'AWACP', 'edwgs@awacp.com', 'sales@awacp.com', 'Albert Weiss Air Conditioning Products. Website says sales@ but we use edwgs@.'
  ) RETURNING id
)
, contacts_inserted AS (INSERT INTO vendor_contacts (vendor_id, name, email, phone, title, notes, is_primary) VALUES ((SELECT id FROM v), 'Apoorva Sharma', 'apoorvasharma@awacp.com', NULL, 'Communication Manager', 'Air outlets / equipment', TRUE), ((SELECT id FROM v), 'Mike Habib', 'mikehabib@awacp.com', NULL, NULL, 'Cc''d on quote correspondence', FALSE) RETURNING 1)
, mfrs AS (INSERT INTO vendor_manufacturers (vendor_id, manufacturer_name) VALUES ((SELECT id FROM v), 'Anemostat'), ((SELECT id FROM v), 'Vibro-Acoustics'), ((SELECT id FROM v), 'Arrow United'), ((SELECT id FROM v), 'Young Regulator'), ((SELECT id FROM v), 'Schwank'), ((SELECT id FROM v), 'EB Air Control'), ((SELECT id FROM v), 'Airtherm'), ((SELECT id FROM v), 'Superior Rex'), ((SELECT id FROM v), 'Air Concepts'), ((SELECT id FROM v), 'Tuttle & Bailey'), ((SELECT id FROM v), 'Ouellet'), ((SELECT id FROM v), 'Canarm'), ((SELECT id FROM v), 'Ruskin Rooftop Systems (ERVs)'), ((SELECT id FROM v), 'Trox'), ((SELECT id FROM v), 'Kees'), ((SELECT id FROM v), 'Tutco'), ((SELECT id FROM v), 'Danfoss (VFDs)'), ((SELECT id FROM v), 'Critical Environment'), ((SELECT id FROM v), 'FabricAir'), ((SELECT id FROM v), 'Ruskin'), ((SELECT id FROM v), 'Tamco Dampers') RETURNING 1)
SELECT 1 FROM v;

-- ── MWSK Equipment ──
WITH v AS (
  INSERT INTO vendors (name, quote_email, extra_emails, notes) VALUES (
    'MWSK Equipment', 'sales@mwskequip.com', NULL, 'Manufacturer lines not fully confirmed — website is JS-rendered. Flag brands as you confirm.'
  ) RETURNING id
), mfrs AS (INSERT INTO vendor_manufacturers (vendor_id, manufacturer_name) VALUES ((SELECT id FROM v), 'WaterFurnace'), ((SELECT id FROM v), 'Stulz'), ((SELECT id FROM v), 'Blue Frontier'), ((SELECT id FROM v), 'Spinnaker'), ((SELECT id FROM v), 'Skypeak'), ((SELECT id FROM v), 'Envirotec'), ((SELECT id FROM v), 'Verano'), ((SELECT id FROM v), 'Cooper & Hunter'), ((SELECT id FROM v), 'RefPlus') RETURNING 1)
SELECT 1 FROM v;

-- ── Lennox Commercial ──
WITH v AS (
  INSERT INTO vendors (name, quote_email, extra_emails, notes) VALUES (
    'Lennox Commercial', 'commercial.sales@lennox.com', NULL, 'Equipment manufacturer, generic intake.'
  ) RETURNING id
), mfrs AS (INSERT INTO vendor_manufacturers (vendor_id, manufacturer_name) VALUES ((SELECT id FROM v), 'Lennox') RETURNING 1)
SELECT 1 FROM v;

-- ── Klimor ──
WITH v AS (
  INSERT INTO vendors (name, quote_email, extra_emails, notes) VALUES (
    'Klimor', NULL, NULL, 'Appeared once, unconfirmed as regular vendor.'
  ) RETURNING id
)
, contacts_inserted AS (INSERT INTO vendor_contacts (vendor_id, name, email, phone, title, notes, is_primary) VALUES ((SELECT id FROM v), 'Carlos Jorge', 'cjorge@klimor.com', NULL, NULL, NULL, TRUE) RETURNING 1)
, mfrs AS (INSERT INTO vendor_manufacturers (vendor_id, manufacturer_name) VALUES ((SELECT id FROM v), 'Klimor') RETURNING 1)
SELECT 1 FROM v;

-- ── DNT Enterprises ──
WITH v AS (
  INSERT INTO vendors (name, quote_email, extra_emails, notes) VALUES (
    'DNT Enterprises', 'jana@dntenter.com', NULL, 'Manufacturer''s rep. Multiple lines.'
  ) RETURNING id
)
, contacts_inserted AS (INSERT INTO vendor_contacts (vendor_id, name, email, phone, title, notes, is_primary) VALUES ((SELECT id FROM v), 'Jana Galat', 'jana@dntenter.com', '212-682-0797', NULL, 'Office main', TRUE) RETURNING 1)
, mfrs AS (INSERT INTO vendor_manufacturers (vendor_id, manufacturer_name) VALUES ((SELECT id FROM v), 'Rapid Engineering'), ((SELECT id FROM v), 'Cutler Hammer/Eaton VFDs'), ((SELECT id FROM v), 'Hays Fluid Controls'), ((SELECT id FROM v), 'TempEff'), ((SELECT id FROM v), 'Florida Heat Pumps (Bosch)'), ((SELECT id FROM v), 'CompuAire'), ((SELECT id FROM v), 'TASK Applied Products'), ((SELECT id FROM v), 'Custom Air Products'), ((SELECT id FROM v), 'Canyon Air Products'), ((SELECT id FROM v), 'Gaylord Industries') RETURNING 1)
SELECT 1 FROM v;

COMMIT;

SELECT
  (SELECT COUNT(*) FROM vendors)              AS vendor_count,
  (SELECT COUNT(*) FROM vendor_contacts)      AS contact_count,
  (SELECT COUNT(*) FROM vendor_manufacturers) AS mfr_count;