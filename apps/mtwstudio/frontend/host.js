// MTWStudio captures monitors in the native Windows host after explicit approval.
// WebView2 handles only authenticated WebRTC transport and native input forwarding.
(() => {
  const bridge = window.chrome?.webview;
  const status = document.getElementById('status');
  let peer = null, inputChannel = null, framesChannel = null, approved = false;
  let pendingIce = [], pendingFrame = null, frameId = 0, viewerReady = false;
  const post = value => bridge?.postMessage(value);
  const setStatus = message => { if (status) status.textContent = message; };
  function closePeer() {
    approved = false;
    viewerReady = false;
    pendingFrame = null;
    if (inputChannel) try { inputChannel.close(); } catch {}
    if (framesChannel) try { framesChannel.close(); } catch {}
    if (peer) try { peer.close(); } catch {}
    peer = null; inputChannel = null; framesChannel = null;
    setStatus('Waiting for host approval');
  }
  function flushFrame() {
    if (!framesChannel || framesChannel.readyState !== 'open' || !pendingFrame) return;
    if (framesChannel.bufferedAmount > 300000) return;
    const frame = pendingFrame;
    pendingFrame = null;
    const length = 12000;
    const chunks = Math.ceil(frame.image.length / length);
    if (chunks > 100) return;
    const id = ++frameId;
    for (let i=0;i<chunks;i++) {
      framesChannel.send(JSON.stringify({
        type:'frame', id, index:i, total:chunks, monitor:frame.monitor,
        width:frame.width, height:frame.height,
        image:frame.image.slice(i*length,(i+1)*length)
      }));
    }
  }
  async function call() {
    if (!approved || !viewerReady) return;
    viewerReady = false;
    if (peer) peer.close();
    pendingIce = [];
    peer = new RTCPeerConnection({ iceServers:[{urls:'stun:stun.cloudflare.com:3478'}] });
    inputChannel = peer.createDataChannel('input',{ordered:true});
    inputChannel.onmessage = event => {
      if (!approved || typeof event.data !== 'string' || event.data.length > 2048) return;
      try {
        const input = JSON.parse(event.data);
        if (input && typeof input.type === 'string') post({type:'input',data:input});
      } catch {}
    };
    framesChannel = peer.createDataChannel('frames',{ordered:true});
    framesChannel.bufferedAmountLowThreshold = 120000;
    framesChannel.onbufferedamountlow = flushFrame;
    framesChannel.onopen = () => setStatus('Sharing approved monitor');
    framesChannel.onclose = () => setStatus('Remote video disconnected');
    peer.onicecandidate = event => {
      if (event.candidate) post({type:'ice',data:event.candidate.toJSON()});
    };
    peer.onconnectionstatechange = () => {
      setStatus('Remote connection: '+peer.connectionState);
      if (peer.connectionState==='failed') post({type:'peer-failed'});
    };
    const offer=await peer.createOffer();
    await peer.setLocalDescription(offer);
    post({type:'offer',data:peer.localDescription.toJSON()});
  }
  bridge?.addEventListener('message', async event => {
    const message=event.data;
    if (!message || typeof message!=='object') return;
    try {
      if (message.type==='approved') { approved=true; setStatus('Approved · waiting for viewer…'); if(viewerReady)await call(); }
      else if(message.type==='viewer-ready' && approved && (!peer || peer.signalingState==='closed')) {
        viewerReady=true;
        await call();
      }
      else if (message.type==='frame' && approved && typeof message.image==='string') {
        pendingFrame=message;
        flushFrame();
      }
      else if (message.type==='answer' && approved && peer) {
        await peer.setRemoteDescription(new RTCSessionDescription(message.data));
        for (const candidate of pendingIce.splice(0)) await peer.addIceCandidate(new RTCIceCandidate(candidate));
      }
      else if (message.type==='ice' && approved && message.data) {
        if (peer && peer.remoteDescription) await peer.addIceCandidate(new RTCIceCandidate(message.data));
        else pendingIce.push(message.data);
      }
      else if (message.type==='stop') closePeer();
    } catch (error) {
      setStatus('Connection error: '+error.message);
      post({type:'peer-failed'});
    }
  });
  setStatus('Monitors are detected automatically. Capture begins only after approval.');
  post({type:'host-web-ready'});
})();