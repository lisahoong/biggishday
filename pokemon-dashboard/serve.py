#!/usr/bin/env python3
"""Static file server for the Pokemon GO dashboard.

The dashboard fetches live data from raw.githubusercontent.com; some browsers
block that fetch from a file:// page (opaque origin), so serve over localhost.

Usage:  python3 serve.py [port]
"""
import os
import sys
import errno
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766

os.chdir(ROOT)


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    try:
        server = ThreadingHTTPServer(('127.0.0.1', PORT), partial(Handler, directory=ROOT))
    except OSError as e:
        if e.errno in (errno.EADDRINUSE, errno.EACCES):
            print(f'Already serving on port {PORT}.')
            sys.exit(0)
        raise
    with server:
        print(f'Pokemon Dashboard running at http://localhost:{PORT}')
        print('Press Ctrl+C to stop it.')
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
