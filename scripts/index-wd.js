// Wavedash entry point. Built with `npm run build:wd`; never bundled into the
// default (JS13K) build, so its SDK glue costs nothing to the lean version.
//
// This build only ever runs on Wavedash (the platform, or `wavedash dev`),
// where the `Wavedash` global is injected before our code. So it uses the
// native lobby/P2P transport exclusively — the relay is not imported here,
// which keeps net.js out of the bundle and this build under the size budget.
import { boot } from "./app.js";
import { makeWavedash } from "./wavedash.js";
import { joinGame } from "./game/board.js";

boot(makeWavedash());

// Reveal the game from behind the Wavedash loading screen.
Wavedash.init();

// Invite links arrive as a launch param — join that lobby straight away.
const params = Wavedash.getLaunchParams();
if (params && params.lobby) joinGame(params.lobby, () => {});
