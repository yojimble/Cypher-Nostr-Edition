import { bech32 } from "bech32";
import setup from "~/config/setup";

// NIP-65: the owner publishes their relay list as a kind 10002 event.
// Reading it at runtime means the shop follows the owner's relays instead of
// a list typed into config/setup.json that silently rots when a relay dies.
// setup.relays stays as the bootstrap set (where we look for the list) and as
// the fallback when no list is found.

const MAX_RELAYS = 6;
const LOOKUP_TIMEOUT_MS = 4000;

const ownerHex = () => {
  const { words } = bech32.decode(setup.nostradmin);
  return Array.from(bech32.fromWords(words))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

// Ask one relay for the newest kind 10002 event. Never rejects: a dead relay
// just resolves null.
const fetchRelayList = (url, pubkey) =>
  new Promise((resolve) => {
    let best = null;
    let ws;
    const done = () => {
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        // already closed
      }
      resolve(best);
    };
    const timer = setTimeout(done, LOOKUP_TIMEOUT_MS);
    try {
      ws = new WebSocket(url);
    } catch {
      return done();
    }
    ws.onopen = () =>
      ws.send(
        JSON.stringify(["REQ", "relays", { kinds: [10002], authors: [pubkey] }]),
      );
    ws.onmessage = (msg) => {
      let frame;
      try {
        frame = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (frame[0] === "EVENT" && frame[2]?.pubkey === pubkey) {
        if (!best || frame[2].created_at > best.created_at) best = frame[2];
      } else if (frame[0] === "EOSE") {
        done();
      }
    };
    ws.onerror = done;
    ws.onclose = done;
  });

// "r" tags with no marker, or the "read" marker, are relays to read from.
const readRelays = (event) =>
  (event?.tags ?? [])
    .filter((tag) => tag[0] === "r" && tag[1] && tag[2] !== "write")
    .map((tag) => tag[1].trim().replace(/\/+$/, ""))
    .filter((url) => /^wss:\/\//.test(url));

let cached = null;

const lookup = async () => {
  const pubkey = ownerHex();
  const events = await Promise.all(
    setup.relays.map((url) => fetchRelayList(url, pubkey)),
  );
  const newest = events
    .filter(Boolean)
    .sort((a, b) => b.created_at - a.created_at)[0];
  return [
    ...new Set([...readRelays(newest).slice(0, MAX_RELAYS), ...setup.relays]),
  ];
};

// Relay URLs to connect to: the owner's NIP-65 list first, then the
// configured relays. Looked up once per page load. Always resolves; on any
// failure it returns setup.relays.
export const resolveRelays = (extra = []) => {
  if (import.meta.server) return Promise.resolve([...setup.relays, ...extra]);
  cached ??= lookup().catch(() => [...setup.relays]);
  return cached.then((urls) => [...new Set([...urls, ...extra])]);
};
