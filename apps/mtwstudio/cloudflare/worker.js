// MTWStudio: Firebase Authentication + Firestore, with Cloudflare Durable Objects for live signalling.
const enc=new TextEncoder(), SESSION_MS=3600000, CODE_MS=86400000, CONNECT_MS=1800000;
const cookies='mtwstudio_session';
const now=()=>Date.now();
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(await crypto.subtle.digest('SHA-256',enc.encode(value)));
const random=(n=32)=>hex(crypto.getRandomValues(new Uint8Array(n)));
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store',...headers}});
const fail=(status,error)=>json({error},status);
const originOk=req=>req.headers.get('origin')===new URL(req.url).origin;
const cookie=(value,age)=>cookies+'='+value+'; HttpOnly; Secure; SameSite=None; Path=/; Max-Age='+age;
const tokenCookie=req=>(req.headers.get('cookie')||'').match(/(?:^|;\s*)mtwstudio_session=([^;\s]+)/)?.[1];
const readJson=async req=>{
  if(Number(req.headers.get('content-length')||0)>8192)throw Error('Request too large');
  const raw=await req.text();if(raw.length>8192)throw Error('Request too large');
  return JSON.parse(raw);
};
const b64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const decode64=part=>Uint8Array.from(atob(part.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-part.length%4)%4)),c=>c.charCodeAt(0));
let oauthCache=null, jwkCache=null;
async function serviceToken(env){
  if(oauthCache&&oauthCache.until>now()+60000)return oauthCache.token;
  const svc=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON||'{}');
  if(!svc.client_email||!svc.private_key)throw Error('Firebase service credential missing');
  const header=b64url(enc.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const issued=Math.floor(now()/1000);
  const payload=b64url(enc.encode(JSON.stringify({iss:svc.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:issued,exp:issued+3500})));
  const pem=svc.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const der=Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(header+'.'+payload));
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:header+'.'+payload+'.'+b64url(new Uint8Array(sig))})});
  if(!response.ok)throw Error('Firebase credential exchange failed');
  const data=await response.json();oauthCache={token:data.access_token,until:now()+(data.expires_in||3500)*1000};
  return oauthCache.token;
}
const collectionUrl=(env,collection)=>'https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(env.FIREBASE_PROJECT_ID)+'/databases/(default)/documents/'+collection;
function fromValue(v){
  if('nullValue'in v)return null;
  if('stringValue'in v)return v.stringValue;
  if('integerValue'in v)return Number(v.integerValue);
  if('booleanValue'in v)return v.booleanValue;
  if('doubleValue'in v)return v.doubleValue;
  if('arrayValue'in v)return (v.arrayValue.values||[]).map(fromValue);
  if('mapValue'in v)return fromFields(v.mapValue.fields||{});
  return undefined;
}
const fromFields=fields=>Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,fromValue(v)]));
function toValue(value){
  if(value===null||value===undefined)return{nullValue:null};
  if(typeof value==='boolean')return{booleanValue:value};
  if(typeof value==='number')return Number.isSafeInteger(value)?{integerValue:String(value)}:{doubleValue:value};
  if(Array.isArray(value))return{arrayValue:{values:value.map(toValue)}};
  if(typeof value==='object')return{mapValue:{fields:toFields(value)}};
  return{stringValue:String(value)};
}
const toFields=obj=>Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,toValue(v)]));
async function firebaseFetch(env,url,options={}){
  const headers=new Headers(options.headers||{});
  headers.set('authorization','Bearer '+await serviceToken(env));
  if(options.body)headers.set('content-type','application/json');
  const res=await fetch(url,{...options,headers});
  if(!res.ok&&res.status!==404)throw Error('Firestore request failed ('+res.status+')');
  return res;
}
async function getDoc(env,col,id){
  const res=await firebaseFetch(env,collectionUrl(env,col)+'/'+encodeURIComponent(id));
  return res.status===404?null:fromFields((await res.json()).fields||{});
}
async function putDoc(env,col,id,data){
  const url=collectionUrl(env,col)+'/'+encodeURIComponent(id);
  const res=await firebaseFetch(env,url,{method:'PATCH',body:JSON.stringify({fields:toFields(data)})});
  return fromFields((await res.json()).fields||{});
}
async function patchDoc(env,col,id,data){
  const mask=new URLSearchParams();
  for(const key of Object.keys(data))mask.append('updateMask.fieldPaths',key);
  const url=collectionUrl(env,col)+'/'+encodeURIComponent(id)+'?'+mask;
  const res=await firebaseFetch(env,url,{method:'PATCH',body:JSON.stringify({fields:toFields(data)})});
  return fromFields((await res.json()).fields||{});
}
async function queryDocs(env,col,field,value){
  const url='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(env.FIREBASE_PROJECT_ID)+'/databases/(default)/documents:runQuery';
  const query={structuredQuery:{from:[{collectionId:col}],where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:toValue(value)}},limit:150}};
  const res=await firebaseFetch(env,url,{method:'POST',body:JSON.stringify(query)});
  return (await res.json()).flatMap(x=>x.document?[{id:x.document.name.split('/').at(-1),...fromFields(x.document.fields||{})}]:[]);
}

const b32alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(bytes){
  let n=0,bits=0,out='';
  for(const byte of bytes){n=(n<<8)|byte;bits+=8;while(bits>=5){bits-=5;out+=b32alphabet[(n>>bits)&31]}}
  if(bits)out+=b32alphabet[(n<<(5-bits))&31];
  return out;
}
function fromBase32(text){
  let n=0,bits=0,out=[];
  for(const ch of text.toUpperCase().replace(/=+$/,'')){
    const i=b32alphabet.indexOf(ch);if(i<0)throw Error('Bad authenticator secret');
    n=(n<<5)|i;bits+=5;
    if(bits>=8){bits-=8;out.push((n>>bits)&255)}
  }
  return new Uint8Array(out);
}
function aesKey(env){
  const value=String(env.MTWSTUDIO_TOTP_KEY||'');
  if(!/^[A-Za-z0-9+/]{43}=$/.test(value))throw Error('Missing authenticator encryption key');
  return crypto.subtle.importKey('raw',Uint8Array.from(atob(value),v=>v.charCodeAt(0)),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function seal(env,secret){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv},await aesKey(env),enc.encode(secret));
  return b64url(iv)+'.'+b64url(new Uint8Array(bytes));
}
async function unseal(env,value){
  const [nonce,cipher]=String(value||'').split('.');
  if(!nonce||!cipher)throw Error('Missing encrypted authenticator');
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode64(nonce)},await aesKey(env),decode64(cipher));
  return new TextDecoder().decode(bytes);
}
async function totpStep(secret,step){
  const key=await crypto.subtle.importKey('raw',fromBase32(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);
  const counter=new Uint8Array(8);new DataView(counter.buffer).setUint32(4,step);
  const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,counter));
  const offset=digest[19]&15;
  const n=((digest[offset]&127)<<24)|(digest[offset+1]<<16)|(digest[offset+2]<<8)|digest[offset+3];
  return String(n%1000000).padStart(6,'0');
}
async function verifiedStep(secret,code){
  if(!/^\d{6}$/.test(code))return null;
  const current=Math.floor(now()/30000);
  for(const step of [current-1,current,current+1]){
    const expected=await totpStep(secret,step);
    let diff=0;for(let i=0;i<6;i++)diff|=expected.charCodeAt(i)^code.charCodeAt(i);
    if(diff===0)return step;
  }
  return null;
}
async function rateLogin(env,purpose,username,request){
  // Keep enrolment, confirmation and ordinary login attempts in distinct buckets.
  // A prior setup-key typo must not lock out the first authenticator confirmation.
  const suffix=await hash(purpose+':'+username.toLowerCase());
  const attempts=await env.SESSIONS.get(env.SESSIONS.idFromName('auth-rate-v2:'+suffix)).fetch('https://room.internal/rate',{method:'POST'});
  if(attempts.status===429)return false;
  const addr=request.headers.get('cf-connecting-ip')||'unknown';
  const ip=await env.SESSIONS.get(env.SESSIONS.idFromName('auth-ip-v2:'+await hash(purpose+':'+addr))).fetch('https://room.internal/rate',{method:'POST'});
  return ip.status!==429;
}
async function claimStep(env,userId,step){
  const response=await env.SESSIONS.get(env.SESSIONS.idFromName('totp:'+userId)).fetch(
    'https://room.internal/claim-step',{method:'POST',body:JSON.stringify({step})});
  return response.ok;
}
function usernameOk(value){return /^[a-z][a-z0-9._-]{2,49}$/.test(value)}
async function setupAllowed(env,key){
  const configured=String(env.MTWSTUDIO_SETUP_KEY||'');
  if(configured.length<32||key.length!==configured.length)return false;
  const a=await hash(configured),b=await hash(key);
  let different=0;for(let i=0;i<a.length;i++)different|=a.charCodeAt(i)^b.charCodeAt(i);
  return different===0;
}
async function account(request,env){
  const value=tokenCookie(request);
  if(!value||!/^[a-f0-9]{64}$/.test(value))return null;
  const session=await getDoc(env,'mtwstudio_sessions',await hash(value));
  if(!session||session.expiresAt<now())return null;
  const user=await getDoc(env,'mtwstudio_managers',session.userId);
  return user?.enabled===true&&user?.totpEncrypted?{id:session.userId,name:user.name,role:'manager'}:null;
}
async function agent(req,env){
  const match=(req.headers.get('authorization')||'').match(/^Bearer ((?:[a-f0-9]{64})|(?:[A-Z2-7]{20}))$/);
  if(!match)return null;
  const id=await hash(match[1]);
  const host=await getDoc(env,'mtwstudio_hosts',id);
  return host?.enabled?{id,label:host.label,mode:host.mode||'code',codeHash:host.codeHash||null}:null;
}
const room=(env,id)=>env.SESSIONS.get(env.SESSIONS.idFromName('host:'+id));
const proxyRoom=(env,id,path,init={})=>room(env,id).fetch(new Request('https://room.internal'+path,init));
const DASHBOARD_ORIGIN='https://mtw-lookup-2026.webflow.io';
const securityHeaders=env=>({'Content-Security-Policy':"default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors "+DASHBOARD_ORIGIN+"; form-action 'self'; connect-src 'self' wss:; img-src 'self' data:; media-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline';",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Strict-Transport-Security':'max-age=31536000; includeSubDomains'});
const dashboardEmbed=req=>{
  // A direct top-level navigation is denied; the browser enforces the
  // authorised parent origin using CSP frame-ancestors on the HTML response.
  // Do not rely on Referer, which privacy settings can suppress.
  return req.headers.get('sec-fetch-dest')==='iframe';
};
function restricted(response,env){
  const headers=new Headers(response.headers);for(const[k,v]of Object.entries(securityHeaders(env)))headers.set(k,v);
  headers.set('cache-control','no-store');return new Response(response.body,{status:response.status,headers});
}
async function handler(request,env){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(!path.startsWith('/api/')){
    // Native hosts load /host.html in a trusted WebView2; do not block that page.
    // Manager console is embedded only on the MTW Webflow dashboard.
    if((path==='/'||path==='/index.html')&&!dashboardEmbed(request))
      return new Response('Open MTWStudio through the MTW dashboard.',{
        status:403,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','X-Content-Type-Options':'nosniff'}
      });
    return restricted(await env.ASSETS.fetch(request),env);
  }
  if(method!=='GET'&&!originOk(request)&&!path.startsWith('/api/agent/'))return fail(403,'Invalid origin');
  if(path==='/api/auth/setup-status'&&method==='GET'){
    const state=await getDoc(env,'mtwstudio_config','bootstrap');
    return json({needsSetup:state?.completed!==true});
  }
  if(path==='/api/auth/setup'&&method==='POST'){
    const body=await readJson(request),key=String(body.setupKey||''),username=String(body.username||'').toLowerCase().trim();
    if(!await rateLogin(env,'setup-key','bootstrap',request))return fail(429,'Too many attempts');
    if(String(env.MTWSTUDIO_SETUP_KEY||'').length<32)return fail(503,'Cloudflare MTWSTUDIO_SETUP_KEY is missing or shorter than 32 characters. Set a 32+ character Production secret and redeploy.');
    if(!await setupAllowed(env,key))return fail(403,'Setup key does not match the Production Cloudflare secret. Check for spaces, line breaks or an older deployment.');
    if((await getDoc(env,'mtwstudio_config','bootstrap'))?.completed===true)return fail(409,'Setup already completed');
    if(!usernameOk(username))return fail(400,'Username must be 3–50 letters, numbers, dots, hyphens or underscores');
    if(await getDoc(env,'mtwstudio_managers',username))return fail(409,'Manager already registered');
    const name=String(body.name||'').trim();
    if(name.length<2||name.length>80)return fail(400,'Invalid display name');
    const secret=base32(crypto.getRandomValues(new Uint8Array(20)));
    await putDoc(env,'mtwstudio_enrollment','bootstrap',{username,name,secretEncrypted:await seal(env,secret),expiresAt:now()+600000});
    const issuer='MTWStudio';
    const label=issuer+':'+username;
    const uri='otpauth://totp/'+encodeURIComponent(label)+'?'+new URLSearchParams({secret,issuer,algorithm:'SHA1',digits:'6',period:'30'});
    return json({username,secret,uri,expiresAt:now()+600000});
  }
  if(path==='/api/auth/setup/confirm'&&method==='POST'){
    const body=await readJson(request),key=String(body.setupKey||''),code=String(body.code||'').trim();
    if(!await rateLogin(env,'setup-confirm','bootstrap',request))return fail(429,'Too many attempts');
    if(String(env.MTWSTUDIO_SETUP_KEY||'').length<32)return fail(503,'Cloudflare MTWSTUDIO_SETUP_KEY is missing or shorter than 32 characters. Set a 32+ character Production secret and redeploy.');
    if(!await setupAllowed(env,key))return fail(403,'Setup key does not match the Production Cloudflare secret. Check for spaces, line breaks or an older deployment.');
    if((await getDoc(env,'mtwstudio_config','bootstrap'))?.completed===true)return fail(409,'Setup already completed');
    const pending=await getDoc(env,'mtwstudio_enrollment','bootstrap');
    if(!pending||pending.expiresAt<now())return fail(410,'Setup has expired');
    const match=await verifiedStep(await unseal(env,pending.secretEncrypted),code);
    if(match===null||!await claimStep(env,pending.username,match))return fail(401,'Invalid authenticator code');
    await putDoc(env,'mtwstudio_managers',pending.username,{name:pending.name,enabled:true,totpEncrypted:pending.secretEncrypted,createdAt:now()});
    await putDoc(env,'mtwstudio_config','bootstrap',{completed:true,completedAt:now()});
    await patchDoc(env,'mtwstudio_enrollment','bootstrap',{secretEncrypted:null,expiresAt:0});
    return json({ok:true});
  }
  if(path==='/api/auth/login'&&method==='POST'){
    const body=await readJson(request),username=String(body.username||'').trim().toLowerCase(),code=String(body.code||'').trim();
    if(!usernameOk(username)||!/^\d{6}$/.test(code))return fail(401,'Invalid authenticator code');
    if(!await rateLogin(env,'manager-login',username,request))return fail(429,'Too many attempts; try again later');
    const manager=await getDoc(env,'mtwstudio_managers',username);
    if(!manager?.enabled||!manager.totpEncrypted)return fail(401,'Invalid authenticator code');
    const match=await verifiedStep(await unseal(env,manager.totpEncrypted),code);
    if(match===null||!await claimStep(env,username,match))return fail(401,'Invalid authenticator code');
    const token=random(),expiresAt=now()+SESSION_MS;
    await putDoc(env,'mtwstudio_sessions',await hash(token),{userId:username,expiresAt,createdAt:now()});
    return json({user:{id:username,name:manager.name,role:'manager'}},200,{'set-cookie':cookie(token,SESSION_MS/1000)});
  }
  if(path==='/api/agent/mode'&&method==='POST'){
    const host=await agent(request,env);if(!host)return fail(401,'Invalid host credentials');
    const mode=String((await readJson(request)).mode||'');
    if(!['code','paired'].includes(mode))return fail(400,'Invalid mode');
    await patchDoc(env,'mtwstudio_hosts',host.id,{mode});
    return json({mode});
  }
  if(path==='/api/agent/code'&&method==='POST'){
    const host=await agent(request,env);if(!host)return fail(401,'Invalid host credentials');
    const code=random(8).toUpperCase(),codeHash=await hash(code);
    await patchDoc(env,'mtwstudio_hosts',host.id,{codeHash,codeExpires:now()+CODE_MS});
    await putDoc(env,'mtwstudio_codes',codeHash,{hostId:host.id,expires:now()+CODE_MS});
    return json({code,expiresAt:now()+CODE_MS});
  }
  if(path==='/api/agent/heartbeat'&&method==='POST'){
    const host=await agent(request,env);if(!host)return fail(401,'Invalid host credentials');
    const code=String((await readJson(request)).code||'').replace(/\s/g,'').toUpperCase(),codeHash=await hash(code);
    if(host.codeHash!==codeHash)return fail(404,'Code expired or replaced');
    await patchDoc(env,'mtwstudio_hosts',host.id,{codeExpires:now()+CODE_MS});
    return json({ok:true});
  }
  if(path==='/api/agent/status'&&method==='GET'){
    const host=await agent(request,env);if(!host)return fail(401,'Invalid host credentials');
    return json({id:host.id,label:host.label,mode:host.mode});
  }
  if(path==='/api/agent/ws'&&method==='GET'){
    const host=await agent(request,env);if(!host)return fail(401,'Invalid host credentials');
    if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return fail(400,'WebSocket required');
    const code=String(url.searchParams.get('code')||'').replace(/\s/g,'').toUpperCase();
    if(host.codeHash!==await hash(code))return fail(403,'Invalid host code');
    return proxyRoom(env,host.id,'/ws?role=agent',{headers:{upgrade:'websocket','x-internal-host':host.id}});
  }
  const user=await account(request,env);
  if(!user)return fail(401,'Manager sign-in required');
  if(path==='/api/auth/me'&&method==='GET')return json({user});
  if(path==='/api/auth/logout'&&method==='POST'){
    const token=tokenCookie(request);
    if(token&&/^[a-f0-9]{64}$/.test(token))
      await patchDoc(env,'mtwstudio_sessions',await hash(token),{expiresAt:0});
    return json({ok:true},200,{'set-cookie':cookie('',0)});
  }
  if(path==='/api/admin/hosts'&&method==='POST'){
    const body=await readJson(request),label=String(body.label||'').trim();
    if(label.length<2||label.length>100)return fail(400,'Computer name must be 2–100 characters');
    const accessKey=base32(crypto.getRandomValues(new Uint8Array(13))).slice(0,20),id=await hash(accessKey);
    await putDoc(env,'mtwstudio_hosts',id,{label,enabled:true,mode:'code',createdAt:now(),createdBy:user.id,codeHash:null,codeExpires:0});
    return json({label,accessKey},201);
  }
  const removeHost=path.match(/^\/api\/admin\/hosts\/([a-f0-9]{64})$/);
  if(removeHost&&method==='DELETE'){
    const id=removeHost[1],host=await getDoc(env,'mtwstudio_hosts',id);
    if(!host||host.createdBy!==user.id)return fail(404,'Computer not found');
    if(!host.enabled)return json({ok:true});
    await patchDoc(env,'mtwstudio_hosts',id,{enabled:false,disabledAt:now(),disabledBy:user.id});
    try{await proxyRoom(env,id,'/revoke',{method:'POST'})}catch(error){console.error('Revoke host room failed',error?.message)}
    return json({ok:true});
  }
  async function lookupCode(code){
    if(!/^[A-F0-9]{16}$/.test(code))return null;
    const entry=await getDoc(env,'mtwstudio_codes',await hash(code));
    if(!entry||entry.expires<now())return null;
    const host=await getDoc(env,'mtwstudio_hosts',entry.hostId);
    if(!host?.enabled||host.codeHash!==await hash(code)||host.codeExpires<now())return null;
    return {id:entry.hostId,label:host.label,mode:host.mode};
  }
  if(path==='/api/hosts/pair'&&method==='POST'){
    const rate=await env.SESSIONS.get(env.SESSIONS.idFromName('pair:'+user.id)).fetch('https://room.internal/rate-code',{method:'POST'});
    if(rate.status===429)return fail(429,'Too many pairing attempts');
    const code=String((await readJson(request)).code||'').replace(/\s/g,'').toUpperCase(),host=await lookupCode(code);
    if(!host||host.mode!=='paired')return fail(404,'Computer not available for pairing');
    if(!(await proxyRoom(env,host.id,'/presence')).ok)return fail(409,'Host offline');
    await putDoc(env,'mtwstudio_pairs',await hash(user.id+':'+host.id),{userId:user.id,hostId:host.id,createdAt:now()});
    return json({host:{id:host.id,label:host.label}});
  }
  if(path==='/api/hosts'&&method==='GET'){
    // Show computers registered by this manager, even in connection-code mode.
    // Pairings from other managers are visible only when explicitly paired.
    const registered=await queryDocs(env,'mtwstudio_hosts','createdBy',user.id);
    const pairs=await queryDocs(env,'mtwstudio_pairs','userId',user.id);
    const ids=new Set(registered.map(x=>x.id));
    for(const pair of pairs)ids.add(pair.hostId);
    const hosts=await Promise.all(Array.from(ids).slice(0,100).map(async id=>{
      const host=await getDoc(env,'mtwstudio_hosts',id);
      if(!host?.enabled)return null;
      const owned=host.createdBy===user.id,paired=pairs.some(p=>p.hostId===id);
      if(!owned&&(!paired||host.mode!=='paired'))return null;
      let online=false;
      try{online=(await proxyRoom(env,id,'/presence')).ok}catch{}
      return {id,label:host.label,mode:host.mode,online,owned};
    }));
    return json({hosts:hosts.filter(Boolean)});
  }
  if(path==='/api/history'&&method==='GET'){
    const entries=await queryDocs(env,'mtwstudio_connections','controllerId',user.id);
    const connections=entries.sort((a,b)=>b.createdAt-a.createdAt).slice(0,25).map(c=>({id:c.id,status:c.status,created_at:c.createdAt,ended_at:c.endedAt||null,host:c.hostLabel}));
    return json({connections});
  }
  if(path==='/api/connections'&&method==='POST'){
    const rate=await env.SESSIONS.get(env.SESSIONS.idFromName('attempts:'+user.id)).fetch('https://room.internal/rate-code',{method:'POST'});
    if(rate.status===429)return fail(429,'Too many attempts');
    const body=await readJson(request);
    let host;
    if(body.hostId){
      const hostId=String(body.hostId);
      if(!/^[a-f0-9]{64}$/.test(hostId))return fail(400,'Invalid computer');
      const paired=await getDoc(env,'mtwstudio_pairs',await hash(user.id+':'+hostId));
      const value=await getDoc(env,'mtwstudio_hosts',hostId);
      // Registration grants this manager access to request a session in either mode.
      // Other managers require an explicit pairing and paired mode.
      if(!value?.enabled||(value.createdBy!==user.id&&(!paired||value.mode!=='paired')))
        return fail(404,'Computer unavailable');
      host={id:hostId,label:value.label};
    }else{
      const code=String(body.code||'').replace(/\s/g,'').toUpperCase();
      host=await lookupCode(code);
      if(!host)return fail(404,'Code unavailable or expired');
    }
    if(!(await proxyRoom(env,host.id,'/presence')).ok)return fail(409,'Computer offline');
    const id=crypto.randomUUID(),expires=now()+CONNECT_MS;
    await putDoc(env,'mtwstudio_connections',id,{id,hostId:host.id,hostLabel:host.label,controllerId:user.id,status:'pending',createdAt:now(),expiresAt:expires,endedAt:null});
    const requestResult=await proxyRoom(env,host.id,'/request',{method:'POST',body:JSON.stringify({id,hostId:host.id,controllerId:user.id,controllerName:user.name,expires})});
    if(!requestResult.ok){await patchDoc(env,'mtwstudio_connections',id,{status:'ended',endedAt:now()});return fail(409,'Computer busy or offline');}
    return json({id,host:host.label,status:'pending',expiresAt:expires},201);
  }
  const match=path.match(/^\/api\/connections\/([0-9a-f-]{36})(\/ws|\/disconnect)?$/);
  if(match){
    const session=await getDoc(env,'mtwstudio_connections',match[1]);
    if(!session||session.controllerId!==user.id)return fail(404,'Session not found');
    if(session.expiresAt<now())return fail(410,'Session expired');
    if(match[2]==='/ws'&&method==='GET'){
      if(!originOk(request))return fail(403,'Invalid WebSocket origin');
      if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return fail(400,'WebSocket required');
      return proxyRoom(env,session.hostId,'/ws?role=controller&session='+session.id,{headers:{upgrade:'websocket','x-internal-user':user.id}});
    }
    if(match[2]==='/disconnect'&&method==='POST'){
      await proxyRoom(env,session.hostId,'/end',{method:'POST'});
      await patchDoc(env,'mtwstudio_connections',session.id,{status:'ended',endedAt:now()});
      return json({ok:true});
    }
    if(!match[2]&&method==='GET')return json({id:session.id,status:session.status,expiresAt:session.expiresAt});
  }
  return fail(404,'Not found');
}
export default {async fetch(request,env){try{return await handler(request,env)}catch(error){console.error('MTWStudio request failed',error?.message);return fail(500,'Request failed')}}};

export class ConnectionRoom {
  constructor(state,env){this.state=state;this.env=env;}
  sockets(role){return this.state.getWebSockets().filter(s=>s.deserializeAttachment()?.role===role);}
  emit(role,value){for(const socket of this.sockets(role)){try{socket.send(JSON.stringify(value))}catch{}}}
  async rate(path){
    const currentTime=now(),key=path==='/rate'?'login-rate':'code-rate';
    const state=await this.state.storage.get(key)||{count:0,until:currentTime+600000};
    if(currentTime>state.until){state.count=0;state.until=currentTime+600000;}
    state.count++;
    await this.state.storage.put(key,state);
    return state.count>(path==='/rate'?8:15)?new Response('',{status:429}):new Response('',{status:204});
  }
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==='/rate'||url.pathname==='/rate-code')return this.rate(url.pathname);
    if(url.pathname==='/claim-step'&&request.method==='POST'){
      const {step}=await request.json();
      if(!Number.isSafeInteger(step)||step<0||Math.abs(step-Math.floor(now()/30000))>1)return fail(400,'Invalid step');
      const last=await this.state.storage.get('lastStep')||0;
      if(step<=last)return fail(409,'Code already used');
      await this.state.storage.put('lastStep',step);
      return json({ok:true});
    }
    if(url.pathname==='/presence'&&request.method==='GET')return this.sockets('agent').length?json({online:true}):fail(404,'Offline');
    if(url.pathname==='/request'&&request.method==='POST'){
      if(!this.sockets('agent').length)return fail(409,'Host offline');
      const body=await request.json();
      const existing=await this.state.storage.get('connection');
      if(existing&&existing.status!=='ended'&&existing.status!=='rejected'&&existing.expires>now())return fail(409,'Already paired');
      await this.state.storage.put('connection',{...body,status:'pending'});
      this.emit('agent',{type:'request',sessionId:body.id,controllerName:body.controllerName,expiresAt:body.expires});
      return json({ok:true});
    }
    if(url.pathname==='/revoke'&&request.method==='POST'){
      await this.end('Computer registration removed');
      for(const socket of this.sockets('agent'))try{socket.close(1000,'Computer registration removed')}catch{}
      return json({ok:true});
    }
    if(url.pathname==='/end'&&request.method==='POST'){await this.end('disconnected');return json({ok:true})}
    if(url.pathname==='/ws'){
      if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return fail(400,'Upgrade required');
      const role=url.searchParams.get('role');
      const session=await this.state.storage.get('connection');
      if(role==='agent'&&!request.headers.get('x-internal-host'))return fail(403,'Host auth required');
      if(role==='controller'&&(!session||session.id!==url.searchParams.get('session')||session.controllerId!==request.headers.get('x-internal-user')||session.expires<now()))return fail(403,'Controller auth required');
      if(!['agent','controller'].includes(role))return fail(403,'Invalid role');
      for(const socket of this.sockets(role)){try{socket.close(1000,'Replaced connection')}catch{}}
      const pair=new WebSocketPair(),client=pair[0],server=pair[1];
      this.state.acceptWebSocket(server);
      server.serializeAttachment({role});
      if(role==='controller'){
        server.send(JSON.stringify({type:'status',status:session.status,expiresAt:session.expires}));
        if(session.status==='approved')this.emit('agent',{type:'controller-ready'});
      }
      if(role==='agent'&&session&&session.status==='pending')server.send(JSON.stringify({type:'request',sessionId:session.id,controllerName:session.controllerName,expiresAt:session.expires}));
      return new Response(null,{status:101,webSocket:client});
    }
    return fail(404,'Unknown room route');
  }
  async end(reason){
    const session=await this.state.storage.get('connection');
    if(!session||session.status==='ended'||session.status==='rejected')return;
    session.status='ended';await this.state.storage.put('connection',session);
    await patchDoc(this.env,'mtwstudio_connections',session.id,{status:'ended',endedAt:now()});
    this.emit('agent',{type:'end',reason});this.emit('controller',{type:'end',reason});
    // Keep the agent connected and its displayed code valid for later approved sessions.
    // Only the controller WebSocket closes when a session ends.
    for(const socket of this.sockets('controller'))try{socket.close(1000,'Session ended')}catch{}
  }
  async webSocketMessage(ws,message){
    const role=ws.deserializeAttachment()?.role;
    let payload;
    try{if(typeof message!=='string'||message.length>32768)throw Error('Invalid message');payload=JSON.parse(message)}catch{return}
    let session=await this.state.storage.get('connection');
    if(!session||session.status==='ended')return;
    if(session.expires<now()){await this.end('expired');return}
    if(role==='agent'&&['approve','reject'].includes(payload.type)&&session.status==='pending'){
      session.status=payload.type==='approve'?'approved':'rejected';
      await this.state.storage.put('connection',session);
      await patchDoc(this.env,'mtwstudio_connections',session.id,{status:session.status});
      this.emit('controller',{type:'status',status:session.status});
      if(session.status==='approved' && this.sockets('controller').length)
        this.emit('agent',{type:'controller-ready'});
      if(session.status==='rejected')await this.end('rejected');
      return;
    }
    if(role==='controller'&&payload.type==='disconnect'){await this.end('controller disconnected');return}
    if(session.status!=='approved')return;
    if(role==='controller'&&payload.type==='controller-ready'){
      this.emit('agent',{type:'controller-ready'});
      return;
    }
    // Signalling only: SDP/ICE; never forward arbitrary user input over signalling.
    if(role==='agent'&&payload.type==='monitors'){
      const monitors=Array.isArray(payload.monitors)?payload.monitors.slice(0,16):[];
      const safe=monitors.filter(m=>Number.isSafeInteger(m.index)&&m.index>=0&&m.index<32&&
        Number.isSafeInteger(m.width)&&m.width>0&&m.width<20000&&
        Number.isSafeInteger(m.height)&&m.height>0&&m.height<20000).map(m=>({
          index:m.index,label:String(m.label||'Monitor').slice(0,80),width:m.width,height:m.height
        }));
      this.emit('controller',{type:'monitors',monitors:safe,selected:payload.selected});
      return;
    }
    if(role==='controller'&&payload.type==='select-monitor'){
      if(Number.isSafeInteger(payload.index)&&payload.index>=0&&payload.index<32)
        this.emit('agent',{type:'select-monitor',index:payload.index});
      return;
    }
    if(['offer','answer','ice'].includes(payload.type)){
      if(payload.type==='offer'&&role!=='agent')return;
      if(payload.type==='answer'&&role!=='controller')return;
      this.emit(role==='agent'?'controller':'agent',{type:payload.type,data:payload.data});
    }
  }
  async webSocketClose(ws){const role=ws.deserializeAttachment()?.role;
    if(role==='agent'){
      await this.end('host disconnected');
    }else if(role==='controller')await this.end('controller disconnected');
  }
  async webSocketError(ws){await this.webSocketClose(ws)}
}
