import initSections from "./sections.js";

import initState, { areSoundMuted } from "./state.js";
import initSounds from "./sounds.js";
import { initBoard, enterGame } from "./game/board.js";

(async () => {
  initState();
  initBoard();

  let isSoundInit = false;
  initSections(({ currentSection, nextSection }) => {
    if (nextSection === "game") {
      enterGame();
    }

    if (!isSoundInit && currentSection === "title" && nextSection !== "title") {
      isSoundInit = true;
      initSounds(areSoundMuted());
    }
  });
})();
