/* global __dirname */
/**
 * Static hosts without SPA rewrites return 404 when a deep link is refreshed.
 * Copy index.html into a folder for each top-level route so they load directly.
 * (Dynamic routes like /lesson/:id still need a host rewrite: /* -> /index.html.)
 */
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const index = fs.readFileSync(path.join(dist, 'index.html'));
const routes = [
  'onboarding', 'login', 'register', 'forgot-password', 'reset-password', 'welcome-plan',
  'learn', 'academy', 'tutor', 'profile', 'catalog', 'revision', 'ai-quiz', 'interview',
  'pronunciation', 'study-plan', 'leaderboard', 'achievements', 'settings',
];
for (const r of routes) {
  fs.mkdirSync(path.join(dist, r), { recursive: true });
  fs.writeFileSync(path.join(dist, r, 'index.html'), index);
}
fs.writeFileSync(path.join(dist, '404.html'), index);
console.log(`Wrote index.html for ${routes.length} routes`);
