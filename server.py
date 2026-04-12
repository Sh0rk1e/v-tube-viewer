from __future__ import annotations

import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent
MODELS_DIR = ROOT / "models"
HOST = "127.0.0.1"
PORT = 8000


class VTStudioHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/models":
            self._send_models()
            return
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/upload-file":
            self._upload_file(parsed)
            return
        self.send_error(404, "Unknown endpoint")

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _send_models(self) -> None:
        MODELS_DIR.mkdir(exist_ok=True)

        models = sorted(
            path.relative_to(ROOT).as_posix()
            for path in MODELS_DIR.rglob("*.model3.json")
            if path.is_file()
        )

        payload = json.dumps({"models": models}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _upload_file(self, parsed) -> None:
        MODELS_DIR.mkdir(exist_ok=True)
        params = parse_qs(parsed.query)
        raw_path = params.get("path", [""])[0]
        if not raw_path:
            self.send_error(400, "Missing path")
            return

        target_path = (ROOT / raw_path).resolve()
        try:
            target_path.relative_to(ROOT)
        except ValueError:
            self.send_error(400, "Invalid path")
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        data = self.rfile.read(content_length)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(data)

        payload = json.dumps({"saved": target_path.relative_to(ROOT).as_posix()}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main() -> None:
    MODELS_DIR.mkdir(exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), VTStudioHandler)
    print(f"VT Mini Studio is running at http://{HOST}:{PORT}")
    print(f"Put your model folders in: {MODELS_DIR}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
