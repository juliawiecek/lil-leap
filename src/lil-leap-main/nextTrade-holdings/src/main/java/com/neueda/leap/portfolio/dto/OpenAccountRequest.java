package com.neueda.leap.portfolio.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request to open another account for the caller (PS-05). Type and currency are fixed
 * (individual cash, USD), so the nickname is the only choice the client makes.
 * @param nickname display name for the new account; letters, digits, spaces and basic punctuation
 */
public record OpenAccountRequest(
        @NotBlank @Size(max = 50) @Pattern(regexp = "[\\p{L}\\p{N} .,'&()-]+") String nickname
) {
}
