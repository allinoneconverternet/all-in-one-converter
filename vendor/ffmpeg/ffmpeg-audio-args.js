// ffmpeg-audio-args.js
export function buildAudioArgs({
    inName,           // e.g. 'in.wav'
    outName,          // e.g. 'out.mp3'
    format,           // 'mp3' | 'wav'
    bitrateKbps,      // e.g. 160 for mp3 CBR
    vbrQuality,       // 0..9 for libmp3lame VBR (lower=faster/bigger)
    sampleRate,       // e.g. 44100
    channels,         // e.g. 2
    preferCBR = true
}) {
    const args = [
        '-hide_banner', '-nostdin', '-y',
        '-i', inName,
        '-vn', '-sn',
        '-map_metadata', '-1'
    ];

    // Threads: only helps if you use a multithreaded core + COOP/COEP
    const threads = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? Math.min(navigator.hardwareConcurrency, 8) : 4;
    if (self.crossOriginIsolated) {
        args.push('-threads', String(threads));
    }

    if (format === 'mp3') {
        args.push('-c:a', 'libmp3lame');
        if (typeof vbrQuality === 'number') {
            args.push('-q:a', String(vbrQuality));           // VBR (q=5..7 is fast & good)
        } else if (preferCBR) {
            const kbps = bitrateKbps || 160;
            args.push('-b:a', `${kbps}k`, '-compression_level', '0'); // fastest CBR
        } else {
            args.push('-q:a', '5');
        }
        if (sampleRate) args.push('-ar', String(sampleRate));
        if (channels) args.push('-ac', String(channels));
    } else if (format === 'wav') {
        args.push('-c:a', 'pcm_s16le');
        if (sampleRate) args.push('-ar', String(sampleRate));
        if (channels) args.push('-ac', String(channels));
    } else {
        throw new Error('Unsupported format for buildAudioArgs: ' + format);
    }

    args.push(outName);
    return args;
}


