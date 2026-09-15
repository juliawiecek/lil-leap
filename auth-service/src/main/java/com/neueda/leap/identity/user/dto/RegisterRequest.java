package com.neueda.leap.identity.user.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.neueda.leap.identity.onboarding.enums.AccountType;
import com.neueda.leap.identity.onboarding.enums.CitizenshipStatus;
import com.neueda.leap.identity.onboarding.enums.EmploymentStatus;
import com.neueda.leap.identity.onboarding.enums.NetWorthBracket;
import com.neueda.leap.identity.onboarding.enums.RiskProfile;
import com.neueda.leap.identity.onboarding.enums.TraderLevel;
import com.neueda.leap.identity.user.UserRole;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Request DTO used to register a new user, for either role.
 *
 * <p>One shared request shape per AC2 ("one login endpoint for everyone") —
 * {@code userRole} decides which section of fields is actually required.
 * TRADER fields are validated by {@link #isTraderFieldsValid()} et al. when
 * {@code userRole == TRADER}; ANALYST fields by {@link #isAnalystFieldsValid()}
 * when {@code userRole == ANALYST}. All role-specific fields are optional at
 * the annotation level ({@code @Size}/{@code @Pattern} accept null) so a
 * payload for one role never has to carry the other role's requirements.</p>
 *
 * @param userRole which role to register — decides which extension table(s) get written
 * @param email the user's email address
 * @param password the raw password provided during registration
 * @param firstName (TRADER) the user's first name
 * @param lastName (TRADER) the user's last name
 * @param dateOfBirth (TRADER) the user's birth date; applicant must be at least 18
 * @param phone (TRADER) the user's phone number
 * @param streetAddress (TRADER) the first address line
 * @param apartment (TRADER) the second address line (optional)
 * @param city (TRADER) the user's city
 * @param stateProvince (TRADER) the user's state or province
 * @param postalCode (TRADER) the user's postal/ZIP code
 * @param country (TRADER) the user's country of residence
 * @param citizenshipStatus (TRADER) the user's citizenship or residency status
 * @param ssn (TRADER) the user's social security number in 9-digit or 123-45-6789 format (optional)
 * @param employmentStatus (TRADER) the user's employment status
 * @param employerName (TRADER) the employer or business name when employed/self-employed
 * @param occupation (TRADER) the occupation when employed/self-employed
 * @param annualIncome (TRADER) the annual income amount as a string value
 * @param netWorthBracket (TRADER) the selected net worth bracket
 * @param riskProfile (TRADER) the selected risk profile
 * @param liquidityPosition (TRADER) the liquid assets amount as a string value
 * @param accreditedInvestor (TRADER) whether the user self-identifies as accredited
 * @param accountName (TRADER) the display name for the account
 * @param accountType (TRADER) the account type value
 * @param traderLevel (TRADER) the selected trader level
 * @param politicallyExposedPerson (TRADER) whether the user is a politically exposed person
 * @param brokerAffiliation (TRADER) whether the user is affiliated with a broker-dealer
 * @param brokerFirmName (TRADER) affiliated broker firm name when broker affiliation is true
 * @param brokerAffiliationDetails (TRADER) affiliation details when broker affiliation is true
 * @param controlPerson (TRADER) whether the user is a control person of a public company
 * @param controlCompanyName (TRADER) company name when control person is true
 * @param controlCompanyRole (TRADER) role at the company when control person is true
 * @param otherBeneficialOwner (TRADER) whether someone else is the beneficial owner
 * @param beneficialOwnerName (TRADER) beneficial owner's name when another owner exists
 * @param beneficialOwnerRelationship (TRADER) beneficial owner's relationship when another owner exists
 * @param employeeId (ANALYST) internal employee identifier
 * @param department (ANALYST) internal department name (optional)
 */
public record RegisterRequest(

        @JsonProperty("user_role")
        @NotNull
        UserRole userRole,

        @JsonProperty("email")
        @NotBlank
        @Email
        @Size(max = 320)
        String email,

        @JsonProperty("password")
        @NotBlank
        @Size(min = 8, max = 128)
        String password,

        // ---- TRADER-only fields below; required only when userRole == TRADER ----

        @JsonProperty("first_name")
        @Size(max = 100)
        String firstName,

        @JsonProperty("last_name")
        @Size(max = 100)
        String lastName,

        @JsonProperty("date_of_birth")
        LocalDate dateOfBirth,

        @JsonProperty("phone")
        @Size(max = 30)
        String phone,

        @JsonProperty("street_address")
        @Size(max = 255)
        String streetAddress,

        @JsonProperty("apartment")
        @Size(max = 255)
        String apartment,

        @JsonProperty("city")
        @Size(max = 100)
        String city,

        @JsonProperty("state_province")
        @Size(max = 100)
        String stateProvince,

        @JsonProperty("postal_code")
        @Size(max = 20)
        String postalCode,

        @JsonProperty("country")
        @Size(max = 100)
        String country,

        @JsonProperty("citizenship_status")
        CitizenshipStatus citizenshipStatus,

        @JsonProperty("ssn")
        @Pattern(
                regexp = "^(\\d{9}|\\d{3}-\\d{2}-\\d{4})?$",
                message = "SSN must be 9 digits or 123-45-6789"
        )
        String ssn,

        @JsonProperty("employment_status")
        EmploymentStatus employmentStatus,

        @JsonProperty("employer_name")
        @Size(max = 255)
        String employerName,

        @JsonProperty("occupation")
        @Size(max = 100)
        String occupation,

        @JsonProperty("annual_income")
        @Size(max = 32)
        String annualIncome,

        @JsonProperty("net_worth_bracket")
        NetWorthBracket netWorthBracket,

        @JsonProperty("risk_profile")
        RiskProfile riskProfile,

        @JsonProperty("liquidity_position")
        @Size(max = 32)
        String liquidityPosition,

        @JsonProperty("accredited_investor")
        Boolean accreditedInvestor,

        @JsonProperty("account_name")
        @Size(max = 100)
        String accountName,

        @JsonProperty("account_type")
        AccountType accountType,

        @JsonProperty("trader_level")
        TraderLevel traderLevel,

        @JsonProperty("is_politically_exposed_person")
        Boolean politicallyExposedPerson,

        @JsonProperty("broker_affiliation")
        Boolean brokerAffiliation,

        @JsonProperty("broker_firm_name")
        @Size(max = 255)
        String brokerFirmName,

        @JsonProperty("broker_affiliation_details")
        @Size(max = 255)
        String brokerAffiliationDetails,

        @JsonProperty("control_person")
        Boolean controlPerson,

        @JsonProperty("control_company_name")
        @Size(max = 255)
        String controlCompanyName,

        @JsonProperty("control_company_role")
        @Size(max = 255)
        String controlCompanyRole,

        @JsonProperty("other_beneficial_owner")
        Boolean otherBeneficialOwner,

        @JsonProperty("beneficial_owner_name")
        @Size(max = 255)
        String beneficialOwnerName,

        @JsonProperty("beneficial_owner_relationship")
        @Size(max = 255)
        String beneficialOwnerRelationship,

        // ---- ANALYST-only fields below; required only when userRole == ANALYST ----

        @JsonProperty("employee_id")
        @Size(max = 30)
        String employeeId,

        @JsonProperty("department")
        @Size(max = 100)
        String department

) {

    @Override
    public String toString() {
        return "RegisterRequest[userRole=" + userRole + ", personalData=[REDACTED], password=[REDACTED], ssn=[REDACTED]]";
    }

    /**
     * Ensures the core TRADER fields are present when registering a trader.
     *
     * @return true when either not a TRADER registration, or all required TRADER fields are present
     */
    @AssertTrue(message = "firstName, lastName, dateOfBirth, phone, streetAddress, city, stateProvince, "
            + "postalCode, country and citizenshipStatus are required for TRADER registration")
    public boolean isTraderFieldsValid() {
        if (userRole != UserRole.TRADER) {
            return true;
        }
        return notBlank(firstName) && notBlank(lastName) && dateOfBirth != null
                && notBlank(phone) && notBlank(streetAddress) && notBlank(city)
                && notBlank(stateProvince) && notBlank(postalCode) && notBlank(country)
                && citizenshipStatus != null;
    }

    /**
     * Ensures the core financial-onboarding fields are present when registering a trader.
     *
     * @return true when either not a TRADER registration, or all required financial fields are present
     */
    @AssertTrue(message = "employmentStatus, annualIncome, netWorthBracket, riskProfile, liquidityPosition, "
            + "accreditedInvestor and isPoliticallyExposedPerson are required for TRADER registration")
    public boolean isTraderFinancialFieldsValid() {
        if (userRole != UserRole.TRADER) {
            return true;
        }
        return employmentStatus != null && notBlank(annualIncome) && netWorthBracket != null
                && riskProfile != null && notBlank(liquidityPosition)
                && accreditedInvestor != null && politicallyExposedPerson != null;
    }

    /**
     * Ensures the core account fields are present when registering a trader.
     *
     * @return true when either not a TRADER registration, or all required account fields are present
     */
    @AssertTrue(message = "accountName, accountType and traderLevel are required for TRADER registration")
    public boolean isTraderAccountFieldsValid() {
        if (userRole != UserRole.TRADER) {
            return true;
        }
        return notBlank(accountName) && accountType != null && traderLevel != null;
    }

    /**
     * Ensures conditional broker fields are provided when broker affiliation is true.
     *
     * @return true when the broker details are valid for the chosen affiliation flag
     */
    @AssertTrue(message = "Broker firm name and affiliation details are required when broker affiliation is true")
    public boolean isBrokerDisclosureValid() {
        return !Boolean.TRUE.equals(brokerAffiliation)
                || (notBlank(brokerFirmName) && notBlank(brokerAffiliationDetails));
    }

    /**
     * Ensures conditional control person fields are provided when control person is true.
     *
     * @return true when the control person details are valid for the chosen flag
     */
    @AssertTrue(message = "Control company name and role are required when control person is true")
    public boolean isControlPersonDisclosureValid() {
        return !Boolean.TRUE.equals(controlPerson)
                || (notBlank(controlCompanyName) && notBlank(controlCompanyRole));
    }

    /**
     * Ensures beneficial owner fields are provided when another beneficial owner is declared.
     *
     * @return true when beneficial owner details are valid for the chosen flag
     */
    @AssertTrue(message = "Beneficial owner name and relationship are required when other beneficial owner is true")
    public boolean isBeneficialOwnerDisclosureValid() {
        return !Boolean.TRUE.equals(otherBeneficialOwner)
                || (notBlank(beneficialOwnerName) && notBlank(beneficialOwnerRelationship));
    }

    /**
     * Ensures employer fields are provided when employed or self-employed is selected.
     *
     * @return true when employment detail requirements are satisfied
     */
    @AssertTrue(message = "Employer name and occupation are required for employed or self-employed status")
    public boolean isEmploymentDetailsValid() {
        boolean needsDetails = employmentStatus == EmploymentStatus.EMPLOYED
                || employmentStatus == EmploymentStatus.SELF_EMPLOYED;
        return !needsDetails || (notBlank(employerName) && notBlank(occupation));
    }

    /**
     * Ensures the core ANALYST fields are present when registering an analyst.
     *
     * @return true when either not an ANALYST registration, or all required ANALYST fields are present
     */
    @AssertTrue(message = "employeeId is required for ANALYST registration")
    public boolean isAnalystFieldsValid() {
        if (userRole != UserRole.ANALYST) {
            return true;
        }
        return notBlank(employeeId);
    }

    private static boolean notBlank(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
