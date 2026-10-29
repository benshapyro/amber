import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_amber",
  dirs: ["./trigger"],
  maxDuration: 600,
  retries: { enabledInDev: false },
  build: {
    // Native and WebAssembly packages cannot be bundled.
    external: ["sharp", "heic-decode", "libheif-js"],
  },
});
