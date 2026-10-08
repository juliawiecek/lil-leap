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
    private static final Pattern VALUE = Pattern.compile(
            "\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|[^\r\n]+"
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
        Matcher value = VALUE.matcher(input);
        StringBuilder masked = new StringBuilder();
        int offset = 0;
        while (fields.find()) {
            value.region(fields.end(), input.length());
            if (!value.lookingAt()) {
                continue;
            }
            if (isSensitiveField(fields.group(1))) {
                masked.append(input, offset, fields.end()).append("[REDACTED]");
                offset = value.end();
                fields.region(offset, input.length());
            }
        }
        return masked.append(input, offset, input.length()).toString();
    }

    private static boolean isSensitiveField(String prefix) {
        Matcher matcher = FIELD_NAME.matcher(prefix.toLowerCase(Locale.ROOT));
        if (!matcher.find()) {
            return false;
        }
        return SENSITIVE_FIELDS.contains(matcher.group());
    }

}
