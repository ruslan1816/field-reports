/**
 * schedule-utils.js — Northern Wolves AC Field Schedule
 * =====================================================
 * CRUD helpers for schedule_techs / schedule_entries / schedule_comments.
 *
 * Permissions are enforced at the database level via RLS:
 *   - Read: any authenticated user
 *   - Write entries / techs: managers/admins only
 *   - Comments: any authenticated user can post their own
 *
 * Loaded by schedule.html and any other page that needs schedule data.
 */
(function () {
  'use strict';

  if (typeof supabaseClient === 'undefined') {
    console.error('[schedule-utils] supabaseClient not loaded — include supabase-config.js first');
    return;
  }

  // ─── CONSTANTS ─────────────────────────────────────────────────────────────

  var CREW_TYPES = [
    { value: 'sheetmetal',     label: 'Sheetmetal / Ductwork', icon: '🔩', color: '#f59e0b' },
    { value: 'pipe-fitters',   label: 'Pipe-fitters',          icon: '🔧', color: '#0696D7' },
    { value: 'wiring-startup', label: 'Wiring / Start-up',     icon: '⚡', color: '#8b5cf6' },
    { value: 'service-call',   label: 'Service Call',          icon: '🛠️', color: '#10b981' },
    { value: 'survey',         label: 'Project Survey',        icon: '📋', color: '#06b6d4' },
    { value: 'disconnect-demo',label: 'Disconnect / Demo',     icon: '⛏️', color: '#ef4444' },
    { value: 'maintenance',    label: 'Maintenance',           icon: '✅', color: '#5D822C' }
  ];

  var STATUSES = [
    { value: 'scheduled',   label: 'Scheduled',   color: '#0696D7' },
    { value: 'in-progress', label: 'In Progress', color: '#f59e0b' },
    { value: 'completed',   label: 'Completed',   color: '#10b981' },
    { value: 'delayed',     label: 'Delayed',     color: '#ef4444' },
    { value: 'blocked',     label: 'Blocked',     color: '#7c3aed' },
    { value: 'cancelled',   label: 'Cancelled',   color: '#94a3b8' }
  ];

  var PRIORITIES = [
    { value: 'urgent', label: '🔴 Urgent', color: '#dc2626' },
    { value: 'high',   label: '🟡 High',   color: '#f59e0b' },
    { value: 'normal', label: '🔵 Normal', color: '#0696D7' },
    { value: 'low',    label: '🟢 Low',    color: '#10b981' }
  ];

  function crewTypeMeta(v) {
    for (var i = 0; i < CREW_TYPES.length; i++) if (CREW_TYPES[i].value === v) return CREW_TYPES[i];
    return { value: v, label: v, icon: '•', color: '#64748b' };
  }
  function statusMeta(v) {
    for (var i = 0; i < STATUSES.length; i++) if (STATUSES[i].value === v) return STATUSES[i];
    return { value: v, label: v, color: '#64748b' };
  }
  function priorityMeta(v) {
    for (var i = 0; i < PRIORITIES.length; i++) if (PRIORITIES[i].value === v) return PRIORITIES[i];
    return { value: v, label: v, color: '#64748b' };
  }

  // ─── TECHS ─────────────────────────────────────────────────────────────────

  /**
   * List all schedule techs. Cached for 60s in memory because the list
   * rarely changes (only when adding/removing employees).
   */
  var _techCache = null;
  var _techCacheTs = 0;

  async function listTechs(opts) {
    opts = opts || {};
    var force = opts.force === true;
    if (!force && _techCache && (Date.now() - _techCacheTs) < 60000) {
      return { data: _techCache, error: null };
    }
    try {
      var q = supabaseClient.from('schedule_techs').select('*').eq('is_active', true).order('first_name');
      var r = await q;
      if (r.error) return { data: [], error: r.error };
      _techCache = r.data || [];
      _techCacheTs = Date.now();
      return { data: _techCache, error: null };
    } catch (err) {
      console.error('[schedule-utils] listTechs:', err);
      return { data: [], error: err };
    }
  }

  function invalidateTechCache() { _techCache = null; }

  async function createTech(tech) {
    var r = await supabaseClient.from('schedule_techs').insert(tech).select().single();
    invalidateTechCache();
    return { data: r.data, error: r.error };
  }

  async function updateTech(id, patch) {
    var r = await supabaseClient.from('schedule_techs').update(patch).eq('id', id).select().single();
    invalidateTechCache();
    return { data: r.data, error: r.error };
  }

  async function deleteTech(id) {
    var r = await supabaseClient.from('schedule_techs').update({ is_active: false }).eq('id', id);
    invalidateTechCache();
    return { error: r.error };
  }

  // ─── ENTRIES ───────────────────────────────────────────────────────────────

  /**
   * List schedule entries within an inclusive date range.
   *  - from / to are 'YYYY-MM-DD' strings (DATE)
   *  - returns entries that overlap the range (start_date <= to AND end_date >= from)
   *  - joins project name + customer for display
   */
  async function listEntries(opts) {
    opts = opts || {};
    try {
      var sel = 'id,project_id,crew_type,start_date,end_date,start_time,end_time,' +
                'assigned_tech_ids,assigned_tech_names,foreman_id,' +
                'is_subcontractor,subcontractor_name,status,priority,' +
                'scope_summary,notes,manpower_needed,created_at,updated_at,' +
                'project:projects(id,project_name,short_code,address,notes,pm_name,pm_email)';
      var q = supabaseClient.from('schedule_entries').select(sel);

      if (opts.from) q = q.gte('end_date', opts.from);
      if (opts.to)   q = q.lte('start_date', opts.to);
      if (opts.crewType)  q = q.eq('crew_type', opts.crewType);
      if (opts.projectId) q = q.eq('project_id', opts.projectId);
      if (opts.status)    q = q.eq('status', opts.status);

      // Sort by start_date asc, then priority (urgent first)
      q = q.order('start_date', { ascending: true }).order('priority', { ascending: false });

      var r = await q;
      // Normalize embedded project so UI can use {name, customer, ...}
      var rows = (r.data || []).map(function(e) {
        if (e.project) e.project = normalizeProject(e.project);
        return e;
      });
      return { data: rows, error: r.error };
    } catch (err) {
      console.error('[schedule-utils] listEntries:', err);
      return { data: [], error: err };
    }
  }

  /**
   * Get a single entry with comments.
   */
  async function getEntry(id) {
    try {
      var sel = '*,project:projects(id,project_name,short_code,address,notes,pm_name,pm_email)';
      var r = await supabaseClient.from('schedule_entries').select(sel).eq('id', id).single();
      if (r.error) return { data: null, error: r.error };
      if (r.data && r.data.project) r.data.project = normalizeProject(r.data.project);
      var c = await listComments(id);
      r.data.comments = c.data || [];
      return { data: r.data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  async function createEntry(entry) {
    try {
      var u = await supabaseClient.auth.getUser();
      var userId = u.data && u.data.user ? u.data.user.id : null;
      var row = Object.assign({}, entry, { created_by: userId });
      // Defensive: never send empty arrays as undefined
      if (!row.assigned_tech_ids)   row.assigned_tech_ids = [];
      if (!row.assigned_tech_names) row.assigned_tech_names = [];
      var r = await supabaseClient.from('schedule_entries').insert(row).select().single();
      return { data: r.data, error: r.error };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  async function updateEntry(id, patch) {
    var r = await supabaseClient.from('schedule_entries').update(patch).eq('id', id).select().single();
    return { data: r.data, error: r.error };
  }

  async function deleteEntry(id) {
    var r = await supabaseClient.from('schedule_entries').delete().eq('id', id);
    return { error: r.error };
  }

  /**
   * Find tech-assignment conflicts within a date range.
   *
   * Returns a map techId -> array of conflicting entries:
   *   {
   *     "<uuid>": [
   *       { entryId, projectName, projectShortCode, startDate, endDate, crewType },
   *       ...
   *     ],
   *     ...
   *   }
   *
   * Two entries conflict when their date ranges overlap and the entry is
   * not cancelled/completed. The optional excludeEntryId parameter is the
   * id of the entry currently being edited — we skip it so a tech doesn't
   * "conflict with themselves" when the user is just resaving.
   */
  async function findTechConflicts(startDate, endDate, excludeEntryId) {
    if (!startDate || !endDate) return { data: {}, error: null };
    try {
      var sel = 'id,project_id,crew_type,start_date,end_date,assigned_tech_ids,status,' +
                'project:projects(project_name,short_code)';
      var q = supabaseClient.from('schedule_entries').select(sel)
        // Overlap test: A.start <= B.end AND A.end >= B.start
        .lte('start_date', endDate)
        .gte('end_date', startDate)
        .not('status', 'in', '(cancelled,completed)');

      var r = await q;
      if (r.error) return { data: {}, error: r.error };

      var rows = r.data || [];
      var map = {};
      rows.forEach(function(row) {
        if (excludeEntryId && row.id === excludeEntryId) return;
        var ids = row.assigned_tech_ids || [];
        if (!ids.length) return;
        var info = {
          entryId: row.id,
          projectName: row.project ? (row.project.project_name || '') : '',
          projectShortCode: row.project ? (row.project.short_code || '') : '',
          startDate: row.start_date,
          endDate: row.end_date,
          crewType: row.crew_type
        };
        ids.forEach(function(tid) {
          if (!tid) return;
          if (!map[tid]) map[tid] = [];
          map[tid].push(info);
        });
      });
      return { data: map, error: null };
    } catch (err) {
      console.error('[schedule-utils] findTechConflicts:', err);
      return { data: {}, error: err };
    }
  }

  // ─── COMMENTS ──────────────────────────────────────────────────────────────

  async function listComments(entryId) {
    try {
      var r = await supabaseClient.from('schedule_comments')
        .select('*').eq('entry_id', entryId)
        .order('created_at', { ascending: true });
      return { data: r.data || [], error: r.error };
    } catch (err) {
      return { data: [], error: err };
    }
  }

  async function addComment(entryId, body) {
    try {
      var u = await supabaseClient.auth.getUser();
      var user = u.data && u.data.user;
      if (!user) return { data: null, error: new Error('Not signed in') };
      var profileQ = await supabaseClient.from('profiles').select('full_name,email').eq('id', user.id).single();
      var profile = profileQ.data || {};
      var name = profile.full_name || profile.email || 'Anonymous';
      var r = await supabaseClient.from('schedule_comments').insert({
        entry_id: entryId,
        author_id: user.id,
        author_name: name,
        body: body
      }).select().single();
      return { data: r.data, error: r.error };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  async function deleteComment(id) {
    var r = await supabaseClient.from('schedule_comments').delete().eq('id', id);
    return { error: r.error };
  }

  // ─── PROJECTS (lookup helper for the picker) ──────────────────────────────

  var _projectCache = null;
  var _projectCacheTs = 0;

  // Existing projects table uses `project_name` and embeds the GC/customer
  // inside `notes` as "Customer: XXX\n…" (per projects.html convention).
  // We normalize each row so the rest of the UI can use {name, customer, ...}.
  function normalizeProject(row) {
    if (!row) return row;
    var notes = row.notes || '';
    var custMatch = notes.match(/^Customer:\s*(.+)$/m);
    return {
      id: row.id,
      name: row.project_name || row.name || '',
      short_code: row.short_code || null,
      customer: custMatch ? custMatch[1].trim() : '',
      address: row.address || '',
      status: row.status || 'active',
      pm_name: row.pm_name || '',
      pm_email: row.pm_email || '',
      notes: notes
    };
  }

  async function listScheduleProjects(opts) {
    opts = opts || {};
    var force = opts.force === true;
    if (!force && _projectCache && (Date.now() - _projectCacheTs) < 60000) {
      return { data: _projectCache, error: null };
    }
    try {
      var r = await supabaseClient.from('projects')
        .select('id,project_name,short_code,address,status,notes,pm_name,pm_email')
        .order('project_name', { ascending: true });
      var rows = (r.data || []).map(normalizeProject);
      _projectCache = rows;
      _projectCacheTs = Date.now();
      return { data: rows, error: r.error };
    } catch (err) {
      return { data: [], error: err };
    }
  }

  function invalidateProjectCache() { _projectCache = null; }

  // ─── SUBCONTRACTORS ──────────────────────────────────────────────────────

  var _subCache = null;
  var _subCacheTs = 0;

  /**
   * List all active subcontractors. 60s cache like techs.
   * Returns array of { id, name, display_name, contact_name, trade, ... }
   */
  async function listSubcontractors(opts) {
    opts = opts || {};
    if (!opts.force && _subCache && (Date.now() - _subCacheTs) < 60000) {
      return { data: _subCache, error: null };
    }
    try {
      var r = await supabaseClient.from('subcontractors').select('*')
        .eq('is_active', true).order('name');
      if (r.error) {
        // Table doesn't exist yet — return empty so UI degrades gracefully
        if (/does not exist/i.test(r.error.message || '')) {
          _subCache = [];
          _subCacheTs = Date.now();
          return { data: [], error: null };
        }
        return { data: [], error: r.error };
      }
      _subCache = r.data || [];
      _subCacheTs = Date.now();
      return { data: _subCache, error: null };
    } catch (err) {
      console.error('[schedule-utils] listSubcontractors:', err);
      return { data: [], error: err };
    }
  }

  function invalidateSubCache() { _subCache = null; }

  async function createSubcontractor(sub) {
    var r = await supabaseClient.from('subcontractors').insert(sub).select().single();
    invalidateSubCache();
    return { data: r.data, error: r.error };
  }

  // ─── PM TEMPLATES (recurring maintenance) ────────────────────────────────

  /**
   * List all PM templates with their linked project + customer for display.
   */
  async function listPMTemplates(opts) {
    opts = opts || {};
    try {
      var sel = '*,project:projects(id,project_name,short_code,address,notes,pm_name,pm_email),' +
                'last_visit:schedule_entries!last_visit_id(id,start_date,end_date,status)';
      var q = supabaseClient.from('pm_templates').select(sel)
        .order('next_visit_date', { ascending: true, nullsFirst: false });
      if (opts.activeOnly) q = q.eq('is_active', true);
      var r = await q;
      var rows = (r.data || []).map(function(row) {
        if (row.project) row.project = normalizeProject(row.project);
        return row;
      });
      return { data: rows, error: r.error };
    } catch (err) {
      console.error('[schedule-utils] listPMTemplates:', err);
      return { data: [], error: err };
    }
  }

  async function createPMTemplate(template) {
    var r = await supabaseClient.from('pm_templates').insert(template).select().single();
    return { data: r.data, error: r.error };
  }

  async function updatePMTemplate(id, patch) {
    var r = await supabaseClient.from('pm_templates').update(patch).eq('id', id).select().single();
    return { data: r.data, error: r.error };
  }

  async function deletePMTemplate(id) {
    var r = await supabaseClient.from('pm_templates').delete().eq('id', id);
    return { error: r.error };
  }

  /**
   * Generate the next PM visit from a template.
   * Creates a schedule_entries row for next_visit_date + visit_duration_days,
   * with the template's preferred_tech_ids pre-assigned, then bumps the
   * template's last_visit_id and next_visit_date by frequency_days.
   *
   * Idempotency: if there's already a non-cancelled schedule entry for this
   * template's project/customer at the next_visit_date with crew_type
   * 'maintenance', skip creating a duplicate.
   */
  async function generateNextPMVisit(templateId) {
    try {
      var tR = await supabaseClient.from('pm_templates').select('*').eq('id', templateId).single();
      if (tR.error || !tR.data) return { data: null, error: tR.error || new Error('Template not found') };
      var t = tR.data;
      if (!t.is_active) return { data: null, error: new Error('Template is inactive') };
      if (!t.next_visit_date) return { data: null, error: new Error('Template has no next_visit_date set') };

      var startDate = t.next_visit_date;
      var endDate   = startDate;
      if (t.visit_duration_days && t.visit_duration_days > 1) {
        // visit_duration_days = 1 means single-day, 2 means start+1 etc.
        var dt = new Date(startDate + 'T00:00:00');
        dt.setDate(dt.getDate() + (t.visit_duration_days - 1));
        endDate = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
      }

      // Resolve assigned tech NAMES from the IDs
      var techList = await listTechs();
      var techMap = {};
      (techList.data || []).forEach(function(tt) { techMap[tt.id] = tt.full_name; });
      var techIds = t.preferred_tech_ids || [];
      var techNames = techIds.map(function(id) { return techMap[id] || ''; }).filter(Boolean);

      // Idempotency check
      if (t.project_id) {
        var dupQ = await supabaseClient.from('schedule_entries').select('id')
          .eq('project_id', t.project_id)
          .eq('crew_type', 'maintenance')
          .eq('start_date', startDate)
          .neq('status', 'cancelled');
        if ((dupQ.data || []).length > 0) {
          return { data: null, error: new Error('A maintenance entry for this date already exists. Skipping duplicate.') };
        }
      }

      // Build the new schedule_entries row
      var u = await supabaseClient.auth.getUser();
      var uid = u.data && u.data.user ? u.data.user.id : null;
      var newEntry = {
        project_id: t.project_id,
        crew_type: 'maintenance',
        start_date: startDate,
        end_date: endDate,
        assigned_tech_ids: techIds,
        assigned_tech_names: techNames,
        scope_summary: t.scope_template || (t.name + ' (PM)'),
        notes: 'Auto-generated from PM template: ' + t.name,
        priority: 'normal',
        status: 'scheduled',
        manpower_needed: techIds.length || null,
        created_by: uid
      };
      var iR = await supabaseClient.from('schedule_entries').insert(newEntry).select().single();
      if (iR.error) return { data: null, error: iR.error };

      // Advance the template's next_visit_date by frequency_days
      var nd = new Date(startDate + 'T00:00:00');
      nd.setDate(nd.getDate() + (t.frequency_days || 90));
      var nextDate = nd.getFullYear() + '-' + String(nd.getMonth()+1).padStart(2,'0') + '-' + String(nd.getDate()).padStart(2,'0');
      await supabaseClient.from('pm_templates').update({
        last_visit_id: iR.data.id,
        next_visit_date: nextDate
      }).eq('id', templateId);

      return { data: iR.data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  // ─── PERMISSIONS ──────────────────────────────────────────────────────────

  /**
   * Returns true if the current user is allowed to write (create/edit/delete)
   * schedule entries. RLS will enforce this server-side too — this is a UX
   * helper to hide buttons.
   */
  var _isManagerCache = null;
  async function canWriteSchedule() {
    if (_isManagerCache !== null) return _isManagerCache;
    try {
      var u = await supabaseClient.auth.getUser();
      var user = u.data && u.data.user;
      if (!user) return (_isManagerCache = false);
      var r = await supabaseClient.from('profiles').select('role').eq('id', user.id).single();
      var role = r.data && r.data.role;
      _isManagerCache = (role === 'manager' || role === 'admin');
      return _isManagerCache;
    } catch (err) {
      console.warn('[schedule-utils] canWriteSchedule:', err);
      return false;
    }
  }

  // ─── DATE HELPERS ─────────────────────────────────────────────────────────

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function addDays(iso, n) {
    var d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function fmtDateShort(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function fmtDateLong(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // ─── EXPORT ON WINDOW ─────────────────────────────────────────────────────

  window.NWSchedule = {
    CREW_TYPES: CREW_TYPES,
    STATUSES: STATUSES,
    PRIORITIES: PRIORITIES,
    crewTypeMeta: crewTypeMeta,
    statusMeta: statusMeta,
    priorityMeta: priorityMeta,
    listTechs: listTechs,
    createTech: createTech,
    updateTech: updateTech,
    deleteTech: deleteTech,
    listEntries: listEntries,
    getEntry: getEntry,
    createEntry: createEntry,
    updateEntry: updateEntry,
    deleteEntry: deleteEntry,
    findTechConflicts: findTechConflicts,
    listSubcontractors: listSubcontractors,
    createSubcontractor: createSubcontractor,
    listPMTemplates: listPMTemplates,
    createPMTemplate: createPMTemplate,
    updatePMTemplate: updatePMTemplate,
    deletePMTemplate: deletePMTemplate,
    generateNextPMVisit: generateNextPMVisit,
    listComments: listComments,
    addComment: addComment,
    deleteComment: deleteComment,
    listScheduleProjects: listScheduleProjects,
    invalidateProjectCache: invalidateProjectCache,
    canWriteSchedule: canWriteSchedule,
    todayISO: todayISO,
    addDays: addDays,
    fmtDateShort: fmtDateShort,
    fmtDateLong: fmtDateLong
  };
})();
