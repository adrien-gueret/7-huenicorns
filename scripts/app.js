// Shared application bootstrap. Both entry points (the default relay build and
// the Wavedash build) call boot() with the transport they want board.js to use.
import initSections from "./sections.js";

import initSounds, { toggleSounds } from "./sounds.js";
import {
  initBoard,
  enterGame,
  setTransport,
  hostGame,
  joinGame,
  leaveOnline,
} from "./game/board.js";

function initOnlineLobby() {
  const info = document.getElementById("olInfo");
  const setInfo = (t) => (info.textContent = t);

  document.getElementById("olsec").addEventListener("click", (e) => {
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

// Sound is off until the player ticks "Enable sounds". That tick is a user
// gesture, which is what lets us start the audio context; the first one boots
// the sound system, later ones just mute/unmute. It is never persisted.
function initSoundToggle() {
  const box = document.getElementById("soundsCheckbox");
  box.checked = false;
  let ready = false;
  box.addEventListener("change", () => {
    if (ready) toggleSounds(!box.checked);
    else {
      ready = true;
      initSounds();
    }
  });
}

export function boot(transport) {
  setTransport(transport);
  initBoard();
  initOnlineLobby();
  initSoundToggle();

  initSections(({ nextSection }) => {
    if (nextSection === "game") {
      enterGame();
    }

    // Leaving the lobby/board back toward the menu tears down any relay link.
    if (nextSection === "title" || nextSection === "play") {
      leaveOnline();
    }
  });
}
