package com.neueda.leap.order.submission;

/** PostgreSQL's {@code jsonb_build_object} for the H2 runs of the submission tests. */
public final class H2JsonFunctions {
    private H2JsonFunctions() {
    }

    /**
     * Builds a JSON object from name/value pairs, as PostgreSQL does; H2 passes every value as text.
     *
     * @param pairs alternating names and values
     * @return the object as JSON text
     */
    public static String jsonbBuildObject(String... pairs) {
        StringBuilder json = new StringBuilder("{");
        for (int i = 0; i < pairs.length; i += 2) {
            if (i > 0) {
                json.append(',');
            }
            json.append(quote(String.valueOf(pairs[i]))).append(':');
            String value = pairs[i + 1];
            json.append(value == null ? "null" : quote(value));
        }
        return json.append('}').toString();
    }

    private static String quote(String text) {
        return '"' + text.replace("\\", "\\\\").replace("\"", "\\\"") + '"';
    }
}
