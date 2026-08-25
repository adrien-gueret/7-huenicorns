// Shared application bootstrap. Both entry points (the default relay build and
// the Wavedash build) call boot() with the transport they want board.js to use.
import initSections from "./sections.js";

import initState, { areSoundMuted } from "./state.js";
import initSounds from "./sounds.js";
import {
  initBoard,
  enterGame,
  setTransport,
  onlineNeedsCode,
  hostGame,
  joinGame,
  leaveOnline,
} from "./game/board.js";

function initOnlineLobby() {
  const info = document.getElementById("olInfo");
  const setInfo = (t) => (info.textContent = t);

  // Some transports (Wavedash) match players automatically and have no code.
  if (!onlineNeedsCode())
    document.getElementById("olCode").style.display = "none";

  document.getElementById("online").addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (!go) return;
    if (go.dataset.go === "host") {
      hostGame(setInfo);
    } else {
      const code = document.getElementById("olCode").value.toUpperCase().trim();
      joinGame(code, setInfo);
    }
  });
}

export function boot(transport) {
  initState();
  setTransport(transport);
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
}
