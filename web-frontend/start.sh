#!/bin/bash

echo "🚀 Starting File Server Web Frontend"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if npm dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Check if Java server is running
if ! lsof -i :8000 -P &> /dev/null; then
    echo "⚠️  Warning: Java server is not running on port 8000"
    echo "Please start the Java server first:"
    echo "  cd .. && java Server"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Start the web server
echo "🌐 Starting web server on http://localhost:3000"
echo "Press Ctrl+C to stop"
echo ""

npm start
