// Game engine: state model and the Split & Choose round machine.
// Loop: reveal 4 -> splitter makes 2 pairs -> chooser takes 1 from each pair ->
// splitter gets the leftovers -> each player may Make 7 (transform) -> discard
// down to the limit -> next round with the roles swapped.
import { shuffleArray } from "../utils.js";
import { colorOf, clone, pull, opp, draw, makes7 } from "./rules.js";

// A player may keep at most this many un-transformed unicorns (tweak freely).
export const MAX_UNICORNS = 5;

export const fragCount = (pl) => Object.keys(pl.fragments).length;

export function newGame() {
  const deck = shuffleArray([...Array(42).keys()]);
  const s = {
    deck,
    discard: [],
    revealed: null, // the 4 cards shown this round
    pairs: null, // [[a,b],[c,d]] once the splitter has committed
    splitter: "human", // alternates every round
    round: 1,
    human: { unicorns: [], fragments: {} },
    ai: { unicorns: [], fragments: {} },
    phase: "split", // split | choose | transform | discard | gameover
    turn: "human", // who acts during transform / discard
    winner: null, // "human" | "ai" | "draw"
    status: "",
  };
  return startRound(s);
}

// Reveal four unicorns and hand the split to the current splitter.
export function startRound(s) {
  if (s.deck.length < 4) return endGame(s);
  s.revealed = [draw(s), draw(s), draw(s), draw(s)];
  s.pairs = null;
  s.phase = "split";
  s.turn = s.splitter;
  s.status =
    s.splitter === "human"
      ? "You are the Dealer: make two pairs"
      : "The opponent is choosing\u2026";
  return s;
}

// The splitter commits two pairs; the chooser picks next.
export function applySplit(s, pairs) {
  s = clone(s);
  s.pairs = pairs;
  s.phase = "choose";
  s.turn = opp(s.splitter);
  s.status =
    s.turn === "human"
      ? "You are the Receiver: take one of the two pairs"
      : "The opponent is choosing\u2026";
  return s;
}

// The chooser keeps a whole pair; the splitter gets the other pair.
export function applyChoose(s, pairIndex) {
  s = clone(s);
  const chooser = opp(s.splitter);
  const chosen = s.pairs[pairIndex];
  const other = s.pairs[pairIndex ^ 1];

  s[chooser].unicorns.push(chosen[0], chosen[1]);
  s[s.splitter].unicorns.push(other[0], other[1]);

  s.revealed = null;
  s.pairs = null;

  // The chooser gets the first transform opportunity, then the splitter.
  s.turn = chooser;
  return enterTransform(s);
}

function enterTransform(s) {
  s.phase = "transform";
  s.status =
    s.turn === "human"
      ? "Make 7: pair two unicorns that add up to 7, or skip"
      : "The opponent is transforming\u2026";
  return s;
}

// Every Make 7 available to a player: each pair summing to 7, in both keep
// directions. Keeping a new color yields a fragment; keeping a color already
// owned draws a fresh unicorn instead (see doTransform).
export function transformOptions(pl) {
  const out = [];
  const u = pl.unicorns;
  for (let i = 0; i < u.length; i++) {
    for (let j = i + 1; j < u.length; j++) {
      if (!makes7(u[i], u[j])) continue;
      out.push({ keep: u[i], discard: u[j] });
      out.push({ keep: u[j], discard: u[i] });
    }
  }
  return out;
}

// Make 7: keepId becomes a fragment of its color, discardId is discarded.
// If that color is already owned, no duplicate fragment is made — both cards
// are discarded and the player draws a fresh unicorn instead.
export function doTransform(s, keepId, discardId) {
  const pl = s[s.turn];
  if (!makes7(keepId, discardId)) return s;
  if (!pl.unicorns.includes(keepId) || !pl.unicorns.includes(discardId))
    return s;
  const col = colorOf(keepId);
  const dup = pl.fragments[col] != null;

  s = clone(s);
  const p = s[s.turn];
  pull(p.unicorns, keepId);
  pull(p.unicorns, discardId);
  s.discard.push(discardId);
  if (dup) {
    // Already own this color: draw a unicorn instead of a duplicate fragment.
    s.discard.push(keepId);
    const c = draw(s);
    if (c != null) p.unicorns.push(c);
  } else {
    p.fragments[col] = keepId;
  }

  // Chaining: while more Make 7s are possible this turn, stay in the transform
  // phase. Reaching 7 colors ends the turn, but the winner is only settled once
  // both players have transformed this round (see advanceActor) — both receive
  // their unicorns together, so completing the 7th color the same round draws.
  if (fragCount(p) < 7 && transformOptions(p).length > 0)
    return enterTransform(s);
  return afterAction(s);
}

export function skipTransform(s) {
  s = clone(s);
  return afterAction(s);
}

// Enforce the unicorn limit for the acting player, otherwise advance.
function afterAction(s) {
  if (fragCount(s[s.turn]) < 7 && s[s.turn].unicorns.length > MAX_UNICORNS) {
    s.phase = "discard";
    s.status =
      s.turn === "human"
        ? "Too many unicorns \u2014 discard down to " + MAX_UNICORNS
        : "The opponent is discarding\u2026";
    return s;
  }
  return advanceActor(s);
}

export function doDiscard(s, id) {
  const pl = s[s.turn];
  if (!pl.unicorns.includes(id)) return s;
  s = clone(s);
  const p = s[s.turn];
  pull(p.unicorns, id);
  s.discard.push(id);
  if (p.unicorns.length > MAX_UNICORNS) return s; // still trimming
  return advanceActor(s);
}

// Chooser acts first, then splitter; afterwards a new round begins.
function advanceActor(s) {
  if (s.turn === opp(s.splitter)) {
    s.turn = s.splitter;
    return enterTransform(s);
  }
  // Both players have had their Make 7 on this round's unicorns; settle a
  // 7-color finish now so completing the seventh color simultaneously draws.
  const h = fragCount(s.human) >= 7;
  const a = fragCount(s.ai) >= 7;
  if (h && a) {
    s.winner = "draw";
    s.phase = "gameover";
    s.status = "It's a draw!";
    return s;
  }
  if (h) return win(s, "human");
  if (a) return win(s, "ai");
  s.splitter = opp(s.splitter);
  s.round += 1;
  return startRound(s);
}

function win(s, who) {
  s.winner = who;
  s.phase = "gameover";
  s.status = who === "human" ? "You win!" : "The opponent wins!";
  return s;
}

// Deck exhausted (fewer than 4 cards left): most fragments wins, tie = draw.
function endGame(s) {
  const hc = fragCount(s.human);
  const ac = fragCount(s.ai);
  s.phase = "gameover";
  if (hc > ac) return win(s, "human");
  if (ac > hc) return win(s, "ai");
  s.winner = "draw";
  s.status = "It's a draw!";
  return s;
}
