<template>
  <span class="mention font-semibold">@{{ label }}</span>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import NDK from "@nostr-dev-kit/ndk";

const props = defineProps({
  pubkey: { type: String, required: true },
  relays: { type: Array, default: () => [] },
});

const profile = ref(null);

// until the profile arrives, show a short npub rather than 200 raw characters
const shortNpub = computed(() => {
  try {
    const npub = hexToNpub(props.pubkey);
    return `${npub.slice(0, 12)}...${npub.slice(-4)}`;
  } catch {
    return props.pubkey.slice(0, 8);
  }
});

const label = computed(
  () => profile.value?.display_name || profile.value?.name || shortNpub.value,
);

const withTimeout = (promise, timeoutMs, label) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    }),
  ]);
};

onMounted(async () => {
  try {
    const urls = await resolveRelays(props.relays);
    const ndk = new NDK({ explicitRelayUrls: urls });
    await withTimeout(ndk.connect(2000), 8000, "Relay connection");

    const meta = await withTimeout(
      fetchNewestEvent(ndk, { kinds: [0], authors: [props.pubkey] }),
      8000,
      "Mention profile fetch",
    );
    if (meta) profile.value = JSON.parse(meta.content);
  } catch (error) {
    console.error("Failed to load mentioned profile", error);
  }
});
</script>

<style scoped>
.mention {
  color: #2563eb;
}

:global(.dark) .mention {
  color: #60a5fa;
}
</style>
