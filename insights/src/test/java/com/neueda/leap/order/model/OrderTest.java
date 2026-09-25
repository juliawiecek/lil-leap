package com.neueda.leap.order.model;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;

import static org.assertj.core.api.Assertions.*;

@DisplayName("Order Record Tests")
class OrderTest {

    @Test
    @DisplayName("Constructor initializes all fields correctly")
    void testConstructorInitializesFields() {
        String productName = "AAPL";
        int quantity = 100;
        double price = 150.50;

        Order order = new Order(productName, quantity, price);

        assertThat(order.productName()).isEqualTo(productName);
        assertThat(order.quantity()).isEqualTo(quantity);
        assertThat(order.price()).isEqualTo(price);
    }

    @Test
    @DisplayName("Accessor methods return correct values")
    void testAccessorMethods() {
        Order order = new Order("MSFT", 50, 300.00);

        assertThat(order.productName()).isEqualTo("MSFT");
        assertThat(order.quantity()).isEqualTo(50);
        assertThat(order.price()).isEqualTo(300.00);
    }

    @Test
    @DisplayName("equals() returns true for identical orders")
    void testEqualsForIdenticalOrders() {
        Order order1 = new Order("NVDA", 25, 500.75);
        Order order2 = new Order("NVDA", 25, 500.75);

        assertThat(order1).isEqualTo(order2);
    }

    @Test
    @DisplayName("equals() returns false for different product names")
    void testEqualsFalseDifferentProductName() {
        Order order1 = new Order("AAPL", 100, 150.00);
        Order order2 = new Order("MSFT", 100, 150.00);

        assertThat(order1).isNotEqualTo(order2);
    }

    @Test
    @DisplayName("equals() returns false for different quantities")
    void testEqualsFalseDifferentQuantity() {
        Order order1 = new Order("AAPL", 100, 150.00);
        Order order2 = new Order("AAPL", 200, 150.00);

        assertThat(order1).isNotEqualTo(order2);
    }

    @Test
    @DisplayName("equals() returns false for different prices")
    void testEqualsFalseDifferentPrice() {
        Order order1 = new Order("AAPL", 100, 150.00);
        Order order2 = new Order("AAPL", 100, 160.00);

        assertThat(order1).isNotEqualTo(order2);
    }

    @Test
    @DisplayName("hashCode() is consistent")
    void testHashCodeConsistent() {
        Order order = new Order("GOOGL", 15, 2800.00);
        int hash1 = order.hashCode();
        int hash2 = order.hashCode();

        assertThat(hash1).isEqualTo(hash2);
    }

    @Test
    @DisplayName("hashCode() same for equal orders")
    void testHashCodeSameForEqualOrders() {
        Order order1 = new Order("AMZN", 30, 3500.00);
        Order order2 = new Order("AMZN", 30, 3500.00);

        assertThat(order1.hashCode()).isEqualTo(order2.hashCode());
    }

    @Test
    @DisplayName("toString() produces non-empty string")
    void testToStringProducesOutput() {
        Order order = new Order("TSLA", 10, 250.00);
        String toString = order.toString();

        assertThat(toString)
            .isNotEmpty()
            .contains("Order")
            .contains("TSLA")
            .contains("10")
            .contains("250");
    }

    @Test
    @DisplayName("equals() returns false when compared with null")
    void testEqualsNullReturnsFalse() {
        Order order = new Order("AAPL", 100, 150.00);

        assertThat(order).isNotEqualTo(null);
    }

    @Test
    @DisplayName("equals() returns false when compared with different type")
    void testEqualsDifferentTypeReturnsFalse() {
        Order order = new Order("AAPL", 100, 150.00);
        String other = "not an order";

        assertThat(order).isNotEqualTo(other);
    }
}
