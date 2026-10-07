"""Controlled stand-ins for E2E service endpoints (issue #5486 tests).

Serves every listed port with HTTP 200 for any GET, except the Functions
port under specific modes:

- hang-fn: the Functions port accepts the connection and then never
  responds, modelling the wedged endpoint that used to hold the startup
  gate inside one readiness iteration.
- slow-fn: the Functions port answers 500 until READY_AT (epoch seconds),
  then answers 200, modelling slow-but-recoverable startup.

Usage:
    stub-servers.py <mode> <fn_port> <ready_at_epoch> <port>...
"""

import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODE = sys.argv[1]
FN_PORT = int(sys.argv[2])
READY_AT = float(sys.argv[3])
PORTS = [int(p) for p in sys.argv[4:]]


def make_handler(is_fn):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if is_fn and MODE == "hang-fn":
                time.sleep(300)
                body = b"too late"
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if is_fn and MODE == "slow-fn" and time.time() < READY_AT:
                body = b"warming up"
                self.send_response(500)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            body = b"ok"
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    return Handler


for port in PORTS:
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(port == FN_PORT))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

print("stub servers listening", flush=True)
threading.Event().wait()
