/**
 * Northern Wolves AC — Email Utilities
 * Shared email sending logic for all field report forms.
 *
 * Primary:  EmailJS (auto-sends PDF to management, no manual steps)
 * Fallback: mailto: with all management emails (tech attaches PDF manually)
 *
 * ─── SETUP INSTRUCTIONS ───
 * 1. Go to https://www.emailjs.com/ and create a free account
 * 2. Email Services → Add New Service → connect your Gmail/Outlook
 * 3. Email Templates → Create New Template:
 *      To:      jonathan@northernwolvesac.com, andrei@northernwolvesac.com, ruslan@northernwolvesac.com
 *      Subject: {{subject}}
 *      Body:    {{body_text}}
 *      Attachments → Add: filename={{pdf_filename}}, content={{pdf_attachment}}, type=application/pdf
 * 4. Copy your Public Key (Account → API Keys), Service ID, and Template ID below
 */

const EMAIL_CONFIG = {
  // ⚠️ Replace these with your actual EmailJS credentials:
  EMAILJS_PUBLIC_KEY:  '2D_ekI2psvgG5W9Bi',     // Account → API Keys
  EMAILJS_SERVICE_ID:  'service_48i790s',        // Email Services → your service
  EMAILJS_TEMPLATE_ID: 'template_97sktpv',       // Email Templates → your template

  // Management team — all reports go to these addresses
  MANAGEMENT_EMAILS: [
    'jonathan@northernwolvesac.com',
    'andrei@northernwolvesac.com',
    'ruslan@northernwolvesac.com'
  ]
};

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
 * @returns {Promise<boolean>} true if EmailJS succeeded, false if fell back to mailto
 */
async function sendReportToManagement({ reportType, subject, bodyText, customerName, techName, pdfDoc, filename }) {

  // If offline, skip EmailJS entirely — go straight to fallback
  if (!navigator.onLine) {
    console.warn('Offline — falling back to mailto');
    fallbackMailto({ subject, bodyText, pdfDoc, filename });
    return false;
  }

  // If EmailJS credentials are not configured, go to fallback
  if (EMAIL_CONFIG.EMAILJS_PUBLIC_KEY === 'YOUR_PUBLIC_KEY') {
    console.warn('EmailJS not configured — falling back to mailto');
    fallbackMailto({ subject, bodyText, pdfDoc, filename });
    return false;
  }

  try {
    // Build FormData and send directly to EmailJS REST API
    // This bypasses the SDK to ensure file attachments work reliably
    const pdfBlob = pdfDoc.output('blob');
    const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

    const formData = new FormData();
    formData.append('service_id',  EMAIL_CONFIG.EMAILJS_SERVICE_ID);
    formData.append('template_id', EMAIL_CONFIG.EMAILJS_TEMPLATE_ID);
    formData.append('user_id',     EMAIL_CONFIG.EMAILJS_PUBLIC_KEY);
    formData.append('to_emails',      EMAIL_CONFIG.MANAGEMENT_EMAILS.join(', '));
    formData.append('subject',        subject);
    formData.append('body_text',      bodyText);
    formData.append('report_type',    reportType);
    formData.append('customer_name',  customerName || '');
    formData.append('tech_name',      techName || '');
    formData.append('pdf_filename',   filename);
    formData.append('pdf_file',       pdfFile, filename);

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send-form', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('EmailJS returned ' + response.status + ': ' + (await response.text()));
    }

    showToast('✅ Report sent to management!');
    return true;

  } catch (error) {
    console.error('EmailJS send failed:', error);
    alert('EmailJS error: ' + (error.text || error.message || JSON.stringify(error)));
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
  showToast('📎 PDF downloaded — please attach to email');
}
