"""開発用の静的サーバー（キャッシュ無効）。

  python3 tools/devserver.py      →  http://127.0.0.1:8765/newtab.html?mock

拡張の外で画面を確認するためのもの。?mock を付けるとダミーデータで表示する。
（?mock なしだとブラウザの CORS 制限で相場データは取得できない）
"""
import functools
import http.server
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(NoCache, directory=ROOT)
    http.server.ThreadingHTTPServer(("127.0.0.1", 8765), handler).serve_forever()
