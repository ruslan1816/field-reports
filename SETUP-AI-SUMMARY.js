/**
 * =====================================================================
 * GOOGLE APPS SCRIPT — Claude AI Summary Proxy
 * Northern Wolves AC Field Reporting
 * =====================================================================
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://script.google.com
 * 2. Create a new project (click "+ New project")
 * 3. Name it "NW AI Summary Proxy"
 * 4. Delete the default code and paste EVERYTHING below this comment block
 * 5. Replace 'YOUR_CLAUDE_API_KEY_HERE' with your Anthropic API key
 *    (Get one at https://console.anthropic.com/settings/keys)
 * 6. Click Deploy > New deployment
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 7. Click Deploy, authorize it, copy the URL
 * 8. Give me the URL and I'll add it to the app
 *
 * Cost: ~$0.003 per summary (less than 1 cent)
 * =====================================================================
 */

var CLAUDE_API_KEY = 'YOUR_CLAUDE_API_KEY_HERE';
var CLAUDE_MODEL = 'claude-sonnet-4-20250514';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.action === 'generate_summary') {
      var summary = callClaude(body.prompt);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, summary: summary }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message || String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, message: 'NW AI Summary Proxy is running' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function callClaude(prompt) {
  var url = 'https://api.anthropic.com/v1/messages';

  var payload = {
    model: CLAUDE_MODEL,
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var text = response.getContentText();

  if (code !== 200) {
    throw new Error('Claude API error (' + code + '): ' + text.substring(0, 300));
  }

  var result = JSON.parse(text);

  if (result.content && result.content.length > 0) {
    return result.content[0].text;
  }

  throw new Error('No content in Claude response');
}

// Test function — run this in Apps Script to verify your API key works
function testClaude() {
  var summary = callClaude('Say "Hello from Northern Wolves AC!" in one sentence.');
  Logger.log('Test result: ' + summary);
}
