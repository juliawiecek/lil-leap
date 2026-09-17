import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const tlsDir = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'NextTrade', 'tls');
const customTls = args.some((arg) => /^--ssl-(cert|key)(=|$)/.test(arg));
if (!customTls && tlsDir && existsSync(join(tlsDir, 'localhost.crt')) && existsSync(join(tlsDir, 'localhost.key'))) {
  args.push('--ssl-cert', join(tlsDir, 'localhost.crt'), '--ssl-key', join(tlsDir, 'localhost.key'));
}
const cli = fileURLToPath(new URL('../node_modules/@angular/cli/bin/ng.js', import.meta.url));
const child = spawn(process.execPath, [cli, 'serve', ...args], { stdio: 'inherit' });
child.on('error', (error) => {
  console.error(`Unable to start Angular: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
