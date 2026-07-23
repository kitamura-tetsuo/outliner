#!/usr/bin/env bash
set -e

DISPLAY_NUM="${DISPLAY:-:99}"
RESOLUTION="${VNC_RESOLUTION:-1280x1024x24}"
VNC_PORT=5900
NOVNC_PORT=6080

echo "Starting VNC / noVNC environment on DISPLAY ${DISPLAY_NUM}..."

# 1. Start Xvfb (Virtual Framebuffer) if not already running on DISPLAY_NUM
if ! pgrep -f "Xvfb ${DISPLAY_NUM}" > /dev/null; then
    echo "Starting Xvfb on ${DISPLAY_NUM} with resolution ${RESOLUTION}..."
    Xvfb "${DISPLAY_NUM}" -screen 0 "${RESOLUTION}" > /dev/null 2>&1 &
    sleep 1
else
    echo "Xvfb is already running on ${DISPLAY_NUM}."
fi

# 2. Start Window Manager (fluxbox) if not already running
if ! pgrep -f "fluxbox" > /dev/null; then
    echo "Starting fluxbox window manager..."
    DISPLAY="${DISPLAY_NUM}" fluxbox > /dev/null 2>&1 &
    sleep 1
fi

# 3. Start x11vnc Server if not already running
if ! pgrep -f "x11vnc" > /dev/null; then
    echo "Starting x11vnc server on port ${VNC_PORT}..."
    x11vnc -display "${DISPLAY_NUM}" -forever -shared -nopw -rfbport "${VNC_PORT}" > /dev/null 2>&1 &
    sleep 1
fi

# 4. Start noVNC (websockify) if not already running
NOVNC_DIR=""
if [ -d "/usr/share/novnc" ]; then
    NOVNC_DIR="/usr/share/novnc"
elif [ -d "/usr/local/novnc" ]; then
    NOVNC_DIR="/usr/local/novnc"
fi

if ! pgrep -f "websockify" > /dev/null; then
    echo "Starting noVNC (websockify) on port ${NOVNC_PORT}..."
    if [ -n "${NOVNC_DIR}" ]; then
        websockify --web "${NOVNC_DIR}" "${NOVNC_PORT}" "localhost:${VNC_PORT}" > /dev/null 2>&1 &
    else
        websockify "${NOVNC_PORT}" "localhost:${VNC_PORT}" > /dev/null 2>&1 &
    fi
    sleep 1
fi

echo "========================================================="
echo " VNC & noVNC servers are running!"
echo " - DISPLAY: ${DISPLAY_NUM}"
echo " - VNC Server Port: ${VNC_PORT}"
echo " - noVNC Web UI: http://localhost:${NOVNC_PORT}/vnc.html"
echo "========================================================="
