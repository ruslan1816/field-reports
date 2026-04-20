/**
 * Northern Wolves AC — Email Utilities
 * Shared email sending logic for all field report forms.
 *
 * Flow: Tech hits Send →
 *   1. Email preview modal opens (editable To/CC/Subject/Body)
 *   2. Tech reviews and clicks "Confirm Send"
 *   3. PDF uploads to Google Drive (via Apps Script)
 *   4. EmailJS sends email with Drive download link
 *   5. Fallback: mailto with all 3 emails if anything fails
 */

const EMAIL_CONFIG = {
  // EmailJS credentials
  EMAILJS_PUBLIC_KEY:  '2D_ekI2psvgG5W9Bi',
  EMAILJS_SERVICE_ID:  'service_48i790s',
  EMAILJS_TEMPLATE_ID: 'template_97sktpv',

  // Google Apps Script web app URL (uploads PDF to Drive, returns link)
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzvkMp9DdSa4JUC8CNxLPnGuiYnkMoidltHbQvvUYQPh7ZfLICPWRcRG7iKcbKH-A3c/exec',

  // Management team — all reports go to these addresses
  MANAGEMENT_EMAILS: [
    'jonathan@northernwolvesac.com',
    'andrei@northernwolvesac.com',
    'ruslan@northernwolvesac.com'
  ]
};

// ========== EMAIL PREVIEW MODAL ==========

var _emailPreviewResolve = null;
var _emailPreviewParams = null;

function _createEmailPreviewModal() {
  if (document.getElementById('emailPreviewOverlay')) return;

  var overlay = document.createElement('div');
  overlay.id = 'emailPreviewOverlay';
  overlay.innerHTML =
    '<div class="email-preview-backdrop"></div>' +
    '<div class="email-preview-modal">' +
      '<div class="email-preview-header">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#0696D7,#0474a8);color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px">&#9993;</div>' +
          '<div><div style="font-weight:700;font-size:16px;color:#1a2332">Review Before Sending</div>' +
          '<div style="font-size:12px;color:#94a3b8">Edit any field, then confirm</div></div>' +
        '</div>' +
        '<button class="email-preview-close" onclick="cancelEmailPreview()">&times;</button>' +
      '</div>' +
      '<div class="email-preview-body">' +
        '<div class="email-field">' +
          '<label>From</label>' +
          '<input type="text" id="emailPreviewFrom" readonly>' +
        '</div>' +
        '<div class="email-field">' +
          '<label>To</label>' +
          '<input type="text" id="emailPreviewTo">' +
        '</div>' +
        '<div class="email-field">' +
          '<label>CC <span style="color:#94a3b8;font-weight:400">(optional)</span></label>' +
          '<input type="text" id="emailPreviewCc" placeholder="Add CC recipients...">' +
        '</div>' +
        '<div class="email-field">' +
          '<label>Subject</label>' +
          '<input type="text" id="emailPreviewSubject">' +
        '</div>' +
        '<div class="email-field">' +
          '<label>Message</label>' +
          '<textarea id="emailPreviewBody" rows="6"></textarea>' +
        '</div>' +
        '<div class="email-field">' +
          '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#f0f9ff;border-radius:8px;border:1px solid #bae6fd">' +
            '<span style="font-size:16px">&#128206;</span>' +
            '<div><div style="font-size:12px;font-weight:600;color:#0369a1" id="emailPreviewFilename">report.pdf</div>' +
            '<div style="font-size:11px;color:#94a3b8">PDF will be uploaded to Google Drive</div></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="email-preview-footer">' +
        '<button class="btn btn-success email-confirm-btn" id="emailConfirmBtn" onclick="confirmEmailPreview()">' +
          '&#9993; Confirm &amp; Send' +
        '</button>' +
        '<button class="btn btn-outline" onclick="cancelEmailPreview()">Cancel</button>' +
      '</div>' +
    '</div>';

  // Inject styles
  var style = document.createElement('style');
  style.textContent =
    '.email-preview-backdrop{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);z-index:9999}' +
    '.email-preview-modal{position:fixed;top:0;right:0;bottom:0;width:100%;max-width:520px;background:#fff;z-index:10000;display:flex;flex-direction:column;box-shadow:-4px 0 30px rgba(0,0,0,.2);animation:epSlideIn .25s ease-out}' +
    '@keyframes epSlideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}' +
    '.email-preview-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e2e8f0}' +
    '.email-preview-close{background:none;border:none;font-size:24px;color:#94a3b8;cursor:pointer;padding:4px 8px;border-radius:6px}' +
    '.email-preview-close:hover{background:#f1f5f9;color:#1a2332}' +
    '.email-preview-body{flex:1;overflow-y:auto;padding:16px 20px}' +
    '.email-field{margin-bottom:12px}' +
    '.email-field label{display:block;font-size:12px;font-weight:600;color:#64748b;margin-bottom:4px}' +
    '.email-field input,.email-field textarea{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;font-family:inherit;background:#fff;box-sizing:border-box}' +
    '.email-field input:focus,.email-field textarea:focus{outline:none;border-color:#0696D7;box-shadow:0 0 0 3px rgba(6,150,215,.1)}' +
    '.email-field input[readonly]{background:#f8fafc;color:#64748b}' +
    '.email-field textarea{resize:vertical;min-height:100px}' +
    '.email-preview-footer{display:flex;gap:10px;padding:16px 20px;border-top:1px solid #e2e8f0;background:#f8fafc}' +
    '.email-confirm-btn{flex:1;padding:12px;font-size:15px!important;font-weight:700!important}' +
    '@media(max-width:520px){.email-preview-modal{max-width:100%}}';
  document.head.appendChild(style);
  document.body.appendChild(overlay);
}

function showEmailPreview(params) {
  _createEmailPreviewModal();
  _emailPreviewParams = params;

  var overlay = document.getElementById('emailPreviewOverlay');
  overlay.style.display = 'block';

  // Get tech email from profile if available.
  // getCurrentUser returns a Promise { data: user, error } — we resolve it
  // async and update the preview field after. Keep a synchronous fallback
  // so the field never shows empty.
  var fromEmail = params.techName || 'Technician';
  if (typeof getCurrentUser === 'function') {
    Promise.resolve(getCurrentUser())
      .then(function(result) {
        var u = result && result.data ? result.data : result;
        if (u && u.email) {
          var el = document.getElementById('emailPreviewFrom');
          if (el) el.value = u.email;
        }
      })
      .catch(function() { /* ignore */ });
  }

  document.getElementById('emailPreviewFrom').value = fromEmail;
  document.getElementById('emailPreviewTo').value = EMAIL_CONFIG.MANAGEMENT_EMAILS.join(', ');
  document.getElementById('emailPreviewCc').value = '';
  document.getElementById('emailPreviewSubject').value = params.subject || '';
  document.getElementById('emailPreviewBody').value = params.bodyText || '';
  document.getElementById('emailPreviewFilename').textContent = params.filename || 'report.pdf';

  // Reset confirm button
  var btn = document.getElementById('emailConfirmBtn');
  btn.disabled = false;
  btn.innerHTML = '&#9993; Confirm &amp; Send';

  return new Promise(function(resolve) {
    _emailPreviewResolve = resolve;
  });
}

function confirmEmailPreview() {
  var btn = document.getElementById('emailConfirmBtn');
  btn.disabled = true;
  btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:6px"></span>Sending...';

  // Read edited values
  var editedParams = Object.assign({}, _emailPreviewParams, {
    subject: document.getElementById('emailPreviewSubject').value,
    bodyText: document.getElementById('emailPreviewBody').value,
    toEmails: document.getElementById('emailPreviewTo').value,
    ccEmails: document.getElementById('emailPreviewCc').value
  });

  // Close modal
  document.getElementById('emailPreviewOverlay').style.display = 'none';

  if (_emailPreviewResolve) {
    _emailPreviewResolve({ confirmed: true, params: editedParams });
    _emailPreviewResolve = null;
  }
}

function cancelEmailPreview() {
  document.getElementById('emailPreviewOverlay').style.display = 'none';
  if (_emailPreviewResolve) {
    _emailPreviewResolve({ confirmed: false });
    _emailPreviewResolve = null;
  }
}

// ========== PDF UPLOAD ==========

/**
 * Upload PDF to Google Drive via Apps Script.
 * Returns { downloadUrl, viewUrl, fileId } on success.
 */
async function uploadToGoogleDrive(pdfDoc, filename) {
  // Get raw base64 from jsPDF (strip the data URI prefix)
  const dataUri = pdfDoc.output('datauristring');
  const base64 = dataUri.split('base64,')[1];

  console.log('Uploading PDF to Google Drive...', filename);

  const response = await fetch(EMAIL_CONFIG.APPS_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify({ filename: filename, base64: base64 }),
    headers: { 'Content-Type': 'text/plain' }
  });

  // Apps Script redirects, so we follow it and parse the JSON
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    throw new Error('Drive upload failed: ' + text.substring(0, 200));
  }

  if (!result.success) {
    throw new Error('Drive upload error: ' + (result.error || 'Unknown'));
  }

  console.log('PDF uploaded to Drive:', result.downloadUrl);
  return result;
}

// ========== SEND WITH PREVIEW ==========

/**
 * Send a completed report PDF to the management team.
 * Now shows an email preview modal first — user can edit To/CC/Subject/Body
 * before confirming the send.
 *
 * @param {Object} params
 * @param {string} params.reportType   - e.g. "Service Call Report"
 * @param {string} params.subject      - email subject line
 * @param {string} params.bodyText     - plain-text email body
 * @param {string} params.customerName - customer/site name
 * @param {string} params.techName     - technician name
 * @param {Object} params.pdfDoc       - jsPDF document instance
 * @param {string} params.filename     - e.g. "ServiceCall_AcmeCorp_2026-03-24.pdf"
 * @returns {Promise<Object|false>} result object if succeeded, false if cancelled or fell back to mailto
 */
async function sendReportToManagement({ reportType, subject, bodyText, customerName, techName, pdfDoc, filename }) {

  // Show email preview modal and wait for user decision
  var preview = await showEmailPreview({ reportType, subject, bodyText, customerName, techName, pdfDoc, filename });

  if (!preview.confirmed) {
    // User cancelled — don't send
    return false;
  }

  // Use the (potentially edited) values from preview
  var finalParams = preview.params;

  // If offline, skip entirely — go straight to fallback
  if (!navigator.onLine) {
    console.warn('Offline — falling back to mailto');
    fallbackMailto({ subject: finalParams.subject, bodyText: finalParams.bodyText, pdfDoc: finalParams.pdfDoc, filename: finalParams.filename });
    return false;
  }

  try {
    showToast('Uploading report...');

    // Step 1: Upload PDF to Google Drive
    const driveResult = await uploadToGoogleDrive(finalParams.pdfDoc, finalParams.filename);

    showToast('Sending email...');

    // Step 2: Send email via EmailJS with the Drive link (no attachment needed)
    emailjs.init(EMAIL_CONFIG.EMAILJS_PUBLIC_KEY);

    const bodyWithLink = finalParams.bodyText
      + '\n\n--- PDF Report ---'
      + '\nDownload: ' + driveResult.downloadUrl
      + '\nView: ' + driveResult.viewUrl
      + '\n\n-- Northern Wolves Air Conditioning';

    // Build recipient list (To + CC)
    var toEmails = finalParams.toEmails || EMAIL_CONFIG.MANAGEMENT_EMAILS.join(', ');
    if (finalParams.ccEmails) {
      toEmails += ', ' + finalParams.ccEmails;
    }

    await emailjs.send(EMAIL_CONFIG.EMAILJS_SERVICE_ID, EMAIL_CONFIG.EMAILJS_TEMPLATE_ID, {
      to_emails:     toEmails,
      subject:       finalParams.subject,
      body_text:     bodyWithLink,
      report_type:   finalParams.reportType,
      customer_name: finalParams.customerName || '',
      tech_name:     finalParams.techName || ''
    });

    showToast('Report sent to management!');
    setTimeout(function() { window.location.href = 'index.html'; }, 1500);
    return { success: true, driveUrl: driveResult.downloadUrl, viewUrl: driveResult.viewUrl, fileId: driveResult.fileId };

  } catch (error) {
    console.error('Send failed:', error);
    alert('Send error: ' + (error.text || error.message || JSON.stringify(error)) + '\n\nFalling back to email app.');
    fallbackMailto({ subject: finalParams.subject, bodyText: finalParams.bodyText, pdfDoc: finalParams.pdfDoc, filename: finalParams.filename });
    return false;
  }
}

// ========== FALLBACK ==========

/**
 * Fallback: download PDF locally and open mailto: with all management emails.
 * The tech will need to manually attach the downloaded PDF.
 */
function fallbackMailto({ subject, bodyText, pdfDoc, filename }) {
  // Download the PDF to device
  pdfDoc.save(filename);

  // Build mailto with all management emails
  const allEmails = EMAIL_CONFIG.MANAGEMENT_EMAILS.join(',');
  const fullBody = bodyText
    + '\n\nPlease see attached PDF report.'
    + '\n\n--\nNorthern Wolves Air Conditioning';

  const mailtoUrl = 'mailto:' + allEmails
    + '?subject=' + encodeURIComponent(subject)
    + '&body='    + encodeURIComponent(fullBody);

  window.location.href = mailtoUrl;
  showToast('PDF downloaded — please attach to email');
}
