package com.neueda.leap.security;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;

/**
 * Service for encrypting and decrypting SSN values using PostgreSQL pgcrypto.
 *
 * <p>Encryption uses symmetric PGP encryption with AES256 cipher.
 * The encryption key is supplied via environment variable NEXTTRADE_SECURITY_SSN_ENCRYPTION_KEY
 * and must never be logged or exposed.
 *
 * <p>All encryption/decryption happens at the database level via native SQL queries
 * to PostgreSQL's pgp_sym_encrypt() and pgp_sym_decrypt() functions.
 * The application never stores plaintext SSN in memory or logs.
 */
@Service
public class SsnEncryptionService {

    private final EntityManager entityManager;
    private final String encryptionKey;

    /**
     * Creates a new SSN encryption service.
     *
     * @param entityManager JPA EntityManager for executing native queries (optional for testing)
     * @param encryptionKey SSN encryption key from NEXTTRADE_SECURITY_SSN_ENCRYPTION_KEY env var
     */
    public SsnEncryptionService(
            @Autowired(required = false) EntityManager entityManager,
            @Value("${nexttrade.security.ssn-encryption-key:}") String encryptionKey
    ) {
        this.entityManager = entityManager;
        this.encryptionKey = encryptionKey;
    }

    /**
     * Encrypts a plaintext SSN using PostgreSQL pgcrypto symmetric encryption.
     *
     * <p>Uses pgp_sym_encrypt() with AES256 cipher. The encryption key must be
     * configured via NEXTTRADE_SECURITY_SSN_ENCRYPTION_KEY environment variable.
     *
     * @param plainTextSsn the plaintext SSN (e.g., "123-45-6789")
     * @return encrypted SSN as byte array (BYTEA in PostgreSQL)
     * @throws IllegalArgumentException if plaintext SSN is null or empty
     * @throws RuntimeException if encryption fails
     */
    public byte[] encrypt(String plainTextSsn) {
        if (plainTextSsn == null || plainTextSsn.trim().isEmpty()) {
            throw new IllegalArgumentException("SSN cannot be null or empty");
        }

        String sql = "SELECT pgp_sym_encrypt(?, ?, 'cipher-algo=aes256')";
        Query query = entityManager.createNativeQuery(sql);
        query.setParameter(1, plainTextSsn);
        query.setParameter(2, encryptionKey);

        Object result = query.getSingleResult();
        if (result instanceof byte[]) {
            return (byte[]) result;
        }
        throw new RuntimeException("Unexpected encryption result type: " + result.getClass().getName());
    }

    /**
     * Decrypts an encrypted SSN using PostgreSQL pgcrypto symmetric decryption.
     *
     * <p>Uses pgp_sym_decrypt() with the encryption key configured via
     * NEXTTRADE_SECURITY_SSN_ENCRYPTION_KEY environment variable.
     *
     * @param encryptedSsn the encrypted SSN as byte array (BYTEA from database)
     * @return decrypted plaintext SSN (e.g., "123-45-6789")
     * @throws IllegalArgumentException if encrypted SSN is null or empty
     * @throws RuntimeException if decryption fails
     */
    public String decrypt(byte[] encryptedSsn) {
        if (encryptedSsn == null || encryptedSsn.length == 0) {
            throw new IllegalArgumentException("Encrypted SSN cannot be null or empty");
        }

        String sql = "SELECT pgp_sym_decrypt(?, ?)";
        Query query = entityManager.createNativeQuery(sql);
        query.setParameter(1, encryptedSsn);
        query.setParameter(2, encryptionKey);

        Object result = query.getSingleResult();
        if (result instanceof String) {
            return (String) result;
        }
        throw new RuntimeException("Unexpected decryption result type: " + result.getClass().getName());
    }
}
