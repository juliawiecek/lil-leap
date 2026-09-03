package com.neueda.leap.user.dto;

import com.neueda.leap.user.User;

import java.time.Instant;
import java.util.UUID;

public record UserResponse (

        UUID id,
        String firstName,
        String lastName,
        String email,
        String phone,
        boolean emailVerified,
        Instant createdAt,
        Instant updatedAt

) {

    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getPhone(),
                user.isEmailVerified(),
                user.getCreatedAt(),
                user.getUpdatedAt()
        );
    }
}
