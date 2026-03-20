import { build } from "vite";
import path from "path";
import fs from 'node:fs/promises';

const ROOT = process.cwd();
const TMP = path.join(ROOT, '.service-worker-build');
const DEST = path.join(ROOT, 'public/compiled-service-worker.js');

await fs.rm(TMP, { recursive: true, force: true });

await build({
    root: ROOT,
    logLevel: 'warn',
    build: {
        outDir: TMP,
        emptyOutDir: true,
        minify: false,
        rollupOptions: {
            input: path.join(ROOT, 'src/workers/service-worker.ts'),
            output: {
                entryFileNames: 'compiled-service-worker.js',
                format: 'es',
            },
        },
    },
});

// move the compiled file into public
await fs.mkdir(path.dirname(DEST), { recursive: true });
await fs.copyFile(path.join(TMP, 'compiled-service-worker.js'), DEST);

// clean temp dir
await fs.rm(TMP, { recursive: true, force: true });

console.log("Service worker built successfully");
