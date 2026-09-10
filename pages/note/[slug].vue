<template>
  <div>
    <MDC
      v-if="eventContent"
      :value="eventContent"
      tag="article"
      class="px-6 mt-24 prose dark:prose-invert mx-auto py-6"
    />
  </div>
</template>

<script setup>
import { ref, onBeforeMount } from "vue";
import { useRoute } from "vue-router";
import setup from "~/config/setup";
import { bech32 } from "bech32";

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

const withTimeout = (promise, timeoutMs) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), timeoutMs),
    ),
  ]);

onBeforeMount(async () => {
  try {
    const { default: NDK } = await import("@nostr-dev-kit/ndk");
    const ndk = new NDK({ explicitRelayUrls: setup.relays });
    await withTimeout(ndk.connect(2000), 8000); // Connect to the relay

    // Define the filter
    const filter = {
      kinds: [30023],
      authors: [skHex],
      ids: [slugroute],
    };

    const fetchedEvent = await withTimeout(ndk.fetchEvent(filter), 10000); // Assuming fetchEvent fetches a single event
    event.value = fetchedEvent || null; // Assign the fetched event or null if not found

    // Extract and set markdown content from the event
    if (event.value && event.value.content) {
      eventContent.value = event.value.content;
    }
  } catch (error) {
    console.error("Note page: failed to load Nostr event", error);
  }
});

// const { t } = useI18n({ useScope: "local" });
</script>
