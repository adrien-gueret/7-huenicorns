// Tiny hash-based router: shows one <section id> at a time via a CSS rule and
// notifies a callback on every change.
let sections = [];
let current = "";
let onChange = () => {};

export function goToSection(name) {
  location.hash = name;
}

function route() {
  const next = sections.includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : "title";
  if (next === current) return;
  onChange({ currentSection: current, nextSection: next });
  current = next;
  document.body.dataset.currentSection = next;
}

export default function init(onChangeCallback) {
  onChange = onChangeCallback;

  const selectors = [];
  for (const el of document.querySelectorAll("section[id]")) {
    sections.push(el.id);
    selectors.push(`body[data-current-section="${el.id}"] section#${el.id}`);
  }
  document.head.insertAdjacentHTML(
    "beforeend",
    `<style>${selectors.join(",")}{display:flex;}</style>`,
  );

  addEventListener("hashchange", route);
  route();
}
