const $=id=>document.getElementById(id);
const state={user:null,ws:null,peer:null,channel:null,sessionId:null,approved:false,remoteStream:null,pendingIce:[],iceServers:[{urls:'stun:stun.cloudflare.com:3478'}]};
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
      const name=document.createElement('span');name.textContent=host.label+' · '+(host.online?'Online':'Offline');
      const button=document.createElement('button');button.textContent='Connect to this PC';button.disabled=!host.online;
      button.onclick=()=>connect({hostId:host.id});
      row.append(name,button);area.append(row);
    }
  }catch(e){notice(e.message)}
}
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
  state.pendingIce=[];
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
  peer.addTransceiver('video',{direction:'recvonly'});
  peer.ontrack=e=>{state.remoteStream=e.streams[0]||new MediaStream([e.track]);$('video').srcObject=state.remoteStream;show('placeholder',false);status('Connected · encrypted WebRTC',true)};
  peer.onicecandidate=e=>{if(e.candidate)send({type:'ice',data:e.candidate.toJSON()})};
  peer.onconnectionstatechange=()=>{const connection=peer.connectionState;$('quality').textContent='WebRTC: '+connection;if(['failed','closed','disconnected'].includes(connection)){status('Connection '+connection);if(connection==='failed')disconnect()}};
  peer.ondatachannel=e=>{if(e.channel.label!=='input'){e.channel.close();return}state.channel=e.channel;state.channel.onopen=()=>status('Connected · input enabled',true);state.channel.onclose=()=>status('Input channel closed')};
  show('viewer-section',true);show('placeholder',true);
}
async function signalling(payload){
  if(payload.type==='status'){
    state.approved=payload.status==='approved';
    if(payload.status==='pending')status('Waiting for host approval…');
    if(payload.status==='approved'){status('Approved · establishing WebRTC…');await startPeer()}
    if(payload.status==='rejected'){status('Host rejected request');notice('The host did not approve the connection')}
    return;
  }
  if(payload.type==='end'){notice('Session ended: '+(payload.reason||'disconnected'));await disconnect();return}
  if(!state.approved)return;
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
    ws.onerror=()=>notice('Signalling connection error');
    ws.onclose=()=>{if(state.sessionId===id)disconnect()};
    await Promise.all([history(),hosts()]);
  }catch(err){status('Connection failed');notice(err.message)}
  finally{button.disabled=false}
}
$('connect-form').addEventListener('submit',e=>{e.preventDefault();connect({code:$('code').value.trim()})});

function input(data){if(state.approved&&state.channel?.readyState==='open')state.channel.send(JSON.stringify(data))}
const screen=$('screen');
function normalized(e){const bounds=screen.getBoundingClientRect();return{x:Math.min(1,Math.max(0,(e.clientX-bounds.left)/bounds.width)),y:Math.min(1,Math.max(0,(e.clientY-bounds.top)/bounds.height))}}
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