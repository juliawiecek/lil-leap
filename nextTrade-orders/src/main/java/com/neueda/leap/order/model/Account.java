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
@Entity(name = "OrderAccount") // onboarding.entity.Account already uses the default name "Account"
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
    /**
     * Creates an empty entity for JPA hydration or application initialization.
     */
    public Account() {
    }

    /**
     * Creates a {@code Account} with the supplied initial values.
     *
     * @param accountId persistent account identifier
     * @param userId persistent user identifier
     * @param accountNumber display account number
     * @param accountName display account name
     * @param accountType account ownership type
     * @param accountStatus account lifecycle status
     * @param traderLevel assigned trader tier
     * @param minBalanceRequirement minimum cash balance required for the trader tier
     * @param executionBufferPercent account execution tolerance percentage
     */
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
    /**
     * Returns persistent account identifier.
     *
     * @return persistent account identifier
     */
    public UUID getAccountId() {
        return accountId;
    }

    /**
     * Sets persistent account identifier.
     *
     * @param accountId persistent account identifier
     */
    public void setAccountId(UUID accountId) {
        this.accountId = accountId;
    }

    /**
     * Returns persistent user identifier.
     *
     * @return persistent user identifier
     */
    public UUID getUserId() {
        return userId;
    }

    /**
     * Sets persistent user identifier.
     *
     * @param userId persistent user identifier
     */
    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    /**
     * Returns display account number.
     *
     * @return display account number
     */
    public String getAccountNumber() {
        return accountNumber;
    }

    /**
     * Sets display account number.
     *
     * @param accountNumber display account number
     */
    public void setAccountNumber(String accountNumber) {
        this.accountNumber = accountNumber;
    }

    /**
     * Returns display account name.
     *
     * @return display account name
     */
    public String getAccountName() {
        return accountName;
    }

    /**
     * Sets display account name.
     *
     * @param accountName display account name
     */
    public void setAccountName(String accountName) {
        this.accountName = accountName;
    }

    /**
     * Returns account ownership type.
     *
     * @return account ownership type
     */
    public String getAccountType() {
        return accountType;
    }

    /**
     * Sets account ownership type.
     *
     * @param accountType account ownership type
     */
    public void setAccountType(String accountType) {
        this.accountType = accountType;
    }

    /**
     * Returns account lifecycle status.
     *
     * @return account lifecycle status
     */
    public String getAccountStatus() {
        return accountStatus;
    }

    /**
     * Sets account lifecycle status.
     *
     * @param accountStatus account lifecycle status
     */
    public void setAccountStatus(String accountStatus) {
        this.accountStatus = accountStatus;
    }

    /**
     * Returns assigned trader tier.
     *
     * @return assigned trader tier
     */
    public String getTraderLevel() {
        return traderLevel;
    }

    /**
     * Sets assigned trader tier.
     *
     * @param traderLevel assigned trader tier
     */
    public void setTraderLevel(String traderLevel) {
        this.traderLevel = traderLevel;
    }

    /**
     * Returns minimum cash balance required for the trader tier.
     *
     * @return minimum cash balance required for the trader tier
     */
    public BigDecimal getMinBalanceRequirement() {
        return minBalanceRequirement;
    }

    /**
     * Sets minimum cash balance required for the trader tier.
     *
     * @param minBalanceRequirement minimum cash balance required for the trader tier
     */
    public void setMinBalanceRequirement(BigDecimal minBalanceRequirement) {
        this.minBalanceRequirement = minBalanceRequirement;
    }

    /**
     * Returns account execution tolerance percentage.
     *
     * @return account execution tolerance percentage
     */
    public BigDecimal getExecutionBufferPercent() {
        return executionBufferPercent;
    }

    /**
     * Sets account execution tolerance percentage.
     *
     * @param executionBufferPercent account execution tolerance percentage
     */
    public void setExecutionBufferPercent(BigDecimal executionBufferPercent) {
        this.executionBufferPercent = executionBufferPercent;
    }

    /**
     * Returns margin approved.
     *
     * @return margin approved
     */
    public Boolean getMarginApproved() {
        return marginApproved;
    }

    /**
     * Sets margin approved.
     *
     * @param marginApproved margin approved
     */
    public void setMarginApproved(Boolean marginApproved) {
        this.marginApproved = marginApproved;
    }

    /**
     * Returns options approved.
     *
     * @return options approved
     */
    public Boolean getOptionsApproved() {
        return optionsApproved;
    }

    /**
     * Sets options approved.
     *
     * @param optionsApproved options approved
     */
    public void setOptionsApproved(Boolean optionsApproved) {
        this.optionsApproved = optionsApproved;
    }

    /**
     * Returns whether trading is enabled for the account.
     *
     * @return whether trading is enabled for the account
     */
    public Boolean getTradingEnabled() {
        return tradingEnabled;
    }

    /**
     * Sets whether trading is enabled for the account.
     *
     * @param tradingEnabled whether trading is enabled for the account
     */
    public void setTradingEnabled(Boolean tradingEnabled) {
        this.tradingEnabled = tradingEnabled;
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

    /**
     * Returns last update timestamp.
     *
     * @return last update timestamp
     */
    public Instant getUpdatedAt() {
        return updatedAt;
    }

    /**
     * Sets last update timestamp.
     *
     * @param updatedAt last update timestamp
     */
    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
