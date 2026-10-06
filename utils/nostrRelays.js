import { bech32 } from "bech32";
import setup from "~/config/setup";

// The owner publishes relay lists as replaceable events:
//   kind 10002 (NIP-65): relays to read their public notes from
//   kind 10050 (NIP-17): relays where they receive private DMs
// Reading them at runtime means the shop follows the owner's relays instead of
// lists typed into config/setup.json that silently rot when a relay dies.
// The config lists stay as the bootstrap set (where we look the list up) and
// as the fallback when no list is found.

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
const fetchRelayList = (url, pubkey, kind) =>
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
        JSON.stringify(["REQ", "relays", { kinds: [kind], authors: [pubkey] }]),
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

const wssUrls = (urls) =>
  urls
    .filter(Boolean)
    .map((url) => url.trim().replace(/\/+$/, ""))
    .filter((url) => /^wss:\/\//.test(url));

// NIP-65 "r" tags with no marker, or the "read" marker, are relays to read from.
const readRelays = (event) =>
  wssUrls(
    (event?.tags ?? [])
      .filter((tag) => tag[0] === "r" && tag[2] !== "write")
      .map((tag) => tag[1]),
  );

// NIP-17 "relay" tags are where the owner receives DMs.
const dmRelays = (event) =>
  wssUrls(
    (event?.tags ?? [])
      .filter((tag) => tag[0] === "relay")
      .map((tag) => tag[1]),
  );

const newestRelayList = async (kind, bootstrap) => {
  const pubkey = ownerHex();
  const events = await Promise.all(
    bootstrap.map((url) => fetchRelayList(url, pubkey, kind)),
  );
  return events.filter(Boolean).sort((a, b) => b.created_at - a.created_at)[0];
};

let cached = null;
let cachedInbox = null;

const lookup = async () => {
  const newest = await newestRelayList(10002, setup.relays);
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

// Relay URLs to publish DMs to: the owner's NIP-17 kind 10050 list. Falls back
// to setup.nostrInboxRelays when no list is found. Looked up once per page
// load. Always resolves.
export const resolveInboxRelays = () => {
  const fallback = wssUrls(setup.nostrInboxRelays || []);
  cachedInbox ??= newestRelayList(10050, [
    ...new Set([...setup.relays, ...fallback]),
  ])
    .then((event) => {
      const urls = dmRelays(event).slice(0, MAX_RELAYS);
      return urls.length ? urls : fallback;
    })
    .catch(() => fallback);
  return cachedInbox;
};
