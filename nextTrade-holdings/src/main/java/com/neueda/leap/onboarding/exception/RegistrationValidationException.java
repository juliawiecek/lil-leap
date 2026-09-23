package com.neueda.leap.onboarding.exception;

/** A registration request that fails a business validation rule. */
public class RegistrationValidationException extends IllegalArgumentException {
    /** @param message the registration rule that was not satisfied */
    public RegistrationValidationException(String message) {
        super(message);
    }
}
