#!/bin/bash
#
echo "Starting OpenCode Desktop in server mode..."
# Start an opencode session in server mode
export OPENCODE_SERVER_PASSWORD=opencode 

# unset OPENCODE_SERVER_PASSWORD
echo Password for OpenCode Desktop server: $OPENCODE_SERVER_PASSWORD

#opencode serve --hostname 0.0.0.0 --port 4096
opencode web --hostname 0.0.0.0 --port 4096

#/mnt/c/Users/paul/AppData/Local/OpenCode/OpenCode.exe --remote "ws://localhost:4096" --password "opencode"