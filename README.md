# ChitChatShare - File Sharing Platform

A client-server file sharing system built with **Java Socket Programming**, featuring a modern **web frontend** powered by Node.js and Socket.IO.

![Java](https://img.shields.io/badge/Java-Socket_Programming-orange)
![Node.js](https://img.shields.io/badge/Node.js-Express-green)
![Socket.IO](https://img.shields.io/badge/Socket.IO-Real--time-blue)

## Features

### Server
- Multi-threaded client handling
- Username/password authentication with signup & password recovery
- Configurable buffer management (MAX_BUFFER_SIZE, chunk sizes)
- File chunking with random chunk size generation
- Upload acknowledgment & file integrity verification
- Automatic cleanup of incomplete uploads on disconnect
- Message notification system
- Upload/download history logging

### Client
- List all clients (online/offline status)
- Upload files with private/public access control
- Download own files and others' public files
- File requests (unicast/broadcast)
- View unread messages
- View upload/download history

### Web Frontend
- Modern, responsive UI
- Real-time communication via Socket.IO
- Drag & drop file upload
- Live server console output
- Toast notifications

## Project Structure

```
├── Server.java              # Main server with socket handling
├── ClientHandler.java       # Per-client thread handler
├── Client.java              # CLI client implementation
├── compile.sh               # Compile all Java files
├── cleanup.sh               # Clean server data & compiled files
└── web-frontend/
    ├── server.js             # Node.js bridge (WebSocket ↔ Java Socket)
    ├── package.json
    ├── start.sh              # Start web frontend
    └── public/
        ├── index.html
        ├── app.js
        ├── styles.css
        └── image/
            └── HomePageLogo.png
```

## Getting Started

### Prerequisites
- Java JDK 8+
- Node.js 14+

### 1. Compile the Java Server
```bash
./compile.sh
```

### 2. Start the Java Server
```bash
java Server
```
The server starts on port **8000**.

### 3. Start the Web Frontend
```bash
cd web-frontend
npm install
./start.sh
```
The web UI is available at **http://localhost:3000**.

### 4. CLI Client (Alternative)
```bash
java Client
```

## Configuration

In `Server.java`:
| Parameter | Default | Description |
|-----------|---------|-------------|
| `PORT` | 8000 | Server listening port |
| `MAX_BUFFER_SIZE` | 10 MB | Maximum buffer for uploads |
| `MIN_CHUNK_SIZE` | 50 KB | Minimum file chunk size |
| `MAX_CHUNK_SIZE` | 100 KB | Maximum file chunk size |

## Remote Access

To access from other devices on the same network:
```
http://<your-local-ip>:3000
```

For access over the internet, use [ngrok](https://ngrok.com/):
```bash
ngrok http 3000
```

## License

This project is licensed under the [MIT License](LICENSE).
