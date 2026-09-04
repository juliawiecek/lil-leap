package com.neueda.leap.user;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/**
 * Embeddable address value object associated with a user.
 *
 * <p>This class stores address-related fields that are persisted as part of
 * the owning entity rather than in a separate table.</p>
 */
@Embeddable
public class Address {
    @Column(name = "address_line_1", length = 255)
    private String addressLine1;

    @Column(name = "address_line_2", length = 255)
    private String addressLine2;

    @Column(length = 100)
    private String city;

    @Column(name = "state_province", length = 100)
    private String stateProvince;

    @Column(name = "postal_code", length = 20)
    private String postalCode;

    @Column(name = "country_code", length = 2)
    private String countryCode;

    /**
     * Returns the first line of the address.
     *
     * @return the first address line
     */
    public String getAddressLine1() {
        return addressLine1;
    }

    /**
     * Sets the first line of the address.
     *
     * @param addressLine1 the first address line
     */
    public void setAddressLine1(String addressLine1) {
        this.addressLine1 = addressLine1;
    }

    /**
     * Returns the second line of the address.
     *
     * @return the second address line
     */
    public String getAddressLine2() {
        return addressLine2;
    }

    /**
     * Sets the second line of the address.
     *
     * @param addressLine2 the second address line
     */
    public void setAddressLine2(String addressLine2) {
        this.addressLine2 = addressLine2;
    }

    /**
     * Returns the city.
     *
     * @return the city name
     */
    public String getCity() {
        return city;
    }

    /**
     * Sets the city.
     *
     * @param city the city name
     */
    public void setCity(String city) {
        this.city = city;
    }

    /**
     * Returns the state or province.
     *
     * @return the state or province
     */
    public String getStateProvince() {
        return stateProvince;
    }

    /**
     * Sets the state or province.
     *
     * @param stateProvince the state or province
     */
    public void setStateProvince(String stateProvince) {
        this.stateProvince = stateProvince;
    }

    /**
     * Returns the postal code.
     *
     * @return the postal code
     */
    public String getPostalCode() {
        return postalCode;
    }

    /**
     * Sets the postal code.
     *
     * @param postalCode the postal code
     */
    public void setPostalCode(String postalCode) {
        this.postalCode = postalCode;
    }

    /**
     * Returns the country code.
     *
     * @return the country code
     */
    public String getCountryCode() {
        return countryCode;
    }

    /**
     * Sets the country code.
     *
     * @param countryCode the country code
     */
    public void setCountryCode(String countryCode) {
        this.countryCode = countryCode;
    }
}