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
