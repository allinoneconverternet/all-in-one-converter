// src/7zRunner.js (or wherever you wrap 7z-wasm)
export async function run7z(argv, opts = {}) {
    if (!Array.isArray(argv)) {
        throw new Error('run7z(argv): argv must be an array');
    }
    // ensure module is loaded, etc…
    return sevenZipModule.callMain(argv); // or your existing invocation
}
