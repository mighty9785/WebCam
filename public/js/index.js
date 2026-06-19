const localUrlElement = document.getElementById('local-url');
const qrContainer = document.getElementById('qrcode');

async function fetchLocalInfo() {
  try {
    const response = await fetch('/api/info');
    const data = await response.json();
    localUrlElement.textContent = data.url;
    generateQRCode(data.url + '/camera.html');
  } catch (error) {
    localUrlElement.textContent = 'Unable to load local address. Check your network.';
    qrContainer.textContent = 'QR unavailable.';
    console.error(error);
  }
}

function generateQRCode(url) {
  qrContainer.innerHTML = '';
  QRCode.toCanvas(url, { width: 220, margin: 1 }, (err, canvas) => {
    if (err) {
      qrContainer.textContent = 'QR generation failed.';
      console.error(err);
      return;
    }
    qrContainer.appendChild(canvas);
  });
}

fetchLocalInfo();

// Navigation behavior
document.querySelectorAll('.nav-item').forEach((el) => {
  el.addEventListener('click', (e) => {
    const target = el.getAttribute('data-target');
    if (!target) return;
    if (target.startsWith('#')) {
      const id = target.slice(1);
      const node = document.getElementById(id);
      if (node) node.scrollIntoView({ behavior: 'smooth' });
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      el.classList.add('active');
      return;
    }
    window.location.href = target;
  });
});
// highlight active menu by URL
const path = window.location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.nav-item').forEach(n => {
  const t = n.getAttribute('data-target');
  if (t && t === path) n.classList.add('active');
});
