/**
 * diagnostics.js
 * 端末内だけに保持する軽量な動作ログ。映像・音声・デバイス名は記録しない。
 */
const Diagnostics = (() => {
  const STORAGE_KEY = 'shut_diagnostics_v1';
  const MAX_ENTRIES = 40;
  let _contextProvider = null;
  let _entries = [];

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) _entries = saved.slice(-MAX_ENTRIES);
  } catch (_) {}

  function _safeDetail(detail) {
    if (detail === undefined || detail === null) return null;
    if (typeof detail === 'string' || typeof detail === 'number' || typeof detail === 'boolean') return detail;
    try { return JSON.parse(JSON.stringify(detail)); } catch (_) { return String(detail); }
  }

  function _context() {
    if (!_contextProvider) return {};
    try { return _contextProvider() || {}; } catch (_) { return {}; }
  }

  function log(level, code, detail) {
    _entries.push({
      at: new Date().toISOString(),
      level: level || 'info',
      code: code || 'unknown',
      detail: _safeDetail(detail),
      context: _context(),
    });
    _entries = _entries.slice(-MAX_ENTRIES);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_entries)); } catch (_) {}
  }

  function setContextProvider(provider) {
    _contextProvider = typeof provider === 'function' ? provider : null;
  }

  function getEntries() {
    return _entries.map(entry => Object.assign({}, entry));
  }

  function getReport() {
    const report = {
      app: 'SHUT',
      generatedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      online: navigator.onLine,
      context: _context(),
      entries: getEntries(),
    };
    return JSON.stringify(report, null, 2);
  }

  async function copyReport() {
    const report = getReport();
    try {
      await navigator.clipboard.writeText(report);
      return true;
    } catch (_) {
      try {
        const ta = document.createElement('textarea');
        ta.value = report;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (_2) {
        return false;
      }
    }
  }

  window.addEventListener('error', event => {
    log('error', 'window_error', event.message || 'unknown');
  });
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason && event.reason.message ? event.reason.message : String(event.reason || 'unknown');
    log('error', 'unhandled_rejection', reason);
  });

  return { log, setContextProvider, getEntries, getReport, copyReport };
})();
