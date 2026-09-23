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
    public CashTransaction() {
    }

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
    public UUID getTransactionId() {
        return transactionId;
    }

    public void setTransactionId(UUID transactionId) {
        this.transactionId = transactionId;
    }

    public Account getAccount() {
        return account;
    }

    public void setAccount(Account account) {
        this.account = account;
    }

    public Fill getFill() {
        return fill;
    }

    public void setFill(Fill fill) {
        this.fill = fill;
    }

    public String getTransactionType() {
        return transactionType;
    }

    public void setTransactionType(String transactionType) {
        this.transactionType = transactionType;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
