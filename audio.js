/**
 * audio.js — v5
 * 追加: setMode() — モードごとに音色が変わる
 *   COOL: 低域ウォームサイン（穏やかなズーム感）
 *   POP:  高域スクエア（パーカッシブで弾む）
 *   VIBE: ルート+5度の和音（浮遊感）
 * 追加: playWarning() — シュット待機タイムアウト警告音
 * 修正: _schedule 内の先行スケジュール済みコールバックを stop() 時に無効化
 */

const Audio = (() => {
  let _ctx      = null;
  let _bpm      = 85;
  let _muted    = false;
  let _onBeat   = null;
  let _nextBeat = 0;
  let _beatNum  = 0;
  let _timer    = null;
  let _running  = false;
  let _modeId   = 'cool'; // 現在のモード（音色切替に使用）

  const LOOKAHEAD_SEC = 0.15;
  const SCHEDULE_MS   = 50;
  const BEATS_PER_BAR = 4;

  // モードごとの音色定義
  const MODE_TONES = {
    whip: {
      strong: { freq: 980, type: 'square',   vol: 0.18, atk: 0.003, rel: 0.045 },
      weak:   { freq: 660, type: 'square',   vol: 0.10, atk: 0.003, rel: 0.035 },
    },
    cover: {
      strong: { freq: 520, type: 'sine',     vol: 0.18, atk: 0.006, rel: 0.09 },
      weak:   { freq: 260, type: 'sine',     vol: 0.10, atk: 0.006, rel: 0.07 },
    },
    match: {
      strong: { freq: 440, type: 'triangle', vol: 0.16, atk: 0.008, rel: 0.12 },
      weak:   { freq: 330, type: 'triangle', vol: 0.10, atk: 0.008, rel: 0.10 },
      chord:  true,
    },
    wipe: {
      strong: { freq: 1320, type: 'sine',    vol: 0.17, atk: 0.004, rel: 0.07 },
      weak:   { freq: 880,  type: 'sine',    vol: 0.09, atk: 0.004, rel: 0.05 },
    },
    cool: {
      // 低域ウォームサイン — ゆったりとしたズームに合う
      strong: { freq: 330, type: 'sine',     vol: 0.22, atk: 0.01, rel: 0.09 },
      weak:   { freq: 220, type: 'sine',     vol: 0.12, atk: 0.01, rel: 0.07 },
    },
    pop: {
      // 高域スクエア — パーカッシブでリズミカル
      strong: { freq: 1320, type: 'square',   vol: 0.18, atk: 0.003, rel: 0.04 },
      weak:   { freq: 880,  type: 'square',   vol: 0.10, atk: 0.003, rel: 0.03 },
    },
    vibe: {
      // ルート+5度の和音（triangle）— 浮遊感
      strong: { freq: 440, type: 'triangle', vol: 0.16, atk: 0.008, rel: 0.12 },
      weak:   { freq: 330, type: 'triangle', vol: 0.10, atk: 0.008, rel: 0.10 },
      chord:  true, // 5度上も鳴らす
    },
  };

  function _ctx_() {
    if (!_ctx) {
      try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { console.warn('[Audio]', e); return null; }
    }
    if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
    return _ctx;
  }

  // マスターコンプレッサー（音割れ防止・音量均一化）
  let _compressor = null;
  function _getCompressor() {
    const ctx = _ctx_();
    if (!ctx) return null;
    // _compressor が null か、または state が closed/invalid の場合に再作成
    if (!_compressor || (_compressor.context && _compressor.context.state === 'closed')) {
      _compressor = null;
      try {
        _compressor = ctx.createDynamicsCompressor();
        _compressor.threshold.value = -18;  // dB
        _compressor.knee.value      = 6;
        _compressor.ratio.value     = 4;
        _compressor.attack.value    = 0.003;
        _compressor.release.value   = 0.15;
        _compressor.connect(ctx.destination);
      } catch (e) { _compressor = null; }
    }
    return _compressor;
  }

  function _tone(when, freq, type, vol, atk, rel) {
    if (_muted) return;
    const ctx = _ctx_();
    if (!ctx) return;
    try {
      const osc  = ctx.createOscillator();
      const g    = ctx.createGain();
      const dest = _getCompressor() || ctx.destination;
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      osc.connect(g); g.connect(dest);
      g.gain.setValueAtTime(0.001, when);
      g.gain.linearRampToValueAtTime(vol, when + atk);
      g.gain.exponentialRampToValueAtTime(0.001, when + atk + rel);
      osc.start(when); osc.stop(when + atk + rel + 0.01);
    } catch (e) {}
  }

  function _beatTone(when, isStrong) {
    const def  = MODE_TONES[_modeId] || MODE_TONES.cool;
    const conf = isStrong ? def.strong : def.weak;
    _tone(when, conf.freq, conf.type, conf.vol, conf.atk, conf.rel);

    // VIBEの場合、5度上を重ねる（コード感）
    if (def.chord && isStrong) {
      _tone(when, conf.freq * 1.5, conf.type, conf.vol * 0.55, conf.atk, conf.rel * 1.2);
    }
  }

  // ── スケジューラー ────────────────────────────
  function _schedule() {
    if (!_running) return;
    const ctx = _ctx_();
    if (!ctx) return;

    const beatSec = 60 / _bpm;
    const now     = ctx.currentTime;

    while (_nextBeat < now + LOOKAHEAD_SEC) {
      const beatIdx  = _beatNum % BEATS_PER_BAR;
      const isStrong = beatIdx === 0;
      _beatTone(_nextBeat, isStrong);

      const delayMs     = Math.max(0, (_nextBeat - now) * 1000);
      const capturedNum = _beatNum;
      const capturedRun = _running; // クロージャでキャプチャ
      setTimeout(() => {
        // stop() 後に発火しても _running が false なら無視
        if (!_running) return;
        if (_onBeat) _onBeat(capturedNum % BEATS_PER_BAR);
      }, delayMs);

      _nextBeat += beatSec;
      _beatNum++;
    }

    _timer = setTimeout(_schedule, SCHEDULE_MS);
  }

  // ── パブリック API ─────────────────────────────

  function start(bpm, onBeat) {
    stop();
    _bpm     = bpm;
    _onBeat  = onBeat;
    _running = true;
    _beatNum = 0;
    const ctx = _ctx_();
    if (!ctx) return;
    _nextBeat = ctx.currentTime + 0.04;
    _schedule();
    if (_bgmBuffer) startBgm();
  }

  function stop() {
    _running = false;
    if (_timer) { clearTimeout(_timer); _timer = null; }
    _frozenAt = 0;
    stopBgm();
  }

  /**
   * シュット待機中に呼ぶ — スケジューリングは止めるが
   * タイミング計算用に _nextBeat/_bpm/_running_frozen を保持する
   * executeShut で getTimingOffset() が正確な値を返せるようにする
   */
  let _frozenAt = 0; // freezeForTiming() を呼んだときの AudioContext.currentTime

  function freezeForTiming() {
    _running = false;
    if (_timer) { clearTimeout(_timer); _timer = null; }
    const ctx = _ctx_();
    _frozenAt = ctx ? ctx.currentTime : 0;
    // _nextBeat と _bpm はそのまま → getTimingOffset() が有効
  }

  /**
   * バックグラウンド移行時など、freeze 状態を維持したまま止める
   * freeze状態（_frozenAt > 0）のときは上書きしない
   */
  function softStop() {
    if (_frozenAt > 0 && !_running) {
      // すでに freeze 状態 → _frozenAt/_nextBeat を保護して何もしない
      return;
    }
    stop();
  }

  /** モードを設定して音色を切替 */
  function setMode(modeId) {
    _modeId = modeId || 'cool';
  }

  // シュット効果音（ダウンスイープ）
  function playShut() {
    const ctx = _ctx_();
    if (!ctx || _muted) return;
    try {
      const osc  = ctx.createOscillator();
      const g    = ctx.createGain();
      const dest = _getCompressor() || ctx.destination;
      osc.type = 'sawtooth';
      osc.connect(g); g.connect(dest);
      const t = ctx.currentTime;
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.22);
      g.gain.setValueAtTime(0.30, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.start(t); osc.stop(t + 0.26);
    } catch (e) {}
  }

  // クリップ間繋ぎ音
  function playTransition() {
    const ctx = _ctx_();
    if (!ctx || _muted) return;
    try {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      const dest2 = _getCompressor() || ctx.destination;
      osc.type = 'triangle';
      osc.connect(g); g.connect(dest2);
      const t = ctx.currentTime + 0.05;
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.exponentialRampToValueAtTime(900, t + 0.12);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.start(t); osc.stop(t + 0.16);
    } catch (e) {}
  }

  // カウントダウン tick（モード別音色）
  const COUNT_TICKS = {
    whip: { freq: 980,  type: 'square',  vol: 0.16 },
    cover: { freq: 520,  type: 'sine',    vol: 0.16 },
    match: { freq: 660,  type: 'triangle',vol: 0.18 },
    wipe: { freq: 1100, type: 'sine',  vol: 0.16 },
    cool: { freq: 440, type: 'sine',     vol: 0.20 },  // 低域ウォーム
    pop:  { freq: 1100, type: 'square',  vol: 0.16 },  // 高域パーカッシブ
    vibe: { freq: 660,  type: 'triangle',vol: 0.18 },  // 柔らかい三角波
  };
  function playCountTick(isLast, modeId) {
    const ctx = _ctx_();
    if (!ctx || _muted) return;
    _getCompressor(); // コンプレッサーを事前確保（カウントダウンは連打されるため）
    var def = COUNT_TICKS[modeId || _modeId] || COUNT_TICKS.cool;
    var freq = isLast ? def.freq * 2 : def.freq;  // GO! は1オクターブ上
    var vol  = isLast ? def.vol * 1.4 : def.vol;
    _tone(ctx.currentTime + 0.01, freq, def.type,
          Math.min(vol, 0.35), 0.005, isLast ? 0.09 : 0.06);
  }

  // シュット待機タイムアウト警告音（緊張感を煽る下降音）
  function playWarning() {
    const ctx = _ctx_();
    if (!ctx || _muted) return;
    try {
      const osc  = ctx.createOscillator();
      const g    = ctx.createGain();
      const dest = _getCompressor() || ctx.destination;
      osc.type = 'sine';
      osc.connect(g); g.connect(dest);
      const t = ctx.currentTime;
      osc.frequency.setValueAtTime(660, t);
      osc.frequency.linearRampToValueAtTime(440, t + 0.3);
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t); osc.stop(t + 0.38);
    } catch (e) {}
  }

  // 完成ジングル（モードに応じた音色・音程）
  const COMPLETE_JINGLES = {
    cool:  { freqs: [440, 554, 659, 880],  type: 'sine',     vol: 0.18, step: 0.12 },
    pop:   { freqs: [523, 659, 784, 1047], type: 'square',   vol: 0.14, step: 0.08 },
    vibe:  { freqs: [349, 440, 523, 698],  type: 'triangle', vol: 0.18, step: 0.14 },
  };

  function playComplete() {
    const ctx = _ctx_();
    if (!ctx || _muted) return;
    // 完成ジングルは複数音を同時発音するためコンプレッサーが特に重要
    _getCompressor(); // 事前にコンプレッサーを確実に初期化
    var jingle = COMPLETE_JINGLES[_modeId] || COMPLETE_JINGLES.cool;
    jingle.freqs.forEach(function(f, i) {
      var t = ctx.currentTime + i * jingle.step;
      _tone(t, f, jingle.type, jingle.vol, 0.04, 0.45);
      // VIBEモードのみコード（5度上を重ねる）
      if (_modeId === 'vibe' && i === jingle.freqs.length - 1) {
        _tone(t, f * 1.5, jingle.type, jingle.vol * 0.4, 0.04, 0.6);
      }
    });
  }

  // モード選択アクセント
  function playModeSelect() {
    const ctx = _ctx_();
    if (!ctx || _muted) return;
    _getCompressor();
    _tone(ctx.currentTime + 0.01, 660, 'sine', 0.12, 0.005, 0.08);
  }

  // iOS: タッチで AudioContext を自動 resume（バックグラウンド復帰対策）
  document.addEventListener('touchstart', function() {
    if (_ctx && _ctx.state === 'suspended') _ctx.resume().catch(function(){});
  }, { passive: true });

  // iOS unlock
  function unlock() {
    const ctx = _ctx_();
    if (!ctx || ctx.state !== 'suspended') return;
    ctx.resume().then(() => {
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf; src.connect(ctx.destination); src.start(0);
    }).catch(() => {});
  }

  function setMuted(bool) { _muted = bool; }
  function isMuted()      { return _muted; }
  function isRunning()    { return _running; }
  function getBeatCount() { return _beatNum; }
  function getMode()      { return _modeId; }

  /**
   * シュット時に呼ぶ — ビートとのタイミングズレ(ms)を返す
   * 負: 早打ち、正: 遅打ち、null: 録音停止中
   * _lastFiredBeat を使って実際に音が鳴った拍の時刻から計算
   */
  function getTimingOffset() {
    const ctx = _ctx_();
    if (!ctx || _nextBeat === 0) return null;

    const beatSec = 60 / _bpm;
    const now     = ctx.currentTime;

    // freezeForTiming() 後も _nextBeat/_bpm は保持しつつ、
    // 判定はユーザーが実際に振った時刻で行う。
    var evalTime = now;

    // 後方3拍の候補から evalTime に最も近いビートを選ぶ
    var best = _nextBeat - beatSec;
    var bestDist = Math.abs(evalTime - best);
    for (var k = 2; k <= 4; k++) {
      var cand = _nextBeat - beatSec * k;
      var d = Math.abs(evalTime - cand);
      if (d < bestDist) { bestDist = d; best = cand; }
    }

    // 正: 遅打ち、負: 早打ち
    return (evalTime - best) * 1000;
  }

  // ── BGM 再生 ──────────────────────────────────
  let _bgmBuffer  = null;
  let _bgmSource  = null;
  let _bgmName    = '';
  let _bgmOffset  = 0;    // 再生位置(秒)を引き継ぐ
  let _bgmStartAt = 0;    // startBgm 呼び出し時の ctx.currentTime

  async function loadBgm(file) {
    const ctx = _ctx_();
    if (!ctx) return null;
    const arrayBuf = await file.arrayBuffer();
    _bgmBuffer = await ctx.decodeAudioData(arrayBuf);
    _bgmName = file.name;
    return _bgmBuffer;
  }

  function startBgm() {
    if (!_bgmBuffer || _muted) return;
    stopBgm();
    const ctx = _ctx_();
    if (!ctx) return;
    _bgmSource = ctx.createBufferSource();
    _bgmSource.buffer = _bgmBuffer;
    _bgmSource.loop = true;
    var gain = ctx.createGain();
    gain.gain.value = 0.35;
    var dest = _getCompressor() || ctx.destination;
    _bgmSource.connect(gain);
    gain.connect(dest);
    // 前回の再生位置から再開（クリップ間で巻き戻らない）
    var offset = _bgmOffset % _bgmBuffer.duration;
    _bgmSource.start(0, offset);
    _bgmStartAt = ctx.currentTime;
  }

  function stopBgm() {
    if (_bgmSource) {
      // 再生位置を保存
      var ctx = _ctx_();
      if (ctx && _bgmBuffer) {
        _bgmOffset += (ctx.currentTime - _bgmStartAt);
      }
      try { _bgmSource.stop(); } catch (_) {}
      _bgmSource = null;
    }
  }

  function clearBgm() {
    _bgmBuffer = null; _bgmName = '';
    _bgmOffset = 0; _bgmStartAt = 0;
    stopBgm();
  }
  function resetBgmPosition() { _bgmOffset = 0; _bgmStartAt = 0; }
  function hasBgm()   { return !!_bgmBuffer; }
  function getBgmName(){ return _bgmName; }

  /**
   * 簡易BPM検出 — エネルギーベースのオンセット検出
   */
  async function detectBpm(audioBuffer) {
    var data = audioBuffer.getChannelData(0);
    var sr   = audioBuffer.sampleRate;
    var winSize = 1024;
    var numWins = Math.floor(data.length / winSize);
    // 各ウィンドウのエネルギー
    var energies = [];
    for (var i = 0; i < numWins; i++) {
      var sum = 0;
      for (var j = 0; j < winSize; j++) {
        var s = data[i * winSize + j];
        sum += s * s;
      }
      energies.push(sum / winSize);
    }
    // 平均エネルギー
    var avgE = energies.reduce(function(a,b){ return a+b; }, 0) / energies.length;
    // オンセット検出（エネルギーが平均の1.4倍以上）
    var onsets = [];
    for (var k = 1; k < energies.length; k++) {
      if (energies[k] > avgE * 1.4 && energies[k] > energies[k-1]) {
        onsets.push(k * winSize / sr);
      }
    }
    if (onsets.length < 4) return 100; // デフォルト
    // インターバル算出
    var intervals = [];
    for (var m = 1; m < onsets.length; m++) {
      var iv = onsets[m] - onsets[m-1];
      if (iv > 0.2 && iv < 1.5) intervals.push(iv); // 40-300 BPM 範囲
    }
    if (intervals.length < 2) return 100;
    // 最頻インターバルを見つける（±10ms tolerance でクラスタリング）
    intervals.sort(function(a,b){ return a-b; });
    var bestCount = 0, bestInterval = intervals[Math.floor(intervals.length/2)];
    for (var p = 0; p < intervals.length; p++) {
      var count = 0;
      for (var q = 0; q < intervals.length; q++) {
        if (Math.abs(intervals[q] - intervals[p]) < 0.01) count++;
      }
      if (count > bestCount) { bestCount = count; bestInterval = intervals[p]; }
    }
    var bpm = Math.round(60 / bestInterval);
    // 60-200 の範囲に収める（倍/半分を調整）
    while (bpm > 200) bpm = Math.round(bpm / 2);
    while (bpm < 60)  bpm = Math.round(bpm * 2);
    return bpm;
  }

  return {
    start, stop, freezeForTiming, softStop, setMode, getMode,
    playShut, playTransition, playCountTick, playWarning,
    playComplete, playModeSelect,
    unlock, setMuted, isMuted, isRunning, getBeatCount,
    getTimingOffset,
    loadBgm, startBgm, stopBgm, clearBgm, resetBgmPosition, hasBgm, getBgmName, detectBpm,
  };
})();
