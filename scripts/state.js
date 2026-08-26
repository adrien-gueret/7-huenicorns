import { newGame } from "./game/engine.js";

// The whole app only needs the current game in memory. Sound is opt-in and
// never persisted, so there is nothing to save or restore between reloads.
let game = null;

export const getGame = () => game;
export const setGame = (g) => (game = g);
export const startGame = () => (game = newGame());
