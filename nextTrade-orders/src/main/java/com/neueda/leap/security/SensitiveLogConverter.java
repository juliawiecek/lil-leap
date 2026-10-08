package com.neueda.leap.security;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.pattern.CompositeConverter;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Defense in depth for accidental structured credential logging, including exception text.
 * Logging raw payloads or unlabelled secrets is still prohibited.
 */
public class SensitiveLogConverter extends CompositeConverter<ILoggingEvent> {

    public SensitiveLogConverter() {
    }
    private static final Pattern HEADERS = Pattern.compile(
            "(?im)\\b(authorization|proxy-authorization|cookie|set-cookie)([\\\"']?\\s*[:=]\\s*)[^\\r\\n]+"
    );
    private static final Pattern FIELDS = Pattern.compile(
            "(?i)([\"']?\\b(?:password|password_hash|passwordHash|passwd|pwd|token|access_token|accessToken|refresh_token|refreshToken|id_token|secret|client_secret|ssn)[\"']?\\s*[:=]\\s*)"
    );
    private static final Pattern VALUE = Pattern.compile(
            "\"[^\"\\\\]*+(?:\\\\.[^\"\\\\]*+)*+\"|'[^'\\\\]*+(?:\\\\.[^'\\\\]*+)*+'|[^\r\n]+"
    );
    private static final Pattern AUTH_SCHEME = Pattern.compile("(?i)\\b(Bearer|Basic)\\s+[A-Z0-9._~+/=-]+");

    @Override
    protected String transform(ILoggingEvent event, String input) {
        String masked = HEADERS.matcher(input).replaceAll("$1$2[REDACTED]");
        masked = redactFields(masked);
        return AUTH_SCHEME.matcher(masked).replaceAll("$1 [REDACTED]");
    }

    private static String redactFields(String input) {
        Matcher fields = FIELDS.matcher(input);
        Matcher value = VALUE.matcher(input);
        StringBuilder masked = new StringBuilder();
        int offset = 0;
        while (fields.find()) {
            value.region(fields.end(), input.length());
            if (value.lookingAt()) {
                masked.append(input, offset, fields.end()).append("[REDACTED]");
                offset = value.end();
                fields.region(offset, input.length());
            }
        }
        return masked.append(input, offset, input.length()).toString();
    }

}
