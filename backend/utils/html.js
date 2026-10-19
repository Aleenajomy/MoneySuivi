const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);

// CR/LF in a header value would let a user inject extra headers (e.g. Bcc) into outgoing mail.
const sanitizeHeader = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

module.exports = { escapeHtml, sanitizeHeader };
