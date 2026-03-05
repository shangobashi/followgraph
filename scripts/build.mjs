import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const watch = args.includes("--watch");

const root = process.cwd();
const srcDir = path.join(root, "src");
const outDir = path.join(root, "extension");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function copyDir(from, to) {
  ensureDir(to);
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b);
    else copyFile(a, b);
  }
}

async function buildOnce() {
  ensureDir(outDir);

  await esbuild.build({
    entryPoints: [path.join(srcDir, "background.ts")],
    bundle: true,
    format: "iife",
    target: ["chrome120"],
    outfile: path.join(outDir, "background.js"),
    sourcemap: false,
    minify: true
  });

  await esbuild.build({
    entryPoints: [path.join(srcDir, "scanner.ts")],
    bundle: true,
    format: "iife",
    target: ["chrome120"],
    outfile: path.join(outDir, "scanner.js"),
    sourcemap: false,
    minify: true
  });

  ensureDir(path.join(outDir, "popup"));
  await esbuild.build({
    entryPoints: [path.join(srcDir, "popup", "popup.ts")],
    bundle: true,
    format: "iife",
    target: ["chrome120"],
    outfile: path.join(outDir, "popup", "popup.js"),
    sourcemap: false,
    minify: true
  });

  copyFile(path.join(srcDir, "manifest.json"), path.join(outDir, "manifest.json"));
  copyDir(path.join(srcDir, "popup"), path.join(outDir, "popup"));

  const maybe = path.join(outDir, "popup", "popup.ts");
  if (fs.existsSync(maybe)) fs.unlinkSync(maybe);
}

if (!watch) {
  buildOnce()
    .then(() => console.log("Built to ./extension"))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
} else {
  console.log("Watch mode enabled");

  const ctxBg = await esbuild.context({
    entryPoints: [path.join(srcDir, "background.ts")],
    bundle: true,
    format: "iife",
    target: ["chrome120"],
    outfile: path.join(outDir, "background.js"),
    sourcemap: false,
    minify: true
  });

  const ctxScanner = await esbuild.context({
    entryPoints: [path.join(srcDir, "scanner.ts")],
    bundle: true,
    format: "iife",
    target: ["chrome120"],
    outfile: path.join(outDir, "scanner.js"),
    sourcemap: false,
    minify: true
  });

  const ctxPopup = await esbuild.context({
    entryPoints: [path.join(srcDir, "popup", "popup.ts")],
    bundle: true,
    format: "iife",
    target: ["chrome120"],
    outfile: path.join(outDir, "popup", "popup.js"),
    sourcemap: false,
    minify: true
  });

  await buildOnce();
  await ctxBg.watch();
  await ctxScanner.watch();
  await ctxPopup.watch();

  fs.watch(path.join(srcDir, "manifest.json"), { persistent: true }, () => {
    try {
      copyFile(path.join(srcDir, "manifest.json"), path.join(outDir, "manifest.json"));
      console.log("Copied manifest.json");
    } catch {}
  });

  fs.watch(path.join(srcDir, "popup"), { recursive: true, persistent: true }, () => {
    try {
      copyDir(path.join(srcDir, "popup"), path.join(outDir, "popup"));
      const maybe = path.join(outDir, "popup", "popup.ts");
      if (fs.existsSync(maybe)) fs.unlinkSync(maybe);
      console.log("Copied popup/");
    } catch {}
  });
}
