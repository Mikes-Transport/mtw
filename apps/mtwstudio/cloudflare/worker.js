// MTWStudio Cloudflare Worker and Durable Object.
// Zero trust: MTW dashboard role visibility is not proof of identity.
// All remote sessions require a separate manager account and agent approval.
const enc = new TextEncoder();
const COOKIE = 'mtwstudio_session';
const SESSION_MS = 8 * 60 * 60 * 1000;
const CODE_MS = 24 * 60 * 60 * 1000; // refreshed by authenticated host heartbeat
const CONNECT_MS = 30 * 60 * 1000;
const ITERATIONS = 240000;
function json(value,status=200,headers={}) { return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}}); }
function fail(status,message){return json({error:message},status);}
function hex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function hash(value){return hex(await crypto.subtle.digest('SHA-256',enc.encode(value)));}
function random(bytes=32){const raw=crypto.getRandomValues(new Uint8Array(bytes));return Array.from(raw,b=>b.toString(16).padStart(2,'0')).join('');}
function time(){return Date.now();}
function cookieValue(request){const found=(request.headers.get('cookie')||'').match(/(?:^|;\s*)mtwstudio_session=([a-f0-9]{64})(?:;|$)/);return found?.[1]||null;}
async function account(request,env){const token=cookieValue(request);if(!token)return null;const user=await env.DB.prepare('SELECT u.id,u.email,u.name,u.role FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.enabled=1 AND u.role=?').bind(await hash(token),time(),'manager').first();return user||null;}
function cookie(token,maxAge){return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${maxAge}`;}
async function verifyPassword(password,user){
  const salt=Uint8Array.from(user.password_salt.match(/.{2}/g),v=>parseInt(v,16));
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const derived=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:user.password_iterations},key,256);
  const lhs=new Uint8Array(derived),rhs=Uint8Array.from(user.password_hash.match(/.{2}/g),v=>parseInt(v,16));
  let diff=lhs.length^rhs.length;for(let i=0;i<lhs.length;i++)diff|=lhs[i]^ (rhs[i]||0);return diff===0;
}
function sameOrigin(request){const origin=request.headers.get('origin');return origin === new URL(request.url).origin;}
function securityHeaders(env){return {'Content-Security-Policy':`default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'self' ${env.EMBED_ORIGIN||"'none'"}; form-action 'self'; connect-src 'self' wss:; img-src 'self' data:; media-src 'self' blob:; script-src 'self'; style-src 'self';`, 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Strict-Transport-Security':'max-age=31536000; includeSubDomains'};}
function restricted(response,env){const headers=new Headers(response.headers);for(const [k,v]of Object.entries(securityHeaders(env)))headers.set(k,v);headers.set('cache-control','no-store');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
async function readJson(request){if(Number(request.headers.get('content-length')||0)>8192)throw Error('Payload too large');return await request.json();}
async function agent(request,env){
  const token=(request.headers.get('authorization')||'').match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if(!token)return null;
  return await env.DB.prepare('SELECT id,label FROM hosts WHERE agent_key_hash=? AND enabled=1').bind(await hash(token)).first();
}
async function room(env,hostId){return env.SESSIONS.get(env.SESSIONS.idFromName('host:'+hostId));}
async function proxyRoom(env,hostId,path,init={}){return (await room(env,hostId)).fetch(new Request('https://room.internal'+path,init));}
async function handler(request,env){
  const url=new URL(request.url),path=url.pathname;
  const api=path.startsWith('/api/');
  if(!api)return restricted(await env.ASSETS.fetch(request),env);
  const method=request.method;
  // Cookie-authenticated operations must be same-origin. Agent uses bearer headers.
  if(method!=='GET' && !sameOrigin(request) && !path.startsWith('/api/agent/'))return fail(403,'Invalid request origin');
  if(path==='/api/auth/login'&&method==='POST'){
    const body=await readJson(request);const email=String(body.email||'').toLowerCase().trim();
    const password=String(body.password||'');
    if(email.length>254||password.length>1024||!email||!password)return fail(400,'Invalid credentials');
    // All attempts consume a Durable Object atomic counter (across all edge locations).
    const limit=await env.SESSIONS.get(env.SESSIONS.idFromName('login:'+await hash(email+'|'+(request.headers.get('cf-connecting-ip')||'unknown')))).fetch('https://room.internal/rate',{method:'POST'});
    if(limit.status===429)return fail(429,'Too many attempts. Try later.');
    const user=await env.DB.prepare('SELECT * FROM users WHERE email=? AND enabled=1 AND role=?').bind(email,'manager').first();
    if(!user||!(await verifyPassword(password,user)))return fail(401,'Invalid credentials');
    const token=random(),expires=time()+SESSION_MS;
    await env.DB.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(await hash(token),user.id,expires,time()).run();
    return json({user:{id:user.id,name:user.name,email:user.email,role:user.role} },200,{'set-cookie':cookie(token,SESSION_MS/1000)});
  }
  if(path==='/api/agent/mode'&&method==='POST'){
    const host=await agent(request,env);if(!host)return fail(401,'Invalid agent credentials');
    const body=await readJson(request);const mode=String(body.mode||'');
    if(!['code','paired'].includes(mode))return fail(400,'Invalid mode');
    await env.DB.prepare('UPDATE hosts SET connection_mode=? WHERE id=?').bind(mode,host.id).run();
    return json({mode});
  }
  if(path==='/api/agent/heartbeat'&&method==='POST'){
    const host=await agent(request,env);if(!host)return fail(401,'Invalid agent credentials');
    const body=await readJson(request),code=String(body.code||'').trim().toUpperCase();
    if(!/^[A-F0-9]{16}$/.test(code))return fail(400,'Invalid code');
    const updated=await env.DB.prepare('UPDATE access_codes SET expires_at=? WHERE code_hash=? AND host_id=?').bind(time()+CODE_MS,await hash(code),host.id).run();
    if(updated.meta.changes!==1)return fail(404,'Code not registered');
    return json({ok:true});
  }
  if(path==='/api/agent/status'&&method==='GET'){
    const host=await agent(request,env);if(!host)return fail(401,'Invalid agent credentials');
    const record=await env.DB.prepare('SELECT connection_mode FROM hosts WHERE id=?').bind(host.id).first();
    return json({id:host.id,label:host.label,mode:record?.connection_mode||'code'});
  }
  if(path==='/api/agent/code'&&method==='POST'){
    const host=await agent(request,env);if(!host)return fail(401,'Invalid agent credentials');
    const code=random(8).toUpperCase(),codeHash=await hash(code);
    await env.DB.prepare('DELETE FROM access_codes WHERE host_id=?').bind(host.id).run();
    await env.DB.prepare('INSERT INTO access_codes(code_hash,host_id,expires_at,used_at) VALUES(?,?,?,NULL)').bind(codeHash,host.id,time()+CODE_MS).run();
    return json({code,expiresAt:time()+CODE_MS});
  }
  if(path==='/api/agent/ws'&&method==='GET'){
    const host=await agent(request,env);if(!host)return fail(401,'Invalid agent credentials');
    if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return fail(400,'WebSocket required');
    const code=String(url.searchParams.get('code')||'').trim().toUpperCase();
    const match=await env.DB.prepare('SELECT code_hash FROM access_codes WHERE code_hash=? AND host_id=? AND expires_at>?').bind(await hash(code),host.id,time()).first();
    if(!match)return fail(403,'Host code missing or expired');
    return proxyRoom(env,host.id,'/ws?role=agent',{headers:{upgrade:'websocket','x-internal-host':host.id}});
  }
  const user=await account(request,env);
  if(!user)return fail(401,'Manager sign-in required');
  if(path==='/api/auth/me'&&method==='GET')return json({user});
  if(path==='/api/auth/logout'&&method==='POST'){
    const token=cookieValue(request);
    if(token)await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await hash(token)).run();
    return json({ok:true},200,{'set-cookie':cookie('',0)});
  }
  if(path==='/api/hosts/pair'&&method==='POST'){
    const rate=await env.SESSIONS.get(env.SESSIONS.idFromName('pair:'+user.id)).fetch('https://room.internal/rate-code',{method:'POST'});
    if(rate.status===429)return fail(429,'Too many pairing attempts');
    const body=await readJson(request),code=String(body.code||'').trim().toUpperCase();
    if(!/^[A-F0-9]{16}$/.test(code))return fail(400,'Invalid code format');
    const host=await env.DB.prepare("SELECT h.id,h.label FROM hosts h JOIN access_codes c ON c.host_id=h.id WHERE c.code_hash=? AND c.expires_at>? AND h.enabled=1 AND h.connection_mode='paired'").bind(await hash(code),time()).first();
    if(!host)return fail(404,'Host unavailable');
    const online=await proxyRoom(env,host.id,'/presence');if(!online.ok)return fail(409,'Host offline');
    await env.DB.prepare('INSERT OR IGNORE INTO trusted_controllers(host_id,user_id) VALUES(?,?)').bind(host.id,user.id).run();
    return json({host});
  }
  if(path==='/api/hosts'&&method==='GET'){
    const hosts=await env.DB.prepare("SELECT h.id,h.label FROM hosts h JOIN trusted_controllers t ON t.host_id=h.id WHERE t.user_id=? AND h.enabled=1 AND h.connection_mode='paired' ORDER BY h.label LIMIT 100").bind(user.id).all();
    const results=await Promise.all(hosts.results.map(async h=>{
      const presence=await proxyRoom(env,h.id,'/presence');
      return {id:h.id,label:h.label,online:presence.ok};
    }));
    return json({hosts:results});
  }
  if(path==='/api/history'&&method==='GET'){
    const result=await env.DB.prepare('SELECT c.id,c.status,c.created_at,c.ended_at,h.label AS host FROM connections c JOIN hosts h ON h.id=c.host_id WHERE controller_id=? ORDER BY created_at DESC LIMIT 25').bind(user.id).all();
    return json({connections:result.results});
  }
  if(path==='/api/connections'&&method==='POST'){
    const body=await readJson(request);
    const attempt=await env.SESSIONS.get(env.SESSIONS.idFromName('attempts:'+user.id)).fetch('https://room.internal/rate-code',{method:'POST'});
    if(attempt.status===429)return fail(429,'Too many attempts. Try again later.');
    const hostId=String(body.hostId||'');
    const isPaired=Boolean(hostId);
    let host,codeHash;
    if(isPaired){
      if(!/^[a-zA-Z0-9_-]{1,100}$/.test(hostId))return fail(400,'Invalid host');
      host=await env.DB.prepare("SELECT h.id,h.label FROM hosts h JOIN trusted_controllers t ON t.host_id=h.id WHERE h.id=? AND t.user_id=? AND h.enabled=1 AND h.connection_mode='paired'").bind(hostId,user.id).first();
      if(!host)return fail(404,'Host unavailable');
      codeHash=await hash('paired:'+crypto.randomUUID());
      await env.DB.prepare('INSERT INTO access_codes(code_hash,host_id,expires_at,used_at) VALUES(?,?,?,?)').bind(codeHash,host.id,time()+CONNECT_MS,time()).run();
    }else{
      const code=String(body.code||'').trim().toUpperCase();
      if(!/^[A-F0-9]{16}$/.test(code))return fail(400,'Invalid code format');
      codeHash=await hash(code);
      host=await env.DB.prepare("SELECT h.id,h.label FROM access_codes c JOIN hosts h ON h.id=c.host_id AND h.enabled=1 WHERE c.code_hash=? AND c.expires_at>? ").bind(codeHash,time()).first();
      if(!host)return fail(404,'Code unavailable or expired');
      // Code stays usable while the agent is online; host approval is mandatory for every session.
    }
    const presence=await proxyRoom(env,host.id,'/presence');
    if(!presence.ok)return fail(409,'Host is offline');
    const id=crypto.randomUUID(),expires=time()+CONNECT_MS;
    await env.DB.prepare('INSERT INTO connections(id,host_id,controller_id,code_hash,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').bind(id,host.id,user.id,codeHash,'pending',time(),expires).run();
    const res=await proxyRoom(env,host.id,'/request',{method:'POST',body:JSON.stringify({id,hostId:host.id,controllerId:user.id,controllerName:user.name,expires})});
    if(!res.ok){await env.DB.prepare("UPDATE connections SET status='ended',ended_at=? WHERE id=?").bind(time(),id).run();return fail(409,'Host is busy or offline');}
    return json({id,host:host.label,status:'pending',expiresAt:expires},201);
  }
  const match=path.match(/^\/api\/connections\/([0-9a-f-]{36})(\/ws|\/disconnect)?$/);
  if(match){
    const conn=await env.DB.prepare('SELECT * FROM connections WHERE id=? AND controller_id=?').bind(match[1],user.id).first();
    if(!conn)return fail(404,'Session not found');
    if(conn.expires_at<time())return fail(410,'Session expired');
    if(match[2]==='/ws'&&method==='GET'){
      if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return fail(400,'WebSocket required');
      return proxyRoom(env,conn.host_id,'/ws?role=controller&session='+conn.id,{headers:{upgrade:'websocket','x-internal-user':user.id}});
    }
    if(match[2]==='/disconnect'&&method==='POST'){
      await proxyRoom(env,conn.host_id,'/end',{method:'POST'});
      await env.DB.prepare("UPDATE connections SET status='ended',ended_at=? WHERE id=? AND status!='ended'").bind(time(),conn.id).run();
      return json({ok:true});
    }
    if(!match[2]&&method==='GET')return json({id:conn.id,status:conn.status,expiresAt:conn.expires_at});
  }
  return fail(404,'Not found');
}
export default {async fetch(request,env){try{return await handler(request,env)}catch(e){console.error('MTWStudio:',e);return fail(500,'Request failed')}}};

// One room per access code. The host must explicitly approve this exact session.
export class ConnectionRoom {
  constructor(state,env){this.state=state;this.env=env;}
  sockets(role){return this.state.getWebSockets().filter(s=>s.deserializeAttachment()?.role===role);}
  emit(role,value){for(const socket of this.sockets(role)){try{socket.send(JSON.stringify(value))}catch{}}}
  async rate(path){
    const now=time(),key=path==='/rate'?'login-rate':'code-rate';
    const state=await this.state.storage.get(key)||{count:0,until:now+600000};
    if(now>state.until){state.count=0;state.until=now+600000;}
    state.count++;
    await this.state.storage.put(key,state);
    return state.count>(path==='/rate'?8:15)?new Response('',{status:429}):new Response('',{status:204});
  }
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==='/rate'||url.pathname==='/rate-code')return this.rate(url.pathname);
    if(url.pathname==='/presence'&&request.method==='GET')return this.sockets('agent').length?json({online:true}):fail(404,'Offline');
    if(url.pathname==='/request'&&request.method==='POST'){
      if(!this.sockets('agent').length)return fail(409,'Host offline');
      const body=await request.json();
      const existing=await this.state.storage.get('connection');
      if(existing&&existing.status!=='ended'&&existing.status!=='rejected'&&existing.expires>time())return fail(409,'Already paired');
      await this.state.storage.put('connection',{...body,status:'pending'});
      this.emit('agent',{type:'request',sessionId:body.id,controllerName:body.controllerName,expiresAt:body.expires});
      return json({ok:true});
    }
    if(url.pathname==='/end'&&request.method==='POST'){await this.end('disconnected');return json({ok:true})}
    if(url.pathname==='/ws'){
      if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return fail(400,'Upgrade required');
      const role=url.searchParams.get('role');
      const session=await this.state.storage.get('connection');
      if(role==='agent'&&!request.headers.get('x-internal-host'))return fail(403,'Host auth required');
      if(role==='controller'&&(!session||session.id!==url.searchParams.get('session')||session.controllerId!==request.headers.get('x-internal-user')||session.expires<time()))return fail(403,'Controller auth required');
      if(!['agent','controller'].includes(role))return fail(403,'Invalid role');
      for(const socket of this.sockets(role)){try{socket.close(1000,'Replaced connection')}catch{}}
      const pair=new WebSocketPair(),client=pair[0],server=pair[1];
      this.state.acceptWebSocket(server);
      server.serializeAttachment({role});
      if(role==='controller')server.send(JSON.stringify({type:'status',status:session.status,expiresAt:session.expires}));
      if(role==='agent'&&session&&session.status==='pending')server.send(JSON.stringify({type:'request',sessionId:session.id,controllerName:session.controllerName,expiresAt:session.expires}));
      return new Response(null,{status:101,webSocket:client});
    }
    return fail(404,'Unknown room route');
  }
  async end(reason){
    const session=await this.state.storage.get('connection');
    if(!session||session.status==='ended'||session.status==='rejected')return;
    session.status='ended';await this.state.storage.put('connection',session);
    await this.env.DB.prepare("UPDATE connections SET status='ended',ended_at=? WHERE id=?").bind(time(),session.id).run();
    this.emit('agent',{type:'end',reason});this.emit('controller',{type:'end',reason});
    for(const socket of this.state.getWebSockets())try{socket.close(1000,'Session ended')}catch{}
  }
  async webSocketMessage(ws,message){
    const role=ws.deserializeAttachment()?.role;
    let payload;
    try{if(typeof message!=='string'||message.length>32768)throw Error('Invalid message');payload=JSON.parse(message)}catch{return}
    let session=await this.state.storage.get('connection');
    if(!session||session.status==='ended')return;
    if(session.expires<time()){await this.end('expired');return}
    if(role==='agent'&&['approve','reject'].includes(payload.type)&&session.status==='pending'){
      session.status=payload.type==='approve'?'approved':'rejected';
      await this.state.storage.put('connection',session);
      await this.env.DB.prepare('UPDATE connections SET status=? WHERE id=?').bind(session.status,session.id).run();
      this.emit('controller',{type:'status',status:session.status});
      if(session.status==='rejected')await this.end('rejected');
      return;
    }
    if(role==='controller'&&payload.type==='disconnect'){await this.end('controller disconnected');return}
    if(session.status!=='approved')return;
    // Signalling only: SDP/ICE; never forward arbitrary user input over signalling.
    if(['offer','answer','ice'].includes(payload.type)){
      if(payload.type==='offer'&&role!=='agent')return;
      if(payload.type==='answer'&&role!=='controller')return;
      this.emit(role==='agent'?'controller':'agent',{type:payload.type,data:payload.data});
    }
  }
  async webSocketClose(ws){const role=ws.deserializeAttachment()?.role;
    if(role==='agent'){
      const session=await this.state.storage.get('connection');
      if(session)await this.env.DB.prepare('DELETE FROM access_codes WHERE host_id=?').bind(session.hostId).run();
      await this.end('host disconnected');
    }else if(role==='controller')await this.end('controller disconnected');
  }
  async webSocketError(ws){await this.webSocketClose(ws)}
}
