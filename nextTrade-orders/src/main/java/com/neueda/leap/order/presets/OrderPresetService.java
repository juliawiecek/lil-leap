package com.neueda.leap.order.presets;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.UUID;

/** Account ownership is checked on every read/write; the account lock serializes the ten-preset cap. */
@Service
public class OrderPresetService {
    private final JdbcTemplate jdbc;
    public OrderPresetService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private void authorize(UUID user, UUID account, boolean lock) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        var owned = jdbc.queryForList("SELECT account_id FROM accounts WHERE account_id=? AND user_id=?"
                + (lock ? " FOR UPDATE" : ""), UUID.class, account, user);
        if (owned.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found");
    }

    @Transactional(readOnly = true)
    public List<OrderPreset> list(UUID user, UUID account) {
        authorize(user, account, false);
        return read(account);
    }

    @Transactional
    public List<OrderPreset> save(UUID user, UUID account, OrderPreset preset) {
        authorize(user, account, true);
        var current = read(account);
        if (current.size() >= 10 && current.stream().noneMatch(p -> p.name().equals(preset.name())))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You can save up to 10 presets per account");
        jdbc.update("""
                INSERT INTO account_order_presets(account_id,name,order_type,quantity,tolerance,profit_percent,stop_percent,risk_budget)
                VALUES (?,?,?,?,?,?,?,?)
                ON CONFLICT (account_id,name) DO UPDATE SET order_type=EXCLUDED.order_type,
                    quantity=EXCLUDED.quantity,tolerance=EXCLUDED.tolerance,profit_percent=EXCLUDED.profit_percent,
                    stop_percent=EXCLUDED.stop_percent,risk_budget=EXCLUDED.risk_budget
                """, account, preset.name(), preset.orderType(), preset.quantity(), preset.tolerance(),
                preset.profitPercent(), preset.stopPercent(), preset.riskBudget());
        return read(account);
    }

    @Transactional
    public List<OrderPreset> delete(UUID user, UUID account, String name) {
        authorize(user, account, true);
        jdbc.update("DELETE FROM account_order_presets WHERE account_id=? AND name=?", account, name);
        return read(account);
    }

    private List<OrderPreset> read(UUID account) {
        return jdbc.query("""
                SELECT name,order_type,quantity,tolerance,profit_percent,stop_percent,risk_budget
                FROM account_order_presets WHERE account_id=? ORDER BY name
                """, (rs, n) -> new OrderPreset(rs.getString(1), rs.getString(2), rs.getLong(3), rs.getBigDecimal(4),
                rs.getBigDecimal(5), rs.getBigDecimal(6), rs.getBigDecimal(7)), account);
    }
}
