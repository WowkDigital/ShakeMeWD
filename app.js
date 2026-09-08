// ==========================================
// Stan aplikacji i konfiguracja
// ==========================================
let revealedCount = 0;
let lastShakeTime = 0;
const SHAKE_COOLDOWN_MS = 220; // minimalna przerwa między cyframi
let shakeThreshold = 18; // domyślny próg przyspieszenia (m/s^2)

// Referencje DOM
let digitCountBadge, latestDigitEl, digitPosEl, latestDigitCard, digitRing;
let digitsContainer, forceBar, motionStatus, phoneIcon, btnShake, btnReset;
let btnCopy, copyText, btnPermission, toggleSound, toggleVibrate;
let thresholdSlider, thresholdValue, thresholdLine;
let valX, valY, valZ, accelCanvas, canvasCtx, threeContainer;

// Generator Pi
let piGenerator = null;

// Audio Context
let audioCtx = null;

// ==========================================
// Bufor i wykres XYZ 2D
// ==========================================
const BUFFER_SIZE = 90;
const historyX = new Float32Array(BUFFER_SIZE);
const historyY = new Float32Array(BUFFER_SIZE);
const historyZ = new Float32Array(BUFFER_SIZE);
let bufIndex = 0;

let currentX = 0, currentY = 0, currentZ = 0;
let currentMagnitude = 0;

// Wizualizacja 3D Three.js
let scene, camera, renderer, phoneMesh, vectorArrow;
let targetRotX = 0, targetRotY = 0, targetRotZ = 0;

// Ostatnie stany akcelerometru
let lastX = null, lastY = null, lastZ = null;
let lastSensorTimestamp = 0;
let isRealSensorActive = false;

// ==========================================
// Regulacja progu czułości
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
    // Skala wykresu to +/- 30 m/s^2 od środka (midY = h/2)
    // Próg od środka w górę
    const midY = h / 2;
    const maxScale = 30;
    const lineY = Math.max(4, midY - (shakeThreshold / maxScale) * (midY - 4));
    thresholdLine.style.top = `${lineY}px`;
  }
}

// ==========================================
// Dźwięk
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
// Cyfry Pi
// ==========================================
function getNextPiDigit(index) {
  const dataOffset = 2; // pomijamy '3' i '.'
  if (window.PI_DIGITS && index + dataOffset < window.PI_DIGITS.length) {
    return window.PI_DIGITS[index + dataOffset];
  }

  if (!piGenerator && window.generatePiDigits) {
    piGenerator = window.generatePiDigits();
    piGenerator.next(); // 3
    for (let i = 0; i < (window.PI_DIGITS ? window.PI_DIGITS.length - 2 : 0); i++) {
      piGenerator.next();
    }
  }
  return piGenerator ? piGenerator.next().value.toString() : Math.floor(Math.random() * 10).toString();
}

function revealNextDigit() {
  const now = Date.now();
  if (now - lastShakeTime < SHAKE_COOLDOWN_MS) return;
  lastShakeTime = now;

  const nextDigit = getNextPiDigit(revealedCount);
  revealedCount++;

  if (digitCountBadge) digitCountBadge.textContent = revealedCount;
  if (latestDigitEl) latestDigitEl.textContent = nextDigit;
  if (digitPosEl) digitPosEl.textContent = `${revealedCount}. miejsce po przecinku`;

  // Animacja karty głównej
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

  // Dodanie cyfry do ciągu
  if (digitsContainer) {
    const span = document.createElement('span');
    span.textContent = nextDigit;
    span.className = 'inline-block text-purple-200 animate-pop-in hover:text-white transition';
    digitsContainer.appendChild(span);
    digitsContainer.scrollTop = digitsContainer.scrollHeight;
  }

  // Haptic feedback (wibracje)
  if (toggleVibrate && toggleVibrate.checked && 'vibrate' in navigator) {
    navigator.vibrate(35);
  }

  // Dźwięk
  playPopSound();

  // Wstrząs w widoku 3D
  if (phoneMesh) {
    phoneMesh.rotation.z += (Math.random() - 0.5) * 0.7;
    phoneMesh.rotation.x += (Math.random() - 0.5) * 0.7;
  }

  // Animacja ikony telefonu
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
  if (digitPosEl) digitPosEl.textContent = "Część całkowita";
  if (digitsContainer) digitsContainer.innerHTML = '<span class="text-purple-400 font-bold text-base">3.</span>';
  piGenerator = null;
}

function copyPi() {
  let text = "3.";
  for (let i = 0; i < revealedCount; i++) {
    text += getNextPiDigit(i);
  }
  navigator.clipboard.writeText(text).then(() => {
    if (copyText) copyText.textContent = "Skopiowano!";
    setTimeout(() => { if (copyText) copyText.textContent = "Kopiuj"; }, 1500);
  }).catch(() => {
    if (copyText) copyText.textContent = "Błąd";
  });
}

// ==========================================
// Obsługa danych sensora i bufora
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
// Rysowanie oscyloskopu 2D
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
  canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0); // bezpieczne ustawienie skali DPR
  updateThreshold(shakeThreshold);
}

function drawOscilloscope() {
  if (!accelCanvas || !canvasCtx) return;
  const w = accelCanvas.clientWidth;
  const h = accelCanvas.clientHeight;
  if (!w || !h) return;

  canvasCtx.clearRect(0, 0, w, h);

  // Pozioma linia zerowa
  const midY = h / 2;
  canvasCtx.strokeStyle = 'rgba(71, 85, 105, 0.45)';
  canvasCtx.lineWidth = 1;
  canvasCtx.beginPath();
  canvasCtx.moveTo(0, midY);
  canvasCtx.lineTo(w, midY);
  canvasCtx.stroke();

  // Siatka pomocnicza (subtelne linie)
  canvasCtx.strokeStyle = 'rgba(51, 65, 85, 0.2)';
  canvasCtx.beginPath();
  canvasCtx.moveTo(0, h * 0.25);
  canvasCtx.lineTo(w, h * 0.25);
  canvasCtx.moveTo(0, h * 0.75);
  canvasCtx.lineTo(w, h * 0.75);
  canvasCtx.stroke();

  // Rysowanie 3 linii osi (X, Y, Z)
  const step = w / (BUFFER_SIZE - 1);
  const maxScale = 30; // 30 m/s^2 pełne wychylenie

  function drawAxis(buffer, color) {
    canvasCtx.beginPath();
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 1.8;
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

  drawAxis(historyX, '#fb7185'); // Różowy X
  drawAxis(historyY, '#34d399'); // Szmaragdowy Y
  drawAxis(historyZ, '#38bdf8'); // Błękitny Z
}

// ==========================================
// Wizualizacja 3D w Three.js
// ==========================================
function init3D() {
  if (!threeContainer || typeof THREE === 'undefined') return;

  const width = threeContainer.clientWidth || 160;
  const height = threeContainer.clientHeight || 144;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
  camera.position.set(0, 0, 4.2);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  threeContainer.innerHTML = '';
  threeContainer.appendChild(renderer.domElement);

  // Oświetlenie
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xc084fc, 1.4);
  dirLight.position.set(2, 3, 3);
  scene.add(dirLight);

  // Telefon
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

  // Wektor siły
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

// Pętla animacji 60 FPS
let simTimer = 0;
function mainAnimationLoop(timestamp) {
  requestAnimationFrame(mainAnimationLoop);

  // Jeśli brak fizycznego akcelerometru, generuj łagodny szum w spoczynku (dzięki czemu wykres żyje)
  const timeSinceSensor = timestamp - lastSensorTimestamp;
  if (!isRealSensorActive || timeSinceSensor > 1200) {
    simTimer += 0.04;
    // Delikatne drganie w stanie spoczynku
    const idleX = Math.sin(simTimer * 1.5) * 0.4;
    const idleY = 9.8 + Math.cos(simTimer * 1.2) * 0.3; // grawitacja Ziemi
    const idleZ = Math.sin(simTimer * 0.8) * 0.2;
    pushSensorData(idleX, idleY, idleZ, 0.1);
  }

  // Rysowanie oscyloskopu
  drawOscilloscope();

  // Płynny ruch telefonu 3D
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
// Logika wstrząsu i akcelerometru
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

  // Wypchnięcie do bufora wykresu
  pushSensorData(x, y, z, totalDelta);

  // Orientacja 3D
  targetRotX = (y / 9.8) * 0.8;
  targetRotY = (-x / 9.8) * 0.8;

  // Pasek siły
  if (forceBar) {
    const percentage = Math.min((totalDelta / shakeThreshold) * 100, 100);
    forceBar.style.width = `${percentage}%`;
  }

  // Wykrycie przekroczenia progu czułości
  if (totalDelta >= shakeThreshold) {
    if (motionStatus) {
      motionStatus.textContent = `Wstrząs (${totalDelta.toFixed(0)} > ${shakeThreshold})! 💥`;
      motionStatus.className = "text-[11px] text-emerald-400 font-bold animate-pulse";
    }
    revealNextDigit();
    setTimeout(() => {
      if (motionStatus) {
        motionStatus.textContent = "Zatrzęś telefonem!";
        motionStatus.className = "text-slate-300 font-medium text-[11px]";
      }
    }, 450);
  }

  lastX = x;
  lastY = y;
  lastZ = z;
}

// Referencje diagnostyczne
let diagDot, diagTitle, diagEventsBadge, diagMessage, diagProtocol, diagApi, diagSecure;
let sensorEventCount = 0;

function updateDiagnosticUI(status, title, message) {
  if (!diagDot || !diagTitle || !diagMessage) return;

  diagTitle.textContent = title;
  diagMessage.textContent = message;

  if (status === 'active') {
    diagDot.className = "w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse";
    diagMessage.className = "text-[11px] text-emerald-300 font-medium leading-tight";
  } else if (status === 'warning') {
    diagDot.className = "w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse";
    diagMessage.className = "text-[11px] text-amber-300/90 leading-tight";
  } else if (status === 'error') {
    diagDot.className = "w-2.5 h-2.5 rounded-full bg-rose-500";
    diagMessage.className = "text-[11px] text-rose-300 leading-tight";
  }
}

function handleMotionEvent(event) {
  sensorEventCount++;
  if (diagEventsBadge) {
    diagEventsBadge.textContent = `Zdarzeń: ${sensorEventCount}`;
    diagEventsBadge.className = "font-mono-pi text-[10px] px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/50";
  }

  const acc = event.accelerationIncludingGravity || event.acceleration;
  if (!acc || acc.x === null) {
    if (sensorEventCount === 1) {
      updateDiagnosticUI('warning', 'Puste odczyty', 'Czujnik zgłasza zdarzenia, ale brak danych (wartości null).');
    }
    return;
  }

  if (sensorEventCount === 1 || !isRealSensorActive) {
    updateDiagnosticUI('active', 'Czujnik aktywny!', 'Odbieranie danych z akcelerometru na żywo.');
  }

  processAcceleration(acc.x || 0, acc.y || 0, acc.z || 0);
}

// Symulacja wstrząsu (przycisk testowy)
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

// Inicjalizacja i pełna diagnostyka sensora
function setupMotion() {
  const isHttps = window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost';
  const hasMotionApi = 'DeviceMotionEvent' in window;
  const needsIosPermission = hasMotionApi && typeof DeviceMotionEvent.requestPermission === 'function';

  // Wypełnienie szczegółów technicznych w pasku
  if (diagProtocol) diagProtocol.textContent = `Protokół: ${window.location.protocol.replace(':', '').toUpperCase()}`;
  if (diagApi) diagApi.textContent = `DeviceMotion: ${hasMotionApi ? 'TAK' : 'BRAK'}`;
  if (diagSecure) diagSecure.textContent = `SecureContext: ${window.isSecureContext ? 'TAK' : 'NIE'}`;

  // 1. Sprawdzenie iOS (Safari)
  if (needsIosPermission) {
    if (btnPermission) btnPermission.classList.remove('hidden');
    updateDiagnosticUI(
      'warning',
      'Wymagana zgoda (iOS)',
      'Kliknij przycisk poniżej ("Włącz czujnik ruchu"), aby nadać uprawnienia w Safari.'
    );

    if (btnPermission) {
      btnPermission.onclick = () => {
        DeviceMotionEvent.requestPermission()
          .then(state => {
            if (state === 'granted') {
              btnPermission.classList.add('hidden');
              window.addEventListener('devicemotion', handleMotionEvent, true);
              updateDiagnosticUI('active', 'Zgoda udzielona!', 'Akcelerometr aktywny. Wykrywanie wstrząsów...');
              if (motionStatus) motionStatus.textContent = "Czujnik aktywny! 📱";
            } else {
              updateDiagnosticUI('error', 'Odrzucono zgodę', 'Safari odmówiło dostępu do czujników ruchu.');
            }
          })
          .catch(err => {
            updateDiagnosticUI('error', 'Błąd uprawnień', `Błąd: ${err.message || err}`);
          });
      };
    }
    return;
  }

  // 2. Sprawdzenie Android / Chrome na niezabezpieczonym HTTP
  if (!isHttps && !window.location.hostname.includes('localhost')) {
    updateDiagnosticUI(
      'warning',
      'Ostrzeżenie HTTP (Android)',
      'Chrome na Androidzie blokuje akcelerometr na zwykłym HTTP. Jeśli wykres stoi, wymagany jest HTTPS.'
    );
  }

  // 3. Rejestracja standardowa (Android / Desktop)
  if (hasMotionApi) {
    window.addEventListener('devicemotion', handleMotionEvent, true);
    
    // Sprawdź za 1.2s czy jakiekolwiek zdarzenie dotarło
    setTimeout(() => {
      if (sensorEventCount === 0) {
        if (!isHttps) {
          updateDiagnosticUI(
            'error',
            'Brak zdarzeń ruchu',
            'Przeglądarka zablokowała czujnik z powodu braku HTTPS (lub urządzenie nie posiada akcelerometru).'
          );
        } else {
          updateDiagnosticUI(
            'warning',
            'Oczekiwanie na ruch',
            'Brak zdarzeń akcelerometru. Porusz telefonem lub użyj przycisku testowego.'
          );
        }
      }
    }, 1200);
  } else {
    updateDiagnosticUI(
      'error',
      'Brak API czujnika',
      'Ta przeglądarka nie wspiera DeviceMotionEvent. Działa tryb symulacji.'
    );
  }
}

// ==========================================
// Główny punkt startowy
// ==========================================
function initializeApp() {
  // Pobranie elementów DOM
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
  btnPermission = document.getElementById('btn-permission');
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

  // Elementy diagnostyczne
  diagDot = document.getElementById('diag-dot');
  diagTitle = document.getElementById('diag-title');
  diagEventsBadge = document.getElementById('diag-events-badge');
  diagMessage = document.getElementById('diag-message');
  diagProtocol = document.getElementById('diag-protocol');
  diagApi = document.getElementById('diag-api');
  diagSecure = document.getElementById('diag-secure');

  // Obsługa suwaka progu czułości
  if (thresholdSlider) {
    thresholdSlider.addEventListener('input', (e) => {
      updateThreshold(e.target.value);
    });
    thresholdSlider.addEventListener('change', (e) => {
      updateThreshold(e.target.value);
    });
    updateThreshold(thresholdSlider.value);
  }

  // Przyciski akcji
  if (btnShake) btnShake.addEventListener('click', triggerSimulatedShake);
  if (btnReset) btnReset.addEventListener('click', resetAll);
  if (btnCopy) btnCopy.addEventListener('click', copyPi);

  // Inicjalizacja komponentów
  setupCanvas();
  init3D();
  setupMotion();
  requestAnimationFrame(mainAnimationLoop);
}

// Uruchom po załadowaniu DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
