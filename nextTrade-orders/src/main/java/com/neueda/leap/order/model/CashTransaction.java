package com.neueda.leap.order.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * CashTransaction entity for append-only cash ledger.
 * BR-09, BR-10: Append-only ledger where every cash movement creates an immutable transaction.
 * Source of truth: cash_balances is computed cache.
 * Signed amounts: negative for outflow (buy, fee, withdrawal), positive for inflow (sell, deposit, dividend).
 * BR-15: Enables reconstruction of account history from ledger.
 */
@Entity
@Table(name = "cash_transactions", indexes = {
    @Index(name = "idx_transaction_account", columnList = "account_id"),
    @Index(name = "idx_transaction_created_at", columnList = "created_at DESC"),
    @Index(name = "idx_transaction_type", columnList = "transaction_type"),
    @Index(name = "idx_transaction_fill", columnList = "fill_id")
})
public class CashTransaction {
    
    @Id
    @Column(columnDefinition = "uuid")
    private UUID transactionId;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "fill_id")
    private Fill fill;
    
    @Column(name = "transaction_type", nullable = false, length = 20)
    private String transactionType;  // BUY, SELL, DEPOSIT, WITHDRAWAL, DIVIDEND, FEE, CORRECTION
    
    @Column(name = "amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;
    
    @Column(name = "currency", nullable = false, length = 3)
    private String currency;
    
    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    // Constructors
    /**
     * Creates an empty entity for JPA hydration or application initialization.
     */
    public CashTransaction() {
    }

    /**
     * Creates a {@code CashTransaction} with the supplied initial values.
     *
     * @param transactionId transaction id
     * @param account account owning the trade
     * @param fill fill associated with this ledger entry
     * @param transactionType cash ledger event type
     * @param amount signed cash amount; negative for buys and positive for sells
     * @param currency currency code
     */
    public CashTransaction(UUID transactionId, Account account, Fill fill, String transactionType,
                          BigDecimal amount, String currency) {
        this.transactionId = transactionId;
        this.account = account;
        this.fill = fill;
        this.transactionType = transactionType;
        this.amount = amount;
        this.currency = currency;
    }

    // Getters and Setters
    /**
     * Returns transaction id.
     *
     * @return transaction id
     */
    public UUID getTransactionId() {
        return transactionId;
    }

    /**
     * Sets transaction id.
     *
     * @param transactionId transaction id
     */
    public void setTransactionId(UUID transactionId) {
        this.transactionId = transactionId;
    }

    /**
     * Returns account owning the trade.
     *
     * @return account owning the trade
     */
    public Account getAccount() {
        return account;
    }

    /**
     * Sets account owning the trade.
     *
     * @param account account owning the trade
     */
    public void setAccount(Account account) {
        this.account = account;
    }

    /**
     * Returns fill associated with this ledger entry.
     *
     * @return fill associated with this ledger entry
     */
    public Fill getFill() {
        return fill;
    }

    /**
     * Sets fill associated with this ledger entry.
     *
     * @param fill fill associated with this ledger entry
     */
    public void setFill(Fill fill) {
        this.fill = fill;
    }

    /**
     * Returns cash ledger event type.
     *
     * @return cash ledger event type
     */
    public String getTransactionType() {
        return transactionType;
    }

    /**
     * Sets cash ledger event type.
     *
     * @param transactionType cash ledger event type
     */
    public void setTransactionType(String transactionType) {
        this.transactionType = transactionType;
    }

    /**
     * Returns signed cash amount; negative for buys and positive for sells.
     *
     * @return signed cash amount; negative for buys and positive for sells
     */
    public BigDecimal getAmount() {
        return amount;
    }

    /**
     * Sets signed cash amount; negative for buys and positive for sells.
     *
     * @param amount signed cash amount; negative for buys and positive for sells
     */
    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    /**
     * Returns currency code.
     *
     * @return currency code
     */
    public String getCurrency() {
        return currency;
    }

    /**
     * Sets currency code.
     *
     * @param currency currency code
     */
    public void setCurrency(String currency) {
        this.currency = currency;
    }

    /**
     * Returns row creation timestamp.
     *
     * @return row creation timestamp
     */
    public Instant getCreatedAt() {
        return createdAt;
    }

    /**
     * Sets row creation timestamp.
     *
     * @param createdAt row creation timestamp
     */
    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
