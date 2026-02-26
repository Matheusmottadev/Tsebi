import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const requireCjs = createRequire(import.meta.url);
const moduleLib = requireCjs("module");
const originalResolveFilename = moduleLib._resolveFilename;
const originalTsLoader = require.extensions[".ts"];

if (!(globalThis as Record<string, unknown>).__ts_require_resolver_patched__) {
  require.extensions[".ts"] = function loadTypeScript(module: NodeModule, filename: string) {
    const source = fs.readFileSync(filename, "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        resolveJsonModule: true
      },
      fileName: filename
    }).outputText;
    (module as NodeModule & { _compile: (code: string, fileName: string) => void })._compile(compiled, filename);
  };

  moduleLib._resolveFilename = function patchedResolveFilename(
    request: string,
    parent: { filename?: string } | undefined,
    isMain: boolean,
    options: unknown
  ) {
    try {
      return originalResolveFilename.call(this, request, parent, isMain, options);
    } catch (error) {
      const isRelative = request.startsWith("./") || request.startsWith("../");
      if (!isRelative) throw error;

      const parentFile = String(parent?.filename || "");
      if (!parentFile) throw error;

      const base = path.resolve(path.dirname(parentFile), request);
      const tsFile = `${base}.ts`;
      if (fs.existsSync(tsFile)) return tsFile;

      const tsIndex = path.join(base, "index.ts");
      if (fs.existsSync(tsIndex)) return tsIndex;

      throw error;
    }
  };

  (globalThis as Record<string, unknown>).__ts_require_resolver_patched__ = true;
  (globalThis as Record<string, unknown>).__ts_require_original_loader__ = originalTsLoader;
}
