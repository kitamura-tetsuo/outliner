#!/bin/bash
set -e

echo "Setting up SSH..."

# SSH Setup
sudo mkdir -p /var/run/sshd
sudo mkdir -p /root/.ssh

# Setup root keys
sudo sh -c 'if [ -f /home/node/.ssh/id_rsa ]; then ssh-keygen -y -f /home/node/.ssh/id_rsa >> /root/.ssh/authorized_keys; fi; cat /home/node/.ssh/*.pub >> /root/.ssh/authorized_keys 2>/dev/null || true'
sudo chmod 600 /root/.ssh/authorized_keys

# Setup node user keys
mkdir -p /home/node/.ssh-local
sh -c 'if [ -f /home/node/.ssh/id_rsa ]; then ssh-keygen -y -f /home/node/.ssh/id_rsa >> /home/node/.ssh-local/authorized_keys; fi'
sh -c 'cat /home/node/.ssh/*.pub >> /home/node/.ssh-local/authorized_keys 2>/dev/null || true'
sh -c 'cat /home/node/.ssh/authorized_keys >> /home/node/.ssh-local/authorized_keys 2>/dev/null || true'
chown -R node:node /home/node/.ssh-local
chmod 700 /home/node/.ssh-local
chmod 600 /home/node/.ssh-local/authorized_keys

# Debug: Check if keys exist
echo "Checking authorized_keys content size:"
du -b /home/node/.ssh-local/authorized_keys || echo "File not found"

# Configure SSH to look for keys
echo 'AuthorizedKeysFile .ssh/authorized_keys .ssh-local/authorized_keys' | sudo tee -a /etc/ssh/sshd_config

# Start SSHD
echo "Starting SSHD..."
sudo /usr/sbin/sshd

sleep infinity