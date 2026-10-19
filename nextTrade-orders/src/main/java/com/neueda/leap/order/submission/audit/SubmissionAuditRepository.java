package com.neueda.leap.order.submission.audit;

import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Records every submission decision in {@code audit_log} (BR-05, BR-14, TS-15.5): a
 * {@code RULE_CHECKED} row per rule, and for a refused order a {@code SUBMISSION_REFUSED} row.
 * Each row carries the request id returned to the client as {@code X-Request-Id}.
 */
@Repository
public class SubmissionAuditRepository {
    private static final String RULE_CHECKED = """
            INSERT INTO audit_log(user_id, account_id, related_order_id, actor_type, event_type, payload)
            VALUES (?, ?, CAST(? AS uuid), 'USER', 'RULE_CHECKED',
                    jsonb_build_object('requestId', CAST(? AS varchar), 'rule', CAST(? AS varchar),
                                       'result', CAST(? AS varchar), 'reasonCode', CAST(? AS varchar)))
            """;

    private final JdbcTemplate jdbc;

    /**
     * Creates the repository.
     *
     * @param jdbc JDBC operations joining the caller's transaction
     */
    public SubmissionAuditRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Records the rules an accepted order passed, in the caller's transaction, so the order and its
     * checks are stored together or not at all.
     *
     * @param userId submitting user
     * @param accountId order's account
     * @param orderId the new order
     * @param requestId the submission's request id
     * @param checks rules checked, in order
     */
    public void recordAccepted(UUID userId, UUID accountId, UUID orderId, UUID requestId, List<RuleChecks.Check> checks) {
        insertChecks(userId, accountId, orderId, requestId, checks);
    }

    /**
     * Records a refused submission and the rules it was checked against, in its own transaction,
     * so the record survives the refusal. Callers return the refusal only after this succeeds.
     *
     * @param userId submitting user
     * @param request the refused request
     * @param requestId the submission's request id
     * @param reasonCode why it was refused
     * @param checks rules checked, in order, ending with the failed one
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordRefused(UUID userId, SubmitOrderRequest request, UUID requestId, String reasonCode,
                              List<RuleChecks.Check> checks) {
        jdbc.update("""
                INSERT INTO audit_log(user_id, account_id, related_order_id, actor_type, event_type, payload)
                VALUES (?, ?, NULL, 'USER', 'SUBMISSION_REFUSED',
                        jsonb_build_object('requestId', CAST(? AS varchar), 'reasonCode', CAST(? AS varchar),
                                           'instrument', CAST(? AS varchar), 'side', CAST(? AS varchar),
                                           'quantity', CAST(? AS bigint), 'clientReference', CAST(? AS varchar)))
                """, userId, request.accountId(), requestId.toString(), reasonCode,
                request.instrumentId() == null ? request.normalizedSymbol() : request.instrumentId().toString(),
                request.normalizedSide(), request.quantity(), String.valueOf(request.clientReference()));
        insertChecks(userId, request.accountId(), null, requestId, checks);
    }

    private void insertChecks(UUID userId, UUID accountId, UUID orderId, UUID requestId, List<RuleChecks.Check> checks) {
        String order = orderId == null ? null : orderId.toString();
        jdbc.batchUpdate(RULE_CHECKED, checks.stream().map(check -> new Object[]{
                userId, accountId, order, requestId.toString(), check.rule(),
                check.passed() ? "PASS" : "FAIL", check.reasonCode()}).toList());
    }
}
