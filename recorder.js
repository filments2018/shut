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
      if (blob.size > 0) {
        _clips.push(blob);
        //console.log('[Recorder] clip' + _clips.length + ': ' + (blob.size / 1024 | 0) + 'KB');
      } else {
        console.warn('[Recorder] 空クリップをスキップ');
      }
      _chunks = [];
      _busy   = false;
      if (_stopRes) { _stopRes(); _stopRes = null; }
    };
    rec.onerror = e => {
      console.error('[Recorder] エラー:', e);
      _busy = false;
      if (_stopRes) { _stopRes(); _stopRes = null; }
    };
    return rec;
  }

  // ── パブリック API ─────────────────────────────

  async function setup(videoStream, options) {
    if (typeof MediaRecorder === 'undefined') return false;

    _videoStream = videoStream;

    // オーディオトラックは一度取得したら再利用（ダイアログ再表示防止）
    if (!_audioStream) {
      try {
        _audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        //console.log('[Recorder] マイク取得');
      } catch (_) {
        console.warn('[Recorder] マイクなし → 映像のみ');
      }
    }

    _stream = _audioStream
      ? new MediaStream([...videoStream.getVideoTracks(), ..._audioStream.getAudioTracks()])
      : videoStream;

    // keepClips=true のとき _clips をリセットしない（カメラフリップ対応）
    if (!options || !options.keepClips) {
      _clips = [];
    }
    _chunks = [];
    _busy   = false;
    _paused = false;
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
      if (!_recorder || _recorder.state === 'inactive') { resolve(); return; }
      _busy    = true;
      _stopRes = resolve;
      _stopWatchdog = setTimeout(() => {
        console.warn('[Recorder] stopClip タイムアウト');
        _busy = false;
        if (_stopRes) { _stopRes(); _stopRes = null; }
      }, 2000);
      if (_recorder.state === 'paused') _recorder.resume(); // pause中はresume後にstop
      _recorder.stop();
    });
  }

  /** バックグラウンド時に録画を一時停止 */
  function pauseClip() {
    if (!_recorder || _recorder.state !== 'recording') return;
    try {
      _recorder.pause();
      _paused = true;
      //console.log('[Recorder] 一時停止');
    } catch (e) {
      console.warn('[Recorder] pause未対応:', e.message);
    }
  }

  /** フォアグラウンド復帰時に録画を再開 */
  function resumeClip() {
    if (!_recorder || _recorder.state !== 'paused') return;
    try {
      _recorder.resume();
      _paused = false;
      //console.log('[Recorder] 再開');
    } catch (e) {
      console.warn('[Recorder] resume未対応:', e.message);
    }
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
  function isPaused()     { return _paused; }
  function isBusy()       { return _busy; }

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
    _clips = []; _chunks = [];
    _busy = false; _paused = false; _stopRes = null;
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
    getClipCount, isRecording, isPaused, isBusy,
    reset, destroy, destroyAll,
  };
})();
