import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(resolve('package.json'));
const ts = require('typescript');
const source = readFileSync(new URL('../shared/assistive-preferences.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2018, module: ts.ModuleKind.CommonJS, removeComments: true,
} });
const key = process.argv[2];
if (!['nexttrade.accessibility', 'nexttrade-insights.accessibility'].includes(key)) throw new Error('Expected an application accessibility storage key.');
writeFileSync(resolve('public/assistive-init.js'),
  '/* Generated from shared/assistive-preferences.ts. */\n(function () { const exports = {};\n' + outputText +
  '\ntry { const saved = JSON.parse(localStorage.getItem(' + JSON.stringify(key) + ') || "{}") || {};\n' +
  'exports.applyAssistiveVisuals(document.documentElement, exports.parseAssistivePreferences(saved.voice, saved.visual)); } catch {}\n})();\n');
