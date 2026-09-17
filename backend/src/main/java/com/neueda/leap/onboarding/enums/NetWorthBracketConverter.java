package com.neueda.leap.onboarding.enums;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Uses the bracket tokens accepted by the database check constraint. */
@Converter
public class NetWorthBracketConverter implements AttributeConverter<NetWorthBracket, String> {

    /** Creates the JPA converter for database net worth tokens. */
    public NetWorthBracketConverter() {
    }
    @Override
    public String convertToDatabaseColumn(NetWorthBracket value) {
        return value == null ? null : value.value();
    }

    @Override
    public NetWorthBracket convertToEntityAttribute(String value) {
        return value == null ? null : NetWorthBracket.fromValue(value);
    }
}
