#!/bin/bash

# Compile all Java files in the project

echo "Compiling File Server System..."
javac Server.java ClientHandler.java Client.java

if [ $? -eq 0 ]; then
    echo "✓ Compilation successful!"
    echo "You can now run:"
    echo "  - Server: java Server"
    echo "  - Client: java Client"
else
    echo "✗ Compilation failed!"
    exit 1
fi
