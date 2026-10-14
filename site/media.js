export function parsePost(value) {
  let u;
  try { u = new URL(value.trim()); } catch { throw new Error('请粘贴完整的 X 帖子链接。'); }
  const hosts = ['x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com','mobile.x.com'];
  const match = u.pathname.match(/^\/(?:[A-Za-z0-9_]+|i\/web)\/status\/(\d+)(?:\/(?:video|photo)\/\d+)?\/?$/);
  if (u.protocol !== 'https:' || !hosts.includes(u.hostname) || u.username || u.password || u.port || !match) throw new Error('请输入 https://x.com/用户名/status/数字 格式的帖子链接。');
  return {id:match[1], url:`https://x.com/i/web/status/${match[1]}`};
}
export function safeMedia(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname.endsWith('.twimg.com') && !u.username && !u.password && !u.port; } catch { return false; }
}
export function originalPhoto(value) {
  const u = new URL(value), extension = u.pathname.match(/\.(jpe?g|png|webp)$/i);
  if (extension) { u.pathname = u.pathname.slice(0,-extension[0].length); u.searchParams.set('format',extension[1].toLowerCase()); }
  u.searchParams.set('name','orig'); return u.href;
}
export function normalizeMedia(data, post) {
  const tweet = data.tweet || data.status;
  if (!tweet || tweet.type === 'tombstone') throw new Error('帖子不可访问，可能已删除或需要登录。');
  const media = tweet.media || {}, author = tweet.author?.screen_name || data.author?.screen_name || '';
  const entries = media.all?.length ? media.all : [...(media.photos || []), ...(media.videos || [])];
  const result = [];
  for (const [index, entry] of entries.entries()) {
    const kind = entry.type === 'photo' ? 'photo' : 'video';
    let variants = [];
    if (kind === 'photo' && safeMedia(entry.url)) variants = [{url:originalPhoto(entry.url),quality:'原尺寸',bitrate:0}];
    if (kind === 'video') {
      const formats = [...(entry.formats || []),...(entry.variants || [])];
      if (safeMedia(entry.url) && /\.mp4(?:\?|$)/i.test(entry.url)) formats.push({url:entry.url,container:'mp4',width:entry.width,height:entry.height});
      const byURL = new Map();
      for (const f of formats) {
        if (!safeMedia(f.url) || !(f.container === 'mp4' || f.content_type === 'video/mp4' || /\.mp4(?:\?|$)/i.test(f.url))) continue;
        const dimensions = f.url.match(/\/(\d+)x(\d+)\//), width = Number(f.width || dimensions?.[1] || 0), height = Number(f.height || dimensions?.[2] || 0);
        const v = {url:f.url,quality:height ? `${height}p` : 'MP4',bitrate:Number(f.bitrate || 0),width,height};
        const existing = byURL.get(f.url); if (!existing || v.bitrate > existing.bitrate) byURL.set(f.url,v);
      }
      variants = [...byURL.values()].sort((a,b)=>b.width*b.height-a.width*a.height || b.bitrate-a.bitrate);
    }
    if (!variants.length) continue;
    const thumbnail = entry.thumbnail_url || (kind === 'photo' ? entry.url : '');
    result.push({id:`${post.id}-${entry.id || index}`,postID:post.id,kind,title:(tweet.text || 'X 媒体').slice(0,240),author,sourceURL:post.url,thumbnailURL:safeMedia(thumbnail)?thumbnail:'',variants,width:entry.width,height:entry.height});
  }
  if (!result.length) throw new Error('没有找到可下载的视频或图片。');
  return result;
}
export async function resolvePost(value) {
  const post = parsePost(value), controller = new AbortController(), timer = setTimeout(()=>controller.abort(),30000);
  try {
    const response = await fetch(`https://api.fxtwitter.com/status/${post.id}`,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    if (response.status === 429) throw new Error('解析请求过于频繁，请稍后重试。');
    if (!response.ok) throw new Error('解析服务暂时不可用，或帖子不可访问。');
    return normalizeMedia(await response.json(),post);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('解析超时，请检查网络后重试。');
    if (error instanceof TypeError) throw new Error('无法连接解析服务，请检查网络后重试。');
    throw error;
  } finally { clearTimeout(timer); }
}
