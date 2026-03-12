<template>
  <div
    class="flex flex-col items-center justify-center gap-3 py-10"
    role="status"
    aria-live="polite"
  >
    <svg
      class="h-10 w-10 animate-spin text-gray-400"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        class="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="4"
      />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
    <p class="text-gray-500 dark:text-gray-300">Loading...</p>
  </div>
</template>
