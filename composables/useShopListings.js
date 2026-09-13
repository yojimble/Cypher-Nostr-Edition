import { ref } from "vue";

// Module-level state: it outlives any single mount of the shop component, so
// navigating away and back (or a dev HMR reload) reuses what we already have
// instead of hitting the relays again and risking a blank page mid-browse.
const listings = ref([]);
const hasLoaded = ref(false);

export const useShopListings = () => ({ listings, hasLoaded });
