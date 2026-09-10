import { bech32 } from "bech32";

// nostr: references embedded in note content (NIP-19 / NIP-27)
const REF_RE = /nostr:((?:nevent|note|nprofile|npub)1[02-9ac-hj-np-z]+)/g;

const bytesToHex = (bytes) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const hexToBytes = (hex) =>
  Uint8Array.from(hex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));

export const hexToNpub = (pubkey) =>
  bech32.encode("npub", bech32.toWords(hexToBytes(pubkey)), 5000);

// nevent/nprofile carry TLV data; note/npub are a bare 32-byte value.
export const decodeNostrRef = (token) => {
  const decoded = bech32.decode(token, 5000);
  const bytes = Uint8Array.from(bech32.fromWords(decoded.words));
  const prefix = decoded.prefix;

  if (prefix === "note") {
    return { type: "note", id: bytesToHex(bytes), relays: [] };
  }
  if (prefix === "npub") {
    return { type: "npub", pubkey: bytesToHex(bytes), relays: [] };
  }

  const ref = { type: prefix, relays: [] };
  let i = 0;
  while (i < bytes.length) {
    const tag = bytes[i];
    const length = bytes[i + 1];
    const value = bytes.slice(i + 2, i + 2 + length);
    i += 2 + length;

    if (tag === 0) {
      if (prefix === "nevent") ref.id = bytesToHex(value);
      else ref.pubkey = bytesToHex(value);
    } else if (tag === 1) {
      ref.relays.push(new TextDecoder().decode(value));
    } else if (tag === 2 && prefix === "nevent") {
      ref.author = bytesToHex(value);
    }
  }
  return ref;
};

// Split note content into plain-text and quoted-event segments.
export const parseNostrContent = (content) => {
  if (!content) return [];

  const segments = [];
  let last = 0;

  for (const match of content.matchAll(REF_RE)) {
    if (match.index > last) {
      segments.push({ kind: "text", value: content.slice(last, match.index) });
    }

    let ref = null;
    try {
      ref = decodeNostrRef(match[1]);
    } catch {
      ref = null;
    }

    if (ref && (ref.type === "nevent" || ref.type === "note") && ref.id) {
      segments.push({
        kind: "event",
        id: ref.id,
        relays: ref.relays,
        raw: match[0],
      });
    } else if (
      ref &&
      (ref.type === "nprofile" || ref.type === "npub") &&
      ref.pubkey
    ) {
      segments.push({
        kind: "profile",
        pubkey: ref.pubkey,
        relays: ref.relays,
        raw: match[0],
      });
    } else {
      // anything undecodable stays as it was
      segments.push({ kind: "text", value: match[0] });
    }

    last = match.index + match[0].length;
  }

  if (last < content.length) {
    segments.push({ kind: "text", value: content.slice(last) });
  }
  return segments;
};
