import { useCallback, useEffect, useRef } from "react";

// ─── Tiny Web Audio sound generator ──────────────────────────────────────────
// Generates sounds programmatically — no external audio files needed.

function createAudioContext(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
}

/** Play a cool 2-tone melodic chime (new message) */
function playMessageSound(ctx: AudioContext) {
  const t = ctx.currentTime;
  
  // Creates a clean, modern "ping-pong" bell sound
  const playTone = (freq: number, startTime: number, vol: number, dur: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, startTime);
    
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
    
    osc.start(startTime);
    osc.stop(startTime + dur);
  };

  // Two quick ascending bells: D6 -> F#6
  playTone(1174.66, t, 0.16, 0.25);       // D6
  playTone(1479.98, t + 0.07, 0.18, 0.4); // F#6
}

/** Play a syncopated modern marimba-synth arpeggio (call ring) */
function playRingSound(ctx: AudioContext) {
  const t = ctx.currentTime;
  
  const playPulse = (freq: number, type: OscillatorType, startTime: number, vol: number, dur: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(3000, startTime);
    filter.frequency.exponentialRampToValueAtTime(300, startTime + dur);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
    
    osc.start(startTime);
    osc.stop(startTime + dur);
  };

  // Syncopated modern ringing pattern (Cm9 arpeggio layout)
  const notes = [
    { f: 523.25, time: 0 },         // C5
    { f: 622.25, time: 0.14 },      // Eb5
    { f: 783.99, time: 0.28 },      // G5
    { f: 1174.66, time: 0.42 },     // D6
    { f: 783.99, time: 0.70 },      // G5 (down)
    { f: 622.25, time: 0.84 },      // Eb5
  ];

  notes.forEach(note => {
    // Layer sine for body, triangle for pluck
    playPulse(note.f, "sine", t + note.time, 0.25, 0.4);
    playPulse(note.f, "triangle", t + note.time, 0.1, 0.15);
  });
}

// ─── Hook ────────────────────────────────────────────────────────────────────

const SOUND_PREF_KEY = "bobacord_sound_enabled";

export function useNotifications() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef<boolean>(
    localStorage.getItem(SOUND_PREF_KEY) !== "false"
  );

  // Request browser notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  /** Lazily initialize AudioContext on first user interaction */
  const getAudioCtx = useCallback((): AudioContext | null => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = createAudioContext();
    }
    // Resume if browser suspended it
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  /** Play a soft notification pop (new message) */
  const playNotificationSound = useCallback(() => {
    if (!soundEnabledRef.current) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    try { playMessageSound(ctx); } catch { /* Ignore AudioContext errors */ }
  }, [getAudioCtx]);

  /** Play a ringing alert (incoming call / mention) */
  const playAlertSound = useCallback(() => {
    if (!soundEnabledRef.current) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    try { playRingSound(ctx); } catch { /* Ignore AudioContext errors */ }
  }, [getAudioCtx]);

  /** Toggle mute — persisted to localStorage */
  const setSoundEnabled = useCallback((enabled: boolean) => {
    soundEnabledRef.current = enabled;
    localStorage.setItem(SOUND_PREF_KEY, String(enabled));
  }, []);

  const isSoundEnabled = useCallback(() => soundEnabledRef.current, []);

  /** Show a browser desktop notification (only when tab hidden) */
  const sendNotification = useCallback((title: string, options?: NotificationOptions) => {
    if ("Notification" in window && Notification.permission === "granted") {
      if (document.visibilityState === "visible") return;
      const notification = new Notification(title, {
        icon: "/favicon.svg",
        badge: "/favicon.svg",
        ...options,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  }, []);

  return {
    sendNotification,
    playNotificationSound,
    playAlertSound,
    setSoundEnabled,
    isSoundEnabled,
  };
}
