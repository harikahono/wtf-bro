import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  platform: "node",
  clean: true,
  dts: false,
  sourcemap: false,
  // bundle jadi satu file biar cold start cepet (target <500ms)
  splitting: false,
  treeshake: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
