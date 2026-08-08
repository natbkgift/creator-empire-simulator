const CACHE = 'creator-empire-v1.4.3';
const ASSETS = [
  './', './index.html', './styles/app.css', './manifest.webmanifest',
  './icon.svg', './styles/variables.css', './styles/base.css', './styles/layout.css', './styles/components.css',
  './styles/features/pipeline.css', './styles/features/prompt-studio.css', './styles/features/calendar.css',
  './styles/features/analytics.css', './styles/features/settings.css', './styles/features/map.css',
  './styles/features/hq.css', './styles/features/misc.css',
  './src/app/navigation.js', './src/app/router.js', './src/app/runtime.js',
  './src/app/selectors.js', './src/app/shell.js', './src/app/store.js', './src/app/view.js',
  './src/charts/charts.js',
  './src/controllers/ai-controller.js', './src/controllers/command-palette.js', './src/controllers/entity-controller.js',
  './src/controllers/helpers.js', './src/controllers/import-export-controller.js', './src/controllers/settings-controller.js',
  './src/controllers/workflow-controller.js',
  './src/db/indexeddb.js', './src/domain/actions.js', './src/domain/ai-contracts.js', './src/domain/blueprint.js', './src/domain/focus.js', './src/domain/migration.js', './src/domain/progression.js',
  './src/domain/prompts.js', './src/domain/scoring.js', './src/domain/simulator.js', './src/domain/types.js',
  './src/domain/utils.js', './src/domain/validation.js', './src/domain/workflow.js', './src/features/analytics.js', './src/features/blueprint.js',
  './src/features/calendar.js', './src/features/capcut.js', './src/features/hq.js', './src/features/ideas.js', './src/features/mission.js',
  './src/features/importExport.js', './src/features/map.js', './src/features/monetization.js', './src/features/onboarding.js',
  './src/features/pipeline.js', './src/features/policy.js', './src/features/prompts.js',
  './src/features/settings.js', './src/features/simulator.js', './src/main.js', './src/seed/demo.js',
  './src/seed/ideas.js', './src/seed/policies.js', './src/ui/components.js', './src/ui/feedback.js',
  './src/ui/icons.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) {
      const clone = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, clone));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === 'navigate') return caches.match('./index.html');
    return Response.error();
  }));
});
