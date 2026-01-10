#!/bin/bash
# PM2 Management Script for Test Environment
#
# Usage:
#   ./pm2-manage.sh start     - Start all services via PM2
#   ./pm2-manage.sh stop      - Stop all services via PM2
#   ./pm2-manage.sh restart   - Restart all services via PM2
#   ./pm2-manage.sh status    - Show PM2 status
#   ./pm2-manage.sh logs      - Show logs for all services
#   ./pm2-manage.sh logs <svc> - Show logs for specific service
#   ./pm2-manage.sh clean     - Stop and delete all PM2 processes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Load common configuration
source "${SCRIPT_DIR}/common-config.sh"

case "${1:-help}" in
  start)
    echo "Starting all test services via PM2..."
    source "${SCRIPT_DIR}/common-functions.sh"
    pm2_start_all
    echo "All services started. Use 'pm2 status' to check."
    ;;

  stop)
    echo "Stopping all test services via PM2..."
    source "${SCRIPT_DIR}/common-functions.sh"
    pm2_stop_all
    echo "All services stopped."
    ;;

  restart)
    echo "Restarting all test services via PM2..."
    source "${SCRIPT_DIR}/common-functions.sh"
    pm2_restart_all
    echo "All services restarted."
    ;;

  status)
    echo "Test Environment PM2 Status:"
    echo "============================"
    cd "${ROOT_DIR}"
    if command -v pm2 >/dev/null 2>&1; then
      pm2 list
      echo ""
      echo "Service Endpoints:"
      echo "  - SvelteKit: http://localhost:${VITE_PORT}"
      echo "  - API: http://localhost:${TEST_API_PORT}"
      echo "  - Yjs WebSocket: ws://localhost:${TEST_YJS_PORT}"
      echo "  - Firebase Auth: http://localhost:${FIREBASE_AUTH_PORT}"
      echo "  - Firebase Firestore: http://localhost:${FIREBASE_FIRESTORE_PORT}"
      echo "  - Firebase Functions: http://localhost:${FIREBASE_FUNCTIONS_PORT}"
      echo "  - Firebase Hosting: http://localhost:${FIREBASE_HOSTING_PORT}"
      echo "  - Firebase Storage: http://localhost:${FIREBASE_STORAGE_PORT}"
    else
      echo "PM2 is not installed"
    fi
    ;;

  logs)
    cd "${ROOT_DIR}"
    if command -v pm2 >/dev/null 2>&1; then
      if [ -n "${2:-}" ]; then
        echo "Logs for ${2}:"
        pm2 logs "${2}" --lines 100 --nostream
      else
        echo "Logs for all services:"
        pm2 logs --lines 100 --nostream
      fi
    else
      echo "PM2 is not installed"
    fi
    ;;

  clean)
    echo "Stopping and cleaning up all PM2 processes..."
    cd "${ROOT_DIR}"
    if command -v pm2 >/dev/null 2>&1; then
      pm2 kill
      pm2 clean
      echo "All PM2 processes cleaned up."
    else
      echo "PM2 is not installed"
    fi
    ;;

  help|--help|-h|*)
    echo "PM2 Management Script for Test Environment"
    echo ""
    echo "Usage: $(basename "$0") <command>"
    echo ""
    echo "Commands:"
    echo "  start      Start all test services via PM2"
    echo "  stop       Stop all test services via PM2"
    echo "  restart    Restart all test services via PM2"
    echo "  status     Show PM2 status and endpoints"
    echo "  logs       Show logs for all services"
    echo "  logs <svc> Show logs for specific service"
    echo "  clean      Stop and delete all PM2 processes"
    echo "  help       Show this help message"
    echo ""
    echo "Services managed:"
    echo "  - firebase-emulator (Firebase emulators)"
    echo "  - yjs-server (Yjs WebSocket server)"
    echo "  - sveltekit-server (SvelteKit dev server)"
    echo "  - api-server (API server)"
    ;;
esac
