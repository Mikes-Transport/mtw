const $=id=>document.getElementById(id);
const state={user:null,ws:null,peer:null,channel:null,sessionId:null,approved:false,remoteStream:null,pendingIce:[],pendingOffer:null,frameChunks:null,frameLastId:0,monitors:[],selectedMonitor:0,iceServers:[{urls:'stun:stun.cloudflare.com:3478'}]};
const show=(id,yes)=>$(id).hidden=!yes;
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
    show('login',false);show('setup',false);show('workspace',true);
    await Promise.all([history(),hosts()]);
  }catch{
    state.user=null;show('workspace',false);$('identity').textContent='Authenticator required';
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
    if(!hosts.length){area.textContent='No computers paired yet.';return}
    for(const host of hosts){
      const row=document.createElement('div');row.className='history-row';
      const name=document.createElement('span');
      name.textContent=host.label+' · '+(host.online?'Online':'Offline')+(host.mode==='code'?' · Connection code mode':' · Saved access');
      const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
      const button=document.createElement('button');button.textContent=host.online?'Request connection':'Offline';button.disabled=!host.online;
      button.onclick=()=>connect({hostId:host.id});
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
      row.append(name,actions);area.append(row);
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
    $('pair-code').value='';notice('PC saved. It can now be selected while running.',false);
    await hosts();
  }catch(err){notice(err.message)}
});
async function history(){
  try{const {connections}=await api('history');$('history').replaceChildren();
    if(!connections.length){$('history').textContent='No connections yet.';return}
    for(const item of connections){const row=document.createElement('div');row.className='history-row';const host=document.createElement('span');host.textContent=item.host;const info=document.createElement('small');info.textContent=new Date(item.created_at).toLocaleString()+' · '+item.status;row.append(host,info);$('history').appendChild(row)}
  }catch(e){notice(e.message)}
}
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
  $('video').srcObject=null;show('viewer-section',false);show('disconnect',false);
  status('Disconnected');if(id)try{await api('connections/'+id+'/disconnect','POST')}catch{}
  if(state.user)await history();
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
      status('Approved · starting WebRTC…');
      await startPeer();
      send({type:'controller-ready'});
      if(state.pendingOffer){
        const offer=state.pendingOffer;
        state.pendingOffer=null;
        await signalling({type:'offer',data:offer});
      }
    }
    if(payload.status==='rejected'){status('Host rejected request');notice('The host did not approve the connection')}
    return;
  }
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
    state.sessionId=id;$('code').value='';status('Waiting for approval from '+host+'…');show('disconnect',true);
    const ws=new WebSocket(location.origin.replace(/^http/,'ws')+'/api/connections/'+id+'/ws');
    state.ws=ws;ws.onmessage=e=>{try{signalling(JSON.parse(e.data)).catch(err=>notice(err.message))}catch{}};
    ws.onopen=()=>{send({type:'controller-ready'});};
    ws.onerror=()=>notice('Signalling connection error');
    ws.onclose=()=>{if(state.sessionId===id)disconnect()};
    await Promise.all([history(),hosts()]);
  }catch(err){status('Connection failed');notice(err.message)}
  finally{button.disabled=false}
}
function receiveFrame(raw){
  let chunk;
  try{chunk=JSON.parse(raw)}catch{return}
  if(chunk.type!=='frame'||!Number.isInteger(chunk.id)||!Number.isInteger(chunk.index)||
     !Number.isInteger(chunk.total)||chunk.total<1||chunk.total>100||chunk.image?.length>12000)return;
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
    canvas.getContext('2d').drawImage(image,0,0);
    show('canvas',true);show('placeholder',false);
    status('Connected · viewing monitor '+(frame.monitor+1),true);
  };
  image.src='data:image/jpeg;base64,'+frame.parts.join('');
}
$('monitor-picker').addEventListener('change',event=>{
  const index=Number(event.target.value);
  if(!Number.isInteger(index)||index<0||!state.monitors.some(m=>m.index===index))return;
  state.selectedMonitor=index;state.frameChunks=null;state.frameLastId=0;
  show('placeholder',true);show('canvas',false);
  send({type:'select-monitor',index});
});
$('connect-form').addEventListener('submit',e=>{e.preventDefault();connect({code:$('code').value.trim()})});

function input(data){if(state.approved&&state.channel?.readyState==='open')state.channel.send(JSON.stringify(data))}
const screen=$('screen');
function normalized(e){
  const bounds=screen.getBoundingClientRect();
  const frame=$('canvas');
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
screen.addEventListener('wheel',e=>{if(state.channel?.readyState==='open'){e.preventDefault();input({type:'scroll',dx:e.deltaX,dy:e.deltaY})}},{passive:false});
screen.addEventListener('keydown',e=>{if(!state.approved||!state.channel||state.channel.readyState!=='open')return;e.preventDefault();input({type:'keyDown',code:e.code,key:e.key,ctrl:e.ctrlKey,shift:e.shiftKey,alt:e.altKey,meta:e.metaKey})});
screen.addEventListener('keyup',e=>{if(state.approved){e.preventDefault();input({type:'keyUp',code:e.code,key:e.key})}});
window.addEventListener('pagehide',()=>{if(state.ws)state.ws.close()});
$('username').value=sessionStorage.getItem('mtwstudio_username')||'';
refresh();