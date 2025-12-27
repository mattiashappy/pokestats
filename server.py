"""Minimal HTTP server for Heroku health checks.

Heroku expects a long-running web process that listens on ``$PORT`` so the
router can forward health and uptime probes. The importer itself is executed via
Heroku Scheduler, so this server only needs to return a small status payload.
"""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Tuple


def build_status_response() -> Tuple[int, dict, bytes]:
    """Build a simple JSON response body and headers.

    Returns a tuple of (status_code, headers, body_bytes) so the handler can keep
    the write logic small and testable.
    """

    payload = {
        "service": "pokestats-importer",
        "status": "ok",
    }
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Content-Length": str(len(body)),
    }
    return 200, headers, body


class HealthHandler(BaseHTTPRequestHandler):
    """Responds to any GET request with a JSON health payload."""

    def do_GET(self) -> None:  # noqa: N802 (http.server naming convention)
        status_code, headers, body = build_status_response()
        self.send_response(status_code)
        for name, value in headers.items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        """Reduce noisy logs; keep the default behavior otherwise."""

        super().log_message(format, *args)


def main() -> None:
    port = int(os.getenv("PORT", "8000"))
    server = HTTPServer(("0.0.0.0", port), HealthHandler)
    print(f"Serving health endpoint on port {port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
