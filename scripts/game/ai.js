// Lightweight AI heuristics for Split & Choose. No minimax; just cheap scoring.
import { colorOf, valueOf, clone, opp, partitions4 } from "./rules.js";
import { transformOptions, fragCount } from "./engine.js";

// How much a single card is worth to a player right now.
function cardUtility(pl, c) {
  let sc = valueOf(c) / 6;
  if (pl.fragments[colorOf(c)] == null) sc += 0.5; // color still needed
  const need = 7 - valueOf(c);
  for (const u of pl.unicorns) {
    if (u !== c && valueOf(u) === need) {
      sc += 0.7; // has a partner to Make 7
      break;
    }
  }
  return sc;
}

// Overall strength of a player's position (fragments + reachable colors).
function handScore(pl) {
  let sc = fragCount(pl) * 10;
  const colors = new Set(
    transformOptions(pl)
      .filter((o) => pl.fragments[colorOf(o.keep)] == null)
      .map((o) => colorOf(o.keep)),
  );
  sc += colors.size * 3; // distinct new colors ready to Make 7
  for (const u of pl.unicorns)
    if (pl.fragments[colorOf(u)] == null) sc += valueOf(u) * 0.05;
  return sc;
}

// SPLITTER: pick the partition of the 4 revealed cards that helps the AI most
// while giving the chooser the worst best-case. Grouping two cards the human
// craves into the same pair forces them to abandon one of them.
export function aiSplit(s) {
  const chooser = opp(s.splitter);
  const parts = partitions4(s.revealed);
  let best = parts[0];
  let bestSc = -Infinity;

  for (const part of parts) {
    const [pa, pb] = part;

    // Simulate the chooser taking their best card from each pair.
    let humanBest = -Infinity;
    let leftA = pa[1];
    let leftB = pb[1];
    for (const x of pa) {
      for (const y of pb) {
        const t = clone(s);
        t[chooser].unicorns.push(x, y);
        const hs = handScore(t[chooser]);
        if (hs > humanBest) {
          humanBest = hs;
          leftA = x === pa[0] ? pa[1] : pa[0];
          leftB = y === pb[0] ? pb[1] : pb[0];
        }
      }
    }

    // The splitter (AI) receives whatever the chooser leaves behind.
    const t2 = clone(s);
    t2[s.splitter].unicorns.push(leftA, leftB);
    const aiGain = handScore(t2[s.splitter]);

    const sc = aiGain - humanBest + Math.random() * 0.01;
    if (sc > bestSc) {
      bestSc = sc;
      best = part;
    }
  }
  return best;
}

// CHOOSER: keep the whole pair that maximises the AI's position, with a small
// nudge to deny the splitter a useful leftover pair.
export function aiChoose(s) {
  const spl = s.splitter;
  let best = 0;
  let bestSc = -Infinity;

  for (let i = 0; i < 2; i++) {
    const chosen = s.pairs[i];
    const other = s.pairs[i ^ 1];

    const t = clone(s);
    t.ai.unicorns.push(chosen[0], chosen[1]);
    let sc = handScore(t.ai);

    const t2 = clone(s);
    t2[spl].unicorns.push(other[0], other[1]);
    sc -= 0.4 * handScore(t2[spl]);

    sc += Math.random() * 0.01;
    if (sc > bestSc) {
      bestSc = sc;
      best = i;
    }
  }
  return best;
}

// Does the discarded unicorn still have another Make 7 partner left in hand
// (besides the one we are keeping)? If so, it could become its own fragment.
function hasOtherPartner(pl, keep, discard) {
  const need = 7 - valueOf(discard);
  for (const u of pl.unicorns) {
    if (u === keep || u === discard) continue;
    if (valueOf(u) === need) return true;
  }
  return false;
}

// TRANSFORM: choose the best Make 7 for the AI, or null to skip.
export function aiTransform(s) {
  const pl = s.ai;
  // The AI only cares about Make 7s that yield a brand-new fragment; it never
  // spends a pair just to draw a replacement unicorn.
  const opts = transformOptions(pl).filter(
    (o) => pl.fragments[colorOf(o.keep)] == null,
  );
  if (!opts.length) return null;

  let best = opts[0];
  let bestSc = -Infinity;
  for (const o of opts) {
    let sc = 10; // gaining any new fragment is good
    const dcol = colorOf(o.discard);
    if (pl.fragments[dcol] != null) {
      sc += 2; // discarding a colour we already own is essentially free
    } else if (hasOtherPartner(pl, o.keep, o.discard)) {
      // The discard is a colour we still need for the rainbow AND could still
      // be turned into its own fragment later — don't waste it for nothing.
      sc -= 6;
    }
    sc -= valueOf(o.discard) * 0.1; // discarding a big number is a small loss
    sc += Math.random() * 0.01;
    if (sc > bestSc) {
      bestSc = sc;
      best = o;
    }
  }
  return best;
}

// DISCARD: drop the least useful unicorn.
export function aiDiscard(s) {
  const pl = s.ai;
  let worst = pl.unicorns[0];
  let worstSc = Infinity;
  for (const c of pl.unicorns) {
    const sc = cardUtility(pl, c);
    if (sc < worstSc) {
      worstSc = sc;
      worst = c;
    }
  }
  return worst;
}
