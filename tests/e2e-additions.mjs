import fs from 'node:fs';

const debugPort = Number(process.env.SHUT_CDP_PORT || 9335);
const baseUrl = process.argv[2] || 'http://127.0.0.1:8003';
const existingTargets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r => r.json());
await Promise.all(existingTargets
  .filter(item => item.type === 'page' && item.url.startsWith(baseUrl))
  .map(item => fetch(`http://127.0.0.1:${debugPort}/json/close/${item.id}`).catch(() => null)));
await new Promise(resolve => setTimeout(resolve, 400));
const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const consoleErrors = [];

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const handlers = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handlers.reject(new Error(message.error.message));
    else handlers.resolve(message.result || {});
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(message.params.exceptionDetails?.text || 'Runtime exception');
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(message.params.args.map(arg => arg.value || arg.description || '').join(' '));
  }
});

function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 15000);
    pending.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
  });
}

process.on('unhandledRejection', async error => {
  console.error(error);
  try { ws.close(); } catch (_) {}
  try { await fetch(`http://127.0.0.1:${debugPort}/json/close/${target.id}`); } catch (_) {}
  process.exit(1);
});
process.on('uncaughtException', async error => {
  console.error(error);
  try { ws.close(); } catch (_) {}
  try { await fetch(`http://127.0.0.1:${debugPort}/json/close/${target.id}`); } catch (_) {}
  process.exit(1);
});

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Evaluation failed');
  return result.result?.value;
}

async function waitFor(expression, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(expression)) return Date.now() - start;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout: ${expression}`);
}

function assert(value, message) {
  if (!value) throw new Error(`Assertion failed: ${message}`);
}

await Promise.all([
  send('Page.enable'),
  send('Page.bringToFront'),
  send('Runtime.enable'),
  send('Network.enable'),
  send('Network.setBypassServiceWorker', { bypass: true }),
  send('Emulation.setFocusEmulationEnabled', { enabled: true }),
  send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  }),
]);

await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    localStorage.setItem('shut_onboarded', '1');
    localStorage.setItem('shut_shoot_flow', 'travel');
    localStorage.setItem('shut_capture_audio', 'on');
    localStorage.setItem('shut_composition_grid', 'off');
    window.__wakeTest = { requested: 0, released: 0 };
    window.__copiedDiagnostics = '';

    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          window.__wakeTest.requested += 1;
          const listeners = [];
          return {
            addEventListener: (type, listener) => { if (type === 'release') listeners.push(listener); },
            release: async () => {
              window.__wakeTest.released += 1;
              listeners.forEach(listener => listener());
            },
          };
        },
      },
    });

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => { window.__copiedDiagnostics = text; } },
    });

    window.__permissionStates = { camera: 'granted', microphone: 'granted' };
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: async ({ name }) => ({
          state: window.__permissionStates[name] || 'prompt',
        }),
      },
    });

    (() => {
      let sourceCanvas;
      let sourceStream;
      let audioContext;
      let audioStream;
      function makeVideoStream() {
        if (sourceStream && sourceStream.getVideoTracks().some(track => track.readyState === 'live')) return sourceStream;
        sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = 720;
        sourceCanvas.height = 1280;
        const ctx = sourceCanvas.getContext('2d');
        let frame = 0;
        function draw() {
          frame += 1;
          ctx.fillStyle = '#173b37';
          ctx.fillRect(0, 0, 720, 1280);
          ctx.fillStyle = '#d8cb57';
          ctx.fillRect(80 + (frame % 120), 240, 250, 560);
          ctx.fillStyle = '#e35a48';
          ctx.beginPath();
          ctx.arc(490, 470, 115, 0, Math.PI * 2);
          ctx.fill();
          requestAnimationFrame(draw);
        }
        draw();
        sourceStream = sourceCanvas.captureStream(30);
        return sourceStream;
      }
      function makeAudioStream() {
        if (audioStream && audioStream.getAudioTracks().some(track => track.readyState === 'live')) return audioStream;
        audioContext = new AudioContext();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const destination = audioContext.createMediaStreamDestination();
        gain.gain.value = 0.01;
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        audioStream = destination.stream;
        return audioStream;
      }
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async constraints => constraints && constraints.video
          ? makeVideoStream()
          : constraints && constraints.audio
            ? makeAudioStream()
            : new MediaStream(),
      });
    })();
  `,
});

await send('Page.navigate', { url: `${baseUrl}/` });
await waitFor(`window.State && State.phase === 'select'`, 10000);
await waitFor(`document.getElementById('device-check').dataset.state === 'ready'`, 3000);

const initial = await evaluate(`({
  flow: State.shootFlow,
  captureAudio: State.captureAudio,
  compositionGrid: State.compositionGrid,
  audioActive: document.querySelector('.capture-audio-btn.active').dataset.captureAudio,
  viewport: [innerWidth, innerHeight],
  deviceCheck: {
    state: document.getElementById('device-check').dataset.state,
    result: document.getElementById('device-check-result').textContent,
    items: document.querySelectorAll('.device-check-item').length,
  },
})`);
assert(initial.flow === 'travel', 'travel should be restored');
assert(initial.captureAudio === true && initial.audioActive === 'on', 'audio on should be restored');
assert(initial.compositionGrid === false, 'composition grid should be restored');
assert(initial.deviceCheck.state === 'ready' && initial.deviceCheck.result === '撮影準備OK', 'device check ready');
assert(initial.deviceCheck.items === 7, 'device check items');

await evaluate(`window.__permissionStates.camera = 'denied'; _refreshDeviceCheck()`);
await waitFor(`document.getElementById('device-check').dataset.state === 'blocked'`, 3000);
const deviceCheckBlocked = await evaluate(`({
  result: document.getElementById('device-check-result').textContent,
  camera: [...document.querySelectorAll('.device-check-item')].find(item =>
    item.querySelector('.device-check-item-name')?.textContent === 'カメラ'
  )?.textContent || '',
})`);
assert(deviceCheckBlocked.result === '設定を確認' && deviceCheckBlocked.camera.includes('要設定'), 'blocked camera permission');
await evaluate(`window.__permissionStates.camera = 'granted'; _refreshDeviceCheck()`);
await waitFor(`document.getElementById('device-check').dataset.state === 'ready'`, 3000);

await evaluate(`document.getElementById('btn-device-check').click()`);
const deviceCheck = await evaluate(`({
  expanded: document.getElementById('btn-device-check').getAttribute('aria-expanded'),
  hidden: document.getElementById('device-check-details').hidden,
  format: [...document.querySelectorAll('.device-check-item')].find(item => item.textContent.includes('動画録画'))?.textContent || '',
})`);
assert(deviceCheck.expanded === 'true' && deviceCheck.hidden === false, 'device check disclosure');
assert(deviceCheck.format.includes('WebM') || deviceCheck.format.includes('MP4'), 'device check recording format');
await new Promise(resolve => setTimeout(resolve, 500));
const deviceCheckScreenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
fs.writeFileSync('/tmp/shut-additions-device-check.png', Buffer.from(deviceCheckScreenshot.data, 'base64'));
await evaluate(`document.getElementById('btn-device-check').click()`);

await evaluate(`startMode(MODES.find(mode => mode.id === 'cover'))`);
await waitFor(`State.phase === 'preview'`, 3000);
await evaluate(`document.getElementById('btn-grid-guide').click()`);
await waitFor(`getComputedStyle(document.getElementById('composition-grid')).opacity === '1'`, 2000);
const compositionGrid = await evaluate(`({
  enabled: State.compositionGrid,
  stored: localStorage.getItem('shut_composition_grid'),
  active: document.getElementById('btn-grid-guide').classList.contains('active'),
  pressed: document.getElementById('btn-grid-guide').getAttribute('aria-pressed'),
  visible: getComputedStyle(document.getElementById('composition-grid')).opacity,
})`);
assert(compositionGrid.enabled && compositionGrid.stored === 'on', 'composition grid setting');
assert(compositionGrid.active && compositionGrid.pressed === 'true' && compositionGrid.visible === '1', 'composition grid UI');
const compositionGridScreenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
fs.writeFileSync('/tmp/shut-additions-composition-grid.png', Buffer.from(compositionGridScreenshot.data, 'base64'));
await evaluate(`document.getElementById('btn-flip').click()`);
await waitFor(`State.phase === 'preview' && Camera.isRear() === false`, 5000);
const cameraFlipped = await evaluate(`({
  phase: State.phase,
  facing: Camera.getFacingMode(),
  recorderReady: State.recEnabled,
  recorderAudio: Recorder.hasAudio(),
  flipVisible: getComputedStyle(document.getElementById('btn-flip')).display !== 'none',
})`);
assert(cameraFlipped.phase === 'preview' && cameraFlipped.facing === 'user', 'camera must flip during preview');
assert(cameraFlipped.recorderReady && cameraFlipped.recorderAudio && cameraFlipped.flipVisible, 'recorder, audio and flip control must remain ready after flip');
await waitFor(`State.phase === 'recording'`, 12000);
const audioOnRecording = await evaluate(`({
  captureAudio: State.captureAudio,
  recorderAudio: Recorder.hasAudio(),
})`);
assert(audioOnRecording.captureAudio && audioOnRecording.recorderAudio, 'audio track must be included');
await evaluate(`gotoSelect()`);
await waitFor(`State.phase === 'select'`, 4000);

await evaluate(`document.querySelector('[data-capture-audio="off"]').click()`);
const audioOff = await evaluate(`({
  captureAudio: State.captureAudio,
  stored: localStorage.getItem('shut_capture_audio'),
  active: document.querySelector('.capture-audio-btn.active').dataset.captureAudio,
})`);
assert(audioOff.captureAudio === false && audioOff.stored === 'off' && audioOff.active === 'off', 'audio off selection');
await waitFor(`[...document.querySelectorAll('.device-check-item')].some(item => item.textContent.includes('収録音声') && item.textContent.includes('OFF'))`, 3000);

await new Promise(resolve => setTimeout(resolve, 400));
const selectScreenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
fs.writeFileSync('/tmp/shut-additions-select.png', Buffer.from(selectScreenshot.data, 'base64'));

await evaluate(`startMode(MODES.find(mode => mode.id === 'cover'))`);
await waitFor(`State.phase === 'preview'`, 3000);
const previewInterrupted = await evaluate(`(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  document.dispatchEvent(new Event('visibilitychange'));
  return { phase: State.phase, interruptedPhase: State.interruptedPhase };
})()`);
assert(previewInterrupted.phase === 'interrupted' && previewInterrupted.interruptedPhase === 'preview', 'camera preview must pause before countdown');
await evaluate(`document.getElementById('btn-next-scene').click()`);
await waitFor(`State.phase === 'recording'`, 12000);
const recording = await evaluate(`({
  recorderAudio: Recorder.hasAudio(),
  wakeRequested: window.__wakeTest.requested,
})`);
assert(recording.recorderAudio === false, 'audio track must be disabled');
assert(recording.wakeRequested >= 1, 'wake lock must be requested');

await new Promise(resolve => setTimeout(resolve, 500));
const interrupted = await evaluate(`(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  document.dispatchEvent(new Event('visibilitychange'));
  return {
    phase: State.phase,
    interruptedPhase: State.interruptedPhase,
    paused: Recorder.isPaused(),
    remainingMs: State.resumeDurationMs,
    overlayVisible: document.getElementById('shot-prepare-overlay').classList.contains('show'),
  };
})()`);
assert(interrupted.phase === 'interrupted' && interrupted.interruptedPhase === 'recording', 'recording must enter interrupted phase');
assert(interrupted.paused && interrupted.remainingMs >= 500, 'recording and remaining duration must be paused');
assert(interrupted.overlayVisible, 'interruption confirmation must be visible');

await new Promise(resolve => setTimeout(resolve, 400));
const interruptedScreenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
fs.writeFileSync('/tmp/shut-additions-interrupted.png', Buffer.from(interruptedScreenshot.data, 'base64'));

await new Promise(resolve => setTimeout(resolve, 900));
const noAutoResume = await evaluate(`({ phase: State.phase, paused: Recorder.isPaused() })`);
assert(noAutoResume.phase === 'interrupted' && noAutoResume.paused, 'recording must not auto resume while hidden');

const returned = await evaluate(`(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  document.dispatchEvent(new Event('visibilitychange'));
  return { phase: State.phase, paused: Recorder.isPaused() };
})()`);
assert(returned.phase === 'interrupted' && returned.paused, 'returning to foreground must still wait for confirmation');

await evaluate(`document.getElementById('btn-next-scene').click()`);
await waitFor(`State.phase === 'recording'`, 8000);
const resumed = await evaluate(`({
  phase: State.phase,
  paused: Recorder.isPaused(),
  durationMs: State.recordingDurationMs,
  logged: Diagnostics.getEntries().some(entry => entry.code === 'capture_resumed'),
})`);
assert(resumed.phase === 'recording' && !resumed.paused, 'recording must resume after explicit confirmation');
assert(resumed.durationMs < 3200 && resumed.logged, 'recording must resume with remaining duration and log the event');

await waitFor(`State.phase === 'shutter'`, 12000);
await evaluate(`executeShut()`);
await waitFor(`State.phase === 'prepare'`, 4000);
const firstPrepare = await evaluate(`({
  phase: State.phase,
  stateText: document.getElementById('shot-recording-state-text').textContent,
  checkFrameReady: document.getElementById('shot-prepare-frame-img').src.startsWith('data:image/jpeg'),
  retakeVisible: document.getElementById('btn-retake-scene').offsetParent !== null,
})`);
assert(firstPrepare.stateText.includes('録画停止中'), 'paused state must be visible');
assert(firstPrepare.checkFrameReady, 'scene A check frame');
assert(firstPrepare.retakeVisible, 'retake button must be visible');

await new Promise(resolve => setTimeout(resolve, 400));
const prepareScreenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
fs.writeFileSync('/tmp/shut-additions-prepare.png', Buffer.from(prepareScreenshot.data, 'base64'));

await evaluate(`document.getElementById('btn-retake-scene').click()`);
await waitFor(`State.phase === 'recording' && State.clips === 0`, 14000);
await waitFor(`State.phase === 'shutter'`, 12000);
await evaluate(`executeShut()`);
await waitFor(`State.phase === 'prepare'`, 4000);
const retakeLogged = await evaluate(`Diagnostics.getEntries().some(entry => entry.code === 'scene_a_retake')`);
assert(retakeLogged, 'retake event must be logged');

await evaluate(`document.getElementById('btn-next-scene').click()`);
await waitFor(`State.phase === 'recording'`, 8000);
await waitFor(`State.phase === 'final-review'`, 20000);
const finalReview = await evaluate(`({
  phase: State.phase,
  paused: Recorder.isPaused(),
  frameLabel: document.getElementById('shot-prepare-frame-label').textContent,
  checkFrameReady: document.getElementById('shot-prepare-frame-img').src.startsWith('data:image/jpeg'),
  confirmLabel: document.getElementById('btn-next-scene').textContent,
  retakeLabel: document.getElementById('btn-retake-scene').textContent,
  logged: Diagnostics.getEntries().some(entry => entry.code === 'final_review_shown'),
})`);
assert(finalReview.paused, 'recording must pause during final review');
assert(finalReview.frameLabel === 'SCENE B CHECK' && finalReview.checkFrameReady, 'scene B check frame');
assert(finalReview.confirmLabel === 'この動画で完成', 'final review confirmation');
assert(finalReview.retakeLabel === '最初から撮り直す', 'final review restart option');
assert(finalReview.logged, 'final review event must be logged');

await new Promise(resolve => setTimeout(resolve, 400));
const finalReviewScreenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
fs.writeFileSync('/tmp/shut-additions-final-review.png', Buffer.from(finalReviewScreenshot.data, 'base64'));

await evaluate(`document.getElementById('btn-next-scene').click()`);
await waitFor(`State.phase === 'complete'`, 20000);
await waitFor(`document.getElementById('video-preview-wrap').style.display === 'flex'`, 4000);
await new Promise(resolve => setTimeout(resolve, 300));

const completed = await evaluate(`({
  blobSize: State._cachedBlob ? State._cachedBlob.size : 0,
  previewVisible: document.getElementById('video-preview-wrap').style.display === 'flex',
  sceneChecks: document.querySelectorAll('.scene-check-item').length,
  frames: State.sceneFrames.length,
  wakeReleased: window.__wakeTest.released,
  completeLogged: Diagnostics.getEntries().some(entry => entry.code === 'recording_complete'),
})`);
assert(completed.blobSize > 0 && completed.previewVisible, 'video preview must be generated');
assert(completed.sceneChecks === 2 && completed.frames === 2, 'two scene check frames');
assert(completed.wakeReleased >= 1, 'wake lock must be released');
assert(completed.completeLogged, 'completion event must be logged');

await evaluate(`document.getElementById('btn-copy-diagnostics').click()`);
await waitFor(`window.__copiedDiagnostics.includes('SHUT')`, 3000);
const diagnosticsCopied = await evaluate(`window.__copiedDiagnostics.includes('scene_a_retake')`);
assert(diagnosticsCopied, 'diagnostic report must be copied');

const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
fs.writeFileSync('/tmp/shut-additions-complete.png', Buffer.from(screenshot.data, 'base64'));

await evaluate(`gotoSelect(); document.querySelector('[data-shoot-flow="continuous"]').click()`);
await waitFor(`State.phase === 'select' && State.shootFlow === 'continuous'`, 4000);
await evaluate(`startMode(MODES.find(mode => mode.id === 'cover'))`);
await waitFor(`State.phase === 'shutter'`, 14000);
await evaluate(`executeShut()`);
await waitFor(`State.phase === 'prepare'`, 4000);
const continuousPaused = await evaluate(`(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  document.dispatchEvent(new Event('visibilitychange'));
  return {
    phase: State.phase,
    autoClass: document.getElementById('shot-prepare-overlay').classList.contains('continuous-mode'),
    stateText: document.getElementById('shot-recording-state-text').textContent,
  };
})()`);
assert(continuousPaused.phase === 'prepare' && !continuousPaused.autoClass, 'continuous auto resume must be cancelled after backgrounding');
assert(continuousPaused.stateText.includes('再開待ち'), 'continuous mode must show manual resume state');
await new Promise(resolve => setTimeout(resolve, 2600));
const continuousStayedPaused = await evaluate(`State.phase === 'prepare'`);
assert(continuousStayedPaused, 'continuous mode must remain paused until the user resumes');
await evaluate(`gotoSelect()`);

assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`);
console.log(JSON.stringify({
  initial,
  deviceCheck,
  deviceCheckBlocked,
  compositionGrid,
  audioOnRecording,
  cameraFlipped,
  previewInterrupted,
  audioOff,
  recording,
  interrupted,
  noAutoResume,
  returned,
  resumed,
  firstPrepare,
  finalReview,
  completed,
  diagnosticsCopied,
  continuousPaused,
  continuousStayedPaused,
  consoleErrors,
}, null, 2));
try { await fetch(`http://127.0.0.1:${debugPort}/json/close/${target.id}`); } catch (_) {}
ws.close();
