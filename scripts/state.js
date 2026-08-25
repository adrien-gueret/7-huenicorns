import { newGame } from "./game/engine.js";

// The whole app only needs two pieces of state, so plain module variables are
// enough — no reducer/store indirection required.
const STORAGE_KEY = "7-huenicorns";

let muted = false;
let game = null;

export const getGame = () => game;
export const setGame = (g) => (game = g);
export const startGame = () => (game = newGame());

export const areSoundMuted = () => muted;
export const toggleMuteSounds = (isMuted) => {
  muted = isMuted;
  try {
    localStorage.setItem(STORAGE_KEY, isMuted ? "1" : "");
  } catch (_) {}
};

export default function init() {
  // Only the sound preference survives reloads; games always start fresh
  // (the ruleset changed, so any old saved game would be incompatible).
  try {
    muted = !!localStorage.getItem(STORAGE_KEY);
  } catch (_) {}
}
