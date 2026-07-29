/**
 * recorder.js — v4
 * 修正: pauseClip() / resumeClip() を実装（バックグラウンド対応）
 * 修正: setup() 再呼び出し時にオーディオトラックを再利用（マイクダイアログ再表示防止）
 * 修正: _audioStream をモジュール内で保持し destroy() で確実に解放
 */

const Recorder = (() => {
  let _videoStream = null;  // 映像のみのストリーム
  let _audioStream = null;  // マイクストリーム（一度取得したら保持）
  let _stream      = null;  // 映像 + 音声の合成ストリーム
  let _recorder    = null;
  let _clips       = [];
  let _chunks      = [];
  let _mime        = '';
  let _stopRes     = null;
  let _busy        = false;
  let _stopWatchdog = null;
  let _paused      = false;
  let _lastError   = null;
  let _includeAudio = true;

  function _detectMime() {
    if (typeof MediaRecorder === 'undefined') return '';
    // モバイルではH.264ハードウェアエンコーダを優先（VP9ソフトウェアエンコード回避）
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    const list = isMobile ? [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ] : [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
    ];
    return list.find(m => MediaRecorder.isTypeSupported(m)) || '';
  }

  function _build(stream) {
    _mime = _detectMime();
    let rec;
    var opts = _mime ? { mimeType: _mime } : {};
    opts.videoBitsPerSecond = 5000000;  // 5Mbps（1080p向け）
    opts.audioBitsPerSecond = 128000;   // 128kbps
    try {
      rec = new MediaRecorder(stream, opts);
    } catch (e) {
      console.warn('[Recorder] 生成失敗:', e);
      return null;
    }

    rec.ondataavailable = e => {
      if (e.data && e.data.size > 0) _chunks.push(e.data);
    };
    rec.onstop = () => {
      if (_stopWatchdog) { clearTimeout(_stopWatchdog); _stopWatchdog = null; }
      const blob = new Blob(_chunks, { type: _mime || 'video/webm' });
      const ok = blob.size > 0;
      if (blob.size > 0) {
        _clips.push(blob);
        _lastError = null;
        //console.log('[Recorder] clip' + _clips.length + ': ' + (blob.size / 1024 | 0) + 'KB');
      } else {
        _lastError = 'empty';
        console.warn('[Recorder] 空クリップをスキップ');
      }
      _chunks = [];
      _busy   = false;
      _paused = false;
      if (_stopRes) {
        _stopRes({ ok: ok, size: blob.size, reason: ok ? null : 'empty' });
        _stopRes = null;
      }
    };
    rec.onerror = e => {
      console.error('[Recorder] エラー:', e);
      if (_stopWatchdog) { clearTimeout(_stopWatchdog); _stopWatchdog = null; }
      _lastError = 'error';
      _busy = false;
      _paused = false;
      if (_stopRes) { _stopRes({ ok: false, size: 0, reason: 'error' }); _stopRes = null; }
    };
    return rec;
  }

  // ── パブリック API ─────────────────────────────

  async function setup(videoStream, options) {
    if (typeof MediaRecorder === 'undefined') return false;

    _videoStream = videoStream;
    _includeAudio = !options || options.includeAudio !== false;

    // オーディオトラックは一度取得したら再利用（ダイアログ再表示防止）
    if (_includeAudio && !_audioStream) {
      try {
        _audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        //console.log('[Recorder] マイク取得');
      } catch (_) {
        console.warn('[Recorder] マイクなし → 映像のみ');
      }
    }

    if (!_includeAudio && _audioStream) {
      _audioStream.getTracks().forEach(t => t.stop());
      _audioStream = null;
    }

    _stream = _includeAudio && _audioStream
      ? new MediaStream([...videoStream.getVideoTracks(), ..._audioStream.getAudioTracks()])
      : videoStream;

    // keepClips=true のとき _clips をリセットしない（カメラフリップ対応）
    if (!options || !options.keepClips) {
      _clips = [];
    }
    _chunks = [];
    _busy   = false;
    _paused = false;
    _lastError = null;
    _recorder = _build(_stream);
    return !!_recorder;
  }

  function startClip() {
    if (!_recorder || _recorder.state !== 'inactive' || _busy) return;
    _chunks = [];
    _paused = false;
    _recorder.start(250); // 250msチャンク（メモリフラグメンテーション軽減）
    //console.log('[Recorder] 開始 clip', _clips.length + 1);
  }

  function stopClip() {
    return new Promise(resolve => {
      if (!_recorder || _recorder.state === 'inactive') {
        const blob = getFinalBlob();
        resolve({ ok: !!blob, size: blob ? blob.size : 0, reason: blob ? null : 'inactive' });
        return;
      }
      _busy    = true;
      _stopRes = resolve;
      _stopWatchdog = setTimeout(() => {
        console.warn('[Recorder] stopClip タイムアウト');
        _stopWatchdog = null;
        _lastError = 'timeout';
        _busy = false;
        _paused = false;
        if (_stopRes) { _stopRes({ ok: false, size: 0, reason: 'timeout' }); _stopRes = null; }
      }, 12000);
      try {
        if (_recorder.state === 'paused') _recorder.resume(); // pause中はresume後にstop
        _recorder.stop();
      } catch (e) {
        if (_stopWatchdog) { clearTimeout(_stopWatchdog); _stopWatchdog = null; }
        _lastError = 'stop-error';
        _busy = false;
        _paused = false;
        if (_stopRes) { _stopRes({ ok: false, size: 0, reason: 'stop-error' }); _stopRes = null; }
      }
    });
  }

  /** クリップ間の一時停止。非対応時はfalseを返し、呼び出し側で撮り直しへ切り替える。 */
  function pauseClip() {
    if (!_recorder || _recorder.state !== 'recording') return isPaused();
    try {
      _recorder.pause();
      _paused = true;
      return true;
    } catch (e) {
      console.warn('[Recorder] pause未対応:', e.message);
      return false;
    }
  }

  /** クリップ間の録画再開（pause非対応環境では state が recording のままなので何もしない） */
  function resumeClip() {
    if (!_recorder) return;
    if (_recorder.state === 'paused') {
      try {
        _recorder.resume();
        _paused = false;
      } catch (e) {
        console.warn('[Recorder] resume未対応:', e.message);
      }
    }
    // state === 'recording' の場合 (pause未対応環境) はそのまま録画継続中
  }

  function getFinalBlob() {
    if (_clips.length === 0) return null;
    if (_clips.length === 1) return _clips[0];
    return new Blob(_clips, { type: _mime || 'video/webm' });
  }

  function getClips()     { return [..._clips]; }
  function getMime()      { return _mime; }
  function getClipCount() { return _clips.length; }
  function isRecording()  { return !!_recorder && _recorder.state === 'recording'; }
  function isPaused()     { return _paused || (!!_recorder && _recorder.state === 'paused'); }
  function isBusy()       { return _busy; }
  function getLastError() { return _lastError; }
  function hasAudio()     { return !!(_stream && _stream.getAudioTracks().some(t => t.readyState === 'live')); }
  function getSupportInfo() {
    const available = typeof MediaRecorder !== 'undefined';
    const proto = available ? MediaRecorder.prototype : null;
    return {
      available: available,
      mime: available ? _detectMime() : '',
      pause: !!(proto && typeof proto.pause === 'function' && typeof proto.resume === 'function'),
    };
  }

  function reset() {
    if (_recorder) {
      // onstopハンドラを無効化して非同期コールバックの競合を防止
      _recorder.onstop = null;
      _recorder.onerror = null;
      if (_recorder.state !== 'inactive') {
        try { _recorder.stop(); } catch (_) {}
      }
    }
    if (_stopWatchdog) { clearTimeout(_stopWatchdog); _stopWatchdog = null; }
    if (_stopRes) { _stopRes({ ok: false, size: 0, reason: 'reset' }); _stopRes = null; }
    _clips = []; _chunks = [];
    _busy = false; _paused = false; _lastError = null;
  }

  function destroy() {
    reset();
    // マイクストリームも解放（マイクインジケーター消灯）
    if (_audioStream) {
      _audioStream.getTracks().forEach(t => t.stop());
      _audioStream = null;
    }
    _stream = null;
    _recorder = null;
  }

  /** 完全破棄（アプリ終了時） */
  function destroyAll() {
    reset();
    // マイク・映像ストリームの確実な解放
    if (_audioStream) {
      _audioStream.getTracks().forEach(t => t.stop());
      _audioStream = null;
    }
    if (_videoStream) {
      _videoStream.getTracks().forEach(t => t.stop());
      _videoStream = null;
    }
    _stream = null;
    _recorder = null;
  }

  return {
    setup, startClip, stopClip, pauseClip, resumeClip,
    getFinalBlob, getClips, getMime,
    getClipCount, isRecording, isPaused, isBusy, getLastError, hasAudio,
    getSupportInfo,
    reset, destroy, destroyAll,
  };
})();
