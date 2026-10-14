import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
for (const app of ['frontend', 'insights-frontend']) {
  test(app + ' nginx serves the SPA for deep links and keeps API routing separate', () => {
    const config = readFileSync(new URL('../../' + app + '/nginx.conf', import.meta.url), 'utf8');
    assert.match(config, /location \/ \{ try_files \$uri \$uri\/ \/index\.html; \}/);
    assert.match(config, /location \/api\/ \{ return 404; \}/);
    assert.match(config, /location \/auth\/ \{ return 404; \}/);
  });
}
