// minified bundles drop licence notices, so they ship beside the site instead
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// npm ls exits non zero over peer warnings but still prints the tree
function tree() {
  try {
    return execSync("npm ls --omit=dev --all --parseable", { encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    return error.stdout;
  }
}

const dirs = tree()
  .split(/\r?\n/)
  .slice(1)
  .filter(Boolean);

const seen = new Map();
for (const dir of dirs) {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const id = `${pkg.name}@${pkg.version}`;
  if (seen.has(id)) {
    continue;
  }
  const file = readdirSync(dir).find((name) => /^(licen[cs]e|copying)/i.test(name));
  const text = file ? readFileSync(join(dir, file), "utf8").trim() : "";
  const kind = typeof pkg.license === "object" ? pkg.license.type : pkg.license;
  seen.set(id, `${id}\nLicense: ${kind ?? "unknown"}\n\n${text}`);
}

const body = [...seen.keys()]
  .sort()
  .map((id) => seen.get(id))
  .join(`\n\n${"-".repeat(72)}\n\n`);

if (!existsSync("public")) {
  mkdirSync("public");
}
writeFileSync(
  "public/third-party-licenses.txt",
  `Campus Router uses the following open source packages.\n\n${"-".repeat(72)}\n\n${body}\n`,
);
