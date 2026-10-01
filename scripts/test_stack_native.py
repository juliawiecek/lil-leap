#!/usr/bin/env python3
"""Real HTTP integration through NGINX, Identity, three Java APIs and Quotes.

Requires built Java jars, auth/dist, psycopg, Flask and quote dependencies, plus
PostgreSQL binaries and NGINX. Creates isolated primary/standby clusters under
target; never touches a developer database. Native verification is not Docker/CI
evidence. Test-only accounts are explicitly activated/funded by the fixture.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid

import psycopg

ROOT = Path(__file__).resolve().parents[1]
FLAGS = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def http(port, path, method="GET", body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(f"http://127.0.0.1:{port}{path}",
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers=headers, method=method)
    try:
        response = urllib.request.urlopen(request, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        raw = response.read().decode()
        try:
            content = json.loads(raw)
        except ValueError:
            content = raw
        return response.status, content


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-bin", required=True)
    parser.add_argument("--nginx", required=True)
    parser.add_argument("--java-home", default=os.getenv("JAVA_HOME"), required=not os.getenv("JAVA_HOME"))
    parser.add_argument("--bash", default=shutil.which("bash"))
    args = parser.parse_args()
    if not args.bash:
        parser.error("--bash is required to exercise the production database role scripts")
    pg = Path(args.postgres_bin)
    exe = ".exe" if os.name == "nt" else ""
    # Inherit the workspace ACL: PostgreSQL drops the Administrator SID on Windows.
    # Python's private tempfile ACL would prevent that restricted child from entering.
    workspace = ROOT / "target" / ("native-stack-" + uuid.uuid4().hex[:12])
    workspace.mkdir(parents=True)
    print(f"Isolated fixture/logs: {workspace.relative_to(ROOT)}", flush=True)
    ports = {name: free_port() for name in ("primary", "replica", "auth", "holdings", "orders", "quotes", "insights", "trading", "reporting")}
    processes, logs, clusters = [], [], []
    env = os.environ.copy()
    env.update(PATH=str(pg) + os.pathsep + env["PATH"], PGHOST="127.0.0.1",
               PGPORT=str(ports["primary"]), POSTGRES_USER="po_owner", POSTGRES_DB="nexttrade",
               DB_HOST="127.0.0.1", DB_PORT=str(ports["primary"]), DB_NAME="nexttrade",
               DB_APP_USERNAME="app_user", DB_APP_PASSWORD=secrets.token_hex(24),
               REPORTING_DB_PASSWORD=secrets.token_hex(24), REPLICATION_PASSWORD=secrets.token_hex(24),
               APP_JWT_SECRET=secrets.token_hex(32), NEXTTRADE_SECURITY_SSN_ENCRYPTION_KEY=secrets.token_hex(32))
    setup_log = (workspace / "setup.txt").open("w", encoding="utf-8")
    logs.append(setup_log)

    def run(command, extra=None):
        subprocess.run([str(x) for x in command], env=extra or env, cwd=ROOT,
                       stdout=setup_log, stderr=subprocess.STDOUT, check=True, creationflags=FLAGS, timeout=120)

    def start(name, command, cwd=ROOT, overrides=None):
        log = (workspace / f"{name}.txt").open("w", encoding="utf-8")
        logs.append(log)
        process = subprocess.Popen([str(x) for x in command], cwd=cwd, env={**env, **(overrides or {})},
                                   stdout=log, stderr=subprocess.STDOUT, creationflags=FLAGS)
        processes.append(process)
        return process

    def sql(statement, params=None, replica=False, role="po_owner"):
        with psycopg.connect(host="127.0.0.1", port=ports["replica" if replica else "primary"],
                            dbname="nexttrade", user=role, autocommit=True) as connection:
            with connection.cursor() as cursor:
                cursor.execute(statement, params)
                return cursor.fetchall() if cursor.description else []

    def check(label, actual, expected):
        assert actual == expected, f"{label}: expected {expected!r}, got {actual!r}"
        print("PASS " + label, flush=True)

    def wait_for(predicate, label, timeout=120):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                if predicate():
                    return
            except (OSError, psycopg.Error):
                pass
            time.sleep(.5)
        raise AssertionError("Timed out: " + label)

    try:
        primary = workspace / "primary"
        run([pg / ("initdb" + exe), "-D", primary, "-U", "po_owner", "-A", "trust", "--no-locale", "-E", "UTF8"])
        run([pg / ("pg_ctl" + exe), "-D", primary, "-l", workspace / "primary.log", "-o",
             f"-h 127.0.0.1 -p {ports['primary']} -c wal_level=replica -c max_wal_senders=5 -c max_replication_slots=5", "-w", "start"])
        clusters.append(primary)
        run([pg / ("createdb" + exe), "-U", "po_owner", "nexttrade"])
        run([pg / ("psql" + exe), "-U", "po_owner", "-d", "nexttrade", "-v", "ON_ERROR_STOP=1", "-f", ROOT / "db/finalized-schema.sql"])
        run([args.bash, "db/init-app-role.sh"])
        run([args.bash, "db/init-reporting.sh"], {**env, "PGDATA": str(primary).replace("\\", "/")})
        run([pg / ("psql" + exe), "-U", "po_owner", "-d", "nexttrade", "-v", "ON_ERROR_STOP=1", "-f", ROOT / "db/seeds/001_us_equity_instruments.sql"])
        replica = workspace / "replica"
        run([pg / ("pg_basebackup" + exe), "-D", replica, "-U", "replicator", "-R", "-X", "stream", "--checkpoint=fast"])
        run([pg / ("pg_ctl" + exe), "-D", replica, "-l", workspace / "replica.log", "-o", f"-h 127.0.0.1 -p {ports['replica']}", "-w", "start"])
        clusters.append(replica)
        check("reporting server is a physical standby", sql("SELECT pg_is_in_recovery()", replica=True)[0][0], True)
        run([pg / ("psql" + exe), "-U", "po_owner", "-d", "nexttrade", "-v", "ON_ERROR_STOP=1", "-f", ROOT / "db/tests/008_reporting_read_only.sql"])
        print("PASS reporting role rejects writes and credential reads on primary", flush=True)
        for module, name, jar in (("nextTrade-orders", "orders", "nexttrade-orders.jar"), ("nextTrade-holdings", "holdings", "nexttrade-holdings.jar"), ("insights", "insights", "insights.jar")):
            overrides = {"PORT": str(ports[name])}
            if name == "insights":
                overrides.update(REPORTING_DB_HOST="127.0.0.1", REPORTING_DB_USERNAME="reporting_user", DB_PORT=str(ports["replica"]))
            start(name, [Path(args.java_home) / "bin" / ("java" + exe), "-jar", ROOT / module / "target" / jar], overrides=overrides)
        start("auth", [shutil.which("node"), "dist/main.js"], ROOT / "auth", {"PORT": str(ports["auth"])})
        start("quotes", [sys.executable, "-m", "src.service_runner"], ROOT / "data-pipeline",
              {"PORT": str(ports["quotes"]), "QUOTE_PROVIDER": "postgres", "QUOTE_INTERVAL_SECONDS": "1", "QUOTE_PERIODS": "5"})
        for name, path in (("auth", "/health"), ("quotes", "/health"), ("holdings", "/api/v1/holdings"), ("orders", "/api/v1/orders"), ("insights", "/api/v1/reports/summary")):
            wait_for(lambda n=name, p=path: http(ports[n], p)[0] in (200, 401, 403, 405), name)
        routes = (ROOT / "gateway/nginx.conf").read_text()
        routes = routes.replace("resolver 127.0.0.11 valid=10s ipv6=off;", "")
        for name, service, port in (("auth", "auth", 8081), ("holdings", "holdings", 8080), ("orders", "orders", 8082), ("quotes", "quote-service", 8083), ("insights", "insights", 8084)):
            routes = routes.replace(f"{service}:{port}", f"127.0.0.1:{ports[name]}")
        for name in ("trading", "reporting"):
            routes = routes.replace(f"include /etc/nginx/listeners/{name}.conf;", f"listen 127.0.0.1:{ports[name]};")
        routes = routes.replace("include /etc/nginx/routes/proxy-headers.conf;", (ROOT / "gateway/proxy-headers.conf").read_text())
        routes = routes.replace("location / { proxy_pass http://frontend:80; }", "location / { return 204; }")
        routes = routes.replace("location / { proxy_pass http://insights-frontend:80; }", "location / { return 204; }")
        (workspace / "logs").mkdir()
        (workspace / "temp").mkdir()
        (workspace / "nginx.conf").write_text("events {}\nhttp { access_log off;\n" + routes + "\n}\n")
        nginx_command = [args.nginx, "-p", workspace.as_posix() + "/", "-c", "nginx.conf"]
        start("gateway", nginx_command)
        wait_for(lambda: http(ports["trading"], "/")[0] == 204, "gateway")
        t, r = ports["trading"], ports["reporting"]
        check("missing token", http(t, "/api/v1/holdings")[0], 401)
        email = f"po-{uuid.uuid4()}@example.com"
        password = secrets.token_urlsafe(24)
        registration = dict(user_role="TRADER", email=email, password=password, first_name="Test", last_name="Fixture",
                            date_of_birth="1990-01-01", phone="555-0100", street_address="1 Test Way", city="Test",
                            state_province="NY", postal_code="10001", country="US", citizenship_status="CITIZEN", ssn="123456789",
                            employment_status="RETIRED", annual_income="50000", net_worth_bracket="$25k-100k", risk_profile="MODERATE",
                            liquidity_position="10000", accredited_investor=False, is_politically_exposed_person=False,
                            account_name="Fixture", account_type="INDIVIDUAL_CASH")
        check("real Identity registration through gateway", http(t, "/auth/register", "POST", registration)[0], 201)
        status, login = http(t, "/auth/login", "POST", dict(email=email, password=password))
        check("real Identity login", status, 200)
        token = login["accessToken"]
        user, account = sql("SELECT u.user_id,a.account_id FROM users u JOIN accounts a USING(user_id) WHERE email=%s", (email,))[0]
        check("Identity token accepted by Holdings", http(t, "/api/v1/holdings", token=token)[0], 200)
        check("tampered token", http(t, "/api/v1/holdings", token=token+"x")[0], 401)
        check("invalid order body", http(t, "/api/v1/orders", "POST", {}, token)[0], 400)
        check("trader cannot report", http(r, "/api/v1/reports/summary", token=token)[0], 403)
        check("reporting gateway cannot trade", http(r, "/api/v1/orders", "POST", {}, token)[0], 404)
        check("trading gateway cannot report", http(t, "/api/v1/reports/summary", token=token)[0], 404)
        other_user, other_account = uuid.uuid4(), uuid.uuid4()
        sql("INSERT INTO users(user_id,email,password_hash) VALUES (%s,%s,'fixture-unusable')", (other_user, f"other-{other_user}@example.com"))
        sql("INSERT INTO accounts(account_id,user_id,account_number,account_name) VALUES (%s,%s,%s,'Fixture')", (other_account, other_user, other_account.hex[:24]))
        check("Holdings caller ownership", http(t, f"/api/v1/clients/{other_user}/orders", token=token)[0], 404)
        order = dict(accountId=str(account), symbol="AAPL", clientReference=str(uuid.uuid4()), side="BUY", quantity=1, orderType="MARKET")
        check("Orders caller ownership", http(t, "/api/v1/orders", "POST", {**order, "accountId":str(other_account)}, token)[0], 404)
        sql("UPDATE accounts SET account_status='ACTIVE',trading_enabled=true WHERE account_id=%s", (account,))
        sql("UPDATE financial_profiles SET kyc_status='VERIFIED' WHERE user_id=%s", (user,))
        sql("INSERT INTO cash_balances(account_id,balance) VALUES (%s,100000) ON CONFLICT(account_id) DO UPDATE SET balance=100000", (account,))
        wait_for(lambda: http(t, "/api/v1/quotes/AAPL")[0] == 200, "live persisted quote")
        print("PASS quote ingestion and API through gateway", flush=True)
        status, submitted = http(t, "/api/v1/orders", "POST", order, token)
        check("positive order submission", status, 201)
        wait_for(lambda: sql("SELECT status FROM orders WHERE client_reference=%s", (order["clientReference"],)) == [("FILLED",)], "asynchronous settlement")
        check("one fill", sql("SELECT count(*) FROM fills f JOIN orders o USING(order_id) WHERE o.client_reference=%s", (order["clientReference"],))[0][0], 1)
        holdings = http(t, "/api/v1/holdings", token=token)
        check("settled Holdings API", holdings[0], 200)
        assert holdings[1], "settled holding missing"
        print("PASS persisted order fills and Holdings read", flush=True)
        analyst = f"analyst-{uuid.uuid4()}@example.com"
        # employee_id is capped at 30 chars by the Auth registration DTO.
        analyst_employee_id = uuid.uuid4().hex[:30]
        check("analyst registration", http(r, "/auth/register", "POST", dict(user_role="ANALYST", email=analyst, password=password, employee_id=analyst_employee_id))[0], 201)
        status, login = http(r, "/auth/login", "POST", dict(email=analyst,password=password))
        check("analyst login", status, 200)
        analyst_token = login["accessToken"]
        check("analyst cannot trade", http(t, "/api/v1/orders", "POST", order, analyst_token)[0], 403)
        check("analyst reporting API", http(r, "/api/v1/reports/summary", token=analyst_token)[0], 200)
        wait_for(lambda: sql("SELECT count(*) FROM fills", replica=True, role="reporting_user")[0][0] == 1, "fill replication")
        print("PASS settled fill propagated to read-only reporting replica", flush=True)
        print("PASS native six-service integration (not Docker/Jenkins evidence)", flush=True)
    finally:
        if 'nginx_command' in locals():
            subprocess.run(nginx_command + ["-s", "quit"], stdout=setup_log, stderr=subprocess.STDOUT, creationflags=FLAGS)
        for process in reversed(processes):
            if process.poll() is None:
                if os.name == "nt":
                    subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], stdout=setup_log, stderr=subprocess.STDOUT, creationflags=FLAGS)
                else:
                    process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
        for cluster in reversed(clusters):
            subprocess.run([str(pg / ("pg_ctl" + exe)), "-D", str(cluster), "-m", "fast", "-w", "stop"], stdout=setup_log, stderr=subprocess.STDOUT, creationflags=FLAGS)
        for log in logs:
            log.close()


if __name__ == "__main__":
    main()
