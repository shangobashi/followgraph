import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { zipSync } from "fflate";

const args = process.argv.slice(2);
const watch = args.includes("--watch");

const root = process.cwd();
const srcDir = path.join(root, "src");
const outDir = path.join(root, "extension");
const publicDir = path.join(root, "public");
const downloadsDir = path.join(publicDir, "downloads");
const zipPath = path.join(downloadsDir, "followgraph-extension.zip");

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function copyFile(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function copyDir(from, to) {
  ensureDir(to);
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const sourcePath = path.join(from, entry.name);
    const destinationPath = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(sourcePath, destinationPath);
    else copyFile(sourcePath, destinationPath);
  }
}

function collectDirectoryEntries(from, prefix = "") {
  const entries = {};

  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const sourcePath = path.join(from, entry.name);
    const zipName = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      Object.assign(entries, collectDirectoryEntries(sourcePath, zipName));
      continue;
    }

    entries[zipName] = new Uint8Array(fs.readFileSync(sourcePath));
  }

  return entries;
}

function writeExtensionZip() {
  ensureDir(downloadsDir);
  const archive = zipSync(collectDirectoryEntries(outDir, "extension"), { level: 9 });
  fs.writeFileSync(zipPath, Buffer.from(archive));
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

  writeExtensionZip();
}

if (!watch) {
  buildOnce()
    .then(() => console.log("Built to ./extension and packaged ./public/downloads/followgraph-extension.zip"))
    .catch((error) => {
      console.error(error);
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
      writeExtensionZip();
      console.log("Copied manifest.json and refreshed extension zip");
    } catch {}
  });

  fs.watch(path.join(srcDir, "popup"), { recursive: true, persistent: true }, () => {
    try {
      copyDir(path.join(srcDir, "popup"), path.join(outDir, "popup"));
      const maybe = path.join(outDir, "popup", "popup.ts");
      if (fs.existsSync(maybe)) fs.unlinkSync(maybe);
      writeExtensionZip();
      console.log("Copied popup/ and refreshed extension zip");
    } catch {}
  });
}
