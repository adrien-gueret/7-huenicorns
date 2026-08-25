// Thin wrapper around the js13kGames WebSocket relay.
// Two players share a room keyed by a short code. The relay broadcasts every
// message to all clients in the room and prefixes system messages: "@id" (our
// own id on connect), "+id" (a peer joined), "-id" (a peer left).
//
// Our own messages:
//   J|<code>|<id>  presence handshake (carries the code so it also works if the
//                  relay does not isolate rooms by URL path)
//   S<json>        a full game-state snapshot
const BASE = "wss://relay.js13kgames.com/7-huenicorns";

let ws = null;
let myId = "";
let room = "";
let peerSeen = false;
let cb = {};

// Announce ourselves to the room (idempotent — safe to call repeatedly).
function hello() {
  if (ws && ws.readyState === 1 && myId) ws.send("J|" + room + "|" + myId);
}

export function connect(code, handlers) {
  room = code;
  cb = handlers;
  peerSeen = false;
  myId = "";
  ws = new WebSocket(BASE + "/" + code);
  ws.onopen = hello;
  ws.onmessage = (e) => {
    const m = e.data;
    const tag = m[0];
    if (tag === "@") {
      myId = m.slice(1);
      hello();
    } else if (tag === "-") {
      cb.onLeft && cb.onLeft();
    } else if (tag === "J") {
      const p = m.split("|");
      // p = ["J", code, id]
      if (p[1] === room && p[2] !== myId && !peerSeen) {
        peerSeen = true;
        hello(); // make sure the peer learns our id too, whatever the order
        cb.onPeer && cb.onPeer(p[2]);
      }
    } else if (tag === "S") {
      cb.onState && cb.onState(JSON.parse(m.slice(1)));
    }
  };
}

export function sendState(s) {
  if (ws && ws.readyState === 1) ws.send("S" + JSON.stringify(s));
}

export function close() {
  if (ws) ws.close();
  ws = null;
  peerSeen = false;
}
