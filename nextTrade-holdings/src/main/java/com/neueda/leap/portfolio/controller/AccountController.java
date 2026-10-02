package com.neueda.leap.portfolio.controller;

import com.neueda.leap.security.JwtPrincipal;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;
import java.util.Map;

/** Provides the caller's trading accounts for portfolio selection and order submission. */
@RestController
public class AccountController {
    private final JdbcTemplate jdbc;

    /**
     * Creates the account query API.
     * @param jdbc primary database access
     */
    public AccountController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /**
     * Lists accounts owned by the authenticated caller.
     * @param principal identity verified from the JWT
     * @return owned accounts, or an empty list
     */
    @GetMapping("/accounts")
    @Transactional(readOnly = true)
    public List<Map<String, Object>> accounts(@AuthenticationPrincipal JwtPrincipal principal) {
        return jdbc.queryForList("""
                SELECT account_id, account_number, account_name, account_status, trader_level, trading_enabled
                FROM accounts WHERE user_id = ? ORDER BY account_number
                """, principal.userId());
    }
}
