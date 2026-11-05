/**
 * js/timer.js — Cronómetro de descanso con vibración háptica y avisos sonoros
 * 
 * Responsabilidades:
 * - Cuenta regresiva automática al completar una serie.
 * - Vibración háptica en dispositivos móviles (navigator.vibrate).
 * - Beep de audio sintetizado con Web Audio API (100% offline sin mp3 externos).
 * - Floating mini-timer persistente en UI.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Timer = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const Timer = {
    isRunning: false,
    segundosTotales: 90,
    segundosRestantes: 0,
    intervalId: null,
    listeners: new Set(),
    audioCtx: null
  };

  function playBeep(freq = 880, duration = 0.15) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!Timer.audioCtx) {
        Timer.audioCtx = new AudioContext();
      }
      if (Timer.audioCtx.state === 'suspended') {
        Timer.audioCtx.resume();
      }

      const osc = Timer.audioCtx.createOscillator();
      const gain = Timer.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, Timer.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.15, Timer.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, Timer.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(Timer.audioCtx.destination);

      osc.start();
      osc.stop(Timer.audioCtx.currentTime + duration);
    } catch {
      // Ignorar si el navegador bloquea audio sin gesto
    }
  }

  Timer.start = function (segundos = 90) {
    Timer.stop();
    Timer.segundosTotales = Math.max(5, Number(segundos) || 90);
    Timer.segundosRestantes = Timer.segundosTotales;
    Timer.isRunning = true;

    // Vibración suave de inicio de descanso
    if (navigator.vibrate) {
      navigator.vibrate([80]);
    }

    Timer.notify();

    Timer.intervalId = setInterval(() => {
      Timer.segundosRestantes -= 1;

      if (Timer.segundosRestantes <= 0) {
        Timer.finish();
      } else {
        if (Timer.segundosRestantes <= 3) {
          playBeep(600, 0.08);
          if (navigator.vibrate) navigator.vibrate([40]);
        }
        Timer.notify();
      }
    }, 1000);
  };

  Timer.finish = function () {
    Timer.stop();
    // Vibración háptica intensa de fin de descanso
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }
    // Doble beep agudo de aviso
    playBeep(880, 0.2);
    setTimeout(() => playBeep(1100, 0.3), 220);
    Timer.notify();
  };

  Timer.stop = function () {
    if (Timer.intervalId) {
      clearInterval(Timer.intervalId);
      Timer.intervalId = null;
    }
    Timer.isRunning = false;
    Timer.segundosRestantes = 0;
    Timer.notify();
  };

  Timer.addSeconds = function (delta) {
    if (!Timer.isRunning) {
      Timer.start(Math.max(15, delta));
      return;
    }
    Timer.segundosRestantes = Math.max(5, Timer.segundosRestantes + delta);
    Timer.segundosTotales = Math.max(Timer.segundosTotales, Timer.segundosRestantes);
    Timer.notify();
  };

  Timer.format = function (seg = Timer.segundosRestantes) {
    const s = Math.max(0, Math.floor(seg));
    const m = Math.floor(s / 60);
    const resto = s % 60;
    return `${m}:${String(resto).padStart(2, '0')}`;
  };

  Timer.subscribe = function (cb) {
    Timer.listeners.add(cb);
    return () => Timer.listeners.delete(cb);
  };

  Timer.notify = function () {
    for (const cb of Timer.listeners) {
      try {
        cb({
          isRunning: Timer.isRunning,
          segundosRestantes: Timer.segundosRestantes,
          segundosTotales: Timer.segundosTotales,
          formateado: Timer.format()
        });
      } catch (e) {
        console.error('Error en callback de Timer:', e);
      }
    }
  };

  return Timer;
});
