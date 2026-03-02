import {mkdir, copyFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");
const dashboardRoot = resolve(__dirname, "..");
const sourceRootPublic = resolve(dashboardRoot, "../../public");
const targetDashboardPublic = resolve(dashboardRoot, "public");

const filesToSync = [
  "logo-32.png",
  "logo-64.png",
  "logo-128.png",
  "icon-192x192.png",
  "icon-512x512.png",
  "apple-touch-icon.png",
  "apple-touch-icon-120x120.png",
  "apple-touch-icon-152x152.png",
  "apple-touch-icon-180x180.png",
  "site.webmanifest",
  "og-image.png",
  "twitter-image.png",
  "VoiceRails 1000x1000.png",
  "VoiceRails 1000x1000 no background.png",
];

await mkdir(targetDashboardPublic, {recursive: true});

await Promise.all(
  filesToSync.map(async (fileName) => {
    const source = resolve(sourceRootPublic, fileName);
    const destination = resolve(targetDashboardPublic, fileName);
    await copyFile(source, destination);
  }),
);

console.log(`Synced ${filesToSync.length} brand assets into dashboard public folder.`);
