package com.neueda.leap.order.presets;

import com.neueda.leap.security.JwtPrincipal;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/orders/presets")
public class OrderPresetController {
    private final OrderPresetService service;
    public OrderPresetController(OrderPresetService service) { this.service = service; }

    @GetMapping
    public List<OrderPreset> list(@AuthenticationPrincipal JwtPrincipal user, @RequestParam UUID accountId) {
        return service.list(user.userId(), accountId);
    }
    @PutMapping
    public List<OrderPreset> save(@AuthenticationPrincipal JwtPrincipal user, @RequestParam UUID accountId,
                                 @Valid @RequestBody OrderPreset preset) {
        return service.save(user.userId(), accountId, preset);
    }
    @DeleteMapping
    public List<OrderPreset> delete(@AuthenticationPrincipal JwtPrincipal user, @RequestParam UUID accountId,
                                   @RequestParam String name) {
        return service.delete(user.userId(), accountId, name);
    }
}
