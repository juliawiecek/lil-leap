import '@angular/compiler';
import { createEnvironmentInjector, Injector, runInInjectionContext } from '@angular/core';
import { readFileSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import ts from 'typescript';

// Node's type stripping cannot compile Angular decorators. Compile only app TS,
// retaining the real Angular signals, inputs, outputs, and component methods.
const appRoot = new URL('../src/', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith(appRoot)) {
      const candidate = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(candidate)) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(appRoot) && url.endsWith('.ts')) {
      return {
        format: 'module', shortCircuit: true,
        source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
            experimentalDecorators: true,
          },
          fileName: new URL(url).pathname,
        }).outputText,
      };
    }
    return nextLoad(url, context);
  },
});

export function component(t, Type) {
  const injector = createEnvironmentInjector([], Injector.NULL);
  t.after(() => injector.destroy());
  return runInInjectionContext(injector, () => new Type());
}
