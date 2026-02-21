let audioContext = null;

const createAudioContext = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  return new AudioContextClass();
};

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = createAudioContext();
  }

  if (!audioContext) {
    return null;
  }

  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }

  return audioContext;
};

const scheduleTone = (
  context,
  startTime,
  { frequency, duration = 0.11, gain = 0.045, type = "sine", endFrequency },
) => {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const safeGain = Math.max(gain, 0.0001);
  const releaseTime = startTime + duration;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  if (endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, releaseTime);
  }

  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(safeGain, startTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, releaseTime);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(releaseTime + 0.03);
};

const playPattern = (enabled, tones) => {
  if (!enabled) {
    return;
  }

  const context = getAudioContext();
  if (!context) {
    return;
  }

  const startTime = context.currentTime + 0.01;
  tones.forEach((tone) => {
    scheduleTone(context, startTime + (tone.when ?? 0), tone);
  });
};

export const playMoveSfx = (enabled) =>
  playPattern(enabled, [
    { frequency: 540, when: 0, duration: 0.08, gain: 0.034, type: "triangle" },
    { frequency: 680, when: 0.05, duration: 0.09, gain: 0.03, type: "triangle" },
  ]);

export const playXMoveSfx = (enabled) =>
  playPattern(enabled, [
    { frequency: 560, when: 0, duration: 0.07, gain: 0.032, type: "triangle" },
    { frequency: 720, when: 0.05, duration: 0.08, gain: 0.034, type: "triangle" },
    { frequency: 900, when: 0.1, duration: 0.09, gain: 0.036, type: "sine" },
  ]);

export const playOMoveSfx = (enabled) =>
  playPattern(enabled, [
    { frequency: 520, when: 0, duration: 0.08, gain: 0.032, type: "triangle" },
    { frequency: 410, when: 0.06, duration: 0.09, gain: 0.03, type: "triangle" },
    { frequency: 310, when: 0.12, duration: 0.1, gain: 0.028, type: "sine" },
  ]);

export const playInterTurnSfx = (enabled) =>
  playPattern(enabled, [
    { frequency: 482, when: 0.18, duration: 0.06, gain: 0.017, type: "sine" },
    { frequency: 535, when: 0.24, duration: 0.07, gain: 0.016, type: "sine" },
  ]);

export const playInvalidSfx = (enabled) =>
  playPattern(enabled, [
    {
      frequency: 200,
      endFrequency: 130,
      when: 0,
      duration: 0.14,
      gain: 0.028,
      type: "sawtooth",
    },
  ]);

export const playLocalWinSfx = (enabled) =>
  playPattern(enabled, [
    { frequency: 392, when: 0, duration: 0.1, gain: 0.03, type: "triangle" },
    { frequency: 523, when: 0.08, duration: 0.11, gain: 0.032, type: "triangle" },
    { frequency: 659, when: 0.16, duration: 0.12, gain: 0.034, type: "triangle" },
  ]);

export const playSuperWinSfx = (enabled) =>
  playPattern(enabled, [
    { frequency: 523, when: 0, duration: 0.11, gain: 0.036, type: "triangle" },
    { frequency: 659, when: 0.1, duration: 0.11, gain: 0.038, type: "triangle" },
    { frequency: 784, when: 0.2, duration: 0.12, gain: 0.04, type: "triangle" },
    { frequency: 1047, when: 0.32, duration: 0.2, gain: 0.046, type: "sine" },
  ]);

export const playDrawSfx = (enabled) =>
  playPattern(enabled, [
    { frequency: 440, when: 0, duration: 0.1, gain: 0.028, type: "sine" },
    { frequency: 392, when: 0.1, duration: 0.1, gain: 0.026, type: "sine" },
    { frequency: 349, when: 0.2, duration: 0.14, gain: 0.024, type: "sine" },
  ]);
