import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Static SPA for Tauri: no SSR, no Node server in the installer (PLAN.md section 3).
    adapter: adapter({ fallback: 'index.html' })
  }
};
export default config;
