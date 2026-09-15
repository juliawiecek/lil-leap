package com.neueda.leap.identity.onboarding;

import com.neueda.leap.identity.onboarding.entity.Account;
import com.neueda.leap.identity.onboarding.entity.AnalystProfile;
import com.neueda.leap.identity.onboarding.entity.CustomerProfile;
import com.neueda.leap.identity.onboarding.entity.FinancialProfile;
import com.neueda.leap.identity.onboarding.enums.AccountType;
import com.neueda.leap.identity.onboarding.enums.CitizenshipStatus;
import com.neueda.leap.identity.onboarding.enums.EmploymentStatus;
import com.neueda.leap.identity.onboarding.enums.NetWorthBracket;
import com.neueda.leap.identity.onboarding.enums.RiskProfile;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.math.BigDecimal;
import java.time.LocalDate;
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

/**
 * Unit tests for {@link RegistrationServiceImpl} registration behavior.
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
    private AnalystProfileRepository analystProfileRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    private RegistrationService registrationService;

    @BeforeEach
    void setUp() {
        // Use a test double for SsnEncryptionService that doesn't require EntityManager
        SsnEncryptionService ssnEncryptionService = new TestSsnEncryptionService();
        registrationService = new RegistrationServiceImpl(
                userRepository,
                customerProfileRepository,
                financialProfileRepository,
                accountRepository,
                analystProfileRepository,
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
    }

    @Test
    void register_trader_shouldCreateNormalizedRecords() {
        RegisterRequest request = createValidTraderRequest("JULIA@EXAMPLE.COM");

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

        User savedUser = registrationService.register(request);

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        ArgumentCaptor<CustomerProfile> profileCaptor = ArgumentCaptor.forClass(CustomerProfile.class);
        ArgumentCaptor<FinancialProfile> financialCaptor = ArgumentCaptor.forClass(FinancialProfile.class);
        ArgumentCaptor<Account> accountCaptor = ArgumentCaptor.forClass(Account.class);

        verify(userRepository).save(userCaptor.capture());
        verify(customerProfileRepository).save(profileCaptor.capture());
        verify(financialProfileRepository).save(financialCaptor.capture());
        verify(accountRepository).save(accountCaptor.capture());
        verifyNoInteractions(analystProfileRepository);

        CustomerProfile savedProfile = profileCaptor.getValue();
        FinancialProfile savedFinancial = financialCaptor.getValue();
        Account savedAccount = accountCaptor.getValue();

        assertEquals("julia@example.com", userCaptor.getValue().getEmail());
        assertEquals("hashedPassword", userCaptor.getValue().getPasswordHash());
        assertEquals("TRADER", userCaptor.getValue().getUserRole());

        assertEquals("Julia", savedProfile.getFirstName());
        assertEquals("Wiecek", savedProfile.getLastName());
        assertEquals(LocalDate.of(1990, 5, 20), savedProfile.getDateOfBirth());
        assertEquals("123 Main St, Apt 4, Roanoke, TX, 76262", savedProfile.getAddress());
        assertEquals(CitizenshipStatus.CITIZEN, savedProfile.getCitizenshipStatus());
        assertNotNull(savedProfile.getSsnEncrypted());
        assertTrue(new String(savedProfile.getSsnEncrypted()).startsWith("ENCRYPTED_"));

        assertTrue(savedFinancial.isAccreditedInvestor());
        assertEquals(NetWorthBracket.HUNDRED_TO_500K, savedFinancial.getNetWorthBracket());
        assertEquals(new BigDecimal("120000.50"), savedFinancial.getAnnualIncome());

        assertEquals("My trading account", savedAccount.getAccountName());
        assertEquals(AccountType.INDIVIDUAL_CASH, savedAccount.getAccountType());
        assertEquals(TraderLevel.ADVANCED, savedAccount.getTraderLevel());
        assertEquals(new BigDecimal("100000.00"), savedAccount.getMinBalanceRequirement());
        assertTrue(savedAccount.getAccountNumber().startsWith("NT"));

        assertEquals("julia@example.com", savedUser.getEmail());
        verify(passwordEncoder).encode("Password123!");
    }

    @Test
    void register_analyst_shouldCreateAnalystProfileOnly() {
        RegisterRequest request = createValidAnalystRequest("priya@example.com");

        when(userRepository.existsByEmailIgnoreCase("priya@example.com")).thenReturn(false);
        when(passwordEncoder.encode("Password123!")).thenReturn("hashedPassword");
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            user.setUserId(UUID.fromString("22222222-2222-2222-2222-222222222222"));
            return user;
        });
        when(analystProfileRepository.save(any(AnalystProfile.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        User savedUser = registrationService.register(request);

        ArgumentCaptor<AnalystProfile> analystCaptor = ArgumentCaptor.forClass(AnalystProfile.class);
        verify(analystProfileRepository).save(analystCaptor.capture());

        assertEquals("ANALYST", savedUser.getUserRole());
        assertEquals("EMP-4210", analystCaptor.getValue().getEmployeeId());
        assertEquals("Commercial Analytics", analystCaptor.getValue().getDepartment());

        // An ANALYST registration must never touch the TRADER-only extension tables.
        verifyNoInteractions(customerProfileRepository, financialProfileRepository, accountRepository);
    }

    @Test
    void register_shouldRejectDuplicateEmail() {
        RegisterRequest request = createValidTraderRequest("julia@example.com");
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
        RegisterRequest request = createValidTraderRequest("JULIA@EXAMPLE.COM");
        when(userRepository.existsByEmailIgnoreCase("julia@example.com")).thenReturn(true);

        assertThrows(UserAlreadyExistsException.class, () -> registrationService.register(request));
        verify(userRepository, never()).save(any(User.class));
    }

    private RegisterRequest createValidTraderRequest(String email) {
        return new RegisterRequest(
                UserRole.TRADER,
                email,
                "Password123!",
                "Julia",
                "Wiecek",
                LocalDate.of(1990, 5, 20),
                "+8175551234",
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
                "Spouse",
                null,
                null
        );
    }

    private RegisterRequest createValidAnalystRequest(String email) {
        return new RegisterRequest(
                UserRole.ANALYST,
                email,
                "Password123!",
                null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null,
                "EMP-4210",
                "Commercial Analytics"
        );
    }
}
