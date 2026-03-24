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
    // Initialize EmailJS (safe to call multiple times)
    emailjs.init(EMAIL_CONFIG.EMAILJS_PUBLIC_KEY);

    // Convert PDF to clean base64 data URL
    // jsPDF datauristring adds "filename=generated.pdf;" which breaks EmailJS
    const rawUri = pdfDoc.output('datauristring');
    const base64Data = rawUri.split('base64,')[1];
    const cleanDataUrl = 'data:application/pdf;base64,' + base64Data;

    // Build template parameters
    const templateParams = {
      to_emails:      EMAIL_CONFIG.MANAGEMENT_EMAILS.join(', '),
      subject:        subject,
      body_text:      bodyText,
      report_type:    reportType,
      customer_name:  customerName || '',
      tech_name:      techName || '',
      pdf_filename:   filename,
      pdf_attachment: cleanDataUrl
    };

    // Send via EmailJS
    await emailjs.send(
      EMAIL_CONFIG.EMAILJS_SERVICE_ID,
      EMAIL_CONFIG.EMAILJS_TEMPLATE_ID,
      templateParams
    );

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
