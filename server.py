#!/usr/bin/env python3
"""Local dev server for gridgrind.

Serves the static app and persists progress straight to
data/progress.json in this repo on every save — nothing to remember to
export. Requires only the Python standard library.

Run: python3 server.py   (or double-click "Start gridgrind.command")
"""
import http.server
import json
import os
import socketserver
import sys
import urllib.request
import webbrowser

PORT = 8765
ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
DATA_FILE = os.path.join(DATA_DIR, "progress.json")


ANKI_URL = "http://127.0.0.1:8766"  # AnkiConnect (8765 is taken by this server)
ANKI_ROOT = "2. LeetCode Patterns"
PATTERN_COUNT = 41


def anki(action, **params):
    req = urllib.request.Request(ANKI_URL, json.dumps({"action": action, "version": 6, "params": params}).encode())
    res = json.load(urllib.request.urlopen(req, timeout=5))
    if res.get("error"):
        raise RuntimeError(res["error"])
    return res["result"]


def anki_status():
    """New (unseen, not suspended) and total cards per pattern deck "2. LeetCode Patterns::NN …"."""
    try:
        actions = []
        for n in range(1, PATTERN_COUNT + 1):
            deck = f'"deck:{ANKI_ROOT}::{n:02d} *"'
            actions.append({"action": "findCards", "params": {"query": f"{deck} is:new -is:suspended"}})
            actions.append({"action": "findCards", "params": {"query": deck}})
        res = anki("multi", actions=actions)
    except (OSError, RuntimeError, ValueError):
        return {"ok": False}
    patterns = {}
    for n in range(1, PATTERN_COUNT + 1):
        # inner actions without "version" come back as bare lists
        new, total = res[2 * n - 2], res[2 * n - 1]
        patterns[n] = {"left": len(new), "total": len(total)}
    return {"ok": True, "patterns": patterns}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        if self.path == "/load":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            if os.path.exists(DATA_FILE):
                with open(DATA_FILE, "rb") as f:
                    self.wfile.write(f.read())
            else:
                self.wfile.write(b"null")
            return
        if self.path == "/anki":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(anki_status()).encode())
            return
        super().do_GET()

    def do_POST(self):
        if self.path == "/save":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                self.send_response(400)
                self.end_headers()
                return
            os.makedirs(DATA_DIR, exist_ok=True)
            with open(DATA_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok": true}')
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        pass  # keep the terminal quiet


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        url = f"http://127.0.0.1:{PORT}/"
        print(f"gridgrind running at {url}")
        print("Progress auto-saves to data/progress.json — commit it whenever you like.")
        print("Ctrl+C to stop.")
        if "--no-browser" not in sys.argv:  # LaunchAgent runs it in the background
            webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
