#!/usr/bin/env python3
"""Static file server for the wedding planner app.

The browser refuses to read or write local files from a file:// page (those are
treated as unique/opaque origins), so the app is served from localhost instead.

Usage:  python3 serve.py [port]
"""
import os
import sys
import errno
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765

os.chdir(ROOT)


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Local dev: always re-read from disk so edits show up on reload.
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass  # keep the launcher window quiet


if __name__ == '__main__':
    try:
        server = ThreadingHTTPServer(('127.0.0.1', PORT), partial(Handler, directory=ROOT))
    except OSError as e:
        if e.errno in (errno.EADDRINUSE, errno.EACCES):
            # Already running — the launcher will just open the browser at it.
            print(f'Already serving on port {PORT}.')
            sys.exit(0)
        raise
    with server:
        print(f'Wedding Planner running at http://localhost:{PORT}')
        print('Close this window to stop it.')
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
