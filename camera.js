/**
 * camera.js — v5
 * 修正: flip() 中に stop() が呼ばれる競合を _starting フラグで完全防止
 * 追加: setQuality() — 解像度プリセット（low/medium/high）
 * 追加: getConstraints() — 現在の制約を返す（デバッグ用）
 */

const Camera = (() => {
  let _stream    = null;
  let _videoEl   = null;
  let _isRear    = true;
  let _starting  = false;
  let _actualSettings = {};
  let _quality   = 'high'; // low | medium | high

  // 解像度プリセット
  const QUALITY_MAP = {
    low:    { width: 640,  height: 480,  frameRate: 30 },
    medium: { width: 1280, height: 720,  frameRate: 30 },
    high:   { width: 1920, height: 1080, frameRate: 30 },
  };

  function _constraints(facingMode) {
    const q = QUALITY_MAP[_quality] || QUALITY_MAP.high;
    return {
      video: {
        facingMode: { ideal: facingMode },
        width:      { ideal: q.width },
        height:     { ideal: q.height },
        frameRate:  { ideal: q.frameRate },
      },
      audio: false,
    };
  }

  async function _acquire(facingMode) {
    try {
      return await navigator.mediaDevices.getUserMedia(_constraints(facingMode));
    } catch (e) {
      // 制約が厳しすぎるデバイス向けフォールバック
      console.warn('[Camera] 制約緩和で再試行:', e.message);
      return navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false,
      });
    }
  }

  async function start(videoEl) {
    if (_starting) return false;
    _starting = true;
    _videoEl  = videoEl;
    _stopTracks();
    videoEl.classList.remove('cam-hidden');

    try {
      _stream = await _acquire('environment');
      _isRear = true;
    } catch (_) {
      try {
        _stream = await _acquire('user');
        _isRear = false;
      } catch (err) {
        console.warn('[Camera] 起動失敗:', err.message);
        _starting = false;
        return false;
      }
    }

    videoEl.srcObject = _stream;
    videoEl.classList.toggle('rear', _isRear);
    try { await videoEl.play(); } catch (e) {}

    const track = _stream.getVideoTracks()[0];
    _actualSettings = track ? track.getSettings() : {};
    // debug: [Camera] resolution info removed for production
    _starting = false;
    return true;
  }

  async function flip() {
    if (!_videoEl || _starting) return false;
    const target = !_isRear;
    _starting = true;
    _stopTracks();

    const facing = target ? 'environment' : 'user';
    try {
      _stream = await _acquire(facing);
      _isRear = target;
    } catch (err) {
      // 失敗 → 元のカメラに戻す
      try {
        _stream = await _acquire(_isRear ? 'environment' : 'user');
      } catch (_) {
        _starting = false;
        return false;
      }
    }

    _videoEl.srcObject = _stream;
    _videoEl.classList.toggle('rear', _isRear);
    try { await _videoEl.play(); } catch (e) {}

    //console.log('[Camera] flip →', _isRear ? 'リア' : 'フロント');
    _starting = false;
    return true;
  }

  function stop() {
    if (_videoEl) {
      const el = _videoEl;
      const oldStream = _stream;
      el.classList.add('cam-hidden');
      setTimeout(() => { if (el.srcObject === oldStream) el.srcObject = null; }, 350);
    }
    _stopTracks();
  }

  function _stopTracks() {
    if (_stream) {
      _stream.getTracks().forEach(t => t.stop());
      _stream = null;
    }
  }

  /**
   * 解像度プリセットを設定
   * @param {'low'|'medium'|'high'} quality
   */
  function setQuality(quality) {
    if (!QUALITY_MAP[quality]) return;
    _quality = quality;
    //console.log('[Camera] 品質設定:', quality);
  }

  function getQuality()    { return _quality; }
  function getStream()     { return _stream; }
  function isActive()      { return !!_stream; }
  function isRear()        { return _isRear; }
  function isStarting()    { return _starting; }
  function getFacingMode() { return _isRear ? 'environment' : 'user'; }

  function getActualSettings() { return _actualSettings; }

  return {
    start, stop, flip, setQuality, getQuality,
    getStream, isActive, isRear, isStarting, getFacingMode, getActualSettings,
  };
})();
