package com.neueda.leap;

import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * Starts Hibernate with every entity in the service so a mapping error fails the build
 * instead of stopping the service at startup. Uses an in-memory H2 schema generated from
 * the entities; column types are not checked against PostgreSQL here.
 */
@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class JpaMappingTest {

    @Autowired
    private EntityManager entityManager;

    @Test
    void allEntitiesMapWithoutErrors() {
        assertFalse(entityManager.getMetamodel().getEntities().isEmpty());
    }
}
