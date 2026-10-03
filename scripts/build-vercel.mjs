// Build everything Vercel serves as static files into public/:
//   /            website pages (backend/app/pages/*.html, with SUPPORT_EMAIL filled in)
//   /site/...    website styles, scripts and images
//   /app/...     the Nomi web app (Expo export; it calls the API on the same domain)
// The API itself is the Python function in api/index.py.
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const pages = join(root, "backend/app/pages");
const out = join(root, "public");

// The web app needs its sign-in settings at build time. Without them it would
// be built in development mode (no sign-in), so stop here instead.
const localEnv = (() => {
  try { return readFileSync(join(root, "mobile/.env.local"), "utf8"); } catch { return ""; }
})();
const missing = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"].filter(
  (name) => !(process.env[name] || "").trim() && !new RegExp(`^${name}=\\S`, "m").test(localEnv),
);
if (missing.length) {
  console.error(`\nMissing ${missing.join(" and ")}.`);
  console.error("Add them in Vercel -> Project -> Settings -> Environment Variables (Production),");
  console.error("or run scripts/vercel-env.sh, then redeploy.\n");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const email = (process.env.SUPPORT_EMAIL || "nomiconnect@gmail.com").trim();
const mailLink = /<a href="mailto:\{\{SUPPORT_EMAIL\}\}">\{\{SUPPORT_EMAIL\}\}<\/a>/g;
for (const name of readdirSync(pages).filter((f) => f.endsWith(".html"))) {
  let html = readFileSync(join(pages, name), "utf8");
  html = email
    ? html.replaceAll("{{SUPPORT_EMAIL}}", email)
    : html.replace(mailLink, "the contact on our App Store page");
  writeFileSync(join(out, name), html);
}
cpSync(join(pages, "site"), join(out, "site"), { recursive: true });

execSync("npx expo export --platform web --output-dir ../public/app", {
  cwd: join(root, "mobile"),
  stdio: "inherit",
  env: { ...process.env, EXPO_PUBLIC_API_URL: "same-origin", CI: "1" },
});
console.log("Built public/: website + web app at /app");
