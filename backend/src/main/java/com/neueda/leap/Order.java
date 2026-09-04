package com.neueda.leap;

/**
 * Represents an order containing product details, quantity, and price.
 *
 * @param productName the name of the product being ordered
 * @param quantity the number of units ordered
 * @param price the price of the order
 */
public record Order(String productName, int quantity, double price) {
}