package com.neueda.leap.onboarding;

import com.neueda.leap.onboarding.controller.RegistrationController;
import com.neueda.leap.onboarding.dto.UserResponse;

import com.neueda.leap.user.exception.UserAlreadyExistsException;
import com.neueda.leap.onboarding.enums.AccountType;
import com.neueda.leap.onboarding.enums.TraderLevel;
import com.neueda.leap.onboarding.service.RegistrationService;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;

import org.springframework.http.MediaType;

import org.springframework.boot.test.mock.mockito.MockBean;

import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(RegistrationController.class)
@AutoConfigureMockMvc(addFilters = false)
class RegistrationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private RegistrationService registrationService;

    @Test
    void register_shouldReturn201() throws Exception {
        UUID userId = UUID.randomUUID();
        Instant now = Instant.now();

        UserResponse response = new UserResponse(
                userId,
                "Julia",
                "Wiecek",
                LocalDate.of(1990, 5, 20),
                "julia@example.com",
                "+18175551234",
                AccountType.INDIVIDUAL_CASH,
                TraderLevel.ADVANCED,
                false,
                now,
                now);

        when(registrationService.register(any())).thenReturn(response);

        String json = validPayload();

        mockMvc.perform(post("/api/v1/users")
                .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(userId.toString()))
                .andExpect(jsonPath("$.firstName").value("Julia"))
                .andExpect(jsonPath("$.lastName").value("Wiecek"))
                .andExpect(jsonPath("$.dateOfBirth").value("1990-05-20"))
                .andExpect(jsonPath("$.email").value("julia@example.com"))
                .andExpect(jsonPath("$.accountType").value("INDIVIDUAL_CASH"))
                .andExpect(jsonPath("$.traderLevel").value("ADVANCED"))
                .andExpect(jsonPath("$.emailVerified").value(false))
                //security checks
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());

        verify(registrationService).register(any());
    }

    @Test
    void register_shouldReturn400ForInvalidEmail() throws Exception {

        String json = validPayload().replace("julia@example.com", "not-an-email");

        mockMvc.perform(post("/api/v1/users")
                .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(registrationService);
    }

    @Test
    void register_shouldReturn400ForShortPassword() throws Exception {

        String json = validPayload().replace("Password123!", "123");

        mockMvc.perform(post("/api/v1/users")
                .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(registrationService);
    }

    @Test
    void register_shouldReturn400WhenFirstNameIsBlank() throws Exception {

        String json = validPayload().replace("\"first_name\": \"Julia\"", "\"first_name\": \"\"");

        mockMvc.perform(post("/api/v1/users")
                .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(registrationService);
    }

    @Test
    void register_shouldReturn409ForDuplicateEmail() throws Exception {

        when(registrationService.register(any()))
                .thenThrow(new UserAlreadyExistsException("An account with this email " +
                        "already exists."));

        String json = validPayload();

        mockMvc.perform(post("/api/v1/users")
                .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("USER_ALREADY_EXISTS"));
    }

    private String validPayload() {
        return """
                {
                    "first_name": "Julia",
                    "last_name": "Wiecek",
                    "date_of_birth": "1990-05-20",
                    "email": "julia@example.com",
                    "phone": "+18175551234",
                    "password": "Password123!",
                    "street_address": "123 Main St",
                    "apartment": "Apt 4",
                    "city": "Roanoke",
                    "state_province": "TX",
                    "postal_code": "76262",
                    "country": "United States",
                    "citizenship_status": "CITIZEN",
                    "ssn": "123-45-6789",
                    "employment_status": "EMPLOYED",
                    "employer_name": "Neueda",
                    "occupation": "Engineer",
                    "annual_income": "120000",
                    "net_worth_bracket": "$100k-500k",
                    "risk_profile": "MODERATE",
                    "liquidity_position": "50000",
                    "accredited_investor": true,
                    "account_name": "My trading account",
                    "account_type": "INDIVIDUAL_CASH",
                    "trader_level": "ADVANCED",
                    "is_politically_exposed_person": false,
                    "broker_affiliation": false,
                    "broker_firm_name": "",
                    "broker_affiliation_details": "",
                    "control_person": false,
                    "control_company_name": "",
                    "control_company_role": "",
                    "other_beneficial_owner": false,
                    "beneficial_owner_name": "",
                    "beneficial_owner_relationship": ""
                }
                """;
    }
}


