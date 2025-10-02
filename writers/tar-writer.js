// writers/tar-writer.js
export async function writeTar(entries, { pax = true } = {}) {
    const chunks = [];
    for (const e of entries) {
        const hdr = buildUstarHeader(e, { pax });   // set mode, uid/gid=0, mtime, size, typeflag
        chunks.push(hdr);
        if (!e.isDir) {
            const data = await e.data();
            chunks.push(data, pad512(data.length));
        }
    }
    // two 512-byte zero blocks at end
    chunks.push(new Uint8Array(1024));
    return concat(chunks); // Uint8Array
}

// ...implement buildUstarHeader, pad512, concat (straightforward 512-byte blocks)
