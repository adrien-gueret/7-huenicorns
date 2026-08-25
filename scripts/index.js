import initSections from "./sections.js";

import initState, { areSoundMuted } from "./state.js";
import initSounds from "./sounds.js";
import {
  initBoard,
  enterGame,
  hostGame,
  joinGame,
  leaveOnline,
} from "./game/board.js";

// Five random uppercase letters — short enough to read out, big enough to
// avoid accidental room collisions on the shared relay.
const randCode = () =>
  Array.from({ length: 5 }, () =>
    String.fromCharCode(65 + ((Math.random() * 26) | 0)),
  ).join("");

function initOnlineLobby() {
  const info = document.getElementById("olInfo");
  document.getElementById("online").addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (!go) return;
    if (go.dataset.go === "host") {
      const code = randCode();
      info.textContent = `Share this code: ${code} — waiting for an opponent…`;
      hostGame(code);
    } else {
      const code = document.getElementById("olCode").value.toUpperCase().trim();
      if (code.length < 3) {
        info.textContent = "Enter the code your opponent shared.";
        return;
      }
      info.textContent = "Connecting…";
      joinGame(code);
    }
  });
}

(async () => {
  initState();
  initBoard();
  initOnlineLobby();

  let isSoundInit = false;
  initSections(({ currentSection, nextSection }) => {
    if (nextSection === "game") {
      enterGame();
    }

    // Leaving the lobby/board back toward the menu tears down any relay link.
    if (nextSection === "title" || nextSection === "play") {
      leaveOnline();
    }

    if (!isSoundInit && currentSection === "title" && nextSection !== "title") {
      isSoundInit = true;
      initSounds(areSoundMuted());
    }
  });
})();
