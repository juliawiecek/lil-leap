import { access, cp, rm } from 'node:fs/promises';
import path from 'node:path';

const appRoot = process.cwd();
const sourceDist = path.resolve(appRoot, '..', 'shared', 'session-core', 'dist');
const targetDist = path.resolve(appRoot, 'node_modules', '@lilleap', 'session-core', 'dist');

try {
  await access(sourceDist);
} catch {
  throw new Error(
    `Missing shared session-core build output at ${sourceDist}. Run the shared build first.`,
  );
}

await rm(targetDist, { recursive: true, force: true });
await cp(sourceDist, targetDist, { recursive: true });

