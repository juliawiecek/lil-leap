package com.neueda.leap.onboarding.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.neueda.leap.onboarding.enums.AccountType;
import com.neueda.leap.onboarding.enums.CitizenshipStatus;
import com.neueda.leap.onboarding.enums.EmploymentStatus;
import com.neueda.leap.onboarding.enums.NetWorthBracket;
import com.neueda.leap.onboarding.enums.RiskProfile;
import com.neueda.leap.onboarding.enums.TraderLevel;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Request DTO used to register a new user and complete investor onboarding fields.
 *
 * @param firstName the user's first name
 * @param lastName the user's last name
 * @param dateOfBirth the user's birth date; applicant must be at least 18
 * @param email the user's email address
 * @param phone the user's phone number
 * @param password the raw password provided during registration
 * @param streetAddress the first address line
 * @param apartment the second address line (optional)
 * @param city the user's city
 * @param stateProvince the user's state or province
 * @param postalCode the user's postal/ZIP code
 * @param country the user's country of residence
 * @param citizenshipStatus the user's citizenship or residency status
 * @param ssn the user's social security number in 9-digit or 123-45-6789 format
 * @param employmentStatus the user's employment status
 * @param employerName the employer or business name when employed/self-employed
 * @param occupation the occupation when employed/self-employed
 * @param annualIncome the annual income amount as a string value
 * @param netWorthBracket the selected net worth bracket
 * @param riskProfile the selected risk profile
 * @param liquidityPosition the liquid assets amount as a string value
 * @param accreditedInvestor whether the user self-identifies as accredited
 * @param accountName the display name for the account
 * @param accountType the account type value
 * @param traderLevel the selected trader level
 * @param politicallyExposedPerson whether the user is a politically exposed person
 * @param brokerAffiliation whether the user is affiliated with a broker-dealer
 * @param brokerFirmName affiliated broker firm name when broker affiliation is true
 * @param brokerAffiliationDetails affiliation details when broker affiliation is true
 * @param controlPerson whether the user is a control person of a public company
 * @param controlCompanyName company name when control person is true
 * @param controlCompanyRole role at the company when control person is true
 * @param otherBeneficialOwner whether someone else is the beneficial owner
 * @param beneficialOwnerName beneficial owner's name when another owner exists
 * @param beneficialOwnerRelationship beneficial owner's relationship when another owner exists
 */
public record RegisterUserRequest (

        @JsonProperty("first_name")
        @NotBlank
        @Size(max = 100)
        String firstName,

        @JsonProperty("last_name")
        @NotBlank
        @Size(max = 100)
        String lastName,

        @JsonProperty("date_of_birth")
        @NotNull
        LocalDate dateOfBirth,

        @JsonProperty("email")
        @NotBlank
        @Email
        @Size(max = 255)
        String email,

        @JsonProperty("phone")
        @NotBlank
        @Size(max = 20)
        String phone,

        @JsonProperty("password")
        @NotBlank
        @Size(min = 8, max = 128)
        String password,

        @JsonProperty("street_address")
        @NotBlank
        @Size(max = 255)
        String streetAddress,

        @JsonProperty("apartment")
        @Size(max = 255)
        String apartment,

        @JsonProperty("city")
        @NotBlank
        @Size(max = 100)
        String city,

        @JsonProperty("state_province")
        @NotBlank
        @Size(max = 100)
        String stateProvince,

        @JsonProperty("postal_code")
        @NotBlank
        @Size(max = 20)
        String postalCode,

        @JsonProperty("country")
        @NotBlank
        @Size(max = 100)
        String country,

        @JsonProperty("citizenship_status")
        @NotNull
        CitizenshipStatus citizenshipStatus,

        @JsonProperty("ssn")
        @NotBlank
        @Pattern(
                regexp = "^(\\d{9}|\\d{3}-\\d{2}-\\d{4})$",
                message = "SSN must be 9 digits or 123-45-6789"
        )
        String ssn,

        @JsonProperty("employment_status")
        @NotNull
        EmploymentStatus employmentStatus,

        @JsonProperty("employer_name")
        @Size(max = 255)
        String employerName,

        @JsonProperty("occupation")
        @Size(max = 100)
        String occupation,

        @JsonProperty("annual_income")
        @NotBlank
        @Size(max = 32)
        String annualIncome,

        @JsonProperty("net_worth_bracket")
        @NotNull
        NetWorthBracket netWorthBracket,

        @JsonProperty("risk_profile")
        @NotNull
        RiskProfile riskProfile,

        @JsonProperty("liquidity_position")
        @NotBlank
        @Size(max = 32)
        String liquidityPosition,

        @JsonProperty("accredited_investor")
        @NotNull
        Boolean accreditedInvestor,

        @JsonProperty("account_name")
        @NotBlank
        @Size(max = 100)
        String accountName,

        @JsonProperty("account_type")
        @NotNull
        AccountType accountType,

        @JsonProperty("trader_level")
        @NotNull
        TraderLevel traderLevel,

        @JsonProperty("is_politically_exposed_person")
        @NotNull
        Boolean politicallyExposedPerson,

        @JsonProperty("broker_affiliation")
        @NotNull
        Boolean brokerAffiliation,

        @JsonProperty("broker_firm_name")
        @Size(max = 255)
        String brokerFirmName,

        @JsonProperty("broker_affiliation_details")
        @Size(max = 255)
        String brokerAffiliationDetails,

        @JsonProperty("control_person")
        @NotNull
        Boolean controlPerson,

        @JsonProperty("control_company_name")
        @Size(max = 255)
        String controlCompanyName,

        @JsonProperty("control_company_role")
        @Size(max = 255)
        String controlCompanyRole,

        @JsonProperty("other_beneficial_owner")
        @NotNull
        Boolean otherBeneficialOwner,

        @JsonProperty("beneficial_owner_name")
        @Size(max = 255)
        String beneficialOwnerName,

        @JsonProperty("beneficial_owner_relationship")
        @Size(max = 255)
        String beneficialOwnerRelationship

) {

    @Override
    public String toString() {
        return "RegisterUserRequest[personalData=[REDACTED], password=[REDACTED], ssn=[REDACTED]]";
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

    private static boolean notBlank(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
