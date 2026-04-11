/**
 * ui.js — v6 完全版
 * 追加: updateRemainingClips() — 残りクリップ数の視覚カウンタ
 * 追加: showFlipBtn() / hideFlipBtn() — カメラ切替ボタン制御
 * 修正: setHudStatus の opacity アニメーションが競合する問題
 * 修正: buildBpmVisualizer を showScreen('select') 前に安全に呼べるよう遅延
 * 修正: --font-display → --font-hd に統一（CSS変数名を合わせる）
 */

const UI = (() => {
  const $ = id => document.getElementById(id);

  // ── CSS変数でモード適用 ─────────────────────────
  function applyMode(mode) {
    const r = document.documentElement.style;
    r.setProperty('--c',       mode.color);
    r.setProperty('--accent',  mode.accent);
    r.setProperty('--bg',      mode.bg);
    r.setProperty('--beat-ms', Math.round(60000 / mode.bpm) + 'ms');
    const rgb = _hexToRgb(mode.color);
    if (rgb) r.setProperty('--c-rgb', rgb.r + ',' + rgb.g + ',' + rgb.b);
    document.body.style.background = mode.bg;
  }

  function _hexToRgb(hex) {
    const m = hex.replace('#', '').match(/.{2}/g);
    if (!m || m.length < 3) return null;
    return { r: parseInt(m[0], 16), g: parseInt(m[1], 16), b: parseInt(m[2], 16) };
  }

  // ── スクリーン切替 ─────────────────────────────
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.setAttribute('aria-hidden', 'true');
    });
    const el = $('screen-' + name);
    if (el) {
      el.classList.add('active');
      el.setAttribute('aria-hidden', 'false');
      // complete画面はスクロール位置をトップにリセット（2周目対応）
      if (name === 'complete') {
        el.scrollTop = 0;
        requestAnimationFrame(_resizeParticleCanvas);
      }
    }
  }

  function _resizeParticleCanvas() {
    const canvas = $('particle-canvas');
    const screen = $('screen-complete');
    if (!canvas || !screen) return;
    canvas.width  = screen.offsetWidth  || window.innerWidth;
    canvas.height = screen.offsetHeight || window.innerHeight;
  }

  // ── クリップサムネイル ─────────────────────────
  function buildClipRow(count) {
    const row = $('clips-row');
    if (!row) return;
    row.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const d = document.createElement('div');
      d.className = 'clip-thumb';
      d.id        = 'clip-' + i;
      d.innerHTML = '<div class="thumb-bar"></div><div class="thumb-num">' + (i + 1) + '</div>';
      row.appendChild(d);
    }
  }

  function markClipDone(i) {
    const el = $('clip-' + i);
    if (!el) return;
    el.classList.remove('current');
    el.classList.add('done');
    const n = el.querySelector('.thumb-num');
    if (n) {
      // チェックマーク → クリップ番号のアニメーション
      n.textContent = '✓';
      n.style.color = 'var(--c)';
      n.style.fontSize = '12px';
      _pulseTimeout(function() {
        n.textContent = 'C' + (i + 1);
        n.style.fontSize = '';
      }, 800);
    }
  }

  function markClipCurrent(i) {
    document.querySelectorAll('.clip-thumb').forEach(e => e.classList.remove('current'));
    const el = $('clip-' + i);
    if (el) el.classList.add('current');
  }

  // ── 残りクリップカウンタ ───────────────────────
  function updateRemainingClips(remaining, total) {
    let el = $('remaining-clips');
    if (!el) return;
    if (remaining <= 0 || remaining >= total) {
      el.style.opacity = '0';
      return;
    }
    el.style.opacity = '1';
    el.textContent   = 'あと ' + remaining + ' カット';
  }

  // ── カメラフリップボタン ───────────────────────
  let _flipCb = null;
  function showFlipBtn(callback) {
    let btn = $('btn-flip');
    if (!btn) return;
    _flipCb = callback;
    btn.style.display = 'flex';
  }
  function hideFlipBtn() {
    const btn = $('btn-flip');
    if (btn) btn.style.display = 'none';
  }

  // ── 中央コンテンツ ─────────────────────────────
  function setCenter(type, value) {
    const cc = $('center-content');
    if (!cc) return;
    _exitShutterMode();

    if (type === 'countdown') {
      // 初回のみ bg-arrow を生成（毎回生成するとanimationがrestartする）
      var existingArrow = cc.querySelector('.countdown-bg-arrow');
      var existingNum   = cc.querySelector('.countdown-num');
      if (existingArrow && existingNum) {
        // 2回目以降: カウント数字だけ更新（bg-arrowは再利用）
        existingNum.textContent = value;
        // animation を再トリガー（void offsetWidth で reflow を強制）
        existingNum.style.animation = 'none';
        void existingNum.offsetWidth;
        existingNum.style.animation = '';
      } else {
        // 初回: 両方生成
        var modeArrow = '';
        try {
          if (window.State && window.State.mode && window.State.mode.arrow) {
            modeArrow = window.State.mode.arrow;
          }
        } catch (_) {}
        cc.innerHTML =
          '<div class="countdown-bg-arrow" aria-hidden="true">' + modeArrow + '</div>' +
          '<div class="countdown-num">' + value + '</div>';
      }
    } else if (type === 'go') {
      // GO! でも bg-arrow を継続表示（countdown→recording の連続性）
      var goArrow = '';
      try {
        if (window.State && window.State.mode && window.State.mode.arrow) {
          goArrow = window.State.mode.arrow;
        }
      } catch (_) {}
      cc.innerHTML =
        '<div class="countdown-bg-arrow" aria-hidden="true">' + goArrow + '</div>' +
        '<div class="go-text">GO!</div>';
    } else if (type === 'arrow') {
      cc.innerHTML = '<div class="arrow-guide">' + value + '</div>';
    } else if (type === 'shutter') {
      cc.innerHTML = '<div class="shut-big">SHUT!</div><div class="shut-sub">スマホを振る</div>';
      _enterShutterMode();
    } else if (type === 'processing') {
      cc.innerHTML = '<div class="processing-dots"><span></span><span></span><span></span></div>';
    } else if (type === 'empty') {
      cc.innerHTML = '';
    }
  }

  function _enterShutterMode() {
    const ring = $('beat-ring');
    if (ring) ring.classList.add('shutter-glow');
    document.querySelectorAll('.corner').forEach(c => c.classList.add('expand'));
  }
  function _exitShutterMode() {
    const ring = $('beat-ring');
    if (ring) ring.classList.remove('shutter-glow');
    document.querySelectorAll('.corner').forEach(c => c.classList.remove('expand'));
  }

  function setGuideText(text, dim) {
    const el = $('vf-guide-text');
    if (!el) return;
    el.textContent = text;
    // dim=true: カウントダウン中は薄く表示（体で覚えるガイド）
    if (dim) {
      el.classList.add('dim');
    } else {
      el.classList.remove('dim');
    }
  }

  // HUD ステータス（opacity フェードイン、競合防止）
  let _hudFadeTimer = null;
  function setHudStatus(html) {
    const el = $('hud-status');
    if (!el) return;
    clearTimeout(_hudFadeTimer);
    el.style.transition = 'none';
    el.style.opacity    = '0';
    el.innerHTML = html;
    _hudFadeTimer = setTimeout(() => {
      el.style.transition = 'opacity 0.18s ease';
      el.style.opacity    = '1';
    }, 20);
  }

  // ── ビートパルス ───────────────────────────────
  var _pulseTimers = [];  // beatPulse の短命タイマー管理

  function _pulseTimeout(fn, ms) {
    var id = setTimeout(function() {
      _pulseTimers = _pulseTimers.filter(function(x) { return x !== id; });
      fn();
    }, ms);
    _pulseTimers.push(id);
  }

  function _clearPulseTimers() {
    _pulseTimers.forEach(clearTimeout);
    _pulseTimers = [];
  }

  function beatPulse(beatIdx) {
    const ring  = $('beat-ring');
    const arrow = document.querySelector('.arrow-guide');
    const cls   = (beatIdx === 0) ? 'pulse-strong' : 'pulse';
    const dur   = (beatIdx === 0) ? 145 : 115;

    if (ring) {
      ring.classList.add(cls);
      _pulseTimeout(() => ring.classList.remove(cls), dur);
    }
    if (arrow) {
      arrow.classList.add('pulse');
      _pulseTimeout(() => arrow.classList.remove('pulse'), 115);
    }

    // 録画バーの現在位置に最も近い拍マーカーを光らせる（キャッシュ済み配列を使用）
    if (_recStart !== null) {
      var markers = _cachedBeatMarkers;
      if (markers.length > 0) {
        // 最も近いマーカーを探す（進行率で判断）
        var fill = $('rec-bar-fill');
        if (fill) {
          var pct = parseFloat(fill.style.width) || 0;
          var closest = null, minDist = Infinity;
          markers.forEach(function(m) {
            var mPct = parseFloat(m.style.left) || 0;
            var dist = Math.abs(mPct - pct);
            if (dist < minDist) { minDist = dist; closest = m; }
          });
          if (closest && minDist < 8) {
            closest.classList.add('active');
            _pulseTimeout(function() { closest.classList.remove('active'); }, 200);
          }
        }
      }
    }

    _vizBeat();
  }

  // ── BPM ビジュアライザー ─────────────────────────
  const VIZ_N = 24;
  let _vizBars  = [];
  let _vizRaf   = null;
  let _vizPhase = 0;

  function buildBpmVisualizer(id, bpm) {
    const el = $(id);
    if (!el) return;
    _vizBars = [];
    el.innerHTML = '';
    for (let i = 0; i < VIZ_N; i++) {
      const b = document.createElement('div');
      b.className = 'bpm-bar';
      el.appendChild(b);
      _vizBars.push(b);
    }
    updateVizBpm(bpm, null);
    _vizIdleLoop();
  }

  function updateVizBpm(bpm, color) {
    if (bpm)   _vizBpm = bpm;
    if (color) _vizBars.forEach(b => { b.style.background = color; });
  }

  let _vizBpm = 85; // BPM連動アニメーション速度用

  function _vizIdleLoop() {
    stopViz();
    let last = 0;
    const tick = ts => {
      // BPM に応じてアニメーション速度を変える（間引き間隔を調整）
      const interval = Math.max(16, 50 - (_vizBpm - 85) * 0.2);
      if (ts - last > interval) {
        last = ts;
        // BPM に比例して位相進行を速める
        const speed = 0.025 + (_vizBpm / 85 - 1) * 0.02;
        _vizPhase += speed;
        _vizBars.forEach((b, i) => {
          const h = 13 + Math.sin(_vizPhase + i * 0.44) * 10 + Math.random() * 4;
          b.style.height  = h + '%';
          b.style.opacity = (0.18 + Math.sin(_vizPhase + i * 0.28) * 0.1).toFixed(2);
        });
      }
      _vizRaf = requestAnimationFrame(tick);
    };
    _vizRaf = requestAnimationFrame(tick);
  }

  function _vizBeat() {
    if (!_vizBars.length) return;

    // コンテナ全体にフラッシュ
    var container = document.getElementById('bpm-visualizer');
    if (container) {
      container.classList.remove('beat-flash');
      // forceReflow
      void container.offsetWidth;
      container.classList.add('beat-flash');
      _pulseTimeout(function() { container.classList.remove('beat-flash'); }, 200);
    }

    for (let k = 0; k < 5; k++) {
      const idx   = Math.floor(Math.random() * _vizBars.length);
      const bar   = _vizBars[idx];
      const delay = k * 14;
      _pulseTimeout(() => {
        bar.style.height  = (75 + Math.random() * 20) + '%';
        bar.style.opacity = '1';
        bar.classList.add('beat');
        _pulseTimeout(() => {
          bar.classList.remove('beat');
          bar.style.height  = (13 + Math.random() * 18) + '%';
          bar.style.opacity = '0.28';
        }, 130);
      }, delay);
    }
  }

  function stopViz() {
    if (_vizRaf) { cancelAnimationFrame(_vizRaf); _vizRaf = null; }
    _clearPulseTimers();  // beatPulse の残留タイマーをクリア
  }

  // ── 録画バー ───────────────────────────────────
  let _recRaf = null, _recStart = null, _recCb = null;
  let _cachedBeatMarkers = [];

  function startRecBar(duration, onComplete, bpm) {
    stopRecBar();
    const fill    = $('rec-bar-fill');
    const wrap    = $('rec-bar-wrap');
    const markers = $('rec-bar-markers');
    if (!fill || !wrap) { if (onComplete) onComplete(); return; }
    wrap.style.visibility = 'visible';
    fill.style.width      = '0%';
    fill.classList.remove('error');

    // 拍マーカーを生成（BPMから計算）
    if (markers && bpm) {
      markers.innerHTML = '';
      const beatSec  = 60 / bpm;
      const beatCount = Math.floor(duration / 1000 / beatSec);
      for (var bi = 1; bi < beatCount; bi++) {
        const pct = (bi / beatCount) * 100;
        const m   = document.createElement('div');
        m.className = 'rec-bar-beat-marker';
        m.style.left = pct + '%';
        // 強拍は少し目立たせる
        if (bi % 4 === 0) m.classList.add('strong');
        markers.appendChild(m);
      }
    }

    // 拍マーカーをキャッシュ（beatPulse で毎回 querySelectorAll を避ける）
    _cachedBeatMarkers = markers ? Array.from(markers.querySelectorAll('.rec-bar-beat-marker')) : [];

    _recStart = performance.now();
    _recCb    = onComplete;

    const tick = now => {
      const p = Math.min((now - _recStart) / duration, 1);
      fill.style.width = (p * 100) + '%';
      if (p < 1) { _recRaf = requestAnimationFrame(tick); }
      else       { _recRaf = null; if (_recCb) _recCb(); }
    };
    _recRaf = requestAnimationFrame(tick);
  }

  function stopRecBar() {
    if (_recRaf) { cancelAnimationFrame(_recRaf); _recRaf = null; }
    _recCb   = null;   // 古いコールバックの残留を防ぐ
    _recStart = null;  // beatPulse の _recStart !== null チェックをリセット
    const fill = $('rec-bar-fill');
    const wrap = $('rec-bar-wrap');
    if (fill) fill.style.width = '0%';
    if (wrap) wrap.style.visibility = 'hidden';
    // 拍マーカーをクリア
    const markers = $('rec-bar-markers');
    if (markers) markers.innerHTML = '';
  }

  // ── エフェクト ─────────────────────────────────
  function addFlash(grade) {
    const main = $('vf-main');
    if (!main) return;
    const el = document.createElement('div');
    el.className = 'flash-overlay';
    // グレードで色を変える
    const colors = {
      PERFECT: 'rgba(255,255,220,0.92)',
      GOOD:    'rgba(200,255,200,0.75)',
      OK:      'rgba(255,255,255,0.55)',
      MISS:    'rgba(255,60,60,0.35)',
    };
    el.style.background = colors[grade] || 'rgba(255,255,255,0.7)';
    main.appendChild(el);
    _pulseTimeout(() => { if (el.parentNode) el.remove(); }, grade === 'PERFECT' ? 500 : 350);
  }

  /**
   * タイミング評価ポップアップを表示
   * PERFECT/GOOD/OK/MISS + コンボ数
   */
  function showGradePopup(grade, combo) {
    const main = $('vf-main');
    if (!main) return;

    // 既存ポップアップを削除
    var existing = main.querySelectorAll('.grade-popup');
    existing.forEach(function(e) { e.remove(); });

    var el = document.createElement('div');
    el.className = 'grade-popup grade-' + grade.toLowerCase();

    // PERFECT のみ特別レイアウト（アイコン付き）
    var icon = { PERFECT: '🎯', GOOD: '✨', OK: '👌', MISS: '💨' }[grade] || '';
    el.innerHTML =
      '<div class="grade-icon">' + icon + '</div>' +
      '<div class="grade-text">' + grade + '</div>' +
      (combo >= 2 ? '<div class="combo-text">' + combo + ' COMBO!</div>' : '');
    main.appendChild(el);

    // PERFECT 時: ビートリングにゴールドバースト + 画面隅リップル
    if (grade === 'PERFECT') {
      var ring = $('beat-ring');
      if (ring) {
        ring.classList.add('perfect-burst');
        _pulseTimeout(function() { ring.classList.remove('perfect-burst'); }, 650);
      }
      // コーナーを金色にフラッシュ
      document.querySelectorAll('.corner').forEach(function(c) {
        c.classList.add('perfect-flash');
        _pulseTimeout(function() { c.classList.remove('perfect-flash'); }, 500);
      });
    }

    // MISS 時はシェイクアニメーション
    if (grade === 'MISS') {
      el.classList.add('grade-shake');
    }

    // 表示時間: PERFECT/GOOD は長め
    var dur = (grade === 'PERFECT' || grade === 'GOOD') ? 1100 : 850;
    _pulseTimeout(function() { if (el.parentNode) el.remove(); }, dur);
  }

  function addBlurSwipe(color, dir) {
    const main = $('vf-main');
    if (!main) return;
    const el = document.createElement('div');
    el.className = 'blur-swipe';

    // シュット方向に応じてグラデーション方向を変える
    // dir: {x, y, z} の加速度ベクトル
    var angle = '90deg'; // デフォルト: 左→右
    if (dir) {
      var absX = Math.abs(dir.x), absY = Math.abs(dir.y);
      if (absY > absX * 1.2) {
        // Y方向が優勢（上下スワイプ）
        angle = dir.y > 0 ? '180deg' : '0deg';
      } else if (absX > absY * 1.2) {
        // X方向が優勢（左右スワイプ）
        angle = dir.x > 0 ? '90deg' : '270deg';
      } else {
        // 斜め
        angle = dir.x > 0 ? '135deg' : '45deg';
      }
    }

    el.style.background =
      'linear-gradient(' + angle + ',transparent 0%,rgba(0,0,0,0.6) 25%,rgba(0,0,0,0.85) 55%,' + color + ' 100%)';
    main.appendChild(el);
    _pulseTimeout(() => { if (el.parentNode) el.remove(); }, 460);
  }

  // ── ダミー背景 ─────────────────────────────────
  function showDummyBackground() {
    if ($('vf-dummy-bg')) return;
    const main = $('vf-main');
    if (!main) return;
    const bg   = document.createElement('div');
    bg.id      = 'vf-dummy-bg';
    bg.className = 'vf-dummy-bg';
    const grid = document.createElement('div');
    grid.className = 'vf-grid';
    main.insertBefore(grid, main.firstChild);
    main.insertBefore(bg,   main.firstChild);
  }

  /** カメラプレビュー待ち中のヒントテキスト */
  function showCamPreviewHint() {
    const main = $('vf-main');
    if (!main) return;
    // 既存のヒントを削除
    const old = main.querySelector('.cam-preview-hint');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'cam-preview-hint';
    el.textContent = '構図を確認してください';
    main.appendChild(el);
    // アニメーション後に自動削除（_pulseTimers で管理）
    _pulseTimeout(() => { if (el.parentNode) el.remove(); }, 900);
  }

  function hideDummyBackground() {
    const bg = $('vf-dummy-bg');
    if (bg) bg.remove();
    document.querySelectorAll('.vf-grid').forEach(e => e.remove());
  }

  // ── 録画インジケーター ─────────────────────────
  function showRecIndicator(clipNum, total, bpm) {
    const el = $('rec-indicator');
    if (!el) return;
    el.innerHTML =
      '<span class="rec-dot"></span>CUT ' + clipNum + ' / ' + total;
    el.classList.add('show');
  }
  function hideRecIndicator() {
    const el = $('rec-indicator');
    if (el) el.classList.remove('show');
  }

  // ── 加速度ゲージ ───────────────────────────────
  function updateMotionGauge(mag, isWarn) {
    const fill = $('motion-gauge-fill');
    if (!fill) return;
    fill.style.height = Math.min(mag / 28 * 100, 100) + '%';
    fill.classList.toggle('over', isWarn);
  }

  // ── トースト ───────────────────────────────────
  let _toastTimer = null;
  function showToast(msg, ms) {
    ms = ms || 2200;
    let el = $('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast'; el.className = 'toast';
      el.setAttribute('role', 'status');  // アクセシビリティ
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    clearTimeout(_toastTimer);

    // すでに表示中なら一旦フェードアウトしてから内容を切り替える
    if (el.classList.contains('show')) {
      el.classList.remove('show');
      // 22ms 後（CSS トランジション中）にテキストを更新して再表示
      _toastTimer = setTimeout(() => {
        el.textContent = msg;
        el.classList.add('show');
        _toastTimer = setTimeout(() => el.classList.remove('show'), ms);
      }, 220);
    } else {
      el.textContent = msg;
      el.classList.add('show');
      _toastTimer = setTimeout(() => el.classList.remove('show'), ms);
    }
  }

  // ── パーティクル ───────────────────────────────
  // 動画プレビュー用 ObjectURL の追跡（リーク防止）
  let _previewBlobUrl = null;

  function _buildVideoPreview(blob, mode) {
    const container = $('video-preview-wrap');
    if (!container) return;

    // 既存の ObjectURL を解放
    _cleanupPreview();

    if (!blob) { container.style.display = 'none'; return; }

    container.innerHTML = '';
    const vid = document.createElement('video');
    // iOS Safari 対策: controls + playsinline の両方が必要
    // disablePictureInPicture で PiP ボタンを非表示
    // x-webkit-airplay で AirPlay ボタンを非表示
    vid.setAttribute('playsinline', '');
    vid.setAttribute('webkit-playsinline', '');
    vid.setAttribute('x-webkit-airplay', 'deny');
    vid.setAttribute('disablePictureInPicture', '');
    vid.controls   = true;
    vid.loop       = false; // 動画は1回再生のみ（ループしない）
    vid.muted      = false;  // 音ありで再生
    vid.style.cssText =
      'width:100%;max-width:260px;border-radius:10px;display:block;' +
      'border:1.5px solid ' + mode.color + ';' +
      'box-shadow:0 0 14px ' + mode.color + '55;background:#000;';

    // ObjectURL を作成して追跡
    _previewBlobUrl = URL.createObjectURL(blob);
    vid.src = _previewBlobUrl;
    vid.currentTime = 0;  // 2周目でも最初から再生

    // 再生ボタンオーバーレイ（autoplay 失敗時のFallback）
    const overlay = document.createElement('div');
    overlay.className = 'video-preview-overlay';
    overlay.innerHTML = '<div class="video-play-btn">▶</div>';
    overlay.addEventListener('click', () => {
      vid.play().catch(() => {});
      overlay.classList.add('hidden');
    });

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;width:100%;max-width:260px;';
    wrap.appendChild(vid);
    wrap.appendChild(overlay);

    container.appendChild(wrap);
    container.style.display = 'flex';
    container.style.justifyContent = 'center';

    // canplay を待ってから再生（autoplay ブロック対策）
    vid.addEventListener('canplay', () => {
      vid.play()
        .then(function() { overlay.classList.add('hidden'); })
        .catch(function() {
          // autoplay 失敗（iOS 等）→ video タップでも再生可能にする
          vid.addEventListener('click', function() {
            vid.play().catch(function() {});
            overlay.classList.add('hidden');
          }, { once: true });
        });
    }, { once: true });
  }

  /** プレビュー動画の ObjectURL を解放 */
  // ── シュット待機タイムアウト ──────────────────────
  let _shutterCdTimer  = null;   // タイムアウトタイマー
  let _shutterCdRaf    = null;   // 進捗バーRAF
  let _shutterCdCb     = null;   // タイムアウト時コールバック

  /** 8秒カウントダウンを開始。タイムアウトで cb を呼ぶ */
  function startShutterCountdown(seconds, cb) {
    cancelShutterCountdown();
    _shutterCdCb = cb;

    // 画面にタイムアウトバーを表示
    var bar = $('shutter-timeout-bar');
    if (bar) {
      bar.style.width     = '100%';
      bar.style.opacity   = '1';
      bar.style.transition = 'none';
    }

    var start = performance.now();
    var dur   = seconds * 1000;

    var tick = function(now) {
      var p = Math.min((now - start) / dur, 1);
      if (bar) {
        bar.style.transition = 'none';
        bar.style.width = (1 - p) * 100 + '%';
        // 残り2秒で赤くなる
        if (p > 0.75) {
          bar.style.background = '#FF2D78';
          bar.style.boxShadow  = '0 0 8px #FF2D78';
        }
      }
      if (p < 1) {
        _shutterCdRaf = requestAnimationFrame(tick);
      } else {
        _shutterCdRaf = null;
        if (bar) { bar.style.opacity = '0'; bar.style.background = ''; bar.style.boxShadow = ''; }
        if (_shutterCdCb) _shutterCdCb();
        _shutterCdCb = null;
      }
    };
    _shutterCdRaf = requestAnimationFrame(tick);
  }

  function cancelShutterCountdown() {
    if (_shutterCdRaf)   { cancelAnimationFrame(_shutterCdRaf); _shutterCdRaf = null; }
    if (_shutterCdTimer) { clearTimeout(_shutterCdTimer); _shutterCdTimer = null; }
    _shutterCdCb = null;
    var bar = $('shutter-timeout-bar');
    if (bar) { bar.style.opacity = '0'; bar.style.width = '100%'; bar.style.background = ''; bar.style.boxShadow = ''; }
  }

  // 完成画面の短命タイマー管理
  var _completeTimers = [];
  function _completeTimeout(fn, ms) {
    var id = setTimeout(function() {
      _completeTimers = _completeTimers.filter(function(x) { return x !== id; });
      fn();
    }, ms);
    _completeTimers.push(id);
    return id;
  }

  function _cleanupPreview() {
    // 完成画面の残留タイマーをキャンセル
    _completeTimers.forEach(clearTimeout);
    _completeTimers = [];
    const container = $('video-preview-wrap');
    if (container) {
      const vid = container.querySelector('video');
      if (vid) { vid.pause(); vid.src = ''; }
      container.innerHTML = '';
      container.style.display = 'none';
    }
    if (_previewBlobUrl) {
      URL.revokeObjectURL(_previewBlobUrl);
      _previewBlobUrl = null;
    }
  }

  let _particleRaf = null;   // キャンセル用RAFハンドル
  let _particleAlive = false; // 実行中フラグ

  function _runParticles(color) {
    // 前回のパーティクルを停止
    _particleAlive = false;
    if (_particleRaf) { cancelAnimationFrame(_particleRaf); _particleRaf = null; }

    const canvas = $('particle-canvas');
    if (!canvas) return;
    if (canvas.width < 10) _resizeParticleCanvas();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    const pts = Array.from({ length: 75 }, () => ({
      x: W * 0.5 + (Math.random() - 0.5) * 110,
      y: H * 0.42,
      vx: (Math.random() - 0.5) * 5.5,
      vy: -(Math.random() * 6 + 2.5),
      r:  Math.random() * 4 + 1.5,
      a:  1,
    }));

    _particleAlive = true;
    let frame = 0;
    const tick = () => {
      if (!_particleAlive) { ctx.clearRect(0, 0, W, H); return; }
      ctx.clearRect(0, 0, W, H);
      let alive = false;
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.a -= 0.016;
        if (p.a <= 0) return;
        alive = true;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = color + Math.round(p.a * 255).toString(16).padStart(2, '0');
        ctx.fill();
      });
      if (alive && frame++ < 200 && _particleAlive) {
        _particleRaf = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, W, H);
        _particleAlive = false;
        _particleRaf = null;
      }
    };
    _particleRaf = requestAnimationFrame(tick);
  }

  function _stopParticles() {
    _particleAlive = false;
    if (_particleRaf) { cancelAnimationFrame(_particleRaf); _particleRaf = null; }
    const canvas = $('particle-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // ── 完成画面 ───────────────────────────────────
  function buildCompleteScreen(mode, totalClips, previewBlob, shootTime, scoreData) {
    // 前回のスコアパネルをリセット（2周目対応）
    var prevPanel = $('score-panel');
    if (prevPanel) {
      prevPanel.innerHTML = '';
      prevPanel.style.display = 'none';
    }
    const strip = $('film-strip');
    if (strip) {
      strip.innerHTML = '';
      for (let i = 0; i < totalClips; i++) {
        const f = document.createElement('div');
        f.className = 'film-frame';
        f.style.borderColor = mode.color;
        f.style.boxShadow   = '0 0 14px ' + mode.color + '55';
        // クリップのグレード（スコアデータがある場合）
        var clipScore = (scoreData && scoreData.scores) ? scoreData.scores[i] : null;
        var clipGrade = clipScore ? clipScore.grade : null;
        var gradeIcon = { PERFECT: '🎯', GOOD: '✨', OK: '👌', MISS: '💨' };
        var innerHtml = '<div class="film-inner" style="background:' + mode.color + '"></div>';
        if (clipGrade) {
          var badgeIcon = clipScore.timeout ? '⏱' : (gradeIcon[clipGrade] || '');
          innerHtml += '<div class="film-grade-badge">' + badgeIcon + '</div>';
        }
        f.innerHTML = innerHtml;
        // タップでクリップのタイミング詳細を表示
        (function(clipIdx) {
          f.addEventListener('click', function() {
            if (scoreData && scoreData.scores && scoreData.scores[clipIdx]) {
              var s = scoreData.scores[clipIdx];
              var offStr = s.timeout ? 'タイムアウト'
                : (s.offset === null || s.offset === undefined) ? 'OK'
                : ((s.offset > 0 ? '+' : '') + Math.round(s.offset) + 'ms');
              showToast(s.grade + '  ' + offStr, 1800);
            }
          });
        })(i);
        strip.appendChild(f);
        _pulseTimeout(() => f.classList.add('show'), 60 + i * 90);
      }
    }
    // スコア称号・星表示
    const title = $('complete-title');
    if (title) {
      var titleText = (scoreData && scoreData.title) ? scoreData.title.title : 'VIDEO COMPLETE';
      // stars:0 → _makeStars(0) は空文字 → 録画なし・スコアなし時は星を表示しない
      var stars = (scoreData && scoreData.title) ? scoreData.title.stars : 0;
      // animation は .complete-title-text 側でかけることで span 競合を回避
      var titleCls = (titleText === 'FULL PERFECT!') ? 'complete-title-text full-perfect' : 'complete-title-text';
      var titleStyle = (titleText === 'FULL PERFECT!')
        ? '' // full-perfect クラスで色・shadow を管理
        : 'color:' + mode.color + ';text-shadow:0 0 24px ' + mode.color;
      // 長い称号はフォントサイズを縮小（折り返し防止）
      // FULL PERFECT! は full-perfect クラスで管理するため font-size 縮小不要
      // その他の長い称号（GREAT SHOT! 等）のみ縮小
      var needsFontSize = titleText.length > 10 && titleText !== 'FULL PERFECT!';
      var titleFontSize = needsFontSize ? 'font-size:22px;' : '';
      if (titleStyle) titleStyle = titleFontSize + titleStyle;
      else if (titleFontSize) titleStyle = titleFontSize.slice(0, -1);
      title.innerHTML =
        '<span class="' + titleCls + '"' + (titleStyle ? ' style="' + titleStyle + '"' : '') + '>' +
          titleText +
        '</span>' +
        (stars > 0 ? '<span class="complete-stars" style="display:block;margin-top:6px">' + _makeStars(stars) + '</span>' : '') +
      (scoreData && scoreData.isNewHi && stars > 0
        ? '<span class="new-best-badge">✨ NEW BEST!</span>'
        : (scoreData && scoreData.prevBest > 0 && !scoreData.isNewHi && stars > 0
          ? '<span class="prev-best-badge">前回: ' + '★'.repeat(scoreData.prevBest) + '</span>'
          : ''));
      // 親要素のインラインスタイルをリセット（旧来のCSSアニメーションと競合しないよう）
      title.style.color      = '';
      title.style.textShadow = '';
    }

    const meta = $('complete-meta');
    if (meta) {
      const hashtags = mode.hashtags || '#SHUT';
      const clipSec  = ((60000 / mode.bpm) * (mode.beatsPerClip || 6) / 1000).toFixed(1);
      const totalSec = (parseFloat(clipSec) * totalClips).toFixed(0);
      // タイムスタンプ
      let tsStr = '';
      if (shootTime instanceof Date) {
        // 日付 + 時刻を短く表示
        var mo = String(shootTime.getMonth() + 1).padStart(2, '0');
        var dd = String(shootTime.getDate()).padStart(2, '0');
        var hh = String(shootTime.getHours()).padStart(2, '0');
        var mm = String(shootTime.getMinutes()).padStart(2, '0');
        tsStr = mo + '/' + dd + '  ' + hh + ':' + mm;
      }
      meta.innerHTML =
        '<div class="complete-flavor">' + (mode.completeMsg || '') + '</div>' +
        '<div class="complete-stats">' +
        mode.label + ' RECIPE  ·  ' + totalClips + ' CUTS  ·  約' + totalSec + '秒' +
        (tsStr ? '  ·  ' + tsStr : '') +
        '</div>' +
        '<div class="complete-hashtags" title="タップでコピー">' + hashtags + '</div>';
      // ハッシュタグをタップでクリップボードへ
      _pulseTimeout(() => {
        const ht = meta.querySelector('.complete-hashtags');
        if (ht) {
          ht.addEventListener('click', async () => {
            const text = hashtags + '\n' + window.location.href;
            let ok = false;
            try {
              await navigator.clipboard.writeText(text);
              ok = true;
            } catch (_) {
              // execCommand フォールバック
              try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
                document.body.appendChild(ta);
                ta.select();
                ok = document.execCommand('copy');
                document.body.removeChild(ta);
              } catch (_2) {}
            }
            ht.textContent = ok ? 'コピーしました！' : 'コピー失敗';
            _pulseTimeout(() => { ht.textContent = hashtags; }, 2000);
          });
        }
      }, 200);
    }
    // スコア内訳パネル
    var scorePanel = $('score-panel');
    if (scorePanel && scoreData && scoreData.scores && scoreData.scores.length) {
      var sc    = scoreData.scores;
      var perfs  = sc.filter(function(s){ return s.grade === 'PERFECT'; }).length;
      var goods  = sc.filter(function(s){ return s.grade === 'GOOD'; }).length;
      var oks    = sc.filter(function(s){ return s.grade === 'OK'; }).length;
      var misses = sc.filter(function(s){ return s.grade === 'MISS'; }).length;
      // スコア行にstaggerアニメーション
      var rows = [
        '<div class="score-row" style="animation-delay:0.05s"><span class="grade-label perfect">PERFECT</span><span class="grade-count score-num" data-val="' + perfs + '">0</span></div>',
        '<div class="score-row" style="animation-delay:0.12s"><span class="grade-label good">GOOD</span><span class="grade-count score-num" data-val="' + goods + '">0</span></div>',
        '<div class="score-row" style="animation-delay:0.19s"><span class="grade-label ok">OK</span><span class="grade-count score-num" data-val="' + oks + '">0</span></div>',
      ];
      if (misses > 0) rows.push('<div class="score-row" style="animation-delay:0.26s"><span class="grade-label miss">MISS</span><span class="grade-count score-num" data-val="' + misses + '">0</span></div>');
      if (scoreData.maxCombo >= 2) rows.push('<div class="score-row combo-row" style="animation-delay:0.33s"><span>MAX COMBO</span><span class="grade-count score-num" data-val="' + scoreData.maxCombo + '">0</span></div>');
      // opacity:0 で空白を隠してから display:block → RAF(innerHTML) → opacity:1
      scorePanel.style.opacity = '0';
      scorePanel.style.display = 'block';
      requestAnimationFrame(function() {
        scorePanel.innerHTML = rows.join('');
        // さらに1フレーム待ってから opacity を戻す（animation-delay を正確に機能させる）
        requestAnimationFrame(function() {
          scorePanel.style.opacity = '';
        });
      });
      // タイミング分布バーを追加（ビートとのズレを視覚化）
      var timingDiv = document.createElement('div');
      timingDiv.className = 'timing-dist';
      var timingHtml = '<div class="timing-dist-label">TIMING</div><div class="timing-dist-bars">';
      sc.forEach(function(s, idx) {
        var off = s.offset !== null && s.offset !== undefined ? s.offset : 0;
        var pct = Math.max(4, Math.min(96, 50 + off / 7));
        var col = { PERFECT: '#FFE566', GOOD: '#66FF99', OK: 'rgba(255,255,255,0.4)', MISS: '#FF6666' }[s.grade] || '#fff';
        if (s.timeout) { pct = 50; col = 'rgba(255,255,255,0.15)'; }
        var delay = (idx * 80) + 'ms';
        timingHtml += '<div class="timing-dot" style="left:' + pct + '%;background:' + col + ';animation-delay:' + delay + '" title="' + (off > 0 ? '+' : '') + Math.round(off) + 'ms"></div>';
      });
      timingHtml += '</div>';
      timingDiv.innerHTML = timingHtml;
      _completeTimeout(function() { scorePanel.appendChild(timingDiv); }, 300);

      // タイミング詳細チャート（各クリップの早い/遅いを個別表示）
      var chartDiv = document.createElement('div');
      chartDiv.className = 'timing-detail-chart';
      var chartHtml = '';
      var offsets = [];
      sc.forEach(function(s, idx) {
        var off = s.offset !== null && s.offset !== undefined ? s.offset : 0;
        if (!s.timeout && s.offset !== null) offsets.push(off);
        var pct = Math.max(5, Math.min(95, 50 + off / 6));
        var col = { PERFECT: '#FFD700', GOOD: '#00D4FF', OK: '#FFA500', MISS: '#FF4040' }[s.grade] || '#fff';
        if (s.timeout) { pct = 50; col = 'rgba(255,255,255,0.15)'; }
        var gradeCol = col;
        chartHtml +=
          '<div class="timing-detail-row" style="animation-delay:' + (idx * 100 + 400) + 'ms">' +
            '<div class="timing-detail-label">C' + (idx + 1) + '</div>' +
            '<div class="timing-detail-bar">' +
              '<div class="timing-detail-center"></div>' +
              '<div class="timing-detail-marker" style="left:' + pct + '%;background:' + col + ';color:' + col + ';animation-delay:' + (idx * 100 + 500) + 'ms"></div>' +
            '</div>' +
            '<div class="timing-detail-grade" style="color:' + gradeCol + '">' + s.grade +
              (s.timeout ? '' : (s.offset !== null ? ' ' + (off > 0 ? '+' : '') + Math.round(off) + 'ms' : '')) +
            '</div>' +
          '</div>';
      });
      // サマリー行
      if (offsets.length > 0) {
        var avgOff = offsets.reduce(function(a,b){ return a+b; }, 0) / offsets.length;
        var absAvg = Math.abs(Math.round(avgOff));
        var hint = absAvg <= 15 ? '完璧なリズム' : (avgOff < 0 ? '少し早め' : '少し遅め');
        chartHtml += '<div class="timing-summary">平均ズレ: ' + (avgOff > 0 ? '+' : '') + Math.round(avgOff) + 'ms (' + hint + ')</div>';
      }
      chartDiv.innerHTML = chartHtml;
      _completeTimeout(function() { scorePanel.appendChild(chartDiv); }, 900);
      // カウントアップアニメーション
      _completeTimeout(function() {
        scorePanel.querySelectorAll('.score-num').forEach(function(el) {
          var target = parseInt(el.getAttribute('data-val'), 10);
          if (target === 0) { el.textContent = '0'; return; }
          var start = 0;
          var duration = 400;
          var startTime = performance.now();
          (function tick(now) {
            if (!_particleAlive && !scorePanel.offsetParent) return; // 画面遷移時にRAFを停止
            var progress = Math.min((now - startTime) / duration, 1);
            el.textContent = Math.round(start + (target - start) * progress);
            if (progress < 1) requestAnimationFrame(tick);
          })(performance.now());
        });
      }, 200);
    }

    // シェアボタンにモードカラーグローを適用
    const btnShare = document.getElementById('btn-share');
    if (btnShare) {
      btnShare.style.background = 'linear-gradient(135deg,' + mode.color + ',' + mode.accent + ')';
      btnShare.style.boxShadow  = '0 4px 24px ' + mode.color + '66';
    }

    // 動画プレビューはアクション直前に表示（保存ボタンと近い位置）
    // 少し遅らせてアニメーション後に挿入
    _completeTimeout(function() {
      _buildVideoPreview(previewBlob, mode);
    }, 200);

    // FULL PERFECT は金色パーティクル、それ以外はモードカラー
    var particleColor = (scoreData && scoreData.title && scoreData.title.title === 'FULL PERFECT!')
      ? '#FFE566' : mode.color;
    // showScreen 後 1フレーム待って canvas サイズ確定後にパーティクル発火
    requestAnimationFrame(() => requestAnimationFrame(() => _runParticles(particleColor)));
  }

  /** 星n個を文字列で返す。n=0の場合は空文字（スコアなし） */
  function _makeStars(n) {
    if (!n || n <= 0) return '';
    var s = '';
    for (var i = 0; i < 5; i++) {
      s += i < n ? '<span class="star filled">★</span>' : '<span class="star empty">☆</span>';
    }
    return s;
  }

  // ── モード選択 UI ──────────────────────────────
  function buildModeList(modes, onSelect, onHover, clips, lastModeId) {
    const list = $('mode-list');
    if (!list) return;
    list.innerHTML = '';
    modes.forEach(m => {
      const btn = document.createElement('button');
      btn.className = 'mode-btn';
      btn.style.setProperty('--mode-color', m.color);
      // BPMに対応したアニメーション周期をCSS変数で設定
      btn.style.setProperty('--mode-bpm-ms', Math.round(60000 / m.bpm) + 'ms');
      // modePulse用: モードカラーのアルファ付きRGBA（CSS変数で持つ）
      var rgb = _hexToRgb(m.color);
      if (rgb) {
        btn.style.setProperty('--mode-color-alpha', 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.12)');
        btn.style.setProperty('--mode-color-border', 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.25)');
      }
      const clipSec = ((60000 / m.bpm) * (m.beatsPerClip || 6) / 1000).toFixed(1);
      const totalSec = (parseFloat(clipSec) * (clips || 4)).toFixed(0);
      const isLast = lastModeId && m.id === lastModeId;
      // mode-last-badge はモード固有のカラーで表示（--c-rgb に依存しない）
      var lastBadgeHtml = isLast
        ? '<span class="mode-last-badge" style="color:' + m.color +
          ';background:' + m.color + '22;border-color:' + m.color + '55">▶ 前回</span>'
        : '';
      btn.innerHTML =
        '<span class="mode-emoji">'   + m.emoji + '</span>' +
        '<span class="mode-label" style="color:' + m.color + '">' + m.label + '</span>' +
        lastBadgeHtml +
        '<span class="mode-bpm">' + (m.recipeType || 'recipe').toUpperCase() + '</span>' +
        '<span class="mode-duration">約' + totalSec + '秒 / ' + (clips || 4) + 'カット</span>' +
        '<span class="mode-guide-preview">' + (m.recipeSummary || m.guide) + '</span>' +
        '<span class="mode-guide-preview">' + m.guide + '</span>';
      if (isLast) {
        btn.style.borderColor = m.color;
        btn.style.boxShadow   = '0 0 14px ' + m.color + '44';
        btn.style.background  = m.color + '0f'; // 6% opacity
      }

      let _down = false;
      btn.addEventListener('pointerenter', (e) => {
        // タッチデバイスではpointerenter+pointerdownが同時発火し二重音になるため除外
        if (e.pointerType === 'touch') return;
        if (onHover) onHover(m);
      });
      btn.addEventListener('pointerdown',  () => { _down = true; btn.classList.add('pressed'); });
      btn.addEventListener('pointerup',    () => {
        btn.classList.remove('pressed');
        if (!_down) return;  // pointerdown なしの pointerup は無視
        _down = false;
        onSelect(m);
      });
      btn.addEventListener('pointercancel',() => { _down = false; btn.classList.remove('pressed'); });
      btn.addEventListener('pointerleave', () => { _down = false; btn.classList.remove('pressed'); });
      list.appendChild(btn);
    });
    if (modes.length > 0) buildBpmVisualizer('bpm-visualizer', modes[0].bpm);

    // how-to-box の「Nカット」を動的に更新
    const htb = document.getElementById('how-to-clips');
    if (htb && clips) htb.textContent = clips + 'カット';
  }

  // フリップボタンのクリックリスナー登録（HTML側のボタンに後付け）
  document.addEventListener('DOMContentLoaded', () => {
    const btn = $('btn-flip');
    if (btn) {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (_flipCb) _flipCb();
      });
    }
  });

  return {
    applyMode, showScreen,
    buildClipRow, markClipDone, markClipCurrent,
    updateRemainingClips,
    showFlipBtn, hideFlipBtn,
    setCenter, setGuideText, setHudStatus,
    beatPulse, stopViz, updateVizBpm,
    startShutterCountdown, cancelShutterCountdown,
    clearPulseTimers: _clearPulseTimers,
    startRecBar, stopRecBar,
    addFlash, addBlurSwipe, showGradePopup,
    showCamPreviewHint, showDummyBackground, hideDummyBackground,
    showRecIndicator, hideRecIndicator,
    updateMotionGauge,
    showToast,
    buildCompleteScreen,
    cleanupPreview: _cleanupPreview,
    stopParticles: _stopParticles,
    buildModeList,
  };
})();
