package com.neueda.leap.onboarding.entity;

import com.neueda.leap.onboarding.enums.CitizenshipStatus;
import com.neueda.leap.user.entity.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Identity and contact profile separated from authentication data.
 */
@Entity
@Table(name = "customer_profiles")
public class CustomerProfile {

    /** Creates an empty entity for JPA hydration or application initialization. */
    public CustomerProfile() {
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "profile_id")
    private UUID profileId;

    @OneToOne(optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "first_name", nullable = false, length = 100)
    private String firstName;

    @Column(name = "last_name", nullable = false, length = 100)
    private String lastName;

    @Column(name = "phone", nullable = false, length = 20)
    private String phone;

    @Column(name = "address", nullable = false)
    private String address;

    @Column(name = "country", length = 100)
    private String country;

    @Column(name = "date_of_birth", nullable = false)
    private LocalDate dateOfBirth;

    @Enumerated(EnumType.STRING)
    @Column(name = "citizenship_status", length = 50)
    private CitizenshipStatus citizenshipStatus;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** Initializes creation and update timestamps before the first insert. */
    @PrePersist
    protected void onCreate() {
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    /** Refreshes the update timestamp before an entity update. */
    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = Instant.now();
    }

    /**
    * Returns persistent customer profile identifier.
    * @return persistent customer profile identifier
    */
    public UUID getProfileId() {
        return profileId;
    }

    /**
    * Sets persistent customer profile identifier.
    * @param profileId persistent customer profile identifier
    */
    public void setProfileId(UUID profileId) {
        this.profileId = profileId;
    }

    /**
    * Returns associated authentication user.
    * @return associated authentication user
    */
    public User getUser() {
        return user;
    }

    /**
    * Sets associated authentication user.
    * @param user associated authentication user
    */
    public void setUser(User user) {
        this.user = user;
    }

    /**
    * Returns customer first name.
    * @return customer first name
    */
    public String getFirstName() {
        return firstName;
    }

    /**
    * Sets customer first name.
    * @param firstName customer first name
    */
    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    /**
    * Returns customer last name.
    * @return customer last name
    */
    public String getLastName() {
        return lastName;
    }

    /**
    * Sets customer last name.
    * @param lastName customer last name
    */
    public void setLastName(String lastName) {
        this.lastName = lastName;
    }

    /**
    * Returns customer contact phone number.
    * @return customer contact phone number
    */
    public String getPhone() {
        return phone;
    }

    /**
    * Sets customer contact phone number.
    * @param phone customer contact phone number
    */
    public void setPhone(String phone) {
        this.phone = phone;
    }

    /**
    * Returns serialized postal address.
    * @return serialized postal address
    */
    public String getAddress() {
        return address;
    }

    /**
    * Sets serialized postal address.
    * @param address serialized postal address
    */
    public void setAddress(String address) {
        this.address = address;
    }

    /**
    * Returns customer country.
    * @return customer country
    */
    public String getCountry() {
        return country;
    }

    /**
    * Sets customer country.
    * @param country customer country
    */
    public void setCountry(String country) {
        this.country = country;
    }

    /**
    * Returns customer date of birth.
    * @return customer date of birth
    */
    public LocalDate getDateOfBirth() {
        return dateOfBirth;
    }

    /**
    * Sets customer date of birth.
    * @param dateOfBirth customer date of birth
    */
    public void setDateOfBirth(LocalDate dateOfBirth) {
        this.dateOfBirth = dateOfBirth;
    }

    /**
    * Returns declared citizenship or residency status.
    * @return declared citizenship or residency status
    */
    public CitizenshipStatus getCitizenshipStatus() {
        return citizenshipStatus;
    }

    /**
    * Sets declared citizenship or residency status.
    * @param citizenshipStatus declared citizenship or residency status
    */
    public void setCitizenshipStatus(CitizenshipStatus citizenshipStatus) {
        this.citizenshipStatus = citizenshipStatus;
    }

    /**
    * Returns creation timestamp assigned before initial persistence.
    * @return creation timestamp assigned before initial persistence
    */
    public Instant getCreatedAt() {
        return createdAt;
    }

    /**
    * Returns timestamp assigned before the latest persistence update.
    * @return timestamp assigned before the latest persistence update
    */
    public Instant getUpdatedAt() {
        return updatedAt;
    }
}

