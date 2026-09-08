const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('coach',{
  invoke:(method,params)=>ipcRenderer.invoke('coach:invoke',method,params),
  onEvent:(callback)=>{const handler=(_,event)=>callback(event);ipcRenderer.on('coach:event',handler);return ()=>ipcRenderer.removeListener('coach:event',handler)}
});
