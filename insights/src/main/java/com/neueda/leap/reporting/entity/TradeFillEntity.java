package com.neueda.leap.reporting.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Read-only fill mapping for dashboard reporting. */
@Entity
@Immutable
@Table(name = "fills")
public class TradeFillEntity {

	@Id
	@Column(name = "fill_id", nullable = false)
	private UUID fillId;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "order_id", nullable = false)
	private TradeOrderEntity order;

	@Column(name = "filled_quantity", nullable = false)
	private long filledQuantity;

	@Column(name = "execution_price", nullable = false, precision = 18, scale = 8)
	private BigDecimal executionPrice;

	@Column(name = "filled_at", nullable = false)
	private Instant filledAt;

	/** Required by JPA; not for application use. */
	protected TradeFillEntity() {
	}

	/**
	 * Returns the persistent fill identifier.
	 *
	 * @return persistent fill identifier
	 */
	public UUID getFillId() {
		return fillId;
	}

	/**
	 * Returns the order this fill executed.
	 *
	 * @return order this fill executed
	 */
	public TradeOrderEntity getOrder() {
		return order;
	}

	/**
	 * Returns the executed quantity.
	 *
	 * @return executed quantity
	 */
	public long getFilledQuantity() {
		return filledQuantity;
	}

	/**
	 * Returns the executed price per unit.
	 *
	 * @return executed price per unit
	 */
	public BigDecimal getExecutionPrice() {
		return executionPrice;
	}

	/**
	 * Returns the execution time.
	 *
	 * @return execution time
	 */
	public Instant getFilledAt() {
		return filledAt;
	}
}

