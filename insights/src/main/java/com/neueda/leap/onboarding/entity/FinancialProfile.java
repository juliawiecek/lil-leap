package com.neueda.leap.onboarding.entity;

import com.neueda.leap.onboarding.enums.EmploymentStatus;
import com.neueda.leap.onboarding.enums.NetWorthBracket;
import com.neueda.leap.onboarding.enums.NetWorthBracketConverter;
import com.neueda.leap.onboarding.enums.RiskProfile;
import com.neueda.leap.user.entity.User;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Financial and regulatory onboarding profile for a user.
 */
@Entity
@Table(name = "financial_profiles")
public class FinancialProfile {

    /** Creates an empty financial profile for onboarding or JPA hydration. */
    public FinancialProfile() {
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "financial_profile_id")
    private UUID financialProfileId;

    @OneToOne(optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "kyc_status", nullable = false, length = 30)
    private String kycStatus = "PENDING";

    @Column(name = "accredited_investor", nullable = false)
    private boolean accreditedInvestor;

    @Convert(converter = NetWorthBracketConverter.class)
    @Column(name = "net_worth_bracket", length = 30)
    private NetWorthBracket netWorthBracket;

    @Enumerated(EnumType.STRING)
    @Column(name = "risk_profile", length = 30)
    private RiskProfile riskProfile;

    @Enumerated(EnumType.STRING)
    @Column(name = "employment_status", length = 50)
    private EmploymentStatus employmentStatus;

    @Column(name = "employer_name", length = 255)
    private String employerName;

    @Column(name = "occupation", length = 100)
    private String occupation;

    @Column(name = "annual_income", precision = 18, scale = 2)
    private BigDecimal annualIncome;

    @Column(name = "liquidity_position", length = 100)
    private String liquidityPosition;

    @Column(name = "is_politically_exposed_person", nullable = false)
    private boolean politicallyExposedPerson;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "regulatory_disclosures", columnDefinition = "jsonb")
    private String regulatoryDisclosures;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "beneficial_owner_info", columnDefinition = "jsonb")
    private String beneficialOwnerInfo;

    @Column(name = "funds_source_verified", nullable = false)
    private boolean fundsSourceVerified;

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
     * Returns persistent financial profile identifier.
     * @return persistent financial profile identifier
     */
    public UUID getFinancialProfileId() {
        return financialProfileId;
    }

    /**
     * Sets persistent financial profile identifier.
     * @param financialProfileId persistent financial profile identifier
     */
    public void setFinancialProfileId(UUID financialProfileId) {
        this.financialProfileId = financialProfileId;
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
     * Returns know-your-customer review status.
     * @return know-your-customer review status
     */
    public String getKycStatus() {
        return kycStatus;
    }

    /**
     * Sets know-your-customer review status.
     * @param kycStatus know-your-customer review status
     */
    public void setKycStatus(String kycStatus) {
        this.kycStatus = kycStatus;
    }

    /**
     * Returns whether the customer declares accredited investor status.
     * @return whether the customer declares accredited investor status
     */
    public boolean isAccreditedInvestor() {
        return accreditedInvestor;
    }

    /**
     * Sets whether the customer declares accredited investor status.
     * @param accreditedInvestor whether the customer declares accredited investor status
     */
    public void setAccreditedInvestor(boolean accreditedInvestor) {
        this.accreditedInvestor = accreditedInvestor;
    }

    /**
     * Returns declared net worth bracket.
     * @return declared net worth bracket
     */
    public NetWorthBracket getNetWorthBracket() {
        return netWorthBracket;
    }

    /**
     * Sets declared net worth bracket.
     * @param netWorthBracket declared net worth bracket
     */
    public void setNetWorthBracket(NetWorthBracket netWorthBracket) {
        this.netWorthBracket = netWorthBracket;
    }

    /**
     * Returns declared investment risk profile.
     * @return declared investment risk profile
     */
    public RiskProfile getRiskProfile() {
        return riskProfile;
    }

    /**
     * Sets declared investment risk profile.
     * @param riskProfile declared investment risk profile
     */
    public void setRiskProfile(RiskProfile riskProfile) {
        this.riskProfile = riskProfile;
    }

    /**
     * Returns declared employment status.
     * @return declared employment status
     */
    public EmploymentStatus getEmploymentStatus() {
        return employmentStatus;
    }

    /**
     * Sets declared employment status.
     * @param employmentStatus declared employment status
     */
    public void setEmploymentStatus(EmploymentStatus employmentStatus) {
        this.employmentStatus = employmentStatus;
    }

    /**
     * Returns employer name.
     * @return employer name
     */
    public String getEmployerName() {
        return employerName;
    }

    /**
     * Sets employer name.
     * @param employerName employer name
     */
    public void setEmployerName(String employerName) {
        this.employerName = employerName;
    }

    /**
     * Returns declared occupation.
     * @return declared occupation
     */
    public String getOccupation() {
        return occupation;
    }

    /**
     * Sets declared occupation.
     * @param occupation declared occupation
     */
    public void setOccupation(String occupation) {
        this.occupation = occupation;
    }

    /**
     * Returns declared annual income.
     * @return declared annual income
     */
    public BigDecimal getAnnualIncome() {
        return annualIncome;
    }

    /**
     * Sets declared annual income.
     * @param annualIncome declared annual income
     */
    public void setAnnualIncome(BigDecimal annualIncome) {
        this.annualIncome = annualIncome;
    }

    /**
     * Returns declared liquidity position.
     * @return declared liquidity position
     */
    public String getLiquidityPosition() {
        return liquidityPosition;
    }

    /**
     * Sets declared liquidity position.
     * @param liquidityPosition declared liquidity position
     */
    public void setLiquidityPosition(String liquidityPosition) {
        this.liquidityPosition = liquidityPosition;
    }

    /**
     * Returns whether the customer is politically exposed.
     * @return whether the customer is politically exposed
     */
    public boolean isPoliticallyExposedPerson() {
        return politicallyExposedPerson;
    }

    /**
     * Sets whether the customer is politically exposed.
     * @param politicallyExposedPerson whether the customer is politically exposed
     */
    public void setPoliticallyExposedPerson(boolean politicallyExposedPerson) {
        this.politicallyExposedPerson = politicallyExposedPerson;
    }

    /**
     * Returns regulatory disclosures encoded as JSON for JSONB persistence.
     * @return regulatory disclosures encoded as JSON for JSONB persistence
     */
    public String getRegulatoryDisclosures() {
        return regulatoryDisclosures;
    }

    /**
     * Sets regulatory disclosures encoded as JSON for JSONB persistence.
     * @param regulatoryDisclosures regulatory disclosures encoded as JSON for JSONB persistence
     */
    public void setRegulatoryDisclosures(String regulatoryDisclosures) {
        this.regulatoryDisclosures = regulatoryDisclosures;
    }

    /**
     * Returns beneficial owner information encoded as JSON for JSONB persistence.
     * @return beneficial owner information encoded as JSON for JSONB persistence
     */
    public String getBeneficialOwnerInfo() {
        return beneficialOwnerInfo;
    }

    /**
     * Sets beneficial owner information encoded as JSON for JSONB persistence.
     * @param beneficialOwnerInfo beneficial owner information encoded as JSON for JSONB persistence
     */
    public void setBeneficialOwnerInfo(String beneficialOwnerInfo) {
        this.beneficialOwnerInfo = beneficialOwnerInfo;
    }

    /**
     * Returns whether the source of funds has been verified.
     * @return whether the source of funds has been verified
     */
    public boolean isFundsSourceVerified() {
        return fundsSourceVerified;
    }

    /**
     * Sets whether the source of funds has been verified.
     * @param fundsSourceVerified whether the source of funds has been verified
     */
    public void setFundsSourceVerified(boolean fundsSourceVerified) {
        this.fundsSourceVerified = fundsSourceVerified;
    }
}

