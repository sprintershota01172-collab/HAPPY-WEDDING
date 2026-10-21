// Migration staging only: output contains runtime files, not GitHub metadata, docs or server secrets.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
const files = [
  [
    "index.html",
    "index.html"
  ],
  [
    "app.js",
    "app.js"
  ],
  [
    "styles.css",
    "styles.css"
  ],
  [
    "sw.js",
    "sw.js"
  ],
  [
    "sync.js",
    "sync.js"
  ],
  [
    "notifications.js",
    "notifications.js"
  ],
  [
    "icon.svg",
    "icon.svg"
  ],
  [
    "manifest.webmanifest",
    "manifest.webmanifest"
  ]
];
const output = 'private-dist';
rmSync(output, { recursive: true, force: true });
for (const [source, target] of files) {
  if (!existsSync(source)) throw new Error('Required runtime asset missing: ' + source);
  const destination = join(output, target);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
}
if (!existsSync(join(output, 'index.html'))) throw new Error('index.html missing');
console.log('Prepared ' + files.length + ' allowlisted app assets');
