const fs = require("node:fs");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const distRoot = path.join(appRoot, "dist");
const htmlPath = path.join(distRoot, "index.html");
const iconSource = path.join(appRoot, "assets", "images", "icon.png");

if (!fs.existsSync(htmlPath)) {
  throw new Error(`Expo web export did not create ${htmlPath}`);
}

const manifest = {
  id: "./",
  name: "DAS VPN",
  short_name: "DAS VPN",
  description: "Manage your DAS VPN subscription and secure device session.",
  start_url: "./",
  scope: "./",
  display: "standalone",
  orientation: "portrait",
  theme_color: "#050b1d",
  background_color: "#050b1d",
  icons: [
    {
      src: "./pwa-icon.png",
      sizes: "1024x1024",
      type: "image/png",
      purpose: "any",
    },
  ],
};

const serviceWorker = `const CACHE_NAME = "das-vpn-shell-v1";
const SHELL_FILES = ["./", "./manifest.webmanifest", "./pwa-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("das-vpn-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match(new URL("./", self.location).href)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
`;

const registration = `<script>
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js", { scope: "./" })
        .catch((error) => console.warn("DAS VPN offline support could not be enabled.", error));
    });
  }
</script>`;

let html = fs.readFileSync(htmlPath, "utf8");
if (!html.includes("</head>") || !html.includes("</body>")) {
  throw new Error(
    "Expo web export generated an unexpected index.html structure.",
  );
}

const headTags = [
  '<link rel="manifest" href="./manifest.webmanifest" />',
  '<link rel="apple-touch-icon" href="./pwa-icon.png" />',
  '<meta name="theme-color" content="#050b1d" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
].join("\n    ");

html = html.replace("</head>", `    ${headTags}\n  </head>`);
html = html.replace("</body>", `  ${registration}\n  </body>`);

fs.copyFileSync(iconSource, path.join(distRoot, "pwa-icon.png"));
fs.writeFileSync(
  path.join(distRoot, "manifest.webmanifest"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
fs.writeFileSync(path.join(distRoot, "service-worker.js"), serviceWorker);
fs.writeFileSync(htmlPath, html);

console.log(
  "PWA manifest, install icon, service worker, and HTML metadata are ready.",
);
