import initZZFX, {
  generateMusic,
  playMusic,
  playSound,
  toggle,
} from "./zzfx.js";

// A soft, magical "unicorn" instrument set used by the music tracks below.
// ZzFX params: volume, randomness, frequency, attack, sustain, release, shape,
// shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise,
// modulation, bitCrush, delay, sustainVolume, decay, tremolo.
const INSTRUMENTS = [
  // 0: music-box / celeste lead (gentle sine pluck with a hint of echo)
  [0.5, 0, 261.63, 0.01, 0, 0.35, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0.14, 0.3, 0.1],
  // 1: warm shimmering pad (soft triangle, slow, subtle tremolo)
  [
    0.3, 0, 130.81, 0.06, 0.25, 0.5, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.5,
    0.1, 0.06,
  ],
  // 2: high sparkle (very soft, echoey twinkles)
  [0.22, 0, 523.25, 0.01, 0, 0.4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.2, 0.05],
];

// A gentle, wandering loop in C major built from three 4-bar patterns played
// as A-B-A-C (16 bars). Each pattern ends on the dominant (G) so the loop point
// flows back into pattern A with no obvious "final". The lead is a music-box
// arpeggio (instrument 0), the pad holds soft roots/fifths (instrument 1, where
// 0 = sustain, -1 = rest) and pattern B adds high sparkles (instrument 2).
const mainMusic = generateMusic([
  INSTRUMENTS,
  [
    // pattern 0 (A) — flowing mid register: Cadd9 - Am7 - Fmaj7 - Gsus
    [
      [
        0, 0, 19, 24, 28, 26, 24, 28, 19, -1, 21, 24, 28, 26, 24, 21, 16, -1,
        17, 21, 24, 28, 29, 28, 24, -1, 19, 23, 26, 31, 26, 23, 19, -1,
      ],
      [
        1, 0, 12, 0, 0, 0, 19, 0, 0, 0, 9, 0, 0, 0, 16, 0, 0, 0, 5, 0, 0, 0, 12,
        0, 0, 0, 7, 0, 0, 0, 14, 0, 0, 0,
      ],
    ],
    // pattern 1 (B) — brighter, higher, with twinkles: Fmaj7 - Cadd9 - Dm7 - Gsus
    [
      [
        0, 0, 24, 28, 29, 33, 31, 29, 28, 24, 26, 31, 28, 24, 26, 28, 31, -1,
        26, 29, 33, 31, 29, 26, 21, -1, 31, 28, 26, 23, 26, 19, -1, -1,
      ],
      [
        1, 0, 5, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 19, 0, 0, 0, 2, 0, 0, 0, 9,
        0, 0, 0, 7, 0, 0, 0, 14, 0, 0, 0,
      ],
      [
        2, 0, -1, -1, -1, -1, 24, -1, -1, -1, -1, -1, -1, -1, 28, -1, -1, -1,
        -1, -1, -1, -1, 26, -1, -1, -1, -1, -1, -1, -1, 31, -1, -1, -1,
      ],
    ],
    // pattern 2 (C) — calmer, sparser breathing room: Am7 - Fmaj7 - Dm7 - Gsus
    [
      [
        0, 0, 21, -1, 24, -1, 28, -1, 24, -1, 17, -1, 21, -1, 24, -1, 21, -1,
        14, -1, 17, -1, 21, -1, 17, -1, 19, -1, 23, -1, 19, -1, -1, -1,
      ],
      [
        1, 0, 9, 0, 0, 0, 16, 0, 0, 0, 5, 0, 0, 0, 12, 0, 0, 0, 2, 0, 0, 0, 9,
        0, 0, 0, 7, 0, 0, 0, 14, 0, 0, 0,
      ],
    ],
  ],
  [0, 1, 0, 2],
  70,
]);

// Sparkly rising arpeggio for a win.
const winJingle = generateMusic([
  INSTRUMENTS,
  [[[0, 0, 12, 16, 19, 24, 28, 31, 36, -1]]],
  [0],
  90,
]);

export const bonusTaken = () =>
  playSound([539, 0, 0.04, 0.29, 1, 1.92, , , 567, 0.02, 0.02, , , , 0.04]);

export const battleWin = () => playMusic(winJingle);

export const battleLost = () =>
  playSound([925, 0.04, 0.3, 0.6, 1, 0.3, , 6.27, -184, 0.09, 0.17]);

export const itemThrow = () =>
  playSound([537, 0.02, 0.02, 0.22, 1, 1.59, -6.98, 4.97]);

export const click = () =>
  playSound([20, 0.02, , 0.04, 1, 3, 41, , , , , , 1, , , , , 1]);

export function toggleSounds(isMuted) {
  toggle(isMuted);
}

function playMainMusic() {
  playMusic(mainMusic, true);
}

// Called once, on the user gesture that enables sound (ticking the checkbox),
// so the audio context is allowed to start. Sound is off by default.
export default function init() {
  initZZFX({ defaultMuted: false });
  playMainMusic();

  document.body.addEventListener("click", (e) => {
    const { tagName: t } = e.target;
    if (t === "A" || t === "INPUT" || t === "BUTTON") {
      click();
    }
  });
}
