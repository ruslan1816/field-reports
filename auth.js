/**
 * auth.js — Northern Wolves AC Field Reporting PWA
 * =================================================
 * Phase 2: Authentication utilities for route protection,
 * profile management, and tech name auto-fill.
 *
 * Requires: supabase-config.js (loaded before this file)
 */

(function() {
  'use strict';

  var AUTH_PROFILE_KEY = 'nw_auth_profile';
  var LEGACY_PROFILE_KEY = 'nw_tech_profile';

  // ─── Route Protection ─────────────────────────────────────────────

  /**
   * Redirect to login if not authenticated.
   * Call at the top of every protected page.
   * @returns {Promise<object>} session
   */
  async function requireAuth() {
    try {
      var result = await supabaseClient.auth.getSession();
      var session = result.data && result.data.session;
      if (!session) {
        window.location.href = 'login.html';
        throw new Error('Not authenticated');
      }
      // Sync profile to localStorage for backward compatibility
      syncProfile(session.user);
      return session;
    } catch (err) {
      if (err.message !== 'Not authenticated') {
        console.error('[auth] requireAuth error:', err);
      }
      window.location.href = 'login.html';
      throw err;
    }
  }

  /**
   * Redirect to index if already authenticated.
   * Call on the login page.
   */
  async function redirectIfAuth() {
    try {
      var result = await supabaseClient.auth.getSession();
      var session = result.data && result.data.session;
      if (session) {
        window.location.href = 'index.html';
      }
    } catch (err) {
      // Not authenticated, stay on login
    }
  }

  // ─── Profile Management ───────────────────────────────────────────

  /**
   * Get the authenticated user's profile.
   * Caches in sessionStorage to avoid repeated DB calls.
   * @param {boolean} [forceRefresh] - bypass cache
   * @returns {Promise<object|null>}
   */
  async function getAuthProfile(forceRefresh) {
    if (!forceRefresh) {
      try {
        var cached = sessionStorage.getItem(AUTH_PROFILE_KEY);
        if (cached) return JSON.parse(cached);
      } catch (e) {}
    }

    var result = await getUserProfile();
    if (result.data) {
      try {
        sessionStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(result.data));
      } catch (e) {}
      return result.data;
    }
    return null;
  }

  /**
   * Sync Supabase profile to localStorage for backward compatibility
   * with draft-utils.js and other legacy code.
   */
  function syncProfile(user) {
    if (!user) return;
    try {
      var meta = user.user_metadata || {};
      var name = meta.full_name || user.email || '';
      var initials = name.split(' ').map(function(w) { return w.charAt(0); }).join('').toUpperCase().substring(0, 2);
      var legacy = {
        name: name,
        initials: initials,
        email: user.email,
        createdAt: user.created_at || new Date().toISOString()
      };
      localStorage.setItem(LEGACY_PROFILE_KEY, JSON.stringify(legacy));
    } catch (e) {}
  }

  // ─── Role Checks ──────────────────────────────────────────────────

  async function isManager() {
    var p = await getAuthProfile();
    return p && (p.role === 'manager' || p.role === 'admin');
  }

  async function isTech() {
    var p = await getAuthProfile();
    return p && p.role === 'tech';
  }

  async function isAdmin() {
    var p = await getAuthProfile();
    return p && p.role === 'admin';
  }

  // ─── Auto-fill Tech Name ──────────────────────────────────────────

  /**
   * Auto-fill the technician name field from the authenticated profile.
   * Handles different field IDs across forms.
   */
  async function autoFillTechName() {
    var profile = await getAuthProfile();
    if (!profile || !profile.full_name) return;

    var fieldIds = ['techName', 'fromName', 'requestedBy'];
    for (var i = 0; i < fieldIds.length; i++) {
      var el = document.getElementById(fieldIds[i]);
      if (el && !el.value) {
        el.value = profile.full_name;
      }
    }
  }

  // ─── Logout ───────────────────────────────────────────────────────

  async function logout() {
    try {
      sessionStorage.removeItem(AUTH_PROFILE_KEY);
      localStorage.removeItem(LEGACY_PROFILE_KEY);
      await signOut();
    } catch (e) {
      console.error('[auth] logout error:', e);
    }
    window.location.href = 'login.html';
  }

  // ─── Auth UI for Dashboard ────────────────────────────────────────

  /**
   * Initialize auth UI on the dashboard (profile circle, logout).
   */
  async function initAuthUI() {
    var profile = await getAuthProfile();
    if (!profile) return;

    // Update profile circle
    var circle = document.getElementById('profileCircle');
    if (circle) {
      var name = profile.full_name || profile.email || '';
      var initials = name.split(' ').map(function(w) { return w.charAt(0); }).join('').toUpperCase().substring(0, 2) || '?';
      circle.textContent = initials;
      circle.className = 'profile-circle';
      circle.title = name;
    }

    // Update profile name display if exists
    var nameEl = document.getElementById('profileName');
    if (nameEl) nameEl.textContent = profile.full_name || profile.email;

    var roleEl = document.getElementById('profileRole');
    if (roleEl) roleEl.textContent = (profile.role || 'tech').charAt(0).toUpperCase() + (profile.role || 'tech').slice(1);

    var emailEl = document.getElementById('profileEmail');
    if (emailEl) emailEl.textContent = profile.email || '';
  }

  // ─── Expose on window ─────────────────────────────────────────────

  window.requireAuth = requireAuth;
  window.redirectIfAuth = redirectIfAuth;
  window.getAuthProfile = getAuthProfile;
  window.isManager = isManager;
  window.isTech = isTech;
  window.isAdmin = isAdmin;
  window.autoFillTechName = autoFillTechName;
  window.logout = logout;
  window.initAuthUI = initAuthUI;

})();
