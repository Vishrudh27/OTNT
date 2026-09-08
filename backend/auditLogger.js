// minimal audit logger (stdout + file, so experiment scripts can read
// ms-precision event timestamps without capturing the process's own stdout)
const fs = require('fs');
const path = require('path');

const LOG_FILE = process.env.AUDIT_LOG_FILE || path.join(__dirname, 'audit.log');

module.exports = {
  log: (msg) => {
    const line = `[AUDIT] ${new Date().toISOString()} ${msg}`;
    console.log(line);
    try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (e) { console.error('[AUDIT] file write failed:', e.message); }
  }
};



