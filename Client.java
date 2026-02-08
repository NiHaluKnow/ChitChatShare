import java.io.*;
import java.net.*;
import java.util.concurrent.*;


public class Client {
    private Socket socket;
    private PrintWriter out;
    private DataInputStream dataIn;
    private DataOutputStream dataOut;
    private BufferedReader userInput;
    private String username;
    private BlockingQueue<String> responseQueue = new LinkedBlockingQueue<>();
    private volatile boolean binaryMode = false;  // Flag to pause text listener during binary transfer
    
    private static final String SERVER_HOST = "localhost";
    private static final int SERVER_PORT = 8000;
    
    public Client() {
        userInput = new BufferedReader(new InputStreamReader(System.in));
    }
    
    public static void main(String[] args) {
        Client client = new Client();
        client.start();
    }
    
    public void start() {
        try {
            System.out.println("=== File Server Client ===");
            System.out.print("Enter username: ");
            username = userInput.readLine();
            
            // Connect to server
            socket = new Socket(SERVER_HOST, SERVER_PORT);
            
            // Get raw streams (no BufferedReader to avoid buffering conflicts)
            InputStream rawIn = socket.getInputStream();
            OutputStream rawOut = socket.getOutputStream();
            
            dataIn = new DataInputStream(rawIn);
            dataOut = new DataOutputStream(rawOut);
            out = new PrintWriter(rawOut, true);
            
            // Send username
            out.println(username);
            out.flush();
            
            // Wait for response using DataInputStream
            String response = readLine(dataIn);
            
            if (response.startsWith("ERROR")) {
                System.out.println("Login failed: " + response.split(":", 2)[1]);
                socket.close();
                return;
            }
            
            System.out.println(response.split(":", 2)[1]);
            
            // Start message listener thread
            new Thread(this::listenForMessages).start();
            
            // Main menu loop
            mainMenu();
            
        } catch (IOException e) {
            System.err.println("Connection error: " + e.getMessage());
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
            if (c != '\r') {  // Skip \r
                sb.append((char) c);
            }
        }
        return sb.length() > 0 || c != -1 ? sb.toString() : null;
    }
    
    private void listenForMessages() {
        try {
            while (true) {
                // Pause if in binary mode (download/upload in progress)
                if (binaryMode) {
                    Thread.sleep(50);
                    continue;
                }
                
                // Check if data is available before attempting to read
                if (dataIn.available() > 0) {
                    String line = readLine(dataIn);
                    if (line == null) break;
                    
                    if (line.startsWith("NEW_MESSAGE:")) {
                        System.out.println("\n[NOTIFICATION] " + line.substring(12));
                        System.out.print("> ");
                    } else {
                        // Put other responses in queue for command methods to read
                        responseQueue.offer(line);
                    }
                } else {
                    // No data available, sleep briefly to avoid busy-waiting
                    Thread.sleep(50);
                }
            }
        } catch (IOException e) {
            // Connection closed
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
    
    private void mainMenu() {
        try {
            while (true) {
                System.out.println("\n=== Main Menu ===");
                System.out.println("1. List all clients");
                System.out.println("2. List my files");
                System.out.println("3. List public files of other clients");
                System.out.println("4. Upload file");
                System.out.println("5. Download file");
                System.out.println("6. Make file request");
                System.out.println("7. View unread messages");
                System.out.println("8. View upload/download history");
                System.out.println("9. Logout");
                System.out.print("> ");
                
                String choice = userInput.readLine();
                
                switch (choice) {
                    case "1":
                        listClients();
                        break;
                    case "2":
                        listOwnFiles();
                        break;
                    case "3":
                        listPublicFiles();
                        break;
                    case "4":
                        uploadFile();
                        break;
                    case "5":
                        downloadFile();
                        break;
                    case "6":
                        makeFileRequest();
                        break;
                    case "7":
                        viewMessages();
                        break;
                    case "8":
                        viewHistory();
                        break;
                    case "9":
                        logout();
                        return;
                    default:
                        System.out.println("Invalid choice");
                }
            }
        } catch (IOException | InterruptedException e) {
            System.err.println("Error: " + e.getMessage());
        }
    }
    
    private void listClients() throws IOException {
        out.println("LIST_CLIENTS:");
        out.flush();
        //System.out.println("DEBUG: Waiting for server response...");
        String response = null;
        try {
            response = responseQueue.poll(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        //System.out.println("DEBUG: Received response: " + response);
        
        if (response != null && response.startsWith("CLIENT_LIST:")) {
            String clientData = response.substring(12);
            if (clientData.isEmpty()) {
                System.out.println("\nNo clients found");
            } else {
                String[] clients = clientData.split(",");
                System.out.println("\n=== Client List ===");
                for (String client : clients) {
                    if (!client.isEmpty()) {
                        System.out.println("- " + client);
                    }
                }
            }
            System.out.println("\nPress Enter to continue...");
            userInput.readLine();
        } else {
            System.out.println("Error: Invalid response from server: " + response);
        }
    }
    
    private void listOwnFiles() throws IOException {
        out.println("LIST_OWN_FILES:");
        out.flush();
        String response = null;
        try {
            response = responseQueue.poll(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        
        if (response != null && response.startsWith("OWN_FILES:")) {
            String fileData = response.substring(10);
            if (fileData.isEmpty()) {
                System.out.println("\nNo files uploaded");
            } else {
                String[] files = fileData.split(";");
                System.out.println("\n=== My Files ===");
                for (String file : files) {
                    if (!file.isEmpty()) {
                        String[] parts = file.split("\\|");
                        String fileName = parts[0];
                        String access = parts[1];
                        String reqId = parts.length > 2 ? parts[2] : "";
                        
                        System.out.print("- " + fileName + " [" + access + "]");
                        if (!reqId.isEmpty()) {
                            System.out.print(" (Request: " + reqId + ")");
                        }
                        System.out.println();
                    }
                }
            }
            System.out.println("\nPress Enter to continue...");
            userInput.readLine();
        } else {
            System.out.println("Error: No response from server");
        }
    }
    
    private void listPublicFiles() throws IOException {
        System.out.print("Enter username: ");
        String targetUser = userInput.readLine();
        
        out.println("LIST_PUBLIC_FILES:" + targetUser);
        out.flush();
        String response = null;
        try {
            response = responseQueue.poll(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        
        if (response != null && response.startsWith("PUBLIC_FILES:")) {
            String fileData = response.substring(13);
            if (fileData.isEmpty()) {
                System.out.println("\nNo public files found for " + targetUser);
            } else {
                String[] files = fileData.split(";");
                System.out.println("\n=== Public Files of " + targetUser + " ===");
                for (String file : files) {
                    if (!file.isEmpty()) {
                        System.out.println("- " + file);
                    }
                }
            }
            System.out.println("\nPress Enter to continue...");
            userInput.readLine();
        } else {
            System.out.println("Error: No response from server");
        }
    }
    
    private void uploadFile() throws IOException, InterruptedException {
        System.out.print("Enter file path: ");
        String filePath = userInput.readLine();
        
        File file = new File(filePath);
        if (!file.exists()) {
            System.out.println("File not found!");
            return;
        }
        
        System.out.print("Make file public? (yes/no): ");
        String publicChoice = userInput.readLine();
        boolean isPublic = publicChoice.equalsIgnoreCase("yes");
        
        System.out.print("Is this in response to a request? (yes/no): ");
        String requestChoice = userInput.readLine();
        String requestId = "";
        
        if (requestChoice.equalsIgnoreCase("yes")) {
            System.out.print("Enter request ID: ");
            requestId = userInput.readLine();
            // Note: User's public/private choice is respected even for requested files
        }
        
        String fileName = file.getName(); // Extract file name from path
        long fileSize = file.length(); // Get file size
        
        // Send upload request
        out.println("UPLOAD_REQUEST:" + fileName + "|" + fileSize + "|" + isPublic + "|" + requestId);
        String response = responseQueue.take();
        
        if (response.startsWith("ERROR")) {
            System.out.println("Upload failed: " + response.split(":", 2)[1]);
            return;
        }
        
        if (response.startsWith("UPLOAD_APPROVED:")) {
            String[] parts = response.substring(16).split("\\|");
            String fileId = parts[0];
            int chunkSize = Integer.parseInt(parts[1]);
            
            System.out.println("Upload approved. Chunk size: " + chunkSize + " bytes");
            
            // Send file in chunks
            try (FileInputStream fis = new FileInputStream(file)) {
                byte[] buffer = new byte[chunkSize];
                int bytesRead;
                int chunkNum = 0;
                
                while ((bytesRead = fis.read(buffer)) != -1) {
                    chunkNum++;
                    
                    // Send chunk command
                    out.println("UPLOAD_CHUNK:" + fileId + "|" + bytesRead);
                    out.flush();  // CRITICAL: Flush text command before binary data
                    
                    // Enter binary mode before sending chunk data
                    binaryMode = true;
                    Thread.sleep(10);
                    
                    dataOut.write(buffer, 0, bytesRead);
                    dataOut.flush();
                    
                    // Exit binary mode to receive acknowledgment
                    binaryMode = false;
                    
                    // Wait for acknowledgment
                    String ack = responseQueue.take();
                    if (!ack.equals("CHUNK_ACK")) {
                        System.out.println("Error sending chunk " + chunkNum);
                        return;
                    }
                    
                    System.out.println("Chunk " + chunkNum + " sent (" + bytesRead + " bytes)");
                }
                
                // Send completion message
                out.println("UPLOAD_COMPLETE:" + fileId);
                
                String finalResponse = responseQueue.take();
                
                if (finalResponse.equals("UPLOAD_SUCCESS")) {
                    System.out.println("File uploaded successfully!");
                } else {
                    System.out.println("Upload failed: " + finalResponse);
                }
            }
        }
    }
    
    private void downloadFile() throws IOException, InterruptedException {
        System.out.print("Enter file owner username: ");
        String owner = userInput.readLine();
        
        System.out.print("Enter file name: ");
        String fileName = userInput.readLine();
        
        // Stop listener from interfering - set binary mode BEFORE sending request
        binaryMode = true;
        Thread.sleep(100);  // Ensure listener is paused
        
        out.println("DOWNLOAD_REQUEST:" + owner + "|" + fileName);
        out.flush();
        
        // Read response directly (listener is paused)
        String response = readLine(dataIn);
        
        if (response.startsWith("ERROR")) {
            System.out.println("Download failed: " + response.split(":", 2)[1]);
            binaryMode = false;  // Re-enable listener
            return;
        }
        
        if (response.startsWith("DOWNLOAD_START:")) {
            String[] parts = response.substring(15).split("\\|");
            String downloadFileName = parts[0];
            long fileSize = Long.parseLong(parts[1]);
            
            System.out.println("Downloading " + downloadFileName + " (" + fileSize + " bytes)...");
           // System.out.println("[DEBUG] Starting to receive file data...");
            
            // Receive file
            File downloadFile = new File("downloads/" + downloadFileName);
            downloadFile.getParentFile().mkdirs();
            
            try (FileOutputStream fos = new FileOutputStream(downloadFile)) {
                long totalReceived = 0;
                
                while (totalReceived < fileSize) {
                    //System.out.println("[DEBUG] Attempting to read chunk size...");
                    int chunkSize = dataIn.readInt();
                    //System.out.println("[DEBUG] Read chunk size: " + chunkSize);
                    byte[] buffer = new byte[chunkSize];
                    int bytesRead = 0;
                    
                    while (bytesRead < chunkSize) {
                        int read = dataIn.read(buffer, bytesRead, chunkSize - bytesRead);
                        if (read == -1) break;
                        bytesRead += read;
                    }
                    
                    fos.write(buffer, 0, bytesRead);
                    totalReceived += bytesRead;
                    
                    System.out.println("Received: " + totalReceived + "/" + fileSize + " bytes");
                }
                
                // Read completion message directly
                String completion = readLine(dataIn);
                System.out.println("Completion message: " + completion);
                
                System.out.println("File downloaded successfully to: " + downloadFile.getAbsolutePath());
            } finally {
                // Exit binary mode to resume text listener
                binaryMode = false;
            }
        } else {
            binaryMode = false;  // Re-enable listener
        }
    }
    
    private void makeFileRequest() throws IOException, InterruptedException {
        System.out.print("Enter file description: ");
        String description = userInput.readLine();
        
        System.out.print("Enter recipient username (or 'ALL' for broadcast): ");
        String recipient = userInput.readLine();
        
        out.println("FILE_REQUEST:" + description + "|" + recipient);
        String response = responseQueue.take();
        
        if (response.startsWith("REQUEST_SENT:")) {
            String requestId = response.substring(13);
            System.out.println("File request sent! Request ID: " + requestId);
        }
    }
    
    private void viewMessages() throws IOException, InterruptedException {
        out.println("VIEW_MESSAGES:");
        String response = responseQueue.take();
        
        if (response.startsWith("MESSAGES:")) {
            String messageData = response.substring(9);
            if (messageData.isEmpty()) {
                System.out.println("No unread messages");
                return;
            }
            
            String[] messages = messageData.split(";");
            System.out.println("\n=== Unread Messages ===");
            for (String message : messages) {
                if (!message.isEmpty()) {
                    System.out.println("- " + message);
                }
            }
        }
    }
    
    private void viewHistory() throws IOException, InterruptedException {
        out.println("VIEW_HISTORY:");
        String response = responseQueue.take();
        
        if (response.startsWith("HISTORY:")) {
            String historyData = response.substring(8);
            if (historyData.isEmpty()) {
                System.out.println("No history found");
                return;
            }
            
            String[] entries = historyData.split(";");
            System.out.println("\n=== Upload/Download History ===");
            System.out.println(String.format("%-20s %-20s %-10s %-20s", "File", "Timestamp", "Action", "Status"));
            System.out.println("=".repeat(75));
            
            for (String entry : entries) {
                if (!entry.isEmpty()) {
                    String[] parts = entry.split("\\|");
                    System.out.println(String.format("%-20s %-20s %-10s %-20s", 
                        parts[0], parts[1], parts[2], parts[3]));
                }
            }
        }
    }
    
    private void logout() throws IOException {
        out.println("LOGOUT:");
        socket.close();
        System.out.println("Logged out successfully");
    }
}
