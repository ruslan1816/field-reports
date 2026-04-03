/**
 * supabase-config.js — Northern Wolves AC Field Reporting PWA
 * ============================================================
 * Phase 1: Supabase Client Initialization & Helper Functions
 *
 * This is Phase 1 of the Supabase integration. It sets up the client
 * and provides helper functions for auth, reports, customers, equipment,
 * photos, RFIs, and projects. Authentication UI and protected routes
 * will be added in Phase 2.
 *
 * IMPORTANT: The Supabase UMD bundle must be loaded BEFORE this file
 * in any HTML page that uses it:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
 *   <script src="supabase-config.js"></script>
 */

// ---------------------------------------------------------------------------
// Client initialization
// ---------------------------------------------------------------------------

var SUPABASE_URL = 'https://vrscvnebznmomkdlhooi.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_7F9lDes97zMPVVrgdG2ggw_vdc6H3QE';

if (typeof supabase === 'undefined' || !supabase.createClient) {
    console.error('[supabase-config] Supabase JS library not found. ' +
        'Make sure the CDN script is loaded before supabase-config.js.');
}

var supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('[supabase-config] Supabase client initialised for', SUPABASE_URL);

// ---------------------------------------------------------------------------
// Report-number prefix map
// ---------------------------------------------------------------------------

var REPORT_TYPE_PREFIX = {
    'service-call':  'SC',
    'startup':       'SU',
    'pm-checklist':  'PM',
    'site-survey':   'SS',
    'work-order':    'WO'
};

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/**
 * Get the currently authenticated user (from the active session).
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
async function getCurrentUser() {
    try {
        var result = await supabaseClient.auth.getUser();
        if (result.error) {
            console.error('[supabase-config] getCurrentUser error:', result.error.message);
        }
        return { data: result.data?.user || null, error: result.error || null };
    } catch (err) {
        console.error('[supabase-config] getCurrentUser exception:', err);
        return { data: null, error: err };
    }
}

/**
 * Get the profile row from the `profiles` table for the current user.
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
async function getUserProfile() {
    try {
        var user = await getCurrentUser();
        if (user.error || !user.data) {
            return { data: null, error: user.error || new Error('Not authenticated') };
        }
        var { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.data.id)
            .single();
        if (error) console.error('[supabase-config] getUserProfile error:', error.message);
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] getUserProfile exception:', err);
        return { data: null, error: err };
    }
}

/**
 * Check whether the current user has a specific role.
 * @param {string} role - e.g. 'admin', 'tech', 'office'
 * @returns {Promise<{data: boolean, error: object|null}>}
 */
async function userHasRole(role) {
    try {
        var profile = await getUserProfile();
        if (profile.error || !profile.data) {
            return { data: false, error: profile.error || new Error('No profile found') };
        }
        var hasRole = profile.data.role === role;
        console.log('[supabase-config] userHasRole("' + role + '"):', hasRole);
        return { data: hasRole, error: null };
    } catch (err) {
        console.error('[supabase-config] userHasRole exception:', err);
        return { data: false, error: err };
    }
}

/**
 * Sign in with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
async function signIn(email, password) {
    try {
        var { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });
        if (error) {
            console.error('[supabase-config] signIn error:', error.message);
        } else {
            console.log('[supabase-config] signIn success:', data.user?.email);
        }
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] signIn exception:', err);
        return { data: null, error: err };
    }
}

/**
 * Sign out the current user.
 * @returns {Promise<{data: null, error: object|null}>}
 */
async function signOut() {
    try {
        var { error } = await supabaseClient.auth.signOut();
        if (error) {
            console.error('[supabase-config] signOut error:', error.message);
        } else {
            console.log('[supabase-config] signOut success');
        }
        return { data: null, error: error || null };
    } catch (err) {
        console.error('[supabase-config] signOut exception:', err);
        return { data: null, error: err };
    }
}

/**
 * Subscribe to auth state changes (SIGNED_IN, SIGNED_OUT, etc.).
 * @param {function} callback - receives (event, session)
 * @returns {object} subscription — call .unsubscribe() when done
 */
function onAuthChange(callback) {
    var { data } = supabaseClient.auth.onAuthStateChange(function (event, session) {
        console.log('[supabase-config] auth state change:', event);
        callback(event, session);
    });
    return data.subscription;
}

// ---------------------------------------------------------------------------
// Report helpers
// ---------------------------------------------------------------------------

/**
 * Generate a report number like "SC-20260402-A3F7".
 */
function generateReportNumber(reportType) {
    var prefix = REPORT_TYPE_PREFIX[reportType] || 'RPT';
    var today = new Date();
    var dateStr = today.getFullYear().toString() +
        String(today.getMonth() + 1).padStart(2, '0') +
        String(today.getDate()).padStart(2, '0');
    var rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return prefix + '-' + dateStr + '-' + rand;
}

/**
 * Save a report to Supabase.
 * @param {object} reportData
 *   - report_type {string}   e.g. 'service-call'
 *   - customer_name {string}
 *   - tech_name {string}
 *   - form_data {object}     JSONB payload
 *   - customer_id {string}   optional UUID
 *   - equipment_id {string}  optional UUID
 *   - status {string}        optional, defaults to 'draft'
 *   - report_date {string}   optional, defaults to today
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
async function saveReport(reportData) {
    try {
        var user = await getCurrentUser();
        var techId = (user.data && user.data.id) ? user.data.id : null;

        var today = new Date().toISOString().split('T')[0];

        var row = {
            report_number:  generateReportNumber(reportData.report_type),
            report_type:    reportData.report_type,
            report_date:    reportData.report_date || today,
            customer_name:  reportData.customer_name,
            tech_name:      reportData.tech_name,
            tech_id:        techId,
            form_data:      reportData.form_data || {},
            status:         reportData.status || 'draft'
        };

        if (reportData.customer_id) row.customer_id   = reportData.customer_id;
        if (reportData.equipment_id) row.equipment_id  = reportData.equipment_id;

        console.log('[supabase-config] saveReport:', row.report_number);

        var { data, error } = await supabaseClient
            .from('reports')
            .insert(row)
            .select()
            .single();

        if (error) console.error('[supabase-config] saveReport error:', error.message);
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] saveReport exception:', err);
        return { data: null, error: err };
    }
}

/**
 * Fetch reports with optional filters.
 * @param {object} filters
 *   - tech_id {string}
 *   - status {string}
 *   - report_type {string}
 *   - customer_id {string}
 *   - from_date {string}  ISO date
 *   - to_date {string}    ISO date
 *   - limit {number}      default 50
 * @returns {Promise<{data: array|null, error: object|null}>}
 */
async function getReports(filters) {
    filters = filters || {};
    try {
        var query = supabaseClient
            .from('reports')
            .select('*')
            .order('created_at', { ascending: false });

        if (filters.tech_id)     query = query.eq('tech_id', filters.tech_id);
        if (filters.status)      query = query.eq('status', filters.status);
        if (filters.report_type) query = query.eq('report_type', filters.report_type);
        if (filters.customer_id) query = query.eq('customer_id', filters.customer_id);
        if (filters.from_date)   query = query.gte('report_date', filters.from_date);
        if (filters.to_date)     query = query.lte('report_date', filters.to_date);

        query = query.limit(filters.limit || 50);

        var { data, error } = await query;
        if (error) console.error('[supabase-config] getReports error:', error.message);
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] getReports exception:', err);
        return { data: null, error: err };
    }
}

/**
 * Update a report's status.
 * @param {string} reportId   UUID
 * @param {string} status     e.g. 'submitted', 'reviewed', 'approved'
 * @param {string} reviewedBy optional UUID of the reviewer
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
async function updateReportStatus(reportId, status, reviewedBy) {
    try {
        var updates = { status: status };
        if (reviewedBy) updates.reviewed_by = reviewedBy;
        if (status === 'reviewed' || status === 'approved') {
            updates.reviewed_at = new Date().toISOString();
        }

        console.log('[supabase-config] updateReportStatus:', reportId, '->', status);

        var { data, error } = await supabaseClient
            .from('reports')
            .update(updates)
            .eq('id', reportId)
            .select()
            .single();

        if (error) console.error('[supabase-config] updateReportStatus error:', error.message);
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] updateReportStatus exception:', err);
        return { data: null, error: err };
    }
}

// ---------------------------------------------------------------------------
// Customer helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all customers.
 * @returns {Promise<{data: array|null, error: object|null}>}
 */
async function getCustomers() {
    try {
        var { data, error } = await supabaseClient
            .from('customers')
            .select('*')
            .order('name', { ascending: true });

        if (error) console.error('[supabase-config] getCustomers error:', error.message);
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] getCustomers exception:', err);
        return { data: null, error: err };
    }
}

/**
 * Create or upsert a customer.
 * @param {object} customerData - { name, address, phone, email, notes, ... }
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
async function saveCustomer(customerData) {
    try {
        console.log('[supabase-config] saveCustomer:', customerData.name);

        var { data, error } = await supabaseClient
            .from('customers')
            .upsert(customerData, { onConflict: 'id' })
            .select()
            .single();

        if (error) console.error('[supabase-config] saveCustomer error:', error.message);
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] saveCustomer exception:', err);
        return { data: null, error: err };
    }
}

// ---------------------------------------------------------------------------
// Equipment helpers
// ---------------------------------------------------------------------------

/**
 * Get equipment, optionally filtered by customer.
 * @param {string} [customerId] - UUID
 * @returns {Promise<{data: array|null, error: object|null}>}
 */
async function getEquipment(customerId) {
    try {
        var query = supabaseClient
            .from('equipment')
            .select('*')
            .order('created_at', { ascending: false });

        if (customerId) query = query.eq('customer_id', customerId);

        var { data, error } = await query;
        if (error) console.error('[supabase-config] getEquipment error:', error.message);
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] getEquipment exception:', err);
        return { data: null, error: err };
    }
}

/**
 * Create or upsert equipment.
 * @param {object} equipmentData - { customer_id, unit_type, brand, model, serial_number, ... }
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
async function saveEquipment(equipmentData) {
    try {
        console.log('[supabase-config] saveEquipment:', equipmentData.unit_type, equipmentData.brand);

        var { data, error } = await supabaseClient
            .from('equipment')
            .upsert(equipmentData, { onConflict: 'id' })
            .select()
            .single();

        if (error) console.error('[supabase-config] saveEquipment error:', error.message);
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] saveEquipment exception:', err);
        return { data: null, error: err };
    }
}

// ---------------------------------------------------------------------------
// Photo upload
// ---------------------------------------------------------------------------

/**
 * Upload a photo for a report.
 *  1. Uploads the file to the 'report-photos' storage bucket at {reportId}/{filename}.
 *  2. Creates a row in the report_photos table with the public URL.
 *
 * @param {string} reportId - UUID of the report
 * @param {File}   file     - browser File object
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
async function uploadReportPhoto(reportId, file) {
    try {
        var filePath = reportId + '/' + file.name;
        console.log('[supabase-config] uploadReportPhoto:', filePath);

        // 1. Upload to storage
        var { data: uploadData, error: uploadError } = await supabaseClient
            .storage
            .from('report-photos')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) {
            console.error('[supabase-config] uploadReportPhoto storage error:', uploadError.message);
            return { data: null, error: uploadError };
        }

        // 2. Get public URL
        var { data: urlData } = supabaseClient
            .storage
            .from('report-photos')
            .getPublicUrl(filePath);

        // 3. Insert record in report_photos table
        var { data, error } = await supabaseClient
            .from('report_photos')
            .insert({
                report_id:  reportId,
                file_name:  file.name,
                file_path:  filePath,
                url:        urlData.publicUrl,
                file_size:  file.size,
                mime_type:  file.type
            })
            .select()
            .single();

        if (error) console.error('[supabase-config] uploadReportPhoto db error:', error.message);
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] uploadReportPhoto exception:', err);
        return { data: null, error: err };
    }
}

// ---------------------------------------------------------------------------
// RFI helpers
// ---------------------------------------------------------------------------

/**
 * Save an RFI (Request for Information).
 * @param {object} rfiData - { project_id, subject, question, requested_by, ... }
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
async function saveRFI(rfiData) {
    try {
        console.log('[supabase-config] saveRFI:', rfiData.subject);

        var { data, error } = await supabaseClient
            .from('rfis')
            .insert(rfiData)
            .select()
            .single();

        if (error) console.error('[supabase-config] saveRFI error:', error.message);
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] saveRFI exception:', err);
        return { data: null, error: err };
    }
}

/**
 * Fetch RFIs with optional filters.
 * @param {object} filters - { project_id, status, limit }
 * @returns {Promise<{data: array|null, error: object|null}>}
 */
async function getRFIs(filters) {
    filters = filters || {};
    try {
        var query = supabaseClient
            .from('rfis')
            .select('*')
            .order('created_at', { ascending: false });

        if (filters.project_id) query = query.eq('project_id', filters.project_id);
        if (filters.status)     query = query.eq('status', filters.status);

        query = query.limit(filters.limit || 50);

        var { data, error } = await query;
        if (error) console.error('[supabase-config] getRFIs error:', error.message);
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] getRFIs exception:', err);
        return { data: null, error: err };
    }
}

// ---------------------------------------------------------------------------
// Project helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all projects.
 * @returns {Promise<{data: array|null, error: object|null}>}
 */
async function getProjects() {
    try {
        var { data, error } = await supabaseClient
            .from('projects')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) console.error('[supabase-config] getProjects error:', error.message);
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] getProjects exception:', err);
        return { data: null, error: err };
    }
}

/**
 * Create or update a project.
 * @param {object} projectData - { name, customer_id, status, address, ... }
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
async function saveProject(projectData) {
    try {
        console.log('[supabase-config] saveProject:', projectData.name);

        var { data, error } = await supabaseClient
            .from('projects')
            .upsert(projectData, { onConflict: 'id' })
            .select()
            .single();

        if (error) console.error('[supabase-config] saveProject error:', error.message);
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] saveProject exception:', err);
        return { data: null, error: err };
    }
}

/**
 * Upload a document for a project.
 *  1. Uploads to the 'project-documents' storage bucket at {projectId}/{filename}.
 *  2. Creates a row in the project_documents table.
 *
 * @param {string} projectId - UUID
 * @param {File}   file      - browser File object
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
/**
 * Delete a project.
 */
async function deleteCloudProject(projectId) {
    try {
        var { error } = await supabaseClient
            .from('projects')
            .delete()
            .eq('id', projectId);
        if (error) console.error('[supabase-config] deleteCloudProject error:', error.message);
        return { error: error };
    } catch (err) {
        console.error('[supabase-config] deleteCloudProject exception:', err);
        return { error: err };
    }
}

/**
 * Fetch documents for a project.
 */
async function getProjectDocuments(projectId) {
    try {
        var { data, error } = await supabaseClient
            .from('project_documents')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });
        if (error) console.error('[supabase-config] getProjectDocuments error:', error.message);
        return { data: data || [], error: error };
    } catch (err) {
        console.error('[supabase-config] getProjectDocuments exception:', err);
        return { data: [], error: err };
    }
}

/**
 * Delete a project document (record + storage file).
 */
async function deleteProjectDocument(docId, storagePath) {
    try {
        if (storagePath) {
            await supabaseClient.storage.from('project-documents').remove([storagePath]);
        }
        var { error } = await supabaseClient
            .from('project_documents')
            .delete()
            .eq('id', docId);
        if (error) console.error('[supabase-config] deleteProjectDocument error:', error.message);
        return { error: error };
    } catch (err) {
        console.error('[supabase-config] deleteProjectDocument exception:', err);
        return { error: err };
    }
}

function guessDocType(filename) {
    var name = (filename || '').toLowerCase();
    if (name.match(/drawing|dwg|cad|plan/)) return 'drawing';
    if (name.match(/submittal/)) return 'submittal';
    if (name.match(/manual|iom/)) return 'manual';
    if (name.match(/warranty/)) return 'warranty';
    if (name.match(/report/)) return 'report';
    if (name.match(/spec/)) return 'specification';
    if (name.match(/contract|proposal/)) return 'contract';
    if (name.match(/photo|img|jpg|jpeg|png/)) return 'photo';
    return 'other';
}

async function uploadProjectDocument(projectId, file) {
    try {
        var filePath = projectId + '/' + file.name;
        console.log('[supabase-config] uploadProjectDocument:', filePath);

        // 1. Upload to storage
        var { data: uploadData, error: uploadError } = await supabaseClient
            .storage
            .from('project-documents')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) {
            console.error('[supabase-config] uploadProjectDocument storage error:', uploadError.message);
            return { data: null, error: uploadError };
        }

        // 2. Get public URL
        var { data: urlData } = supabaseClient
            .storage
            .from('project-documents')
            .getPublicUrl(filePath);

        // 3. Insert record
        var { data, error } = await supabaseClient
            .from('project_documents')
            .insert({
                project_id:    projectId,
                title:         file.name,
                file_name:     file.name,
                storage_path:  filePath,
                file_size:     file.size,
                mime_type:     file.type,
                document_type: guessDocType(file.name)
            })
            .select()
            .single();

        if (error) console.error('[supabase-config] uploadProjectDocument db error:', error.message);
        if (data) data.publicUrl = urlData.publicUrl;
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] uploadProjectDocument exception:', err);
        return { data: null, error: err };
    }
}

// ---------------------------------------------------------------------------
// Signature helpers (bonus — used by report forms)
// ---------------------------------------------------------------------------

/**
 * Upload a signature image for a report.
 * @param {string} reportId - UUID
 * @param {string} type     - 'tech' or 'customer'
 * @param {Blob}   blob     - signature image blob (PNG)
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
async function uploadReportSignature(reportId, type, blob) {
    try {
        var fileName = type + '-signature.png';
        var filePath = reportId + '/' + fileName;
        console.log('[supabase-config] uploadReportSignature:', filePath);

        var { data: uploadData, error: uploadError } = await supabaseClient
            .storage
            .from('report-photos')
            .upload(filePath, blob, {
                contentType: 'image/png',
                cacheControl: '3600',
                upsert: true
            });

        if (uploadError) {
            console.error('[supabase-config] uploadReportSignature storage error:', uploadError.message);
            return { data: null, error: uploadError };
        }

        var { data: urlData } = supabaseClient
            .storage
            .from('report-photos')
            .getPublicUrl(filePath);

        var { data, error } = await supabaseClient
            .from('report_signatures')
            .upsert({
                report_id:      reportId,
                signature_type: type,
                file_path:      filePath,
                url:            urlData.publicUrl
            }, { onConflict: 'report_id,signature_type' })
            .select()
            .single();

        if (error) console.error('[supabase-config] uploadReportSignature db error:', error.message);
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] uploadReportSignature exception:', err);
        return { data: null, error: err };
    }
}

// ---------------------------------------------------------------------------
// Dispatch helpers
// ---------------------------------------------------------------------------

/**
 * Fetch dispatches with optional filters.
 * @param {object} filters - { assigned_to, status, priority, limit }
 * @returns {Promise<{data: array|null, error: object|null}>}
 */
async function getDispatches(filters) {
    filters = filters || {};
    try {
        var query = supabaseClient
            .from('dispatches')
            .select('*');

        if (filters.assigned_to) query = query.eq('assigned_to', filters.assigned_to);
        if (filters.status)      query = query.eq('status', filters.status);
        if (filters.priority)    query = query.eq('priority', filters.priority);
        if (filters.created_by)  query = query.eq('created_by', filters.created_by);
        if (filters.not_status)  query = query.neq('status', filters.not_status);

        query = query.limit(filters.limit || 100);

        var { data, error } = await query;
        if (error) console.error('[supabase-config] getDispatches error:', error.message);
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] getDispatches exception:', err);
        return { data: null, error: err };
    }
}

/**
 * Create or update a dispatch.
 * @param {object} dispatchData
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
async function saveDispatch(dispatchData) {
    try {
        console.log('[supabase-config] saveDispatch:', dispatchData.title);

        var { data, error } = await supabaseClient
            .from('dispatches')
            .upsert(dispatchData, { onConflict: 'id' })
            .select()
            .single();

        if (error) console.error('[supabase-config] saveDispatch error:', error.message);
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] saveDispatch exception:', err);
        return { data: null, error: err };
    }
}

/**
 * Update a dispatch's status.
 * @param {string} dispatchId - UUID
 * @param {string} status - pending/accepted/in-progress/completed/cancelled
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
async function updateDispatchStatus(dispatchId, status) {
    try {
        var updates = { status: status };
        if (status === 'completed') updates.completed_at = new Date().toISOString();

        var { data, error } = await supabaseClient
            .from('dispatches')
            .update(updates)
            .eq('id', dispatchId)
            .select()
            .single();

        if (error) console.error('[supabase-config] updateDispatchStatus error:', error.message);
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] updateDispatchStatus exception:', err);
        return { data: null, error: err };
    }
}

/**
 * Delete a dispatch.
 */
async function deleteDispatch(dispatchId) {
    try {
        var { error } = await supabaseClient
            .from('dispatches')
            .delete()
            .eq('id', dispatchId);
        if (error) console.error('[supabase-config] deleteDispatch error:', error.message);
        return { error: error };
    } catch (err) {
        console.error('[supabase-config] deleteDispatch exception:', err);
        return { error: err };
    }
}

/**
 * Fetch all profiles (for tech assignment dropdown).
 * @returns {Promise<{data: array|null, error: object|null}>}
 */
async function getAllProfiles() {
    try {
        var { data, error } = await supabaseClient
            .from('profiles')
            .select('id, full_name, email, role, is_active')
            .eq('is_active', true)
            .order('full_name', { ascending: true });
        if (error) console.error('[supabase-config] getAllProfiles error:', error.message);
        return { data: data, error: error };
    } catch (err) {
        console.error('[supabase-config] getAllProfiles exception:', err);
        return { data: null, error: err };
    }
}

/**
 * Delete equipment by ID.
 * @param {string} equipmentId - UUID
 * @returns {Promise<{error: object|null}>}
 */
async function deleteEquipment(equipmentId) {
    try {
        var { error } = await supabaseClient
            .from('equipment')
            .delete()
            .eq('id', equipmentId);
        if (error) console.error('[supabase-config] deleteEquipment error:', error.message);
        return { error: error };
    } catch (err) {
        console.error('[supabase-config] deleteEquipment exception:', err);
        return { error: err };
    }
}

console.log('[supabase-config] All helper functions loaded.');
