package com.neueda.leap.order.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Account entity representing a trading account.
 * BR-04, BR-05, BR-11: Trading accounts with tier constraints and execution buffer.
 */
@Entity
@Table(name = "accounts")
public class Account {
    
    @Id
    @Column(columnDefinition = "uuid")
    private UUID accountId;
    
    @Column(name = "user_id", nullable = false, columnDefinition = "uuid")
    private UUID userId;
    
    @Column(name = "account_number", nullable = false, unique = true, length = 30)
    private String accountNumber;
    
    @Column(name = "account_name", nullable = false, length = 100)
    private String accountName;
    
    @Column(name = "account_type", nullable = false, length = 30)
    private String accountType;
    
    @Column(name = "account_status", nullable = false, length = 20)
    private String accountStatus;
    
    @Column(name = "trader_level", nullable = false, length = 20)
    private String traderLevel;
    
    @Column(name = "min_balance_requirement", nullable = false, precision = 18, scale = 2)
    private BigDecimal minBalanceRequirement;
    
    @Column(name = "execution_buffer_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal executionBufferPercent;
    
    @Column(name = "margin_approved", nullable = false)
    private Boolean marginApproved;
    
    @Column(name = "options_approved", nullable = false)
    private Boolean optionsApproved;
    
    @Column(name = "trading_enabled", nullable = false)
    private Boolean tradingEnabled;
    
    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    
    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // Constructors
    public Account() {
    }

    public Account(UUID accountId, UUID userId, String accountNumber, String accountName, 
                   String accountType, String accountStatus, String traderLevel,
                   BigDecimal minBalanceRequirement, BigDecimal executionBufferPercent) {
        this.accountId = accountId;
        this.userId = userId;
        this.accountNumber = accountNumber;
        this.accountName = accountName;
        this.accountType = accountType;
        this.accountStatus = accountStatus;
        this.traderLevel = traderLevel;
        this.minBalanceRequirement = minBalanceRequirement;
        this.executionBufferPercent = executionBufferPercent;
        this.marginApproved = false;
        this.optionsApproved = false;
        this.tradingEnabled = false;
    }

    // Getters and Setters
    public UUID getAccountId() {
        return accountId;
    }

    public void setAccountId(UUID accountId) {
        this.accountId = accountId;
    }

    public UUID getUserId() {
        return userId;
    }

    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    public String getAccountNumber() {
        return accountNumber;
    }

    public void setAccountNumber(String accountNumber) {
        this.accountNumber = accountNumber;
    }

    public String getAccountName() {
        return accountName;
    }

    public void setAccountName(String accountName) {
        this.accountName = accountName;
    }

    public String getAccountType() {
        return accountType;
    }

    public void setAccountType(String accountType) {
        this.accountType = accountType;
    }

    public String getAccountStatus() {
        return accountStatus;
    }

    public void setAccountStatus(String accountStatus) {
        this.accountStatus = accountStatus;
    }

    public String getTraderLevel() {
        return traderLevel;
    }

    public void setTraderLevel(String traderLevel) {
        this.traderLevel = traderLevel;
    }

    public BigDecimal getMinBalanceRequirement() {
        return minBalanceRequirement;
    }

    public void setMinBalanceRequirement(BigDecimal minBalanceRequirement) {
        this.minBalanceRequirement = minBalanceRequirement;
    }

    public BigDecimal getExecutionBufferPercent() {
        return executionBufferPercent;
    }

    public void setExecutionBufferPercent(BigDecimal executionBufferPercent) {
        this.executionBufferPercent = executionBufferPercent;
    }

    public Boolean getMarginApproved() {
        return marginApproved;
    }

    public void setMarginApproved(Boolean marginApproved) {
        this.marginApproved = marginApproved;
    }

    public Boolean getOptionsApproved() {
        return optionsApproved;
    }

    public void setOptionsApproved(Boolean optionsApproved) {
        this.optionsApproved = optionsApproved;
    }

    public Boolean getTradingEnabled() {
        return tradingEnabled;
    }

    public void setTradingEnabled(Boolean tradingEnabled) {
        this.tradingEnabled = tradingEnabled;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
