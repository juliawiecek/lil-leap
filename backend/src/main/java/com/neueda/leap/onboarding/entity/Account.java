package com.neueda.leap.onboarding.entity;

import com.neueda.leap.onboarding.enums.AccountType;
import com.neueda.leap.onboarding.enums.TraderLevel;
import com.neueda.leap.user.entity.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Trading account metadata created during onboarding.
 */
@Entity
@Table(name = "accounts")
public class Account {

    /** Creates an empty account for onboarding or JPA hydration. */
    public Account() {
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "account_id")
    private UUID accountId;

    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "account_number", nullable = false, length = 30)
    private String accountNumber;

    @Column(name = "account_name", nullable = false, length = 100)
    private String accountName;

    @Enumerated(EnumType.STRING)
    @Column(name = "account_type", nullable = false, length = 30)
    private AccountType accountType;

    @Column(name = "account_status", nullable = false, length = 20)
    private String accountStatus = "PENDING";

    @Enumerated(EnumType.STRING)
    @Column(name = "trader_level", nullable = false, length = 20)
    private TraderLevel traderLevel;

    @Column(name = "min_balance_requirement", nullable = false, precision = 18, scale = 2)
    private BigDecimal minBalanceRequirement;

    @Column(name = "trading_enabled", nullable = false)
    private boolean tradingEnabled = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** Initializes creation and update timestamps before the first insert. */
    @PrePersist
    protected void onCreate() {
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    /** Refreshes the update timestamp before an entity update. */
    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = Instant.now();
    }

    /**
     * Returns persistent account identifier.
     * @return persistent account identifier
     */
    public UUID getAccountId() {
        return accountId;
    }

    /**
     * Sets persistent account identifier.
     * @param accountId persistent account identifier
     */
    public void setAccountId(UUID accountId) {
        this.accountId = accountId;
    }

    /**
     * Returns associated authentication user.
     * @return associated authentication user
     */
    public User getUser() {
        return user;
    }

    /**
     * Sets associated authentication user.
     * @param user associated authentication user
     */
    public void setUser(User user) {
        this.user = user;
    }

    /**
     * Returns brokerage account number.
     * @return brokerage account number
     */
    public String getAccountNumber() {
        return accountNumber;
    }

    /**
     * Sets brokerage account number.
     * @param accountNumber brokerage account number
     */
    public void setAccountNumber(String accountNumber) {
        this.accountNumber = accountNumber;
    }

    /**
     * Returns account display name.
     * @return account display name
     */
    public String getAccountName() {
        return accountName;
    }

    /**
     * Sets account display name.
     * @param accountName account display name
     */
    public void setAccountName(String accountName) {
        this.accountName = accountName;
    }

    /**
     * Returns brokerage account type.
     * @return brokerage account type
     */
    public AccountType getAccountType() {
        return accountType;
    }

    /**
     * Sets brokerage account type.
     * @param accountType brokerage account type
     */
    public void setAccountType(AccountType accountType) {
        this.accountType = accountType;
    }

    /**
     * Returns account lifecycle status.
     * @return account lifecycle status
     */
    public String getAccountStatus() {
        return accountStatus;
    }

    /**
     * Sets account lifecycle status.
     * @param accountStatus account lifecycle status
     */
    public void setAccountStatus(String accountStatus) {
        this.accountStatus = accountStatus;
    }

    /**
     * Returns trader tier assigned to the account.
     * @return trader tier assigned to the account
     */
    public TraderLevel getTraderLevel() {
        return traderLevel;
    }

    /**
     * Sets trader tier assigned to the account.
     * @param traderLevel trader tier assigned to the account
     */
    public void setTraderLevel(TraderLevel traderLevel) {
        this.traderLevel = traderLevel;
    }

    /**
     * Returns minimum required account balance.
     * @return minimum required account balance
     */
    public BigDecimal getMinBalanceRequirement() {
        return minBalanceRequirement;
    }

    /**
     * Sets minimum required account balance.
     * @param minBalanceRequirement minimum required account balance
     */
    public void setMinBalanceRequirement(BigDecimal minBalanceRequirement) {
        this.minBalanceRequirement = minBalanceRequirement;
    }

    /**
     * Returns whether trading is enabled for the account.
     * @return whether trading is enabled for the account
     */
    public boolean isTradingEnabled() {
        return tradingEnabled;
    }

    /**
     * Sets whether trading is enabled for the account.
     * @param tradingEnabled whether trading is enabled for the account
     */
    public void setTradingEnabled(boolean tradingEnabled) {
        this.tradingEnabled = tradingEnabled;
    }

    /**
     * Returns creation timestamp assigned before initial persistence.
     * @return creation timestamp assigned before initial persistence
     */
    public Instant getCreatedAt() {
        return createdAt;
    }

    /**
     * Returns timestamp assigned before the latest persistence update.
     * @return timestamp assigned before the latest persistence update
     */
    public Instant getUpdatedAt() {
        return updatedAt;
    }
}


