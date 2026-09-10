package com.neueda.leap.passwordreset;

import com.neueda.leap.user.User;
import com.neueda.leap.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.transaction.TestTransaction;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@DataJpaTest
@Import({PasswordResetService.class, PasswordResetTokenUtil.class, BCryptPasswordEncoder.class})
class PasswordResetServiceIntegrationTest {

    @Autowired
    private PasswordResetService passwordResetService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordResetTokenRepository tokenRepository;

    @Autowired
    private PasswordResetTokenUtil tokenUtil;

    @SpyBean
    private PasswordEncoder passwordEncoder;

    @MockBean
    private PasswordResetDelivery delivery;

    @Test
    void confirmPasswordResetAllowsOnlyOneConcurrentAttempt() throws Exception {
        User user = new User();
        user.setFirstName("Alice");
        user.setLastName("Concurrent");
        user.setEmail("concurrent@nexttrade.com");
        user.setPasswordHash(passwordEncoder.encode("OriginalPassword123!"));
        UUID userId = userRepository.saveAndFlush(user).getId();

        String rawToken = tokenUtil.generateToken();
        String tokenHash = tokenUtil.hashToken(rawToken);
        tokenRepository.saveAndFlush(new PasswordResetToken(
                UUID.randomUUID(), tokenHash, userId,
                Instant.now().plus(20, ChronoUnit.MINUTES)
        ));
        TestTransaction.flagForCommit();
        TestTransaction.end();

        CountDownLatch firstHasToken = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        CountDownLatch secondStarted = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            // Pause after the first request has read and locked the token.
            // Repositories and password encoding still perform their real work.
            doAnswer(invocation -> {
                firstHasToken.countDown();
                assertTrue(releaseFirst.await(10, TimeUnit.SECONDS), "First request was not released");
                return invocation.callRealMethod();
            }).when(passwordEncoder).encode("FirstPassword123!");

            Future<?> first = executor.submit(() ->
                    passwordResetService.confirmPasswordReset(rawToken, "FirstPassword123!"));
            assertTrue(firstHasToken.await(10, TimeUnit.SECONDS), "First request did not reach encoding");

            Future<?> second = executor.submit(() -> {
                secondStarted.countDown();
                passwordResetService.confirmPasswordReset(rawToken, "SecondPassword456!");
            });
            assertTrue(secondStarted.await(10, TimeUnit.SECONDS), "Second request did not start");
            assertThrows(TimeoutException.class, () -> second.get(300, TimeUnit.MILLISECONDS));

            releaseFirst.countDown();
            first.get(10, TimeUnit.SECONDS);
            ExecutionException failure = assertThrows(ExecutionException.class,
                    () -> second.get(10, TimeUnit.SECONDS));
            assertInstanceOf(InvalidPasswordResetTokenException.class, failure.getCause());

            verify(passwordEncoder, never()).encode("SecondPassword456!");
            assertTrue(tokenRepository.findByTokenHash(tokenHash).isEmpty());
            assertTrue(passwordEncoder.matches("FirstPassword123!",
                    userRepository.findById(userId).orElseThrow().getPasswordHash()));
        } finally {
            releaseFirst.countDown();
            executor.shutdown();
            try {
                assertTrue(executor.awaitTermination(15, TimeUnit.SECONDS), "Reset requests did not finish");
            } finally {
                executor.shutdownNow();
                TestTransaction.start();
                tokenRepository.deleteByUserId(userId);
                tokenRepository.flush();
                userRepository.deleteById(userId);
                TestTransaction.flagForCommit();
                TestTransaction.end();
            }
        }
    }

    @Test
    void confirmPasswordResetRejectsReusedTokenAfterCommit() {
        User user = new User();
        user.setFirstName("Alice");
        user.setLastName("Test");
        user.setEmail("alice@nexttrade.com");
        user.setPasswordHash(passwordEncoder.encode("OriginalPassword123!"));
        UUID userId = userRepository.saveAndFlush(user).getId();

        String rawToken = tokenUtil.generateToken();
        String tokenHash = tokenUtil.hashToken(rawToken);
        tokenRepository.saveAndFlush(new PasswordResetToken(
                UUID.randomUUID(), tokenHash, userId,
                Instant.now().plus(20, ChronoUnit.MINUTES)
        ));

        // Commit setup so each service call runs in its own transaction.
        TestTransaction.flagForCommit();
        TestTransaction.end();

        try {
            passwordResetService.confirmPasswordReset(rawToken, "NewPassword123!");

            assertTrue(tokenRepository.findByTokenHash(tokenHash).isEmpty());
            String savedPasswordHash = userRepository.findById(userId).orElseThrow().getPasswordHash();
            assertTrue(passwordEncoder.matches("NewPassword123!", savedPasswordHash));

            assertThrows(InvalidPasswordResetTokenException.class,
                    () -> passwordResetService.confirmPasswordReset(rawToken, "DifferentPassword456!"));

            assertEquals(savedPasswordHash,
                    userRepository.findById(userId).orElseThrow().getPasswordHash());
            assertTrue(tokenRepository.findByTokenHash(tokenHash).isEmpty());
        } finally {
            // This test commits data, so cleanup must also commit.
            TestTransaction.start();
            tokenRepository.deleteByUserId(userId);
            tokenRepository.flush();
            userRepository.deleteById(userId);
            TestTransaction.flagForCommit();
            TestTransaction.end();
        }
    }
}
