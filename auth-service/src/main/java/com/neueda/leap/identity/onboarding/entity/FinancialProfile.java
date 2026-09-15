package com.neueda.leap.identity.onboarding.entity;

import com.neueda.leap.identity.onboarding.enums.EmploymentStatus;
import com.neueda.leap.identity.onboarding.enums.NetWorthBracket;
import com.neueda.leap.identity.onboarding.enums.RiskProfile;
import com.neueda.leap.identity.user.entity.User;
import jakarta.persistence.Column;
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

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Financial and regulatory onboarding profile for a user.
 */
@Entity
@Table(name = "financial_profiles")
public class FinancialProfile {

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

    // No @Enumerated here deliberately — NetWorthBracketConverter (autoApply = true)
    // persists the dollar-range string ("$0-5k") the DB's chk_net_worth_bracket
    // constraint expects, not the enum constant name @Enumerated(STRING) would use.
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

    @Column(name = "regulatory_disclosures", columnDefinition = "jsonb")
    private String regulatoryDisclosures;

    @Column(name = "beneficial_owner_info", columnDefinition = "jsonb")
    private String beneficialOwnerInfo;

    @Column(name = "funds_source_verified", nullable = false)
    private boolean fundsSourceVerified;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = Instant.now();
    }

    public UUID getFinancialProfileId() {
        return financialProfileId;
    }

    public void setFinancialProfileId(UUID financialProfileId) {
        this.financialProfileId = financialProfileId;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public String getKycStatus() {
        return kycStatus;
    }

    public void setKycStatus(String kycStatus) {
        this.kycStatus = kycStatus;
    }

    public boolean isAccreditedInvestor() {
        return accreditedInvestor;
    }

    public void setAccreditedInvestor(boolean accreditedInvestor) {
        this.accreditedInvestor = accreditedInvestor;
    }

    public NetWorthBracket getNetWorthBracket() {
        return netWorthBracket;
    }

    public void setNetWorthBracket(NetWorthBracket netWorthBracket) {
        this.netWorthBracket = netWorthBracket;
    }

    public RiskProfile getRiskProfile() {
        return riskProfile;
    }

    public void setRiskProfile(RiskProfile riskProfile) {
        this.riskProfile = riskProfile;
    }

    public EmploymentStatus getEmploymentStatus() {
        return employmentStatus;
    }

    public void setEmploymentStatus(EmploymentStatus employmentStatus) {
        this.employmentStatus = employmentStatus;
    }

    public String getEmployerName() {
        return employerName;
    }

    public void setEmployerName(String employerName) {
        this.employerName = employerName;
    }

    public String getOccupation() {
        return occupation;
    }

    public void setOccupation(String occupation) {
        this.occupation = occupation;
    }

    public BigDecimal getAnnualIncome() {
        return annualIncome;
    }

    public void setAnnualIncome(BigDecimal annualIncome) {
        this.annualIncome = annualIncome;
    }

    public String getLiquidityPosition() {
        return liquidityPosition;
    }

    public void setLiquidityPosition(String liquidityPosition) {
        this.liquidityPosition = liquidityPosition;
    }

    public boolean isPoliticallyExposedPerson() {
        return politicallyExposedPerson;
    }

    public void setPoliticallyExposedPerson(boolean politicallyExposedPerson) {
        this.politicallyExposedPerson = politicallyExposedPerson;
    }

    public String getRegulatoryDisclosures() {
        return regulatoryDisclosures;
    }

    public void setRegulatoryDisclosures(String regulatoryDisclosures) {
        this.regulatoryDisclosures = regulatoryDisclosures;
    }

    public String getBeneficialOwnerInfo() {
        return beneficialOwnerInfo;
    }

    public void setBeneficialOwnerInfo(String beneficialOwnerInfo) {
        this.beneficialOwnerInfo = beneficialOwnerInfo;
    }

    public boolean isFundsSourceVerified() {
        return fundsSourceVerified;
    }

    public void setFundsSourceVerified(boolean fundsSourceVerified) {
        this.fundsSourceVerified = fundsSourceVerified;
    }
}
