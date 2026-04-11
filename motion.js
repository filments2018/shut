/**
 * motion.js — 加速度センサーモジュール v2
 * 修正: acceleration.x===null のAndroid対応
 * 修正: ハイパスフィルタ追加（静止時の重力成分除去）
 * 修正: デバッグオーバーレイをUIから分離
 */

const Motion = (() => {
  // ── 定数 ──────────────────────────────────────
  let _threshold = 22; // シュット判定 m/s²（動的変更可能）
  const THRESHOLD_WARN = 14;   // ゲージ警告色切替
  const COOLDOWN_MS    = 750;  // シュット後のクールダウン
  const HP_ALPHA       = 0.85; // ハイパスフィルタ係数（重力除去）
  const LP_ALPHA       = 0.4;  // ローパスフィルタ係数（ノイズ平滑化）

  // ── 状態 ──────────────────────────────────────
  let _enabled   = false;
  let _active    = false;
  let _cooldown  = false;
  let _onShut    = null;
  let _onMag     = null;

  // ハイパスフィルタ用（重力成分を保持）
  let _gravX = 0, _gravY = 0, _gravZ = 0;
  let _gravSeeded = false; // 初回サンプルで重力をシード（収束遅延を防止）
  // ローパスフィルタ用（表示用スムーズ値）
  let _smoothMag = 0;

  // ── ハイパスフィルタで重力成分を除去 ──────────
  // accelerationIncludingGravity から純粋な加速度を算出
  function _highpass(x, y, z) {
    if (!_gravSeeded) {
      // 初回サンプルで重力をシード（0からの収束による誤検出を防止）
      _gravX = x; _gravY = y; _gravZ = z;
      _gravSeeded = true;
    }
    _gravX = HP_ALPHA * _gravX + (1 - HP_ALPHA) * x;
    _gravY = HP_ALPHA * _gravY + (1 - HP_ALPHA) * y;
    _gravZ = HP_ALPHA * _gravZ + (1 - HP_ALPHA) * z;
    return {
      x: x - _gravX,
      y: y - _gravY,
      z: z - _gravZ,
    };
  }

  // ── devicemotion ハンドラー ────────────────────
  function _handleMotion(e) {
    let ax, ay, az;

    // acceleration（重力除外済み）が有効ならそのまま使用
    const a = e.acceleration;
    if (a && a.x !== null && a.x !== undefined) {
      ax = a.x || 0;
      ay = a.y || 0;
      az = a.z || 0;
    } else {
      // accelerationIncludingGravity からハイパスフィルタで重力を除去
      const ag = e.accelerationIncludingGravity;
      if (!ag || ag.x === null) return; // データなし → スキップ
      const hp = _highpass(ag.x || 0, ag.y || 0, ag.z || 0);
      ax = hp.x; ay = hp.y; az = hp.z;
    }

    const rawMag = Math.sqrt(ax * ax + ay * ay + az * az);

    // ローパスで平滑化（ゲージ表示用）
    _smoothMag = LP_ALPHA * rawMag + (1 - LP_ALPHA) * _smoothMag;

    // ゲージコールバック（常時）
    if (_onMag) _onMag(_smoothMag, rawMag >= THRESHOLD_WARN);

    // シュット判定（active中かつ閾値超かつクールダウンなし）
    if (_active && rawMag >= _threshold && !_cooldown) {
      _fire(ax, ay, az);
    }
  }

  // シュット時の加速度方向を記録（ブラー方向判定用）
  let _lastDir = { x: 0, y: 0, z: 0 };

  function _fire(ax, ay, az) {
    if (_cooldown) return;
    _cooldown  = true;
    _lastDir   = { x: ax, y: ay, z: az, mag: Math.sqrt(ax*ax + ay*ay + az*az) };
    if (_onShut) _onShut();
    setTimeout(() => { _cooldown = false; }, COOLDOWN_MS);
  }

  // ── パブリック API ─────────────────────────────

  async function requestPermission() {
    if (typeof DeviceMotionEvent === 'undefined') return 'unavailable';

    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      // iOS 13+
      try {
        const res = await DeviceMotionEvent.requestPermission();
        if (res === 'granted') { _listen(); return 'granted'; }
        return 'denied';
      } catch (e) {
        console.warn('[Motion] requestPermission error:', e);
        return 'denied';
      }
    }

    // Android / その他
    _listen();
    return 'granted';
  }

  function _listen() {
    if (_enabled) return;
    window.addEventListener('devicemotion', _handleMotion, { passive: true });
    _enabled = true;
    //console.log('[Motion] リスナー登録完了');
  }

  function setActive(bool) {
    _active = bool;
    if (!bool) _smoothMag = 0; // 非アクティブ時にゲージリセット
  }

  function onShut(cb)      { _onShut = cb; }
  function onMagnitude(cb) { _onMag  = cb; }
  function resetCooldown() { _cooldown = false; }
  function isEnabled()     { return _enabled; }
  function isActive()      { return _active; }
  function getSmoothedMag(){ return _smoothMag; }

  return {
    requestPermission,
    setActive, onShut, onMagnitude,
    resetCooldown, isEnabled, isActive, getSmoothedMag,
    get THRESHOLD() { return _threshold; },
    _overrideThreshold: v => { _threshold = v; },
    getLastDirection: () => _lastDir,
  };
})();
