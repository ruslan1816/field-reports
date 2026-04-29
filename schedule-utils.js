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
    { value: 'disconnect-demo',label: 'Disconnect / Demo',     icon: '⛏️', color: '#1e3a8a' },
    { value: 'maintenance',    label: 'Maintenance',           icon: '✅', color: '#5D822C' }
  ];

  var STATUSES = [
    { value: 'pending-crew',     label: '🚨 Pending Crew Assignment', color: '#dc2626' },
    { value: 'scheduled',        label: 'Scheduled',                   color: '#0696D7' },
    { value: 'in-progress',      label: 'In Progress',                 color: '#f59e0b' },
    { value: 'completed',        label: 'Completed',                   color: '#10b981' },
    { value: 'delayed',          label: 'Delayed',                     color: '#ef4444' },
    { value: 'cancelled',        label: 'Cancelled',                   color: '#94a3b8' }
  ];

  // Mirror of the DB BEFORE-trigger logic: if no crew is assigned, auto-flip
  // status to pending-crew (and back to scheduled when crew gets added).
  // Lets the UI react before the round-trip and gives a graceful client-side
  // fallback if pending-crew-status.sql hasn't been run yet.
  function normalizeCrewStatus(entry) {
    if (!entry) return entry;
    var hasCrew = (entry.assigned_tech_ids && entry.assigned_tech_ids.length > 0) ||
                  (entry.is_subcontractor && entry.subcontractor_name);
    if (!hasCrew) {
      // No crew → auto-flip to pending-crew unless user picked an explicit
      // working/terminal state (in-progress / completed / delayed / cancelled).
      if (!entry.status || entry.status === 'scheduled') {
        entry.status = 'pending-crew';
      }
    } else if (entry.status === 'pending-crew') {
      // Crew assigned, was pending-crew → auto-flip to scheduled.
      entry.status = 'scheduled';
    }
    return entry;
  }

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
    var includeInactive = opts.includeInactive === true;
    // Don't use cache when fetching inactive — that's a management view
    if (!force && !includeInactive && _techCache && (Date.now() - _techCacheTs) < 60000) {
      return { data: _techCache, error: null };
    }
    try {
      var q = supabaseClient.from('schedule_techs').select('*').order('first_name');
      if (!includeInactive) q = q.eq('is_active', true);
      var r = await q;
      if (r.error) return { data: [], error: r.error };
      if (!includeInactive) {
        _techCache = r.data || [];
        _techCacheTs = Date.now();
      }
      return { data: r.data || [], error: null };
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
      // Auto-flip status when crew is missing (mirror of DB trigger)
      normalizeCrewStatus(row);

      var r = await supabaseClient.from('schedule_entries').insert(row).select().single();

      // Graceful fallback if pending-crew-status.sql hasn't been applied yet:
      // older DB rejects 'pending-crew' via the CHECK constraint. Retry as 'scheduled'.
      var warning = null;
      if (r.error && row.status === 'pending-crew') {
        var msg = (r.error.message || '') + ' ' + (r.error.details || '');
        if (/check constraint|status_check|invalid input value/i.test(msg)) {
          row.status = 'scheduled';
          r = await supabaseClient.from('schedule_entries').insert(row).select().single();
          if (!r.error) warning = 'pending-crew-needs-migration';
        }
      }
      return { data: r.data, error: r.error, warning: warning };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  async function updateEntry(id, patch) {
    // Apply auto-flip status when crew is missing (mirror of DB trigger).
    // Only normalize when the relevant fields are present in the patch — otherwise
    // a partial patch (e.g. "just notes") shouldn't yank the status.
    var touchesCrew = (patch.assigned_tech_ids !== undefined) ||
                      (patch.is_subcontractor !== undefined) ||
                      (patch.subcontractor_name !== undefined) ||
                      (patch.status !== undefined);
    if (touchesCrew) normalizeCrewStatus(patch);

    var basePatch = Object.assign({}, patch);
    var stampedPatch = basePatch;
    try {
      // Stamp updated_by so the DB UPDATE trigger can credit the right actor.
      // (Column is added by notifications-schema.sql — gracefully fall back if missing.)
      var u = await supabaseClient.auth.getUser();
      var userId = u.data && u.data.user ? u.data.user.id : null;
      if (userId) stampedPatch = Object.assign({ updated_by: userId }, basePatch);
    } catch (e) { /* fall through — basePatch still saves */ }

    var r = await supabaseClient.from('schedule_entries').update(stampedPatch).eq('id', id).select().single();

    // Fallbacks if older schema is in place:
    var warning = null;
    if (r.error) {
      var msg = (r.error.message || '') + ' ' + (r.error.details || '');
      // (a) updated_by column missing (pre-Phase 7)
      if (stampedPatch !== basePatch && /updated_by/i.test(msg) && /(schema cache|column)/i.test(msg)) {
        r = await supabaseClient.from('schedule_entries').update(basePatch).eq('id', id).select().single();
        msg = (r.error && (r.error.message || '') + ' ' + (r.error.details || '')) || '';
      }
      // (b) pending-crew not yet in CHECK constraint (pre pending-crew-status.sql)
      if (r.error && basePatch.status === 'pending-crew' && /check constraint|status_check|invalid input value/i.test(msg)) {
        basePatch.status = 'scheduled';
        r = await supabaseClient.from('schedule_entries').update(basePatch).eq('id', id).select().single();
        if (!r.error) warning = 'pending-crew-needs-migration';
      }
    }
    return { data: r.data, error: r.error, warning: warning };
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
  async function findTechConflicts(startDate, endDate, excludeEntryId, opts) {
    if (!startDate || !endDate) return { data: {}, error: null };
    opts = opts || {};
    var newStartTime = opts.startTime || null;   // 'HH:MM' or null = all-day
    var newEndTime   = opts.endTime   || null;
    try {
      var sel = 'id,project_id,crew_type,start_date,end_date,start_time,end_time,assigned_tech_ids,status,' +
                'project:projects(project_name,short_code)';
      var q = supabaseClient.from('schedule_entries').select(sel)
        // Overlap test: A.start <= B.end AND A.end >= B.start
        .lte('start_date', endDate)
        .gte('end_date', startDate)
        .not('status', 'in', '(cancelled,completed)');

      var r = await q;
      if (r.error) return { data: {}, error: r.error };

      // Helper: do two HH:MM[:SS] time windows overlap on the same calendar day?
      function timesOverlap(aStart, aEnd, bStart, bEnd) {
        // Normalize to HH:MM for comparison (string compare works)
        var as = String(aStart).substring(0, 5);
        var ae = String(aEnd).substring(0, 5);
        var bs = String(bStart).substring(0, 5);
        var be = String(bEnd).substring(0, 5);
        // No overlap if A ends at-or-before B starts, or B ends at-or-before A starts
        return !(ae <= bs || be <= as);
      }

      var rows = r.data || [];
      var map = {};
      rows.forEach(function(row) {
        if (excludeEntryId && row.id === excludeEntryId) return;
        var ids = row.assigned_tech_ids || [];
        if (!ids.length) return;

        // Time-window check: if BOTH entries are single-day on the same date
        // AND BOTH have explicit time windows, only conflict when they overlap.
        // (Either one being all-day → blocks the whole day → conflict.)
        var rowSingleDay = (row.start_date === row.end_date);
        var newSingleDay = (startDate === endDate);
        var sameDay = rowSingleDay && newSingleDay && (row.start_date === startDate);
        if (sameDay && newStartTime && newEndTime && row.start_time && row.end_time) {
          if (!timesOverlap(newStartTime, newEndTime, row.start_time, row.end_time)) {
            return; // skip — non-overlapping time windows on same day
          }
        }

        var info = {
          entryId: row.id,
          projectName: row.project ? (row.project.project_name || '') : '',
          projectShortCode: row.project ? (row.project.short_code || '') : '',
          startDate: row.start_date,
          endDate: row.end_date,
          startTime: row.start_time || null,
          endTime: row.end_time || null,
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

  async function updateComment(id, body) {
    var r = await supabaseClient.from('schedule_comments').update({ body: body }).eq('id', id).select().single();
    return { data: r.data, error: r.error };
  }

  async function deleteComment(id) {
    var r = await supabaseClient.from('schedule_comments').delete().eq('id', id);
    return { error: r.error };
  }

  // ─── NOTIFICATIONS ─────────────────────────────────────────────────────────

  /**
   * List notifications for the current user, newest first.
   *   opts.unreadOnly — only return is_read=false
   *   opts.limit      — default 30
   */
  async function listNotifications(opts) {
    opts = opts || {};
    try {
      var q = supabaseClient.from('notifications').select('*')
        .order('created_at', { ascending: false })
        .limit(opts.limit || 30);
      if (opts.unreadOnly) q = q.eq('is_read', false);
      var r = await q;
      return { data: r.data || [], error: r.error };
    } catch (err) {
      return { data: [], error: err };
    }
  }

  async function getUnreadNotificationCount() {
    try {
      var r = await supabaseClient.from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false);
      return { count: r.count || 0, error: r.error };
    } catch (err) {
      return { count: 0, error: err };
    }
  }

  async function markNotificationRead(id) {
    var r = await supabaseClient.from('notifications')
      .update({ is_read: true }).eq('id', id);
    return { error: r.error };
  }

  async function markAllNotificationsRead() {
    // Use the helper RPC defined in notifications-schema.sql
    var r = await supabaseClient.rpc('mark_all_notifications_read');
    return { count: r.data, error: r.error };
  }

  /**
   * Subscribe to realtime notifications for the current user.
   * Returns an unsubscribe function.
   *   onInsert(notif) is called every time a new notification arrives.
   */
  function subscribeToNotifications(userId, onInsert) {
    if (!userId || !supabaseClient || !supabaseClient.channel) return function() {};
    var channel = supabaseClient
      .channel('notif:' + userId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: 'recipient_id=eq.' + userId
      }, function(payload) {
        try { onInsert(payload.new); } catch (e) { console.error(e); }
      })
      .subscribe();
    return function() {
      try { supabaseClient.removeChannel(channel); } catch (e) {}
    };
  }

  /**
   * Subscribe to realtime comments on a single entry (mini-chat).
   * Calls onChange(eventType, row) for INSERT / UPDATE / DELETE.
   * Returns an unsubscribe function.
   */
  function subscribeToEntryComments(entryId, onChange) {
    if (!entryId || !supabaseClient || !supabaseClient.channel) return function() {};
    var channel = supabaseClient
      .channel('entry-comments:' + entryId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'schedule_comments',
        filter: 'entry_id=eq.' + entryId
      }, function(payload) {
        try { onChange(payload.eventType, payload.new || payload.old); } catch (e) { console.error(e); }
      })
      .subscribe();
    return function() {
      try { supabaseClient.removeChannel(channel); } catch (e) {}
    };
  }

  // ─── ENTRY SUBSCRIPTIONS ───────────────────────────────────────────────────

  async function listEntrySubscribers(entryId) {
    try {
      var r = await supabaseClient.from('entry_subscriptions')
        .select('user_id, source, subscribed_at, profile:profiles(id, full_name, email)')
        .eq('entry_id', entryId);
      return { data: r.data || [], error: r.error };
    } catch (err) { return { data: [], error: err }; }
  }

  async function isSubscribedToEntry(entryId) {
    try {
      var u = await supabaseClient.auth.getUser();
      var userId = u.data && u.data.user ? u.data.user.id : null;
      if (!userId) return { subscribed: false };
      var r = await supabaseClient.from('entry_subscriptions')
        .select('user_id').eq('entry_id', entryId).eq('user_id', userId).maybeSingle();
      return { subscribed: !!r.data };
    } catch (err) { return { subscribed: false, error: err }; }
  }

  async function subscribeToEntry(entryId) {
    var u = await supabaseClient.auth.getUser();
    var userId = u.data && u.data.user ? u.data.user.id : null;
    if (!userId) return { error: { message: 'not signed in' } };
    var r = await supabaseClient.from('entry_subscriptions')
      .upsert({ entry_id: entryId, user_id: userId, source: 'manual' },
              { onConflict: 'entry_id,user_id' });
    return { error: r.error };
  }

  async function unsubscribeFromEntry(entryId) {
    var u = await supabaseClient.auth.getUser();
    var userId = u.data && u.data.user ? u.data.user.id : null;
    if (!userId) return { error: { message: 'not signed in' } };
    var r = await supabaseClient.from('entry_subscriptions')
      .delete().eq('entry_id', entryId).eq('user_id', userId);
    return { error: r.error };
  }

  // ─── NOTIFICATION PREFERENCES ──────────────────────────────────────────────

  async function getNotificationPrefs() {
    try {
      var u = await supabaseClient.auth.getUser();
      var userId = u.data && u.data.user ? u.data.user.id : null;
      if (!userId) return { data: null };
      var r = await supabaseClient.from('notification_preferences')
        .select('*').eq('user_id', userId).maybeSingle();
      // If no row yet (older user), seed defaults
      if (!r.data && !r.error) {
        var ins = await supabaseClient.from('notification_preferences')
          .insert({ user_id: userId }).select().single();
        return { data: ins.data, error: ins.error };
      }
      return { data: r.data, error: r.error };
    } catch (err) { return { data: null, error: err }; }
  }

  async function updateNotificationPrefs(patch) {
    var u = await supabaseClient.auth.getUser();
    var userId = u.data && u.data.user ? u.data.user.id : null;
    if (!userId) return { error: { message: 'not signed in' } };
    var r = await supabaseClient.from('notification_preferences')
      .update(Object.assign({}, patch, { updated_at: new Date().toISOString() }))
      .eq('user_id', userId).select().single();
    return { data: r.data, error: r.error };
  }

  // ─── WEB PUSH (Phase 3) ─────────────────────────────────────────────────────

  // VAPID public key for Northern Wolves push subscriptions
  var VAPID_PUBLIC_KEY = 'BIeh5wDv_IGOBRRWofV_bNkarERUb026oejR6gckelXAWY1mqq34kev0YjvcQephGiEcA-W7HT2qSSt3AvQKBdk';

  function _urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = window.atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  function _bufToB64(buf) {
    var bytes = new Uint8Array(buf);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return window.btoa(bin);
  }

  /** Returns true if Web Push is supported (PWA installed on iOS, modern Android, desktop Chrome/FF/Edge). */
  function isPushSupported() {
    return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  }

  /** Returns the current Notification permission ('default' | 'granted' | 'denied'). */
  function getPushPermission() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }

  /**
   * Subscribe to web push, save the subscription to push_subscriptions, and return it.
   * Triggers the browser permission prompt the first time.
   */
  async function enablePushNotifications() {
    if (!isPushSupported()) return { error: { message: 'Push not supported on this device/browser' } };

    var perm = await Notification.requestPermission();
    if (perm !== 'granted') return { error: { message: 'Notification permission denied' } };

    var reg = await navigator.serviceWorker.ready;
    var existing = await reg.pushManager.getSubscription();
    if (!existing) {
      existing = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    var json = existing.toJSON();
    var p256dh = json.keys && json.keys.p256dh;
    var auth   = json.keys && json.keys.auth;
    if (!p256dh || !auth) return { error: { message: 'subscription missing keys' } };

    var u = await supabaseClient.auth.getUser();
    var userId = u.data && u.data.user ? u.data.user.id : null;
    if (!userId) return { error: { message: 'not signed in' } };

    // Upsert by endpoint
    var r = await supabaseClient.from('push_subscriptions').upsert({
      user_id:    userId,
      endpoint:   json.endpoint,
      p256dh:     p256dh,
      auth:       auth,
      user_agent: navigator.userAgent
    }, { onConflict: 'endpoint' }).select().single();

    return { data: r.data, error: r.error, subscription: existing };
  }

  /** Unsubscribe + delete the row in push_subscriptions */
  async function disablePushNotifications() {
    if (!isPushSupported()) return { error: null };
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    if (!sub) return { error: null };
    var endpoint = sub.endpoint;
    try { await sub.unsubscribe(); } catch (e) {}
    var r = await supabaseClient.from('push_subscriptions').delete().eq('endpoint', endpoint);
    return { error: r.error };
  }

  /** Returns true if THIS browser is currently subscribed (and the row exists in DB). */
  async function isPushSubscribed() {
    if (!isPushSupported()) return false;
    try {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch (e) { return false; }
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

  async function updateSubcontractor(id, patch) {
    var r = await supabaseClient.from('subcontractors').update(patch).eq('id', id).select().single();
    invalidateSubCache();
    return { data: r.data, error: r.error };
  }

  async function deleteSubcontractor(id) {
    // Soft delete: keep historical references intact
    var r = await supabaseClient.from('subcontractors').update({ is_active: false }).eq('id', id);
    invalidateSubCache();
    return { error: r.error };
  }

  // ─── PROJECT MANAGERS ────────────────────────────────────────────────────

  var _pmCache = null;
  var _pmCacheTs = 0;

  async function listProjectManagers(opts) {
    opts = opts || {};
    if (!opts.force && _pmCache && (Date.now() - _pmCacheTs) < 60000) {
      return { data: _pmCache, error: null };
    }
    try {
      var r = await supabaseClient.from('project_managers').select('*')
        .eq('is_active', true).order('name');
      if (r.error) {
        if (/does not exist/i.test(r.error.message || '')) {
          _pmCache = [];
          _pmCacheTs = Date.now();
          return { data: [], error: null };
        }
        return { data: [], error: r.error };
      }
      _pmCache = r.data || [];
      _pmCacheTs = Date.now();
      return { data: _pmCache, error: null };
    } catch (err) {
      console.error('[schedule-utils] listProjectManagers:', err);
      return { data: [], error: err };
    }
  }

  function invalidatePMCache() { _pmCache = null; }

  async function createProjectManager(pm) {
    var r = await supabaseClient.from('project_managers').insert(pm).select().single();
    invalidatePMCache();
    return { data: r.data, error: r.error };
  }

  async function updateProjectManager(id, patch) {
    var r = await supabaseClient.from('project_managers').update(patch).eq('id', id).select().single();
    invalidatePMCache();
    return { data: r.data, error: r.error };
  }

  async function deleteProjectManager(id) {
    var r = await supabaseClient.from('project_managers').update({ is_active: false }).eq('id', id);
    invalidatePMCache();
    return { error: r.error };
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
    normalizeCrewStatus: normalizeCrewStatus,
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
    updateSubcontractor: updateSubcontractor,
    deleteSubcontractor: deleteSubcontractor,
    listProjectManagers: listProjectManagers,
    createProjectManager: createProjectManager,
    updateProjectManager: updateProjectManager,
    deleteProjectManager: deleteProjectManager,
    listPMTemplates: listPMTemplates,
    createPMTemplate: createPMTemplate,
    updatePMTemplate: updatePMTemplate,
    deletePMTemplate: deletePMTemplate,
    generateNextPMVisit: generateNextPMVisit,
    listComments: listComments,
    addComment: addComment,
    updateComment: updateComment,
    deleteComment: deleteComment,
    listNotifications: listNotifications,
    getUnreadNotificationCount: getUnreadNotificationCount,
    markNotificationRead: markNotificationRead,
    markAllNotificationsRead: markAllNotificationsRead,
    subscribeToNotifications: subscribeToNotifications,
    subscribeToEntryComments: subscribeToEntryComments,
    listEntrySubscribers: listEntrySubscribers,
    isSubscribedToEntry: isSubscribedToEntry,
    subscribeToEntry: subscribeToEntry,
    unsubscribeFromEntry: unsubscribeFromEntry,
    getNotificationPrefs: getNotificationPrefs,
    updateNotificationPrefs: updateNotificationPrefs,
    isPushSupported: isPushSupported,
    getPushPermission: getPushPermission,
    enablePushNotifications: enablePushNotifications,
    disablePushNotifications: disablePushNotifications,
    isPushSubscribed: isPushSubscribed,
    listScheduleProjects: listScheduleProjects,
    invalidateProjectCache: invalidateProjectCache,
    canWriteSchedule: canWriteSchedule,
    todayISO: todayISO,
    addDays: addDays,
    fmtDateShort: fmtDateShort,
    fmtDateLong: fmtDateLong
  };
})();
