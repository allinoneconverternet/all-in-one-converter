const CATS = {
  documents: new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','rtf','odt','ods','odp']),
  images:    new Set(['jpg','jpeg','png','webp','gif','bmp','tiff','svg','heic','avif']),
  audio:     new Set(['mp3','wav','flac','aac','ogg','m4a','opus','wma']),
  video:     new Set(['mp4','webm','mkv','avi','mov','wmv','3gp','flv']),
  archives:  new Set(['zip','7z','rar','tar','gz','bz2','xz']),
  ebooks:    new Set(['epub','mobi','azw','azw3','fb2','djvu','ibooks','cbz','cbr'])
};
const ORDER = ['documents','images','audio','video','archives','ebooks'];
function parse(slug) {
  const m = String(slug||'').match(/^\/convert\/([a-z0-9\-]+)-to-([a-z0-9\-]+)/);
  if (!m) return { src:null, dst:null };
  const src = m[1].split('-').pop();
  const dst = m[2].split('-').pop();
  return { src, dst };
}
export function categoryForSlug(slug) {
  const { src, dst } = parse(slug);
  for (const [cat,set] of Object.entries(CATS)) {
    if (set.has(src) || set.has(dst)) return cat;
  }
  return 'documents';
}
export function categoryLabel(cat) {
  const map = { documents:'Documents', images:'Images', audio:'Audio', video:'Video', archives:'Archives', ebooks:'eBooks' };
  return map[cat] || 'Documents';
}
export function categoryHref(cat) { return `/convert/${cat}/`; }
export { CATS, ORDER };
