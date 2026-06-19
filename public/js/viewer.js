const socket = io({ query: { role: 'viewer' }, transports: ['websocket'] });
const config = { iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }] };

const streamsGrid = document.getElementById('streamsGrid');
const btnFullscreen = document.getElementById('btnFullscreen');
const statusText = document.getElementById('statusText');
const connectionStatus = document.getElementById('connectionStatus');
const viewerInfo = document.getElementById('viewer-info');
const cameraList = document.getElementById('cameraList');

const pcs = {}; // cameraId -> { pc, video, container }

btnFullscreen.addEventListener('click', () => {
  const first = streamsGrid.querySelector('video');
  if (first && first.requestFullscreen) first.requestFullscreen();
});

socket.on('connect', () => {
  updateStatus('Connected to signaling server', 'online');
  socket.emit('get-cameras');
});

socket.on('disconnect', () => {
  updateStatus('Disconnected from signaling server', 'offline');
});

socket.on('cameras', (list) => {
  renderCameraList(list);
  viewerInfo.textContent = list.length ? 'Choose a camera to view' : 'No cameras available';
});

socket.on('answer', async (message) => {
  const from = message.from;
  const entry = pcs[from];
  if (!entry) return;
  try {
    await entry.pc.setRemoteDescription(message.sdp);
    updateStatus('Stream connected', 'online');
  } catch (err) {
    console.warn('Failed to set remote description for answer', err);
  }
});

socket.on('candidate', async (message) => {
  const from = message.from;
  const entry = pcs[from];
  if (entry && message.candidate) {
    try {
      await entry.pc.addIceCandidate(message.candidate);
    } catch (err) {
      console.warn('Error adding ICE candidate', err);
    }
  }
});

socket.on('camera-disconnected', ({ id }) => {
  removeStream(id);
});

socket.on('signaling-error', (message) => {
  updateStatus(message.message, 'danger');
});

function renderCameraList(list) {
  cameraList.innerHTML = '';
  if (!list || list.length === 0) {
    cameraList.textContent = 'No cameras found.';
    return;
  }
  list.forEach((cam) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.marginBottom = '8px';

    const label = document.createElement('div');
    // sanitize name coming from server (avoid literal 'null')
    const dispName = (cam.name && cam.name !== 'null') ? cam.name : cam.id;
    label.textContent = dispName;
    const actions = document.createElement('div');
    const watchBtn = document.createElement('button');
    watchBtn.textContent = 'Watch';
    watchBtn.className = 'primary';
    watchBtn.addEventListener('click', () => startWatch(cam.id, cam.name));
    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Stop';
    stopBtn.className = 'danger';
    stopBtn.style.marginLeft = '8px';
    stopBtn.addEventListener('click', () => stopWatch(cam.id));
    actions.appendChild(watchBtn);
    actions.appendChild(stopBtn);

    row.appendChild(label);
    row.appendChild(actions);
    cameraList.appendChild(row);
  });
}

async function startWatch(cameraId, cameraName) {
  if (pcs[cameraId]) return; // already watching

  const container = document.createElement('div');
  container.className = 'camera-card';
  container.style.padding = '0';
  container.style.position = 'relative';
  container.style.minHeight = '160px';

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.controls = false;
  video.style.width = '100%';

  const meta = document.createElement('div');
  meta.className = 'camera-meta';
  const title = document.createElement('div');
  title.className = 'camera-title';
  title.textContent = (cameraName && cameraName !== 'null') ? cameraName : cameraId;
  const controls = document.createElement('div');
  controls.className = 'card-controls';

  const muteBtn = document.createElement('button');
  muteBtn.textContent = 'Mute';
  muteBtn.className = 'secondary';
  muteBtn.onclick = () => {
    video.muted = !video.muted;
    muteBtn.textContent = video.muted ? 'Unmute' : 'Mute';
  };

  const fsBtn = document.createElement('button');
  fsBtn.textContent = 'Full';
  fsBtn.className = 'primary';
  fsBtn.onclick = () => {
    if (container.requestFullscreen) container.requestFullscreen();
  };

  const stopBtn = document.createElement('button');
  stopBtn.textContent = 'Stop';
  stopBtn.className = 'danger';
  stopBtn.onclick = () => removeStream(cameraId);

  controls.appendChild(muteBtn);
  controls.appendChild(fsBtn);
  controls.appendChild(stopBtn);
  meta.appendChild(title);
  meta.appendChild(controls);

  const fpsBadge = document.createElement('div');
  fpsBadge.className = 'fps-badge';
  fpsBadge.textContent = '-- FPS';

  container.appendChild(video);
  container.appendChild(meta);
  container.appendChild(fpsBadge);
  streamsGrid.appendChild(container);

  const pc = new RTCPeerConnection(config);
  pcs[cameraId] = { pc, video, container, fpsBadge };

  console.log('[viewer] creating pc for', cameraId);

  // ensure we can receive video by creating a recvonly transceiver
  try {
    pc.addTransceiver('video', { direction: 'recvonly' });
  } catch (e) {
    console.warn('addTransceiver not supported', e);
  }

  pc.ontrack = (event) => {
    video.srcObject = event.streams[0];
    console.log('[viewer] received track for', cameraId, event.streams[0]);

    // FPS measurement using requestVideoFrameCallback when available
    const fpsBadgeEl = pcs[cameraId] && pcs[cameraId].fpsBadge ? pcs[cameraId].fpsBadge : fpsBadge;
    if (video.requestVideoFrameCallback) {
      let lastTime = performance.now();
      let frames = 0;
      const cb = (now) => {
        frames++;
        const delta = now - lastTime;
        if (delta >= 1000) {
          const fps = Math.round((frames * 1000) / delta);
          fpsBadgeEl.textContent = `${fps} FPS`;
          frames = 0;
          lastTime = now;
        }
        try { video.requestVideoFrameCallback(cb); } catch (e) {}
      };
      try { video.requestVideoFrameCallback(cb); } catch (e) {}
    } else if (video.getVideoPlaybackQuality) {
      // fallback: sample every second
      setInterval(() => {
        try {
          const q = video.getVideoPlaybackQuality();
          const dropped = q.droppedVideoFrames || 0;
          const total = q.totalVideoFrames || 0;
          fpsBadgeEl.textContent = `${total - dropped} frames`;
        } catch (e) {}
      }, 1000);
    }
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      console.log('[viewer] sending candidate to camera', cameraId, candidate);
      socket.emit('candidate', { to: cameraId, candidate });
    }
  };

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === 'connected') updateStatus('WebRTC connected', 'online');
    if (state === 'failed' || state === 'disconnected') removeStream(cameraId);
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log('[viewer] sending offer to camera', cameraId, offer);
    socket.emit('offer', { to: cameraId, sdp: pc.localDescription });
  } catch (err) {
    console.error('Failed to create offer', err);
    removeStream(cameraId);
  }
}

function stopWatch(cameraId) {
  removeStream(cameraId);
}

function removeStream(cameraId) {
  const entry = pcs[cameraId];
  if (!entry) return;
  try { entry.pc.close(); } catch (e) {}
  try { entry.container.remove(); } catch (e) {}
  delete pcs[cameraId];
}

function updateStatus(text, status) {
  statusText.textContent = text;
  connectionStatus.className = `status-badge status-${status}`;
}

window.addEventListener('beforeunload', () => {
  Object.keys(pcs).forEach(removeStream);
});
