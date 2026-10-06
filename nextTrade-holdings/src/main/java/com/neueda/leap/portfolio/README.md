# TS-11.1c Implementation: Single-Holding Lookup

## Endpoint
```
GET /holdings/{accountId}/{instrumentId}
```

**Frontend path:** `/api/holdings/{accountId}/{instrumentId}` (nginx rewrites to root level)

## Overview
Implements the single-holding lookup endpoint as per TS-11.1c (story ticket splitting TS-11.1 / NEXT-115).

## Acceptance Criteria

### AC1: Returns detail for one holding, scoped to the authenticated caller
- **Implementation**: `ClientPortfolioController.getHolding()`
- **Behavior**: Returns HTTP 200 with `HoldingResponse` containing full holding details
- **Scoping**: Uses JWT `userId` to verify caller ownership of the account via database JOIN on `accounts.user_id`
- **Query**: `ClientPortfolioQueryService.getHoldingByIdScoped()` filters holdings to (userId, accountId, instrumentId)

### AC2: Requesting another client's holding ID returns 403/404, not their data
- **Implementation**: Returns HTTP 404 when:
  1. The holding does not exist
  2. The requested account does not belong to the authenticated caller
  3. The instrument in the holding does not exist
- **Security**: 404 prevents information leakage (caller cannot distinguish between "holding doesn't exist" and "you don't own this account")
- **Pattern**: Follows database-level scoping from NEXT-89 — if the JOIN on `accounts.user_id` fails, no row is returned

### AC3: Depends on TS-11.1 (NEXT-115) for the underlying holdings query
- **Implementation**: Reuses the same holdings query structure as `ClientFinancialQueryService` in the insights service
- **Query Pattern**: 
  ```sql
  SELECT h.account_id, h.instrument_id, i.symbol, i.instrument_name,
         h.quantity, h.avg_cost, h.updated_at
  FROM holdings h
  JOIN accounts a ON a.account_id = h.account_id
  JOIN instruments i ON i.instrument_id = h.instrument_id
  WHERE a.user_id = ? AND h.account_id = ? AND h.instrument_id = ?
  ```
- **Dependency**: Relies on existing `holdings`, `accounts`, and `instruments` tables created by TS-11.1

## Authentication
- **Required**: `Authorization: Bearer <JWT>`
- **Extracted from token**: `userId` (JWT subject claim)
- **Guard**: `JwtAuthenticationFilter` validates token signature and expiry
- **Failure Response**: HTTP 401 UNAUTHORIZED for missing or invalid tokens

## Response Format

### Success (200 OK)
```json
{
  "accountId": "550e8400-e29b-41d4-a716-446655440000",
  "instrumentId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "symbol": "AAPL",
  "instrumentName": "Apple Inc.",
  "quantity": 100,
  "averageCost": 150.50,
  "updatedAt": "2026-01-15T10:00:00Z"
}
```

### Not Found (404 NOT FOUND)
```json
{
  "timestamp": "2026-10-01T19:30:00Z",
  "status": 404,
  "error": "Not Found",
  "message": "Holding not found"
}
```

### Unauthorized (401 UNAUTHORIZED)
```json
{
  "error": "INVALID_TOKEN",
  "message": "Invalid or expired token."
}
```

## Implementation Files

1. **Controller**: `src/main/java/com/neueda/leap/portfolio/controller/ClientPortfolioController.java`
   - REST endpoint definition
   - Annotation-based authorization
   - Request routing

2. **Service**: `src/main/java/com/neueda/leap/portfolio/service/ClientPortfolioQueryService.java`
   - JDBC query execution
   - Result mapping to DTO
   - User-scoped database access

3. **DTO**: `src/main/java/com/neueda/leap/portfolio/dto/HoldingResponse.java`
   - Response payload structure
   - Matches insights service pattern

4. **Tests**: `src/test/java/com/neueda/leap/portfolio/SingleHoldingLookupTest.java`
   - 10 test cases covering:
     - Successful retrieval
     - Cross-client denial (404)
     - Non-existent holdings (404)
     - Authentication failures (401)
     - Edge cases (unknown account, invalid tokens)

5. **Test Schema**: `src/test/resources/portfolio/isolation-schema.sql`
   - H2 in-memory database schema
   - Matches production table structure
   - Enables integration testing without PostgreSQL dependency

## Testing

Run all tests:
```bash
mvn test -Dtest=SingleHoldingLookupTest
```

Expected results: 10 tests passing
- ✓ `ownerCanRetrieveSingleHolding`
- ✓ `ownerCanRetrieveHoldingFromSecondAccount`
- ✓ `nonExistentHoldingReturns404`
- ✓ `strangersHoldingReturns404` (cross-client denial)
- ✓ `unknownAccountReturns404`
- ✓ `missingBearerTokenReturns401`
- ✓ `invalidBearerTokenReturns401`
- ✓ `expiredBearerTokenReturns401`

## Architecture Patterns

### User Scoping
All queries join through `accounts.user_id` to ensure results belong only to the authenticated caller:
```java
WHERE a.user_id = ? AND h.account_id = ? AND h.instrument_id = ?
```

### JWT Integration
- **Extraction**: `@AuthenticationPrincipal JwtPrincipal principal`
- **Principal Type**: `JwtPrincipal` record containing `userId`, `email`, `role`
- **Token Validation**: Performed by `JwtAuthenticationFilter` before controller is reached

### Error Handling
- **400 Bad Request**: Invalid UUID format in path variables (Spring validation)
- **401 Unauthorized**: Missing or invalid token (JwtAuthenticationFilter)
- **404 Not Found**: Non-existent holding or cross-client access (ResponseStatusException)

## Security Considerations

1. **Information Leakage Prevention**: 404 response doesn't distinguish between "holding doesn't exist" and "you don't own this account"
2. **Token Validation**: All tokens validated by shared JWT secret (`APP_JWT_SECRET` env var)
3. **Database Isolation**: User ID from token is never overridable by request parameters
4. **Stateless Auth**: No session state — all identity in JWT claims

## Future Extensions

This implementation provides foundation for:
- Batch holding lookups (GET /holdings filtered by multiple IDs)
- Holding updates (PATCH /holdings/{accountId}/{instrumentId})
- Holding deletion (DELETE /holdings/{accountId}/{instrumentId})
- Portfolio analytics (aggregations across holdings)
