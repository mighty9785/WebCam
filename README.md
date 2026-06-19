# Webcame

A lightweight Node.js application that lets your Android phone act as a webcam for your computer over a local network using WebRTC and Socket.IO signaling.

## Features

- Phone acts as the camera source.
- Computer acts as the viewer.
- Low latency live streaming.
- No login, no database, no cloud services.
- Works entirely on the same Wi-Fi or hotspot.
- Mobile-friendly UI with full-screen viewer mode.
- QR code quick access from mobile.
- Shows connection status and local IP.

## Installation

1. Open a terminal in the project folder.
2. Install dependencies:

```bash
npm install
```

3. Install mkcert globally or use npx:

```bash
npm install -g mkcert
# or use npx mkcert directly
```

4. Generate local HTTPS certificates:

```bash
npx mkcert -install
npx mkcert -key-file certs/server-key.pem -cert-file certs/server.pem localhost 127.0.0.1 ::1 <your-local-ip>
```

Replace `<your-local-ip>` with the IP shown by the server (for example `10.61.115.69`).

5. Start the application:

```bash
npm start
```

6. Open the app in a browser on the computer:

```text
https://<local-ip>:3000
```

## Usage

- Open `http://<local-ip>:3000` on both the phone and the computer.
- On the phone, open `camera.html` and grant camera permission.
- On the computer, open `viewer.html`.
- Start streaming from the phone and view the live feed.

## WebRTC Signaling Flow

1. The phone connects to the server as the `camera` role.
2. The computer connects to the server as the `viewer` role.
3. The camera creates a local WebRTC offer and sends it to the server via Socket.IO.
4. The server forwards the offer to the viewer.
5. The viewer sets the remote description, creates an answer, and sends it back.
6. The server forwards the answer to the camera.
7. Both peers exchange ICE candidates via the server.
8. Once the ICE connection is complete, the viewer receives the live video stream.

## Files

- `server.js` - Express server and Socket.IO signaling.
- `package.json` - Project metadata and dependencies.
- `public/index.html` - Landing page with local IP and QR code.
- `public/camera.html` - Phone camera capture and streaming UI.
- `public/viewer.html` - Viewer page for receiving the stream.
- `public/css/style.css` - Shared responsive styling.
- `public/js/index.js` - Local address and QR code helper.
- `public/js/camera.js` - Camera-side WebRTC signaling.
- `public/js/viewer.js` - Viewer-side WebRTC signaling.

## Notes

- Use a modern browser such as Chrome or Edge on Android.
- Make sure both devices are on the same local network.
- If the viewer disconnects, the phone can restart streaming and reconnect.
