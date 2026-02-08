import java.io.*;
import java.net.*;
import java.util.*;
import java.text.SimpleDateFormat;

public class ClientHandler extends Thread {
    private Socket socket;
    private String username;
    private PrintWriter out;
    private DataInputStream dataIn;
    private DataOutputStream dataOut;
    private volatile boolean running = true;
    
    public ClientHandler(Socket socket, String username, PrintWriter out, 
                         InputStream rawIn, OutputStream rawOut) {
        this.socket = socket;
        this.username = username;
        this.out = out;
        this.dataIn = new DataInputStream(rawIn);
        this.dataOut = new DataOutputStream(rawOut);
    }
    
    @Override
    public void run() {
        try {
            while (running) {
                // Read command line using DataInputStream to avoid buffering issues
                String command = readLine(dataIn);
                
                if (command == null || command.isEmpty()) {
                    break;
                }
                
                System.out.println("Command from " + username + ": " + command);
                handleCommand(command);
            }
        } catch (IOException e) {
            System.out.println("Client " + username + " disconnected: " + e.getMessage());
        } finally {
            cleanup();
        }
    }
    
    // Read a line from DataInputStream without buffering extra bytes
    private String readLine(DataInputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') {
                break;
            }
            if (c != '\r') {   // Skip \r
                sb.append((char) c);
            }
        }
        return sb.length() > 0 || c != -1 ? sb.toString() : null;
    }
    
    private void handleCommand(String command) throws IOException {
        String[] parts = command.split(":", 2);
        String cmd = parts[0];
        
        switch (cmd) {
            case "LIST_CLIENTS":
                handleListClients();
                break;
            case "LIST_OWN_FILES":
                handleListOwnFiles();
                break;
            case "LIST_PUBLIC_FILES":
                handleListPublicFiles(parts.length > 1 ? parts[1] : "");
                break;
            case "UPLOAD_REQUEST":
                handleUploadRequest(parts[1]);
                break;
            case "UPLOAD_CHUNK":
                handleUploadChunk(parts[1]);
                break;
            case "UPLOAD_COMPLETE":
                handleUploadComplete(parts[1]);
                break;
            case "DOWNLOAD_REQUEST":
                handleDownloadRequest(parts[1]);
                break;
            case "FILE_REQUEST":
                handleFileRequest(parts[1]);
                break;
            case "VIEW_MESSAGES":
                handleViewMessages();
                break;
            case "VIEW_HISTORY":
                handleViewHistory();
                break;
            case "DELETE_FILE":
                handleDeleteFile(parts.length > 1 ? parts[1] : "");
                break;
            case "DELETE_MESSAGE":
                handleDeleteMessage(parts.length > 1 ? parts[1] : "");
                break;
            case "LOGOUT":
                running = false;
                out.println("SUCCESS:Logged out");
                break;
            default:
                out.println("ERROR:Unknown command");
        }
    }
    
    private void handleListClients() {
        StringBuilder response = new StringBuilder("CLIENT_LIST:");
        Set<String> allClients = Server.getAllKnownClients();
        Map<String, ClientHandler> onlineClients = Server.getOnlineClients();
        
        System.out.println("All known clients: " + allClients);
        System.out.println("Online clients: " + onlineClients.keySet());
        
        for (String client : allClients) {
            boolean isOnline = onlineClients.containsKey(client);
            response.append(client).append(isOnline ? "(online)" : "(offline)").append(",");
        }
        
        String finalResponse = response.toString();
        System.out.println("Sending response to " + username + ": " + finalResponse);
        out.println(finalResponse);
        out.flush();
    }
    
    private void handleListOwnFiles() {
        File userDir = new File("server_data/" + username);
        File metadataFile = new File(userDir, "metadata.txt");
        
        StringBuilder response = new StringBuilder("OWN_FILES:");
        
        if (metadataFile.exists()) {
            try (BufferedReader reader = new BufferedReader(new FileReader(metadataFile))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    // filename|public|requestId
                    response.append(line).append(";");
                }
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
        
        out.println(response.toString());
    }
    
    private void handleListPublicFiles(String targetUsername) {
        if (targetUsername.isEmpty()) {
            out.println("ERROR:No username specified");
            return;
        }
        
        File userDir = new File("server_data/" + targetUsername);
        File metadataFile = new File(userDir, "metadata.txt");
        
        StringBuilder response = new StringBuilder("PUBLIC_FILES:");
        
        if (metadataFile.exists()) {
            try (BufferedReader reader = new BufferedReader(new FileReader(metadataFile))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    String[] parts = line.split("\\|");
                    if (parts.length >= 2 && parts[1].equals("public")) {
                        String desc = parts.length > 3 ? parts[3] : "";
                        response.append(parts[0]).append("~").append(desc).append(";");
                    }
                }
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
        
        out.println(response.toString());
    }
    
    private void handleUploadRequest(String data) throws IOException {
        // filename|filesize|ispublic|requestId|description
        String[] parts = data.split("\\|", 5);
        String fileName = parts[0];
        long fileSize = Long.parseLong(parts[1]);
        boolean isPublic = parts[2].equals("true");
        String requestId = parts.length > 3 ? parts[3] : "";
        String description = parts.length > 4 ? parts[4] : "";
        
        // Check if requestId is valid (if provided)
        String requesterUsername = "";  // Username of the person who requested this file
        if (!requestId.isEmpty()) {
            boolean validRequest = false;
            System.out.println("Validating request ID: " + requestId + " for user: " + username);
            System.out.println("All file requests: " + Server.getAllFileRequests());
            
            // Search all file requests to validate the request ID
            for (Map.Entry<String, List<FileRequest>> entry : Server.getAllFileRequests().entrySet()) {
                System.out.println("Checking recipient: " + entry.getKey() + " with requests: " + entry.getValue().size());
                for (FileRequest req : entry.getValue()) {
                    System.out.println("  Request ID: " + req.requestId + ", Requester: " + req.requester);
                    if (req.requestId.equals(requestId)) {
                        validRequest = true;
                        requesterUsername = req.requester; // Store requester username 
                        System.out.println("  -> VALID REQUEST FOUND! Requester: " + requesterUsername);
                        break;
                    }
                }
                if (validRequest) break;
            }
            if (!validRequest) {
                out.println("ERROR:Invalid request ID");
                System.out.println("Invalid request ID: " + requestId + " from " + username);
                return;
            }
        }
        
        // Check buffer availability
        if (!Server.reserveBuffer(fileSize)) {
            out.println("ERROR:Buffer full");
            logAction(fileName, "upload", "failed - buffer full");
            return;
        }
        
        // Generate file ID and chunk size
        String fileId = Server.generateFileId();
        int chunkSize = Server.getRandomChunkSize();
        
        // Create upload session
        FileUploadSession session = new FileUploadSession(fileId, username, fileName, 
                                                          fileSize, chunkSize, isPublic, requestId);
        session.requesterUsername = requesterUsername;  // Set requester username
        session.description = description;  // Set description
        Server.addUploadSession(fileId, session);
        
        out.println("UPLOAD_APPROVED:" + fileId + "|" + chunkSize);
        System.out.println("Upload approved for " + username + ": " + fileName + " (" + fileSize + " bytes)");
    }
    
    private void handleUploadChunk(String data) throws IOException {
        //fileId|chunkSize
        String[] parts = data.split("\\|");
        String fileId = parts[0];
        int chunkSize = Integer.parseInt(parts[1]);
        
        FileUploadSession session = Server.getUploadSession(fileId);
        if (session == null) {
            out.println("ERROR:Invalid file ID");
            return;
        }
        
        // Read chunk data
        byte[] buffer = new byte[chunkSize];
        int totalRead = 0;
        while (totalRead < chunkSize) {
            int read = dataIn.read(buffer, totalRead, chunkSize - totalRead);
            if (read == -1) break;
            totalRead += read;
        }
        
        byte[] chunk = Arrays.copyOf(buffer, totalRead);
        session.addChunk(chunk);
        
        out.println("CHUNK_ACK");
        out.flush();
        System.out.println("Chunk received for " + fileId + ": " + totalRead + " bytes");
    }
    
    private void handleUploadComplete(String fileId) throws IOException {
        FileUploadSession session = Server.getUploadSession(fileId);
        if (session == null) {
            out.println("ERROR:Invalid file ID");
            return;
        }
        
        // Verify file size
        if (session.isComplete()) {
            try {
                session.saveToFile();
                
                // Save metadata
                saveFileMetadata(session.fileName, session.isPublic, session.requesterUsername, session.description);
                
                out.println("UPLOAD_SUCCESS");
                out.flush();
                logAction(session.fileName, "upload", "success");
                System.out.println("Upload completed: " + session.fileName);
                
                // If this was a requested file, notify the requester
                if (!session.requestId.isEmpty()) {
                    notifyFileUploaded(session.requestId, session.fileName, session.description);
                }
                
            } catch (IOException e) {
                session.deleteChunks();
                out.println("ERROR:Failed to save file");
                out.flush();
                logAction(session.fileName, "upload", "failed - save error");
            }
        } else {
            session.deleteChunks();
            out.println("ERROR:File size mismatch");
            out.flush();
            logAction(session.fileName, "upload", "failed - size mismatch");
        }
        
        Server.releaseBuffer(session.totalSize);
        Server.removeUploadSession(fileId);
    }
    
    private void handleDownloadRequest(String data) throws IOException {
        //owner|filename
        String[] parts = data.split("\\|");
        String owner = parts[0];
        String fileName = parts[1];
        
        File file = new File("server_data/" + owner + "/" + fileName);
        
        if (!file.exists()) {
            out.println("ERROR:File not found");
            logAction(fileName, "download", "failed - not found");
            return;
        }
        
        // Check if file is accessible
        if (!owner.equals(username) && !isFileAccessible(owner, fileName, username)) {
            out.println("ERROR:File is private");
            logAction(fileName, "download", "failed - private");
            return;
        }
        
        long fileSize = file.length();
        out.println("DOWNLOAD_START:" + fileName + "|" + fileSize);
        out.flush();  // CRITICAL: Flush text message before binary data
        
        // Send file in chunks
        try (FileInputStream fis = new FileInputStream(file)) {
            byte[] buffer = new byte[Server.getMaxChunkSize()];
            int bytesRead;
            
            while ((bytesRead = fis.read(buffer)) != -1) {
                dataOut.writeInt(bytesRead);
                dataOut.write(buffer, 0, bytesRead);
                dataOut.flush();
            }
            
            out.println("DOWNLOAD_COMPLETE");
            out.flush();  // Flush completion message
            logAction(fileName, "download", "success");
            System.out.println("Download completed: " + fileName + " to " + username);
            
        } catch (IOException e) {
            out.println("ERROR:Download failed");
            logAction(fileName, "download", "failed - transfer error");
        }
    }
    
    private void handleFileRequest(String data) {
        //description|recipient
        String[] parts = data.split("\\|", 2);
        String description = parts[0];
        String recipient = parts[1];
        
        String requestId = Server.generateRequestId();
        FileRequest request = new FileRequest(requestId, username, description);
        
        if (recipient.equals("ALL")) {
            // Broadcast to all clients
            for (String client : Server.getAllKnownClients()) {
                if (!client.equals(username)) {
                    Server.addFileRequest(client, request);
                    String message = "File request from " + username + " (ID: " + requestId + "): " + description;
                    Server.addMessage(client, message);
                    
                    // Notify if online
                    ClientHandler handler = Server.getOnlineClients().get(client);
                    if (handler != null) {
                        handler.out.println("NEW_MESSAGE:" + message);
                    }
                }
            }
        } else {
            // Unicast to specific client
            Server.addFileRequest(recipient, request);
            String message = "File request from " + username + " (ID: " + requestId + "): " + description;
            Server.addMessage(recipient, message);
            
            // Notify if online
            ClientHandler handler = Server.getOnlineClients().get(recipient);
            if (handler != null) {
                handler.out.println("NEW_MESSAGE:" + message);
            }
        }
        
        out.println("REQUEST_SENT:" + requestId);
        System.out.println("File request created: " + requestId + " by " + username);
    }
    
    private void handleViewMessages() {
        // Load all persisted messages from file
        List<String> messages = Server.getAllMessages(username);
        StringBuilder response = new StringBuilder("MESSAGES:");
        
        for (String message : messages) {
            response.append(message).append(";");
        }
        
        out.println(response.toString());
        
        // Clear only the unread (in-memory) notifications, keep persisted messages
        Server.clearMessages(username);
    }
    
    private void handleDeleteMessage(String messageText) {
        if (messageText == null || messageText.trim().isEmpty()) {
            out.println("ERROR:No message specified");
            return;
        }
        
        File msgFile = new File("server_data/" + username + "/messages.txt");
        if (!msgFile.exists()) {
            out.println("ERROR:No messages file");
            return;
        }
        
        List<String> remaining = new ArrayList<>();
        boolean found = false;
        
        try (BufferedReader reader = new BufferedReader(new FileReader(msgFile))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!found && line.trim().equals(messageText.trim())) {
                    found = true; // Remove only first matching message
                } else {
                    remaining.add(line);
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
            out.println("ERROR:Failed to read messages");
            return;
        }
        
        try (FileWriter fw = new FileWriter(msgFile, false)) {
            for (String line : remaining) {
                fw.write(line + "\n");
            }
        } catch (IOException e) {
            e.printStackTrace();
            out.println("ERROR:Failed to update messages");
            return;
        }
        
        out.println("MESSAGE_DELETED");
    }
    
    private void handleViewHistory() {
        File logFile = new File("server_data/" + username + "/log.txt");
        StringBuilder response = new StringBuilder("HISTORY:");
        
        if (logFile.exists()) {
            try (BufferedReader reader = new BufferedReader(new FileReader(logFile))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    response.append(line).append(";");
                }
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
        
        out.println(response.toString());
    }
    
    /*
        Save file metadata: filename|public/private|requesterUsername|description
    */
    private void saveFileMetadata(String fileName, boolean isPublic, String requesterUsername, String description) throws IOException {
        File metadataFile = new File("server_data/" + username + "/metadata.txt");
        
        // Read existing metadata and remove old entry for this file if exists
        List<String> lines = new ArrayList<>();
        if (metadataFile.exists()) {
            try (BufferedReader reader = new BufferedReader(new FileReader(metadataFile))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    String[] parts = line.split("\\|");
                    // Keep all entries except the one with the same filename
                    if (!parts[0].equals(fileName)) {
                        lines.add(line);
                    }
                }
            }
        }
        
        // Add new entry: filename|public/private|requesterUsername|description
        String desc = (description != null) ? description : "";
        lines.add(fileName + "|" + (isPublic ? "public" : "private") + "|" + requesterUsername + "|" + desc);
        
        // Write all entries back
        try (FileWriter fw = new FileWriter(metadataFile, false)) {
            for (String line : lines) {
                fw.write(line + "\n");
            }
        }
    }
    
    // Check if file is accessible by downloader (public OR downloader is the requester)
    private boolean isFileAccessible(String owner, String fileName, String downloader) {
        File metadataFile = new File("server_data/" + owner + "/metadata.txt");
        
        if (metadataFile.exists()) {
            try (BufferedReader reader = new BufferedReader(new FileReader(metadataFile))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    String[] parts = line.split("\\|");
                    if (parts[0].equals(fileName)) {
                        // File is accessible if it's public OR downloader is the requester
                        if (parts[1].equals("public")) {
                            return true;
                        }
                        // Check if downloader is the requester (parts[2] has requester username)
                        if (parts.length > 2 && parts[2].equals(downloader)) {
                            return true;
                        }
                        return false;
                    }
                }
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
        
        return false;
    }
    
    private void handleDeleteFile(String fileName) {
        if (fileName == null || fileName.trim().isEmpty()) {
            out.println("ERROR:No filename specified");
            return;
        }
        
        File file = new File("server_data/" + username + "/" + fileName);
        
        if (!file.exists()) {
            out.println("ERROR:File not found");
            return;
        }
        
        // Delete the file
        if (file.delete()) {
            // Remove from metadata
            removeFileMetadata(fileName);
            logAction(fileName, "delete", "success");
            out.println("DELETE_SUCCESS:" + fileName);
            System.out.println("File deleted: " + fileName + " by " + username);
        } else {
            logAction(fileName, "delete", "failed");
            out.println("ERROR:Failed to delete file");
        }
    }
    
    private void removeFileMetadata(String fileName) {
        File metadataFile = new File("server_data/" + username + "/metadata.txt");
        if (!metadataFile.exists()) return;
        
        List<String> lines = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new FileReader(metadataFile))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String[] parts = line.split("\\|");
                if (!parts[0].equals(fileName)) {
                    lines.add(line);
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
            return;
        }
        
        try (FileWriter fw = new FileWriter(metadataFile, false)) {
            for (String line : lines) {
                fw.write(line + "\n");
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
    
    private void logAction(String fileName, String action, String status) {
        File logFile = new File("server_data/" + username + "/log.txt");
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        String timestamp = sdf.format(new Date());
        
        try (FileWriter fw = new FileWriter(logFile, true)) {
            fw.write(fileName + "|" + timestamp + "|" + action + "|" + status + "\n");
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
    
    private void notifyFileUploaded(String requestId, String fileName, String description) {
        // Search all file requests to find the one matching this requestId
        for (Map.Entry<String, List<FileRequest>> entry : Server.getAllFileRequests().entrySet()) {
            for (FileRequest req : entry.getValue()) {
                if (req.requestId.equals(requestId)) {
                    String requester = req.requester;
                    String message = username + " uploaded requested file '" + fileName + "' (Request ID: " + requestId + ")";
                    if (description != null && !description.isEmpty()) {
                        message += " - Note: " + description;
                    }
                    Server.addMessage(requester, message);
                    
                    // Notify if requester is online
                    ClientHandler handler = Server.getOnlineClients().get(requester);
                    if (handler != null) {
                        handler.out.println("NEW_MESSAGE:" + message);
                    }
                    
                    System.out.println("Notified " + requester + " about uploaded file: " + fileName);
                    return;
                }
            }
        }
    }
    
    private void cleanup() {
        System.out.println("Cleaning up client: " + username);
        
        if (username == null) {
            try {
                socket.close();
            } catch (IOException e) {
                // Ignore
            }
            return;
        }
        
        // Remove incomplete uploads
        List<String> toRemove = new ArrayList<>();
        for (Map.Entry<String, FileUploadSession> entry : Server.getAllUploadSessions().entrySet()) {
            FileUploadSession session = entry.getValue();
            if (session.username.equals(username)) {
                session.deleteChunks();
                Server.releaseBuffer(session.totalSize);
                toRemove.add(entry.getKey());
                System.out.println("Deleted incomplete upload: " + session.fileName);
            }
        }
        
        for (String fileId : toRemove) {
            Server.removeUploadSession(fileId);
        }
        
        Server.removeClient(username);
        
        try {
            socket.close();
        } catch (IOException e) {
            e.printStackTrace();
        }
        
        System.out.println("Client " + username + " disconnected");
    }
}
