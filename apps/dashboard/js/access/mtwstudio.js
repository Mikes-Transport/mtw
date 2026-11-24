// MTWStudio is an independent, server-authenticated app embedded as a manager-only tool.
// This role check controls dashboard visibility only; Worker enforces real access.
(function(){
  'use strict';
  function init(){
    const panel=document.querySelector('.mtwstudio-panel');
    if(!panel)return;
    const status=panel.querySelector('.mtwstudio-status');
    const iframe=panel.querySelector('.mtwstudio-frame');
    const download=panel.querySelector('.mtwstudio-download');
    if(download) download.title='Portable Windows host application (ZIP archive)';
    const address='https://mtwstudio.mtwaustin.workers.dev/';
    let url;
    try{url=new URL(address);if(url.protocol!=='https:')throw Error('HTTPS required')}catch{
      if(status)status.textContent='MTWStudio is not deployed yet. Set window.MTW_STUDIO_URL to the HTTPS URL of the Cloudflare application.';
      if(iframe)iframe.hidden=true;
      return;
    }
    // Size the embedded viewer to its content, including tall or portrait
    // monitors. Accept messages only from the exact trusted Cloudflare frame.
    window.addEventListener('message',event=>{
      if(event.origin!==url.origin||!iframe||event.source!==iframe.contentWindow)return;
      if(event.data?.type!=='mtwstudio:height')return;
      const height=event.data.height;
      if(!Number.isSafeInteger(height)||height<300||height>10000)return;
      iframe.style.height=height+'px';
    });
    // Only load the remotely hosted login page when a manager opens this tool.
    document.addEventListener('db-tool-open',event=>{
      if(event.detail?.id!=='mtwstudio')return;
      const role=sessionStorage.getItem('mtw_admin_name');
      if(!['Managers','Manager'].includes(role))return;
      if(iframe){
        iframe.hidden=false;
        iframe.src=url.href;
        iframe.style.display='block';
      }
      if(status)status.textContent='Verify with your authenticator inside the console. Only approved Windows hosts can be controlled.';
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
