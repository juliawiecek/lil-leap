package com.neueda.leap.order.repository;

import com.neueda.leap.order.model.Instrument;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

/**
 * Repository for Instrument entities.
 * Provides database access for tradeable securities.
 */
@Repository
public interface InstrumentRepository extends JpaRepository<Instrument, UUID> {
}
