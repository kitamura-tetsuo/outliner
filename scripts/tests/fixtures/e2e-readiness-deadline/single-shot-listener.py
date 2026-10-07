"""Expose exactly one connection after a successful test PM2 restart."""

import socket
import sys
from pathlib import Path

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("127.0.0.1", int(sys.argv[1])))
    server.listen(1)
    Path(sys.argv[2]).write_text("ready")
    connection, _ = server.accept()
    server.close()
    with connection:
        connection.settimeout(5)
        try:
            connection.recv(4096)
            connection.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
        except OSError:
            pass
