// Pure game rules: constants and card helpers.
// A card is an integer id 0..41. color = floor(id/6), value = id%6+1.

export const CNAMES = [
  "Red",
  "Orange",
  "Yellow",
  "Green",
  "Blue",
  "Indigo",
  "Violet",
];

export const colorOf = (id) => Math.floor(id / 6);
export const valueOf = (id) => (id % 6) + 1;

export const opp = (p) => (p === "human" ? "ai" : "human");

export const clone = (s) => JSON.parse(JSON.stringify(s));

// Remove first occurrence of x from array (in place).
export function pull(arr, x) {
  const i = arr.indexOf(x);
  if (i >= 0) arr.splice(i, 1);
}

// Draw the top card of the shared deck (end of array = top).
export const draw = (s) => (s.deck.length ? s.deck.pop() : null);

// Two unicorns can be transformed when their values add up to 7.
export const makes7 = (a, b) => valueOf(a) + valueOf(b) === 7;

// The three unique ways to split four cards into two pairs of two.
export function partitions4(c) {
  return [
    [
      [c[0], c[1]],
      [c[2], c[3]],
    ],
    [
      [c[0], c[2]],
      [c[1], c[3]],
    ],
    [
      [c[0], c[3]],
      [c[1], c[2]],
    ],
  ];
}
