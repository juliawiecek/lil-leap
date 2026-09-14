package com.neueda.leap.onboarding;

import com.neueda.leap.onboarding.dto.RegisterUserRequest;
import com.neueda.leap.onboarding.dto.UserResponse;
import com.neueda.leap.onboarding.entity.Account;
import com.neueda.leap.onboarding.entity.CustomerProfile;
import com.neueda.leap.onboarding.entity.FinancialProfile;
import com.neueda.leap.user.entity.User;
import com.neueda.leap.onboarding.enums.AccountType;
import com.neueda.leap.onboarding.enums.CitizenshipStatus;
import com.neueda.leap.onboarding.enums.EmploymentStatus;
import com.neueda.leap.onboarding.enums.NetWorthBracket;
import com.neueda.leap.onboarding.enums.RiskProfile;
import com.neueda.leap.onboarding.enums.TraderLevel;
import com.neueda.leap.user.exception.UserAlreadyExistsException;
import com.neueda.leap.onboarding.repository.AccountRepository;
import com.neueda.leap.onboarding.repository.CustomerProfileRepository;
import com.neueda.leap.onboarding.repository.FinancialProfileRepository;
import com.neueda.leap.user.repository.UserRepository;
import com.neueda.leap.onboarding.service.RegistrationService;
import com.neueda.leap.security.SsnEncryptionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.mock;

/**
 * Unit tests for {@link RegistrationService} registration behavior.
 */
@ExtendWith(MockitoExtension.class)
class RegistrationServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private CustomerProfileRepository customerProfileRepository;

    @Mock
    private FinancialProfileRepository financialProfileRepository;

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    private RegistrationService registrationService;

    @org.junit.jupiter.api.BeforeEach
    void setUp() {
        // Use a test double for SsnEncryptionService that doesn't require EntityManager
        SsnEncryptionService ssnEncryptionService = new TestSsnEncryptionService();
        registrationService = new RegistrationService(
                userRepository,
                customerProfileRepository,
                financialProfileRepository,
                accountRepository,
                passwordEncoder,
                ssnEncryptionService
        );
    }

    /**
     * Simple test double for SSN encryption - encrypts by prefixing with "ENCRYPTED_"
     */
    private static class TestSsnEncryptionService extends SsnEncryptionService {
        TestSsnEncryptionService() {
            super(null, "test-key");
        }

        @Override
        public byte[] encrypt(String plainTextSsn) {
            return ("ENCRYPTED_" + plainTextSsn).getBytes();
        }

        @Override
        public String decrypt(byte[] encryptedSsn) {
            String encrypted = new String(encryptedSsn);
            return encrypted.startsWith("ENCRYPTED_") ? encrypted.substring(10) : encrypted;
        }
    }

    @Test
    void register_shouldCreateNormalizedRecords() {
        RegisterUserRequest request = createValidRequest("JULIA@EXAMPLE.COM");

        when(userRepository.existsByEmailIgnoreCase("julia@example.com")).thenReturn(false);
        when(passwordEncoder.encode("Password123!")).thenReturn("hashedPassword");

        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            user.setUserId(UUID.fromString("11111111-1111-1111-1111-111111111111"));
            return user;
        });
        when(customerProfileRepository.save(any(CustomerProfile.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(financialProfileRepository.save(any(FinancialProfile.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(accountRepository.save(any(Account.class))).thenAnswer(invocation -> invocation.getArgument(0));

        UserResponse response = registrationService.register(request);

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        ArgumentCaptor<CustomerProfile> profileCaptor = ArgumentCaptor.forClass(CustomerProfile.class);
        ArgumentCaptor<FinancialProfile> financialCaptor = ArgumentCaptor.forClass(FinancialProfile.class);
        ArgumentCaptor<Account> accountCaptor = ArgumentCaptor.forClass(Account.class);

        verify(userRepository).save(userCaptor.capture());
        verify(customerProfileRepository).save(profileCaptor.capture());
        verify(financialProfileRepository).save(financialCaptor.capture());
        verify(accountRepository).save(accountCaptor.capture());

        User savedUser = userCaptor.getValue();
        CustomerProfile savedProfile = profileCaptor.getValue();
        FinancialProfile savedFinancial = financialCaptor.getValue();
        Account savedAccount = accountCaptor.getValue();

        assertEquals("julia@example.com", savedUser.getEmail());
        assertEquals("hashedPassword", savedUser.getPasswordHash());

        assertEquals("Julia", savedProfile.getFirstName());
        assertEquals("Wiecek", savedProfile.getLastName());
        assertEquals(LocalDate.of(1990, 5, 20), savedProfile.getDateOfBirth());
        assertEquals("+8175551234", savedProfile.getPhone());
        assertEquals("123 Main St, Apt 4, Roanoke, TX, 76262", savedProfile.getAddress());
        assertEquals("United States", savedProfile.getCountry());
        assertEquals(CitizenshipStatus.CITIZEN, savedProfile.getCitizenshipStatus());
        // SSN encrypted and stored in customer profile, not plaintext
        assertNotNull(savedProfile.getSsnEncrypted());
        // Test double encrypts by prefixing with "ENCRYPTED_"
        String decryptedSsn = new String(savedProfile.getSsnEncrypted());
        assertTrue(decryptedSsn.startsWith("ENCRYPTED_"),
                "CustomerProfile should have encrypted SSN with test prefix");

        assertTrue(savedFinancial.isAccreditedInvestor());
        assertEquals(NetWorthBracket.HUNDRED_TO_500K, savedFinancial.getNetWorthBracket());
        assertEquals(RiskProfile.MODERATE, savedFinancial.getRiskProfile());
        assertEquals(EmploymentStatus.EMPLOYED, savedFinancial.getEmploymentStatus());
        assertEquals("Neueda", savedFinancial.getEmployerName());
        assertEquals("Engineer", savedFinancial.getOccupation());
        assertEquals(new BigDecimal("120000.50"), savedFinancial.getAnnualIncome());
        assertEquals("50000", savedFinancial.getLiquidityPosition());
        assertTrue(savedFinancial.isPoliticallyExposedPerson());
        assertNotNull(savedFinancial.getRegulatoryDisclosures());
        assertNotNull(savedFinancial.getBeneficialOwnerInfo());

        assertEquals("My trading account", savedAccount.getAccountName());
        assertEquals(AccountType.INDIVIDUAL_CASH, savedAccount.getAccountType());
        assertEquals(TraderLevel.ADVANCED, savedAccount.getTraderLevel());
        assertEquals(new BigDecimal("100000.00"), savedAccount.getMinBalanceRequirement());
        assertTrue(savedAccount.getAccountNumber().startsWith("NT"));

        assertEquals("julia@example.com", response.email());
        assertEquals("Julia", response.firstName());
        assertEquals(TraderLevel.ADVANCED, response.traderLevel());
        assertFalse(response.emailVerified());

        verify(passwordEncoder).encode("Password123!");
    }

    @Test
    void register_shouldRejectDuplicateEmail() {
        RegisterUserRequest request = createValidRequest("julia@example.com");
        when(userRepository.existsByEmailIgnoreCase("julia@example.com")).thenReturn(true);

        assertThrows(UserAlreadyExistsException.class, () -> registrationService.register(request));

        verify(userRepository, never()).save(any(User.class));
        verifyNoInteractions(passwordEncoder);
        verify(customerProfileRepository, never()).save(any(CustomerProfile.class));
        verify(financialProfileRepository, never()).save(any(FinancialProfile.class));
        verify(accountRepository, never()).save(any(Account.class));
    }

    @Test
    void register_shouldNormalizeEmailBeforeCheckingDuplicate() {
        RegisterUserRequest request = createValidRequest("JULIA@EXAMPLE.COM");
        when(userRepository.existsByEmailIgnoreCase("julia@example.com")).thenReturn(true);

        assertThrows(UserAlreadyExistsException.class, () -> registrationService.register(request));
        verify(userRepository, never()).save(any(User.class));
    }

    private RegisterUserRequest createValidRequest(String email) {
        return new RegisterUserRequest(
                "Julia",
                "Wiecek",
                LocalDate.of(1990, 5, 20),
                email,
                "+8175551234",
                "Password123!",
                "123 Main St",
                "Apt 4",
                "Roanoke",
                "TX",
                "76262",
                "United States",
                CitizenshipStatus.CITIZEN,
                "123-45-6789",
                EmploymentStatus.EMPLOYED,
                "Neueda",
                "Engineer",
                "120,000.50",
                NetWorthBracket.HUNDRED_TO_500K,
                RiskProfile.MODERATE,
                "50,000",
                true,
                "My trading account",
                AccountType.INDIVIDUAL_CASH,
                TraderLevel.ADVANCED,
                true,
                true,
                "Example Securities",
                "Registered representative",
                true,
                "Acme Corp",
                "Director",
                true,
                "Alex Wiecek",
                "Spouse"
        );
    }
}

