package com.neueda.leap.order.presets;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

/** Reusable settings; never stores a symbol-specific entry price or executes an order. */
public record OrderPreset(
        @NotBlank @Size(max = 40) String name,
        @NotNull @Pattern(regexp = "MARKET|LIMIT") String orderType,
        @Min(1) @Max(9007199254740991L) long quantity,
        @NotNull @DecimalMin("0.1") @DecimalMax("10") BigDecimal tolerance,
        @DecimalMin(value = "0", inclusive = false) @DecimalMax(value = "100", inclusive = false) BigDecimal profitPercent,
        @DecimalMin(value = "0", inclusive = false) @DecimalMax(value = "100", inclusive = false) BigDecimal stopPercent,
        @DecimalMin(value = "0", inclusive = false) @DecimalMax("99999999999999") BigDecimal riskBudget) {
    public OrderPreset {
        if (name != null) name = name.trim();
    }
}
