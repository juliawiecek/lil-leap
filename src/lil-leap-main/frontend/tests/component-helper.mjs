import '@angular/compiler';
import { ApiHttpClient } from '@lilleap/session-core/angular';
import { of } from 'rxjs';
import { createEnvironmentInjector, Injector, runInInjectionContext } from '@angular/core';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { angularJitApplicationTransform } from '@angular/compiler-cli';

// Use Angular's JIT transform for real input/output/query metadata and TypeScript
// source maps. Compile in memory; production source files are never changed.
const appRoot = new URL('../src/', import.meta.url).href;
const program = ts.createProgram(ts.sys.readDirectory(fileURLToPath(appRoot), ['.ts']), {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  experimentalDecorators: true, inlineSourceMap: true, inlineSources: true,
  skipLibCheck: true,
});
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith(appRoot)) {
      const candidate = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(candidate)) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(appRoot) && new URL(url).pathname.endsWith('.ts')) {
      const sourceFile = program.getSourceFile(fileURLToPath(url));
      // Keep plain TS on Node's native loader in every suite. Mixing stripped
      // and transpiled versions of one URL would merge incompatible coverage offsets.
      if (!/from ['"]@angular\//.test(sourceFile.text)) return nextLoad(url, context);
      let source;
      program.emit(sourceFile, (name, text) => {
        if (name.endsWith('.js')) source = text;
      }, undefined, false, { before: [angularJitApplicationTransform(program)] });
      if (!source) throw new Error(`Could not compile ${url}`);
      return {
        format: 'module', shortCircuit: true,
        source,
      };
    }
    return nextLoad(url, context);
  },
});

export function component(t, Type, providers = []) {
  const injector = createEnvironmentInjector([{ provide: ApiHttpClient, useValue: { get: () => of([]), post: () => of({}) } }, ...providers], Injector.NULL);
  const instance = runInInjectionContext(injector, () => new Type());
  // Mirror Angular teardown so polling timers started in ngOnInit can't keep the test process alive.
  t.after(() => {
    instance.ngOnDestroy?.();
    injector.destroy();
  });
  return instance;
}

export { ApiHttpClient };
