import { build } from "esbuild";

// build for esm and cjs
build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true,
  sourcemap: true,
  outfile: "dist/index.mjs",
  format: "esm",
  target: "es2019",
  external: [],
}).catch(() => process.exit(1));

build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true,
  sourcemap: true,
  outfile: "dist/index.cjs",
  format: "cjs",
  target: "es2019",
  external: [],
}).catch(() => process.exit(1));
