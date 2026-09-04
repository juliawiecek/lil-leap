package com.neueda.leap.user;

import com.fasterxml.jackson.databind.ObjectMapper;

import com.neueda.leap.user.dto.UserResponse;

import com.neueda.leap.user.exception.UserAlreadyExistsException;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;

import org.springframework.http.MediaType;

import org.springframework.boot.test.mock.mockito.MockBean;

import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(UserController.class)
@AutoConfigureMockMvc(addFilters = false)
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private UserService userService;

    @Test
    void register_shouldReturn201() throws Exception {
        UUID userId = UUID.randomUUID();
        Instant now = Instant.now();

        UserResponse response = new UserResponse(
                userId,
                "Julia",
                "Wiecek",
                "julia@example.com",
                "+18175551234",
                false,
                now,
                now);

        when(userService.register(any())).thenReturn(response);

        String json = """
                {
                    "firstName": "Julia",
                    "lastName": "Wiecek",
                    "email": "julia@example.com",
                    "phone": "+18175551234",
                    "password": "Password123!",
                    "address": {
                        "addressLine1": "123 Main St",
                        "addressLine2": "Apt 4",
                        "city": "Roanoke",
                        "stateProvince": "TX",
                        "postalCode": "76262",
                        "countryCode": "US"
                        }
                }""";

        mockMvc.perform(post("/api/v1/users")
                .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(userId.toString()))
                .andExpect(jsonPath("$.firstName").value("Julia"))
                .andExpect(jsonPath("$.lastName").value("Wiecek"))
                .andExpect(jsonPath("$.email").value("julia@example.com"))
                .andExpect(jsonPath("$.emailVerified").value(false))
                //security checks
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());

        verify(userService).register(any());
    }

    @Test
    void register_shouldReturn400ForInvalidEmail() throws Exception {

        String json = """
                {
                    "firstName": "Julia",
                    "lastName": "Wiecek",
                    "email": "not-an-email",
                    "phone": "+18175551234",
                    "password": "Password123!",
                    "address": {
                        "addressLine1": "123 Main St",
                        "addressLine2": "Apt 4",
                        "city": "Roanoke",
                        "stateProvince": "TX",
                        "postalCode": "76262",
                        "countryCode": "US"
                        }
                }""";

        mockMvc.perform(post("/api/v1/users")
                .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(userService);
    }

    @Test
    void register_shouldReturn400ForShortPassword() throws Exception {

        String json = """
                {
                    "firstName": "Julia",
                    "lastName": "Wiecek",
                    "email": "julia@example.com",
                    "phone": "+18175551234",
                    "password": "123",
                    "address": {
                        "addressLine1": "123 Main St",
                        "addressLine2": "Apt 4",
                        "city": "Roanoke",
                        "stateProvince": "TX",
                        "postalCode": "76262",
                        "countryCode": "US"
                        }
                }""";

        mockMvc.perform(post("/api/v1/users")
                .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(userService);
    }

    @Test
    void register_shouldReturn400WhenFirstNameIsBlank() throws Exception {

        String json = """
                {
                    "firstName": "",
                    "lastName": "Wiecek",
                    "email": "julia@example.com",
                    "phone": "+18175551234",
                    "password": "Password123!",
                    "address": {
                        "addressLine1": "123 Main St",
                        "addressLine2": "Apt 4",
                        "city": "Roanoke",
                        "stateProvince": "TX",
                        "postalCode": "76262",
                        "countryCode": "US"
                        }
                }""";

        mockMvc.perform(post("/api/v1/users")
                .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(userService);
    }

    @Test
    void register_shouldReturn409ForDuplicateEmail() throws Exception {

        when(userService.register(any()))
                .thenThrow(new UserAlreadyExistsException("An account with this email " +
                        "already exists."));

        String json = """
                {
                    "firstName": "Julia",
                    "lastName": "Wiecek",
                    "email": "julia@example.com",
                    "phone": "+18175551234",
                    "password": "Password123!",
                    "address": {
                        "addressLine1": "123 Main St",
                        "addressLine2": "Apt 4",
                        "city": "Roanoke",
                        "stateProvince": "TX",
                        "postalCode": "76262",
                        "countryCode": "US"
                        }
                }""";

        mockMvc.perform(post("/api/v1/users")
                .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("USER_ALREADY_EXISTS"));
    }
}
