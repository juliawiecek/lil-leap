# TS-10.1: Atomic settlement for all seven operations

| Decision record | Value |
| --- | --- |
| Requirement | BR-09 (Must): holdings, cash and the permanent trade record update together |
| Status | Accepted; spike complete (acceptance record in section 7) |
| Prepared | 2026-09-28 |
| Reviewed | 2026-09-29 |
| Delivery | Sprint 7; design ready for NEXT-113/114 implementation |
| Selected approach | One PostgreSQL transaction, including both database cache tables |
| Interface decision | All seven operations remain internal methods; no new HTTP routes |
| Layers | Backend, Database, DevOps |

This ADR is the canonical TS-10.1 design record. NEXT-113/114 implementation and crash tests remain follow-up work; sections 4–6 define their handoff.

## 1. Evidence and scope

The repository already has the data needed for a local transaction:

- [Schema](../../db/finalized-schema.sql): `fills` is the permanent execution record, `holding_movements` and `cash_transactions` are ledgers, and `holdings` and `cash_balances` are database caches. Here, “cache” means PostgreSQL tables, not Redis or process memory. MVP permits one fill per order, whole-share quantities, USD cash and no negative cash or holdings.
- [Database decisions](../../db/DATABASE_DECISIONS.md#settlement-and-ledger-model): ledgers are authoritative and caches are rebuildable. This ADR defines the missing atomic write boundary.
- [Older execution service](../../nextTrade-orders/src/main/java/com/neueda/leap/order/service/OrderExecutionService.java): writes fill, ledgers and order history, but does not update either cache. `executeAllDueOrders()` calls transactional methods on the same instance; those calls alone do not establish a proxy transaction.
- [Execution worker](../../insights/src/main/java/com/neueda/leap/order/execution/OrderExecutionWorker.java) and [executor contract](../../insights/src/main/java/com/neueda/leap/order/execution/OrderExecutor.java): provide a durable claim and a separate transaction around the locked order's execution. The worker checks a fill exists, but does not verify both ledger legs and caches. The [configuration](../../insights/src/main/java/com/neueda/leap/order/execution/OrderExecutionConfiguration.java) falls back to `PENDING` until an executor is supplied.
- [Application grants](../../db/init-app-role.sh): currently allow UPDATE/DELETE on fills and ledgers. Append-only intent is not yet enforced there; only `audit_log` has explicit append-only privileges.
- [Existing SQL atomicity test](../../db/tests/003_atomicity_test.sql): exercises a savepoint rollback of fill and ledger inserts. It does not update caches, kill the app, or prove the service transaction boundary.

No separate settlement table is required. In the internal contract, `tradeId` means `orders.order_id`; `settlementId` means `fills.fill_id`. A later external execution identifier would require an explicit mapping and a revised contract.

## 2. Alternatives

**A — Single PostgreSQL transaction (selected).** One backend owner writes the fill, both ledger legs, both caches, final order status and history on the same transaction-bound connection. PostgreSQL makes a transaction's changes visible together and discards uncommitted changes on failure. [PostgreSQL transaction semantics](https://www.postgresql.org/docs/16/tutorial-transactions.html).

**B — Orchestrated saga with compensating transactions.** A durable coordinator records a settlement intent, then invokes separately committed trade-record, holdings and cash steps. Each participant uses a local transaction for its ledger/cache pair and an outbox; consumers deduplicate messages using an inbox or unique operation key. Completion and compensation have durable step states. This supports independently owned databases, but committed steps can coexist with unfinished steps, and compensation requires retries. That eventual consistency does not satisfy BR-09's strict “none without the others” wording. Reservations can limit spending during a saga but do not make separate commits atomic. [Saga pattern and tradeoffs](https://learn.microsoft.com/en-us/azure/architecture/patterns/saga).

The following comparison is this project's design assessment; method names and state names describe the implementation contract, not existing APIs.

### All seven operations

| Specified operation | A: local transaction behavior and tradeoff | B: saga behavior and tradeoff | MVP internal contract |
| --- | --- | --- | --- |
| `POST /cash/sell` | Append positive cash leg and update cash cache inside the enclosing sell settlement, together with negative holdings and fill. Fast and atomic, but cannot be independently committed or remotely called. | Cash participant credits once using a settlement/step key; holdings and trade-record steps may still be incomplete. Independent scaling costs deduplication, reservations and possible credit reversal. | `applySellCash(context)`, transaction required; callable only by settlement orchestration. No standalone cash mutation. |
| `POST /cash/buy` | Validate available funds under lock, append negative cash leg and update cache in the enclosing buy transaction. Prevents overspending with shared locking, at the cost of serializing writes for an account. | Reserve/debit funds locally, then release/credit on compensation. Enables independent cash ownership but introduces reservation expiry and unavailable-funds periods before other steps finish. | `applyBuyCash(context)`, transaction required; account, amount and side derived from the validated order/fill. |
| `POST /settlements` | `settle` commits fill, both ledgers, both caches and status/history once. One failure aborts the bundle; requires one database and one transaction owner. | Start durable intent; progress through participant steps to `COMPLETED`. Tolerates service outages through replay, but completion is asynchronous and partial committed effects exist. | `settle(tradeId, executionContext) -> settlementId`; idempotency anchored to the order, not a fresh UUID per retry. |
| `GET /settlements/{id}` | Read fill and its ledger legs in one database snapshot. Simple consistent result; a rolled-back settlement has no record. | Read coordinator plus participant receipts. Useful step visibility, but receipt lag can make the result stale relative to a participant's committed state. | `getSettlement(settlementId)` returns immutable fill details and leg identifiers, or not found. No writes. |
| `POST /settlements/recover` | Re-read primary DB by order key, retry an uncommitted attempt, or rebuild damaged caches from complete ledgers under lock. Small recovery state space; legacy partial ledgers need investigation, not blind replay. | Resume durable unfinished steps, redeliver outbox messages or continue compensation. Handles independent failures, but requires leases, retry budgets, poison-message handling and step reconciliation. | `recover(tradeId)` for attempts; an internal reconciliation job handles account cache rebuilds. Scheduled/operations invocation only. |
| `POST /settlements/rollback` | Abort the active enclosing transaction before commit. After commit, return `ALREADY_COMMITTED`; deleting a fill or undoing one leg is forbidden. Simple semantics but no post-commit trade cancellation API. | Enter `COMPENSATING` and append inverse effects for completed steps. Enables business reversal, but compensation can fail and cannot erase the period of inconsistency. | `rollbackActiveSettlement(context, reason)` marks the current transaction rollback-only. No independent HTTP handler or arbitrary transaction-ID rollback. |
| `GET /settlements/status/{tradeId}` | Derive `NOT_SETTLED`, `SETTLED`, `REJECTED` or `INCONSISTENT` from one primary snapshot. Small state model; an in-flight transaction is not exposed as a durable settlement. | Return `STARTED`, step states, `COMPLETED`, `COMPENSATING`, `COMPENSATED` or `MANUAL_REVIEW`. Rich diagnostics cost coordinator state and do not prove every projection is current. | `getSettlementStatus(tradeId)`; unknown order is not found, and DB unavailability is an error, never `NOT_SETTLED`. |

### Cross-cutting tradeoffs

| Dimension | A: PostgreSQL transaction | B: saga |
| --- | --- | --- |
| BR-09 | Meets strict atomicity if every required write participates | Does not meet literal cross-participant atomicity; would require a business requirement change or a different atomic commit mechanism |
| Backend | One owner and a short transaction; account contention and shared schema coupling | More service autonomy; coordinator, participant contracts and compensation code |
| Database | Existing tables; extra uniqueness and immutability enforcement | Intent/step state, outboxes/inboxes and compensation references in addition to domain tables |
| DevOps | Existing PostgreSQL durability, monitoring, backup/restore and transaction retries | Also operate message delivery, worker leases, backlog alerts and manual compensation recovery |
| Failure testing | Prove rollback, replay and concurrent account safety | Also prove each step's replay, reordering, lost acknowledgements and compensation failures |

Reconsider B only if storage ownership splits and product explicitly accepts eventual settlement semantics. Neither HTTP nor a message broker automatically propagates this local transaction.

## 3. Crash analysis (AC2 / NEXT-114)

The required injection point is **after a ledger INSERT has actually executed/flushed, before either cache UPDATE, with the app terminated rather than a handled exception**.

| Failure window | A: expected persisted state and recovery | B: expected persisted state and recovery |
| --- | --- | --- |
| App dies after ledger write, before cache update | Fill and ledger changes remain uncommitted. After connection cleanup PostgreSQL rolls back the whole execution transaction; both caches retain their prior values. A previously committed order claim may remain `PENDING`. NEXT-114 waits for claim expiry and re-enters settlement with the same order key. It must not manufacture inverse entries. | If ledger and local cache share one participant transaction, that participant rolls back; already committed participants remain. Coordinator replays the failed step using its durable key. If ledger was committed before an asynchronous cache update, the ledger survives and cache is stale: a durable outbox/reconciliation process must replay the projection before exposing completion. This variant still cannot meet strict BR-09. |
| App dies after one cache update, before final commit/completion | The cache write, ledgers and fill all roll back together. Retry full settlement, not the remaining writes. | A committed participant may already have both its ledger and cache changed while another has neither. Resume forward work or persist and retry compensation; partial effects remain until then. |
| Commit succeeds, app dies before acknowledgement | Full settlement exists. Re-read by order key on primary and return the same fill; never debit again. A timeout alone is not evidence of rollback. | A participant may have committed without the coordinator recording its receipt. Redelivery returns its saved result without repeating money movement; coordinator then advances. |
| Database/process restart | Transaction recovery yields all or none of the bundle. Retry only after checking durable state and acquiring the normal locks. Durability configuration and storage must preserve acknowledged commits. | Each store recovers locally; no common commit point exists. Coordinator resumes from durable state, checks participant receipts and retries incomplete compensation if necessary. |

In A, “committed ledger but old cache” after this crash indicates an implementation defect, old writer or pre-existing corruption. It is not a normal intermediate state to accept. Recovery must distinguish this from a missing settlement.

If Redis or an in-memory display cache is added later, treat it as a disposable projection with explicit freshness handling. It cannot authorize trades or participate in the BR-09 invariant through a local DB transaction. Optional downstream notifications may use a same-transaction outbox; the outbox is not a substitute for atomically updating the database caches.

## 4. Transaction and concurrency contract

Use the existing `insights` worker's `OrderExecutor` extension point as the MVP execution owner. Settlement methods join its execution transaction. Remove or disable any competing legacy execution writer before rollout. A future module move must preserve a single owner and transaction manager.

1. Claiming an order may commit separately, as it does today. That claim changes scheduling metadata, never cash, holdings or a fill.
2. Inside execution, lock and reload the order and validate its claim token/status. Lock its `accounts` row next, then cash and holdings rows in a consistent order. For a new holdings row, the account lock protects creation. Other account mutation/reconciliation paths must use the same account lock; none may acquire an order lock after acquiring an account lock. Restrict each settlement to one account/order to keep this ordering simple.
3. Check for an existing fill by `order_id`. Verify it belongs to a complete settlement and matches the immutable execution details before returning it. A changed payload is a conflict. Missing legs or a contradictory status require investigation, not an idempotent success.
4. Validate side, quantity, currency, quote/execution context, sufficient cash for BUY and sufficient shares for SELL under these locks. Do not trust a caller-supplied cash amount. Derive one signed cash amount with decimal arithmetic and explicit rounding to the schema's two-decimal USD precision, and reuse that exact value for ledger and cache. Use `HALF_UP` rounding.
5. Insert the fill, one signed holdings movement and one BUY/SELL cash entry; update both caches, order `FILLED` status and status history in the same transaction. Include the successful settlement audit event in that transaction. Quantity increases/cash decreases for BUY; quantity decreases/cash increases for SELL. No network calls occur between these writes and commit.
6. Commit once at the outer worker boundary, then report success. Any exception or failed invariant rolls back the entire execution bundle. Rejection/failure diagnostics may be written afterward in a separate transaction, never accompanied by partial settlement effects.

Use explicit `TransactionTemplate` at the owner boundary and transaction-required helpers, or a separate Spring bean with `MANDATORY` propagation for settlement. Do not use `REQUIRES_NEW` for cash, holdings or fill writes, async helpers, a second independent datasource, or swallowed failures. If annotations are used, configure checked failures to roll back as well. Self-invocation bypasses Spring proxy interception. [Spring transaction annotation behavior](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html).

Use `READ COMMITTED` plus this shared locking protocol for writes. Locks serialize account mutations; lock timeout/deadlock retries restart the entire execution transaction after rollback. Combined reads must use one joined query or a read-only `REPEATABLE READ` transaction: separate ordinary reads can straddle a commit and assemble an inconsistent response. [PostgreSQL explicit locking](https://www.postgresql.org/docs/16/explicit-locking.html).

### Required database work for NEXT-113

- Keep `UNIQUE fills(order_id)` and `UNIQUE holding_movements(fill_id)`. Add a partial unique index on `cash_transactions(fill_id)` for non-null BUY/SELL entries, preventing duplicate settlement cash legs without blocking deposits or separate fees. Reject trade cash entries without a fill reference. Validate both leg identities, account/instrument, signs and amounts against the fill/order before commit.
- Audit existing rows before adding constraints; duplicates or missing legs require reconciliation. Uniqueness prevents duplicates but does not by itself require both legs. The transaction owner must enforce completeness, and no alternate writer may create standalone fill/settlement legs.
- Make fills, holding movements and cash transactions append-only for runtime roles. Review relevant foreign-key actions and role grants; schema owner migrations remain separate. Do not mistake existing broad runtime grants for immutability enforcement.
- Apply equivalent changes to the fresh schema and upgrade migration. USD `cash_balances` is keyed by `account_id` today, not `(account_id, currency)`; do not introduce multi-currency behavior accidentally.
- Standardize cost-basis handling for both normal writes and recovery. Use moving weighted-average cost: add purchase cost on BUY, retain average cost on partial SELL and reset to zero on full liquidation. The current `v_account_holdings` signed-price aggregate does not implement that rule for sales at a different price. Add a deterministic per-account movement ordering key allocated under the account lock, and align reconstruction/view behavior before enabling settlement. Legacy ambiguous ordering needs explicit reconciliation.

Post-commit trade reversal is outside MVP rollback semantics. If required later, design a separately authorized, idempotent reversal command that appends linked correcting effects and updates both caches atomically, preserving the original fill. The current unique movement-per-fill constraint cannot simply accept another movement for the same fill; a reversal model and migration must precede that feature.

## 5. Recovery and operations contract for NEXT-114

Read from the primary, then lock/re-read before taking action. Use the following outcomes:

| Durable observation | Action |
| --- | --- |
| Known eligible order, no fill or settlement legs | No settlement committed. Retry through the normal execution/quote-validation path after claim expiry; do not reuse an expired quote blindly. |
| Complete fill and matching legs, final status, valid account projections | Return existing settlement. A lost acknowledgement requires no mutation. |
| Complete ledgers, but cache differs or a cache row is missing | Pause settlement for that account while investigating; rebuild both caches together under its account lock, then audit repair. Never insert duplicate trade legs. |
| Fill/leg/status mismatch, duplicate leg, invalid aggregate, or a leg without its expected fill | Return `INCONSISTENT`, fail closed for that account and alert operations. Preserve evidence. Do not guess missing financial entries or erase a permanent record. |
| DB unavailable or an unresolved lock/commit outcome | Return an unavailable/retryable result. Do not infer absent settlement and do not compensate on timeout. |

Cache reconciliation is account-wide: sum all authoritative cash events (including deposits/withdrawals) and replay holdings movements in the agreed durable order, including zero positions. It must not compare a trade's delta to the entire account balance. Use one snapshot under the account lock for validation, both cache replacements and repair audit. All other writers must respect that lock. Missing opening ledger entries or ambiguous historic cost basis require manual reconciliation before rebuild.

Status reads return order status separately from settlement status. `SETTLED` requires the fill, expected legs and final order state to agree; detected projection corruption yields `INCONSISTENT`, never success. A known order with no effects is `NOT_SETTLED` (it may be queued/in flight); `REJECTED` requires terminal rejection without settlement effects. These are derived results, not a new settlement state table.

DevOps handoff:

- Keep PostgreSQL WAL durability (`fsync` and `synchronous_commit`) enabled on durable storage; document/test backup and whole-database restore. Recovery of an acknowledged commit on a failed primary requires a failover policy with adequate replication durability, not just application retries.
- Run recovery/reconciliation through controlled internal jobs or an operations entry point in the owning process. If remote operational access is later needed, review service authentication, authorization and auditing explicitly.
- Track oldest due claim, execution failures, duplicate replay counts, lock timeouts/deadlocks, cache drift and incomplete settlement records. Any incomplete record or negative reconstructed balance alerts operations and prevents further automated settlement for that account.
- Use bounded retries with backoff for transient database failures; alert persistent failures and retain durable work for later recovery. Log order/fill correlation IDs and error categories without credentials or sensitive payloads.
- Before rollout: reconcile legacy data, apply constraints/grants, deploy one writer with execution paused, validate recovery, then enable polling. If rollback of the application is required, pause the worker first and preserve committed data/schema compatibility; do not roll back successful trades as part of deployment rollback.

## 6. Verification handoff (planned, not claimed as executed)

Run these against real PostgreSQL using the application transaction path and runtime role. Mocks and the existing savepoint test are insufficient evidence of crash safety.

| Scenario | Required assertion |
| --- | --- |
| Successful BUY and SELL | Exactly one fill, one movement and one trade cash leg; both caches equal expected totals; status/history/audit commit with them. |
| Kill app after flushed ledger write before caches | Independent reader sees no partial effects; after backend cleanup, caches and records match pre-attempt state. Restart/claim expiry leads to one complete settlement. |
| Fail after first cache update or just before commit | Every settlement write rolls back; durable scheduling claim may remain. |
| Kill after commit before acknowledgement | Retry returns same fill and unchanged money/quantity; no duplicate legs or success history. |
| Restart PostgreSQL mid-transaction and after acknowledged commit | Observe respectively none or all of the settlement after recovery. |
| Duplicate worker/recovery requests and changed retry payload | Same order executes once; conflicting context is rejected; no partial or duplicate writes. |
| Concurrent buys/sells on one account, including a new holdings row | No lost updates, overspending or overselling; locks and constraints protect the aggregate. |
| Cache rebuild concurrent with trading | Repair and settlement serialize; repeated repair is harmless, cash and cost basis reconstruct correctly. |
| Seed incomplete legacy settlement | Recovery refuses financial guesses, reports inconsistency and blocks further settlement for the account. |
| Read/rollback semantics and privileges | Reads have no mutations and coherent snapshots; pre-commit abort is complete; post-commit rollback refuses; runtime UPDATE/DELETE on permanent records fails. |
| Rounding and cost-basis replay | Fractional-cent execution totals use identical rounded ledger/cache amounts; buys, partial sells and liquidation produce identical incremental and reconstructed holdings. |

## 7. Acceptance and requester authorization

| Acceptance criterion | Evidence / status |
| --- | --- |
| AC1: two approaches, all seven operations, individual tradeoffs | Sections 2 and 4; complete for this spike |
| AC2: ledger-write/cache-update crash for each approach | Section 3, with recovery contract and test handoff in sections 5–6; analysis complete, implementation tests deferred to NEXT-113/114 |
| AC3: team-lead written approval before NEXT-113/114 starts | **Waived by the requester in this task conversation**, who explicitly stated that team-lead approval is unnecessary and changes may proceed. No team-lead sign-off is claimed. |

The spike is complete under these revised acceptance criteria; NEXT-113/114 may proceed. The original Monday-before-vacation target has no supplied date, so this record does not claim that deadline was met.
