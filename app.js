// ==========================================
// Stan aplikacji i konfiguracja
// ==========================================
let revealedCount = 0;
let lastShakeTime = 0;
const SHAKE_COOLDOWN_MS = 240; // minimalna przerwa między cyframi
let shakeThreshold = 18; // domyślny próg przyspieszenia (m/s^2)

// Referencje DOM
const digitCountBadge = document.getElementById('digit-count-badge');
const latestDigitEl = document.getElementById('latest-digit');
const digitPosEl = document.getElementById('digit-pos');
const latestDigitCard = document.getElementById('latest-digit-card');
const digitRing = document.getElementById('digit-ring');
const digitsContainer = document.getElementById('digits-container');
const forceBar = document.getElementById('force-bar');
const motionStatus = document.getElementById('motion-status');
const phoneIcon = document.getElementById('phone-icon');
const btnShake = document.getElementById('btn-shake');
const btnReset = document.getElementById('btn-reset');
const btnCopy = document.getElementById('btn-copy');
const copyText = document.getElementById('copy-text');
const btnPermission = document.getElementById('btn-permission');
const toggleSound = document.getElementById('toggle-sound');
const toggleVibrate = document.getElementById('toggle-vibrate');
const thresholdSlider = document.getElementById('threshold-slider');
const thresholdValue = document.getElementById('threshold-value');
const thresholdLine = document.getElementById('threshold-line');

// Elementy wartości XYZ
const valX = document.getElementById('val-x');
const valY = document.getElementById('val-y');
const valZ = document.getElementById('val-z');

// Canvas oscyloskopu 2D
const accelCanvas = document.getElementById('accel-chart');
const canvasCtx = accelCanvas.getContext('2d');

// Trzy.js 3D viewport
const threeContainer = document.getElementById('three-container');

// Generator Pi
let piGenerator = null;

// ==========================================
// Regulacja progu czułości
// ==========================================
function updateThresholdDisplay(val) {
  shakeThreshold = Number(val);
  thresholdValue.textContent = `${shakeThreshold} m/s²`;
  // Aktualizacja pozycji linii przerywanej na wykresie
  // Skala wykresu to 0 do 45 m/s²
  const percentFromTop = Math.max(5, Math.min(95, 100 - (shakeThreshold / 45) * 100));
  thresholdLine.style.top = `${percentFromTop}%`;
}

thresholdSlider.addEventListener('input', (e) => {
  updateThresholdDisplay(e.target.value);
});

// ==========================================
// Syntezator dźwięku (Web Audio API)
// ==========================================
let audioCtx = null;
function playPopSound() {
  if (!toggleSound.checked) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    const freq = 450 + Math.min(revealedCount * 7, 750);
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
// Obsługa cyfr Pi
// ==========================================
function getNextPiDigit(index) {
  const dataOffset = 2; // pomijamy '3' i '.'
  if (index + dataOffset < window.PI_DIGITS.length) {
    return window.PI_DIGITS[index + dataOffset];
  }

  if (!piGenerator) {
    piGenerator = window.generatePiDigits();
    piGenerator.next(); // 3
    for (let i = 0; i < window.PI_DIGITS.length - 2; i++) {
      piGenerator.next();
    }
  }
  return piGenerator.next().value.toString();
}

function revealNextDigit() {
  const now = Date.now();
  if (now - lastShakeTime < SHAKE_COOLDOWN_MS) return;
  lastShakeTime = now;

  const nextDigit = getNextPiDigit(revealedCount);
  revealedCount++;

  digitCountBadge.textContent = revealedCount;
  latestDigitEl.textContent = nextDigit;
  digitPosEl.textContent = `${revealedCount}. miejsce po przecinku`;

  // Animacja karty głównej
  latestDigitCard.classList.remove('scale-105', 'border-purple-400');
  latestDigitCard.classList.add('scale-105', 'border-purple-400');
  digitRing.classList.add('opacity-80', 'scale-110');
  setTimeout(() => {
    latestDigitCard.classList.remove('scale-105', 'border-purple-400');
    digitRing.classList.remove('opacity-80', 'scale-110');
  }, 180);

  // Dodanie cyfry do kontenera z efektem pop-in
  const span = document.createElement('span');
  span.textContent = nextDigit;
  span.className = 'inline-block text-purple-200 animate-pop-in hover:text-white transition';
  digitsContainer.appendChild(span);
  digitsContainer.scrollTop = digitsContainer.scrollHeight;

  // Haptic feedback (wibracje)
  if (toggleVibrate.checked && 'vibrate' in navigator) {
    navigator.vibrate(35);
  }

  // Dźwięk
  playPopSound();

  // Wstrząśnij telefonem również w widoku 3D
  if (phoneMesh) {
    phoneMesh.rotation.z += (Math.random() - 0.5) * 0.8;
    phoneMesh.rotation.x += (Math.random() - 0.5) * 0.8;
  }

  // Animacja ikony
  phoneIcon.classList.remove('animate-shake-hint');
  void phoneIcon.offsetWidth;
  phoneIcon.classList.add('animate-shake-hint');
}

function resetAll() {
  revealedCount = 0;
  digitCountBadge.textContent = "0";
  latestDigitEl.textContent = "3";
  digitPosEl.textContent = "Część całkowita";
  digitsContainer.innerHTML = '<span class="text-purple-400 font-bold text-base">3.</span>';
  piGenerator = null;
}

function copyPi() {
  let text = "3.";
  for (let i = 0; i < revealedCount; i++) {
    text += getNextPiDigit(i);
  }
  navigator.clipboard.writeText(text).then(() => {
    copyText.textContent = "Skopiowano!";
    setTimeout(() => { copyText.textContent = "Kopiuj"; }, 1500);
  }).catch(() => {
    copyText.textContent = "Błąd";
  });
}

// ==========================================
// Wysoce zoptymalizowany bufor i wykres XYZ 2D
// ==========================================
// Używamy Float32Array jako bufora kołowego, bez alokacji w pętli renderowania!
const BUFFER_SIZE = 80;
const historyX = new Float32Array(BUFFER_SIZE);
const historyY = new Float32Array(BUFFER_SIZE);
const historyZ = new Float32Array(BUFFER_SIZE);
let bufIndex = 0;

let currentX = 0, currentY = 0, currentZ = 0;
let currentMagnitude = 0;

function pushSensorData(x, y, z, mag) {
  historyX[bufIndex] = x;
  historyY[bufIndex] = y;
  historyZ[bufIndex] = z;
  bufIndex = (bufIndex + 1) % BUFFER_SIZE;
  currentX = x;
  currentY = y;
  currentZ = z;
  currentMagnitude = mag;
}

function resizeCanvas() {
  const rect = accelCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  accelCanvas.width = rect.width * dpr;
  accelCanvas.height = rect.height * dpr;
  canvasCtx.scale(dpr, dpr);
}
window.addEventListener('resize', resizeCanvas);

function drawOscilloscope() {
  const w = accelCanvas.clientWidth;
  const h = accelCanvas.clientHeight;
  if (!w || !h) return;

  canvasCtx.clearRect(0, 0, w, h);

  // Pozioma linia zerowa
  const midY = h / 2;
  canvasCtx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
  canvasCtx.lineWidth = 1;
  canvasCtx.beginPath();
  canvasCtx.moveTo(0, midY);
  canvasCtx.lineTo(w, midY);
  canvasCtx.stroke();

  // Rysowanie 3 linii osi (X: różowy, Y: szmaragdowy, Z: błękitny)
  const step = w / (BUFFER_SIZE - 1);
  const maxScale = 30; // skala w m/s^2

  function drawAxis(buffer, color) {
    canvasCtx.beginPath();
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 1.6;
    for (let i = 0; i < BUFFER_SIZE; i++) {
      const idx = (bufIndex + i) % BUFFER_SIZE;
      const val = buffer[idx];
      // Mapowanie wartości do Y
      const y = midY - (val / maxScale) * (midY - 4);
      const x = i * step;
      if (i === 0) canvasCtx.moveTo(x, y);
      else canvasCtx.lineTo(x, y);
    }
    canvasCtx.stroke();
  }

  drawAxis(historyX, '#fb7185'); // Rose X
  drawAxis(historyY, '#34d399'); // Emerald Y
  drawAxis(historyZ, '#38bdf8'); // Sky Z
}

// ==========================================
// Wizualizacja 3D w Three.js (Optymalna pod kątem FPS i baterii)
// ==========================================
let scene, camera, renderer;
let phoneMesh, vectorArrow;
let targetRotX = 0, targetRotY = 0, targetRotZ = 0;

function init3D() {
  const width = threeContainer.clientWidth || 160;
  const height = threeContainer.clientHeight || 144;

  scene = new THREE.Scene();
  
  camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
  camera.position.set(0, 0, 4.2);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // limit dla oszczędności baterii
  threeContainer.appendChild(renderer.domElement);

  // Oświetlenie
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xa78bfa, 1.2);
  dirLight.position.set(3, 4, 3);
  scene.add(dirLight);

  // Model telefonu 3D (zaokrąglona bryła z ekranem i akcentami)
  const group = new THREE.Group();

  // Obudowa telefonu
  const bodyGeo = new THREE.BoxGeometry(1.3, 2.3, 0.15);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1e1b4b,
    roughness: 0.3,
    metalness: 0.8,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);

  // Ekran z poświatą neonową
  const screenGeo = new THREE.PlaneGeometry(1.15, 2.05);
  const screenMat = new THREE.MeshBasicMaterial({
    color: 0x7c3aed,
    wireframe: true,
    transparent: true,
    opacity: 0.4
  });
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.position.z = 0.08;
  group.add(screen);

  // Dynamiczny wskaźnik wektora siły (strzałka 3D)
  const arrowDir = new THREE.Vector3(0, 1, 0);
  vectorArrow = new THREE.ArrowHelper(arrowDir, new THREE.Vector3(0, 0, 0), 1.2, 0xf43f5e, 0.3, 0.2);
  group.add(vectorArrow);

  phoneMesh = group;
  scene.add(phoneMesh);

  // Responsive resize
  window.addEventListener('resize', () => {
    const w = threeContainer.clientWidth;
    const h = threeContainer.clientHeight;
    if (w && h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
  });
}

// Główna pętla renderowania animacji (60 FPS z RequestAnimationFrame)
function mainRenderLoop() {
  requestAnimationFrame(mainRenderLoop);

  // Rysowanie wykresu oscyloskopu
  drawOscilloscope();

  // Płynna interpolacja (LERP) rotacji telefonu 3D pod kątem żyroskopu/przyspieszenia
  if (phoneMesh) {
    phoneMesh.rotation.x += (targetRotX - phoneMesh.rotation.x) * 0.12;
    phoneMesh.rotation.y += (targetRotY - phoneMesh.rotation.y) * 0.12;
    phoneMesh.rotation.z += (targetRotZ - phoneMesh.rotation.z) * 0.12;

    // Aktualizacja kierunku i długości wektora siły 3D
    const mag = Math.sqrt(currentX * currentX + currentY * currentY + currentZ * currentZ);
    if (mag > 0.1) {
      const dir = new THREE.Vector3(currentX, currentY, currentZ).normalize();
      vectorArrow.setDirection(dir);
      const arrowLength = Math.min(0.6 + mag * 0.05, 1.8);
      vectorArrow.setLength(arrowLength, 0.25, 0.15);
    }
  }

  renderer.render(scene, camera);
}

// ==========================================
// Obsługa DeviceMotion & Akcelerometru
// ==========================================
let lastX = null, lastY = null, lastZ = null;

function handleMotion(event) {
  const acc = event.accelerationIncludingGravity || event.acceleration;
  if (!acc || acc.x === null) return;

  const x = acc.x || 0;
  const y = acc.y || 0;
  const z = acc.z || 0;

  // Aktualizacja etykiet numerycznych XYZ
  valX.textContent = x.toFixed(1);
  valY.textContent = y.toFixed(1);
  valZ.textContent = z.toFixed(1);

  // Obliczenie delty / energii wstrząsu
  let totalDelta = 0;
  if (lastX !== null) {
    const deltaX = Math.abs(x - lastX);
    const deltaY = Math.abs(y - lastY);
    const deltaZ = Math.abs(z - lastZ);
    totalDelta = deltaX + deltaY + deltaZ;
  }

  // Wypchnij do bufora kołowego
  pushSensorData(x, y, z, totalDelta);

  // Aktualizacja orientacji 3D z fizycznego przyspieszenia grawitacyjnego
  targetRotX = (y / 9.8) * 0.8;
  targetRotY = (-x / 9.8) * 0.8;

  // Pasek siły potrząśnięcia
  const percentage = Math.min((totalDelta / shakeThreshold) * 100, 100);
  forceBar.style.width = `${percentage}%`;

  // Sprawdzenie progu czułości
  if (totalDelta > shakeThreshold) {
    motionStatus.textContent = "Wykryto wstrząs! 💥";
    motionStatus.className = "text-[11px] text-emerald-400 font-bold animate-pulse";
    revealNextDigit();
    setTimeout(() => {
      motionStatus.textContent = "Zatrzęś telefonem!";
      motionStatus.className = "text-slate-300 font-medium text-[11px]";
    }, 450);
  }

  lastX = x;
  lastY = y;
  lastZ = z;
}

// Obsługa uprawnień DeviceMotion (iOS Safari)
function setupMotionListener() {
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    btnPermission.classList.remove('hidden');
    btnPermission.addEventListener('click', () => {
      DeviceMotionEvent.requestPermission()
        .then(permissionState => {
          if (permissionState === 'granted') {
            btnPermission.classList.add('hidden');
            window.addEventListener('devicemotion', handleMotion, true);
            motionStatus.textContent = "Czujnik aktywny! 📱";
          } else {
            alert('Brak uprawnień do czujnika ruchu.');
          }
        })
        .catch(console.error);
    });
  } else if ('ondevicemotion' in window) {
    window.addEventListener('devicemotion', handleMotion, true);
    motionStatus.textContent = "Czujnik aktywny! 📱";
  } else {
    motionStatus.textContent = "Brak czujnika (użyj testu)";
  }
}

// Symulacja wstrząsu (dla testów na PC)
function simulateShake() {
  const fakeMagnitude = shakeThreshold + 10;
  // Dynamiczne zakłócenie wartości XYZ na wykresie
  const sign = Math.random() > 0.5 ? 1 : -1;
  const simX = (Math.random() * 20 - 10) * 1.5;
  const simY = (Math.random() * 25 - 12) * 1.5;
  const simZ = (Math.random() * 20 - 10) * 1.5;

  valX.textContent = simX.toFixed(1);
  valY.textContent = simY.toFixed(1);
  valZ.textContent = simZ.toFixed(1);

  pushSensorData(simX, simY, simZ, fakeMagnitude);

  forceBar.style.width = '100%';
  setTimeout(() => { forceBar.style.width = '0%'; }, 250);

  targetRotX += (Math.random() - 0.5) * 1.5;
  targetRotY += (Math.random() - 0.5) * 1.5;

  motionStatus.textContent = "Symulacja wstrząsu! 🚀";
  revealNextDigit();
  setTimeout(() => {
    motionStatus.textContent = "Zatrzęś telefonem!";
  }, 450);
}

// Event Listeners
btnShake.addEventListener('click', simulateShake);
btnReset.addEventListener('click', resetAll);
btnCopy.addEventListener('click', copyPi);

// Inicjalizacja przy załadowaniu
document.addEventListener('DOMContentLoaded', () => {
  resizeCanvas();
  init3D();
  updateThresholdDisplay(thresholdSlider.value);
  setupMotionListener();
  mainRenderLoop();
});
