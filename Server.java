import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;

public class Server {
    // Configurable parameters
    private static final int MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10 MB
    private static final int MIN_CHUNK_SIZE = 50 * 1024; // 50 KB
    private static final int MAX_CHUNK_SIZE = 100 * 1024; // 100 KB
    
    private static final int PORT = 8000; 
    
    // Data structures
    private static Map<String, ClientHandler> onlineClients = new ConcurrentHashMap<>();
    private static Set<String> allKnownClients = ConcurrentHashMap.newKeySet();
    private static Map<String, String> userPasswords = new ConcurrentHashMap<>(); // username -> password
    private static Map<String, String> userSecurityAnswers = new ConcurrentHashMap<>(); // username -> security answer
    private static Map<String, FileUploadSession> uploadSessions = new ConcurrentHashMap<>();
    private static Map<String, List<FileRequest>> fileRequests = new ConcurrentHashMap<>();
    private static Map<String, List<String>> unreadMessages = new ConcurrentHashMap<>();
    private static long currentBufferSize = 0;
    private static final Object bufferLock = new Object();
    
    private static int fileIdCounter = 0;
    private static int requestIdCounter = 0;
    
    private static final String CREDENTIALS_FILE = "server_data/credentials.txt";
    
    public static void main(String[] args) {
        System.out.println("Server starting on port " + PORT + "...");
        System.out.println("MAX_BUFFER_SIZE: " + MAX_BUFFER_SIZE);
        System.out.println("MIN_CHUNK_SIZE: " + MIN_CHUNK_SIZE);
        System.out.println("MAX_CHUNK_SIZE: " + MAX_CHUNK_SIZE);
        
        // Load saved credentials
        loadCredentials();
        
        try (ServerSocket serverSocket = new ServerSocket(PORT)) {
            System.out.println("Server started successfully!");
            
            while (true) {
                Socket clientSocket = serverSocket.accept();
                System.out.println("New connection from: " + clientSocket.getInetAddress());
                
                new Thread(() -> handleNewClient(clientSocket)).start();
            }
        } catch (IOException e) {
            System.err.println("Server error: " + e.getMessage());
        }
    }
    
    private static void handleNewClient(Socket socket) {
        try {
            // Get raw streams first for binary data
            InputStream rawIn = socket.getInputStream();
            OutputStream rawOut = socket.getOutputStream();
            
            DataInputStream dataIn = new DataInputStream(rawIn);
            PrintWriter out = new PrintWriter(rawOut, true);
            
            // Read auth mode, username and password
            String authMode = readLine(dataIn); // LOGIN, SIGNUP, or RECOVER
            String username = readLine(dataIn);
            String password = readLine(dataIn);
            
            if (authMode == null || authMode.trim().isEmpty()) {
                authMode = "LOGIN";
            }
            
            if (username == null || username.trim().isEmpty()) {
                out.println("ERROR:Invalid username");
                socket.close();
                return;
            }
            
            // Handle RECOVER mode (no login, just reset password)
            if (authMode.equals("RECOVER")) {
                String securityAnswer = password; // reuse password field for security answer
                String newPassword = readLine(dataIn);
                
                if (!userPasswords.containsKey(username)) {
                    out.println("ERROR:Account not found");
                    socket.close();
                    return;
                }
                
                String storedAnswer = userSecurityAnswers.getOrDefault(username, "");
                if (storedAnswer.isEmpty()) {
                    out.println("ERROR:No security question set for this account");
                    socket.close();
                    return;
                }
                
                if (!storedAnswer.equalsIgnoreCase(securityAnswer.trim())) {
                    out.println("ERROR:Incorrect security answer");
                    socket.close();
                    return;
                }
                
                if (newPassword == null || newPassword.trim().isEmpty()) {
                    out.println("ERROR:New password cannot be empty");
                    socket.close();
                    return;
                }
                
                userPasswords.put(username, newPassword);
                saveCredentials();
                out.println("ERROR:Password reset successful! Please login with your new password.");
                socket.close();
                System.out.println("Password reset for user: " + username);
                return;
            }
            
            if (password == null || password.trim().isEmpty()) {
                out.println("ERROR:Invalid password");
                socket.close();
                return;
            }
            
            // Check if username is already online
            synchronized (onlineClients) {
                if (onlineClients.containsKey(username)) {
                    out.println("ERROR:Username already online");
                    socket.close();
                    System.out.println("Login denied for " + username + " (already online)");
                    return;
                }
            }
            
            // Handle LOGIN vs SIGNUP
            if (authMode.equals("SIGNUP")) {
                if (userPasswords.containsKey(username)) {
                    out.println("ERROR:Username already registered. Please login instead.");
                    socket.close();
                    System.out.println("Signup denied for " + username + " (already exists)");
                    return;
                }
                // Read security answer for signup
                String securityAnswer = readLine(dataIn);
                if (securityAnswer == null || securityAnswer.trim().isEmpty()) {
                    out.println("ERROR:Security answer is required for signup");
                    socket.close();
                    return;
                }
                // Register new user
                userPasswords.put(username, password);
                userSecurityAnswers.put(username, securityAnswer.trim());
                saveCredentials();
                System.out.println("New user registered: " + username);
            } else {
                // LOGIN mode
                if (!userPasswords.containsKey(username)) {
                    out.println("ERROR:Account not found. Please sign up first.");
                    socket.close();
                    System.out.println("Login denied for " + username + " (not registered)");
                    return;
                }
                if (!userPasswords.get(username).equals(password)) {
                    out.println("ERROR:Wrong password");
                    socket.close();
                    System.out.println("Login denied for " + username + " (wrong password)");
                    return;
                }
            }
            
            // Create user directory if first time
            File userDir = new File("server_data/" + username);
            if (!userDir.exists()) {
                userDir.mkdirs();
                System.out.println("Created directory for new user: " + username);
            }
            
            // Add to known clients
            allKnownClients.add(username);
            
            // Create client handler with raw streams (no BufferedReader)
            ClientHandler handler = new ClientHandler(socket, username, out, rawIn, rawOut);
            onlineClients.put(username, handler);
            
            out.println("SUCCESS:Welcome " + username);
            System.out.println("User " + username + " logged in successfully");
            
            // Initialize unread messages list if needed
            unreadMessages.putIfAbsent(username, new CopyOnWriteArrayList<>());
            
            // Start handling client
            handler.start();
            
        } catch (IOException e) {
            System.err.println("Error handling new client: " + e.getMessage());
        }
    }
    
    // Read a line from DataInputStream without buffering extra bytes
    private static String readLine(DataInputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') {
                break;
            }
            if (c != '\r') {  // Skip \r
                sb.append((char) c);
            }
        }
        return sb.length() > 0 || c != -1 ? sb.toString() : null;
    }
    
    //FileID generation here !!
    public static synchronized String generateFileId() {
        return "FILE_" + (++fileIdCounter);
    }
    
    //RequestID generation here !!
    public static synchronized String generateRequestId() {
        return "REQ_" + (++requestIdCounter);
    }
    
    public static boolean reserveBuffer(long size) {
        synchronized (bufferLock) {
            if (currentBufferSize + size <= MAX_BUFFER_SIZE) {
                currentBufferSize += size;
                return true;
            }
            return false;
        }
    }
    
    public static void releaseBuffer(long size) {
        synchronized (bufferLock) {
            currentBufferSize -= size;
            if (currentBufferSize < 0) currentBufferSize = 0;
        }
    }
    
    // Get a random chunk size between MIN_CHUNK_SIZE and MAX_CHUNK_SIZE
    public static int getRandomChunkSize() {
        Random random = new Random();
        return MIN_CHUNK_SIZE + random.nextInt(MAX_CHUNK_SIZE - MIN_CHUNK_SIZE + 1);
    }
    
    public static int getMaxChunkSize() {
        return MAX_CHUNK_SIZE;
    }
    
    public static void addUploadSession(String fileId, FileUploadSession session) {
        uploadSessions.put(fileId, session);
    }
    
    public static FileUploadSession getUploadSession(String fileId) {
        return uploadSessions.get(fileId);
    }
    
    public static void removeUploadSession(String fileId) {
        uploadSessions.remove(fileId);
    }
    
    public static Map<String, FileUploadSession> getAllUploadSessions() {
        return uploadSessions;
    }
    
    public static Map<String, ClientHandler> getOnlineClients() {
        return onlineClients;
    }
    
    public static Set<String> getAllKnownClients() {
        return allKnownClients;
    }
    
    public static void removeClient(String username) {
        onlineClients.remove(username);
    }
    
    public static void addFileRequest(String recipient, FileRequest request) {
        fileRequests.computeIfAbsent(recipient, k -> new CopyOnWriteArrayList<>()).add(request);
    }
    
    public static List<FileRequest> getFileRequests(String username) {
        return fileRequests.getOrDefault(username, new ArrayList<>());
    }
    
    public static Map<String, List<FileRequest>> getAllFileRequests() {
        return fileRequests;
    }
    
    public static void addMessage(String username, String message) {
        unreadMessages.computeIfAbsent(username, k -> new CopyOnWriteArrayList<>()).add(message);
        
        // Persist to file
        File userDir = new File("server_data/" + username);
        if (!userDir.exists()) userDir.mkdirs();
        File msgFile = new File(userDir, "messages.txt");
        try (java.io.FileWriter fw = new java.io.FileWriter(msgFile, true)) {
            fw.write(message + "\n");
        } catch (java.io.IOException e) {
            e.printStackTrace();
        }
    }
    
    public static List<String> getUnreadMessages(String username) {
        return unreadMessages.getOrDefault(username, new ArrayList<>());
    }
    
    public static List<String> getAllMessages(String username) {
        List<String> messages = new ArrayList<>();
        File msgFile = new File("server_data/" + username + "/messages.txt");
        if (msgFile.exists()) {
            try (java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.FileReader(msgFile))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (!line.trim().isEmpty()) {
                        messages.add(line);
                    }
                }
            } catch (java.io.IOException e) {
                e.printStackTrace();
            }
        }
        return messages;
    }
    
    public static void clearMessages(String username) {
        List<String> messages = unreadMessages.get(username);
        if (messages != null) {
            messages.clear();
        }
    }
    
    private static void loadCredentials() {
        File credFile = new File(CREDENTIALS_FILE);
        if (!credFile.exists()) {
            System.out.println("No saved credentials found.");
            return;
        }
        
        try (BufferedReader reader = new BufferedReader(new FileReader(credFile))) {
            String line;
            int count = 0;
            while ((line = reader.readLine()) != null) {
                String[] parts = line.split("\\|", 3);
                if (parts.length >= 2) {
                    userPasswords.put(parts[0], parts[1]);
                    allKnownClients.add(parts[0]);
                    if (parts.length >= 3) {
                        userSecurityAnswers.put(parts[0], parts[2]);
                    }
                    count++;
                }
            }
            System.out.println("Loaded " + count + " saved credentials.");
        } catch (IOException e) {
            System.err.println("Error loading credentials: " + e.getMessage());
        }
    }
    
    private static synchronized void saveCredentials() {
        File credFile = new File(CREDENTIALS_FILE);
        credFile.getParentFile().mkdirs();
        
        try (FileWriter fw = new FileWriter(credFile, false)) {
            for (Map.Entry<String, String> entry : userPasswords.entrySet()) {
                String secAnswer = userSecurityAnswers.getOrDefault(entry.getKey(), "");
                fw.write(entry.getKey() + "|" + entry.getValue() + "|" + secAnswer + "\n");
            }
        } catch (IOException e) {
            System.err.println("Error saving credentials: " + e.getMessage());
        }
    }
}

class FileUploadSession {
    String fileId;
    String username;
    String fileName;
    long totalSize;
    int chunkSize;
    boolean isPublic;
    String requestId;
    String requesterUsername;  // Username of the person who requested this file
    String description;  // Description added by uploader
    List<byte[]> chunks;
    long receivedSize;
    
    public FileUploadSession(String fileId, String username, String fileName, long totalSize, 
                            int chunkSize, boolean isPublic, String requestId) {
        this.fileId = fileId;
        this.username = username;
        this.fileName = fileName;
        this.totalSize = totalSize;
        this.chunkSize = chunkSize;
        this.isPublic = isPublic;
        this.requestId = requestId;
        this.chunks = new ArrayList<>();
        this.receivedSize = 0;
    }
    
    public void addChunk(byte[] chunk) {
        chunks.add(chunk);
        receivedSize += chunk.length;
    }
    
    public boolean isComplete() {
        return receivedSize == totalSize;
    }
    
    public void saveToFile() throws IOException {
        File file = new File("server_data/" + username + "/" + fileName);
        try (FileOutputStream fos = new FileOutputStream(file)) {
            for (byte[] chunk : chunks) {
                fos.write(chunk);
            }
        }
    }
    
    public void deleteChunks() {
        chunks.clear();
    }
}

class FileRequest {
    String requestId;
    String requester;
    String description;
    
    public FileRequest(String requestId, String requester, String description) {
        this.requestId = requestId;
        this.requester = requester;
        this.description = description;
    }
}
