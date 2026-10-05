"""Exercise the actual gateway routing with local HTTP stubs and an NGINX binary."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import argparse
import json
import subprocess
import threading
import time
import urllib.error
import urllib.request
import os

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--nginx', default='nginx')
    args = parser.parse_args()
    work = ROOT / 'target/gateway-test'
    (work / 'logs').mkdir(parents=True, exist_ok=True)
    (work / 'temp').mkdir(exist_ok=True)
    servers = []
    config = (ROOT / 'gateway/nginx.conf').read_text()
    config = config.replace('include /etc/nginx/listeners/trading.conf;', 'listen 18420;')
    config = config.replace('include /etc/nginx/listeners/reporting.conf;', 'listen 18421;')
    config = config.replace('include /etc/nginx/routes/proxy-headers.conf;',
                            (ROOT / 'gateway/proxy-headers.conf').read_text())
    upstreams = {'holdings:8080': 18080, 'auth:8081': 18081, 'orders:8082': 18082,
                 'quote-service:8083': 18083, 'insights:8084': 18084,
                 'frontend:80': 18085, 'insights-frontend:80': 18086}
    for name, port in sorted(upstreams.items(), key=lambda entry: -len(entry[0])):
        config = config.replace(name, f'127.0.0.1:{port}')

        def handler_for(owner):
            class Handler(BaseHTTPRequestHandler):
                def do_GET(self):
                    body = json.dumps({'owner': owner, 'path': self.path, 'method': self.command}).encode()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Content-Length', str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                do_POST = do_GET
                def log_message(self, *_): pass
            return Handler

        server = ThreadingHTTPServer(('127.0.0.1', port), handler_for(name))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        servers.append(server)

    config = 'worker_processes 1;\nevents { worker_connections 128; }\nhttp {\n' + config + '\n}\n'
    (work / 'nginx.conf').write_text(config)
    command = [str(Path(args.nginx).resolve()) if Path(args.nginx).exists() else args.nginx,
               '-p', work.as_posix() + '/', '-c', 'nginx.conf']
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    subprocess.run(command + ['-t'], check=True, creationflags=flags)
    process = subprocess.Popen(command + ['-g', 'daemon off;'], creationflags=flags)
    try:
        cases = [
            (18420, 'GET', '/api/v1/orders?limit=5', 'holdings:8080'),
            (18420, 'POST', '/api/v1/orders', 'orders:8082'),
            (18420, 'GET', '/api/v1/holdings', 'holdings:8080'),
            (18420, 'GET', '/api/v1/accounts', 'holdings:8080'),
            (18420, 'GET', '/api/v1/instruments/test', 'holdings:8080'),
            (18420, 'GET', '/api/v1/quotes/AAPL', 'quote-service:8083'),
            (18420, 'GET', '/api/v1/quotes/latest/by-instrument/test', 'holdings:8080'),
            (18420, 'GET', '/api/v1/quotes/history/test?limit=5', 'holdings:8080'),
            (18420, 'GET', '/api/v1/clients/test/holdings', 'holdings:8080'),
            (18420, 'GET', '/api/v1/clients/test/portfolio-summary', 'holdings:8080'),
            (18421, 'GET', '/api/v1/clients/test/portfolio-summary', None),
            (18420, 'GET', '/api/v1/clients/test/cash', 'holdings:8080'),
            (18420, 'GET', '/api/v1/clients/test/orders?from=2026-09-01&status=FILLED', 'holdings:8080'),
            (18420, 'GET', '/api/v1/cash/balance/test', 'holdings:8080'),
            (18420, 'POST', '/auth/login', 'auth:8081'),
            (18420, 'GET', '/rules/tier-eligibility', 'auth:8081'),
            (18420, 'GET', '/', 'frontend:80'),
            (18421, 'GET', '/', 'insights-frontend:80'),
            (18421, 'GET', '/api/v1/reports/summary', 'insights:8084'),
            (18421, 'POST', '/auth/login', 'auth:8081'),
            (18421, 'POST', '/api/v1/orders', None),
            (18421, 'GET', '/api/v1/quotes/history/test', None),
            (18421, 'GET', '/api/v1/clients/test/orders', None),
            (18420, 'GET', '/api/v1/reports/summary', None),
            (18420, 'GET', '/api/orders/anything', None),
        ]
        for attempt in range(50):
            try:
                urllib.request.urlopen('http://127.0.0.1:18420/', timeout=1).close()
                break
            except OSError: time.sleep(.1)
        for port, method, path, expected in cases:
            req = urllib.request.Request(f'http://127.0.0.1:{port}{path}', method=method)
            try:
                with urllib.request.urlopen(req, timeout=5) as response:
                    body = json.load(response)
                    assert body == {'owner': expected, 'path': path, 'method': method}, body
            except urllib.error.HTTPError as error:
                assert expected is None and error.code == 404, (path, error.code)
        print(f'PASS: {len(cases)} gateway routing and isolation checks')
    finally:
        subprocess.run(command + ['-s', 'quit'], check=False, creationflags=flags)
        process.wait(timeout=10)
        for server in servers: server.shutdown()


if __name__ == '__main__':
    main()
