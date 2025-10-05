// /archive-client.js â€” RAR/7Z/TAR/ZIP â†’ ZIP/7Z (client-only, offline-first)

import { loadJSZip, loadLibarchive, load7z } from './src/local-first.mjs';

// --- vendors (lazy singletons) ---
let JSZip, seven, ArchiveReader, libarchiveMod;

async function ensureVendors() {
    if (!JSZip) JSZip = await loadJSZip();
    if (!seven) seven = await load7z(); // { FS, callMain, ... }
    if (!ArchiveReader || !libarchiveMod) {
        const m = await loadLibarchive();         // libarchive-wasm ESM
        libarchiveMod = await m.libarchiveWasm(); // WASM module instance
        ArchiveReader = m.ArchiveReader;          // class
    }
}

// --- helpers ---
function stripExt(name = 'archive') {
    return name.replace(/\.(zip|rar|7z|tar|tgz|tbz2|txz|tar\.gz|tar\.bz2|tar\.xz)$/i, '');
}

// Read entries from any supported archive into a simple in-memory list
async function readArchiveEntries(file, { password } = {}) {
    await ensureVendors();
    const buf = new Uint8Array(await file.arrayBuffer());
    const reader = new ArchiveReader(libarchiveMod, buf, { password });
    const out = [];
    let entry;
    while ((entry = reader.readHeader()) !== null) {
        const path = entry.pathname;
        const size = entry.size;
        const isDir = entry.filetype === 'dir' || /\/$/.test(path);
        let data = new Uint8Array(0);
        if (!isDir && size > 0) {
            data = reader.readData(size);
        } else {
            reader.skip();
        }
        out.push({ path, isDir, size, data });
    }
    reader.close();
    return out;
}

// --- writers ---
// ZIP via JSZip (keeps folder structure)
async function writeZip(entries) {
    await ensureVendors();
    const zip = new JSZip();
    for (const e of entries) {
        if (e.isDir) {
            zip.folder(e.path.replace(/\/$/, ''));// create folder
        } else {
            zip.file(e.path, e.data);
        }
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    return new File([blob], 'archive.zip', { type: 'application/zip' });
}

// 7Z via seven (7z-wasm). We stage files into its mem FS then call `a -t7z`.
async function write7z(entries, { password } = {}) {
    await ensureVendors();
    const FS = seven.FS;
    // prepare fs
    try { FS.mkdir('/in'); } catch { }
    try { FS.mkdir('/out'); } catch { }
    // write files
    for (const e of entries) {
        const p = '/in/' + e.path.replace(/^\/+/, '');
        const dir = p.replace(/\/[^/]*$/, '');
        const mkdeep = (d) => {
            const parts = d.split('/').filter(Boolean);
            let cur = '';
            for (const part of parts) {
                cur += '/' + part;
                try { FS.mkdir(cur); } catch { }
            }
        };
        mkdeep(dir);
        if (!e.isDir) {
            FS.writeFile(p, e.data);
        } else {
            try { FS.mkdir(p); } catch { }
        }
    }
    const outName = '/out/archive.7z';
    const args = ['a', '-t7z', outName, '/in/*', '-mmt=on', '-mx=5'];
    if (password) args.push(`-p${password}`, '-mhe=on');
    const code = seven.callMain(args);
    if (code !== 0) throw new Error('7z encoder failed');
    const out = FS.readFile(outName); // Uint8Array
    return new File([out], 'archive.7z', { type: 'application/x-7z-compressed' });
}

// --- main router ---
// Supports: zip, 7z  (tar variants: TODO)
export async function convertArchiveFile(inputFile, toFormat, opts = {}) {
    const entries = await readArchiveEntries(inputFile, opts);
    const base = stripExt(inputFile?.name);

    switch (toFormat) {
        case 'zip': {
            const f = await writeZip(entries, opts);
            return new File([f], `${base}.zip`, { type: f.type });
        }
        case '7z': {
            const f = await write7z(entries, opts);
            return new File([f], `${base}.7z`, { type: f.type });
        }
        case 'tar':
        case 'tar.gz':
        case 'tar.bz2':
        case 'tar.xz':
            throw new Error(`'${toFormat}' not implemented yet. Add tar writer + gzip/bzip2/xz codecs or route via 7z if you ship those.`);
        case 'rar':
            throw new Error('RAR creation is not available offline.');
        default:
            throw new Error(`Unsupported output: ${toFormat}`);
    }
}

// Convenience adapters (so app.js can call specific ones)
export const convertArchiveToZip = (f, o) => convertArchiveFile(f, 'zip', o);
export const convertArchiveTo7z = (f, o) => convertArchiveFile(f, '7z', o);
export const convertArchiveToTar = (f, o) => convertArchiveFile(f, 'tar', o);
export const convertArchiveToTarGz = (f, o) => convertArchiveFile(f, 'tar.gz', o);
export const convertArchiveToTarBz2 = (f, o) => convertArchiveFile(f, 'tar.bz2', o);
export const convertArchiveToTarXz = (f, o) => convertArchiveFile(f, 'tar.xz', o);

