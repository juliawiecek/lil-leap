import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chown, mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = `nexttrade-e2e-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const artifactDir = fileURLToPath(new URL(`./artifacts/${project}/`, import.meta.url));
const compose = ['compose', '-f', 'docker-compose.e2e.yml', '-p', project];
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--project=auth')) {
  console.error('Usage: node run-stack.mjs [--project=auth]');
  process.exit(1);
}
const phases = args.length ? ['auth'] : ['auth', 'journey', 'default-timeout'];
const completedPhases = [];
const startedAt = new Date().toISOString();
let sessionMinutes = '10';
let interrupted = false;
let activeChild;

function run(args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { cwd: root, env: { ...process.env, E2E_SESSION_MINUTES: sessionMinutes, E2E_ARTIFACT_SUBDIR: project },
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', windowsHide: true });
    activeChild = child;
    let output = '';
    if (capture) { child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; }); }
    child.on('error', reject);
    child.on('close', code => resolve({ code: code ?? 1, output }));
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { interrupted = true; activeChild?.kill('SIGTERM'); });
// In CI this runner is root inside a container; hand what it writes to the Jenkins user so
// Playwright (run as that user) can write reports here and the next build can delete them.
const runnerUid = process.env.E2E_RUNNER_UID ?? process.getuid?.();
const runnerGid = process.env.E2E_RUNNER_GID ?? process.getgid?.();
const handBack = async path => {
  if (process.getuid?.() === 0 && runnerUid !== undefined) await chown(path, Number(runnerUid), Number(runnerGid));
};
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
  await handBack(artifactDir);
  console.log(`Isolated Compose project: ${project}`);
  console.log(`Reports: ${artifactDir}`);
  started = true;
  await must([...compose, 'config', '--quiet']);
  await must([...compose, 'up', '-d', '--build', 'gateway']);
  const userArgs = runnerUid !== undefined ? ['--user', `${runnerUid}:${runnerGid}`] : [];
  const containerCommand = projectName =>
    `mkdir -p /tmp/e2e; cp /source/package*.json /source/playwright.config.ts /source/global-setup.ts /tmp/e2e/; cp -R /source/tests /tmp/e2e/; cd /tmp/e2e; npm ci --no-audit --no-fund; npx playwright test --project=${projectName}`;
  for (const phase of phases) {
    if (phase !== 'auth') {
      sessionMinutes = phase === 'journey' ? '1' : '10';
      await must([...compose, 'up', '-d', '--no-deps', '--force-recreate', 'auth']);
      // Static nginx upstreams resolve at startup; refresh Identity's container IP.
      await must([...compose, 'restart', 'gateway']);
    }
    await must([...compose, 'run', '--rm', '--no-deps', ...userArgs, '-e', `E2E_REPORT_PHASE=${phase}`,
      '-e', 'CI=1', 'playwright', containerCommand(phase)]);
    completedPhases.push(phase);
  }
} catch (error) {
  failed = true;
  console.error(error.code === 'ENOENT' ? 'Docker is unavailable. Install and start Docker with Compose v2 to run the real-stack suite.' : error.message);
} finally {
  if (started) {
    try {
      const diagnostics = await run([...compose, 'logs', '--no-color'], true);
      await writeFile(`${artifactDir}/containers.log`, diagnostics.output);
      await handBack(`${artifactDir}/containers.log`);
      // Show why in the build log too, without downloading the archived artifacts.
      if (failed) console.error(['Last container log lines:', ...diagnostics.output.split('\n').slice(-150)].join('\n'));
      if (diagnostics.code !== 0) failed = true;
    } catch (error) { failed = true; console.error(`Could not collect container logs: ${error.message}`); }
    try {
      // Each run builds its own images; remove them with the stack so the agent's disk does not fill.
      const cleanup = await run([...compose, 'down', '--volumes', '--remove-orphans', '--rmi', 'local']);
      if (cleanup.code !== 0) failed = true;
    } catch (error) { failed = true; console.error(`Isolated stack cleanup failed: ${error.message}`); }
    try {
      await writeFile(`${artifactDir}/run.json`, JSON.stringify({
        project, startedAt, finishedAt: new Date().toISOString(), phases, completedPhases,
        status: failed || interrupted ? 'failed' : 'passed',
      }, null, 2));
      await handBack(`${artifactDir}/run.json`);
    } catch (error) { failed = true; console.error(`Could not write run summary: ${error.message}`); }
  }
}
process.exitCode = failed || interrupted ? 1 : 0;
