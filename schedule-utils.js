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
                'project:projects(id,name,short_code,customer,address)';
      var q = supabaseClient.from('schedule_entries').select(sel);

      if (opts.from) q = q.gte('end_date', opts.from);
      if (opts.to)   q = q.lte('start_date', opts.to);
      if (opts.crewType)  q = q.eq('crew_type', opts.crewType);
      if (opts.projectId) q = q.eq('project_id', opts.projectId);
      if (opts.status)    q = q.eq('status', opts.status);

      // Sort by start_date asc, then priority (urgent first)
      q = q.order('start_date', { ascending: true }).order('priority', { ascending: false });

      var r = await q;
      return { data: r.data || [], error: r.error };
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
      var sel = '*,project:projects(id,name,short_code,customer,address)';
      var r = await supabaseClient.from('schedule_entries').select(sel).eq('id', id).single();
      if (r.error) return { data: null, error: r.error };
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

  async function listScheduleProjects(opts) {
    opts = opts || {};
    var force = opts.force === true;
    if (!force && _projectCache && (Date.now() - _projectCacheTs) < 60000) {
      return { data: _projectCache, error: null };
    }
    try {
      var r = await supabaseClient.from('projects')
        .select('id,name,short_code,customer,address,status')
        .order('name', { ascending: true });
      _projectCache = r.data || [];
      _projectCacheTs = Date.now();
      return { data: _projectCache, error: r.error };
    } catch (err) {
      return { data: [], error: err };
    }
  }

  function invalidateProjectCache() { _projectCache = null; }

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
