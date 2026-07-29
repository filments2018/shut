/**
 * app.js — v7 完全版
 * 修正: _flipCamera() にフェーズガード（録画中は禁止）
 * 修正: splash → permission の遷移を showScreen() 統一
 * 修正: Recorder.pauseClip/resumeClip の実装呼び出しを確認済みに更新
 * 追加: ハプティクスフィードバック（振動）
 * 追加: 2シーン連続録画（シーン間は pause/resume で準備時間を除外）
 * 追加: Audio.playModeSelect() をモード選択時に鳴らす
 * 追加: 完成画面にハッシュタグテキスト生成
 */

const MODES = [
  {
    id: 'whip', label: 'WHIP', bpm: 96,
    color: '#2170AC', accent: '#C9503A', bg: '#101720',
    guide: 'PAN RIGHT FAST', arrow: '→', emoji: '⚡',
    completeMsg: 'WHIP PAN. 振るスピードと方向をそろえて場面をつなぐ。',
    hashtags: '#SHUT #WHIP #スマホ撮影 #映像で遊ぼう',
    beatsPerClip: 5,
    recipeType: 'transition',
    recipeSummary: '素早いパンのブレでカットA/Bをつなぐ',
    shots: [
      { guide: '被写体を正面に止めて映す', arrow: '•', hud: 'SCENE A  静止' },
      { guide: '振りながら入り、被写体で止める', arrow: '→', hud: 'SCENE B  IN → 静止' },
    ],
    transition: {
      label: 'WHIP', arrow: 'any', trigger: 'motion', tailMs: 260,
      prompt: '好きな方向へ、すぐに振り切る',
      prepare: '次の場所へ移動し、同じ方向から被写体へ振り込める位置に構える。',
      ready: 'STARTを押したら、カウントダウン中にカメラを振り始める位置へ向ける。',
    },
    steps: [
      { guide: '被写体を正面に向けてカメラを止める', arrow: '•', hud: 'SCENE A  静止' },
      { guide: 'バーが埋まったら → に振る', arrow: '→', hud: '→ WHIP READY' },
      { guide: '右から始めて次の被写体を捉える', arrow: '→', hud: '→ SCENE B  捉える' },
      { guide: '被写体で止まる', arrow: '•', hud: 'SCENE B  静止' },
    ],
  },
  {
    id: 'cover', label: 'COVER', bpm: 88,
    color: '#2A794F', accent: '#E3B92E', bg: '#0F1712',
    guide: 'COVER THE LENS', arrow: '■', emoji: '✋',
    completeMsg: 'HAND COVER. レンズを完全に暗くして、場所や衣装を一瞬で変える。',
    hashtags: '#SHUT #HANDCOVER #スマホ撮影 #トランジション',
    beatsPerClip: 5,
    recipeType: 'transition',
    recipeSummary: '手や物でレンズを隠して場面を切り替える',
    shots: [
      { guide: '被写体を止めて見せる', arrow: '•', hud: 'SCENE A  被写体' },
      { guide: 'GOで手をどけ、被写体を見せる', arrow: '✦', hud: 'SCENE B  REVEAL' },
    ],
    transition: {
      label: 'COVER', arrow: '■', trigger: 'dark', tailMs: 180,
      prompt: 'レンズを完全に塞ぐと自動カット',
      prepare: '場所や衣装を変え、レンズを手で完全に塞げる状態にする。',
      ready: 'STARTを押したら、カウントダウン中にレンズを完全に塞ぐ。',
    },
    steps: [
      { guide: 'カットA。被写体を止めて見せる', arrow: '•', hud: 'A  被写体を見せる' },
      { guide: '手のひらでレンズを完全に塞ぐ', arrow: '■', hud: 'A COVER  真っ暗にする' },
      { guide: 'カットB。塞いだ状態から始める', arrow: '■', hud: 'B COVER  暗いまま始める' },
      { guide: '手をパッとどけて被写体を見せる', arrow: '✦', hud: 'B REVEAL  手をどける' },
    ],
  },
  {
    id: 'match', label: 'MATCH', bpm: 100,
    color: '#B84632', accent: '#2E86C9', bg: '#1B100C',
    guide: 'MATCH THE MOTION', arrow: '↥', emoji: '🏃',
    completeMsg: 'MOTION MATCH. 被写体の位置とサイズをそろえて動作でつなぐ。',
    hashtags: '#SHUT #MOTIONMATCH #スマホ撮影 #videotips',
    beatsPerClip: 5,
    recipeType: 'action',
    recipeSummary: 'ジャンプや歩きなど同じ動きでカットを合わせる',
    shots: [
      { guide: '被写体の位置とサイズを決める', arrow: '□', hud: 'SCENE A  FRAME' },
      { guide: 'GOで同じ動作の続きを始める', arrow: '↥', hud: 'SCENE B  ACTION' },
    ],
    transition: {
      label: 'CUT', arrow: '↥', trigger: 'tap', tailMs: 120,
      prompt: '動作の頂点で画面をタップ',
      prepare: '別の場所で、人物の位置と大きさをシーンAに合わせる。',
      ready: 'STARTを押したら、カウントダウンに合わせて同じ動作を準備する。',
    },
    steps: [
      { guide: 'カットA。被写体の位置とサイズを決める', arrow: '□', hud: 'A FRAME  位置合わせ' },
      { guide: 'ジャンプや指鳴らしの瞬間で切る', arrow: '↥', hud: 'A ACTION  動作で切る' },
      { guide: 'カットB。同じ位置とサイズから始める', arrow: '□', hud: 'B FRAME  同じ位置' },
      { guide: '同じ動作の続きを撮る', arrow: '↥', hud: 'B ACTION  続きを撮る' },
    ],
  },
  {
    id: 'wipe', label: 'WIPE', bpm: 92,
    color: '#7A4EB0', accent: '#3E9E6E', bg: '#150F1D',
    guide: 'SLIDE BEHIND OBJECT', arrow: '▌→', emoji: '🚪',
    completeMsg: 'OBJECT WIPE. 柱や壁で画面を隠して、横移動で場面を変える。',
    hashtags: '#SHUT #OBJECTWIPE #スマホ撮影 #カメラワーク',
    beatsPerClip: 5,
    recipeType: 'foreground',
    recipeSummary: '柱や壁などの遮蔽物で画面を完全に隠す',
    shots: [
      { guide: '柱や壁へ向かって横移動する', arrow: '→', hud: 'SCENE A  WIPE OUT' },
      { guide: 'GOで遮蔽物の裏から横へ抜ける', arrow: '→', hud: 'SCENE B  WIPE IN' },
    ],
    transition: {
      label: 'WIPE', arrow: '→', trigger: 'motion', tailMs: 220,
      prompt: '画面が完全に隠れた瞬間にタップか横振り',
      prepare: '似た柱や壁の裏へ移動し、画面が完全に隠れた状態にする。',
      ready: 'STARTを押したら、カウントダウン中に遮蔽物の裏で構える。',
    },
    steps: [
      { guide: 'カットA。柱や壁の横に構える', arrow: '▌', hud: 'A SET  遮蔽物' },
      { guide: 'カニ歩きで横移動し、画面を完全に隠す', arrow: '→', hud: 'A WIPE  隠す' },
      { guide: 'カットB。似た遮蔽物の裏から始める', arrow: '▌', hud: 'B SET  裏から' },
      { guide: '同じ方向へ横移動して景色を出す', arrow: '→', hud: 'B REVEAL  横へ抜ける' },
    ],
  },
];

// 実際のトランジション撮影単位: シーンA + シーンB
// デバッグ時のみ URL?clips=4/6 で連続シーン数を増やせる。
let CLIPS_NEEDED = 2;
let _coverDetectTimer = null;
const CONTINUOUS_RESUME_MS = 2200;
const PREVIEW_READY_MS = 3000;
let _wakeLock = null;
let _wakeLockPending = false;
let _wakeLockRequestId = 0;
let _deviceCheckRequestId = 0;

// グローバル公開（ui.js の window.State 参照で使用）
window.State = null;
const State = window.State = {
  phase:       'splash',
  mode:        null,
  clips:       0,
  recEnabled:  false,
  timers:      [],
  debugTaps:   0,
  sensitivity: 22,
  shootFlow:   'travel', // 'continuous' | 'travel'
  captureAudio: true,
  compositionGrid: false,
  sceneFrames: [],
  interruptedPhase: null,
  interruptionNeedsRestart: false,
  recordingStartedAt: 0,
  recordingDurationMs: 0,
  resumeDurationMs: 0,
  // スコアシステム
  scores:      [],    // 各クリップのタイミング評価 {grade, offset}
  combo:       0,     // 連続GOOD以上の数
  maxCombo:    0,
  // 前クリップの振り方向（次クリップの入りに引き継ぐ）
  lastWhipDir: null,  // '→' | '←' | '↑' | '↓'
  transitionCommitted: false,
};

if (typeof Diagnostics !== 'undefined') {
  Diagnostics.setContextProvider(() => ({
    phase: State.phase,
    mode: State.mode ? State.mode.id : null,
    scene: State.clips + 1,
    shootFlow: State.shootFlow,
    captureAudio: State.captureAudio,
    compositionGrid: State.compositionGrid,
    recorderMime: typeof Recorder !== 'undefined' ? Recorder.getMime() : '',
  }));
}

function _T(fn, ms) {
  var id = setTimeout(function() {
    // 完了したタイマーを配列から除去（肥大化防止）
    var idx = State.timers.indexOf(id);
    if (idx >= 0) State.timers.splice(idx, 1);
    fn();
  }, ms);
  State.timers.push(id);
  return id;
}
function _clearTimers() {
  State.timers.forEach(clearTimeout);
  State.timers = [];
  _stopCoverDetection();
}

// ── 振り方向検出（加速度から↑↓←→を判定） ────────
function _detectWhipDir(accelDir) {
  if (!accelDir || typeof accelDir !== 'object') return '→';
  var ax = accelDir.x || 0;
  var ay = accelDir.y || 0;
  // 絶対値が大きい軸が振り方向
  if (Math.abs(ax) >= Math.abs(ay)) {
    return ax >= 0 ? '→' : '←';
  } else {
    return ay >= 0 ? '↑' : '↓';
  }
}

// ── ハプティクスフィードバック ────────────────────
function _vibrate(pattern) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) {}
  }
}

async function _requestWakeLock() {
  if (!('wakeLock' in navigator) || document.hidden || _wakeLock || _wakeLockPending) return false;
  const requestId = ++_wakeLockRequestId;
  _wakeLockPending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    _wakeLockPending = false;
    if (requestId !== _wakeLockRequestId || !State.mode) {
      try { await lock.release(); } catch (_) {}
      return false;
    }
    _wakeLock = lock;
    lock.addEventListener('release', () => {
      if (_wakeLock === lock) _wakeLock = null;
    });
    if (typeof Diagnostics !== 'undefined') Diagnostics.log('info', 'wake_lock_acquired');
    return true;
  } catch (error) {
    _wakeLockPending = false;
    if (typeof Diagnostics !== 'undefined') Diagnostics.log('warn', 'wake_lock_failed', error.message);
    return false;
  }
}

async function _releaseWakeLock() {
  _wakeLockRequestId++;
  _wakeLockPending = false;
  if (!_wakeLock) return;
  const lock = _wakeLock;
  _wakeLock = null;
  try { await lock.release(); } catch (_) {}
}

// ── Service Worker ────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .catch(e => console.warn('[SW]', e));
  });
}

// ── バックグラウンド ──────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // shutter/processing フェーズ中は freezeForTiming 状態を保護（softStop）
    // それ以外は通常 stop
    if ((State.phase === 'shutter' || State.phase === 'processing') && typeof Audio.softStop === 'function') {
      Audio.softStop();
    } else {
      Audio.stop();
    }
    Motion.setActive(false);
    _stopCoverDetection();
    const interruptedPhase = State.phase;
    const requiresConfirmation = ['preview', 'countdown', 'recording', 'shutter'].includes(interruptedPhase);

    if (interruptedPhase === 'recording') {
      const elapsed = Math.max(0, performance.now() - State.recordingStartedAt);
      State.resumeDurationMs = Math.max(500, State.recordingDurationMs - elapsed);
    }

    let paused = true;
    if (State.recEnabled && Recorder.isRecording()) {
      paused = Recorder.pauseClip();
      if (!paused && Recorder.isRecording()) {
        State.interruptionNeedsRestart = true;
        Recorder.stopClip().catch(() => {});
      }
    }

    if (requiresConfirmation) {
      _clearTimers();
      UI.stopRecBar();
      UI.hideRecIndicator();
      UI.cancelShutterCountdown();
      State.interruptedPhase = interruptedPhase;
      State.phase = 'interrupted';
      const needsRestart = State.interruptionNeedsRestart;
      const isShutter = interruptedPhase === 'shutter';
      const isPreview = interruptedPhase === 'preview';
      UI.showPrepareNext({
        scene: State.clips + 1,
        total: CLIPS_NEEDED,
        title: needsRestart ? '撮影を最初からやり直します' : '撮影を一時停止しました',
        description: needsRestart
          ? 'この端末では録画を安全に一時停止できません。部分録画は使わず、同じレシピを最初から撮影します。'
          : isPreview
            ? 'カメラ準備を停止しました。構図を確認してから撮影を始めてください。'
          : isShutter
            ? 'トランジション待機を停止しています。構え直してから再開してください。'
            : '録画とカウントダウンを停止しています。構え直してから再開してください。',
        ready: 'ボタンを押すまで録画は再開しません。',
        flowLabel: 'INTERRUPTED',
        buttonLabel: needsRestart
          ? '最初から撮り直す'
          : isPreview ? 'カメラ準備を再開'
          : isShutter ? 'トランジション待機に戻る' : 'カウントダウンから再開',
        recordingState: needsRestart
          ? '録画停止・撮り直しが必要'
          : isPreview ? '撮影開始前・再開待ち' : '録画一時停止中',
        checkFrame: State.clips > 0 ? State.sceneFrames[State.clips - 1] : null,
        retakeLabel: '最初から撮り直す',
        autoResume: false,
        matchGuide: State.mode && State.mode.id === 'match' && UI.hasMatchGuide(),
      });
      if (typeof Diagnostics !== 'undefined') {
        Diagnostics.log('warn', 'capture_interrupted', { phase: interruptedPhase, paused: paused });
      }
    } else if (interruptedPhase === 'prepare' && State.shootFlow === 'continuous') {
      _clearTimers();
      UI.setPrepareManualResume('バックグラウンド移動のため自動再開を止めました。準備できたら再開してください。');
    }
    _releaseWakeLock();
  } else {
    // フォアグラウンド復帰 — iOS AudioContext の suspend 対策
    Audio.unlock();
    if (['interrupted', 'executing', 'processing', 'prepare', 'final-review'].includes(State.phase)) {
      _requestWakeLock();
    }
  }
});

// ── 横向き警告 ────────────────────────────────────
function _checkOrientation() {
  const warn = document.getElementById('orientation-warn');
  if (!warn) return;
  const isLandscape = window.innerWidth > window.innerHeight;
  const inCamera = ['preview', 'countdown', 'recording', 'shutter', 'executing', 'processing', 'prepare', 'final-review', 'interrupted'].includes(State.phase);
  warn.style.display = (isLandscape && inCamera) ? 'flex' : 'none';
}
window.addEventListener('resize', _checkOrientation);

// ── フェーズ遷移 ─────────────────────────────────

function gotoSelect() {
  _clearTimers();
  _releaseWakeLock();
  State.phase      = 'select';
  // BPMピッカーオーバーレイが残っていたら除去
  document.querySelectorAll('.bpm-picker-overlay').forEach(e => e.remove());
  State.mode       = null;
  State.clips      = 0;
  State.recEnabled = false;
  State.scores     = [];
  State.combo      = 0;
  State.maxCombo   = 0;
  State.lastWhipDir = null;
  State.transitionCommitted = false;
  State.sceneFrames = [];
  State.interruptedPhase = null;
  State.interruptionNeedsRestart = false;
  State.recordingStartedAt = 0;
  State.recordingDurationMs = 0;
  State.resumeDurationMs = 0;

  Motion.setActive(false);
  Audio.stop();
  Audio.resetBgmPosition(); // BGM再生位置をリセット（新しい撮影は先頭から）
  Camera.stop();
  Recorder.destroy();
  Share.cleanup();
  UI.stopRecBar();
  UI.hideRecIndicator();
  UI.stopViz();
  UI.hideDummyBackground();
  UI.hideFlipBtn();
  UI.hidePrepareNext();
  UI.clearMatchGuide();
  UI.cleanupPreview();
  UI.stopParticles();
  if (typeof UI.clearPulseTimers === 'function') UI.clearPulseTimers();
  UI.updateRemainingClips(0, CLIPS_NEEDED);
  UI.setShootFlow(State.shootFlow);
  UI.setCaptureAudio(State.captureAudio);
  _refreshDeviceCheck();

  _resetBtn('btn-download');

  document.body.style.background = '#F6F2E4';
  document.documentElement.style.setProperty('--c',     '#2170AC');
  document.documentElement.style.setProperty('--c-rgb', '33,112,172');
  UI.buildModeList(MODES, _onModeSelect, m => {
    UI.updateVizBpm(m.bpm, m.color);
    // ホバー時にレシピのテンポを1発鳴らして「動きの感触」を伝える
    Audio.playModeSelect();
  }, CLIPS_NEEDED, _getLastModeId());
  UI.showScreen('select');
  _checkOrientation();
  // BGM読込済みならインジケーターを再表示
  var _bgmBtn = document.getElementById('btn-bgm');
  var _bgmInd = document.getElementById('bgm-indicator');
  if (Audio.hasBgm()) {
    if (_bgmBtn) _bgmBtn.classList.add('active');
    if (_bgmInd) { _bgmInd.style.display = 'block'; }
  } else {
    if (_bgmBtn) _bgmBtn.classList.remove('active');
    if (_bgmInd) _bgmInd.style.display = 'none';
  }
}

function _resetBtn(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const fresh = el.cloneNode(true);
  fresh.style.display = 'none';
  el.parentNode.replaceChild(fresh, el);
}

// モード選択時にアクセント音 + ハプティクス + localStorage 保存
function _onModeSelect(mode) {
  Audio.playModeSelect();
  _vibrate(20);
  try { localStorage.setItem('shut_last_mode', mode.id); } catch (_) {}
  startMode(mode);
}

// ── カスタムBPMピッカー ──────────────────────────
function _showBpmPicker(baseMode) {
  var bpm = 100;
  var tapTimes = [];
  var overlay = document.createElement('div');
  overlay.className = 'bpm-picker-overlay';
  overlay.innerHTML =
    '<div class="bpm-picker-title">カスタムBPM</div>' +
    '<div class="bpm-picker-display" id="bpm-pick-val">100</div>' +
    '<div class="bpm-picker-unit">BPM</div>' +
    '<button class="tap-tempo-btn" id="tap-tempo" aria-label="タップでBPMを測定">' +
      '<span class="tap-tempo-icon">👆</span>' +
      '<span class="tap-tempo-label">TAP TEMPO</span>' +
    '</button>' +
    '<div class="bpm-slider-wrap">' +
      '<label>60</label>' +
      '<input type="range" class="bpm-slider" id="bpm-slider" min="60" max="200" value="100" aria-label="BPM値">' +
      '<label>200</label>' +
    '</div>' +
    '<div class="bpm-picker-actions">' +
      '<button class="bpm-picker-cancel" id="bpm-cancel">戻る</button>' +
      '<button class="bpm-picker-start" id="bpm-start">START</button>' +
    '</div>';
  document.body.appendChild(overlay);

  var display = document.getElementById('bpm-pick-val');
  var slider  = document.getElementById('bpm-slider');

  function updateBpm(v) {
    bpm = Math.max(60, Math.min(200, Math.round(v)));
    if (display) {
      display.textContent = bpm;
      display.style.transition = 'none';
      display.style.transform = 'scale(1.08)';
      void display.offsetWidth;
      display.style.transition = 'transform 0.15s ease-out';
      display.style.transform = 'scale(1)';
    }
    if (slider) slider.value = bpm;
    UI.updateVizBpm(bpm, baseMode.color);
  }

  if (slider) slider.addEventListener('input', function() { updateBpm(parseInt(this.value, 10)); });

  var tapBtn = document.getElementById('tap-tempo');
  if (tapBtn) tapBtn.addEventListener('pointerdown', function() {
    _vibrate(10);
    tapTimes.push(performance.now());
    if (tapTimes.length > 5) tapTimes.shift();
    if (tapTimes.length >= 2) {
      var intervals = [];
      for (var i = 1; i < tapTimes.length; i++) intervals.push(tapTimes[i] - tapTimes[i-1]);
      var avg = intervals.reduce(function(a,b){ return a+b; }, 0) / intervals.length;
      updateBpm(60000 / avg);
    }
  });

  function _closePicker() {
    overlay.style.transition = 'opacity 0.2s ease';
    overlay.style.opacity = '0';
    setTimeout(function() { if (overlay.parentNode) overlay.remove(); }, 200);
  }

  document.getElementById('bpm-cancel').addEventListener('click', function() {
    _closePicker();
  });

  document.getElementById('bpm-start').addEventListener('click', function() {
    _closePicker();
    var customMode = Object.assign({}, baseMode, {
      bpm: bpm,
      beatsPerClip: Math.round(bpm * 3.5 / 60),
      hashtags: '#SHUT #CUSTOM #BPM' + bpm,
      completeMsg: 'YOUR RHYTHM. BPM' + bpm + ' で自分だけのビートを刻んだ。',
    });
    startMode(customMode);
  });
}

/** 最後に使ったモードIDを取得 */
function _getLastModeId() {
  try { return localStorage.getItem('shut_last_mode'); } catch (_) { return null; }
}

function _getSavedShootFlow() {
  try {
    return localStorage.getItem('shut_shoot_flow') === 'continuous' ? 'continuous' : 'travel';
  } catch (_) {
    return 'travel';
  }
}

function _setShootFlow(flow, persist) {
  if (flow !== 'continuous' && flow !== 'travel') return;
  State.shootFlow = flow;
  UI.setShootFlow(flow);
  if (persist !== false) {
    try { localStorage.setItem('shut_shoot_flow', flow); } catch (_) {}
  }
}

function _getSavedCaptureAudio() {
  try { return localStorage.getItem('shut_capture_audio') !== 'off'; } catch (_) { return true; }
}

function _setCaptureAudio(enabled, persist) {
  State.captureAudio = enabled !== false;
  UI.setCaptureAudio(State.captureAudio);
  if (persist !== false) {
    try { localStorage.setItem('shut_capture_audio', State.captureAudio ? 'on' : 'off'); } catch (_) {}
  }
  _refreshDeviceCheck();
}

function _getSavedCompositionGrid() {
  try { return localStorage.getItem('shut_composition_grid') === 'on'; } catch (_) { return false; }
}

function _setCompositionGrid(enabled, persist) {
  State.compositionGrid = !!enabled;
  UI.setCompositionGrid(State.compositionGrid);
  if (persist !== false) {
    try { localStorage.setItem('shut_composition_grid', State.compositionGrid ? 'on' : 'off'); } catch (_) {}
  }
}

async function _getPermissionState(name) {
  if (!navigator.permissions || typeof navigator.permissions.query !== 'function') return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: name });
    return status && status.state ? status.state : 'unknown';
  } catch (_) {
    return 'unknown';
  }
}

async function _refreshDeviceCheck() {
  if (typeof UI === 'undefined' || typeof Recorder === 'undefined') return;
  const requestId = ++_deviceCheckRequestId;
  UI.renderDeviceCheck({
    state: 'checking',
    headline: '確認中...',
    message: '撮影機能を確認しています。',
    items: [],
  });

  const support = Recorder.getSupportInfo();
  const mediaDevices = !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
  const localHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const secure = window.isSecureContext || localHost;
  const cameraPermission = await _getPermissionState('camera');
  const microphonePermission = State.captureAudio ? await _getPermissionState('microphone') : 'off';
  if (requestId !== _deviceCheckRequestId) return;

  const cameraBlocked = cameraPermission === 'denied';
  const microphoneBlocked = State.captureAudio && microphonePermission === 'denied';
  const coreBlocked = !secure || !mediaDevices || !support.available || !support.mime || cameraBlocked;
  const warning = !coreBlocked && (!support.pause || microphoneBlocked);
  const format = support.mime.includes('mp4') ? 'MP4 / H.264' : support.mime.includes('webm') ? 'WebM' : '対応形式なし';
  const motionAvailable = typeof DeviceMotionEvent !== 'undefined';
  const wakeLockAvailable = 'wakeLock' in navigator;

  const report = {
    state: coreBlocked ? 'blocked' : warning ? 'warning' : 'ready',
    headline: coreBlocked ? '設定を確認' : warning ? '一部制限あり' : '撮影準備OK',
    message: coreBlocked
      ? '未対応の項目を確認してから撮影してください。'
      : warning
        ? '動画撮影はできますが、一部の機能に制限があります。'
        : 'このブラウザで撮影を開始できます。',
    items: [
      {
        name: '安全な接続',
        detail: secure ? 'カメラを利用できる接続です' : 'HTTPSで開き直してください',
        badge: secure ? 'OK' : '必要',
        status: secure ? 'ok' : 'blocked',
      },
      {
        name: 'カメラ',
        detail: !mediaDevices
          ? 'このブラウザでは利用できません'
          : cameraPermission === 'denied'
            ? 'ブラウザ設定でカメラを許可してください'
            : cameraPermission === 'granted' ? '利用許可済み' : '撮影開始時に確認します',
        badge: !mediaDevices || cameraPermission === 'denied' ? '要設定' : cameraPermission === 'granted' ? 'OK' : '開始時',
        status: !mediaDevices || cameraPermission === 'denied' ? 'blocked' : cameraPermission === 'granted' ? 'ok' : 'neutral',
      },
      {
        name: '動画録画',
        detail: support.mime ? format + 'で保存します' : '対応する録画形式がありません',
        badge: support.available && support.mime ? 'OK' : '未対応',
        status: support.available && support.mime ? 'ok' : 'blocked',
      },
      {
        name: 'シーン切替',
        detail: support.pause ? '移動中の映像を除外できます' : '一時停止非対応のため撮り直しが必要です',
        badge: support.pause ? 'OK' : '制限あり',
        status: support.pause ? 'ok' : 'warn',
      },
      {
        name: 'モーション',
        detail: motionAvailable ? (Motion.isEnabled() ? 'センサー利用可能' : '許可後に利用できます') : '画面タップで代替します',
        badge: motionAvailable ? (Motion.isEnabled() ? 'OK' : '許可待ち') : 'タップ',
        status: motionAvailable && Motion.isEnabled() ? 'ok' : 'neutral',
      },
      {
        name: '収録音声',
        detail: !State.captureAudio
          ? '音声なしで撮影します'
          : microphonePermission === 'denied'
            ? 'ブラウザ設定でマイクを許可してください'
            : microphonePermission === 'granted' ? '利用許可済み' : '撮影開始時に確認します',
        badge: !State.captureAudio ? 'OFF' : microphonePermission === 'denied' ? '要設定' : microphonePermission === 'granted' ? 'OK' : '開始時',
        status: !State.captureAudio ? 'neutral' : microphonePermission === 'denied' ? 'warn' : microphonePermission === 'granted' ? 'ok' : 'neutral',
      },
      {
        name: '画面スリープ防止',
        detail: wakeLockAvailable ? '撮影中の画面消灯を抑制します' : '端末の自動ロック時間に注意してください',
        badge: wakeLockAvailable ? 'OK' : '手動',
        status: wakeLockAvailable ? 'ok' : 'neutral',
      },
    ],
  };
  UI.renderDeviceCheck(report);
  if (typeof Diagnostics !== 'undefined' && coreBlocked) {
    Diagnostics.log('warn', 'device_check_blocked', {
      secure: secure,
      camera: mediaDevices && !cameraBlocked,
      recorder: support.available,
      mime: support.mime,
    });
  }
}

async function _copyDiagnostics() {
  if (typeof Diagnostics === 'undefined') return false;
  const ok = await Diagnostics.copyReport();
  UI.showToast(ok ? '診断情報をコピーしました' : '診断情報をコピーできませんでした', 2200);
  return ok;
}

async function startMode(mode) {
  _clearTimers();
  State.phase      = 'preview';
  State.mode       = mode;
  State.clips      = 0;
  State.recEnabled = false;
  State.sceneFrames = [];
  State.scores = [];
  State.combo = 0;
  State.maxCombo = 0;
  State.lastWhipDir = null;
  State.transitionCommitted = false;
  State.interruptedPhase = null;
  State.interruptionNeedsRestart = false;
  State.recordingStartedAt = 0;
  State.recordingDurationMs = 0;
  State.resumeDurationMs = 0;

  _requestWakeLock();

  Motion.setActive(false);
  Motion.resetCooldown();
  Audio.unlock();
  Audio.setMode(mode.id);   // モードごとのビート音色を設定
  UI.stopViz();          // ビジュアライザーのRAFを停止
  UI.applyMode(mode);
  UI.buildClipRow(CLIPS_NEEDED);
  UI.stopRecBar();
  UI.hideRecIndicator();
  UI.hideDummyBackground();
  UI.hidePrepareNext();
  UI.clearMatchGuide();
  UI.showScreen('camera');
  _checkOrientation();

  const camEl = document.getElementById('cam');
  const camOk = await Camera.start(camEl);

  // await 中にフェーズが変わった場合（Escape等）はここで中断
  if (State.mode !== mode || State.phase !== 'preview') {
    Camera.stop();
    return;
  }

  if (!camOk) {
    if (typeof Diagnostics !== 'undefined') Diagnostics.log('error', 'camera_start_failed');
    UI.showDummyBackground();
    // エラーの種類に応じてオーバーレイを表示
    const overlay = document.getElementById('cam-error-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
    } else {
      UI.showToast('📷 カメラなし — タップで動作します', 3500);
    }
  } else {
    UI.showFlipBtn(_flipCamera);
  }

  const stream = Camera.getStream();
  if (camOk && stream) {
    try {
      State.recEnabled = await Recorder.setup(stream, { includeAudio: State.captureAudio });
      if (State.recEnabled) {
        const audioLabel = State.captureAudio && Recorder.hasAudio() ? ' + MIC' : '';
        UI.showToast('🔴 REC' + audioLabel, 1500);
        if (State.captureAudio && !Recorder.hasAudio() && typeof Diagnostics !== 'undefined') {
          Diagnostics.log('warn', 'microphone_unavailable');
        }
      }
    } catch (e) {
      console.warn('[App] Recorder 失敗:', e);
      if (typeof Diagnostics !== 'undefined') Diagnostics.log('error', 'recorder_setup_failed', e.message);
    }
  }

  // カメラ映像が安定するまで少し待つ（0.8秒）
  // この間ユーザーは構図を確認できる
  UI.showCamPreviewHint();
  _schedulePreviewCountdown();
}

function _schedulePreviewCountdown() {
  _T(() => {
    if (State.phase === 'preview') gotoCountdown();
  }, PREVIEW_READY_MS);
}

// カメラフリップ — 撮影開始前のpreview中だけ許可
async function _flipCamera() {
  if (State.phase !== 'preview' || !State.mode) {
    UI.showToast('撮影開始前にカメラを切り替えてください', 2000);
    return;
  }

  const mode = State.mode;
  _clearTimers();
  UI.showToast('📷 切替中...', 1200);
  _vibrate(15);
  const ok = await Camera.flip();
  if (State.phase !== 'preview' || State.mode !== mode) return;
  if (!ok) {
    UI.showToast('カメラ切替に失敗しました');
    _schedulePreviewCountdown();
    return;
  }

  // Recorder の映像トラックを更新（オーディオは再利用）
  if (State.recEnabled) {
    const stream = Camera.getStream();
    if (stream) {
      State.recEnabled = await Recorder.setup(stream, {
        keepClips: true,
        includeAudio: State.captureAudio,
      }).catch(() => false);
    }
  }

  if (State.phase !== 'preview' || State.mode !== mode) return;
  if (!State.recEnabled && typeof Diagnostics !== 'undefined') {
    Diagnostics.log('error', 'recorder_setup_after_flip_failed');
  }
  UI.showToast(Camera.isRear() ? 'リアカメラ' : 'フロントカメラ', 1500);
  UI.showCamPreviewHint();
  _schedulePreviewCountdown();
}

function gotoCountdown() {
  _clearTimers();
  State.phase = 'countdown';
  Motion.setActive(false);
  Audio.stop();        // _nextBeat/_bpm はリセット（次の Audio.start() まで）
  UI.stopRecBar();
  UI.hideRecIndicator();
  UI.setHudStatus('<span style="letter-spacing:0.2em;opacity:0.6">READY</span>');
  UI.updateRemainingClips(CLIPS_NEEDED - State.clips, CLIPS_NEEDED);
  UI.showMatchGuide(State.mode && State.mode.id === 'match' && State.clips > 0);

  // カウントダウン間隔をBPMに合わせる（1拍分）
  var countBeat = Math.round(60000 / (State.mode ? State.mode.bpm : 100));
  var countMs   = Math.max(450, Math.min(countBeat, 800)); // 450〜800ms（POPのビートに合わせて450に変更）

  let count = 3;
  var currentShot = _getShotStep(State.clips);
  UI.setCenter('countdown', count);
  // カウントダウン中: 現在のシーンガイドを薄く表示
  UI.setGuideText(currentShot ? currentShot.guide : (State.mode ? State.mode.guide : ''), true);
  Audio.playCountTick(false, State.mode ? State.mode.id : 'cool');
  _vibrate(30);

  const tick = () => {
    count--;
    if (count > 0) {
      UI.setCenter('countdown', count);
      UI.setHudStatus('<span style="letter-spacing:0.2em;opacity:0.5">' + count + '...</span>');
      Audio.playCountTick(false, State.mode ? State.mode.id : 'cool');
      _vibrate(20);
      _T(tick, countMs);
    } else {
      UI.setCenter('go');
      UI.setHudStatus('<span style="letter-spacing:0.2em;font-weight:700">GO!</span>');
      Audio.playCountTick(true, State.mode ? State.mode.id : 'cool');
      _vibrate([40, 20, 40]);
      _T(gotoRecording, Math.round(countMs * 0.75));
    }
  };
  _T(tick, countMs);
}

function gotoRecording() {
  _clearTimers();
  State.phase = 'recording';
  Motion.setActive(false);
  UI.setMotionGaugeMode('motion');
  UI.showMatchGuide(false);
  _checkOrientation();

  const m   = State.mode;
  const fullDuration = (60000 / m.bpm) * (m.beatsPerClip || 6);
  const dur = State.resumeDurationMs > 0 ? State.resumeDurationMs : fullDuration;
  State.resumeDurationMs = 0;
  State.recordingStartedAt = performance.now();
  State.recordingDurationMs = dur;
  let step = _getShotStep(State.clips);

  // クリップ開始時にREC枠フラッシュ（clips=0は白、clips>0は入り方向カラー）
  var vfMain = document.getElementById('vf-main');
  if (vfMain) {
    if (State.clips === 0) {
      vfMain.classList.add('rec-flash');
      setTimeout(function() { vfMain.classList.remove('rec-flash'); }, 700);
    } else {
      vfMain.classList.add('enter-flash');
      setTimeout(function() { vfMain.classList.remove('enter-flash'); }, 450);
    }
  }

  UI.setCenter('arrow', step && step.arrow ? step.arrow : m.arrow);
  // ガイドテキストに矢印を前置してわかりやすく
  var _guideArrow = (step && step.arrow && step.arrow !== '•') ? step.arrow + '  ' : '';
  UI.setGuideText(_guideArrow + (step && step.guide ? step.guide : m.guide), false);
  UI.markClipCurrent(State.clips);
  UI.showRecIndicator(State.clips + 1, CLIPS_NEEDED, m.bpm);
  UI.updateRemainingClips(CLIPS_NEEDED - State.clips, CLIPS_NEEDED);
  // 前回のCLIP N/M 表示をREC表示で上書き
  UI.setHudStatus(
    '<span class="rec-dot"></span>' +
    (step && step.hud ? step.hud : 'REC') +
    ' &nbsp;' + (State.clips + 1) + ' / ' + CLIPS_NEEDED
  );

  // beatPulse に拍番号を渡す（強拍で強いビジュアル）
  Audio.start(m.bpm, beatIdx => UI.beatPulse(beatIdx));
  // 1本の連続録画: 最初のクリップのみ start、以降は resume
  if (State.recEnabled) {
    if (Recorder.isPaused()) {
      Recorder.resumeClip();
    } else if (!Recorder.isRecording()) {
      Recorder.startClip();
    }
  }
  // 実際の録画解像度を1.5秒表示
  if (State.clips === 0 && Camera.isActive()) {
    const s = Camera.getActualSettings();
    if (s && s.width) {
      _T(() => UI.showToast('📹 ' + s.width + 'x' + s.height, 2000), 300);
    }
  }
  UI.startRecBar(dur, () => {
    if (State.clips >= CLIPS_NEEDED - 1) {
      finishFinalShot();
    } else {
      gotoShutter();
    }
  }, m.bpm);
}

function gotoShutter() {
  _clearTimers();
  State.phase = 'shutter';
  State.transitionCommitted = false;
  // freezeForTiming() で _nextBeat/_bpm を保持してタイミング評価を正確にする
  Audio.freezeForTiming();
  UI.stopRecBar();
  UI.hideRecIndicator();
  UI.cancelShutterCountdown();

  // ここでは録画を止めない。ユーザーの物理トランジションを動画に残す。
  var transition = _getTransition();
  UI.setCenter('transition', {
    label: transition.label,
    arrow: transition.arrow,
    sub: transition.prompt,
  });
  UI.setGuideText(transition.trigger === 'dark'
    ? '右のDARKメーターが満タンになるまで塞ぐ'
    : transition.prompt, false);
  UI.setHudStatus(transition.trigger === 'dark'
    ? '<strong>AUTO DETECT</strong> &nbsp; レンズを完全に塞ぐ'
    : '<strong>TRANSITION NOW</strong> &nbsp; 動作したらタップ');
  UI.updateRemainingClips(CLIPS_NEEDED - State.clips, CLIPS_NEEDED);
  _vibrate(15);

  Motion.setActive(transition.trigger === 'motion');
  Motion.resetCooldown();
  UI.setMotionGaugeMode(transition.trigger === 'dark' ? 'dark' : 'motion');
  if (transition.trigger === 'dark') _startCoverDetection();

  // 待ち時間も録画されるため4秒で打ち切り、次シーン準備へ進める。
  UI.startShutterCountdown(4, () => {
    if (State.phase !== 'shutter') return;
    State.transitionCommitted = true;
    State.phase = 'processing';
    Motion.setActive(false);
    _stopCoverDetection();
    State.scores.push({ grade: 'MISS', offset: null, timeout: true });
    State.combo = 0;
    UI.showGradePopup('MISS', 0);
    Audio.playWarning();
    _vibrate([20, 20, 20]);
    _captureMatchGuide();
    _captureSceneFrame(State.clips);
    if (State.recEnabled && Recorder.isRecording()) Recorder.pauseClip();
    UI.markClipDone(State.clips);
    State.clips++;
    _T(gotoPrepareNext, 600);
  });
}

function executeShut(source) {
  if (State.phase !== 'shutter' || State.transitionCommitted) return;
  State.transitionCommitted = true;
  State.phase = 'executing';
  Motion.setActive(false);
  _stopCoverDetection();
  UI.cancelShutterCountdown();
  _captureMatchGuide();
  _captureSceneFrame(State.clips);

  // ── タイミング評価 ──────────────────────────────
  const offset = Audio.getTimingOffset(); // ビートとのズレ(ms)
  const grade  = _calcGrade(offset);
  State.scores.push({ grade: grade, offset: offset, autoDetected: source === 'dark' });

  // コンボ更新
  if (grade === 'PERFECT' || grade === 'GOOD') {
    State.combo++;
    if (State.combo > State.maxCombo) State.maxCombo = State.combo;
  } else {
    State.combo = 0;
  }

  // 評価に応じた振動パターン
  const vibeMap = {
    PERFECT: [80, 10, 80],
    GOOD:    [60, 20, 30],
    OK:      [40],
    MISS:    [20, 20, 20],
  };
  _vibrate(vibeMap[grade] || [40]);

  Audio.playShut();
  if (State.clips < CLIPS_NEEDED - 1) Audio.playTransition();

  // 振り方向を検出して次クリップの入りに引き継ぐ
  var _whipAccel = Motion.getLastDirection();
  var _detectedDir = _detectWhipDir(_whipAccel);
  State.lastWhipDir = _detectedDir;

  UI.addBlurSwipe(State.mode.color, _whipAccel);
  _T(() => UI.addFlash(grade), 30);

  // タイミング評価UI表示
  UI.showGradePopup(grade, State.combo);

  // 動作直後のブラー/暗転を少し録画してからpauseする。
  var transition = _getTransition();
  UI.setHudStatus('<strong>CAPTURED</strong> &nbsp; 動きを止める');
  _T(() => {
    if (State.recEnabled && Recorder.isRecording()) Recorder.pauseClip();
    UI.markClipDone(State.clips);
    State.clips++;
    gotoPrepareNext();
  }, transition.tailMs || 220);
}

function _startCoverDetection() {
  _stopCoverDetection();
  if (State.phase !== 'shutter' || !Camera.isActive()) return;

  let baseline = 0;
  let baselineSamples = 0;
  let darkFrames = 0;

  const sample = () => {
    if (State.phase !== 'shutter' || State.transitionCommitted) {
      _stopCoverDetection();
      return;
    }

    const reading = Camera.sampleLuminance();
    if (reading) {
      if (baselineSamples < 3) {
        baseline = Math.max(baseline, reading.luma);
        baselineSamples++;
        UI.updateCoverGauge(0, false);
      } else {
        const threshold = Math.min(42, Math.max(8, baseline * 0.28));
        const range = Math.max(1, baseline - threshold);
        const isCovered = reading.luma <= threshold && reading.darkRatio >= 0.82;
        let darkness = Math.max(0, Math.min(1, (baseline - reading.luma) / range));
        if (isCovered && baseline <= threshold) darkness = 1;
        darkFrames = isCovered ? darkFrames + 1 : 0;
        UI.updateCoverGauge(darkness, darkFrames > 0);

        if (darkFrames >= 3) {
          UI.setHudStatus('<strong>DARK DETECTED</strong> &nbsp; 暗転を確定');
          _vibrate([30, 20, 60]);
          executeShut('dark');
          return;
        }
      }
    }

    _coverDetectTimer = setTimeout(sample, 100);
  };

  sample();
}

function _stopCoverDetection() {
  if (_coverDetectTimer) {
    clearTimeout(_coverDetectTimer);
    _coverDetectTimer = null;
  }
}

function _getTransition() {
  if (State.mode && State.mode.transition) return State.mode.transition;
  return {
    label: 'SHUT', arrow: State.mode ? State.mode.arrow : '→',
    trigger: 'motion', tailMs: 220,
    prompt: '素早く振ったら画面をタップ',
    prepare: '次のシーンを準備する。',
    ready: 'STARTを押して構える。',
  };
}

function _captureMatchGuide() {
  if (!State.mode || State.mode.id !== 'match' || State.clips !== 0) return false;
  const video = document.getElementById('cam');
  return UI.captureMatchGuide(video, !Camera.isRear());
}

function _captureSceneFrame(index) {
  const video = document.getElementById('cam');
  if (!video || !video.videoWidth || !video.videoHeight) return null;

  const canvas = document.createElement('canvas');
  canvas.width = 270;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const targetRatio = canvas.width / canvas.height;
  const sourceRatio = video.videoWidth / video.videoHeight;
  let sx = 0;
  let sy = 0;
  let sw = video.videoWidth;
  let sh = video.videoHeight;
  if (sourceRatio > targetRatio) {
    sw = video.videoHeight * targetRatio;
    sx = (video.videoWidth - sw) / 2;
  } else {
    sh = video.videoWidth / targetRatio;
    sy = (video.videoHeight - sh) / 2;
  }

  ctx.save();
  if (!Camera.isRear()) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  try {
    const frame = canvas.toDataURL('image/jpeg', 0.72);
    State.sceneFrames[index] = frame;
    return frame;
  } catch (error) {
    if (typeof Diagnostics !== 'undefined') Diagnostics.log('warn', 'scene_frame_failed', error.message);
    return null;
  }
}

function _getShotStep(index) {
  if (!State.mode) return null;
  var shots = State.mode.shots && State.mode.shots.length
    ? State.mode.shots
    : State.mode.steps;
  if (!shots || shots.length === 0) return null;
  var step = Object.assign({}, shots[index % shots.length]);

  // WHIPのシーンBは、シーンAで実際に振った方向を入口へ引き継ぐ。
  if (State.mode.id === 'whip' && index > 0) {
    var dir = State.lastWhipDir || '→';
    step.arrow = dir;
    step.guide = dir + ' から振り込み、被写体で止める';
    step.hud = 'SCENE B  ' + dir + ' IN → 静止';
  }
  return step;
}

function gotoPrepareNext() {
  _clearTimers();
  State.phase = 'prepare';
  Motion.setActive(false);
  Audio.stop();
  UI.dismissGradePopup();
  UI.stopRecBar();
  UI.hideRecIndicator();
  UI.setCenter('empty');
  UI.setGuideText('', false);

  var transition = _getTransition();
  var direction = State.mode && State.mode.id === 'whip'
    ? (State.lastWhipDir || '→') + '方向をそろえる。'
    : '';
  var isContinuous = State.shootFlow === 'continuous';
  var nextShot = _getShotStep(State.clips);
  var description = isContinuous && nextShot
    ? direction + nextShot.guide
    : direction + transition.prepare;
  UI.showPrepareNext({
    scene: State.clips + 1,
    total: CLIPS_NEEDED,
    title: isContinuous ? 'そのまま次のシーンへ' : '移動して次のシーンを準備',
    description: description,
    ready: isContinuous
      ? 'まもなく自動でカウントダウンを開始します。'
      : transition.ready,
    flowLabel: isContinuous ? 'CONTINUOUS' : 'MOVE & RESUME',
    buttonLabel: isContinuous ? '今すぐ再開' : '準備できたら撮影再開',
    recordingState: isContinuous
      ? '録画停止中・まもなく再開'
      : '録画停止中・移動できます',
    checkFrame: State.sceneFrames[State.clips - 1] || null,
    retakeLabel: 'シーンAを撮り直す',
    autoResume: isContinuous,
    resumeMs: CONTINUOUS_RESUME_MS,
    matchGuide: State.mode && State.mode.id === 'match' && UI.hasMatchGuide(),
  });
  UI.showMatchGuide(State.mode && State.mode.id === 'match');
  if (isContinuous) {
    _T(() => {
      if (!document.hidden) startNextScene();
    }, CONTINUOUS_RESUME_MS);
  }
}

function startNextScene() {
  if (State.phase === 'final-review') {
    if (typeof Diagnostics !== 'undefined') Diagnostics.log('info', 'final_review_confirmed');
    gotoComplete();
    return;
  }
  if (State.phase === 'interrupted') {
    resumeInterruptedCapture();
    return;
  }
  if (State.phase !== 'prepare') return;
  _requestWakeLock();
  Audio.unlock();
  UI.hidePrepareNext();
  _vibrate(20);
  gotoCountdown();
}

function resumeInterruptedCapture() {
  if (State.phase !== 'interrupted' || !State.mode) return;
  const interruptedPhase = State.interruptedPhase;
  const needsRestart = State.interruptionNeedsRestart;
  const mode = State.mode;
  State.interruptedPhase = null;
  State.interruptionNeedsRestart = false;
  UI.hidePrepareNext();
  Audio.unlock();
  _requestWakeLock();
  if (typeof Diagnostics !== 'undefined') {
    Diagnostics.log('info', needsRestart ? 'capture_restart_required' : 'capture_resumed', interruptedPhase);
  }

  if (needsRestart) {
    Recorder.destroy();
    Camera.stop();
    startMode(mode);
    return;
  }

  if (interruptedPhase === 'preview') {
    Recorder.destroy();
    Camera.stop();
    startMode(mode);
    return;
  }

  if (interruptedPhase === 'shutter') {
    gotoShutter();
    if (State.recEnabled) Recorder.resumeClip();
    return;
  }
  gotoCountdown();
}

function retakeFirstScene() {
  if (!['prepare', 'final-review', 'interrupted'].includes(State.phase) || !State.mode) return;
  const mode = State.mode;
  if (typeof Diagnostics !== 'undefined') {
    Diagnostics.log('info', State.phase === 'final-review' ? 'final_review_restart' : 'scene_a_retake');
  }
  _vibrate([20, 20, 40]);
  UI.hidePrepareNext();
  UI.clearMatchGuide();
  Recorder.destroy();
  Camera.stop();
  startMode(mode);
}

function finishFinalShot() {
  if (State.phase !== 'recording') return;
  _captureSceneFrame(State.clips);
  State.phase = 'processing';
  Motion.setActive(false);
  Audio.stop();
  UI.stopRecBar();
  UI.hideRecIndicator();
  UI.setCenter('empty');
  UI.setGuideText('最後の構図をそのままキープ', false);
  UI.setHudStatus('<strong>FINAL HOLD</strong> &nbsp; 保存準備中');

  // 最後の余韻を残した後、録画を一時停止して保存前の構図確認へ進む。
  _T(() => {
    UI.markClipDone(State.clips);
    State.clips++;
    const paused = !State.recEnabled || !Recorder.isRecording() || Recorder.pauseClip();
    if (!paused && Recorder.isRecording()) {
      if (typeof Diagnostics !== 'undefined') {
        Diagnostics.log('warn', 'final_review_pause_failed');
      }
      gotoComplete();
      return;
    }
    gotoFinalReview();
  }, 650);
}

function gotoFinalReview() {
  State.phase = 'final-review';
  UI.showMatchGuide(false);
  UI.showPrepareNext({
    scene: CLIPS_NEEDED,
    total: CLIPS_NEEDED,
    title: '最後のシーンを確認',
    description: 'シーンBの最後の構図です。問題なければ完成へ進みます。',
    ready: '撮り直す場合は、同じレシピを最初から撮影します。',
    flowLabel: 'FINAL CHECK',
    buttonLabel: 'この動画で完成',
    recordingState: '録画停止中・最終確認',
    checkFrame: State.sceneFrames[State.sceneFrames.length - 1] || null,
    checkFrameLabel: 'SCENE B CHECK',
    checkFrameAlt: 'シーンBの確認フレーム',
    retakeLabel: '最初から撮り直す',
    autoResume: false,
    matchGuide: false,
  });
  if (typeof Diagnostics !== 'undefined') Diagnostics.log('info', 'final_review_shown');
  _checkOrientation();
}

/**
 * タイミングオフセット(ms)から評価グレードを算出
 * BPM依存の窓設定（Reel Video Architecture の tolerance 0.12 設計に準拠）
 * 拍間隔の 12% / 25% / 45% を各グレードの閾値とする
 *   BPM 85 (COOL) : PERFECT ±85ms, GOOD ±176ms, OK ±318ms
 *   BPM 100 (VIBE): PERFECT ±72ms, GOOD ±150ms, OK ±270ms
 *   BPM 128 (POP) : PERFECT ±56ms, GOOD ±117ms, OK ±211ms
 */
function _calcGrade(offset) {
  if (offset === null) return 'MISS';
  const abs     = Math.abs(offset);
  const beatMs  = State.mode ? Math.round(60000 / State.mode.bpm) : 600;
  if (abs <= beatMs * 0.12) return 'PERFECT';
  if (abs <= beatMs * 0.25) return 'GOOD';
  if (abs <= beatMs * 0.45) return 'OK';
  return 'MISS';
}

/** 全トランジションの評価から称号を決定 */
function _calcTitle(scores) {
  const total   = scores.length;
  if (total === 0) return { title: 'VIDEO COMPLETE', stars: 0 };
  const perfects = scores.filter(s => s.grade === 'PERFECT').length;
  const goods    = scores.filter(s => s.grade === 'GOOD').length;
  const ratio    = (perfects * 2 + goods) / (total * 2);

  if (perfects === total)          return { title: 'FULL PERFECT!',  stars: 5 };
  if (ratio >= 0.9)                return { title: 'EXCELLENT!',     stars: 4 };
  if (ratio >= 0.7)                return { title: 'GREAT SHOT!',    stars: 3 };
  if (ratio >= 0.4)                return { title: 'NICE TRY!',      stars: 2 };
  return                                  { title: 'KEEP RHYTHM!',   stars: 1 };
}

async function gotoComplete() {
  _clearTimers();
  _releaseWakeLock();
  State.phase = 'complete';
  Motion.setActive(false);
  UI.hidePrepareNext();
  UI.clearMatchGuide();
  Audio.stop();  // 完成後は freeze 状態も含めてリセット
  UI.hideFlipBtn();
  UI.updateRemainingClips(0, CLIPS_NEEDED);
  _checkOrientation();

  // 映像トラックを止める前に、1本の連続録画を確定して最終チャンクを受け取る。
  let stopResult = { ok: true, size: 0, reason: null };
  if (State.recEnabled && (Recorder.isRecording() || Recorder.isPaused())) {
    UI.setHudStatus('<span class="processing-hud">● 保存中...</span>');
    stopResult = await Recorder.stopClip();
  }
  Camera.stop();

  // 録画データを取得しキャッシュ（btn-share でも再利用）
  const _finalBlob = State.recEnabled ? Recorder.getFinalBlob() : null;
  const _saveFailed = State.recEnabled && (!stopResult.ok || !_finalBlob || _finalBlob.size === 0);
  State._cachedBlob = _finalBlob;
  if (typeof Diagnostics !== 'undefined') {
    Diagnostics.log(_saveFailed ? 'error' : 'info', _saveFailed ? 'recording_save_failed' : 'recording_complete', {
      size: _finalBlob ? _finalBlob.size : 0,
      reason: stopResult.reason || Recorder.getLastError(),
      audio: Recorder.hasAudio(),
    });
  }
  const _shootTime  = new Date();
  const _scoreTitle = _saveFailed
    ? { title: '保存できませんでした', stars: 0 }
    : _calcTitle(State.scores);

  if (_saveFailed) {
    Audio.playWarning();
    _vibrate([20, 20, 20]);
  } else {
    Audio.playComplete();
    _vibrate([40, 20, 40, 20, 80]);
  }

  // ハイスコアを localStorage に保存（モード別）
  var _hiKey = 'shut_hi_' + (State.mode ? State.mode.id : 'cool');
  var _hiPrev = 0;
  try { _hiPrev = parseInt(localStorage.getItem(_hiKey) || '0', 10); } catch (_) {}
  var _hiNew  = _scoreTitle ? _scoreTitle.stars : 0;
  var _isNewHi = _hiNew > 0 && _hiNew > _hiPrev;
  if (_isNewHi) {
    try { localStorage.setItem(_hiKey, String(_hiNew)); } catch (_) {}
  }

  UI.buildCompleteScreen(State.mode, CLIPS_NEEDED, _finalBlob, _shootTime, {
    scores:   _saveFailed ? [] : State.scores,
    title:    _scoreTitle,
    maxCombo: State.maxCombo,
    prevBest: _hiPrev,
    isNewHi:  _isNewHi,
    recordingError: _saveFailed,
    recordingErrorReason: stopResult.reason || Recorder.getLastError(),
    sceneFrames: State.sceneFrames.slice(),
    audioRecorded: Recorder.hasAudio(),
  });
  UI.showScreen('complete');

  // FULL PERFECT: シーン間の全トランジションがPERFECT
  const expectedTransitions = Math.max(1, CLIPS_NEEDED - 1);
  if (!_saveFailed && _scoreTitle && _scoreTitle.title === 'FULL PERFECT!' && State.scores.length >= expectedTransitions) {
    _T(() => {
      _vibrate([100, 50, 100, 50, 100]);
      UI.showToast('🎯 FULL PERFECT! 完璧なタイミング！', 3000);
    }, 800);
  }

  if (_finalBlob) {
    // ダウンロードボタン（少し遅らせてアニメーション完了を待つ）
    _T(() => {
      const btnDl = document.getElementById('btn-download');
      if (!btnDl) return;
      const sizeMB = (_finalBlob.size / 1024 / 1024).toFixed(1);
      btnDl.style.display = 'inline-block';
      btnDl.textContent   = '⬇ 保存 (' + sizeMB + 'MB)';
      btnDl.addEventListener('click', () => {
        if (btnDl.disabled) return;
        btnDl.disabled = true;
        Share.download(_finalBlob, { label: State.mode.label, bpm: State.mode.bpm });
        UI.showToast('⬇ 動画を保存しています...');
        setTimeout(() => { btnDl.disabled = false; }, 3000);
      });
    }, 400);
  } else if (_saveFailed) {
    _T(() => UI.showToast('動画を保存できませんでした。もう一度撮影してください。', 4000), 300);
  }
}

// ── センサー / タップ ─────────────────────────────
Motion.onShut(() => executeShut());
Motion.onMagnitude((mag, warn) => {
  UI.updateMotionGauge(mag, warn);
  _dbgUpdate(mag);
});

document.addEventListener('pointerdown', e => {
  if (e.target.closest('button, input, select, label')) return;
  if (State.phase === 'shutter') executeShut();
  _dbgTap();
}, false);

document.addEventListener('keydown', e => {
  if (e.code === 'Space'  && State.phase === 'shutter')                              { e.preventDefault(); executeShut(); }
  if (e.code === 'KeyR'   && (State.phase === 'complete' || State.phase === 'select')) gotoSelect();
  if (e.code === 'Escape' && !['permission', 'splash'].includes(State.phase))         gotoSelect();
});

// ── URLパラメータ ─────────────────────────────────
function _urlMode() {
  const params = new URLSearchParams(window.location.search);
  const clips  = parseInt(params.get('clips'), 10);
  if ([2, 4, 6].includes(clips)) CLIPS_NEEDED = clips;
  const modeId = params.get('mode');
  return MODES.find(m => m.id === modeId) || null;
}

// ── チュートリアル（初回のみ） ─────────────────────
function _afterPermission(urlMode) {
  var onboarded = false;
  try { onboarded = localStorage.getItem('shut_onboarded') === '1'; } catch (_) {}
  if (onboarded || urlMode) {
    gotoSelect();
    if (urlMode) _T(() => startMode(urlMode), 150);
    return;
  }
  _showTutorial();
}

function _showTutorial() {
  State.phase = 'tutorial';
  UI.showScreen('tutorial');
  var step = 0;
  var steps = document.querySelectorAll('.tut-step');
  var dots  = document.querySelectorAll('.tut-dot');
  var btnNext = document.getElementById('btn-tut-next');
  var btnSkip = document.getElementById('btn-tut-skip');

  function goStep(n) {
    steps.forEach(function(s, i) {
      s.classList.remove('active', 'exit');
      s.setAttribute('aria-hidden', i !== n ? 'true' : 'false');
      if (i < n) s.classList.add('exit');
      if (i === n) s.classList.add('active');
    });
    dots.forEach(function(d, i) { d.classList.toggle('active', i === n); });
    step = n;
    if (btnNext) {
      btnNext.textContent = (n >= steps.length - 1) ? 'はじめる' : '次へ';
      if (n >= steps.length - 1) {
        btnNext.style.animation = 'none';
        void btnNext.offsetWidth;
        btnNext.style.animation = 'btnReadyPulse 1.5s ease-in-out infinite';
      } else {
        btnNext.style.animation = '';
      }
    }
  }

  function finish() {
    try { localStorage.setItem('shut_onboarded', '1'); } catch (_) {}
    gotoSelect();
  }

  // リスナー重複防止: cloneNode で既存リスナーを除去
  if (btnNext) {
    var fresh = btnNext.cloneNode(true);
    btnNext.parentNode.replaceChild(fresh, btnNext);
    btnNext = fresh;
    btnNext.addEventListener('click', function() {
      _vibrate(15);
      if (step >= steps.length - 1) { finish(); return; }
      goStep(step + 1);
    });
  }
  if (btnSkip) {
    var freshSkip = btnSkip.cloneNode(true);
    btnSkip.parentNode.replaceChild(freshSkip, btnSkip);
    btnSkip = freshSkip;
    btnSkip.addEventListener('click', function() { finish(); });
  }
  goStep(0);
}

// ── デバッグパネル ────────────────────────────────
let _dbgTimer = null;
function _dbgTap() {
  State.debugTaps++;
  clearTimeout(_dbgTimer);
  _dbgTimer = setTimeout(() => { State.debugTaps = 0; }, 1400);
  if (State.debugTaps >= 7) {
    State.debugTaps = 0;
    const p = document.getElementById('debug-panel');
    if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
  }
}
function _dbgUpdate(mag) {
  const p = document.getElementById('debug-panel');
  if (!p || p.style.display === 'none') return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('dbg-mag',   mag.toFixed(2));
  set('dbg-thr',   Motion.THRESHOLD + ' m/s²');
  set('dbg-phase', State.phase);
  set('dbg-rec',   State.recEnabled ? 'ON (' + Recorder.getClipCount() + '/' + CLIPS_NEEDED + ')' : 'OFF');
  set('dbg-sens',  Motion.isEnabled() ? 'センサーON' : 'タップのみ');
  set('dbg-clip',  State.clips + ' / ' + CLIPS_NEEDED);
}

// ── DOMContentLoaded ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // URLパラメータを先に処理
  const urlMode = _urlMode();
  _setShootFlow(_getSavedShootFlow(), false);
  _setCaptureAudio(_getSavedCaptureAudio(), false);
  _setCompositionGrid(_getSavedCompositionGrid(), false);
  _checkOrientation();

  // スプラッシュ → 次画面への遷移
  var _splashMs = _getLastModeId() ? 700 : 1200;
  _T(() => {
    if (typeof DeviceMotionEvent === 'undefined') {
      _afterPermission(urlMode);
      return;
    }
    if (typeof DeviceMotionEvent.requestPermission !== 'function') {
      Motion.requestPermission().then(() => _afterPermission(urlMode));
      return;
    }
    UI.showScreen('permission');
    State.phase = 'permission';
  }, _splashMs);

  // パーミッションボタン
  const btnPerm = document.getElementById('btn-permission');
  if (btnPerm) {
    btnPerm.addEventListener('click', async () => {
      Audio.unlock();  // iOS: user interaction の直後にAudioContext を unlock
      btnPerm.textContent = '確認中...';
      btnPerm.disabled    = true;
      _vibrate(10);
      const res = await Motion.requestPermission();
      if (res === 'granted' || res === 'unavailable') {
        _afterPermission(urlMode);
      } else {
        btnPerm.textContent = 'もう一度試す';
        btnPerm.disabled    = false;
        alert('センサーの許可が必要です。\n\niOS: 設定 → Safari → モーションと方向へのアクセス → オン\n\nページを再読み込みして再試行してください。');
      }
    });
  }

  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };

  document.querySelectorAll('[data-shoot-flow]').forEach(btn => {
    btn.addEventListener('click', () => {
      _setShootFlow(btn.dataset.shootFlow, true);
      _vibrate(10);
    });
  });

  document.querySelectorAll('[data-capture-audio]').forEach(btn => {
    btn.addEventListener('click', () => {
      _setCaptureAudio(btn.dataset.captureAudio === 'on', true);
      _vibrate(10);
    });
  });

  on('btn-next-scene', startNextScene);
  on('btn-retake-scene', retakeFirstScene);
  on('btn-device-check', () => {
    const btn = document.getElementById('btn-device-check');
    UI.setDeviceCheckExpanded(!btn || btn.getAttribute('aria-expanded') !== 'true');
  });
  on('btn-device-check-refresh', _refreshDeviceCheck);
  on('btn-grid-guide', () => {
    _setCompositionGrid(!State.compositionGrid, true);
    _vibrate(10);
    UI.showToast(State.compositionGrid ? '構図ガイド ON' : '構図ガイド OFF', 1400);
  });
  on('btn-cancel-shoot', () => {
    _vibrate(15);
    gotoSelect();
  });

  on('btn-share', async () => {
    _vibrate(15);
    const blob = State._cachedBlob || null;
    if (!blob) {
      UI.showToast('録画データがありません。もう一度撮影してください。', 2500);
      return;
    }
    const result = await Share.shareOrDownload(blob, {
      label:    State.mode ? State.mode.label    : 'WHIP',
      bpm:      State.mode ? State.mode.bpm      : 85,
      hashtags: State.mode ? State.mode.hashtags : '#SHUT',
    });
    if (result === 'downloaded') UI.showToast('⬇ 保存しました！');
    if (result === 'shared')     UI.showToast('📤 シェアしました！');
    if (result === 'cancelled')  UI.showToast('キャンセルしました');
    if (result === 'failed' && typeof Diagnostics !== 'undefined') {
      Diagnostics.log('error', 'share_failed');
    }
  });

  on('btn-copy-url', async () => {
    const ok = await Share.copyUrl();
    UI.showToast(ok ? '🔗 URLをコピーしました' : 'コピーに失敗しました');
    _vibrate(10);
  });
  on('btn-copy-diagnostics', _copyDiagnostics);
  on('btn-camera-diagnostics', _copyDiagnostics);

  on('btn-retry', () => { _vibrate(20); gotoSelect(); });

  // PWA インストールボタン
  const btnInstall = document.getElementById('btn-install-pwa');
  if (btnInstall) {
    btnInstall.addEventListener('click', async () => {
      if (!_deferredInstall) return;
      _deferredInstall.prompt();
      const { outcome } = await _deferredInstall.userChoice;
      _deferredInstall = null;
      if (outcome === 'accepted') UI.showToast('📱 インストール中...', 2000);
      btnInstall.style.display = 'none';
    });
  }

  // BGM ボタン
  on('btn-bgm', () => {
    if (Audio.hasBgm()) {
      Audio.clearBgm();
      var bgmBtn = document.getElementById('btn-bgm');
      var bgmInd = document.getElementById('bgm-indicator');
      if (bgmBtn) bgmBtn.classList.remove('active');
      if (bgmInd) bgmInd.style.display = 'none';
      UI.showToast('🎵 BGM解除', 1500);
      return;
    }
    var input = document.getElementById('bgm-input');
    if (input) input.click();
  });

  var bgmInput = document.getElementById('bgm-input');
  if (bgmInput) bgmInput.addEventListener('change', async function() {
    var file = this.files && this.files[0];
    if (!file) return;
    this.value = '';
    UI.showToast('🎵 BPM解析中...', 3000);
    try {
      var buf = await Audio.loadBgm(file);
      if (!buf) { UI.showToast('⚠ 読み込み失敗'); return; }
      var detectedBpm = await Audio.detectBpm(buf);
      var bgmBtn = document.getElementById('btn-bgm');
      var bgmInd = document.getElementById('bgm-indicator');
      if (bgmBtn) {
        bgmBtn.classList.add('active');
        bgmBtn.style.animation = 'none';
        bgmBtn.style.transform = 'scale(1.3)';
        bgmBtn.style.transition = 'transform 0.3s cubic-bezier(.34,1.56,.64,1)';
        setTimeout(function() { bgmBtn.style.transform = ''; }, 50);
      }
      if (bgmInd) {
        bgmInd.textContent = '♪ BPM ' + detectedBpm;
        bgmInd.style.display = 'block';
      }
      UI.showToast('🎵 ' + file.name.slice(0, 20) + ' (BPM' + detectedBpm + ')', 3000);
    } catch (e) {
      console.warn('[BGM]', e);
      UI.showToast('⚠ 音声ファイルを読み込めませんでした');
    }
  });

  on('btn-mute', () => {
    const muted = !Audio.isMuted();
    Audio.setMuted(muted);
    const btn = document.getElementById('btn-mute');
    if (btn) btn.textContent = muted ? '🔇' : '🔊';
    UI.showToast(muted ? '🔇 ミュート' : '🔊 サウンドON');
  });

  const slider = document.getElementById('dbg-sensitivity');
  if (slider) {
    slider.addEventListener('input', function() {
      State.sensitivity = parseInt(this.value, 10);
      if (typeof Motion._overrideThreshold === 'function') Motion._overrideThreshold(State.sensitivity);
    });
  }
});

// ── デバッグパネル: シーン数変更 ────────────────
window._setClips = function(n) {
  CLIPS_NEEDED = n;
  [2, 4, 6].forEach(v => {
    const btn = document.getElementById('cb-' + v);
    if (btn) btn.classList.toggle('active', v === n);
  });
  // how-to-box のテキストも即時更新
  const htb = document.getElementById('how-to-clips');
  if (htb) htb.textContent = n + 'シーン';
  UI.showToast('シーン数: ' + n, 1500);
};

// ── デバッグパネル: 解像度選択ヘルパー ────────────
window._showQ = function(btn) {
  const parent = btn.parentElement;
  parent.querySelectorAll('button').forEach(b => {
    b.style.background   = 'rgba(0,212,255,0.1)';
    b.style.borderColor  = 'rgba(0,212,255,0.25)';
  });
  btn.style.background  = 'rgba(0,212,255,0.3)';
  btn.style.borderColor = 'var(--c)';
  UI.showToast('解像度: ' + Camera.getQuality(), 1500);
};

// ── PWA インストールプロンプト ────────────────────
// beforeinstallprompt をキャプチャして適切なタイミングで表示
let _deferredInstall = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstall = e;
  // 完成画面到達後にインストールボタンを表示
  const btn = document.getElementById('btn-install-pwa');
  if (btn) btn.style.display = 'inline-block';
  //console.log('[PWA] インストール可能');
});

window.addEventListener('appinstalled', () => {
  _deferredInstall = null;
  const btn = document.getElementById('btn-install-pwa');
  if (btn) btn.style.display = 'none';
  UI.showToast('📱 ホーム画面に追加しました！', 2500);
  _vibrate([30, 20, 30]);
});

// ── ページ終了時のリソース解放 ─────────────────────
window.addEventListener('pagehide', () => {
  _releaseWakeLock();
  Recorder.destroyAll();
  Camera.stop();
  Audio.stop();
});

// PWA インストールハンドラーは DOMContentLoaded(main) に統合済み
