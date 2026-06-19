const urlParams = new URLSearchParams(window.location.search);
let cameraName = urlParams.get('name');
if (cameraName === 'null' || cameraName === '') cameraName = null;
if (!cameraName) {
  // generate friendly default name
  cameraName = 'Camera-' + Math.random().toString(36).slice(2, 7);
}
const socket = io({ query: { role: 'camera', name: cameraName } });
const config = { iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }] };

const preview = document.getElementById('cameraPreview');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnSwitch = document.getElementById('btnSwitch');
const statusText = document.getElementById('statusText');
const connectionStatus = document.getElementById('connectionStatus');
const localIpLabel = document.getElementById('localIp');
const streamModeLabel = document.getElementById('streamMode');
const videoInfo = document.getElementById('video-info');
const chatHistory = document.getElementById('chatHistory');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const photoInput = document.getElementById('photoInput');

let localStream = null;
let facingMode = 'environment';
let isStreaming = false;

const pcs = {}; // viewerId -> RTCPeerConnection

btnStart.addEventListener('click', startStreaming);
btnStop.addEventListener('click', stopStreaming);
btnSwitch.addEventListener('click', switchCamera);

socket.on('connect', () => {
  updateStatus('Connected to signaling server', 'online');
});

socket.on('disconnect', () => {
  updateStatus('Disconnected from signaling server', 'offline');
  stopStreaming();
});

socket.on('offer', async (message) => {
  // viewer created an offer for us to answer
  const from = message.from;
  if (!from) return;
  if (!localStream) {
    updateStatus('No local stream - start streaming first', 'danger');
    return;
  }

  console.log('[camera] received offer from', from);
  const pc = new RTCPeerConnection(config);
  pcs[from] = pc;

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      console.log('[camera] sending candidate to viewer', from, candidate);
      socket.emit('candidate', { to: from, candidate });
    }
  };

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === 'connected') {
      updateStatus('Connected to viewer', 'online');
    }
    if (state === 'failed' || state === 'disconnected') {
      updateStatus('Viewer disconnected', 'offline');
      closeConnection(from);
    }
  };

  // add local tracks
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

  try {
    await pc.setRemoteDescription(message.sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    console.log('[camera] sending answer to', from, answer);
    socket.emit('answer', { to: from, sdp: pc.localDescription });
    streamModeLabel.textContent = 'Streaming';
  } catch (err) {
    console.error('Failed to handle offer from viewer', err);
  }
});

socket.on('candidate', async (message) => {
  const from = message.from;
  const candidate = message.candidate;
  const pc = pcs[from];
  if (pc && candidate) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (err) {
      console.warn('Error adding ICE candidate', err);
    }
  }
});

socket.on('signaling-error', (message) => {
  updateStatus(message.message, 'danger');
});

async function getLocalStream() {
  const constraints = {
    audio: false,
    video: {
      facingMode,
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    preview.srcObject = stream;
    localStream = stream;
    videoInfo.textContent = facingMode === 'environment' ? 'Back camera' : 'Front camera';
    return stream;
  } catch (error) {
    updateStatus('Camera access denied or unavailable.', 'danger');
    console.error(error);
    throw error;
  }
}

function closeConnection(viewerId) {
  const pc = pcs[viewerId];
  if (pc) {
    try { pc.close(); } catch (e) {}
    delete pcs[viewerId];
  }
}

async function startStreaming() {
  btnStart.disabled = true;
  try {
    await getLocalStream();
    isStreaming = true;
    btnStop.disabled = false;
    streamModeLabel.textContent = 'Ready';
    updateStatus('Local stream ready. Waiting for viewers...', 'waiting');
    fetchLocalIp();
  } catch (error) {
    btnStart.disabled = false;
    streamModeLabel.textContent = 'Stopped';
    console.error(error);
  }
}

async function stopStreaming() {
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
  // close all peer connections
  Object.keys(pcs).forEach(closeConnection);

  isStreaming = false;
  btnStart.disabled = false;
  btnStop.disabled = true;
  streamModeLabel.textContent = 'Stopped';
  updateStatus('Streaming stopped', 'offline');
}

async function switchCamera() {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  updateStatus(`Switching to ${facingMode} camera`, 'waiting');
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }
  try {
    await getLocalStream();
  } catch (error) {
    console.warn(error);
  }
}

function updateStatus(text, status) {
  statusText.textContent = text;
  connectionStatus.className = `status-badge status-${status}`;
}

function scrollChatToBottom() {
  if (!chatHistory) return;
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function renderChatMessage(message) {
  if (!chatHistory) return;
  const item = document.createElement('div');
  item.className = 'chat-message';

  const header = document.createElement('div');
  header.className = 'chat-message-header';

  const author = document.createElement('span');
  author.className = 'chat-message-author';
  author.textContent = message.senderName;

  const timestamp = document.createElement('span');
  timestamp.className = 'chat-message-time';
  timestamp.textContent = new Date(message.timestamp).toLocaleTimeString();

  header.appendChild(author);
  header.appendChild(timestamp);

  const body = document.createElement('div');
  body.className = 'chat-message-body';

  if (message.type === 'text') {
    body.textContent = message.text;
  } else if (message.type === 'image') {
    const image = document.createElement('img');
    image.src = message.dataUrl;
    image.alt = message.filename || 'Shared photo';
    body.appendChild(image);
  }

  item.appendChild(header);
  item.appendChild(body);
  chatHistory.appendChild(item);
  scrollChatToBottom();
}

function renderChatHistory(messages) {
  if (!chatHistory) return;
  chatHistory.innerHTML = '';
  messages.forEach(renderChatMessage);
}

function handleSendChat() {
  if (!chatInput) return;
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('chat-message', { text });
  chatInput.value = '';
}

function handlePhotoUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file.');
    photoInput.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('Image is too large. Please choose a file smaller than 5MB.');
    photoInput.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    socket.emit('chat-photo', { dataUrl: reader.result, filename: file.name });
    photoInput.value = '';
  };
  reader.readAsDataURL(file);
}

sendChatBtn.addEventListener('click', handleSendChat);
chatInput.addEventListener('keyup', (event) => {
  if (event.key === 'Enter') handleSendChat();
});
photoInput.addEventListener('change', handlePhotoUpload);

socket.on('chat-history', renderChatHistory);
socket.on('chat-message', renderChatMessage);

async function fetchLocalIp() {
  try {
    const response = await fetch('/api/info');
    const data = await response.json();
    localIpLabel.textContent = `${data.ip}:3000`;
  } catch (error) {
    localIpLabel.textContent = 'Unable to detect local IP';
  }
}

fetchLocalIp();
