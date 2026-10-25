// Makes what a release publishes from its installer, once SignPath has signed
// it (.github/workflows/release.yml): the update signature that installed
// copies check before installing (made with the key in
// TAURI_SIGNING_PRIVATE_KEY and its password), latest.json, which tells them
// about the release, and the release's notes.
//
// Usage: node release-files.mjs <installer> <folder for the files> <notes file>
// SIGNED=true says the installer is code-signed.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [installer, out, notesFile] = process.argv.slice(2);
if (!installer || !out || !notesFile) {
  console.error('Usage: node release-files.mjs <installer> <folder for the files> <notes file>');
  process.exit(1);
}

const { version } = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const repo = process.env.GITHUB_REPOSITORY ?? 'kusule1351-hue/thought-desk';
const tag = `v${version}`;
// A tag for another version would publish this one under the wrong number.
if (process.env.GITHUB_REF?.startsWith('refs/tags/') && process.env.GITHUB_REF_NAME !== tag) {
  console.error(`The tag ${process.env.GITHUB_REF_NAME} doesn't match the app's version, ${version} (src-tauri/tauri.conf.json).`);
  process.exit(1);
}

// GitHub turns the space in an uploaded file's name into a dot, so the file
// gets that name here, and latest.json points at it.
const name = `Thought.Desk_${version}_x64-setup.exe`;
fs.mkdirSync(out, { recursive: true });
const exe = path.join(out, name);
fs.copyFileSync(installer, exe);

// The update signature, bound to the version as `tauri build` binds it.
execFileSync(process.execPath, [path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'signer', 'sign', '--app-version', version, exe], { stdio: 'inherit' });
const signature = fs.readFileSync(`${exe}.sig`, 'utf8');

const url = `https://github.com/${repo}/releases/download/${tag}/${name}`;
const update = { signature, url };
const latest = {
  version,
  // The app shows only the version; what's new is on the release page.
  notes: `What's new: https://github.com/${repo}/releases/tag/${tag}`,
  pub_date: new Date().toISOString(),
  platforms: { 'windows-x86_64': update, 'windows-x86_64-nsis': update },
};
fs.writeFileSync(path.join(out, 'latest.json'), JSON.stringify(latest, null, 2) + '\n');

const signing =
  process.env.SIGNED === 'true'
    ? 'The installer and the app are signed: free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org). See the [code signing policy](https://thoughtdesk.org/code-signing).'
    : `The installer isn't code-signed yet, so Windows may show "Windows protected your PC": click **More info**, then **Run anyway**.`;
fs.writeFileSync(
  notesFile,
  `**Download:** \`${name}\` below (Windows 10 and 11, 64-bit). Already on 0.5.1 or later? Thought Desk offers this update by itself.\n\n${signing}\n`,
);

console.log(`${name}, ${name}.sig and latest.json for ${tag} are in ${out}`);
