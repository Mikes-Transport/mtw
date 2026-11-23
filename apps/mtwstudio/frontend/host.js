// This page runs only inside the consent-driven MTWStudio Windows host WebView2.
// Network credentials stay in the native application; this page never sees them.
(() => {
  const bridge = window.chrome?.webview;
  const share = document.getElementById('share');
  const stop = document.getElementById('stop');
  const status = document.getElementById('status');
  const preview = document.getElementById('preview');
  let stream = null, peer = null, channel = null, approved = false;
  const send = value => bridge?.postMessage(value);
  function state(message) { status.textContent = message; }
  function end() {
    approved = false;
    if (channel) { channel.close(); channel = null; }
    if (peer) { peer.close(); peer = null; }
    if (stream) { for (const track of stream.getTracks()) track.stop(); stream = null; }
    preview.srcObject = null; share.disabled = false; stop.disabled = true;
    state('Not sharing');
  }
  async function begin() {
    if (!bridge) { state('Open inside MTWStudio Host.'); return; }
    try {
      // This must be initiated by the host clicking the button (browser user gesture).
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      preview.srcObject = stream;
      stream.getVideoTracks()[0].addEventListener('ended', () => { end(); send({ type: 'capture-ended' }); }, { once: true });
      share.disabled = true; stop.disabled = false;
      state('Screen selected. Waiting for an approved connection.');
      send({ type: 'capture-ready' });
    } catch (e) { state('Screen not selected: ' + e.message); }
  }
  async function call() {
    if (!approved || !stream) return;
    if (peer) peer.close();
    peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] });
    stream.getTracks().forEach(track => peer.addTrack(track, stream));
    channel = peer.createDataChannel('input', { ordered: true });
    channel.onmessage = event => {
      if (!approved || !stream || typeof event.data !== 'string' || event.data.length > 2048) return;
      try {
        const input = JSON.parse(event.data);
        if (input && typeof input.type === 'string') send({ type: 'input', data: input });
      } catch {}
    };
    channel.onclose = () => state('Remote input disconnected');
    peer.onicecandidate = event => {
      if (event.candidate) send({ type: 'ice', data: event.candidate.toJSON() });
    };
    peer.onconnectionstatechange = () => {
      state('Remote connection: ' + peer.connectionState);
      if (peer.connectionState === 'failed') send({ type: 'peer-failed' });
    };
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    send({ type: 'offer', data: peer.localDescription.toJSON() });
  }
  share.onclick = begin;
  stop.onclick = () => { end(); send({ type: 'capture-ended' }); };
  bridge?.addEventListener('message', async event => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    try {
      if (message.type === 'approved') { approved = true; await call(); }
      if (message.type === 'answer' && approved && peer)
        await peer.setRemoteDescription(new RTCSessionDescription(message.data));
      if (message.type === 'ice' && approved && peer && message.data)
        await peer.addIceCandidate(new RTCIceCandidate(message.data));
      if (message.type === 'stop') { approved = false; if (peer) peer.close(); peer = null; }
    } catch (err) { state('Connection error: ' + err.message); send({ type: 'peer-failed' }); }
  });
  send({ type: 'host-web-ready' });
})();
