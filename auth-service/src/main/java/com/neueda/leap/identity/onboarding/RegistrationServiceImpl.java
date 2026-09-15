package com.neueda.leap.identity.onboarding;

import com.neueda.leap.identity.onboarding.entity.Account;
import com.neueda.leap.identity.onboarding.entity.AnalystProfile;
import com.neueda.leap.identity.onboarding.entity.CustomerProfile;
import com.neueda.leap.identity.onboarding.entity.FinancialProfile;
import com.neueda.leap.identity.onboarding.enums.TraderLevel;
import com.neueda.leap.identity.onboarding.repository.AccountRepository;
import com.neueda.leap.identity.onboarding.repository.AnalystProfileRepository;
import com.neueda.leap.identity.onboarding.repository.CustomerProfileRepository;
import com.neueda.leap.identity.onboarding.repository.FinancialProfileRepository;
import com.neueda.leap.identity.security.SsnEncryptionService;
import com.neueda.leap.identity.user.UserRole;
import com.neueda.leap.identity.user.dto.RegisterRequest;
import com.neueda.leap.identity.user.entity.User;
import com.neueda.leap.identity.user.exception.UserAlreadyExistsException;
import com.neueda.leap.identity.user.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.Period;
import java.util.Locale;
import java.util.UUID;

/**
 * Service responsible for registration business logic.
 *
 * <p>The TRADER path (validation, normalization, and persisted tables) mirrors
 * NextTrade backend's {@code RegistrationServiceImpl} exactly. The ANALYST
 * path is new — backend's current registration only ever creates TRADER
 * accounts, so there was no existing logic to base it on.</p>
 */
@Service
public class RegistrationServiceImpl implements RegistrationService {

    private final UserRepository userRepository;
    private final CustomerProfileRepository customerProfileRepository;
    private final FinancialProfileRepository financialProfileRepository;
    private final AccountRepository accountRepository;
    private final AnalystProfileRepository analystProfileRepository;
    private final PasswordEncoder passwordEncoder;
    private final SsnEncryptionService ssnEncryptionService;

    /**
     * Creates a new registration service with required dependencies.
     *
     * @param userRepository authentication user repository
     * @param customerProfileRepository customer profile repository
     * @param financialProfileRepository financial profile repository
     * @param accountRepository account repository
     * @param analystProfileRepository analyst profile repository
     * @param passwordEncoder password encoder
     * @param ssnEncryptionService SSN encryption service
     */
    public RegistrationServiceImpl(
            UserRepository userRepository,
            CustomerProfileRepository customerProfileRepository,
            FinancialProfileRepository financialProfileRepository,
            AccountRepository accountRepository,
            AnalystProfileRepository analystProfileRepository,
            PasswordEncoder passwordEncoder,
            SsnEncryptionService ssnEncryptionService
    ) {
        this.userRepository = userRepository;
        this.customerProfileRepository = customerProfileRepository;
        this.financialProfileRepository = financialProfileRepository;
        this.accountRepository = accountRepository;
        this.analystProfileRepository = analystProfileRepository;
        this.passwordEncoder = passwordEncoder;
        this.ssnEncryptionService = ssnEncryptionService;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    @Transactional
    public User register(RegisterRequest request) {
        String normalizedEmail = request.email().trim().toLowerCase(Locale.ROOT);

        if (userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new UserAlreadyExistsException("An account with this email already exists.");
        }

        User user = new User();
        user.setEmail(normalizedEmail);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setUserRole(request.userRole().name());
        User savedUser = userRepository.save(user);

        if (request.userRole() == UserRole.ANALYST) {
            registerAnalyst(request, savedUser);
        } else {
            registerTrader(request, savedUser);
        }

        return savedUser;
    }

    /**
     * Persists the ANALYST-only extension table for a newly created user.
     *
     * @param request the registration request
     * @param user the already-persisted user entity
     */
    private void registerAnalyst(RegisterRequest request, User user) {
        AnalystProfile profile = new AnalystProfile();
        profile.setUser(user);
        profile.setEmployeeId(request.employeeId().trim());
        profile.setDepartment(trimToNull(request.department()));
        analystProfileRepository.save(profile);
    }

    /**
     * Persists the TRADER-only extension tables for a newly created user:
     * identity/contact profile, financial onboarding profile, and a trading
     * account. Mirrors NextTrade backend's {@code RegistrationServiceImpl}.
     *
     * @param request the registration request
     * @param user the already-persisted user entity
     */
    private void registerTrader(RegisterRequest request, User user) {
        validateAdult(request.dateOfBirth());

        // Store SSN encrypted in customer profile; user auth table does not carry SSN.
        String normalizedSsn = normalizeSsn(request.ssn());
        byte[] encryptedSsn = ssnEncryptionService.encrypt(normalizedSsn);

        CustomerProfile profile = new CustomerProfile();
        profile.setUser(user);
        profile.setFirstName(request.firstName().trim());
        profile.setLastName(request.lastName().trim());
        profile.setDateOfBirth(request.dateOfBirth());
        profile.setPhone(request.phone().trim());
        profile.setAddress(buildAddressLine(request));
        profile.setCountry(request.country().trim());
        profile.setCitizenshipStatus(request.citizenshipStatus());
        profile.setSsnEncrypted(encryptedSsn);
        customerProfileRepository.save(profile);

        FinancialProfile financialProfile = new FinancialProfile();
        financialProfile.setUser(user);
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
        account.setUser(user);
        account.setAccountNumber(generateAccountNumber());
        account.setAccountName(request.accountName().trim());
        account.setAccountType(request.accountType());
        account.setTraderLevel(request.traderLevel());
        account.setMinBalanceRequirement(minBalanceFor(request.traderLevel()));
        accountRepository.save(account);
    }

    /**
     * Validates that the user is at least 18 years old.
     *
     * @param dateOfBirth user date of birth
     */
    private void validateAdult(LocalDate dateOfBirth) {
        if (dateOfBirth == null || Period.between(dateOfBirth, LocalDate.now()).getYears() < 18) {
            throw new IllegalArgumentException("User must be at least 18 years old.");
        }
    }

    /**
     * Joins structured address fields into the single address column expected by schema.
     *
     * @param request registration request
     * @return compact address line
     */
    private String buildAddressLine(RegisterRequest request) {
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
    private String buildRegulatoryDisclosuresJson(RegisterRequest request) {
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
    private String buildBeneficialOwnerJson(RegisterRequest request) {
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
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
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
