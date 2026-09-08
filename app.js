// ==========================================
// Application State and Configuration
// ==========================================
let revealedCount = 0;
let lastShakeTime = 0;
const SHAKE_COOLDOWN_MS = 220; // Minimum cooldown between detected shakes
let shakeThreshold = 18; // Default acceleration threshold (m/s^2)

// DOM References
let digitCountBadge, latestDigitEl, digitPosEl, latestDigitCard, digitRing;
let digitsContainer, forceBar, motionStatus, phoneIcon, btnShake, btnReset;
let btnCopy, copyText, toggleSound, toggleVibrate;
let thresholdSlider, thresholdValue, thresholdLine;
let valX, valY, valZ, accelCanvas, canvasCtx, threeContainer;

// Universal Sensor Activation Panel Elements
let activationCard, btnActivateMotion, btnActivateText, activationTitle, activationDesc;
let diagDot, diagMessage, diagEventsBadge;
let sensorActiveIndicator, activeEventsCount;
let sensorEventCount = 0;
let isRealSensorActive = false;

// Pi Generator & Web Audio
let piGenerator = null;
let audioCtx = null;

// ==========================================
// Circular Buffer & 2D XYZ Oscilloscope Chart
// ==========================================
const BUFFER_SIZE = 90;
const historyX = new Float32Array(BUFFER_SIZE);
const historyY = new Float32Array(BUFFER_SIZE);
const historyZ = new Float32Array(BUFFER_SIZE);
let bufIndex = 0;

let currentX = 0, currentY = 0, currentZ = 0;
let currentMagnitude = 0;

// Three.js 3D Viewport
let scene, camera, renderer, phoneMesh, vectorArrow;
let targetRotX = 0, targetRotY = 0, targetRotZ = 0;

// Accelerometer State Tracking
let lastX = null, lastY = null, lastZ = null;
let lastSensorTimestamp = 0;

// ==========================================
// Sensitivity & Threshold Adjustment
// ==========================================
function updateThreshold(newVal) {
  shakeThreshold = Math.max(4, Math.min(50, Number(newVal)));
  if (thresholdValue) {
    thresholdValue.textContent = `${shakeThreshold} m/s²`;
  }
  if (thresholdSlider && thresholdSlider.value != shakeThreshold) {
    thresholdSlider.value = shakeThreshold;
  }
  if (thresholdLine && accelCanvas) {
    const h = accelCanvas.clientHeight || 80;
    const midY = h / 2;
    const maxScale = 30;
    const lineY = Math.max(4, midY - (shakeThreshold / maxScale) * (midY - 4));
    thresholdLine.style.top = `${lineY}px`;
  }
}

// ==========================================
// Sound Synthesis (Web Audio API)
// ==========================================
function playPopSound() {
  if (!toggleSound || !toggleSound.checked) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    // Frequency rises subtly with each discovered digit
    const freq = 450 + Math.min(revealedCount * 8, 700);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.4, audioCtx.currentTime + 0.07);

    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch (e) {
    console.error("Audio error", e);
  }
}

// ==========================================
// Pi Digits Retrieval & Formatting
// ==========================================
function getNextPiDigit(index) {
  const dataOffset = 2; // Skip '3' and '.'
  if (window.PI_DIGITS && index + dataOffset < window.PI_DIGITS.length) {
    return window.PI_DIGITS[index + dataOffset];
  }

  // Fallback to Spigot generator if buffer exceeded
  if (!piGenerator && window.generatePiDigits) {
    piGenerator = window.generatePiDigits();
    piGenerator.next(); // 3
    for (let i = 0; i < (window.PI_DIGITS ? window.PI_DIGITS.length - 2 : 0); i++) {
      piGenerator.next();
    }
  }
  return piGenerator ? piGenerator.next().value.toString() : Math.floor(Math.random() * 10).toString();
}

// Ordinal suffix helper: 1st, 2nd, 3rd, 4th...
function getOrdinalSuffix(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function revealNextDigit() {
  const now = Date.now();
  if (now - lastShakeTime < SHAKE_COOLDOWN_MS) return;
  lastShakeTime = now;

  const nextDigit = getNextPiDigit(revealedCount);
  revealedCount++;

  if (digitCountBadge) digitCountBadge.textContent = revealedCount;
  if (latestDigitEl) latestDigitEl.textContent = nextDigit;
  if (digitPosEl) digitPosEl.textContent = `${revealedCount}${getOrdinalSuffix(revealedCount)} decimal place`;

  // Animate spotlight card
  if (latestDigitCard) {
    latestDigitCard.classList.remove('scale-105', 'border-purple-400');
    void latestDigitCard.offsetWidth;
    latestDigitCard.classList.add('scale-105', 'border-purple-400');
    setTimeout(() => {
      latestDigitCard.classList.remove('scale-105', 'border-purple-400');
    }, 180);
  }

  if (digitRing) {
    digitRing.classList.add('opacity-80', 'scale-110');
    setTimeout(() => {
      digitRing.classList.remove('opacity-80', 'scale-110');
    }, 180);
  }

  // Append new digit to history feed
  if (digitsContainer) {
    const span = document.createElement('span');
    span.textContent = nextDigit;
    span.className = 'inline-block text-purple-200 animate-pop-in hover:text-white transition';
    digitsContainer.appendChild(span);
    digitsContainer.scrollTop = digitsContainer.scrollHeight;
  }

  // Haptic feedback
  if (toggleVibrate && toggleVibrate.checked && 'vibrate' in navigator) {
    navigator.vibrate(35);
  }

  // Sound effect
  playPopSound();

  // 3D phone perturbation
  if (phoneMesh) {
    phoneMesh.rotation.z += (Math.random() - 0.5) * 0.7;
    phoneMesh.rotation.x += (Math.random() - 0.5) * 0.7;
  }

  // Phone icon micro-animation
  if (phoneIcon) {
    phoneIcon.classList.remove('animate-shake-hint');
    void phoneIcon.offsetWidth;
    phoneIcon.classList.add('animate-shake-hint');
  }
}

function resetAll() {
  revealedCount = 0;
  if (digitCountBadge) digitCountBadge.textContent = "0";
  if (latestDigitEl) latestDigitEl.textContent = "3";
  if (digitPosEl) digitPosEl.textContent = "Integer part";
  if (digitsContainer) digitsContainer.innerHTML = '<span class="text-purple-400 font-bold text-base">3.</span>';
  piGenerator = null;
}

function copyPi() {
  let text = "3.";
  for (let i = 0; i < revealedCount; i++) {
    text += getNextPiDigit(i);
  }
  navigator.clipboard.writeText(text).then(() => {
    if (copyText) copyText.textContent = "Copied!";
    setTimeout(() => { if (copyText) copyText.textContent = "Copy"; }, 1500);
  }).catch(() => {
    if (copyText) copyText.textContent = "Error";
  });
}

// ==========================================
// Sensor Buffer Management
// ==========================================
function pushSensorData(x, y, z, delta) {
  historyX[bufIndex] = x;
  historyY[bufIndex] = y;
  historyZ[bufIndex] = z;
  bufIndex = (bufIndex + 1) % BUFFER_SIZE;

  currentX = x;
  currentY = y;
  currentZ = z;
  currentMagnitude = delta;

  if (valX) valX.textContent = x.toFixed(1);
  if (valY) valY.textContent = y.toFixed(1);
  if (valZ) valZ.textContent = z.toFixed(1);
}

// ==========================================
// 2D Oscilloscope Canvas Renderer
// ==========================================
function setupCanvas() {
  if (!accelCanvas) return;
  const rect = accelCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const displayW = Math.floor(rect.width) || 300;
  const displayH = Math.floor(rect.height) || 80;

  accelCanvas.width = displayW * dpr;
  accelCanvas.height = displayH * dpr;

  canvasCtx = accelCanvas.getContext('2d');
  canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateThreshold(shakeThreshold);
}

function drawOscilloscope() {
  if (!accelCanvas || !canvasCtx) return;
  const w = accelCanvas.clientWidth;
  const h = accelCanvas.clientHeight;
  if (!w || !h) return;

  canvasCtx.clearRect(0, 0, w, h);

  // Center zero line
  const midY = h / 2;
  canvasCtx.strokeStyle = 'rgba(71, 85, 105, 0.45)';
  canvasCtx.lineWidth = 1;
  canvasCtx.beginPath();
  canvasCtx.moveTo(0, midY);
  canvasCtx.lineTo(w, midY);
  canvasCtx.stroke();

  // Subtle grid guides
  canvasCtx.strokeStyle = 'rgba(51, 65, 85, 0.2)';
  canvasCtx.beginPath();
  canvasCtx.moveTo(0, h * 0.25);
  canvasCtx.lineTo(w, h * 0.25);
  canvasCtx.moveTo(0, h * 0.75);
  canvasCtx.lineTo(w, h * 0.75);
  canvasCtx.stroke();

  const step = w / (BUFFER_SIZE - 1);
  const maxScale = 30; // +/- 30 m/s^2

  function drawAxis(buffer, color) {
    canvasCtx.beginPath();
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 2.0;
    canvasCtx.lineJoin = 'round';
    for (let i = 0; i < BUFFER_SIZE; i++) {
      const idx = (bufIndex + i) % BUFFER_SIZE;
      const val = buffer[idx];
      const y = Math.max(2, Math.min(h - 2, midY - (val / maxScale) * (midY - 4)));
      const x = i * step;
      if (i === 0) canvasCtx.moveTo(x, y);
      else canvasCtx.lineTo(x, y);
    }
    canvasCtx.stroke();
  }

  drawAxis(historyX, '#f43f5e'); // Rose X
  drawAxis(historyY, '#10b981'); // Emerald Y
  drawAxis(historyZ, '#0ea5e9'); // Sky Z
}

// ==========================================
// Three.js 3D Orientation Model
// ==========================================
function init3D() {
  if (!threeContainer || typeof THREE === 'undefined') return;

  const width = threeContainer.clientWidth || 160;
  const height = threeContainer.clientHeight || 160;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
  camera.position.set(0, 0, 4.2);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  threeContainer.innerHTML = '';
  threeContainer.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xc084fc, 1.4);
  dirLight.position.set(2, 3, 3);
  scene.add(dirLight);

  const group = new THREE.Group();

  const bodyGeo = new THREE.BoxGeometry(1.3, 2.3, 0.15);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1e1b4b,
    roughness: 0.35,
    metalness: 0.75,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);

  const screenGeo = new THREE.PlaneGeometry(1.15, 2.05);
  const screenMat = new THREE.MeshBasicMaterial({
    color: 0x8b5cf6,
    wireframe: true,
    transparent: true,
    opacity: 0.45
  });
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.position.z = 0.08;
  group.add(screen);

  const arrowDir = new THREE.Vector3(0, 1, 0);
  vectorArrow = new THREE.ArrowHelper(arrowDir, new THREE.Vector3(0, 0, 0), 1.2, 0xf43f5e, 0.35, 0.2);
  group.add(vectorArrow);

  phoneMesh = group;
  scene.add(phoneMesh);

  window.addEventListener('resize', () => {
    if (!threeContainer) return;
    const w = threeContainer.clientWidth;
    const h = threeContainer.clientHeight;
    if (w && h && renderer && camera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    setupCanvas();
  });
}

let simTimer = 0;
function mainAnimationLoop(timestamp) {
  requestAnimationFrame(mainAnimationLoop);

  // If no physical sensor data received, simulate gentle resting gravity so graph remains alive
  const timeSinceSensor = timestamp - lastSensorTimestamp;
  if (!isRealSensorActive || timeSinceSensor > 1200) {
    simTimer += 0.04;
    const idleX = Math.sin(simTimer * 1.5) * 0.4;
    const idleY = 9.8 + Math.cos(simTimer * 1.2) * 0.3; // Earth gravity
    const idleZ = Math.sin(simTimer * 0.8) * 0.2;
    pushSensorData(idleX, idleY, idleZ, 0.1);
  }

  drawOscilloscope();

  if (phoneMesh && renderer && scene && camera) {
    phoneMesh.rotation.x += (targetRotX - phoneMesh.rotation.x) * 0.1;
    phoneMesh.rotation.y += (targetRotY - phoneMesh.rotation.y) * 0.1;
    phoneMesh.rotation.z += (targetRotZ - phoneMesh.rotation.z) * 0.1;

    const mag = Math.sqrt(currentX * currentX + currentY * currentY + currentZ * currentZ);
    if (mag > 0.05 && vectorArrow) {
      const dir = new THREE.Vector3(currentX, currentY, currentZ).normalize();
      vectorArrow.setDirection(dir);
      const arrowLength = Math.min(0.5 + mag * 0.06, 1.8);
      vectorArrow.setLength(arrowLength, 0.25, 0.15);
    }
    renderer.render(scene, camera);
  }
}

// ==========================================
// Acceleration & Shake Processing
// ==========================================
function processAcceleration(x, y, z) {
  isRealSensorActive = true;
  lastSensorTimestamp = performance.now();

  let totalDelta = 0;
  if (lastX !== null) {
    const deltaX = Math.abs(x - lastX);
    const deltaY = Math.abs(y - lastY);
    const deltaZ = Math.abs(z - lastZ);
    totalDelta = deltaX + deltaY + deltaZ;
  }

  pushSensorData(x, y, z, totalDelta);

  targetRotX = (y / 9.8) * 0.8;
  targetRotY = (-x / 9.8) * 0.8;

  if (forceBar) {
    const percentage = Math.min((totalDelta / shakeThreshold) * 100, 100);
    forceBar.style.width = `${percentage}%`;
  }

  if (totalDelta >= shakeThreshold) {
    if (motionStatus) {
      motionStatus.textContent = `· Shake detected (${totalDelta.toFixed(0)} m/s²)! 💥`;
      motionStatus.className = "text-[11px] text-emerald-400 font-bold animate-pulse";
    }
    revealNextDigit();
    setTimeout(() => {
      if (motionStatus) {
        motionStatus.textContent = "· Waiting for motion";
        motionStatus.className = "text-[11px] text-purple-400 font-medium";
      }
    }, 450);
  }

  lastX = x;
  lastY = y;
  lastZ = z;
}

function handleMotionEvent(event) {
  sensorEventCount++;
  if (diagEventsBadge) {
    diagEventsBadge.textContent = `Events: ${sensorEventCount}`;
    diagEventsBadge.className = "text-[10px] bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700/60 text-emerald-300 font-bold";
  }
  if (activeEventsCount) {
    activeEventsCount.textContent = `${sensorEventCount} rcvd`;
  }

  const acc = event.accelerationIncludingGravity || event.acceleration;
  if (!acc || acc.x === null) return;

  if (sensorEventCount === 1 || !isRealSensorActive) {
    setSensorActiveSuccess();
  }

  processAcceleration(acc.x || 0, acc.y || 0, acc.z || 0);
}

// UI transition once real sensor data arrives
function setSensorActiveSuccess() {
  isRealSensorActive = true;

  // Smoothly hide the big prompt banner and show the compact active bar
  if (activationCard) {
    activationCard.classList.add('opacity-0', '-translate-y-2');
    setTimeout(() => {
      activationCard.style.display = 'none';
      if (sensorActiveIndicator) {
        sensorActiveIndicator.classList.remove('hidden');
      }
    }, 350);
  }

  if (activeEventsCount) {
    activeEventsCount.textContent = `${sensorEventCount} rcvd`;
  }
}

// ==========================================
// Universal Activation Handler (iOS, Android, Chrome, Safari)
// ==========================================
function triggerUniversalActivation() {
  // Unlock audio context on first user gesture
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}

  if (diagMessage) {
    diagMessage.textContent = "Requesting sensor permissions...";
  }

  // 1. iOS Safari Permission Protocol (DeviceMotionEvent.requestPermission)
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission()
      .then(state => {
        if (state === 'granted') {
          window.addEventListener('devicemotion', handleMotionEvent, true);
          setSensorActiveSuccess();
        } else {
          if (diagMessage) {
            diagMessage.textContent = "Permission denied in Safari settings.";
            diagMessage.className = "text-rose-400 font-bold";
          }
          if (diagDot) diagDot.className = "w-3 h-3 rounded-full bg-rose-500";
        }
      })
      .catch(err => {
        if (diagMessage) {
          diagMessage.textContent = `Permission error: ${err.message || err}`;
          diagMessage.className = "text-rose-400 font-bold";
        }
      });
    return;
  }

  // 2. Android Chrome / Standard DeviceOrientation
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().catch(() => {});
  }

  // 3. General Browsers
  if ('ondevicemotion' in window || 'DeviceMotionEvent' in window) {
    window.addEventListener('devicemotion', handleMotionEvent, true);

    setTimeout(() => {
      if (sensorEventCount > 0) {
        setSensorActiveSuccess();
      } else {
        if (!window.isSecureContext && window.location.protocol !== 'https:' && !window.location.hostname.includes('localhost')) {
          if (diagMessage) {
            diagMessage.textContent = "Chrome Android requires HTTPS for sensors. Use HTTPS or Desktop test.";
            diagMessage.className = "text-amber-300 font-bold";
          }
        } else {
          setSensorActiveSuccess();
        }
      }
    }, 600);
  } else {
    if (diagMessage) {
      diagMessage.textContent = "No motion hardware detected. Using desktop simulation mode.";
      diagMessage.className = "text-slate-400";
    }
  }
}

// Simulated shake for desktop testing
function triggerSimulatedShake() {
  const simEnergy = shakeThreshold + 12;
  const sx = (Math.random() * 24 - 12);
  const sy = (Math.random() * 30 - 15);
  const sz = (Math.random() * 20 - 10);

  pushSensorData(sx * 0.6, sy * 0.6, sz * 0.6, simEnergy * 0.5);
  setTimeout(() => {
    processAcceleration(sx, sy, sz);
    if (forceBar) {
      forceBar.style.width = '100%';
      setTimeout(() => { if (forceBar) forceBar.style.width = '0%'; }, 250);
    }
  }, 40);
  setTimeout(() => {
    pushSensorData(-sx * 0.4, -sy * 0.4, -sz * 0.4, simEnergy * 0.3);
  }, 80);
}

// ==========================================
// Application Bootstrap
// ==========================================
function initializeApp() {
  digitCountBadge = document.getElementById('digit-count-badge');
  latestDigitEl = document.getElementById('latest-digit');
  digitPosEl = document.getElementById('digit-pos');
  latestDigitCard = document.getElementById('latest-digit-card');
  digitRing = document.getElementById('digit-ring');
  digitsContainer = document.getElementById('digits-container');
  forceBar = document.getElementById('force-bar');
  motionStatus = document.getElementById('motion-status');
  phoneIcon = document.getElementById('phone-icon');
  btnShake = document.getElementById('btn-shake');
  btnReset = document.getElementById('btn-reset');
  btnCopy = document.getElementById('btn-copy');
  copyText = document.getElementById('copy-text');
  toggleSound = document.getElementById('toggle-sound');
  toggleVibrate = document.getElementById('toggle-vibrate');
  thresholdSlider = document.getElementById('threshold-slider');
  thresholdValue = document.getElementById('threshold-value');
  thresholdLine = document.getElementById('threshold-line');
  valX = document.getElementById('val-x');
  valY = document.getElementById('val-y');
  valZ = document.getElementById('val-z');
  accelCanvas = document.getElementById('accel-chart');
  threeContainer = document.getElementById('three-container');

  // Activation banner elements
  activationCard = document.getElementById('activation-card');
  btnActivateMotion = document.getElementById('btn-activate-motion');
  btnActivateText = document.getElementById('btn-activate-text');
  activationTitle = document.getElementById('activation-title');
  activationDesc = document.getElementById('activation-desc');
  diagDot = document.getElementById('diag-dot');
  diagMessage = document.getElementById('diag-message');
  diagEventsBadge = document.getElementById('diag-events-badge');
  sensorActiveIndicator = document.getElementById('sensor-active-indicator');
  activeEventsCount = document.getElementById('active-events-count');

  if (btnActivateMotion) {
    btnActivateMotion.addEventListener('click', triggerUniversalActivation);
    btnActivateMotion.addEventListener('touchstart', triggerUniversalActivation, { passive: true });
  }

  if (thresholdSlider) {
    thresholdSlider.addEventListener('input', (e) => updateThreshold(e.target.value));
    thresholdSlider.addEventListener('change', (e) => updateThreshold(e.target.value));
    updateThreshold(thresholdSlider.value);
  }

  if (btnShake) btnShake.addEventListener('click', triggerSimulatedShake);
  if (btnReset) btnReset.addEventListener('click', resetAll);
  if (btnCopy) btnCopy.addEventListener('click', copyPi);

  setupCanvas();
  init3D();
  requestAnimationFrame(mainAnimationLoop);

  // Auto-listen if browser does not require permission prompt
  if ('ondevicemotion' in window && !('requestPermission' in DeviceMotionEvent)) {
    window.addEventListener('devicemotion', handleMotionEvent, { once: false, passive: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
