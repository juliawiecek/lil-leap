package com.neueda.leap;

/**
 * Represents the preliminary order information used by the current
 * validation service.
 *
 * <p>This record stores the product name, requested quantity, and price
 * used by the existing backend starter code.</p>
 *
 * @param productName the name of the product associated with the order
 * @param quantity the requested number of product units
 * @param price the nonnegative price associated with the order
 */
public record Order(
    String productName,
    int quantity,
    double price
) {
}
