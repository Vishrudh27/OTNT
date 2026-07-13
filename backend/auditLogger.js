// minimal audit logger (stdout)
module.exports = {
  log: (msg) => console.log(`[AUDIT] ${new Date().toISOString()} ${msg}`)
};
