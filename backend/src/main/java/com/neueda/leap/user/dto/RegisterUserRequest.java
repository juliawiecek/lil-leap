package com.neueda.leap.user.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterUserRequest (

    @NotBlank
    @Size(max = 100)
    String firstName,

    @NotBlank
    @Size(max = 100)
    String lastName,

    @NotBlank
    @Email
    @Size(max = 320)
    String email,

    @Size(max = 30)
    String phone,

    @NotBlank
    @Size(min = 8, max = 128)
    String password,

    @Valid
    AddressRequest address

) {}
