// Game screen rendering + human interaction, and the AI turn loop.
import { goToSection } from "../sections.js";
import { getGame, setGame, startGame } from "../state.js";
import { CNAMES, colorOf, valueOf, opp, makes7 } from "./rules.js";
import {
  applySplit,
  applyChoose,
  doTransform,
  skipTransform,
  doDiscard,
  transformOptions,
  fragCount,
  MAX_UNICORNS,
} from "./engine.js";
import { aiSplit, aiChoose, aiTransform, aiDiscard } from "./ai.js";
import { bonusTaken, battleWin, battleLost, itemThrow } from "../sounds.js";

// The networking transport is injected at startup (relay by default, Wavedash
// on that platform) so this module stays transport-agnostic. It implements
// host(h) / join(code, h) / send(state) / close() / needsCode.
let transport = null;
export function setTransport(t) {
  transport = t;
}
export function onlineNeedsCode() {
  return !transport || transport.needsCode !== false;
}

// Play a sound effect, ignoring errors if audio is not initialised yet.
const sfx = (fn) => {
  try {
    fn();
  } catch (_) {}
};

let boardEl;
let busy = false; // blocks input while a transform animation plays
let endShown = false; // guards the one-shot end-of-game jingle

// Transient human selections (never persisted).
let splitA = []; // ids placed in Pair A while splitting
let splitB = []; // ids placed in Pair B
let choicePair = null; // index (0 or 1) of the pair the chooser keeps
let tPick = null; // first unicorn picked for a Make 7
let tPair = null; // [a,b] awaiting the keep/discard decision
let dragId = null; // card currently dragged during a split
let showDiscard = false; // discard-pile viewer overlay open?
let dealtKey = ""; // signature of the last revealed set already dealt in

// Online play. In single-player these stay at their defaults and the AI drives
// the opponent; online, `mySide` is our engine slot and moves are synced over
// the relay instead of computed by the AI.
let isOnline = false;
let isHost = false; // the host (room creator) is engine side "human"
let mySide = "human"; // which engine slot is the local player
let started = false; // the online match has begun (initial state exchanged)
let oppLeft = false; // the opponent disconnected

function resetRound() {
  splitA = [];
  splitB = [];
  choicePair = null;
  tPick = null;
  tPair = null;
  dragId = null;
}

// Who must act right now, given the current phase.
function activeSide(s) {
  if (s.phase === "split") return s.splitter;
  if (s.phase === "choose") return opp(s.splitter);
  return s.turn; // transform / discard
}

// ---- Rendering ----

function gemsHtml(pl) {
  let h = "";
  for (let c = 0; c < 7; c++) {
    const has = pl.fragments[c] != null;
    h += `<span class="gem ${has ? "" : "empty"}" data-color="${c}"><svg viewBox="0 0 24 24"><polygon points="7,2 17,2 22,7 22,17 17,22 7,22 2,17 2,7"/></svg></span>`;
  }
  return h;
}

function cardHtml(id, zone, cls, drag) {
  const c = colorOf(id);
  const v = valueOf(id);
  return `<div class="card ${cls || ""}" ${drag ? 'draggable="true"' : ""} data-color="${c}" data-id="${id}" data-zone="${zone}" title="${CNAMES[c]} ${v}" style="view-transition-name:v${id};--i:${v - 1};--row:${c}"><span class="v">${v}</span><span class="art"><span class="art-img"></span></span><span class="cn">${CNAMES[c]}</span></div>`;
}

// Neutralise HTML in externally-sourced text (a Wavedash username) so it can be
// dropped into innerHTML safely.
const esc = (t) =>
  ("" + t).replace(/[&<>"]/g, (c) => "&#" + c.charCodeAt(0) + ";");

// Resolve the label + avatar for one side. Online on a platform that exposes
// player identities (Wavedash), show the real name/avatar; otherwise fall back
// to the generic "You" / "Opponent".
function ident(mine, fallback) {
  let name = fallback;
  let av = "";
  const id =
    isOnline && transport && transport.identity && transport.identity(mine);
  if (id) {
    if (id.name) name = id.name;
    if (id.avatar) av = `<img class="av" src="${id.avatar}">`;
  }
  return { av, name: esc(name) };
}

function areaHtml(s, pl, who, theme, cards) {
  const n = fragCount(pl);
  return `<div class="area ${theme}">
      <div class="areaInfo">
        <div class="whoRow">
          ${who.av}<span class="who"><b class="name">${who.name}</b><span class="fc">Fragments: <b>${n}</b>/7</span></span>
        </div>
        <div class="gems">${gemsHtml(pl)}</div>
      </div>
      <div class="areaCards">${cards}</div>
    </div>`;
}

// A player's own unicorns, with highlights during their transform/discard turn.
function handCards(s, side) {
  const pl = s[side];
  if (!pl.unicorns.length) return "";

  const mine = side === mySide;
  const myTurn =
    mine &&
    s.turn === side &&
    (s.phase === "transform" || s.phase === "discard");

  let comp = null;
  let usable = null;
  if (myTurn && s.phase === "transform") {
    usable = new Set(transformOptions(pl).flatMap((o) => [o.keep, o.discard]));
    if (tPick != null)
      comp = new Set(
        pl.unicorns.filter((u) => u !== tPick && makes7(tPick, u)),
      );
  }

  return pl.unicorns
    .map((id) => {
      let cls = "";
      if (myTurn && s.phase === "transform") {
        if (id === tPick) cls = "objective";
        else if (comp && comp.has(id)) cls = "pick";
        else if (tPick == null && usable.has(id)) cls = "hintable";
      } else if (myTurn && s.phase === "discard") {
        cls = "pick";
      }
      return cardHtml(id, mine ? "you" : "ai", cls);
    })
    .join("");
}

// The shared draw pile, shown to the left of the revealed cards.
function deckHtml(s) {
  return `<div class="deckPile" title="Cards left in the deck"><span class="deckN">${s.deck.length}</span></div>`;
}

// The center of the table: the same board-game layout for both phases — deck,
// the revealed pool, and the two pairs. Only the affordances change: the Dealer
// drags the four unicorns into two pairs, the Receiver clicks a pair to keep.
function tableHtml(s) {
  const split = s.phase === "split";
  const choose = s.phase === "choose";
  const rev = s.revealed || [];
  const dc = rev.length && rev.join() !== dealtKey ? "deal" : "";
  if (rev.length) dealtKey = rev.join();
  const human = activeSide(s) === mySide;
  const [pairA, pairB] = choose ? s.pairs : split ? [splitA, splitB] : [[], []];
  const pool = split
    ? rev.filter((id) => !splitA.includes(id) && !splitB.includes(id))
    : [];
  const poolH = pool.length
    ? pool.map((id) => cardHtml(id, "pool", dc, human)).join("")
    : split
      ? '<span class="ph">all placed</span>'
      : "";

  const pairH = (arr, letter, drop, idx) => {
    const on = choicePair === idx;
    const off = choose && human && choicePair != null && !on;
    const cards = arr.length
      ? arr
          .map((id) =>
            split
              ? cardHtml(id, drop, "", human)
              : cardHtml(id, drop, off ? "dim" : on ? "objective" : ""),
          )
          .join("")
      : split
        ? '<span class="ph">Drag 2 cards here</span>'
        : "";
    const cls =
      "dz pairDrop" +
      (arr.length === 2 ? " full" : "") +
      (choose ? " pick" : "") +
      (on ? " sel" : "");
    const pick = choose ? ` data-pick="${idx}"` : "";
    return `<div class="${cls}" data-drop="${drop}"${pick}><div class="dzLabel">Pair ${letter}</div><div class="dzCards">${cards}</div><div class="dzCount">${arr.length} / 2</div></div>`;
  };

  return `<div class="splitBox splitDeal">
      ${deckHtml(s)}
      <div class="dz pool" data-drop="pool"><div class="dzLabel revLabel">\u2726 Revealed cards \u2726</div><div class="dzCards">${poolH}</div></div>
      <div class="splitArrow">\u2192</div>
      <div class="pairs">
        ${pairH(pairA, "A", "pairA", 0)}
        ${pairH(pairB, "B", "pairB", 1)}
      </div>
    </div>`;
}

function offerHtml(s) {
  // Always show the same board-game table (deck + pool + two pairs). Between
  // rounds the zones simply sit empty so nothing shifts or disappears.
  return s.phase === "gameover" ? "" : tableHtml(s);
}

// A read-only overlay listing every card sent to the discard pile.
function discardHtml(s) {
  const cards = s.discard.length
    ? s.discard.map((id) => cardHtml(id, "disc", "")).join("")
    : '<span class="none">The discard pile is empty.</span>';
  return `<div class="overlay discOverlay"><div class="ovbox discBox"><h2>Discard pile (${s.discard.length})</h2><div class="discCards">${cards}</div><button data-action="discClose">Close</button></div></div>`;
}

function statusFor(s) {
  const me = mySide;
  if (s.winner)
    return s.winner === "draw"
      ? "It's a draw!"
      : s.winner === me
        ? "You win!"
        : "The opponent wins!";
  const mine = activeSide(s) === me;
  if (s.phase === "split")
    return mine
      ? "You are the Dealer: make two pairs"
      : "The opponent is dealing\u2026";
  if (s.phase === "choose")
    return mine
      ? "You are the Receiver: take one of the two pairs"
      : "The opponent is choosing\u2026";
  if (s.phase === "transform")
    return mine
      ? "Make 7: pair two unicorns that add up to 7, or skip"
      : "The opponent is transforming\u2026";
  if (s.phase === "discard")
    return mine
      ? "Too many unicorns \u2014 discard down to " + MAX_UNICORNS
      : "The opponent is discarding\u2026";
  return "";
}

function statusHtml(s) {
  return `<div>${statusFor(s)}</div>`;
}

function actionsHtml(s) {
  if (s.winner) return "";
  if (activeSide(s) !== mySide)
    return '<span class="hint">The opponent is playing\u2026</span>';

  if (s.phase === "split") {
    const ready = splitA.length === 2 && splitB.length === 2;
    return `<span class="hint">Drag the four unicorns into two pairs.</span><button data-action="csplit" ${ready ? "" : "disabled"}>Confirm split</button>`;
  }
  if (s.phase === "choose") {
    const ready = choicePair != null;
    return `<span class="hint">Pick one pair to keep both its unicorns.</span><button data-action="cchoose" ${ready ? "" : "disabled"}>Confirm</button>`;
  }
  if (s.phase === "transform") {
    if (tPair) {
      const [a, b] = tPair;
      // Same colour: the choice is moot — just confirm the fragment.
      if (colorOf(a) === colorOf(b)) {
        const name = CNAMES[colorOf(a)];
        const art = /^[AEIOU]/.test(name) ? "an" : "a";
        return `<span class="hint">You will receive ${art} ${name} fragment.</span><button data-keep="${a}" data-disc="${b}">OK</button><button data-action="tcancel">Cancel</button>`;
      }
      let btns = "";
      if (s[mySide].fragments[colorOf(a)] == null)
        btns += `<button data-keep="${a}" data-disc="${b}">${CNAMES[colorOf(a)]}</button>`;
      if (s[mySide].fragments[colorOf(b)] == null)
        btns += `<button data-keep="${b}" data-disc="${a}">${CNAMES[colorOf(b)]}</button>`;
      return `<span class="hint">Which unicorn becomes a fragment?</span>${btns}<button data-action="tcancel">Cancel</button>`;
    }
    const hint =
      tPick == null
        ? "Click a unicorn, then its Make 7 partner, or skip."
        : "Now click a highlighted partner, or skip.";
    return `<span class="hint">${hint}</span><button data-action="tskip">Skip</button>`;
  }
  if (s.phase === "discard") {
    const over = s[mySide].unicorns.length - MAX_UNICORNS;
    return `<span class="hint">Click ${over} unicorn${over > 1 ? "s" : ""} to discard.</span>`;
  }
  return "";
}

function overlayHtml(s) {
  const t =
    s.winner === "draw"
      ? "It's a draw!"
      : s.winner === mySide
        ? "You win!"
        : "The opponent wins!";
  // Online, only the host may start a rematch; the guest waits for the new deck.
  const again =
    !isOnline || isHost
      ? '<button data-action="again">Play again</button>'
      : '<span class="hint">Waiting for the host\u2026</span>';
  return `<div class="overlay"><div class="ovbox"><h2>${t}</h2>${again}<button data-action="title">Back to title</button></div></div>`;
}

// Shown when the online opponent disconnects mid-match.
function leftOverlay() {
  return `<div class="overlay"><div class="ovbox"><h2>Opponent left</h2><button data-action="title">Back to title</button></div></div>`;
}

export function render() {
  const s = getGame();
  // A fresh reveal plays its own deal-from-deck animation, so skip the view
  // transition in that case to avoid stacking two effects.
  const freshDeal =
    s && s.phase === "split" && s.revealed && s.revealed.join() !== dealtKey;
  const prev = cardPositions();
  if (boardEl && document.startViewTransition && !freshDeal) {
    const vt = document.startViewTransition(() => paint());
    vt.finished.then(() => popMoved(prev)).catch(() => {});
  } else {
    paint();
    popMoved(prev);
  }
}

function paint() {
  const s = getGame();
  if (!boardEl) return;
  if (!s) {
    boardEl.innerHTML = "";
    return;
  }
  if (s.winner && !endShown) {
    endShown = true;
    sfx(s.winner === "human" ? battleWin : battleLost);
  }

  boardEl.innerHTML = `
    <h2 class="logo gameLogo">7 Huenicorns</h2>
    <button class="discFab" data-action="discView" title="View the discard pile">Discard: ${s.discard.length}</button>
    <div class="mainCol">
      ${areaHtml(s, s[opp(mySide)], ident(false, "Opponent"), "ai", handCards(s, opp(mySide)))}
      <div class="offer">
        ${offerHtml(s)}
        <div class="status">${statusHtml(s)}</div>
        <div class="actions">${actionsHtml(s)}</div>
      </div>
      ${areaHtml(s, s[mySide], ident(true, "You"), "you", handCards(s, mySide))}
    </div>
    ${oppLeft ? leftOverlay() : s.winner ? overlayHtml(s) : ""}
    ${showDiscard ? discardHtml(s) : ""}
  `;
}

// ---- Animations ----

const prefersReducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

// A transform: fly the kept unicorn into its fragment gem.
function transformAnimated(s, keep, discard, after) {
  const who = s.turn;
  const color = colorOf(keep);
  // A Make 7 on an already-owned color draws a unicorn instead of filling a
  // gem, so skip the card-to-gem flight in that case.
  const dup = s[who].fragments[color] != null;
  const gemEl =
    boardEl &&
    boardEl.querySelector(
      `.area.${who === "human" ? "you" : "ai"} .gem[data-color="${color}"]`,
    );
  const cardEl = boardEl && boardEl.querySelector(`.card[data-id="${keep}"]`);

  const finish = () => {
    busy = false;
    sfx(bonusTaken);
    setGame(doTransform(s, keep, discard));
    after();
  };

  if (dup || !cardEl || !gemEl || prefersReducedMotion()) return finish();
  busy = true;
  flyCardToGem(cardEl, gemEl, finish);
}

function flyCardToGem(cardEl, gemEl, done) {
  const src = cardEl.getBoundingClientRect();
  const dst = gemEl.getBoundingClientRect();

  const clone = cardEl.cloneNode(true);
  clone.classList.remove("pop", "pick", "objective", "hintable");
  clone.style.cssText =
    `position:fixed;margin:0;left:${src.left}px;top:${src.top}px;` +
    `width:${src.width}px;height:${src.height}px;z-index:60;` +
    `pointer-events:none;view-transition-name:none;` +
    `--i:${cardEl.style.getPropertyValue("--i")};` +
    `--row:${cardEl.style.getPropertyValue("--row")};`;
  document.body.appendChild(clone);
  cardEl.style.visibility = "hidden";

  const dx = dst.left + dst.width / 2 - (src.left + src.width / 2);
  const dy = dst.top + dst.height / 2 - (src.top + src.height / 2);
  const endScale = Math.max(dst.width / src.width, 0.14);

  const anim = clone.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      {
        transform: `translate(${dx * 0.5}px,${dy * 0.5 - 26}px) scale(0.72) rotate(6deg)`,
        opacity: 1,
        offset: 0.55,
      },
      {
        transform: `translate(${dx}px,${dy}px) scale(${endScale})`,
        opacity: 0.25,
      },
    ],
    { duration: 640, easing: "cubic-bezier(.5,0,.35,1)" },
  );

  const end = () => {
    clone.remove();
    done();
  };
  anim.onfinish = end;
  anim.oncancel = end;
}

function cardPositions() {
  const m = new Map();
  if (boardEl) {
    boardEl.querySelectorAll(".card[data-id]").forEach((el) => {
      el.classList.remove("pop");
      const r = el.getBoundingClientRect();
      m.set(el.dataset.id, Math.round(r.left) + "," + Math.round(r.top));
    });
  }
  return m;
}

function popMoved(prev) {
  if (!boardEl) return;
  boardEl.querySelectorAll(".card[data-id]").forEach((el) => {
    const before = prev.get(el.dataset.id);
    if (before === undefined) return;
    const r = el.getBoundingClientRect();
    const now = Math.round(r.left) + "," + Math.round(r.top);
    if (before === now) return;
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
    el.addEventListener("animationend", () => el.classList.remove("pop"), {
      once: true,
    });
  });
}

// ---- Interaction ----

function onClick(e) {
  const s = getGame();
  if (!s || busy) return;

  const btn = e.target.closest("[data-action],[data-keep]");
  if (btn) {
    handleButton(s, btn.dataset);
    return;
  }

  // Any click outside a button while the discard viewer is open closes it.
  if (showDiscard) {
    showDiscard = false;
    paint();
    return;
  }

  const pick = e.target.closest("[data-pick]");
  if (pick && s.phase === "choose" && activeSide(s) === mySide) {
    choicePair = +pick.dataset.pick;
    paint();
    return;
  }

  const cardEl = e.target.closest(".card[data-id]");
  if (!cardEl) return;
  handleCard(s, +cardEl.dataset.id, cardEl.dataset.zone);
}

function handleCard(s, id, zone) {
  if (s.winner || activeSide(s) !== mySide) return;

  if (s.phase === "split") {
    if (zone === "pool") assignSplit(id, splitA.length < 2 ? "pairA" : "pairB");
    else if (zone === "pairA" || zone === "pairB") assignSplit(id, "pool");
    return;
  }

  if (s.phase === "choose") {
    if (zone === "pairA" || zone === "pairB") {
      choicePair = zone === "pairB" ? 1 : 0;
      paint();
    }
    return;
  }

  if (s.phase === "transform") {
    if (zone !== "you" || tPair) return;
    if (tPick == null) {
      const opts = transformOptions(s[mySide]);
      if (!opts.some((o) => o.keep === id || o.discard === id)) return;
      tPick = id;
      paint();
      return;
    }
    if (id === tPick) {
      tPick = null;
      paint();
      return;
    }
    if (!makes7(tPick, id)) return;
    const a = tPick;
    const kA = s[mySide].fragments[colorOf(a)] == null;
    const kB = s[mySide].fragments[colorOf(id)] == null;
    if (kA && kB) {
      tPair = [a, id];
      paint();
      return;
    }
    tPick = null;
    doTransformHuman(s, kA ? a : id, kA ? id : a);
    return;
  }

  if (s.phase === "discard" && zone === "you") {
    sfx(itemThrow);
    setGame(doDiscard(s, id));
    render();
    bcast();
    progress();
  }
}

function assignSplit(id, zone) {
  splitA = splitA.filter((x) => x !== id);
  splitB = splitB.filter((x) => x !== id);
  if (zone === "pairA" && splitA.length < 2) splitA.push(id);
  else if (zone === "pairB" && splitB.length < 2) splitB.push(id);
  paint();
}

function doTransformHuman(s, keep, disc) {
  transformAnimated(s, keep, disc, () => {
    resetRound();
    render();
    bcast();
    progress();
  });
}

function handleButton(s, d) {
  if (d.action === "discView") {
    showDiscard = true;
    paint();
    return;
  }
  if (d.action === "discClose") {
    showDiscard = false;
    paint();
    return;
  }
  if (d.action === "again") {
    if (isOnline && !isHost) return; // only the host restarts an online match
    endShown = false;
    showDiscard = false;
    startGame();
    resetRound();
    render();
    bcast();
    progress();
    return;
  }
  if (d.action === "title") {
    goToSection("title");
    return;
  }
  if (d.action === "csplit") {
    if (splitA.length !== 2 || splitB.length !== 2) return;
    setGame(applySplit(s, [splitA.slice(), splitB.slice()]));
    resetRound();
    render();
    bcast();
    progress();
    return;
  }
  if (d.action === "cchoose") {
    if (choicePair == null) return;
    setGame(applyChoose(s, choicePair));
    resetRound();
    render();
    bcast();
    progress();
    return;
  }
  if (d.action === "tskip") {
    setGame(skipTransform(s));
    resetRound();
    render();
    bcast();
    progress();
    return;
  }
  if (d.action === "tcancel") {
    tPick = null;
    tPair = null;
    paint();
    return;
  }
  if (d.keep != null) {
    tPick = null;
    tPair = null;
    doTransformHuman(s, +d.keep, +d.disc);
  }
}

// ---- Drag & drop (human split) ----

function onDragStart(e) {
  const c = e.target.closest(".card[data-id]");
  const s = getGame();
  if (!c || !s || s.phase !== "split" || s.splitter !== mySide) return;
  dragId = +c.dataset.id;
  e.dataTransfer.effectAllowed = "move";
  try {
    e.dataTransfer.setData("text/plain", String(dragId));
  } catch (_) {}
}

function onDragOver(e) {
  if (dragId != null && e.target.closest("[data-drop]")) e.preventDefault();
}

function onDrop(e) {
  const z = e.target.closest("[data-drop]");
  if (!z || dragId == null) return;
  e.preventDefault();
  assignSplit(dragId, z.dataset.drop);
  dragId = null;
}

// ---- Turn loop (AI in single-player, relay peer online) ----

// Broadcast the current state to the peer after a local move (online only).
function bcast() {
  if (isOnline && transport) transport.send(getGame());
}

function progress() {
  const s = getGame();
  if (!s || s.winner) return;
  if (activeSide(s) !== mySide) {
    // The opponent acts: the AI drives it offline; online we await the relay.
    if (!isOnline) setTimeout(aiAct, 650);
    return;
  }
  // My turn but no Make 7 possible: skip automatically after a beat.
  if (s.phase === "transform" && transformOptions(s[mySide]).length === 0) {
    setTimeout(() => {
      const g = getGame();
      if (!g || g.phase !== "transform" || activeSide(g) !== mySide) return;
      setGame(skipTransform(g));
      resetRound();
      render();
      bcast();
      progress();
    }, 450);
  }
}

function aiAct() {
  const s = getGame();
  if (!s || s.winner || activeSide(s) !== "ai") return;

  if (s.phase === "split") {
    setGame(applySplit(s, aiSplit(s)));
    resetRound();
    render();
    progress();
    return;
  }
  if (s.phase === "choose") {
    setGame(applyChoose(s, aiChoose(s)));
    resetRound();
    render();
    progress();
    return;
  }
  if (s.phase === "transform") {
    const o = aiTransform(s);
    if (o) {
      transformAnimated(s, o.keep, o.discard, () => {
        resetRound();
        render();
        progress();
      });
    } else {
      setGame(skipTransform(s));
      resetRound();
      render();
      progress();
    }
    return;
  }
  if (s.phase === "discard") {
    setGame(doDiscard(s, aiDiscard(s)));
    render();
    progress();
  }
}

// ---- Lifecycle ----

export function initBoard() {
  boardEl = document.getElementById("board");
  boardEl.addEventListener("click", onClick);
  boardEl.addEventListener("dragstart", onDragStart);
  boardEl.addEventListener("dragover", onDragOver);
  boardEl.addEventListener("drop", onDrop);
}

export function enterGame() {
  // Online, the deck is created by the host and synced; never start a new one
  // locally or we would clobber the shared state.
  if (!isOnline) {
    const g = getGame();
    if (!g || g.winner) startGame();
  }
  endShown = false;
  resetRound();
  render();
  progress();
}

// ---- Online lobby entry points ----

// Relay callbacks shared by host and guest.
const netHandlers = {
  // The peer announced itself. The host owns the deck, so it deals now and
  // pushes the opening state; both then navigate into the game.
  onPeer() {
    if (isHost && !started) {
      started = true;
      startGame();
      transport.send(getGame());
      goToSection("game");
    }
  },
  // A fresh state arrived from the peer.
  onState(st) {
    setGame(st);
    if (!started) {
      started = true;
      goToSection("game"); // guest enters on the first snapshot
    } else {
      resetRound();
      render();
      progress();
    }
  },
  onLeft() {
    if (started && !getGame()?.winner) {
      oppLeft = true;
      render();
    }
  },
};

export function hostGame(onInfo) {
  isOnline = true;
  isHost = true;
  mySide = "human";
  started = false;
  oppLeft = false;
  transport.host({ ...netHandlers, onInfo });
}

export function joinGame(code, onInfo) {
  isOnline = true;
  isHost = false;
  mySide = "ai";
  started = false;
  oppLeft = false;
  transport.join(code, { ...netHandlers, onInfo });
}

export function leaveOnline() {
  if (!isOnline) return;
  if (transport) transport.close();
  isOnline = false;
  isHost = false;
  mySide = "human";
  started = false;
  oppLeft = false;
  setGame(null);
}
