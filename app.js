// Stan aplikacji
let revealedCount = 0; // ile cyfr po przecinku odkryto
let lastShakeTime = 0;
const SHAKE_COOLDOWN_MS = 250; // minimalna przerwa między cyframi
const SHAKE_THRESHOLD = 18; // próg przyspieszenia (m/s^2)

// Referencje do elementów DOM
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
const bgGlow = document.getElementById('bg-glow');

// Generator Pi (zapasowy, gdy skończą się predefiniowane)
let piGenerator = null;
let customGeneratedDigits = "";

// Audio Context dla syntezowanego dźwięku 'pop/click'
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
    
    // Częstotliwość modulowana dla soczystego 'blip'
    const freq = 440 + Math.min(revealedCount * 8, 800);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, audioCtx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.09);
  } catch (e) {
    console.error("Audio error", e);
  }
}

// Pobieranie n-tej cyfry liczby Pi (indeks od 0 = pierwsza po przecinku '1')
function getNextPiDigit(index) {
  // PI_DIGITS zaczyna się od "3." więc indeks 0 to znak na pozycji 2 ("1")
  const dataOffset = 2; // pomijamy '3' i '.'
  if (index + dataOffset < window.PI_DIGITS.length) {
    return window.PI_DIGITS[index + dataOffset];
  }

  // W razie przekroczenia wbudowanego bufora generujemy Spigotem
  if (!piGenerator) {
    piGenerator = window.generatePiDigits();
    // Przewiń pierwsze 3 i już pobrane cyfry
    piGenerator.next(); // 3
    for (let i = 0; i < window.PI_DIGITS.length - 2; i++) {
      piGenerator.next();
    }
  }
  return piGenerator.next().value.toString();
}

// Funkcja dodająca nową cyfrę
function revealNextDigit() {
  const now = Date.now();
  if (now - lastShakeTime < SHAKE_COOLDOWN_MS) return;
  lastShakeTime = now;

  const nextDigit = getNextPiDigit(revealedCount);
  revealedCount++;

  // Aktualizacja badge'a i karty
  digitCountBadge.textContent = revealedCount;
  latestDigitEl.textContent = nextDigit;
  digitPosEl.textContent = `Pozycja po przecinku: #${revealedCount}`;

  // Animacja karty głównej
  latestDigitCard.classList.remove('scale-105', 'border-purple-400');
  latestDigitCard.classList.add('scale-105', 'border-purple-400');
  digitRing.classList.add('opacity-90', 'scale-110');
  setTimeout(() => {
    latestDigitCard.classList.remove('scale-105', 'border-purple-400');
    digitRing.classList.remove('opacity-90', 'scale-110');
  }, 180);

  // Dodanie do kontenera z ciągiem
  const span = document.createElement('span');
  span.textContent = nextDigit;
  span.className = 'inline-block text-purple-200 animate-pop-in hover:text-white transition';
  digitsContainer.appendChild(span);

  // Auto-przewijanie na koniec
  digitsContainer.scrollTop = digitsContainer.scrollHeight;

  // Haptic feedback (wibracje telefonu)
  if (toggleVibrate.checked && 'vibrate' in navigator) {
    navigator.vibrate(35);
  }

  // Dźwięk
  playPopSound();

  // Wizualne poruszenie ikony telefonu
  phoneIcon.classList.remove('animate-shake-hint');
  void phoneIcon.offsetWidth; // reset animacji CSS
  phoneIcon.classList.add('animate-shake-hint');
}

// Resetowanie stanu
function resetAll() {
  revealedCount = 0;
  digitCountBadge.textContent = "0";
  latestDigitEl.textContent = "3";
  digitPosEl.textContent = "Start: 3.";
  digitsContainer.innerHTML = '<span class="text-purple-400 font-bold text-lg">3.</span>';
  piGenerator = null;
}

// Kopiowanie całego wygenerowanego ciągu Pi
function copyPi() {
  let text = "3.";
  for (let i = 0; i < revealedCount; i++) {
    text += getNextPiDigit(i);
  }
  navigator.clipboard.writeText(text).then(() => {
    copyText.textContent = "Skopiowano!";
    setTimeout(() => {
      copyText.textContent = "Kopiuj";
    }, 1500);
  }).catch(() => {
    copyText.textContent = "Błąd";
  });
}

// Detekcja wstrząsów akcelerometru
let lastX = null, lastY = null, lastZ = null;

function handleMotion(event) {
  const acc = event.accelerationIncludingGravity || event.acceleration;
  if (!acc || acc.x === null) return;

  const x = acc.x;
  const y = acc.y;
  const z = acc.z;

  if (lastX !== null) {
    const deltaX = Math.abs(x - lastX);
    const deltaY = Math.abs(y - lastY);
    const deltaZ = Math.abs(z - lastZ);
    const totalDelta = deltaX + deltaY + deltaZ;

    // Aktualizacja paska siły (max ok. 35)
    const percentage = Math.min((totalDelta / 30) * 100, 100);
    forceBar.style.width = `${percentage}%`;

    if (totalDelta > SHAKE_THRESHOLD) {
      motionStatus.textContent = "Wykryto potrząśnięcie! 🚀";
      motionStatus.classList.add('text-purple-300');
      revealNextDigit();
      setTimeout(() => {
        motionStatus.textContent = "Zatrzęś telefonem!";
        motionStatus.classList.remove('text-purple-300');
      }, 500);
    }
  }

  lastX = x;
  lastY = y;
  lastZ = z;
}

// Sprawdzenie i obsługa uprawnień DeviceMotion (wymagane w iOS 13+)
function setupMotionListener() {
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    // iOS Safari wymaga jawnej zgody po kliknięciu
    btnPermission.classList.remove('hidden');
    btnPermission.addEventListener('click', () => {
      DeviceMotionEvent.requestPermission()
        .then(permissionState => {
          if (permissionState === 'granted') {
            btnPermission.classList.add('hidden');
            window.addEventListener('devicemotion', handleMotion, true);
            motionStatus.textContent = "Akcelerometr aktywny! Machaj 📱";
          } else {
            alert('Brak uprawnień do czujnika ruchu.');
          }
        })
        .catch(console.error);
    });
  } else if ('ondevicemotion' in window) {
    // Android / inne przeglądarki
    window.addEventListener('devicemotion', handleMotion, true);
    motionStatus.textContent = "Czujnik aktywny! Potrząśnij 📱";
  } else {
    motionStatus.textContent = "Brak czujnika (użyj przycisku poniżej)";
  }
}

// Event Listeners
btnShake.addEventListener('click', () => {
  // Symulacja impulsu siły na pasku
  forceBar.style.width = '100%';
  setTimeout(() => { forceBar.style.width = '0%'; }, 250);
  revealNextDigit();
});

btnReset.addEventListener('click', resetAll);
btnCopy.addEventListener('click', copyPi);

// Inicjalizacja
document.addEventListener('DOMContentLoaded', () => {
  setupMotionListener();
});
