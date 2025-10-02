// convertArchiveFile.js
import { readArchiveEntries } from './archive-client.js'; // you already have this
import { writeZip } from './writers/zip-writer.js';       // existing
import { writeTar } from './writers/tar-writer.js';
import { gzipBuffer } from './codecs/gzip.js';
import { bzip2Buffer } from './codecs/bzip2.js';
import { xzBuffer } from './codecs/xz.js';
import { write7z } from './writers/7z-wasm.js';

export async function convertArchiveFile(inputFile, toFormat, opts = {}) {
    const { password } = opts;
    const entries = await readArchiveEntries(inputFile, { password });
    // entries: [{ path, isDir, mtime, mode, data(): Promise<Uint8Array> }, ...]

    switch (toFormat) {
        case 'zip': return await writeZip(entries, opts);               // existing
        case 'tar': return await writeTar(entries, { pax: true });
        case 'tar.gz': return await gzipBuffer(await writeTar(entries, { pax: true }));
        case 'tar.bz2': return await bzip2Buffer(await writeTar(entries, { pax: true }));
        case 'tar.xz': return await xzBuffer(await writeTar(entries, { pax: true }));
        case '7z': return await write7z(entries, opts);               // new (WASM)
        default: throw new Error(`Unsupported output: ${toFormat}`);
    }
}
