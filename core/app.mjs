// Loads one app: its settings (apps/<name>/app.json) and its items, read by the app's own adapter.
// An item is anything worth its own page, post or video: a document for Picproved, an away ground for Awayline.
import { readFile, readdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkItem } from "./item.mjs";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));

export async function listApps() {
  const names = await readdir(join(ROOT, "apps"));
  return names.filter(n => !n.startsWith("_") && !n.startsWith(".")).sort();
}

// The app's own repository is read from APP_SOURCE_<NAME> (for example APP_SOURCE_PICPROVED), else from
// app.json "source.path", relative to this repository. A missing checkout is an error, not an empty list.
// GitHub clones keep the repository's own capitals (../Picproved), so a folder that differs only in case is used too.
export function sourceDir(config, env = process.env) {
  const key = "APP_SOURCE_" + config.id.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const dir = resolve(ROOT, env[key] || config.source?.path || `../${config.id}`);
  if (existsSync(dir)) return dir;
  const want = basename(dir).toLowerCase();
  try {
    const twin = readdirSync(dirname(dir)).find(n => n.toLowerCase() === want);
    if (twin) return join(dirname(dir), twin);
  } catch {}
  return dir;
}

export async function loadApp(name, { env = process.env } = {}) {
  const dir = join(ROOT, "apps", name);
  const config = JSON.parse(await readFile(join(dir, "app.json"), "utf8"));
  if (config.id !== name) throw new Error(`apps/${name}/app.json has id "${config.id}"`);
  const adapter = await import(pathToFileURL(join(dir, "adapter.mjs")).href);
  const src = sourceDir(config, env);
  let cache;
  return {
    name, config, dir, src,
    async items() {
      if (cache) return cache;
      const list = await adapter.items({ config, src });
      const seen = new Set();
      for (const it of list) {
        const problems = checkItem(it);
        if (problems.length) throw new Error(`${name} item ${it.id || "?"}: ${problems.join("; ")}`);
        if (seen.has(it.id)) throw new Error(`${name}: item id ${it.id} twice`);
        seen.add(it.id);
      }
      return (cache = list);
    },
  };
}
