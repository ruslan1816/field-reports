/**
 * cloud-save.js — Northern Wolves AC Field Reporting PWA
 * =======================================================
 * Phase 3: Save reports to Supabase cloud database.
 * Works alongside the existing EmailJS + Google Drive flow.
 *
 * Requires: supabase-config.js, auth.js (loaded before this file)
 */

(function() {
  'use strict';

  /**
   * Save a completed report to Supabase.
   * Called from generateAndEmailWithHistory() in each form.
   *
   * @param {string} formType - e.g. 'service-call', 'startup', 'pm-checklist', etc.
   * @param {object} formData - the full collectData() object from the form
   * @param {object} [options]
   * @param {string} [options.reportId] - existing report ID from the form
   * @param {string} [options.projectId] - linked project ID
   * @returns {Promise<{data: object|null, error: object|null}>}
   */
  async function saveReportToCloud(formType, formData, options) {
    options = options || {};

    try {
      // Get authenticated user
      var session = await supabaseClient.auth.getSession();
      var user = session.data && session.data.session ? session.data.session.user : null;
      var techId = user ? user.id : null;

      // Extract common fields from form data
      var customerName = formData.custName || formData.customerName || formData.customer || '';
      var techName = formData.techName || formData.fromName || formData.requestedBy || '';
      var reportDate = formData.callDate || formData.suDate || formData.pmDate || formData.coDate ||
                       formData.surveyDate || formData.rfiDate || new Date().toISOString().split('T')[0];
      var address = formData.custAddress || formData.projAddress || formData.address || '';

      // AI summary (optional — tech may have generated one)
      var aiSummary = formData.aiSummary || '';

      // Build report row
      var row = {
        report_number: options.reportId || formData.reportId || generateReportNumber(formType),
        report_type: formType,
        report_date: reportDate,
        customer_name: customerName,
        tech_name: techName,
        tech_id: techId,
        form_data: formData,
        status: 'submitted'
      };

      // Include AI summary if present
      if (aiSummary) {
        row.ai_summary = aiSummary;
      }

      console.log('[cloud-save] Saving report:', row.report_number, row.report_type);

      var result = await supabaseClient
        .from('reports')
        .insert(row)
        .select()
        .single();

      if (result.error) {
        console.error('[cloud-save] Save error:', result.error.message);
        return { data: null, error: result.error };
      }

      console.log('[cloud-save] Report saved:', result.data.id);
      return { data: result.data, error: null };

    } catch (err) {
      console.error('[cloud-save] Exception:', err);
      // Don't block the email flow — cloud save is additive
      return { data: null, error: err };
    }
  }

  /**
   * Fetch reports from Supabase for the history page.
   *
   * @param {object} [filters]
   * @param {string} [filters.tech_id] - filter by technician
   * @param {string} [filters.report_type] - filter by type
   * @param {string} [filters.status] - filter by status
   * @param {number} [filters.limit] - max results (default 100)
   * @param {string} [filters.select] - columns to select (default '*', pass slim list for list views)
   * @returns {Promise<{data: array|null, error: object|null}>}
   */
  async function getCloudReports(filters) {
    filters = filters || {};
    try {
      // Default to slim list-view columns to avoid pulling huge form_data JSONB payloads
      var selectCols = filters.select || 'id,report_number,report_type,report_date,customer_name,tech_name,tech_id,status,created_at';
      var query = supabaseClient
        .from('reports')
        .select(selectCols)
        .order('created_at', { ascending: false })
        .limit(filters.limit || 100);

      if (filters.tech_id) query = query.eq('tech_id', filters.tech_id);
      if (filters.report_type) query = query.eq('report_type', filters.report_type);
      if (filters.status) query = query.eq('status', filters.status);

      var result = await query;
      if (result.error) {
        console.error('[cloud-save] getCloudReports error:', result.error.message);
      }
      return { data: result.data || [], error: result.error || null };
    } catch (err) {
      console.error('[cloud-save] getCloudReports exception:', err);
      return { data: [], error: err };
    }
  }

  /**
   * Update an existing report in Supabase (for revisions).
   * @param {string} cloudId - the Supabase row ID
   * @param {object} updates - fields to update (form_data, status, etc.)
   */
  async function updateReportInCloud(cloudId, updates) {
    try {
      var result = await supabaseClient
        .from('reports')
        .update(updates)
        .eq('id', cloudId)
        .select()
        .single();
      if (result.error) {
        console.error('[cloud-save] Update error:', result.error.message);
      }
      return { data: result.data || null, error: result.error || null };
    } catch (err) {
      console.error('[cloud-save] Update exception:', err);
      return { data: null, error: err };
    }
  }

  /**
   * Get a single report by its Supabase row ID.
   */
  async function getReportById(cloudId) {
    try {
      var result = await supabaseClient
        .from('reports')
        .select('*')
        .eq('id', cloudId)
        .single();
      return { data: result.data || null, error: result.error || null };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  /**
   * Get all change orders for a project.
   */
  async function getProjectChangeOrders(projectId) {
    try {
      var result = await supabaseClient
        .from('reports')
        .select('*')
        .eq('report_type', 'change-order')
        .order('created_at', { ascending: false });
      if (result.error) return { data: [], error: result.error };
      // Filter by project_id in form_data (since we store it there)
      var filtered = (result.data || []).filter(function(r) {
        return r.form_data && r.form_data._projectId === projectId;
      });
      return { data: filtered, error: null };
    } catch (err) {
      return { data: [], error: err };
    }
  }

  /**
   * Get all RFIs for a project.
   */
  async function getProjectRFIs(projectId) {
    try {
      var result = await supabaseClient
        .from('reports')
        .select('*')
        .eq('report_type', 'rfi')
        .order('created_at', { ascending: false });
      if (result.error) return { data: [], error: result.error };
      var filtered = (result.data || []).filter(function(r) {
        return r.form_data && r.form_data._projectId === projectId;
      });
      return { data: filtered, error: null };
    } catch (err) {
      return { data: [], error: err };
    }
  }

  // Expose on window
  window.saveReportToCloud = saveReportToCloud;
  window.getCloudReports = getCloudReports;
  window.updateReportInCloud = updateReportInCloud;
  window.getReportById = getReportById;
  window.getProjectChangeOrders = getProjectChangeOrders;
  window.getProjectRFIs = getProjectRFIs;

})();
