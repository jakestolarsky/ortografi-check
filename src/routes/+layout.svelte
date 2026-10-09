<script lang="ts">
  import { onMount } from 'svelte';
  import { installTheme } from '$lib/theme/apply';
  let { children } = $props();
  // Default palette until settings exist (PLAN s.7); appearance follows the OS.
  onMount(() => installTheme(window, { palette: 'graphite', appearance: 'system' }));
</script>

{@render children()}
