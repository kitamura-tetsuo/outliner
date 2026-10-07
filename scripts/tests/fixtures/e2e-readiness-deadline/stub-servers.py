"""Controlled stand-ins for E2E service endpoints (issue #5486 tests).

Serves every listed port with HTTP 200 for any GET, except the Functions
port under specific modes:

- hang-fn: the Functions port accepts the connection and then never
  responds, modelling the wedged endpoint that used to hold the startup
  gate inside one readiness iteration.
- partial-fn: the Functions port sends HTTP 200 headers declaring a
  nonzero Content-Length and then never sends the promised body, modelling
  a stalled transfer where curl already knows the status code when its
  body read times out.
- slow-fn: the Functions port answers 500 until READY_AT (epoch seconds),
  then answers 200, modelling slow-but-recoverable startup.

Usage:
    stub-servers.py <mode> <fn_port> <ready_at_epoch> <port>...
"""

import socket
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


def serve_partial(port):
    """Send HTTP 200 headers with a declared body, then never send it."""
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", port))
    srv.listen(200)

    def handle(conn):
        try:
            conn.settimeout(10)
            conn.recv(4096)
            conn.sendall(
                b"HTTP/1.1 200 OK\r\n"
                b"Content-Length: 1024\r\n"
                b"Connection: close\r\n"
                b"\r\n"
            )
            time.sleep(300)
        except OSError:
            pass
        finally:
            try:
                conn.close()
            except OSError:
                pass

    while True:
        conn, _ = srv.accept()
        threading.Thread(target=handle, args=(conn,), daemon=True).start()


for port in PORTS:
    if port == FN_PORT and MODE == "partial-fn":
        thread = threading.Thread(target=serve_partial, args=(port,), daemon=True)
        thread.start()
        continue
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(port == FN_PORT))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

print("stub servers listening", flush=True)
threading.Event().wait()
