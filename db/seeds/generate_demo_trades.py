"""Generate the demo seed data and the matching insights reporting CSV.

One deterministic trade book feeds three committed files, so they never drift:

  db/seeds/001_us_equity_instruments.sql      instrument universe (fixed ids)
  db/seeds/003_demo_trading_activity.sql      demo clients, accounts and trade book
  insights/src/main/resources/reports/trades.csv  BR-16 report dataset (every seeded fill)

Instrument markets and reference prices come from the quote catalog
(nextTrade-holdings/src/main/resources/marketdata/instrument-catalog.csv), so seeded
fills sit near live quotes.

The SQL book is relative: day offset 0 is the UTC day the database is seeded.
The CSV is the same book anchored at ANCHOR_DATE. Re-anchor it with --anchor.

Usage (from the repository root, standard library only):
  python db/seeds/generate_demo_trades.py            regenerate all three files
  python db/seeds/generate_demo_trades.py --check    fail if a committed file is stale
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import random
import sys
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


CATALOG_CSV = REPO / "nextTrade-holdings/src/main/resources/marketdata/instrument-catalog.csv"


@dataclass(frozen=True)
class CatalogStock:
    symbol: str
    market_code: str
    start_price: float


def _load_catalog() -> tuple[CatalogStock, ...]:
    # Holdings generates live quotes from the same file, so seeded fills sit near live prices.
    with CATALOG_CSV.open(newline="", encoding="utf-8") as handle:
        return tuple(CatalogStock(row["symbol"], row["market_code"], float(row["start_price"]))
                     for row in csv.DictReader(handle))


COMMON_STOCKS = _load_catalog()

INSTRUMENTS_SQL = REPO / "db/seeds/001_us_equity_instruments.sql"
TRADES_SQL = REPO / "db/seeds/003_demo_trading_activity.sql"
TRADES_CSV = REPO / "insights/src/main/resources/reports/trades.csv"

ANCHOR_DATE = date(2026, 10, 16)
SEED = 20261016
HISTORY_WEEKDAYS = 10      # trading days of history before "today"
TODAY_FILLS = 60           # requirement: at least 50 fills on the current day

# Display metadata the catalog does not carry.
INSTRUMENT_INFO = {
    "AAPL": ("Apple Inc.", "Technology"),
    "MSFT": ("Microsoft Corporation", "Technology"),
    "NVDA": ("NVIDIA Corporation", "Technology"),
    "AMZN": ("Amazon.com, Inc.", "Consumer Discretionary"),
    "GOOGL": ("Alphabet Inc.", "Communication Services"),
    "META": ("Meta Platforms, Inc.", "Communication Services"),
    "TSLA": ("Tesla, Inc.", "Consumer Discretionary"),
    "AVGO": ("Broadcom Inc.", "Technology"),
    "AMD": ("Advanced Micro Devices, Inc.", "Technology"),
    "NFLX": ("Netflix, Inc.", "Communication Services"),
    "COST": ("Costco Wholesale Corporation", "Consumer Staples"),
    "ADBE": ("Adobe Inc.", "Technology"),
    "PEP": ("PepsiCo, Inc.", "Consumer Staples"),
    "INTC": ("Intel Corporation", "Technology"),
    "JPM": ("JPMorgan Chase & Co.", "Financials"),
    "V": ("Visa Inc.", "Financials"),
    "BAC": ("Bank of America Corporation", "Financials"),
    "GS": ("The Goldman Sachs Group, Inc.", "Financials"),
    "XOM": ("Exxon Mobil Corporation", "Energy"),
    "CVX": ("Chevron Corporation", "Energy"),
    "JNJ": ("Johnson & Johnson", "Health Care"),
    "UNH": ("UnitedHealth Group Incorporated", "Health Care"),
    "PFE": ("Pfizer Inc.", "Health Care"),
    "LLY": ("Eli Lilly and Company", "Health Care"),
    "WMT": ("Walmart Inc.", "Consumer Staples"),
    "KO": ("The Coca-Cola Company", "Consumer Staples"),
    "PG": ("The Procter & Gamble Company", "Consumer Staples"),
    "HD": ("The Home Depot, Inc.", "Consumer Discretionary"),
    "DIS": ("The Walt Disney Company", "Communication Services"),
    "CAT": ("Caterpillar Inc.", "Industrials"),
    "BA": ("The Boeing Company", "Industrials"),
    "NEE": ("NextEra Energy, Inc.", "Utilities"),
    "PLD": ("Prologis, Inc.", "Real Estate"),
}

# Heavier weights for the names retail flow concentrates on.
POPULAR = {"AAPL": 5, "NVDA": 5, "TSLA": 4, "MSFT": 4, "AMZN": 3, "META": 3, "GOOGL": 3, "AMD": 3, "JPM": 2}

REJECTION_REASONS = ("INSUFFICIENT_CASH", "PRICE_OUT_OF_TOLERANCE", "NO_QUOTE_AVAILABLE", "INSUFFICIENT_HOLDINGS")

MIN_BALANCE = {"NOVICE": Decimal("5000.00"), "ADVANCED": Decimal("100000.00")}
NOTIONAL_RANGE = {"NOVICE": (400, 3500), "ADVANCED": (5000, 30000)}
BASE_DEPOSIT = {"NOVICE": Decimal("40000"), "ADVANCED": Decimal("600000")}

# Shared bcrypt hash of the team's test password (see 002_test_users.sql), so demo clients can log in too.
DEMO_PASSWORD_HASH = "{bcrypt}$2a$10$r61.WVDqMOCcMYtjIyQ84.cd4C/1nL2dBPU37BDiDcxMvt8PZkVBC"


@dataclass(frozen=True)
class Client:
    n: int
    first: str
    last: str
    tier: str
    status: str
    city: str
    dob: str
    net_worth: str
    risk: str
    occupation: str
    income: int

    @property
    def user_id(self) -> str:
        return f"d0000000-0000-4000-8000-{self.n:012d}"

    @property
    def account_id(self) -> str:
        return f"e0000000-0000-4000-8000-{self.n:012d}"

    @property
    def email(self) -> str:
        return f"{self.first.lower()}.{self.last.lower()}@demo.nexttrade.local"

    @property
    def account_number(self) -> str:
        return f"NT-DEMO-{self.n:04d}"


CLIENTS = (
    Client(1, "Maya", "Chen", "NOVICE", "ACTIVE", "Seattle, WA 98101", "1996-03-14", "$25k-100k", "MODERATE", "Product Designer", 92000),
    Client(2, "Jordan", "Alvarez", "ADVANCED", "ACTIVE", "Austin, TX 78701", "1983-07-22", "$500k+", "AGGRESSIVE", "Founder", 410000),
    Client(3, "Priya", "Raman", "ADVANCED", "ACTIVE", "Edison, NJ 08817", "1979-11-05", "$500k+", "MODERATE", "Physician", 365000),
    Client(4, "Samuel", "Okafor", "NOVICE", "ACTIVE", "Atlanta, GA 30303", "1998-01-30", "$5k-25k", "MODERATE", "Data Analyst", 71000),
    Client(5, "Elena", "Petrova", "ADVANCED", "ACTIVE", "Chicago, IL 60601", "1975-05-18", "$500k+", "AGGRESSIVE", "Hedge Fund Analyst", 520000),
    Client(6, "Marcus", "Reid", "NOVICE", "ACTIVE", "Denver, CO 80202", "1992-09-09", "$25k-100k", "AGGRESSIVE", "Electrician", 68000),
    Client(7, "Hana", "Sato", "NOVICE", "ACTIVE", "San Jose, CA 95113", "1994-12-02", "$25k-100k", "CONSERVATIVE", "Nurse", 98000),
    Client(8, "Diego", "Santos", "ADVANCED", "ACTIVE", "Miami, FL 33131", "1981-04-27", "$100k-500k", "AGGRESSIVE", "Real Estate Broker", 240000),
    Client(9, "Fatima", "Haddad", "ADVANCED", "ACTIVE", "Dearborn, MI 48126", "1986-08-13", "$500k+", "MODERATE", "Attorney", 300000),
    Client(10, "Liam", "Walsh", "NOVICE", "ACTIVE", "Boston, MA 02110", "1999-06-21", "$5k-25k", "MODERATE", "Teacher", 58000),
    Client(11, "Grace", "Kim", "ADVANCED", "ACTIVE", "Los Angeles, CA 90012", "1977-02-08", "$500k+", "CONSERVATIVE", "CFO", 450000),
    # Blocked after its early trades: shows up in reports but never trades today.
    Client(12, "Noah", "Bennett", "NOVICE", "BLOCKED", "Phoenix, AZ 85004", "1990-10-11", "$5k-25k", "AGGRESSIVE", "Sales Associate", 52000),
)
BLOCKED_AFTER_OFFSET = -7


@dataclass
class Trade:
    order_id: str
    client: Client
    symbol: str
    side: str
    quantity: int
    price: Decimal
    day_offset: int
    at: time
    reason: str | None = None

    @property
    def fill_id(self) -> str:
        return md5_uuid("seed-fill-" + self.order_id)


@dataclass
class AccountState:
    cash: Decimal
    positions: dict[str, int] = field(default_factory=dict)


def md5_uuid(text: str) -> str:
    """Same as PostgreSQL md5(text)::uuid."""
    return str(uuid.UUID(hashlib.md5(text.encode()).hexdigest()))


def instrument_id(market: str, symbol: str) -> str:
    return md5_uuid(f"instrument-{market}-{symbol}")


def money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def history_offsets() -> list[int]:
    offsets, day = [], ANCHOR_DATE
    while len(offsets) < HISTORY_WEEKDAYS:
        day -= timedelta(days=1)
        if day.weekday() < 5:
            offsets.append((day - ANCHOR_DATE).days)
    return sorted(offsets)


def market_times(rng: random.Random, count: int) -> list[time]:
    """Distinct minutes inside US regular hours (13:30-20:00 UTC during daylight time)."""
    minutes = sorted(rng.sample(range(13 * 60 + 31, 20 * 60), count))
    return [time(m // 60, m % 60, rng.randrange(0, 50)) for m in minutes]


def build_book() -> list[Trade]:
    rng = random.Random(SEED)
    stocks = {s.symbol: s for s in COMMON_STOCKS}
    symbols = sorted(stocks)
    weights = [POPULAR.get(s, 1) for s in symbols]
    state = {c.n: AccountState(BASE_DEPOSIT[c.tier]) for c in CLIENTS}
    trades: list[Trade] = []
    next_order = iter(range(1, 10_000))
    days = history_offsets() + [0]
    # A small daily random walk around the catalog price; today ends at the catalog price.
    drift = {s: [rng.uniform(-0.03, 0.03) for _ in days] for s in symbols}

    def price_on(symbol: str, day_index: int) -> Decimal:
        walk = drift[symbol][day_index] * (len(days) - 1 - day_index) / len(days)
        noise = rng.uniform(-0.004, 0.004)
        return money(Decimal(str(stocks[symbol].start_price * (1 + walk + noise))))

    def order_id() -> str:
        return f"f0000000-0000-4000-8000-{next(next_order):012d}"

    for day_index, offset in enumerate(days):
        today = offset == 0
        fill_count = TODAY_FILLS if today else rng.randint(6, 10)
        rejects = 3 if today else rng.choice((0, 1, 1))
        active = [c for c in CLIENTS if c.status == "ACTIVE" or offset < BLOCKED_AFTER_OFFSET]
        bought_today: dict[tuple[int, str], int] = {}
        # Today covers the whole universe before repeating names.
        unseen = rng.sample(symbols, len(symbols)) if today else []
        slots = market_times(rng, fill_count + rejects)
        reject_slots = set(rng.sample(range(len(slots)), rejects))
        made = 0
        for slot_index, at in enumerate(slots):
            client = active[(slot_index + day_index) % len(active)] if today else rng.choice(active)
            account = state[client.n]
            if slot_index in reject_slots:
                symbol = rng.choices(symbols, weights)[0]
                price = price_on(symbol, day_index)
                quantity = max(1, int(rng.randint(*NOTIONAL_RANGE[client.tier]) / float(price)))
                trades.append(Trade(order_id(), client, symbol, rng.choice(("BUY", "SELL")), quantity, price,
                                    offset, at, rng.choice(REJECTION_REASONS)))
                continue
            # Today, sells only unwind shares bought earlier today, so today's slice never
            # nets short and can be replayed on later days without overselling.
            if today:
                sellable = {s: q for (n, s), q in bought_today.items() if n == client.n and q > 0}
            else:
                sellable = {s: q for s, q in account.positions.items() if q > 0}
            if sellable and rng.random() < (0.55 if today else 0.35):
                symbol = rng.choice(sorted(sellable))
                price = price_on(symbol, day_index)
                quantity = max(1, int(sellable[symbol] * rng.choice((0.25, 0.5, 0.5, 1.0))))
                side = "SELL"
            else:
                symbol = unseen.pop() if unseen else rng.choices(symbols, weights)[0]
                price = price_on(symbol, day_index)
                quantity = max(1, int(rng.randint(*NOTIONAL_RANGE[client.tier]) / float(price)))
                if account.cash - money(price * quantity) < MIN_BALANCE[client.tier]:
                    continue
                side = "BUY"
            notional = money(price * quantity)
            if side == "BUY":
                account.cash -= notional
                account.positions[symbol] = account.positions.get(symbol, 0) + quantity
                bought_today[(client.n, symbol)] = bought_today.get((client.n, symbol), 0) + quantity
            else:
                account.cash += notional
                account.positions[symbol] -= quantity
                if today:
                    bought_today[(client.n, symbol)] -= quantity
            trades.append(Trade(order_id(), client, symbol, side, quantity, price, offset, at))
            made += 1
        if today and made < 50:
            raise SystemExit(f"only {made} fills generated for today; adjust TODAY_FILLS")

    return trades


# Fills seeded by 002_test_users.sql (same ids and times-of-day), so the CSV covers every seeded fill.
TEST_USER_FILLS = (
    # order suffix, account n, symbol, side, quantity, price, days ago, time
    ("000000000001", 1, "AAPL", "BUY", 12, "220.00", 21, time(14, 35)),
    ("000000000002", 1, "AAPL", "SELL", 2, "226.00", 14, time(15, 10)),
    ("000000000003", 1, "MSFT", "BUY", 4, "505.00", 9, time(16, 20)),
    ("000000000101", 2, "AAPL", "BUY", 100, "221.50", 25, time(13, 45)),
    ("000000000102", 2, "MSFT", "BUY", 60, "502.00", 22, time(14, 5)),
    ("000000000103", 2, "NVDA", "BUY", 200, "168.25", 18, time(15, 40)),
    ("000000000104", 2, "AMZN", "BUY", 80, "231.10", 15, time(17, 15)),
    ("000000000105", 2, "NVDA", "SELL", 50, "176.40", 10, time(18, 30)),
    ("000000000106", 2, "GOOGL", "BUY", 70, "203.75", 6, time(19, 5)),
)
TEST_ACCOUNTS = {
    1: ("a0000000-0000-4000-8000-000000000001", "novice@nexttrade.local",
        "b0000000-0000-4000-8000-000000000001", "NT-DEV-0001", "NOVICE"),
    2: ("a0000000-0000-4000-8000-000000000002", "advanced@nexttrade.local",
        "b0000000-0000-4000-8000-000000000002", "NT-DEV-0002", "ADVANCED"),
}


def sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def render_instruments_sql() -> str:
    rows = ",\n".join(
        f"({sql_str(s.symbol)},{sql_str(INSTRUMENT_INFO[s.symbol][0])},'COMMON_STOCK',"
        f"{sql_str(s.market_code)},'USD',{sql_str(INSTRUMENT_INFO[s.symbol][1])},TRUE,TRUE)"
        for s in COMMON_STOCKS)
    return f"""-- GENERATED by db/seeds/generate_demo_trades.py from the quote catalog; edit there, then regenerate.
-- Idempotent current-MVP seed: synthetic US equities listed on NASDAQ and NYSE.
-- Ids are md5('instrument-<market>-<symbol>') so they match the insights reporting CSV.
-- A database seeded before fixed ids keeps its original ids (the conflict target is market + symbol).
INSERT INTO instruments(instrument_id, symbol, instrument_name, asset_class, market_code, currency, sector, enabled, tradable)
SELECT md5('instrument-' || v.market_code || '-' || v.symbol)::uuid, v.*
FROM (VALUES
{rows}
) AS v(symbol, instrument_name, asset_class, market_code, currency, sector, enabled, tradable)
ON CONFLICT (market_code, symbol) DO UPDATE SET
instrument_name=EXCLUDED.instrument_name, asset_class=EXCLUDED.asset_class, currency=EXCLUDED.currency,
sector=EXCLUDED.sector, enabled=EXCLUDED.enabled, tradable=EXCLUDED.tradable;
"""


def render_trades_sql(trades: list[Trade]) -> str:
    markets = {s.symbol: s.market_code for s in COMMON_STOCKS}
    users = ",\n".join(
        f"    ({sql_str(c.user_id)}, {sql_str(c.email)}, {sql_str(DEMO_PASSWORD_HASH)}, 'TRADER')" for c in CLIENTS)
    profiles = ",\n".join(
        f"    ('d1000000-0000-4000-8000-{c.n:012d}', {sql_str(c.user_id)}, {sql_str(c.first)}, {sql_str(c.last)}, "
        f"'+1 555 020 {c.n:04d}', {sql_str(f'{100 + c.n} Market Street, {c.city}')}, 'United States', "
        f"DATE '{c.dob}', pgp_sym_encrypt('9100000{c.n:02d}', current_setting('nexttrade.seed_ssn_key'), "
        f"'cipher-algo=aes256'), 'CITIZEN')" for c in CLIENTS)
    financial = ",\n".join(
        f"    ('d2000000-0000-4000-8000-{c.n:012d}', {sql_str(c.user_id)}, 'VERIFIED', "
        f"{'TRUE' if c.tier == 'ADVANCED' else 'FALSE'}, {sql_str(c.net_worth)}, {sql_str(c.risk)}, 'EMPLOYED', "
        f"'Demo Employer', {sql_str(c.occupation)}, {c.income}.00, 'Moderate', TRUE)" for c in CLIENTS)
    accounts = ",\n".join(
        f"    ({sql_str(c.account_id)}, {sql_str(c.user_id)}, {sql_str(c.account_number)}, "
        f"{sql_str(f'{c.first} {c.last} Individual')}, {sql_str(c.status)}, {sql_str(c.tier)}, "
        f"{MIN_BALANCE[c.tier]}, {'TRUE' if c.status == 'ACTIVE' else 'FALSE'}, CURRENT_TIMESTAMP - INTERVAL '45 days')"
        for c in CLIENTS)
    cash = ",\n".join(
        f"    ('e1000000-0000-4000-8000-{c.n:012d}', {sql_str(c.account_id)}, 'DEPOSIT', {BASE_DEPOSIT[c.tier]}.00, "
        f"CURRENT_TIMESTAMP - INTERVAL '45 days', CURRENT_TIMESTAMP - INTERVAL '45 days')" for c in CLIENTS)
    book = ",\n".join(
        f"    ({sql_str(t.order_id)}, {sql_str(t.client.account_id)}, {sql_str(markets[t.symbol])}, {sql_str(t.symbol)}, "
        f"{sql_str(t.side)}, {t.quantity}, {t.price}, {sql_str(t.reason) if t.reason else 'NULL'}, {t.day_offset}, "
        f"TIME '{t.at.isoformat()}')" for t in trades)
    emails = ", ".join(sql_str(c.email) for c in CLIENTS)
    user_ids = ", ".join(sql_str(c.user_id) for c in CLIENTS)
    fills = sum(1 for t in trades if t.reason is None)
    today = sum(1 for t in trades if t.reason is None and t.day_offset == 0)
    return f"""-- ==========================================================
-- GENERATED by db/seeds/generate_demo_trades.py; edit the generator, then regenerate.
-- Demo market activity for local development (DEV/DEMO ONLY).
--
-- {len(CLIENTS)} demo traders ({sum(c.tier == 'NOVICE' for c in CLIENTS)} NOVICE, {sum(c.tier == 'ADVANCED' for c in CLIENTS)} ADVANCED, one BLOCKED) and a {len(trades)}-order book:
-- {fills} fills and {len(trades) - fills} rejected orders over the last {HISTORY_WEEKDAYS} weekdays plus today,
-- with {today} fills today across the NASDAQ/NYSE universe in 001_us_equity_instruments.sql.
-- Demo logins: <first>.<last>@demo.nexttrade.local with the shared test password.
--
-- The insights reporting dataset (insights/src/main/resources/reports/trades.csv) holds the
-- same fills with the same ids, anchored at {ANCHOR_DATE.isoformat()}; here, day offset 0 is the UTC
-- day the book is first seeded.
--
-- Runs on an empty volume as /docker-entrypoint-initdb.d/06-demo-trading-activity.sql, and on
-- every db/setup-local.sql run. Idempotent: fixed ids plus ON CONFLICT DO NOTHING. When run on
-- a later day than the book was seeded, today's slice is replayed for the current day (derived
-- ids, ledger-safe: it never nets short), funded by a pre-market recurring deposit equal to the
-- day's net buying, so the insights dashboard always has today's trades and balances stay flat.
-- Holdings are projected by the holding_movements trigger; cash_balances is rebuilt from the ledger.
-- ==========================================================

-- SSN ciphertext must use the same key as auth (same lookup as 002_test_users.sql).
\\getenv ssn_key NEXTTRADE_SECURITY_SSN_ENCRYPTION_KEY
\\if :{{?ssn_key}}
\\else
\\getenv ssn_key SSN_ENCRYPTION_KEY
\\endif
\\if :{{?ssn_key}}
\\else
\\set ssn_key ''
\\endif
SELECT set_config('nexttrade.seed_ssn_key', COALESCE(NULLIF(:'ssn_key', ''), 'replace_me'), false) AS ssn_key_set \\gset

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM users
        WHERE LOWER(TRIM(email)) IN ({emails})
          AND user_id NOT IN ({user_ids})
    ) THEN
        RAISE EXCEPTION 'A demo user email is already registered with a different id; delete that user or use a fresh volume';
    END IF;
END $$;

INSERT INTO users (user_id, email, password_hash, user_role) VALUES
{users}
ON CONFLICT DO NOTHING;

INSERT INTO customer_profiles (profile_id, user_id, first_name, last_name, phone, address, country,
                               date_of_birth, ssn_encrypted, citizenship_status) VALUES
{profiles}
ON CONFLICT DO NOTHING;

INSERT INTO financial_profiles (financial_profile_id, user_id, kyc_status, accredited_investor, net_worth_bracket,
                                risk_profile, employment_status, employer_name, occupation, annual_income,
                                liquidity_position, funds_source_verified) VALUES
{financial}
ON CONFLICT DO NOTHING;

INSERT INTO accounts (account_id, user_id, account_number, account_name, account_status,
                      trader_level, min_balance_requirement, trading_enabled, created_at) VALUES
{accounts}
ON CONFLICT DO NOTHING;

INSERT INTO cash_transactions (transaction_id, account_id, transaction_type, amount, created_at, settled_at) VALUES
{cash}
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- Trade book. reason IS NULL means the order filled; otherwise it was rejected
-- at execution with that reason code. day_offset 0 is "today".
-- ----------------------------------------------------------
CREATE TEMP TABLE demo_book (
    order_id UUID, account_id UUID, market_code TEXT, symbol TEXT, side TEXT, quantity BIGINT,
    price NUMERIC(18,8), reason TEXT, day_offset INT, at_time TIME
) ON COMMIT DROP;

INSERT INTO demo_book VALUES
{book};

-- The UTC day the book was first seeded (today on a fresh database).
CREATE TEMP TABLE demo_anchor ON COMMIT DROP AS
SELECT COALESCE(
           (SELECT (o.submitted_at AT TIME ZONE 'UTC')::date - b.day_offset
            FROM orders o JOIN demo_book b USING (order_id)
            ORDER BY b.order_id LIMIT 1),
           (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date) AS anchor_day,
       (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AS today;

CREATE TEMP TABLE demo_orders ON COMMIT DROP AS
SELECT b.order_id, b.account_id, b.market_code, b.symbol, b.side, b.quantity, b.price, b.reason,
       ((a.anchor_day + b.day_offset) + b.at_time) AT TIME ZONE 'UTC' AS at
FROM demo_book b CROSS JOIN demo_anchor a;

-- Seeded on an earlier day: replay today's slice for the current day.
INSERT INTO demo_orders
SELECT md5('demo-replay-' || a.today || '-' || b.order_id)::uuid, b.account_id, b.market_code, b.symbol, b.side,
       b.quantity, b.price, b.reason, (a.today + b.at_time) AT TIME ZONE 'UTC'
FROM demo_book b CROSS JOIN demo_anchor a
WHERE b.day_offset = 0 AND a.anchor_day < a.today;

-- Recurring pre-market deposit that funds a replayed day's net buying.
INSERT INTO cash_transactions (transaction_id, account_id, transaction_type, amount, created_at, settled_at)
SELECT md5('demo-recurring-deposit-' || a.today || '-' || d.account_id)::uuid, d.account_id, 'DEPOSIT', d.outflow,
       (a.today + TIME '13:00') AT TIME ZONE 'UTC', (a.today + TIME '13:00') AT TIME ZONE 'UTC'
FROM (SELECT account_id, SUM(ROUND(quantity * price, 2) * CASE side WHEN 'BUY' THEN 1 ELSE -1 END) AS outflow
      FROM demo_book WHERE day_offset = 0 AND reason IS NULL GROUP BY account_id) d
CROSS JOIN demo_anchor a
WHERE a.anchor_day < a.today AND d.outflow > 0
ON CONFLICT DO NOTHING;

CREATE TEMP VIEW seed_demo_orders AS
SELECT o.*, i.instrument_id,
       md5('seed-fill-' || o.order_id)::uuid AS fill_id,
       ROUND(o.quantity * o.price, 2) * CASE o.side WHEN 'BUY' THEN -1 ELSE 1 END AS cash_delta
FROM demo_orders o
JOIN instruments i ON i.market_code = o.market_code AND i.symbol = o.symbol;

INSERT INTO orders (order_id, account_id, instrument_id, client_reference, side, quantity, order_type, status,
                    submitted_at, accepted_at, next_execution_at, execution_attempts, last_execution_error, updated_at)
SELECT order_id, account_id, instrument_id, md5('seed-client-ref-' || order_id)::uuid, side, quantity, 'MARKET',
       CASE WHEN reason IS NULL THEN 'FILLED' ELSE 'REJECTED' END,
       at, at + INTERVAL '1 second', at + INTERVAL '1 second', 1, reason, at + INTERVAL '2 seconds'
FROM seed_demo_orders
ON CONFLICT DO NOTHING;

INSERT INTO order_status_history (status_history_id, order_id, status, reason_code, occurred_at)
SELECT md5('seed-history-' || s.step || '-' || o.order_id)::uuid, o.order_id, s.status, s.reason_code,
       o.at + s.offset_seconds * INTERVAL '1 second'
FROM seed_demo_orders o
CROSS JOIN LATERAL (VALUES
    (1, 'SUBMITTED', 'SUBMISSION_VALIDATED', 0),
    (2, 'ACCEPTED', 'ORDER_ACCEPTED', 1),
    (3, CASE WHEN o.reason IS NULL THEN 'FILLED' ELSE 'REJECTED' END,
        COALESCE(o.reason, 'EXECUTION_SUCCESS'), 2)
) AS s(step, status, reason_code, offset_seconds)
ON CONFLICT DO NOTHING;

INSERT INTO fills (fill_id, order_id, filled_quantity, execution_price, quote_timestamp, filled_at)
SELECT fill_id, order_id, quantity, price, at + INTERVAL '1 second', at + INTERVAL '2 seconds'
FROM seed_demo_orders WHERE reason IS NULL
ON CONFLICT DO NOTHING;

-- Ordered by time so every sell follows the buys it unwinds (the trigger rejects negative holdings).
INSERT INTO holding_movements (movement_id, account_id, instrument_id, fill_id, quantity_change, cost_basis,
                               movement_type, created_at)
SELECT md5('seed-movement-' || order_id)::uuid, account_id, instrument_id, fill_id,
       CASE side WHEN 'BUY' THEN quantity ELSE -quantity END, price, side, at + INTERVAL '2 seconds'
FROM seed_demo_orders WHERE reason IS NULL
ORDER BY at
ON CONFLICT DO NOTHING;

INSERT INTO cash_transactions (transaction_id, account_id, fill_id, transaction_type, amount, created_at, settled_at)
SELECT md5('seed-cash-' || order_id)::uuid, account_id, fill_id, side, cash_delta,
       at + INTERVAL '2 seconds', at + INTERVAL '2 seconds'
FROM seed_demo_orders WHERE reason IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO audit_log (audit_id, user_id, account_id, related_order_id, actor_type, event_type, payload, created_at)
SELECT md5('seed-audit-' || e.event_type || '-' || o.order_id)::uuid, NULL, o.account_id, o.order_id, 'SYSTEM',
       e.event_type, e.payload, o.at + INTERVAL '2 seconds'
FROM seed_demo_orders o
CROSS JOIN LATERAL (
    SELECT 'ORDER_FILLED' AS event_type,
           jsonb_build_object('fillId', o.fill_id, 'quantity', o.quantity,
                              'executionPrice', o.price, 'cashDelta', o.cash_delta) AS payload
    WHERE o.reason IS NULL
    UNION ALL
    SELECT 'SETTLEMENT_COMPLETED',
           jsonb_build_object('fillId', o.fill_id, 'quantity', o.quantity,
                              'executionPrice', o.price, 'cashDelta', o.cash_delta)
    WHERE o.reason IS NULL
    UNION ALL
    SELECT 'ORDER_REJECTED', jsonb_build_object('reasonCode', o.reason, 'attemptNumber', 1)
    WHERE o.reason IS NOT NULL
) AS e
ON CONFLICT DO NOTHING;

-- Balance cache rebuilt from the ledger for the demo accounts.
INSERT INTO cash_balances (account_id, currency, balance)
SELECT account_id, 'USD', SUM(amount)
FROM cash_transactions
WHERE account_id IN (SELECT account_id FROM accounts WHERE account_number LIKE 'NT-DEMO-%')
GROUP BY account_id
ON CONFLICT (account_id) DO UPDATE SET balance = EXCLUDED.balance, updated_at = CURRENT_TIMESTAMP;

COMMIT;
"""


CSV_HEADER = ("fill_id,order_id,filled_at,instrument_id,instrument_symbol,instrument_name,asset_class,market_code,"
              "user_id,client_email,account_id,account_number,account_status,trader_level,side,filled_quantity,"
              "execution_price")


def csv_value(value: str) -> str:
    return '"' + value.replace('"', '""') + '"' if any(ch in value for ch in ',"\n\r') else value


def render_csv(trades: list[Trade]) -> str:
    markets = {s.symbol: s.market_code for s in COMMON_STOCKS}
    rows = []

    def add(order_id, fill_id, at, symbol, user_id, email, account_id, account_number, status, tier, side, qty, price):
        market = markets[symbol]
        filled_at = at + timedelta(seconds=2)
        rows.append((filled_at, [
            fill_id, order_id, filled_at.strftime("%Y-%m-%dT%H:%M:%SZ"), instrument_id(market, symbol), symbol,
            INSTRUMENT_INFO[symbol][0], "COMMON_STOCK", market, user_id, email, account_id, account_number,
            status, tier, side, str(qty), f"{Decimal(price):.2f}"]))

    for suffix, n, symbol, side, qty, price, days_ago, at in TEST_USER_FILLS:
        order_id = f"c0000000-0000-4000-8000-{suffix}"
        user_id, email, account_id, account_number, tier = TEST_ACCOUNTS[n]
        when = datetime.combine(ANCHOR_DATE - timedelta(days=days_ago), at, timezone.utc)
        add(order_id, md5_uuid("seed-fill-" + order_id), when, symbol, user_id, email, account_id,
            account_number, "ACTIVE", tier, side, qty, price)
    for t in trades:
        if t.reason is None:
            c = t.client
            when = datetime.combine(ANCHOR_DATE + timedelta(days=t.day_offset), t.at, timezone.utc)
            add(t.order_id, t.fill_id, when, t.symbol, c.user_id, c.email, c.account_id, c.account_number,
                c.status, c.tier, t.side, t.quantity, t.price)
    rows.sort(key=lambda row: (row[0], row[1][0]))
    return CSV_HEADER + "\n" + "".join(",".join(csv_value(v) for v in row) + "\n" for _, row in rows)


def main() -> int:
    global ANCHOR_DATE
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="exit non-zero if a generated file is out of date")
    parser.add_argument("--anchor", type=date.fromisoformat, help="date that day offset 0 maps to in the CSV")
    args = parser.parse_args()
    if args.anchor:
        ANCHOR_DATE = args.anchor
    if set(INSTRUMENT_INFO) != {s.symbol for s in COMMON_STOCKS}:
        raise SystemExit("INSTRUMENT_INFO and the quote catalog list different symbols")

    trades = build_book()
    outputs = {
        INSTRUMENTS_SQL: render_instruments_sql(),
        TRADES_SQL: render_trades_sql(trades),
        TRADES_CSV: render_csv(trades),
    }
    stale = [path for path, text in outputs.items()
             if not path.exists() or path.read_text(encoding="utf-8") != text]
    if args.check:
        for path in stale:
            print(f"out of date: {path.relative_to(REPO)}")
        return 1 if stale else 0
    for path in stale:
        path.write_text(outputs[path], encoding="utf-8", newline="\n")
        print(f"wrote {path.relative_to(REPO)}")
    fills = [t for t in trades if t.reason is None]
    print(f"{len(fills)} demo fills ({sum(t.day_offset == 0 for t in fills)} today), "
          f"{len(trades) - len(fills)} rejected orders, {len({t.symbol for t in fills})} symbols")
    return 0


if __name__ == "__main__":
    sys.exit(main())
