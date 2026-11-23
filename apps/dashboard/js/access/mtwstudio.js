// MTWStudio is an independent, server-authenticated app embedded as a manager-only tool.
// This role check controls dashboard visibility only; Worker enforces real access.
(function(){
  'use strict';
  function init(){
    const panel=document.querySelector('.mtwstudio-panel');
    if(!panel)return;
    const status=panel.querySelector('.mtwstudio-status');
    const iframe=panel.querySelector('.mtwstudio-frame');
    const open=panel.querySelector('.mtwstudio-open');
    const download=panel.querySelector('.mtwstudio-download');
    if(download) download.title='Latest published Windows portable host build';
    const address=String(window.MTW_STUDIO_URL||'').trim();
    let url;
    try{url=new URL(address);if(url.protocol!=='https:')throw Error('HTTPS required')}catch{
      if(status)status.textContent='MTWStudio is not deployed yet. Set window.MTW_STUDIO_URL to the HTTPS URL of the Cloudflare application.';
      if(iframe)iframe.hidden=true;
      if(open)open.hidden=true;
      return;
    }
    if(open){open.href=url.href;open.target='_blank';open.rel='noopener noreferrer';open.hidden=false}
    // Only load the remotely hosted login page when a manager opens this tool.
    document.addEventListener('db-tool-open',event=>{
      if(event.detail?.id!=='mtwstudio')return;
      const role=sessionStorage.getItem('mtw_admin_name');
      if(!['Managers','Manager'].includes(role))return;
      if(iframe&&!iframe.src){iframe.src=url.href;iframe.hidden=false}
      if(status)status.textContent='Separate manager sign-in is required for secure access.';
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
