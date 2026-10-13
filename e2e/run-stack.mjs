import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifactDir = fileURLToPath(new URL('./artifacts/', import.meta.url));
const project = `nexttrade-e2e-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const compose = ['compose', '-f', 'docker-compose.e2e.yml', '-p', project];
let sessionMinutes = '1';
let interrupted = false;
let activeChild;

function run(args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { cwd: root, env: { ...process.env, E2E_SESSION_MINUTES: sessionMinutes },
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', windowsHide: true });
    activeChild = child;
    let output = '';
    if (capture) { child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; }); }
    child.on('error', reject);
    child.on('close', code => resolve({ code: code ?? 1, output }));
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { interrupted = true; activeChild?.kill('SIGTERM'); });
const must = async args => {
  if (interrupted) throw new Error('End-to-end run interrupted.');
  const result = await run(args);
  if (result.code !== 0) throw new Error(`Docker command failed with exit code ${result.code}.`);
};

let started = false;
let failed = false;
try {
  const version = await run(['compose', 'version']);
  if (version.code !== 0) throw new Error('Docker Compose v2 is required.');
  // Keep the browser package and image pinned to the same version.
  const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
  const model = await readFile(new URL('../docker-compose.e2e.yml', import.meta.url), 'utf8');
  if (!model.includes(`playwright:v${pkg.devDependencies['@playwright/test']}-`)) throw new Error('Playwright package/image versions differ.');
  await mkdir(artifactDir, { recursive: true });
  console.log(`Isolated Compose project: ${project}`);
  started = true;
  await must([...compose, 'config', '--quiet']);
  await must([...compose, 'up', '-d', '--build', 'gateway']);
  const uid = process.env.E2E_RUNNER_UID ?? process.getuid?.();
  const gid = process.env.E2E_RUNNER_GID ?? process.getgid?.();
  const userArgs = uid !== undefined ? ['--user', `${uid}:${gid}`] : [];
  const containerCommand = projectName =>
    `mkdir -p /tmp/e2e; cp /source/package*.json /source/playwright.config.ts /source/global-setup.ts /tmp/e2e/; cp -R /source/tests /tmp/e2e/; cd /tmp/e2e; npm ci --no-audit --no-fund; npx playwright test --project=${projectName}`;
  for (const phase of ['journey', 'default-timeout']) {
    if (phase === 'default-timeout') {
      sessionMinutes = '10';
      await must([...compose, 'up', '-d', '--no-deps', '--force-recreate', 'auth']);
      // Static nginx upstreams resolve at startup; refresh Identity's container IP.
      await must([...compose, 'restart', 'gateway']);
    }
    await must([...compose, 'run', '--rm', '--no-deps', ...userArgs, '-e', `E2E_REPORT_PHASE=${phase}`,
      '-e', 'CI=1', 'playwright', containerCommand(phase)]);
  }
} catch (error) {
  failed = true;
  console.error(error.code === 'ENOENT' ? 'Docker is unavailable. Install and start Docker with Compose v2 to run the real-stack suite.' : error.message);
} finally {
  if (started) {
    try {
      const diagnostics = await run([...compose, 'logs', '--no-color'], true);
      await writeFile(`${artifactDir}/containers.log`, diagnostics.output);
    } catch (error) { failed = true; console.error(`Could not collect container logs: ${error.message}`); }
    try {
      const cleanup = await run([...compose, 'down', '--volumes', '--remove-orphans']);
      if (cleanup.code !== 0) failed = true;
    } catch (error) { failed = true; console.error(`Isolated stack cleanup failed: ${error.message}`); }
  }
}
process.exitCode = failed || interrupted ? 1 : 0;
