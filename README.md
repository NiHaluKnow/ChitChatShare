# ChitChatShare

A secure client-server file sharing platform built with **Java Socket Programming**, featuring a modern **web frontend** powered by Node.js and Socket.IO.

![Java](https://img.shields.io/badge/Java-Socket_Programming-orange)
![Node.js](https://img.shields.io/badge/Node.js-Express-green)
![Socket.IO](https://img.shields.io/badge/Socket.IO-Real--time-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## 📖 Overview

ChitChatShare is a multi-user file sharing system where clients connect to a central server via TCP sockets. Users can upload/download files with access control, send file requests, and communicate through a built-in messaging system. The platform supports both a traditional CLI client and a sleek web-based interface.

### How It Works

- **Server**: Java-based multi-threaded TCP server handling concurrent clients
- **CLI Client**: Terminal-based Java client for direct socket communication
- **Web Frontend**: Node.js bridge translating WebSocket (Socket.IO) to Java TCP sockets
- **File Transfer**: Chunked file transfer with configurable buffer and chunk sizes
- **Authentication**: Username/password with signup, login, and password recovery via security questions

## 🎮 Features

### 🖥️ Server
- Multi-threaded client handling with `ConcurrentHashMap`
- Username/password authentication with signup & password recovery
- Configurable buffer management (`MAX_BUFFER_SIZE`, chunk sizes)
- File chunking with random chunk size generation
- Upload acknowledgment & file integrity verification
- Automatic cleanup of incomplete uploads on disconnect
- Message notification system
- Upload/download history logging
- Persistent credentials storage

### 👤 Client Capabilities
- 👥 **List Users**: View all clients with online/offline status
- 📤 **Upload Files**: Private or public access control
- 📥 **Download Files**: Own files and others' public files
- 📨 **File Requests**: Unicast (specific user) or broadcast (all users)
- 💬 **Messages**: View unread messages and notifications
- 📊 **History**: Complete upload/download activity log

### 🌐 Web Frontend
- Modern, responsive UI with gradient design
- Real-time communication via Socket.IO
- Drag & drop file upload
- Live server console output
- Toast notifications
- Mobile-friendly layout

## 🚀 Quick Start

### Prerequisites
- Java Development Kit (JDK) 8 or higher
- Node.js 14+
- Terminal/Command Prompt

### Installation

```bash
# Clone the repository
git clone https://github.com/NiHaluKnow/ChitChatShare.git
cd ChitChatShare

# Make scripts executable (Linux/Mac)
chmod +x compile.sh cleanup.sh web-frontend/start.sh
```

### Running the Application

#### 1. Compile the Java Server
```bash
./compile.sh
```

#### 2. Start the Java Server
```bash
java Server
```
The server starts on port **8000**.

#### 3. Start the Web Frontend (Recommended)
```bash
cd web-frontend
npm install
./start.sh
```
The web UI is available at **http://localhost:3000**.

#### 4. CLI Client (Alternative)
```bash
java Client
```

### Cleaning Up
```bash
./cleanup.sh
```

## 📁 Project Structure

```
ChitChatShare/
├── Server.java              # Main server with socket handling
├── ClientHandler.java       # Per-client thread handler
├── Client.java              # CLI client implementation
├── compile.sh               # Compile all Java files
├── cleanup.sh               # Clean server data & compiled files
├── LICENSE                   # MIT License
├── README.md
└── web-frontend/
    ├── server.js             # Node.js bridge (WebSocket ↔ Java Socket)
    ├── package.json
    ├── start.sh              # Start web frontend
    └── public/
        ├── index.html        # Main HTML page
        ├── app.js            # Frontend logic & Socket.IO client
        ├── styles.css        # UI styling
        └── image/
            └── HomePageLogo.png
```

## 🛠️ Configuration

### Server Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `PORT` | 8000 | Server listening port |
| `MAX_BUFFER_SIZE` | 10 MB | Maximum buffer for uploads |
| `MIN_CHUNK_SIZE` | 50 KB | Minimum file chunk size |
| `MAX_CHUNK_SIZE` | 100 KB | Maximum file chunk size |

### Web Frontend

| Parameter | Default | Description |
|-----------|---------|-------------|
| `JAVA_SERVER_HOST` | localhost | Java server address |
| `JAVA_SERVER_PORT` | 8000 | Java server port |
| `WEB_SERVER_PORT` | 3000 | Web UI port |

## 🌍 Remote Access

Access from other devices on the same Wi-Fi/LAN:
```
http://<your-local-ip>:3000
```

## 📊 Technical Details

### Architecture
```
┌─────────────┐     TCP Socket     ┌──────────────┐
│  CLI Client  │ ◄──────────────► │              │
│  (Java)      │                   │  Java Server │
└─────────────┘                   │  (Port 8000) │
                                   │              │
┌─────────────┐   Socket.IO       │              │
│  Web Browser │ ◄──────────► ┌──┤              │
│              │              │  └──────────────┘
└─────────────┘         ┌─────┘
                        │  Node.js Bridge
                        │  (Port 3000)
                        └─── TCP Socket ──►
```

### Core Technologies
- **Java Sockets**: TCP-based client-server communication
- **Multi-threading**: `ConcurrentHashMap` for thread-safe client management
- **Node.js + Express**: Static file serving for web frontend
- **Socket.IO**: Real-time bidirectional WebSocket communication
- **File Chunking**: Configurable chunk sizes for reliable large file transfers

### File Transfer Protocol
1. Client initiates upload with file metadata
2. Server allocates buffer and generates file ID
3. File is split into random-sized chunks (50KB–100KB)
4. Each chunk is sent with acknowledgment
5. Server verifies file integrity on completion
6. Incomplete uploads are cleaned up on disconnect

## 🎯 Usage Guide

### Web Interface
1. Open **http://localhost:3000** in your browser
2. **Sign Up** or **Login** with your credentials
3. Navigate using the sidebar:
   - 📁 **My Files** — View your uploaded files
   - ⬆️ **Upload** — Drag & drop or browse to upload
   - 👥 **Users** — See all users and their public files
   - 💬 **Messages** — File requests and notifications
   - 📊 **History** — Upload/download activity log

### CLI Interface
1. Run `java Client` and enter server address
2. Login or create a new account
3. Use numbered menu options to navigate features

### Strategy Tips
- 💡 Use **public** access for files you want to share with everyone
- 💡 Use **private** access for personal file storage
- 💡 Use **broadcast requests** when you need a file from anyone
- 💡 Use **unicast requests** for specific users

## 🤝 Contributing

Contributions are welcome! Areas for improvement:
- End-to-end encryption for file transfers
- File preview in the web interface
- Group/folder organization
- File versioning
- Dark mode theme

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 👨‍💻 Author

This project was created as a part of the Computer Networks !

## 🙏 Acknowledgments

- Built with Java Socket Programming fundamentals
- Web frontend powered by Express.js and Socket.IO
- UI designed with modern CSS and Inter font family

---

**Happy Sharing!** 📂 If you find this project interesting, please give it a ⭐ on GitHub! Thank You <3
