package com.neueda.leap.order.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * CashBalance entity for the cash_balances cache table.
 * BR-10: current cash balance per account, correct as of the last committed settlement.
 * Source of truth is cash_transactions (the ledger); this row is a derived cache
 * keyed 1:1 on account_id.
 */
@Entity
@Table(name = "cash_balances")
public class CashBalance {

    @Id
    @Column(name = "account_id", columnDefinition = "uuid")
    private UUID accountId;

    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "account_id")
    private Account account;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency;

    @Column(name = "balance", nullable = false, precision = 18, scale = 2)
    private BigDecimal balance;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /**
     * Creates an empty entity for JPA hydration.
     */
    public CashBalance() {
    }

    /**
     * Returns the account id this balance belongs to.
     *
     * @return the account id this balance belongs to
     */
    public UUID getAccountId() {
        return accountId;
    }

    /**
     * Returns the owning account.
     *
     * @return the owning account
     */
    public Account getAccount() {
        return account;
    }

    /**
     * Sets the owning account.
     *
     * @param account the owning account
     */
    public void setAccount(Account account) {
        this.account = account;
    }

    /**
     * Returns the currency code for this balance.
     *
     * @return the currency code for this balance
     */
    public String getCurrency() {
        return currency;
    }

    /**
     * Sets the currency code for this balance.
     *
     * @param currency the currency code for this balance
     */
    public void setCurrency(String currency) {
        this.currency = currency;
    }

    /**
     * Returns the current cash balance.
     *
     * @return the current cash balance
     */
    public BigDecimal getBalance() {
        return balance;
    }

    /**
     * Sets the current cash balance.
     *
     * @param balance the current cash balance
     */
    public void setBalance(BigDecimal balance) {
        this.balance = balance;
    }

    /**
     * Returns when this balance was last updated.
     *
     * @return when this balance was last updated
     */
    public Instant getUpdatedAt() {
        return updatedAt;
    }

    /**
     * Sets when this balance was last updated.
     *
     * @param updatedAt when this balance was last updated
     */
    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
