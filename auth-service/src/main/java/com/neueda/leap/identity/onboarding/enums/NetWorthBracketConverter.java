package com.neueda.leap.identity.onboarding.enums;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Persists {@link NetWorthBracket} as its dollar-range string (e.g. "$0-5k"),
 * matching the database's {@code chk_net_worth_bracket} constraint — not the
 * enum constant name, which {@code @Enumerated(EnumType.STRING)} would use.
 */
@Converter(autoApply = true)
public class NetWorthBracketConverter implements AttributeConverter<NetWorthBracket, String> {

    @Override
    public String convertToDatabaseColumn(NetWorthBracket attribute) {
        return attribute == null ? null : attribute.value();
    }

    @Override
    public NetWorthBracket convertToEntityAttribute(String dbData) {
        return dbData == null ? null : NetWorthBracket.fromValue(dbData);
    }
}
