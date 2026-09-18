package com.neueda.leap.security;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.pattern.CompositeConverter;

import java.util.regex.Pattern;

/** Defense in depth for accidental structured credential logging, including exception text.
 * Logging raw payloads or unlabelled secrets is still prohibited.
 */
public class SensitiveLogConverter extends CompositeConverter<ILoggingEvent> {

    /** Creates the credential-masking converter instantiated by Logback. */
    public SensitiveLogConverter() {
    }
    private static final Pattern HEADERS = Pattern.compile(
            "(?im)\\b(authorization|proxy-authorization|cookie|set-cookie)([\\\"']?\\s*[:=]\\s*)[^\\r\\n]+"
    );
    private static final Pattern FIELDS = Pattern.compile(
            "(?i)([\\\"']?\\b(?:password|password_hash|passwordHash|passwd|pwd|token|access_token|accessToken|refresh_token|refreshToken|id_token|secret|client_secret|ssn)[\\\"']?\\s*[:=]\\s*)"
                    + "(?:\\\"(?:\\\\.|[^\\\"\\\\])*\\\"|'(?:\\\\.|[^'\\\\])*'|[^\\r\\n]+)"
    );
    private static final Pattern AUTH_SCHEME = Pattern.compile("(?i)\\b(Bearer|Basic)\\s+[A-Za-z0-9._~+/=-]+");

    @Override
    protected String transform(ILoggingEvent event, String input) {
        String masked = HEADERS.matcher(input).replaceAll("$1$2[REDACTED]");
        masked = FIELDS.matcher(masked).replaceAll("$1[REDACTED]");
        return AUTH_SCHEME.matcher(masked).replaceAll("$1 [REDACTED]");
    }
}
