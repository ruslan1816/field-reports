/**
 * Northern Wolves AC — Email Utilities
 * Shared email sending logic for all field report forms.
 *
 * Flow: Tech hits Send →
 *   1. PDF uploads to Google Drive (via Apps Script)
 *   2. EmailJS sends email with Drive download link to management
 *   3. Fallback: mailto with all 3 emails if anything fails
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

/**
 * Send a completed report PDF to the management team.
 *
 * @param {Object} params
 * @param {string} params.reportType   - e.g. "Service Call Report"
 * @param {string} params.subject      - email subject line
 * @param {string} params.bodyText     - plain-text email body
 * @param {string} params.customerName - customer/site name
 * @param {string} params.techName     - technician name
 * @param {Object} params.pdfDoc       - jsPDF document instance
 * @param {string} params.filename     - e.g. "ServiceCall_AcmeCorp_2026-03-24.pdf"
 * @returns {Promise<boolean>} true if succeeded, false if fell back to mailto
 */
async function sendReportToManagement({ reportType, subject, bodyText, customerName, techName, pdfDoc, filename }) {

  // If offline, skip entirely — go straight to fallback
  if (!navigator.onLine) {
    console.warn('Offline — falling back to mailto');
    fallbackMailto({ subject, bodyText, pdfDoc, filename });
    return false;
  }

  try {
    showToast('Uploading report...');

    // Step 1: Upload PDF to Google Drive
    const driveResult = await uploadToGoogleDrive(pdfDoc, filename);

    showToast('Sending email...');

    // Step 2: Send email via EmailJS with the Drive link (no attachment needed)
    emailjs.init(EMAIL_CONFIG.EMAILJS_PUBLIC_KEY);

    const bodyWithLink = bodyText
      + '\n\n--- PDF Report ---'
      + '\nDownload: ' + driveResult.downloadUrl
      + '\nView: ' + driveResult.viewUrl
      + '\n\n-- Northern Wolves Air Conditioning';

    await emailjs.send(EMAIL_CONFIG.EMAILJS_SERVICE_ID, EMAIL_CONFIG.EMAILJS_TEMPLATE_ID, {
      to_emails:     EMAIL_CONFIG.MANAGEMENT_EMAILS.join(', '),
      subject:       subject,
      body_text:     bodyWithLink,
      report_type:   reportType,
      customer_name: customerName || '',
      tech_name:     techName || ''
    });

    showToast('Report sent to management!');
    return { success: true, driveUrl: driveResult.downloadUrl, viewUrl: driveResult.viewUrl, fileId: driveResult.fileId };

  } catch (error) {
    console.error('Send failed:', error);
    alert('Send error: ' + (error.text || error.message || JSON.stringify(error)) + '\n\nFalling back to email app.');
    fallbackMailto({ subject, bodyText, pdfDoc, filename });
    return false;
  }
}

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
