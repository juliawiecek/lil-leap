package com.neueda.leap.order.submission.audit;

import com.neueda.leap.order.rules.OrderRuleException;

import java.util.ArrayList;
import java.util.List;

/** The trading rules one submission was checked against, in the order they ran (BR-05, BR-14). */
public final class RuleChecks {

    /**
     * One rule's outcome.
     *
     * @param rule rule name, e.g. {@code ACCOUNT_ACTIVE}
     * @param passed whether the submission met it
     * @param reasonCode the refusal reason when it did not, else null
     */
    public record Check(String rule, boolean passed, String reasonCode) {
    }

    private final List<Check> checks = new ArrayList<>();

    /** Creates an empty record of checks. */
    public RuleChecks() {
        // Filled in as the submission is validated.
    }

    /**
     * Records a passed rule.
     *
     * @param rule rule name
     */
    public void pass(String rule) {
        checks.add(new Check(rule, true, null));
    }

    /**
     * Records a failed rule.
     *
     * @param rule rule name
     * @param reasonCode why it failed
     */
    public void fail(String rule, String reasonCode) {
        checks.add(new Check(rule, false, reasonCode));
    }

    /**
     * Records the rule, refusing the submission when it is not met.
     *
     * @param rule rule name
     * @param met whether the submission meets it
     * @param reason the refusal reason when it does not
     * @throws OrderRuleException when {@code met} is false
     */
    public void require(String rule, boolean met, OrderRuleException.Reason reason) {
        if (met) {
            pass(rule);
            return;
        }
        fail(rule, reason.name());
        throw new OrderRuleException(reason);
    }

    /**
     * Returns the checks so far.
     *
     * @return checks in the order they ran
     */
    public List<Check> list() {
        return List.copyOf(checks);
    }
}
