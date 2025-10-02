// writers/7z-wasm.js
let seven; // lazy-loaded module

async function init7z() {
    if (seven) return seven;
    // Load the Emscripten-compiled module (7zz.wasm + glue)
    seven = await import('../wasm/7zz.mjs'); // exposes createSevenZipModule()
    return seven;
}

export async function write7z(entries, { password } = {}) {
    const mod = await (await init7z()).createSevenZipModule();
    const FS = mod.FS;

    // Create an in-memory input dir
    FS.mkdir('/in');
    FS.mkdir('/out');

    // Materialize entries into /in (folders first)
    for (const e of entries) {
        const p = '/in/' + e.path.replace(/^\/+/, '');
        if (e.isDir) {
            mkdeep(FS, p);
        } else {
            mkdeep(FS, p.substring(0, p.lastIndexOf('/')));
            const data = await e.data();
            FS.writeFile(p, data);
        }
    }

    const outName = '/out/archive.7z';
    const args = ['a', '-t7z', outName, '/in/*', '-mmt=on', '-mx=5']; // -mx=5: balanced
    if (password) args.push(`-p${password}`, '-mhe=on'); // encrypt headers

    const code = mod.callMain(args);
    if (code !== 0) throw new Error('7z encoder failed');

    const out = FS.readFile(outName);
    return new Blob([out], { type: 'application/x-7z-compressed' });
}

function mkdeep(FS, dir) {
    if (!dir || dir === '/' || dir === '/in') return;
    const parts = dir.split('/').filter(Boolean);
    let cur = '';
    for (const part of parts) {
        cur += '/' + part;
        try { FS.mkdir(cur); } catch (_) { }
    }
}
