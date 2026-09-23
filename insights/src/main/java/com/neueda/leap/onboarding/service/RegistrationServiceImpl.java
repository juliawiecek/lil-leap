package com.neueda.leap.onboarding.service;

import com.neueda.leap.onboarding.dto.RegisterUserRequest;
import com.neueda.leap.onboarding.dto.UserResponse;
import com.neueda.leap.onboarding.entity.Account;
import com.neueda.leap.onboarding.entity.CustomerProfile;
import com.neueda.leap.onboarding.entity.FinancialProfile;
import com.neueda.leap.user.entity.User;
import com.neueda.leap.onboarding.enums.TraderLevel;
import com.neueda.leap.user.exception.UserAlreadyExistsException;
import com.neueda.leap.onboarding.repository.AccountRepository;
import com.neueda.leap.onboarding.repository.CustomerProfileRepository;
import com.neueda.leap.onboarding.repository.FinancialProfileRepository;
import com.neueda.leap.security.SsnEncryptionService;
import com.neueda.leap.user.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Locale;
import java.util.UUID;

/**
 * Service responsible for registration business logic.
 *
 * <p>This service validates uniqueness of the user's email address,
 * normalizes incoming onboarding values, and persists normalized records
 * across authentication, profile, financial, and account tables.</p>
 */
@Service
public class RegistrationServiceImpl implements RegistrationService {

    private final UserRepository userRepository;
    private final CustomerProfileRepository customerProfileRepository;
    private final FinancialProfileRepository financialProfileRepository;
    private final AccountRepository accountRepository;
    private final PasswordEncoder passwordEncoder;
    private final SsnEncryptionService ssnEncryptionService;

    /**
     * Creates a new registration service with required dependencies.
     *
     * @param userRepository authentication user repository
     * @param customerProfileRepository customer profile repository
     * @param financialProfileRepository financial profile repository
     * @param accountRepository account repository
     * @param passwordEncoder password encoder
     * @param ssnEncryptionService SSN encryption service
     */
    public RegistrationServiceImpl(
            UserRepository userRepository,
            CustomerProfileRepository customerProfileRepository,
            FinancialProfileRepository financialProfileRepository,
            AccountRepository accountRepository,
            PasswordEncoder passwordEncoder,
            SsnEncryptionService ssnEncryptionService
    ) {
        this.userRepository = userRepository;
        this.customerProfileRepository = customerProfileRepository;
        this.financialProfileRepository = financialProfileRepository;
        this.accountRepository = accountRepository;
        this.passwordEncoder = passwordEncoder;
        this.ssnEncryptionService = ssnEncryptionService;
    }

    /**
     * Registers a new user from the provided request data.
     *
     * @param request the registration request containing user details
     * @return a {@link UserResponse} representing the saved user
     * @throws UserAlreadyExistsException if a user with the normalized email already exists
     * @throws IllegalArgumentException if the date of birth is missing or the user is under 21
     */
    @Override
    @Transactional
    public UserResponse register(RegisterUserRequest request) {
        String normalizedEmail = request.email().trim().toLowerCase(Locale.ROOT);

        if (userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new UserAlreadyExistsException("An account with this email already exists.");
        }

        validateAdult(request.dateOfBirth());

        User user = new User();
        user.setEmail(normalizedEmail);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        User savedUser = userRepository.save(user);

        // Store SSN encrypted in customer profile; user auth table does not carry SSN.
        String normalizedSsn = normalizeSsn(request.ssn());
        byte[] encryptedSsn = ssnEncryptionService.encrypt(normalizedSsn);

        CustomerProfile profile = new CustomerProfile();
        profile.setUser(savedUser);
        profile.setFirstName(request.firstName().trim());
        profile.setLastName(request.lastName().trim());
        profile.setDateOfBirth(request.dateOfBirth());
        profile.setPhone(request.phone().trim());
        profile.setAddress(buildAddressLine(request));
        profile.setCountry(request.country().trim());
        profile.setCitizenshipStatus(request.citizenshipStatus());
        profile.setSsnEncrypted(encryptedSsn);
        CustomerProfile savedProfile = customerProfileRepository.save(profile);

        FinancialProfile financialProfile = new FinancialProfile();
        financialProfile.setUser(savedUser);
        financialProfile.setAccreditedInvestor(Boolean.TRUE.equals(request.accreditedInvestor()));
        financialProfile.setNetWorthBracket(request.netWorthBracket());
        financialProfile.setRiskProfile(request.riskProfile());
        financialProfile.setEmploymentStatus(request.employmentStatus());
        financialProfile.setEmployerName(trimToNull(request.employerName()));
        financialProfile.setOccupation(trimToNull(request.occupation()));
        financialProfile.setAnnualIncome(parseCurrencyAmount(request.annualIncome()));
        financialProfile.setLiquidityPosition(normalizeMoney(request.liquidityPosition()));
        financialProfile.setPoliticallyExposedPerson(Boolean.TRUE.equals(request.politicallyExposedPerson()));
        financialProfile.setRegulatoryDisclosures(buildRegulatoryDisclosuresJson(request));
        financialProfile.setBeneficialOwnerInfo(buildBeneficialOwnerJson(request));
        financialProfile.setFundsSourceVerified(false);
        financialProfileRepository.save(financialProfile);

        Account account = new Account();
        account.setUser(savedUser);
        account.setAccountNumber(generateAccountNumber());
        account.setAccountName(request.accountName().trim());
        account.setAccountType(request.accountType());
        account.setTraderLevel(request.traderLevel());
        account.setMinBalanceRequirement(minBalanceFor(request.traderLevel()));
        Account savedAccount = accountRepository.save(account);

        return UserResponse.from(savedUser, savedProfile, savedAccount);
    }

    /**
     * Validates that the user is at least 21 years old.
     *
     * @param dateOfBirth user date of birth
     */
    private void validateAdult(LocalDate dateOfBirth) {
        if (dateOfBirth == null || dateOfBirth.isAfter(LocalDate.now(ZoneOffset.UTC).minusYears(21))) {
            throw new com.neueda.leap.onboarding.exception.RegistrationValidationException("User must be at least 21 years old.");
        }
    }

    /**
     * Joins structured address fields into the single address column expected by schema.
     *
     * @param request registration request
     * @return compact address line
     */
    private String buildAddressLine(RegisterUserRequest request) {
        String apartment = trimToNull(request.apartment());
        if (apartment == null) {
            return String.join(", ", request.streetAddress().trim(), request.city().trim(), request.stateProvince().trim(), request.postalCode().trim());
        }
        return String.join(", ", request.streetAddress().trim(), apartment, request.city().trim(), request.stateProvince().trim(), request.postalCode().trim());
    }

    /**
     * Builds regulatory disclosure JSON for flexible storage.
     *
     * @param request registration request
     * @return serialized JSON payload
     */
    private String buildRegulatoryDisclosuresJson(RegisterUserRequest request) {
        return "{" +
                "\"brokerAffiliation\":" + Boolean.TRUE.equals(request.brokerAffiliation()) + "," +
                "\"brokerFirmName\":\"" + escapeJson(trimToNull(request.brokerFirmName())) + "\"," +
                "\"brokerAffiliationDetails\":\"" + escapeJson(trimToNull(request.brokerAffiliationDetails())) + "\"," +
                "\"controlPerson\":" + Boolean.TRUE.equals(request.controlPerson()) + "," +
                "\"controlCompanyName\":\"" + escapeJson(trimToNull(request.controlCompanyName())) + "\"," +
                "\"controlCompanyRole\":\"" + escapeJson(trimToNull(request.controlCompanyRole())) + "\"" +
                "}";
    }

    /**
     * Builds beneficial owner JSON for flexible storage.
     *
     * @param request registration request
     * @return serialized JSON payload
     */
    private String buildBeneficialOwnerJson(RegisterUserRequest request) {
        return "{" +
                "\"otherBeneficialOwner\":" + Boolean.TRUE.equals(request.otherBeneficialOwner()) + "," +
                "\"beneficialOwnerName\":\"" + escapeJson(trimToNull(request.beneficialOwnerName())) + "\"," +
                "\"beneficialOwnerRelationship\":\"" + escapeJson(trimToNull(request.beneficialOwnerRelationship())) + "\"" +
                "}";
    }

    /**
     * Removes all non-digit SSN separators.
     *
     * @param value SSN value from request
     * @return normalized digits-only SSN or {@code null}
     */
    private String normalizeSsn(String value) {
        String trimmed = trimToNull(value);
        return trimmed == null ? null : trimmed.replaceAll("\\D", "");
    }

    /**
     * Removes currency separators from numeric text values.
     *
     * @param value amount string from request
     * @return normalized amount without commas or {@code null}
     */
    private String normalizeMoney(String value) {
        String trimmed = trimToNull(value);
        return trimmed == null ? null : trimmed.replace(",", "");
    }

    /**
     * Parses a currency string into a decimal amount.
     *
     * @param value amount text from request
     * @return decimal amount or {@code null}
     */
    private BigDecimal parseCurrencyAmount(String value) {
        String normalized = normalizeMoney(value);
        return normalized == null ? null : new BigDecimal(normalized);
    }

    /**
     * Converts blank strings to {@code null}.
     *
     * @param value raw input value
     * @return trimmed value or {@code null}
     */
    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * Escapes quotes in JSON string values.
     *
     * @param value raw value
     * @return escaped value (empty when null)
     */
    private String escapeJson(String value) {
        if (value == null) {
            return "";
        }
        return new String(com.fasterxml.jackson.core.io.JsonStringEncoder.getInstance().quoteAsString(value));
    }

    /**
     * Generates a deterministic-length account number with an NT prefix.
     *
     * @return account number candidate
     */
    private String generateAccountNumber() {
        return "NT" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase(Locale.ROOT);
    }

    /**
     * Returns minimum balance by trader level.
     *
     * @param traderLevel selected trader level
     * @return required minimum balance
     */
    private BigDecimal minBalanceFor(TraderLevel traderLevel) {
        return traderLevel == TraderLevel.ADVANCED ? new BigDecimal("100000.00") : new BigDecimal("5000.00");
    }
}




