package com.neueda.leap.security;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.pattern.CompositeConverter;

import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Defense in depth for accidental structured credential logging, including exception text.
 * Logging raw payloads or unlabelled secrets is still prohibited.
 */
public class SensitiveLogConverter extends CompositeConverter<ILoggingEvent> {

    private static final Pattern HEADERS = Pattern.compile(
            "(?im)\\b(authorization|proxy-authorization|cookie|set-cookie)([\"']?\\s*[:=]\\s*)[^\\r\\n]+"
    );
    private static final Pattern FIELD_PREFIX = Pattern.compile(
            "(?i)([\"']?\\b[a-z_][a-z0-9_]*[\"']?\\s*[:=]\\s*)"
    );
    private static final Pattern AUTH_SCHEME = Pattern.compile("(?i)\\b(Bearer|Basic)\\s+[A-Z0-9._~+/=-]+");
    private static final Pattern FIELD_NAME = Pattern.compile("(?i)[a-z_][a-z0-9_]*");
    private static final Set<String> SENSITIVE_FIELDS = Set.of(
            "password", "passwordhash", "password_hash", "passwd", "pwd",
            "accesstoken", "access_token", "refreshtoken", "refresh_token",
            "idtoken", "id_token", "token", "secret", "client_secret", "ssn"
    );

    @Override
    protected String transform(ILoggingEvent event, String input) {
        String masked = HEADERS.matcher(input).replaceAll("$1$2[REDACTED]");
        masked = redactFields(masked);
        return AUTH_SCHEME.matcher(masked).replaceAll("$1 [REDACTED]");
    }

    private static String redactFields(String input) {
        Matcher fields = FIELD_PREFIX.matcher(input);
        StringBuilder masked = new StringBuilder();
        int offset = 0;
        while (fields.find()) {
            int valueEnd = findValueEnd(input, fields.end());
            if (valueEnd <= fields.end()) {
                continue;
            }
            if (isSensitiveField(fields.group(1))) {
                masked.append(input, offset, fields.end()).append("[REDACTED]");
                offset = valueEnd;
                fields.region(offset, input.length());
            }
        }
        return masked.append(input, offset, input.length()).toString();
    }

    private static int findValueEnd(String input, int valueStart) {
        if (valueStart >= input.length()) {
            return valueStart;
        }
        char first = input.charAt(valueStart);
        if (first == '"' || first == '\'') {
            return findQuotedValueEnd(input, valueStart, first);
        }
        return findUnquotedValueEnd(input, valueStart);
    }

    private static int findQuotedValueEnd(String input, int valueStart, char quote) {
        int index = valueStart + 1;
        while (index < input.length()) {
            char ch = input.charAt(index);
            if (ch == '\\') {
                index = Math.min(index + 2, input.length());
                continue;
            }
            if (ch == quote) {
                return index + 1;
            }
            if (ch == '\r' || ch == '\n') {
                return index;
            }
            index++;
        }
        return input.length();
    }

    private static int findUnquotedValueEnd(String input, int valueStart) {
        int index = valueStart;
        while (index < input.length()) {
            char ch = input.charAt(index);
            if (ch == '\r' || ch == '\n' || ch == ',' || ch == '&') {
                break;
            }
            index++;
        }
        return index;
    }

    private static boolean isSensitiveField(String prefix) {
        Matcher matcher = FIELD_NAME.matcher(prefix.toLowerCase(Locale.ROOT));
        if (!matcher.find()) {
            return false;
        }
        return SENSITIVE_FIELDS.contains(matcher.group());
    }

}
