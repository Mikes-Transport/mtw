const $=id=>document.getElementById(id);
const state={user:null,ws:null,peer:null,channel:null,sessionId:null,approved:false,remoteStream:null,pendingIce:[],pendingOffer:null,frameChunks:null,frameLastId:0,monitors:[],selectedMonitor:0,iceServers:[{urls:'stun:stun.cloudflare.com:3478'}]};
const show=(id,yes)=>$(id).hidden=!yes;
const dialogIds=['connect-dialog','register-dialog','pair-dialog','clipboard-dialog'];
function openDialog(id){
  for(const other of dialogIds){if(other!==id&&$(other).open)$(other).close()}
  const dialog=$(id);
  if(!dialog.open)dialog.showModal();
  if(id==='connect-dialog')hosts();
}
function closeDialogs(){for(const id of dialogIds)if($(id).open)$(id).close()}
for(const button of document.querySelectorAll('.close-dialog'))
  button.addEventListener('click',()=>button.closest('dialog')?.close());
$('nav-connect').onclick=()=>openDialog('connect-dialog');
$('connect-code-toggle').onclick=()=>{
  const panel=$('connect-code-panel');
  panel.hidden=!panel.hidden;
  $('connect-code-toggle').setAttribute('aria-expanded',String(!panel.hidden));
  if(!panel.hidden)$('code').focus();
};
$('empty-connect').onclick=()=>openDialog('connect-dialog');
$('devices-add').onclick=()=>openDialog('register-dialog');
$('devices-pair').onclick=()=>openDialog('pair-dialog');

const clipboardRequests=new Map();
let remoteClipboardText=null;
let localClipboardText=null;
let clipboardSyncEnabled=true;
let clipboardPoll=null;
let clipboardBusy=false;
let lastLocalRead=0;
const clipboardAckWaiters=new Map();
let pasteInProgress=false;
const clipboardStatus=(message)=>{$('clipboard-sync-status').textContent=message;};
const clipboardConnected=()=>clipboardSyncEnabled&&state.approved&&state.ws?.readyState===WebSocket.OPEN;
function stopClipboardPolling(){
  for(const resolve of clipboardAckWaiters.values())resolve(false);
  clipboardAckWaiters.clear();
  clipboardStatus('Clipboard sync paused');
  if(clipboardPoll!==null){clearInterval(clipboardPoll);clipboardPoll=null}
  remoteClipboardText=null;
  localClipboardText=null;
}
async function readLocalClipboard(){
  if(!clipboardConnected()||clipboardBusy||!navigator.clipboard?.readText)return null;
  try{
    const text=await navigator.clipboard.readText();
    if(text.length>8192)return null;
    if(text!==localClipboardText&&text!==remoteClipboardText){
      localClipboardText=text;
      if(text){send({type:'clipboard-set',requestId:'sync_'+Date.now().toString(36),text});clipboardStatus('Syncing copied text to PC…')}
    }
    return text;
  }catch{clipboardStatus('Clipboard read blocked — use the Clipboard button');return null}
}
async function startClipboardPolling(){
  if(clipboardPoll!==null)return;
  clipboardPoll=setInterval(()=>{
    if(clipboardConnected()&&document.hasFocus()&&Date.now()-lastLocalRead>=1250){
      lastLocalRead=Date.now();
      readLocalClipboard();
    }
  },1500);
}
async function applyRemoteClipboard(text){
  if(!clipboardConnected()||typeof text!=='string'||text.length>8192)return;
  remoteClipboardText=text;
  $('clipboard-text').value=text;
  try{
    if(!navigator.clipboard?.writeText)throw Error('Clipboard API unavailable');
    clipboardBusy=true;
    await navigator.clipboard.writeText(text);
    localClipboardText=text;
    clipboardStatus('Remote PC text synced');
  }catch{
    // Browser embedding/permission policy may block unattended writes.
    // Keep the text available in the Clipboard dialog as a fallback.
    clipboardStatus('Clipboard write blocked — use Clipboard button');
    clipboardFeedback('Remote text received. Browser may require Copy text to this device.');
  }finally{clipboardBusy=false}
}
$('clipboard-auto').addEventListener('change',event=>{
  clipboardSyncEnabled=event.target.checked;
  clipboardStatus(clipboardSyncEnabled?'Clipboard sync enabled':'Clipboard sync off');
  if(clipboardSyncEnabled){startClipboardPolling();readLocalClipboard()}
  else stopClipboardPolling();
});

const clipboardFeedback=(text)=>{$('clipboard-feedback').textContent=text;};
const remoteClipboardReady=()=>state.approved&&state.ws?.readyState===WebSocket.OPEN;
$('clipboard-open').onclick=()=>{
  if(!remoteClipboardReady())return;
  clipboardFeedback('');
  openDialog('clipboard-dialog');
};
$('clipboard-read-local').onclick=async()=>{
  try{
    if(!navigator.clipboard?.readText)throw Error('Clipboard access is unavailable here');
    const value=await navigator.clipboard.readText();
    if(value.length>8192)throw Error('Maximum 8,192 characters');
    $('clipboard-text').value=value;
    clipboardFeedback('Text loaded from this device. Choose Send text to PC.');
  }catch(e){clipboardFeedback('Clipboard read blocked. Paste into the text box manually (Ctrl+V).')}
};
$('clipboard-copy-local').onclick=async()=>{
  const value=$('clipboard-text').value;
  try{
    if(!navigator.clipboard?.writeText)throw Error('Clipboard access is unavailable');
    await navigator.clipboard.writeText(value);
    clipboardFeedback('Text copied to this device.');
  }catch(e){
    $('clipboard-text').focus();
    $('clipboard-text').select();
    clipboardFeedback('Browser blocked clipboard writing. Text selected — press Ctrl+C to copy.');
  }
};
function requestClipboard(type,text){
  if(!remoteClipboardReady()){clipboardFeedback('Connect to a PC first.');return}
  const requestId='clip_'+Math.random().toString(36).slice(2)+Date.now().toString(36);
  clipboardRequests.set(requestId,type);
  send({type,requestId,...(type==='clipboard-set'?{text}:{})});
  clipboardFeedback('Waiting for remote PC…');
}
$('clipboard-send').onclick=()=>{
  const text=$('clipboard-text').value;
  if(!text){clipboardFeedback('Enter or paste text first.');return}
  if(text.length>8192){clipboardFeedback('Maximum 8,192 characters.');return}
  requestClipboard('clipboard-set',text);
};
$('clipboard-fetch').onclick=()=>requestClipboard('clipboard-get');
function notice(message,error=true){$('message').textContent=message||'';$('message').style.color=error?'#ffadad':'#88e4b4'}
function status(text,live=false){$('status').textContent=text;$('dot').classList.toggle('live',live)}
async function api(path,method='GET',body){
  const response=await fetch('/api/'+path,{method,credentials:'include',headers:{...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  let payload={};try{payload=await response.json()}catch{}
  if(!response.ok)throw Error(payload.error||'Request failed ('+response.status+')');
  return payload;
}
async function refresh(){
  try{
    const {user}=await api('auth/me');
    state.user=user;$('identity').textContent=user.name+' · Verified manager';
    show('login',false);show('setup',false);show('workspace',true);show('viewer-section',true);
    // Saved devices load when the Connect dialog opens.
  }catch{
    state.user=null;closeDialogs();show('workspace',false);$('identity').textContent='Authenticator required';
    try{
      const {needsSetup}=await api('auth/setup-status');
      show('setup',needsSetup);show('login',!needsSetup);
    }catch{show('setup',false);show('login',true)}
  }
}
async function hosts(){
  const area=$('computers');
  try{
    const {hosts}=await api('hosts');area.replaceChildren();
    if(!hosts.length){area.textContent='No saved computers yet. Add a new computer or use a connection code below.';return}
    for(const host of hosts){
      const row=document.createElement('div');row.className='saved-computer';
      const info=document.createElement('div');info.className='saved-computer-info';
      const name=document.createElement('strong');name.textContent=host.label;
      const availability=document.createElement('small');availability.className=host.online?'computer-online':'computer-offline';
      availability.textContent=host.online?'● Online — ready to connect':'● Offline';
      info.append(name,availability);
      const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
      const button=document.createElement('button');button.textContent=host.online?'Connect':'Offline';button.disabled=!host.online;
      button.onclick=()=>{closeDialogs();connect({hostId:host.id})};
      actions.append(button);
      if(host.owned){
        const remove=document.createElement('button');
        remove.type='button';remove.className='danger';remove.style.marginTop='0';
        remove.textContent='Remove';
        remove.title='Revoke this PC setup key and remove the computer';
        remove.onclick=async()=>{
          if(!confirm('Remove '+host.label+' from MTWStudio? This will revoke its current PC setup key.'))return;
          remove.disabled=true;notice('');
          try{
            await api('admin/hosts/'+host.id,'DELETE');
            notice(host.label+' removed. Its old PC setup key no longer works.',false);
            await hosts();
          }catch(error){notice('Could not remove computer: '+error.message);remove.disabled=false}
        };
        actions.append(remove);
      }
      row.append(info,actions);area.append(row);
    }
  }catch(e){notice(e.message)}
}
$('register-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=event.target.querySelector('button');
  if(button.disabled)return;
  button.disabled=true;
  notice('');
  show('host-credential',false);
  $('host-access-key').textContent='';
  try{
    const label=$('host-label').value.trim();
    const result=await api('admin/hosts','POST',{label});
    const grouped=result.accessKey.match(/.{1,5}/g)?.join('-')||result.accessKey;
    $('host-access-key').textContent=grouped;
    show('host-credential',true);
    $('host-label').value='';
    notice('PC registered. Copy the setup key into the Windows app; you only enter it once.',false);
  }catch(error){
    notice('Could not register computer: '+error.message);
  }finally{
    button.disabled=false;
  }
});
$('copy-host-key').addEventListener('click',async()=>{
  const value=$('host-access-key').textContent.trim();
  if(!value)return;
  try{await navigator.clipboard.writeText(value);notice('PC setup key copied.',false)}
  catch{notice('Copy the displayed key manually.')}
});
$('refresh-computers').addEventListener('click',()=>hosts());
$('pair-form').addEventListener('submit',async e=>{
  e.preventDefault();notice('');
  try{
    await api('hosts/pair','POST',{code:$('pair-code').value});
    $('pair-code').value='';openDialog('connect-dialog');notice('PC saved. It can now be selected while running.',false);
  }catch(err){notice(err.message)}
});
$('login-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;notice('');
  try{
    const username=$('username').value.trim().toLowerCase();
    await api('auth/login','POST',{username,code:$('auth-code').value.trim()});
    sessionStorage.setItem('mtwstudio_username',username);
    $('auth-code').value='';
    await refresh();
  }catch(error){notice(error.message)}finally{button.disabled=false}
});
$('setup-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;notice('');
  try{
    const result=await api('auth/setup','POST',{
      username:$('setup-username').value.trim().toLowerCase(),
      name:$('setup-name').value.trim(),setupKey:$('setup-key').value
    });
    $('totp-secret').textContent=result.secret;
    show('setup-confirm',true);
    notice('Add the secret to your authenticator and confirm a code.',false);
  }catch(error){notice(error.message)}finally{button.disabled=false}
});
$('confirm-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;notice('');
  try{
    await api('auth/setup/confirm','POST',{setupKey:$('setup-key').value,code:$('confirm-code').value.trim()});
    $('totp-secret').textContent='';$('setup-key').value='';$('confirm-code').value='';
    show('setup-confirm',false);
    $('username').value=$('setup-username').value.trim().toLowerCase();
    await refresh();notice('Authenticator registered. Enter a fresh code to unlock.',false);
  }catch(error){notice(error.message)}finally{button.disabled=false}
});
$('logout').onclick=async()=>{await disconnect();try{await api('auth/logout','POST')}catch{}await refresh()};
function send(message){if(state.ws?.readyState===WebSocket.OPEN)state.ws.send(JSON.stringify(message))}
async function disconnect(){
  const id=state.sessionId;state.sessionId=null;state.approved=false;
  if(state.channel){try{state.channel.close()}catch{}state.channel=null}
  if(state.peer){state.peer.close();state.peer=null}
  state.pendingIce=[];state.pendingOffer=null;state.frameChunks=null;state.frameLastId=0;state.monitors=[];
  $('monitor-picker').replaceChildren();show('monitor-controls',false);
  $('canvas').getContext('2d').clearRect(0,0,$('canvas').width,$('canvas').height);
  show('canvas',false);
  if(state.ws){state.ws.onclose=null;state.ws.close();state.ws=null}
  show('clipboard-open',false);
  clipboardRequests.clear();
  stopClipboardPolling();
  if($('clipboard-dialog').open)$('clipboard-dialog').close();
  $('video').srcObject=null;show('viewer-section',!!state.user);show('disconnect',false);
  show('placeholder',true);
  $('placeholder').innerHTML='<span class="empty-symbol">▣</span><strong>No active connection</strong><span>Choose Connect to select a saved PC or add a new one.</span><button type="button" id="empty-connect" class="empty-action">Connect to a computer</button>';
  $('empty-connect').onclick=()=>openDialog('connect-dialog');
  $('quality').textContent='No active connection';
  status('Disconnected');if(id)try{await api('connections/'+id+'/disconnect','POST')}catch{}
}
$('disconnect').onclick=disconnect;
$('fullscreen').onclick=()=>{const viewer=$('screen');if(document.fullscreenElement)document.exitFullscreen();else viewer.requestFullscreen().catch(e=>notice(e.message))};
async function startPeer(){
  if(state.peer)return;
  const peer=new RTCPeerConnection({iceServers:state.iceServers});
  state.peer=peer;
  peer.ontrack=e=>{state.remoteStream=e.streams[0]||new MediaStream([e.track]);$('video').srcObject=state.remoteStream;show('placeholder',false);status('Connected · encrypted WebRTC',true)};
  peer.onicecandidate=e=>{if(e.candidate)send({type:'ice',data:e.candidate.toJSON()})};
  peer.onconnectionstatechange=()=>{
    const connection=peer.connectionState;
    $('quality').textContent='WebRTC: '+connection;
    if(connection==='connecting')status('Establishing secure peer connection…');
    if(connection==='connected')status('WebRTC connected · waiting for first screen frame',true);
    if(connection==='failed'){
      status('WebRTC failed');
      notice('Could not establish a peer-to-peer connection. These networks may require a TURN relay.');
    }
    if(connection==='disconnected')status('WebRTC disconnected · retry connection');
  };
  peer.ondatachannel=e=>{
    if(e.channel.label==='frames'){
      e.channel.onmessage=event=>receiveFrame(event.data);
      return;
    }
    if(e.channel.label!=='input'){e.channel.close();return}
    state.channel=e.channel;
    state.channel.onopen=()=>status('Connected · input enabled',true);
    state.channel.onclose=()=>status('Input channel closed');
  };
  show('viewer-section',true);show('placeholder',true);
}
async function signalling(payload){
  if(payload.type==='monitors'){
    state.monitors=Array.isArray(payload.monitors)?payload.monitors:[];
    state.selectedMonitor=Number.isInteger(payload.selected)?payload.selected:0;
    const current=state.monitors.find(m=>m.index===state.selectedMonitor);
    if(current)fitRemoteMonitor(current.width,current.height);
    const picker=$('monitor-picker');picker.replaceChildren();
    for(const monitor of state.monitors){
      const option=document.createElement('option');
      option.value=String(monitor.index);
      option.textContent=monitor.label+' · '+monitor.width+' × '+monitor.height;
      picker.append(option);
    }
    picker.value=String(state.selectedMonitor);
    show('monitor-controls',state.monitors.length>0);
    return;
  }
  if(payload.type==='status'){
    state.approved=payload.status==='approved';
    if(payload.status==='pending')status('Waiting for host approval…');
    if(payload.status==='approved'){
      status('Approved · starting secure screen relay…');
      $('quality').textContent='Secure WebSocket relay';
      show('viewer-section',true);
      show('placeholder',true);
      $('placeholder').textContent='Connecting to remote desktop…';
      show('clipboard-open',true);
      clipboardStatus('Clipboard sync enabled');
      startClipboardPolling();
      send({type:'controller-ready'});
    }
    if(payload.status==='rejected'){status('Host rejected request');notice('The host did not approve the connection')}
    return;
  }
  if(payload.type==='clipboard-update'){
    if(clipboardConnected())await applyRemoteClipboard(payload.text);
    return;
  }
  if(payload.type==='clipboard-result'){
    if(!state.approved)return;
    if(clipboardAckWaiters.has(payload.requestId)){
      const resolve=clipboardAckWaiters.get(payload.requestId);
      clipboardAckWaiters.delete(payload.requestId);
      resolve(payload.ok===true);
      clipboardStatus(payload.ok?'PC clipboard updated':'PC clipboard update failed');
      return;
    }
    if(!clipboardRequests.has(payload.requestId))return;
    const requested=clipboardRequests.get(payload.requestId);
    clipboardRequests.delete(payload.requestId);
    if(payload.operation!==(requested==='clipboard-get'?'get':'set'))return;
    if(!payload.ok){clipboardFeedback('Remote clipboard error: '+(payload.error||'Unknown error'));return}
    if(payload.operation==='get'){
      $('clipboard-text').value=typeof payload.text==='string'?payload.text:'';
      if(clipboardConnected())await applyRemoteClipboard($('clipboard-text').value);
      clipboardFeedback('Text received. Click Copy text to this device, or select the text and press Ctrl+C.');
    }else clipboardFeedback('Text placed on remote PC clipboard. Paste on the PC with Ctrl+V.');
    return;
  }
  if(payload.type==='frame'&&state.approved){receiveFrame(JSON.stringify(payload));return}
  if(payload.type==='end'){notice('Session ended: '+(payload.reason||'disconnected'));await disconnect();return}
  if(!state.approved){
    if(payload.type==='offer'&&payload.data)state.pendingOffer=payload.data;
    if(payload.type==='ice'&&payload.data)state.pendingIce.push(payload.data);
    return;
  }
  if(payload.type==='offer'){
    await startPeer();
    await state.peer.setRemoteDescription(new RTCSessionDescription(payload.data));
    for(const candidate of state.pendingIce.splice(0)) await state.peer.addIceCandidate(new RTCIceCandidate(candidate));
    const answer=await state.peer.createAnswer();await state.peer.setLocalDescription(answer);
    send({type:'answer',data:state.peer.localDescription.toJSON()});
  }else if(payload.type==='ice'){
    if(state.peer?.remoteDescription)await state.peer.addIceCandidate(new RTCIceCandidate(payload.data));
    else state.pendingIce.push(payload.data);
  }
}
async function connect(details){
  notice('');await disconnect();const button=$('connect');button.disabled=true;
  try{
    status('Requesting access…');
    const {id,host}=await api('connections','POST',details);
    state.sessionId=id;$('code').value='';closeDialogs();status('Waiting for approval from '+host+'…');show('disconnect',true);show('viewer-section',true);show('placeholder',true);$('placeholder').textContent='Waiting for approval from '+host+'…';
    const ws=new WebSocket(location.origin.replace(/^http/,'ws')+'/api/connections/'+id+'/ws');
    state.ws=ws;ws.onmessage=e=>{try{signalling(JSON.parse(e.data)).catch(err=>notice(err.message))}catch{}};
    ws.onopen=()=>{status('Viewer connected · waiting for host approval');};
    ws.onerror=()=>notice('Signalling connection error');
    ws.onclose=()=>{if(state.sessionId===id)disconnect()};
    // No visible connection history; the session is ready.
  }catch(err){status('Connection failed');notice(err.message)}
  finally{button.disabled=false}
}
function receiveFrame(raw){
  let chunk;
  try{chunk=JSON.parse(raw)}catch{return}
  if(chunk.type!=='frame'||!Number.isInteger(chunk.id)||!Number.isInteger(chunk.index)||
     !Number.isInteger(chunk.total)||chunk.total<1||chunk.total>96||chunk.image?.length>10000)return;
  if(chunk.monitor!==state.selectedMonitor||chunk.id<=state.frameLastId)return;
  if(!state.frameChunks||state.frameChunks.id!==chunk.id)
    state.frameChunks={id:chunk.id,total:chunk.total,parts:new Array(chunk.total),monitor:chunk.monitor,width:chunk.width,height:chunk.height,received:0};
  const frame=state.frameChunks;
  if(chunk.index<0||chunk.index>=frame.total||frame.parts[chunk.index]!==undefined)return;
  frame.parts[chunk.index]=chunk.image;frame.received++;
  if(frame.received!==frame.total)return;
  state.frameChunks=null;state.frameLastId=frame.id;
  const image=new Image();
  image.onload=()=>{
    if(!state.approved||frame.monitor!==state.selectedMonitor)return;
    const canvas=$('canvas');
    if(canvas.width!==image.width||canvas.height!==image.height){
      canvas.width=image.width;canvas.height=image.height;
    }
    fitRemoteMonitor(image.width,image.height);
    canvas.getContext('2d').drawImage(image,0,0);
    show('canvas',true);show('placeholder',false);
    $('quality').textContent='Secure relay · image received';
    status('Connected · viewing monitor '+(frame.monitor+1),true);
    // Credit-based flow control: request the next frame only after this
    // one has rendered. Prevents mobile data from queuing old images.
    send({type:'frame-ack',id:frame.id,monitor:frame.monitor});
  };
  image.src='data:image/jpeg;base64,'+frame.parts.join('');
}
$('monitor-picker').addEventListener('change',event=>{
  const index=Number(event.target.value);
  if(!Number.isInteger(index)||index<0||!state.monitors.some(m=>m.index===index))return;
  state.selectedMonitor=index;state.frameChunks=null;state.frameLastId=0;
  const target=state.monitors.find(m=>m.index===index);
  if(target)fitRemoteMonitor(target.width,target.height);
  show('placeholder',true);show('canvas',false);
  $('placeholder').textContent='Switching to monitor '+(index+1)+'…';
  $('quality').textContent='Changing monitor…';
  send({type:'select-monitor',index});
});
$('connect-form').addEventListener('submit',e=>{e.preventDefault();connect({code:$('code').value.trim()})});

function input(data){
  if(!state.approved||state.ws?.readyState!==WebSocket.OPEN)return;
  send({type:'input',data});
}
const screen=$('screen');
function fitRemoteMonitor(width,height){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return;
  // The viewer must take on the remote display's real aspect ratio rather
  // than forcing every monitor into a fixed 16:9 viewport.
  screen.style.aspectRatio=width+' / '+height;
}

function normalized(e){
  // Use the actual canvas rectangle and subtract any letterboxing produced
  // by object-fit:contain. This matches both normal and fullscreen layouts.
  const frame=$('canvas');
  const bounds=frame.getBoundingClientRect();
  const width=frame.width||16,height=frame.height||9;
  const scale=Math.min(bounds.width/width,bounds.height/height);
  const visibleWidth=width*scale,visibleHeight=height*scale;
  const left=bounds.left+(bounds.width-visibleWidth)/2;
  const top=bounds.top+(bounds.height-visibleHeight)/2;
  return{x:Math.min(1,Math.max(0,(e.clientX-left)/visibleWidth)),y:Math.min(1,Math.max(0,(e.clientY-top)/visibleHeight))};
}
screen.addEventListener('pointermove',e=>input({type:'mouseMove',...normalized(e)}));
screen.addEventListener('pointerdown',e=>{screen.focus();input({type:'mouseDown',button:e.button,...normalized(e)})});
screen.addEventListener('pointerup',e=>input({type:'mouseUp',button:e.button,...normalized(e)}));
screen.addEventListener('contextmenu',e=>e.preventDefault());
screen.addEventListener('wheel',e=>{if(state.approved&&state.ws?.readyState===WebSocket.OPEN){e.preventDefault();input({type:'scroll',dx:e.deltaX,dy:e.deltaY})}},{passive:false});
screen.addEventListener('keydown',e=>{
  if(!state.approved||state.ws?.readyState!==WebSocket.OPEN)return;
  e.preventDefault();
  if((e.ctrlKey||e.metaKey)&&e.code==='KeyV'&&clipboardSyncEnabled){
    if(e.repeat||pasteInProgress)return;
    pasteInProgress=true;
    // Clipboard API access must start directly within the keyboard event.
    // Wait for host acknowledgement before injecting the paste keystrokes.
    const read=navigator.clipboard?.readText?.();
    Promise.resolve(read).then(async text=>{
      if(!remoteClipboardReady()||typeof text!=='string'||text.length>8192)return false;
      const id='paste_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
      const acknowledged=new Promise(resolve=>{
        clipboardAckWaiters.set(id,resolve);
        setTimeout(()=>{if(clipboardAckWaiters.has(id)){clipboardAckWaiters.delete(id);resolve(false)}},3000);
      });
      send({type:'clipboard-set',requestId:id,text});
      return await acknowledged;
    }).then(ok=>{
      if(ok&&remoteClipboardReady()){
        input({type:'keyDown',code:'ControlLeft',key:'Control'});
        input({type:'keyDown',code:'KeyV',key:'v'});
        input({type:'keyUp',code:'KeyV',key:'v'});
        input({type:'keyUp',code:'ControlLeft',key:'Control'});
        clipboardStatus('Pasted text into remote PC');
      }else clipboardStatus('Automatic paste unavailable — use Clipboard button');
    }).catch(()=>clipboardStatus('Clipboard permission blocked — use Clipboard button'))
      .finally(()=>{pasteInProgress=false});
    return;
  }
  input({type:'keyDown',code:e.code,key:e.key,ctrl:e.ctrlKey,shift:e.shiftKey,alt:e.altKey,meta:e.metaKey});
});
screen.addEventListener('keyup',e=>{
  if(!state.approved)return;
  e.preventDefault();
  // The matching V keypress is injected after clipboard acknowledgement.
  if(e.code==='KeyV'&&clipboardSyncEnabled&&(e.ctrlKey||e.metaKey||pasteInProgress))return;
  input({type:'keyUp',code:e.code,key:e.key});
});
window.addEventListener('pagehide',()=>{stopClipboardPolling();if(state.ws)state.ws.close()});
// Resize the Webflow dashboard iframe to match the selected monitor's actual
// rendered height. Only message our known parent; parent validates origin.
if(window.parent!==window){
  const parentOrigin='https://mtw-lookup-2026.webflow.io';
  let lastHeight=0;
  const updateFrameHeight=()=>{
    const height=Math.ceil(document.documentElement.scrollHeight);
    if(height!==lastHeight&&height>=300&&height<=10000){
      lastHeight=height;
      window.parent.postMessage({type:'mtwstudio:height',height},parentOrigin);
    }
  };
  new ResizeObserver(updateFrameHeight).observe(document.body);
  window.addEventListener('load',updateFrameHeight);
  updateFrameHeight();
}
$('username').value=sessionStorage.getItem('mtwstudio_username')||'';
refresh();