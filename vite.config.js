import { defineConfig } from 'vite'

// The library itself is plain ESM source — no build step, exactly like
// three.js's own package. This config builds the *demo*, which is also what
// GitHub Pages serves.
export default defineConfig({
  root: 'demo',
  // Relative asset URLs, so the built page works under any Pages subpath
  // (https://user.github.io/gemrenderer/).
  base: './',
  build: {
    outDir: 'dist', // → demo/dist, the artifact the Pages workflow uploads
    emptyOutDir: true,
    // SELFTEST=1 (npm run build:selftest) also builds the browser smoke-test
    // page in demo/selftest.html, which exercises mount → bake → re-bake →
    // spin → update → destroy and reports into its <title>.
    ...(process.env.SELFTEST
      ? {
          rollupOptions: {
            input: { main: 'index.html', selftest: 'selftest.html' },
          },
        }
      : {}),
  },
  server: { open: true },
})
