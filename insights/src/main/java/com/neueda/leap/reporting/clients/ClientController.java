package com.neueda.leap.reporting.clients;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/**
 * Clients page API (TS-18.5): trading accounts with their holdings and filled orders, from the reporting
 * dataset the Reports page also reads. Accounts carry their owner's name and email; responses never include
 * the owning user's id.
 */
@RestController
@RequestMapping("/reports/clients")
@PreAuthorize("hasAnyRole('ANALYST', 'OPERATIONS')")
@Tag(name = "Clients", description = "Trading accounts for the Clients page; ANALYST and OPERATIONS only")
public class ClientController {

    /** Largest page any Clients endpoint returns. */
    public static final int MAX_PAGE_SIZE = 100;

    private final ClientRepository clients;

    /**
     * Creates the Clients endpoints.
     *
     * @param clients account data from the reporting dataset
     */
    public ClientController(ClientRepository clients) {
        this.clients = clients;
    }

    /**
     * Lists trading accounts.
     *
     * @param search part of an account number or name, a client's name or email, or a full account or order ID
     * @param level NOVICE or ADVANCED
     * @param status PENDING, ACTIVE, BLOCKED or CLOSED
     * @param sort {@code key} or {@code key,asc|desc}
     * @param page zero-based page number
     * @param size page size, 1 to 100
     * @return one page of accounts
     */
    @GetMapping
    @Operation(summary = "Trading accounts with owner, trader level, status, trade count, traded value and last trade")
    public ClientDtos.Page<ClientDtos.ClientSummary> list(
            @Parameter(description = "Part of an account number or name, a client's name or email, or a full account or order ID") @RequestParam(required = false) String search,
            @Parameter(description = "NOVICE or ADVANCED") @RequestParam(required = false) String level,
            @Parameter(description = "PENDING, ACTIVE, BLOCKED or CLOSED") @RequestParam(required = false) String status,
            @Parameter(description = "accountNumber, accountName, clientName, email, traderLevel, status, tradeCount, tradedValue or lastTradeAt, "
                    + "optionally followed by ,asc or ,desc") @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "25") @Min(1) @Max(MAX_PAGE_SIZE) int size) {
        return clients.list(ClientQuery.of(search, level, status, sort, page, size));
    }

    /**
     * Returns one account's summary and holdings.
     *
     * @param accountId the account
     * @return the account detail
     * @throws ResponseStatusException 404 when there is no such account
     */
    @GetMapping("/{accountId}")
    @Operation(summary = "One account's summary and holdings")
    public ClientDtos.ClientDetail detail(@PathVariable UUID accountId) {
        ClientDtos.ClientSummary account = clients.summary(accountId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return new ClientDtos.ClientDetail(account, clients.holdings(accountId));
    }

    /**
     * Lists one account's filled orders, newest first.
     *
     * @param accountId the account
     * @param search a symbol prefix or a full order ID
     * @param page zero-based page number
     * @param size page size, 1 to 100
     * @return one page of orders
     * @throws ResponseStatusException 404 when there is no such account
     */
    @GetMapping("/{accountId}/orders")
    @Operation(summary = "One account's filled orders, newest first, with fill price; filter by symbol or order ID")
    public ClientDtos.Page<ClientDtos.Order> orders(
            @PathVariable UUID accountId,
            @Parameter(description = "A symbol prefix or a full order ID") @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "25") @Min(1) @Max(MAX_PAGE_SIZE) int size) {
        if (clients.summary(accountId).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return clients.orders(accountId, search == null || search.isBlank() ? null : search.trim(), page, size);
    }
}
