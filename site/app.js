import * as store from './store.js';
import {resolvePost,safeMedia} from './media.js';
const $=id=>document.getElementById(id), html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let records=[],folders=[],results=[],filter='all',editID,viewID,viewURL,viewerSession=0,renderSession=0;
let coverURLs=[]; const downloading=new Set();
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').hidden=true,4500);}
function report(error){notify(error.name==='QuotaExceededError'?'浏览器空间不足，请导出并删除部分媒体后重试。':error.message||'操作失败，请重试。');}
function formatSize(bytes){return bytes<1024*1024?`${(bytes/1024).toFixed(0)} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;}
function navigate(page){document.querySelectorAll('.page').forEach(el=>el.hidden=el.id!==page);document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===page);if(b.dataset.page===page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});}
function options(selected='',includeAll=false){return `${includeAll?'<option value="">所有分类</option><option value="_none">未分类</option>':'<option value="">未分类</option>'}${folders.map(f=>`<option value="${html(f.id)}" ${f.id===selected?'selected':''}>${html(f.name)}</option>`).join('')}`;}
async function reload(){[records,folders]=await Promise.all([store.list('media'),store.list('folders')]);folders.sort((a,b)=>a.createdAt-b.createdAt);render();renderResults();}
function renderResults(){
  $('result-count').textContent=`${results.length} 项媒体`;
  $('result-list').innerHTML=results.map((m,i)=>{const added=records.some(r=>r.id===m.id);return `<article class="result-row">${m.thumbnailURL?`<img src="${html(m.thumbnailURL)}" alt="媒体预览" loading="lazy">`:''}<div class="result-content"><p>${html(m.title)}</p><small>${m.kind==='video'?'视频':'图片'} · ${html(m.variants[0].quality)}</small></div><button data-add="${i}" ${added?'disabled':''}>${added?'已加入':'加入'}</button></article>`;}).join('');
  $('add-all').disabled=results.every(m=>records.some(r=>r.id===m.id));
}
function render(){
  const session=++renderSession;coverURLs.forEach(URL.revokeObjectURL);coverURLs=[];
  const selected=$('folder-filter').value;$('folder-filter').innerHTML=options(selected,true);$('folder-filter').value=selected==='_none'||folders.some(f=>f.id===selected)?selected:'';
  const query=$('search').value.trim().toLocaleLowerCase(),folder=$('folder-filter').value;
  const shown=records.filter(m=>(filter==='all'||(filter==='favorite'?m.favorite:filter==='downloaded'?m.downloaded:m.kind===filter))&&(!folder||(folder==='_none'?!m.folderID:m.folderID===folder))&&[m.title,m.author,...(m.tags||[])].join(' ').toLocaleLowerCase().includes(query)).sort((a,b)=>b.createdAt-a.createdAt);
  $('summary').textContent=`${shown.length} 项 · ${formatSize(records.reduce((n,m)=>n+(m.bytes||0),0))}`;
  $('empty').hidden=shown.length>0;$('empty-text').textContent=records.length?'没有符合条件的媒体':'粘贴链接，添加视频或图片';
  $('grid').innerHTML=shown.map(m=>`<article class="media-card"><button class="cover" data-action="view" data-id="${html(m.id)}" aria-label="打开 ${html(m.title)}"><img data-cover="${html(m.id)}" ${m.thumbnailURL?`src="${html(m.thumbnailURL)}"`:''} alt="${html(m.kind==='video'?'视频封面':'图片')}" loading="lazy">${m.kind==='video'?'<span class="play" aria-hidden="true">▷</span>':''}<span class="badge">${m.kind==='video'?'视频':'图片'} · ${html(m.variants[0].quality)}</span>${m.downloaded?'<span class="badge saved">已下载</span>':''}</button><div class="media-body"><h3 class="media-title">${html(m.title)}</h3><div class="media-meta"><span>${m.author?'@'+html(m.author):'X'}</span><span>${html(folders.find(f=>f.id===m.folderID)?.name||'未分类')}</span></div><div class="media-actions"><button class="favorite ${m.favorite?'selected':''}" data-action="favorite" data-id="${html(m.id)}" aria-label="${m.favorite?'取消收藏':'收藏'}" aria-pressed="${m.favorite}">${m.favorite?'★':'☆'}</button><button class="quiet" data-action="edit" data-id="${html(m.id)}">整理</button><button data-action="download" data-id="${html(m.id)}" ${m.downloaded||downloading.has(m.id)?'disabled':''}>${m.downloaded?'已下载':downloading.has(m.id)?'下载中':'下载'}</button></div>${m.tags?.length?`<div class="tags">${m.tags.map(t=>'#'+html(t)).join(' ')}</div>`:''}</div></article>`).join('');
  for(const m of shown.filter(m=>m.downloaded))store.get('files',m.id).then(file=>{
    if(session!==renderSession||!file)return;const blob=m.kind==='photo'?file.blob:file.poster;if(!blob)return;
    const element=[...document.querySelectorAll('[data-cover]')].find(el=>el.dataset.cover===m.id);if(element){const url=URL.createObjectURL(blob);coverURLs.push(url);element.src=url;}
  }).catch(()=>{});
  $('folder-list').innerHTML=folders.map(f=>`<article class="folder-card"><span class="folder-symbol" aria-hidden="true">▱</span><h3>${html(f.name)}</h3><p>${records.filter(m=>m.folderID===f.id).length} 项</p><button data-open-folder="${html(f.id)}" class="quiet">打开</button><button data-delete-folder="${html(f.id)}" class="quiet remove-folder danger">删除</button></article>`).join('')||'<div class="empty"><p>暂无分类</p></div>';
}
async function freshMedia(m){
  const items=await resolvePost(m.sourceURL),fresh=items.find(item=>item.id===m.id);
  if(!fresh)throw new Error('原帖中已找不到这项媒体。');
  await store.patchMedia(m.id,{variants:fresh.variants,thumbnailURL:fresh.thumbnailURL});return {...m,variants:fresh.variants,thumbnailURL:fresh.thumbnailURL};
}
async function fetchBlob(url,kind){
  if(!safeMedia(url))throw new Error('媒体地址不受支持。');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);
  try{
    const r=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
    if(!r.ok)throw new Error('媒体下载失败，请重新解析后重试。');
    const blob=await r.blob();if(!blob.size||!blob.type.startsWith(kind==='video'?'video/':'image/'))throw new Error('未收到有效的媒体文件。');return blob;
  }catch(e){if(e.name==='AbortError')throw new Error('下载超时，请保持页面在前台并重试。');if(e instanceof TypeError)throw new Error('媒体下载受网络限制，请检查网络后重试。');throw e;}finally{clearTimeout(timer);}
}
async function download(id){
  if(downloading.has(id))return;let m=records.find(m=>m.id===id);if(!m||m.downloaded)return;
  downloading.add(id);render();
  try{
    m=await freshMedia(m);const blob=await fetchBlob(m.variants[0].url,m.kind);
    let poster;if(m.kind==='video'&&m.thumbnailURL){try{poster=await fetchBlob(m.thumbnailURL,'photo');}catch{}}
    const saved=await store.saveDownload(id,blob,poster);if(saved){navigator.storage?.persist?.().catch(()=>{});notify('已下载到浏览器，可离线观看。');}
  }catch(e){report(e);}finally{downloading.delete(id);await reload();}
}
async function view(id){
  const session=++viewerSession;let m=records.find(m=>m.id===id);if(!m)return;viewID=id;
  $('viewer-media').textContent='正在打开…';$('viewer-info').textContent='';$('export-file').hidden=true;$('source-link').href=m.sourceURL;$('viewer-mode').textContent=m.downloaded?'本地播放':'在线播放';$('viewer').showModal();
  try{
    let source;
    if(m.downloaded){const file=await store.get('files',id);if(!file?.blob)throw new Error('本地文件已丢失，请重新下载。');if(session!==viewerSession)return;viewURL=URL.createObjectURL(file.blob);source=viewURL;}
    else{m=await freshMedia(m);source=m.variants[0].url;}
    if(session!==viewerSession||!$('viewer').open)return;
    const el=document.createElement(m.kind==='video'?'video':'img');el.src=source;
    if(m.kind==='video'){el.controls=true;el.playsInline=true;el.preload='metadata';}else el.alt=m.title;
    el.onerror=()=>{if(session===viewerSession)notify('媒体无法打开，请检查网络或重新下载。');};
    $('viewer-media').replaceChildren(el);$('viewer-info').textContent=m.title;$('export-file').hidden=!m.downloaded;
  }catch(e){if(session===viewerSession)$('viewer-media').textContent=e.message;}
}
function closeViewer(){++viewerSession;const video=$('viewer-media').querySelector('video');if(video){video.pause();video.removeAttribute('src');video.load();}$('viewer-media').replaceChildren();if(viewURL){URL.revokeObjectURL(viewURL);viewURL=undefined;}viewID=undefined;}
function edit(id){const m=records.find(m=>m.id===id);if(!m)return;editID=id;$('edit-title').value=m.title;$('edit-tags').value=(m.tags||[]).join(', ');$('edit-folder').innerHTML=options(m.folderID);$('edit-folder').value=m.folderID||'';$('editor').showModal();}
async function exportFile(){
  const m=records.find(m=>m.id===viewID);if(!m)return;const file=await store.get('files',m.id);if(!file?.blob)return;
  const extension=m.kind==='video'?'mp4':file.blob.type==='image/png'?'png':file.blob.type==='image/webp'?'webp':'jpg';
  const url=URL.createObjectURL(file.blob),a=document.createElement('a');a.href=url;a.download=`XVault-${m.id}.${extension}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);notify('请在下载位置查看文件。');
}
function setFilter(value){filter=value;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===value);b.setAttribute('aria-pressed',String(b.dataset.filter===value));});render();}
function handle(action){return event=>{try{Promise.resolve(action(event)).catch(report);}catch(error){report(error);}};}
async function initialize(){
  await store.openDatabase();
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>setFilter(b.dataset.filter));
  $('search').oninput=render;$('folder-filter').onchange=render;
  $('paste').onclick=handle(async()=>{try{$('post-url').value=await navigator.clipboard.readText();}catch{notify('请长按输入框，选择粘贴。');}$('post-url').focus();});
  $('resolve-form').onsubmit=handle(async event=>{
    event.preventDefault();$('resolve-button').disabled=true;$('resolve-button').textContent='解析中';$('results').hidden=true;
    try{results=await resolvePost($('post-url').value);renderResults();$('results').hidden=false;}
    finally{$('resolve-button').disabled=false;$('resolve-button').textContent='解析';}
  });
  $('result-list').onclick=handle(async event=>{const b=event.target.closest('[data-add]');if(!b)return;b.disabled=true;try{await store.addMedia(results[Number(b.dataset.add)]);await reload();}finally{renderResults();}});
  $('add-all').onclick=handle(async()=>{for(const m of results)await store.addMedia(m);await reload();notify('已加入媒体库。');});
  $('close-results').onclick=()=>$('results').hidden=true;
  $('grid').onclick=handle(async event=>{const b=event.target.closest('[data-action]');if(!b)return;const id=b.dataset.id,m=records.find(m=>m.id===id);if(!m)return;
    if(b.dataset.action==='view')await view(id);if(b.dataset.action==='edit')edit(id);if(b.dataset.action==='download')await download(id);if(b.dataset.action==='favorite'){await store.patchMedia(id,{favorite:!m.favorite});await reload();}
  });
  $('folder-form').onsubmit=handle(async event=>{event.preventDefault();const name=$('folder-name').value.trim();if(!name)return;if(folders.some(f=>f.name===name))throw new Error('已有同名分类。');await store.put('folders',{id:crypto.randomUUID(),name,createdAt:Date.now()});$('folder-name').value='';await reload();});
  $('folder-list').onclick=handle(async event=>{const open=event.target.closest('[data-open-folder]'),remove=event.target.closest('[data-delete-folder]');if(open){navigate('library');$('folder-filter').value=open.dataset.openFolder;$('search').value='';setFilter('all');}if(remove&&confirm('删除此分类？其中的媒体会保留。')){await store.deleteFolder(remove.dataset.deleteFolder);await reload();}});
  $('edit-form').onsubmit=handle(async event=>{event.preventDefault();const title=$('edit-title').value.trim();if(!title)throw new Error('请填写标题。');await store.patchMedia(editID,{title,folderID:$('edit-folder').value,tags:[...new Set($('edit-tags').value.split(/[,，]/).map(t=>t.trim()).filter(Boolean))].slice(0,20)});$('editor').close();await reload();});
  $('cancel-edit').onclick=()=>$('editor').close();$('delete-media').onclick=handle(async()=>{if(!confirm('删除这项媒体及其本地下载？'))return;await store.deleteMedia(editID);$('editor').close();await reload();});
  $('close-viewer').onclick=()=>$('viewer').close();$('viewer').addEventListener('close',closeViewer);$('export-file').onclick=handle(exportFile);
  $('storage').onclick=handle(async()=>{const bytes=records.reduce((n,m)=>n+(m.bytes||0),0);$('storage-size').textContent=`${records.length} 项媒体 · 本地下载 ${formatSize(bytes)}`;$('storage-dialog').showModal();});
  $('close-storage').onclick=()=>$('storage-dialog').close();$('persist').onclick=handle(async()=>{const allowed=await navigator.storage?.persist?.();notify(allowed?'已允许保留本地存储。':'浏览器暂未授予持久存储，重要媒体请导出到文件。');});
  await reload();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>notify('离线页面缓存未启用，联网使用不受影响。'));
}
initialize().catch(error=>{report(error);$('empty-text').textContent='无法打开本地存储，请退出无痕模式后重试。';document.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);});
