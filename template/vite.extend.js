/**
 * Extend the GxP runtime Vite config without replacing it.
 *
 * The toolkit loads this file (if present at the project root) and deep-merges
 * the returned config into its runtime Vite config:
 *   - arrays (plugins, resolve.dedupe, ...) are concatenated
 *   - objects (resolve.alias, define, server, build.rollupOptions, ...) are
 *     merged key-by-key
 *   - primitives overwrite
 *
 * Two shapes are supported:
 *   1. A plain config object (below).
 *   2. A function `({ mode, command, env, runtimeConfig }) => config` — use
 *      this if you need env/mode-aware extension, or want to read the base
 *      runtime config to decide what to add.
 *
 * Only the fields you care about need to appear here; everything else keeps
 * whatever the runtime set. Uncomment the blocks below as you need them.
 */

// import path from "path";
// import { fileURLToPath } from "url";

// const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  // resolve: {
  //   alias: {
  //     // "@" is already set to the project's src/ by the runtime — override
  //     // or add new aliases here as needed.
  //     "@components": path.resolve(__dirname, "src/components"),
  //     "@pages": path.resolve(__dirname, "src/pages"),
  //     "@composables": path.resolve(__dirname, "src/composables"),
  //     "@stores": path.resolve(__dirname, "src/stores"),
  //     "@helpers": path.resolve(__dirname, "src/helpers"),
  //     "@assets": path.resolve(__dirname, "src/assets"),
  //   },
  // },
  // Add extra Vite plugins here. They run after the runtime's plugins.
  // plugins: [somePlugin()],
  // Expose extra compile-time constants to your app.
  // define: {
  //   "import.meta.env.VITE_MY_FLAG": JSON.stringify("value"),
  // },
};
