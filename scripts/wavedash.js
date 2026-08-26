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
  const E = WD.Events;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  let h = {};
  let lobbyId = "";
  let oppId = "";
  let hosting = false;
  let polling = false;

  // Lobby membership can hand us peers as bare ids or as objects.
  const uid = (u) => u.userId || u.id || u;

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
  WD.on(E.LOBBY_JOINED, (p) => {
    lobbyId = p.lobbyId;
    // Remember the other player so we can show their name/avatar.
    const me = WD.getUserId();
    (p.users || []).forEach((u) => {
      if (uid(u) !== me) oppId = uid(u);
    });
    startPump();
    // Now that we are truly in the lobby, grab a shareable invite link
    // (copied to the clipboard) so the host can send it to a friend.
    if (hosting)
      WD.getLobbyInviteLink(true).then((r) => {
        h.onInfo(
          r && r.success
            ? `Invite link copied: ${r.data}`
            : "Waiting for a player…",
        );
      });
  });
  WD.on(E.P2P_CONNECTION_ESTABLISHED, () => {
    h.onPeer && h.onPeer();
  });
  WD.on(E.P2P_PEER_DISCONNECTED, () => {
    h.onLeft && h.onLeft();
  });
  WD.on(E.LOBBY_USERS_UPDATED, (p) => {
    if (p.changeType === "LEFT") h.onLeft && h.onLeft();
    else if (p.changeType === "JOINED") oppId = p.userId;
  });

  return {
    needsCode: false,
    host(handlers) {
      h = handlers;
      hosting = true;
      h.onInfo("Creating game…");
      WD.createLobby(WD.LobbyVisibility.PUBLIC, 2);
    },
    join(code, handlers) {
      h = handlers;
      hosting = false;
      h.onInfo("Finding game…");
      // An invite link passes a specific lobby id; otherwise quick-join any.
      if (code) {
        WD.joinLobby(code);
        return;
      }
      WD.listAvailableLobbies().then((r) => {
        if (r && r.success && r.data.length) WD.joinLobby(r.data[0].lobbyId);
        else h.onInfo("No games — create one.");
      });
    },
    send(s) {
      WD.broadcastP2PMessage(0, true, enc.encode(JSON.stringify(s)));
    },
    // Board asks for the local ("mine") or opponent's display name + avatar.
    identity(mine) {
      const id = mine ? WD.getUserId() : oppId;
      if (!id) return null;
      return {
        name: WD.getUsername(mine ? undefined : id) || "",
        avatar: WD.getUserAvatarUrl(id, WD.AvatarSize.SMALL) || "",
      };
    },
    close() {
      polling = false;
      if (lobbyId) WD.leaveLobby(lobbyId);
      lobbyId = "";
      oppId = "";
    },
  };
}
