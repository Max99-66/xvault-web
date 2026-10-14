let db;
export async function openDatabase() {
  db = await new Promise((resolve,reject)=>{
    const r=indexedDB.open('xvault-web',1);
    r.onupgradeneeded=()=>{for(const name of ['media','files','folders']) r.result.createObjectStore(name,{keyPath:'id'});};
    r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
    r.onblocked=()=>reject(new Error('请关闭其他隐匣页面后重试。'));
  });
  db.onversionchange=()=>db.close();
}
function transaction(stores,mode,action) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(stores,mode); let result;
    action(tx,value=>{result=value;});
    tx.oncomplete=()=>resolve(result); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error || new Error('保存失败'));
  });
}
export const list = name => transaction([name],'readonly',(tx,done)=>{const r=tx.objectStore(name).getAll();r.onsuccess=()=>done(r.result);});
export const get = (name,id) => transaction([name],'readonly',(tx,done)=>{const r=tx.objectStore(name).get(id);r.onsuccess=()=>done(r.result);});
export const put = (name,value) => transaction([name],'readwrite',tx=>tx.objectStore(name).put(value));
export function patchMedia(id,patch) {
  return transaction(['media'],'readwrite',tx=>{const store=tx.objectStore('media'),r=store.get(id);r.onsuccess=()=>{if(r.result)store.put({...r.result,...patch});};});
}
export function addMedia(media) {
  return transaction(['media'],'readwrite',(tx,done)=>{const s=tx.objectStore('media'),r=s.get(media.id);r.onsuccess=()=>{if(r.result){done(false);return;}s.add({...media,createdAt:Date.now(),folderID:'',tags:[],favorite:false,downloaded:false,bytes:0});done(true);};});
}
export function saveDownload(id,blob,poster) {
  return transaction(['media','files'],'readwrite',(tx,done)=>{
    const s=tx.objectStore('media'),r=s.get(id);
    r.onsuccess=()=>{if(!r.result){done(false);return;} tx.objectStore('files').put({id,blob,poster});s.put({...r.result,downloaded:true,bytes:blob.size});done(true);};
  });
}
export function deleteMedia(id) {
  return transaction(['media','files'],'readwrite',tx=>{tx.objectStore('media').delete(id);tx.objectStore('files').delete(id);});
}
export function deleteFolder(id) {
  return transaction(['folders','media'],'readwrite',tx=>{
    tx.objectStore('folders').delete(id); const r=tx.objectStore('media').openCursor();
    r.onsuccess=()=>{const c=r.result;if(c){if(c.value.folderID===id)c.update({...c.value,folderID:''});c.continue();}};
  });
}
