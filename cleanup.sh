#!/bin/bash

# Cleanup script to remove files created during runtime

echo "Starting cleanup..."

# Remove compiled .class files
echo "Removing compiled .class files..."
find . -name "*.class" -type f -delete

# Clean server_data directory (keep directory structure but remove generated files)
echo "Cleaning server_data directory..."
if [ -d "server_data" ]; then
    # Remove all files in user subdirectories but keep the directories
    find server_data -type f -delete
    # Optionally, remove empty subdirectories (uncomment if needed)
    # find server_data -type d -empty -delete
fi

# Clean downloads directory
echo "Cleaning downloads directory..."
if [ -d "downloads" ]; then
    rm -rf downloads/*
fi

# Remove any temporary or log files created in root directory
echo "Cleaning root directory files..."
# Add specific files created during runtime if any
# rm -f text.txt A1.txt C.txt  # Uncomment if these are runtime files

echo "Cleanup complete!"
echo ""
echo "The following were cleaned:"
echo "  - Compiled .class files"
echo "  - Files in server_data subdirectories"
echo "  - Files in downloads directory"
