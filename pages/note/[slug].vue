<template>
  <div>
    <div v-if="title || publishedAt" class="mx-auto max-w-3xl px-6 mt-24">
      <h1 v-if="title" class="text-3xl font-bold tracking-tight sm:text-4xl">
        {{ title }}
      </h1>
      <time
        v-if="publishedAt"
        :datetime="publishedAt.toISOString()"
        class="mt-3 block text-sm"
      >
        {{ publishedAt.toLocaleDateString() }}
      </time>
    </div>

    <MDC
      v-if="eventContent"
      :value="eventContent"
      tag="article"
      class="px-6 mt-8 prose dark:prose-invert mx-auto py-6"
    />
  </div>
</template>

<script setup>
import { ref, onBeforeMount } from "vue";
import { useRoute } from "vue-router";
import setup from "~/config/setup";
import { bech32 } from "bech32";
import { parseNostrContent, hexToNpub } from "~/utils/nostrRefs";

const bytesToHex = (bytes) => {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const npubToHex = (npub) => {
  const decoded = bech32.decode(npub);
  const pubkeyBytes = bech32.fromWords(decoded.words);
  return bytesToHex(Uint8Array.from(pubkeyBytes));
};

const skHex = npubToHex(setup.nostradmin);

const route = useRoute();
const slugroute = route.params.slug;
const event = ref(null);
const eventContent = ref("");
const title = ref("");
const publishedAt = ref(null);

const withTimeout = (promise, timeoutMs) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), timeoutMs),
    ),
  ]);

// until a profile arrives, show a short npub rather than 60 raw characters
const shortNpub = (pubkey) => {
  try {
    const npub = hexToNpub(pubkey);
    return `${npub.slice(0, 12)}...${npub.slice(-4)}`;
  } catch {
    return pubkey.slice(0, 8);
  }
};

// Swap nostr: profile references for the author's name as plain text. Doing it
// on the markdown string keeps MDC in charge of rendering the article; a
// component per mention would have to be injected into the parsed tree.
const resolveMentions = async (ndk, content) => {
  const segments = parseNostrContent(content);
  const pubkeys = [
    ...new Set(
      segments.filter((s) => s.kind === "profile").map((s) => s.pubkey),
    ),
  ];
  if (!pubkeys.length) return content;

  const names = new Map();
  try {
    const metas = await withTimeout(
      ndk.fetchEvents({ kinds: [0], authors: pubkeys }),
      8000,
    );
    for (const meta of metas) {
      try {
        const profile = JSON.parse(meta.content);
        const name = profile.display_name || profile.name;
        if (name) names.set(meta.pubkey, name);
      } catch {
        // a malformed kind 0 just falls back to the short npub
      }
    }
  } catch (error) {
    console.error("Note page: failed to load mentioned profiles", error);
  }

  return segments
    .map((segment) => {
      if (segment.kind === "profile") {
        const name = names.get(segment.pubkey) || shortNpub(segment.pubkey);
        return `**@${name}**`;
      }
      return segment.value ?? segment.raw;
    })
    .join("");
};

onBeforeMount(async () => {
  try {
    const { default: NDK } = await import("@nostr-dev-kit/ndk");
    const ndk = new NDK({ explicitRelayUrls: await resolveRelays() });
    await withTimeout(ndk.connect(2000), 8000); // Connect to the relay

    // Define the filter
    const filter = {
      kinds: [30023],
      authors: [skHex],
      ids: [slugroute],
    };

    const fetchedEvent = await withTimeout(
      fetchNewestEvent(ndk, filter),
      10000,
    ); // Assuming fetchEvent fetches a single event
    event.value = fetchedEvent || null; // Assign the fetched event or null if not found

    if (event.value) {
      const tag = (name) => event.value.tags.find((t) => t[0] === name);
      title.value = tag("title")?.[1] || "";

      // published_at is the NIP-23 original publish time; created_at is the
      // last edit, so prefer the former and fall back to the latter
      const published =
        Number(tag("published_at")?.[1]) || event.value.created_at;
      if (published) publishedAt.value = new Date(published * 1000);
    }

    // Extract and set markdown content from the event
    if (event.value && event.value.content) {
      eventContent.value = await resolveMentions(ndk, event.value.content);
    }
  } catch (error) {
    console.error("Note page: failed to load Nostr event", error);
  }
});

// const { t } = useI18n({ useScope: "local" });
</script>
