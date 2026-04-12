/**
 * app.js — v7 完全版
 * 修正: _flipCamera() にフェーズガード（録画中は禁止）
 * 修正: splash → permission の遷移を showScreen() 統一
 * 修正: Recorder.pauseClip/resumeClip の実装呼び出しを確認済みに更新
 * 追加: ハプティクスフィードバック（振動）
 * 追加: クリップ数設定（CLIPS_NEEDED を 2/4/6 に変更可能）
 * 追加: Audio.playModeSelect() をモード選択時に鳴らす
 * 追加: 完成画面にハッシュタグテキスト生成
 */

const MODES = [
  {
    id: 'whip', label: 'WHIP', bpm: 96,
    color: '#00D4FF', accent: '#10B981', bg: '#020909',
    guide: 'PAN RIGHT FAST', arrow: '→', emoji: '⚡',
    completeMsg: 'WHIP PAN. 振るスピードと方向をそろえて場面をつなぐ。',
    hashtags: '#SHUT #WHIP #スマホ撮影 #映像で遊ぼう',
    beatsPerClip: 5,
    recipeType: 'transition',
    recipeSummary: '素早いパンのブレでカットA/Bをつなぐ',
    steps: [
      { guide: '被写体を正面に向けてカメラを止める', arrow: '•', hud: 'SCENE A  静止' },
      { guide: 'バーが埋まったら → に振る', arrow: '→', hud: '→ WHIP READY' },
      { guide: '右から始めて次の被写体を捉える', arrow: '→', hud: '→ SCENE B  捉える' },
      { guide: '被写体で止まる', arrow: '•', hud: 'SCENE B  静止' },
    ],
  },
  {
    id: 'cover', label: 'COVER', bpm: 88,
    color: '#22D3EE', accent: '#FF2D78', bg: '#001014',
    guide: 'COVER THE LENS', arrow: '■', emoji: '✋',
    completeMsg: 'HAND COVER. レンズを完全に暗くして、場所や衣装を一瞬で変える。',
    hashtags: '#SHUT #HANDCOVER #スマホ撮影 #トランジション',
    beatsPerClip: 5,
    recipeType: 'transition',
    recipeSummary: '手や物でレンズを隠して場面を切り替える',
    steps: [
      { guide: 'カットA。被写体を止めて見せる', arrow: '•', hud: 'A  被写体を見せる' },
      { guide: '手のひらでレンズを完全に塞ぐ', arrow: '■', hud: 'A COVER  真っ暗にする' },
      { guide: 'カットB。塞いだ状態から始める', arrow: '■', hud: 'B COVER  暗いまま始める' },
      { guide: '手をパッとどけて被写体を見せる', arrow: '✦', hud: 'B REVEAL  手をどける' },
    ],
  },
  {
    id: 'match', label: 'MATCH', bpm: 100,
    color: '#FF2D78', accent: '#FACC15', bg: '#120006',
    guide: 'MATCH THE MOTION', arrow: '↥', emoji: '🏃',
    completeMsg: 'MOTION MATCH. 被写体の位置とサイズをそろえて動作でつなぐ。',
    hashtags: '#SHUT #MOTIONMATCH #スマホ撮影 #videotips',
    beatsPerClip: 5,
    recipeType: 'action',
    recipeSummary: 'ジャンプや歩きなど同じ動きでカットを合わせる',
    steps: [
      { guide: 'カットA。被写体の位置とサイズを決める', arrow: '□', hud: 'A FRAME  位置合わせ' },
      { guide: 'ジャンプや指鳴らしの瞬間で切る', arrow: '↥', hud: 'A ACTION  動作で切る' },
      { guide: 'カットB。同じ位置とサイズから始める', arrow: '□', hud: 'B FRAME  同じ位置' },
      { guide: '同じ動作の続きを撮る', arrow: '↥', hud: 'B ACTION  続きを撮る' },
    ],
  },
  {
    id: 'wipe', label: 'WIPE', bpm: 92,
    color: '#FACC15', accent: '#10B981', bg: '#0b0900',
    guide: 'SLIDE BEHIND OBJECT', arrow: '▌→', emoji: '🚪',
    completeMsg: 'OBJECT WIPE. 柱や壁で画面を隠して、横移動で場面を変える。',
    hashtags: '#SHUT #OBJECTWIPE #スマホ撮影 #カメラワーク',
    beatsPerClip: 5,
    recipeType: 'foreground',
    recipeSummary: '柱や壁などの遮蔽物で画面を完全に隠す',
    steps: [
      { guide: 'カットA。柱や壁の横に構える', arrow: '▌', hud: 'A SET  遮蔽物' },
      { guide: 'カニ歩きで横移動し、画面を完全に隠す', arrow: '→', hud: 'A WIPE  隠す' },
      { guide: 'カットB。似た遮蔽物の裏から始める', arrow: '▌', hud: 'B SET  裏から' },
      { guide: '同じ方向へ横移動して景色を出す', arrow: '→', hud: 'B REVEAL  横へ抜ける' },
    ],
  },
];

// クリップ数（2/4/6 から選択可能、URL?clips=N で上書き）
let CLIPS_NEEDED = 4;

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
  // スコアシステム
  scores:      [],    // 各クリップのタイミング評価 {grade, offset}
  combo:       0,     // 連続GOOD以上の数
  maxCombo:    0,
  // 前クリップの振り方向（次クリップの入りに引き継ぐ）
  lastWhipDir: null,  // '→' | '←' | '↑' | '↓'
};

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
    // 録画中なら一時停止（データ破損防止）
    if (State.recEnabled && Recorder.isRecording()) {
      Recorder.pauseClip();
    }
  } else {
    // フォアグラウンド復帰 — iOS AudioContext の suspend 対策
    Audio.unlock();
    if (State.phase === 'recording' && State.mode) {
      if (State.recEnabled && Recorder.isPaused()) {
        // 一時停止中: resume してから録画を再開（stopClipでデータ消失しない）
        Recorder.resumeClip();
        Audio.start(State.mode.bpm, idx => UI.beatPulse(idx));
      } else if (State.recEnabled && !Recorder.isRecording()) {
        // 録画が完全に停止 → シャッター待機へ
        gotoShutter();
      } else {
        // 録画バーがまだ動いている → ビートだけ再開
        Audio.start(State.mode.bpm, idx => UI.beatPulse(idx));
      }
    }
    // シャッター待機中に戻ったならセンサーを再有効化
    if (State.phase === 'shutter') {
      Motion.setActive(true);
    }
  }
});

// ── 横向き警告 ────────────────────────────────────
function _checkOrientation() {
  const warn = document.getElementById('orientation-warn');
  if (!warn) return;
  const isLandscape = window.innerWidth > window.innerHeight;
  const inCamera = ['countdown', 'recording', 'shutter', 'executing', 'processing'].includes(State.phase);
  warn.style.display = (isLandscape && inCamera) ? 'flex' : 'none';
}
window.addEventListener('resize', _checkOrientation);

// ── フェーズ遷移 ─────────────────────────────────

function gotoSelect() {
  _clearTimers();
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
  UI.cleanupPreview();
  UI.stopParticles();
  if (typeof UI.clearPulseTimers === 'function') UI.clearPulseTimers();
  UI.updateRemainingClips(0, CLIPS_NEEDED);

  _resetBtn('btn-download');

  document.body.style.background = '#050505';
  document.documentElement.style.setProperty('--c',     '#00D4FF');
  document.documentElement.style.setProperty('--c-rgb', '0,212,255');
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

async function startMode(mode) {
  _clearTimers();
  State.mode       = mode;
  State.clips      = 0;
  State.recEnabled = false;

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
  UI.showScreen('camera');
  _checkOrientation();

  const camEl = document.getElementById('cam');
  const camOk = await Camera.start(camEl);

  // await 中にフェーズが変わった場合（Escape等）はここで中断
  if (State.mode !== mode) {
    Camera.stop();
    return;
  }

  if (!camOk) {
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
      State.recEnabled = await Recorder.setup(stream);
      if (State.recEnabled) UI.showToast('🔴 REC', 1500);
    } catch (e) {
      console.warn('[App] Recorder 失敗:', e);
    }
  }

  // カメラ映像が安定するまで少し待つ（0.8秒）
  // この間ユーザーは構図を確認できる
  UI.showCamPreviewHint();
  _T(gotoCountdown, 1500); // 構図確認のため十分な時間を確保
}

// カメラフリップ — 録画中・countdown中は禁止
async function _flipCamera() {
  const blocked = ['countdown', 'recording', 'executing', 'processing', 'shutter'].includes(State.phase);
  if (blocked) {
    UI.showToast('⚠ 撮影中はカメラを切り替えられません', 2000);
    return;
  }
  UI.showToast('📷 切替中...', 1200);
  _vibrate(15);
  const ok = await Camera.flip();
  if (!ok) { UI.showToast('⚠ カメラ切替に失敗しました'); return; }
  UI.showToast(Camera.isRear() ? '📷 リアカメラ' : '🤳 フロントカメラ', 1500);

  // Recorder の映像トラックを更新（オーディオは再利用）
  if (State.recEnabled) {
    const stream = Camera.getStream();
    if (stream) {
      State.recEnabled = await Recorder.setup(stream, { keepClips: true }).catch(() => false);
    }
  }
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

  // カウントダウン間隔をBPMに合わせる（1拍分）
  var countBeat = Math.round(60000 / (State.mode ? State.mode.bpm : 100));
  var countMs   = Math.max(450, Math.min(countBeat, 800)); // 450〜800ms（POPのビートに合わせて450に変更）

  let count = 3;
  var firstStep = _getRecipeStep(0);
  UI.setCenter('countdown', count);
  // カウントダウン中: レシピガイドを薄く表示（録画前に動きを体で覚える）
  UI.setGuideText(firstStep ? firstStep.guide : (State.mode ? State.mode.guide : ''), true);  // true=dim
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
  _checkOrientation();

  const m   = State.mode;
  const dur = (60000 / m.bpm) * (m.beatsPerClip || 6);
  const step = _getRecipeStep(State.clips);

  // 最初のクリップ開始時にREC枠フラッシュ
  if (State.clips === 0) {
    var vfMain = document.getElementById('vf-main');
    if (vfMain) {
      vfMain.classList.add('rec-flash');
      setTimeout(function() { vfMain.classList.remove('rec-flash'); }, 700);
    }
  }

  // WHIPモード: 動的ガイド（前クリップの振り方向から入る）
  if (m.id === 'whip') {
    if (State.clips === 0) {
      step = { guide: '被写体を正面に止めて映す', arrow: '•', hud: 'SCENE A  静止' };
    } else {
      var _enterDir = State.lastWhipDir || '→';
      step = {
        guide: _enterDir + ' から入り、被写体を止める',
        arrow: _enterDir,
        hud: _enterDir + ' IN → 静止',
      };
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
    if (State.clips === 0) {
      Recorder.startClip();
    } else {
      Recorder.resumeClip();
    }
  }
  // 実際の録画解像度を1.5秒表示
  if (State.clips === 0 && Camera.isActive()) {
    const s = Camera.getActualSettings();
    if (s && s.width) {
      _T(() => UI.showToast('📹 ' + s.width + 'x' + s.height, 2000), 300);
    }
  }
  UI.startRecBar(dur, () => { gotoShutter(); }, m.bpm);
}

function gotoShutter() {
  _clearTimers();
  State.phase = 'shutter';
  // freezeForTiming() で _nextBeat/_bpm を保持してタイミング評価を正確にする
  Audio.freezeForTiming();
  UI.stopRecBar();
  UI.hideRecIndicator();
  UI.cancelShutterCountdown();

  // 録画を一時停止（stop ではなく pause → gotoComplete で1回だけ stop）
  if (State.recEnabled && Recorder.isRecording()) {
    Recorder.pauseClip();
  }

  // WHIPモード: 好きな方向に振れる（4方向表示）
  // その他のモード: レシピ指定方向
  if (State.mode && State.mode.id === 'whip') {
    UI.setCenter('shutter', 'any');
    UI.setGuideText('好きな方向に素早く振る', false);
    UI.setHudStatus('📳 &nbsp;<strong>↑↓←→ WHIP!</strong>');
  } else {
    var _shutStep  = _getRecipeStep(State.clips);
    var _shutArrow = (_shutStep && _shutStep.arrow && _shutStep.arrow !== '•')
      ? _shutStep.arrow
      : (State.mode ? State.mode.arrow : '→');
    UI.setCenter('shutter', _shutArrow);
    UI.setGuideText(_shutArrow + '  この方向に素早く振る', false);
    UI.setHudStatus('📳 &nbsp;<strong>' + _shutArrow + ' WHIP!</strong>');
  }
  UI.updateRemainingClips(CLIPS_NEEDED - State.clips, CLIPS_NEEDED);
  _vibrate(15);

  Motion.setActive(true);
  Motion.resetCooldown();

  // シュット待機タイムアウト（8秒で自動的に次クリップへ）
  UI.startShutterCountdown(8, () => {
    // タイムアウト時: MISS表示 + 警告音 → 録画に戻る
    if (State.phase !== 'shutter') return;
    State.scores.push({ grade: 'MISS', offset: null, timeout: true });
    if (State.combo > 0) State.combo = 0;
    UI.showGradePopup('MISS', 0);
    Audio.playWarning();
    _vibrate([20, 20, 20]);
    _T(gotoRecording, 600);
  });
}

function executeShut() {
  if (State.phase !== 'shutter') return;
  State.phase = 'executing';
  Motion.setActive(false);
  UI.cancelShutterCountdown();

  // ── タイミング評価 ──────────────────────────────
  const offset = Audio.getTimingOffset(); // ビートとのズレ(ms)
  const grade  = _calcGrade(offset);
  State.scores.push({ grade: grade, offset: offset });

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

  UI.markClipDone(State.clips);
  State.clips++;

  if (State.clips >= CLIPS_NEEDED) {
    _T(gotoComplete, 480);
  } else {
    // BPM に合わせた間隔（1拍分）でリズムを維持
    var beatMs = Math.round(60000 / (State.mode ? State.mode.bpm : 100));
    var transMs = Math.min(beatMs, 550);
    // 次クリップ番号を一瞬だけ HUD に表示してリズムを保持
    UI.setHudStatus(
      '<span style="letter-spacing:0.2em;opacity:0.7">CLIP ' +
      (State.clips + 1) + ' / ' + CLIPS_NEEDED + '</span>'
    );
    _T(gotoRecording, transMs);
  }
}

function _getRecipeStep(index) {
  if (!State.mode || !State.mode.steps || State.mode.steps.length === 0) return null;
  return State.mode.steps[index % State.mode.steps.length];
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

/** 全クリップの評価から称号を決定 */
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
  State.phase = 'complete';
  Motion.setActive(false);
  Audio.stop();  // 完成後は freeze 状態も含めてリセット
  Camera.stop();
  UI.hideFlipBtn();
  UI.updateRemainingClips(0, CLIPS_NEEDED);
  _checkOrientation();

  // 1本の連続録画を停止してBlobを取得
  if (State.recEnabled && (Recorder.isRecording() || Recorder.isPaused())) {
    UI.setHudStatus('<span class="processing-hud">● 保存中...</span>');
    const saveTimeout = new Promise(res => setTimeout(res, 5000));
    await Promise.race([Recorder.stopClip(), saveTimeout]);
  }

  Audio.playComplete();
  _vibrate([40, 20, 40, 20, 80]);

  // 録画データを取得しキャッシュ（btn-share でも再利用）
  const _finalBlob = State.recEnabled ? Recorder.getFinalBlob() : null;
  State._cachedBlob = _finalBlob;
  const _shootTime  = new Date();
  const _scoreTitle = _calcTitle(State.scores);

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
    scores:   State.scores,
    title:    _scoreTitle,
    maxCombo: State.maxCombo,
    prevBest: _hiPrev,
    isNewHi:  _isNewHi,
  });
  UI.showScreen('complete');

  // FULL PERFECT の場合は特別な演出
  // FULL PERFECT: 全クリップで評価済みかつ全PERFECT
  if (_scoreTitle && _scoreTitle.title === 'FULL PERFECT!' && State.scores.length >= CLIPS_NEEDED) {
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

  on('btn-share', async () => {
    _vibrate(15);
    const blob   = State._cachedBlob || null;
    const result = await Share.shareOrDownload(blob, {
      label:    State.mode ? State.mode.label    : 'WHIP',
      bpm:      State.mode ? State.mode.bpm      : 85,
      hashtags: State.mode ? State.mode.hashtags : '#SHUT',
    });
    if (result === 'downloaded') UI.showToast('⬇ 保存しました！');
    if (result === 'shared')     UI.showToast('📤 シェアしました！');
    if (result === 'cancelled')  UI.showToast('キャンセルしました');
  });

  on('btn-copy-url', async () => {
    const ok = await Share.copyUrl();
    UI.showToast(ok ? '🔗 URLをコピーしました' : 'コピーに失敗しました');
    _vibrate(10);
  });

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

// ── デバッグパネル: クリップ数変更 ──────────────
window._setClips = function(n) {
  CLIPS_NEEDED = n;
  [2, 4, 6].forEach(v => {
    const btn = document.getElementById('cb-' + v);
    if (btn) btn.classList.toggle('active', v === n);
  });
  // how-to-box のテキストも即時更新
  const htb = document.getElementById('how-to-clips');
  if (htb) htb.textContent = n + 'カット';
  UI.showToast('クリップ数: ' + n, 1500);
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
  Recorder.destroyAll();
  Camera.stop();
  Audio.stop();
});

// PWA インストールハンドラーは DOMContentLoaded(main) に統合済み
