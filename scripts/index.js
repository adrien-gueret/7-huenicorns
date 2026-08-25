// Default entry point (GitHub Pages, itch, JS13K submission). Relay only, so the
// bundle stays lean — the Wavedash SDK glue is never imported here.
import { boot } from "./app.js";
import { relay } from "./net.js";

boot(relay);
