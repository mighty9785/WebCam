let socket = null;
let myId = null;

const nameInput = document.getElementById('nameInput');
const joinBtn = document.getElementById('joinBtn');
const chatMessages = document.getElementById('chatMessages');
const chatText = document.getElementById('chatText');
const chatSend = document.getElementById('chatSend');
const chatFile = document.getElementById('chatFile');

function defaultName() {
  return 'User-' + Math.random().toString(36).slice(2,6);
}

function createSocket(name) {
  socket = io({ query: { role: 'viewer', name } });

  socket.on('connect', () => {
    myId = socket.id;
    console.log('chat connected', myId);
  });

  socket.on('chat-history', (messages) => {
    renderHistory(messages);
  });

  socket.on('chat-message', (message) => {
    renderMessage(message);
  });
}

function renderMessage(message) {
  if (!chatMessages) return;
  const row = document.createElement('div');
  row.className = 'msg-row ' + (message.senderId === myId ? 'me' : '');

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const author = document.createElement('span');
  author.textContent = message.senderName || 'Anonymous';
  const time = document.createElement('span');
  time.textContent = new Date(message.timestamp).toLocaleTimeString();
  meta.appendChild(author);
  meta.appendChild(time);

  const body = document.createElement('div');
  if (message.type === 'text') {
    body.textContent = message.text;
  } else if (message.type === 'image') {
    const img = document.createElement('img');
    img.className = 'msg-img';
    img.src = message.dataUrl;
    body.appendChild(img);
    if (message.text) {
      const t = document.createElement('div'); t.textContent = message.text; body.appendChild(t);
    }
  }

  bubble.appendChild(meta);
  bubble.appendChild(body);
  row.appendChild(bubble);
  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderHistory(messages) {
  if (!chatMessages) return;
  chatMessages.innerHTML = '';
  messages.forEach(renderMessage);
}

function sendText() {
  const text = chatText.value.trim();
  if (!text || !socket) return;
  socket.emit('chat-message', { text });
  chatText.value = '';
}

function sendFile(file) {
  if (!file || !socket) return;
  if (!file.type.startsWith('image/')) { alert('Only images allowed'); return; }
  if (file.size > 6*1024*1024) { alert('Choose image smaller than 6MB'); return; }
  const r = new FileReader();
  r.onload = () => {
    socket.emit('chat-photo', { dataUrl: r.result, filename: file.name });
  };
  r.readAsDataURL(file);
}

joinBtn.addEventListener('click', () => {
  const name = (nameInput.value && nameInput.value.trim()) ? nameInput.value.trim() : defaultName();
  createSocket(name);
  nameInput.disabled = true;
  joinBtn.disabled = true;
});

chatSend.addEventListener('click', sendText);
chatText.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendText(); });
chatFile.addEventListener('change', (e) => { sendFile(e.target.files && e.target.files[0]); e.target.value = ''; });

// Auto-join with a default name to reduce friction
(function autoJoin(){
  nameInput.value = defaultName();
  joinBtn.click();
})();
