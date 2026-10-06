<template>
  <div class="quote my-3 rounded-lg p-3 text-sm">
    <p v-if="isLoading" class="text-gray-500 dark:text-gray-400">Loading quoted note...</p>

    <div v-else-if="quoted">
      <div class="mb-2 flex items-center gap-2">
        <img
          v-if="author.picture"
          :src="author.picture"
          alt=""
          class="h-6 w-6 shrink-0 rounded-full object-cover"
        />
        <span class="font-semibold">{{
          author.display_name || author.name || "Unknown author"
        }}</span>
        <time
          class="text-xs text-gray-500 dark:text-gray-400"
          :datetime="new Date(quoted.created_at * 1000).toISOString()"
        >
          {{ new Date(quoted.created_at * 1000).toLocaleDateString() }}
        </time>
      </div>
      <div class="break-words">
        <template
          v-for="(segment, i) in parseNostrContent(quoted.content)"
          :key="i"
        >
          <NostrMention
            v-if="segment.kind === 'profile'"
            :pubkey="segment.pubkey"
            :relays="segment.relays"
          />
          <span v-else class="whitespace-pre-wrap">{{
            segment.value ?? segment.raw
          }}</span>
        </template>
      </div>
    </div>

    <p v-else class="text-gray-500 dark:text-gray-400">Quoted note could not be loaded.</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import NDK from "@nostr-dev-kit/ndk";

const props = defineProps({
  id: { type: String, required: true },
  relays: { type: Array, default: () => [] },
});

const quoted = ref(null);
const author = ref({});
const isLoading = ref(true);

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
    // relay hints from the reference itself often hold the note when ours don't
    const urls = await resolveRelays(props.relays);
    const ndk = new NDK({ explicitRelayUrls: urls });
    await withTimeout(ndk.connect(2000), 8000, "Relay connection");

    const event = await withTimeout(
      fetchNewestEvent(ndk, { ids: [props.id] }),
      10000,
      "Quoted note fetch",
    );
    quoted.value = event;

    if (event) {
      const meta = await withTimeout(
        fetchNewestEvent(ndk, { kinds: [0], authors: [event.pubkey] }),
        8000,
        "Quoted author fetch",
      );
      if (meta) {
        try {
          author.value = JSON.parse(meta.content);
        } catch {
          author.value = {};
        }
      }
    }
  } catch (error) {
    console.error("Failed to load quoted note", error);
    quoted.value = null;
  } finally {
    isLoading.value = false;
  }
});
</script>

<style scoped>
.quote {
  border: 1px solid rgb(209 213 219 / 1);
  background: rgb(249 250 251 / 0.6);
}

:global(.dark) .quote {
  border-color: rgb(75 85 99 / 1);
  background: rgb(31 41 55 / 0.6);
}
</style>
