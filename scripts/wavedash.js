// Wavedash transport — used only in the Wavedash build (scripts/index-wd.js).
//
// It maps the same transport interface board.js expects
//   host(h) / join(code, h) / send(state) / close() / needsCode
// onto Wavedash lobbies + P2P WebRTC. The `Wavedash` global is injected by the
// platform (and by `wavedash dev`) before our code runs.
//
// Flow, mirroring the relay:
//   host  -> createLobby(PUBLIC, 2); share the invite link; when the peer's P2P
//            channel opens (P2P_CONNECTION_ESTABLISHED) fire onPeer so the host
//            deals and broadcasts the opening state.
//   join  -> quick-join the first public lobby (or a specific lobby id from an
//            invite link); wait for the host's first state snapshot.
//   send  -> broadcast a JSON snapshot on the reliable channel 0.
//   recv  -> poll channel 0 each frame and hand snapshots to onState.
export function makeWavedash() {
  const WD = Wavedash;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  let h = {};
  let lobbyId = "";
  let polling = false;

  // Drain channel 0 every frame; each packet is a JSON game-state snapshot.
  function pump() {
    if (!polling) return;
    let m;
    while ((m = WD.readP2PMessageFromChannel(0))) {
      try {
        h.onState && h.onState(JSON.parse(dec.decode(m.payload)));
      } catch (_) {}
    }
    requestAnimationFrame(pump);
  }
  function startPump() {
    if (polling) return;
    polling = true;
    requestAnimationFrame(pump);
  }

  // Wire lobby/P2P lifecycle once. The peer's data channel opening is our
  // "opponent is here" signal (equivalent to the relay's presence handshake).
  WD.on(WD.Events.LOBBY_JOINED, (p) => {
    lobbyId = p.lobbyId;
    startPump();
  });
  WD.on(WD.Events.P2P_CONNECTION_ESTABLISHED, () => {
    h.onPeer && h.onPeer();
  });
  WD.on(WD.Events.P2P_PEER_DISCONNECTED, () => {
    h.onLeft && h.onLeft();
  });
  WD.on(WD.Events.LOBBY_USERS_UPDATED, (p) => {
    if (p.changeType === "LEFT") h.onLeft && h.onLeft();
  });

  return {
    needsCode: false,
    host(handlers) {
      h = handlers;
      h.onInfo("Creating a game…");
      WD.createLobby(WD.LobbyVisibility.PUBLIC, 2);
      // Offer a shareable invite link once we are in the lobby.
      WD.getLobbyInviteLink(true).then((r) => {
        h.onInfo(
          r && r.success
            ? `Waiting for an opponent… Invite link copied: ${r.data}`
            : "Waiting for an opponent…",
        );
      });
    },
    join(code, handlers) {
      h = handlers;
      h.onInfo("Looking for a game…");
      // An invite link passes a specific lobby id; otherwise quick-join any.
      if (code) {
        WD.joinLobby(code);
        return;
      }
      WD.listAvailableLobbies().then((r) => {
        if (r && r.success && r.data.length) WD.joinLobby(r.data[0].lobbyId);
        else h.onInfo("No games available — create one instead.");
      });
    },
    send(s) {
      WD.broadcastP2PMessage(0, true, enc.encode(JSON.stringify(s)));
    },
    close() {
      polling = false;
      if (lobbyId) WD.leaveLobby(lobbyId);
      lobbyId = "";
    },
  };
}
