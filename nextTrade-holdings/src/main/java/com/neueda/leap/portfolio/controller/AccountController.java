package com.neueda.leap.portfolio.controller;

import com.neueda.leap.portfolio.dto.AccountResponse;
import com.neueda.leap.portfolio.dto.CashActivityResponse;
import com.neueda.leap.portfolio.dto.OpenAccountRequest;
import com.neueda.leap.portfolio.dto.TransferRequest;
import com.neueda.leap.portfolio.dto.TransferResponse;
import com.neueda.leap.portfolio.service.AccountService;
import com.neueda.leap.security.JwtPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The caller's trading accounts: list for selection, open another, move cash between them (PS-05),
 * and list their cash movements for the activity feed (PS-11).
 */
@RestController
@Tag(name = "Accounts", description = "The caller's own accounts and transfers between them")
@SecurityRequirement(name = "bearerAuth")
public class AccountController {
    private final AccountService accounts;

    /**
     * Creates the account API.
     * @param accounts account queries and changes scoped to the caller
     */
    public AccountController(AccountService accounts) { this.accounts = accounts; }

    /**
     * Lists accounts owned by the authenticated caller.
     * @param principal identity verified from the JWT
     * @return owned accounts, oldest first, or an empty list
     */
    @GetMapping("/accounts")
    @Operation(summary = "List my accounts", description = "Oldest first, with settled cash available to move or trade.")
    public List<Map<String, Object>> accounts(@AuthenticationPrincipal JwtPrincipal principal) {
        return accounts.list(principal.userId());
    }

    /**
     * Lists the caller's deposits, withdrawals and transfers for the activity feed (PS-11).
     * @param from first day to include (ISO date, UTC)
     * @param to last day to include (ISO date, UTC)
     * @param accountId one owned account; omit for all of them
     * @param principal identity verified from the JWT
     * @return non-trade cash movements, newest first
     */
    @GetMapping("/accounts/cash-activity")
    @PreAuthorize("hasRole('TRADER')")
    @Operation(summary = "List my cash movements",
            description = "Deposits, withdrawals, transfers and other non-trade cash, newest first, at most 500. "
                    + "Trades are in order history.")
    @ApiResponse(responseCode = "200", description = "Matching movements, or an empty list")
    @ApiResponse(responseCode = "400", description = "from is after to, or a filter is malformed")
    public List<CashActivityResponse> cashActivity(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID accountId,
            @AuthenticationPrincipal JwtPrincipal principal) {
        return accounts.cashActivity(principal.userId(), accountId, from, to);
    }

    /**
     * Opens another individual cash account in USD, ACTIVE with $0.
     * @param request nickname for the account
     * @param principal identity verified from the JWT
     * @return HTTP 201 with the new account
     */
    @PostMapping("/accounts")
    @PreAuthorize("hasRole('TRADER')")
    @Operation(summary = "Open another account", description = "Type and currency are fixed: INDIVIDUAL_CASH, USD.")
    @ApiResponse(responseCode = "201", description = "Account opened")
    @ApiResponse(responseCode = "400", description = "Nickname missing or invalid")
    @ApiResponse(responseCode = "409", description = "Account limit reached")
    public ResponseEntity<AccountResponse> open(@Valid @RequestBody OpenAccountRequest request,
            @AuthenticationPrincipal JwtPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED).body(accounts.open(principal.userId(), request.nickname()));
    }

    /**
     * Moves settled cash between two of the caller's accounts.
     * @param request source, target and amount
     * @param principal identity verified from the JWT
     * @return HTTP 200 with both balances after the transfer
     */
    @PostMapping("/accounts/transfers")
    @PreAuthorize("hasRole('TRADER')")
    @Operation(summary = "Transfer cash between my accounts", description = "Internal book transfer of settled USD cash.")
    @ApiResponse(responseCode = "200", description = "Transfer committed")
    @ApiResponse(responseCode = "400", description = "Invalid amount, or the same account twice")
    @ApiResponse(responseCode = "403", description = "An account is not the caller's")
    @ApiResponse(responseCode = "409", description = "Not enough available cash, or an account is not open")
    public TransferResponse transfer(@Valid @RequestBody TransferRequest request,
            @AuthenticationPrincipal JwtPrincipal principal) {
        return accounts.transfer(principal.userId(), request);
    }
}
