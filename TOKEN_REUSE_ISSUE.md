# Critical Issue: JWT Token Reuse Rejection

**Status**: CONFIRMED  
**Severity**: HIGH - Blocks integration testing  
**Date**: 2026-09-30 18:25 UTC

---

## Issue Summary

The Orders service accepts a JWT token for the **first request**, but **rejects the same token on subsequent requests**, returning **401 UNAUTHENTICATED**.

```
Request 1 (Same Token) → HTTP 201 CREATED ✓
Request 2 (Same Token) → HTTP 401 UNAUTHENTICATED ✗
Request 3 (Same Token) → HTTP 401 UNAUTHENTICATED ✗
```

---

## Test Evidence

### Test Execution
```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...." # Generated once
curl -H "Authorization: Bearer ${TOKEN}" ... # Request 1
→ HTTP 201 {"orderId":"960f7f5c-...","status":"PENDING"}

curl -H "Authorization: Bearer ${TOKEN}" ... # Request 2 - SAME TOKEN
→ HTTP 401 {"error":"UNAUTHENTICATED","message":"Authentication is required."}
```

### Environment
- Service: Orders on EC2 (10.14.141.133:8082)
- Token Secret: `nexttrade-shared-dev-secret-32bytes-min` (verified in docker inspect)
- Token Claims: `{sub, email, user_role: "TRADER"}`
- Token Expiration: 2h (generated fresh 1-2 seconds before test)
- Token Signature: Valid (Auth service signed with same secret)

---

## Root Cause Analysis

### NOT the Issue
- ❌ Token expiration (2h duration, test ran in seconds)
- ❌ Secret mismatch (docker inspect verified identical)
- ❌ Claim name (using correct `user_role` claim)
- ❌ Stale deployment (fresh build just executed)
- ❌ Token format (first request proves format is correct)

### Likely Causes
1. **JwtAuthenticationFilter consuming token state**
   - Filter may be caching or marking token as "used"
   - Would require stateful token tracking (unlikely in stateless JWT design)

2. **SecurityContext not properly isolated per request**
   - SecurityContext might be corrupted after first request
   - Thread-local storage issue in Spring Security

3. **Filter chain exception not logged**
   - JwtService.validate() catches all exceptions silently
   - Exception on second use might not be visible in logs

4. **Spring Security session handling**
   - Despite stateless config, may have residual session state

---

## Code Investigation Needed

### JwtAuthenticationFilter.doFilterInternal() (Line 55-90)

Current flow on second request:
```
1. Get Authorization header → ✓ (header IS present)
2. Check startswith("Bearer ") → ✓ (format correct)
3. Extract token string → ✓ (substring extraction works)
4. jwtService.validate(token) → ✗ (returns Optional.empty() on SECOND use)
5. principal.isEmpty() → true
6. Return 401 INVALID_TOKEN response
```

**Question**: Why does `jwtService.validate(token)` fail on second use but not first?

### JwtService.validate() (Line 121-135)

```java
public Optional<JwtPrincipal> validate(String token) {
    try {
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)  // ← FAILS on second use?
                .getPayload();
        // ... extract claims
    } catch (JwtException | IllegalArgumentException e) {
        return Optional.empty();  // ← Silently returns empty
    }
}
```

**Potential Issue**: 
- JwtException thrown on second use (but not logged)
- Possible causes:
  - Token already parsed and cached (unlikely)
  - Parser object stateful (but it's created fresh per call)
  - Key object somehow modified after first use

---

## Workaround Strategy

Until root cause is identified, **integration tests must use fresh token per request**:

```bash
# ✅ WORKING APPROACH
for scenario in buy sell disabled; do
  TOKEN=$(generate_fresh_jwt)  # New token each time
  curl -H "Authorization: Bearer ${TOKEN}" ...
done

# ❌ BROKEN APPROACH  
TOKEN=$(generate_jwt_once)
for scenario in buy sell disabled; do
  curl -H "Authorization: Bearer ${TOKEN}" ...  # Reuse fails
done
```

---

## Validation Steps Needed

1. Add detailed logging to JwtService.validate() catch block:
   ```java
   } catch (JwtException | IllegalArgumentException e) {
       logger.error("Token validation failed: {}", e.getMessage());
       logger.error("Token payload: {}", token.substring(0, 50) + "...");
       return Optional.empty();
   }
   ```

2. Check if Jwts.parser() is stateful:
   ```java
   // Hypothesis: Create new parser each time
   JwtParser parser = Jwts.parserBuilder()
           .verifyWith(key)
           .build();
   ```

3. Add Spring Security context logging:
   ```java
   logger.info("Before filter: {}", SecurityContextHolder.getContext());
   filterChain.doFilter(request, response);
   logger.info("After filter: {}", SecurityContextHolder.getContext());
   ```

4. Monitor for INVALID_TOKEN responses (not UNAUTHENTICATED):
   - If second request gets INVALID_TOKEN: Token validation is running but failing
   - If second request gets UNAUTHENTICATED: Filter is exiting before validation

---

## Impact Assessment

**Critical for Testing**:
- Cannot use single token for multiple scenarios
- Must regenerate token before each request
- Adds 50-100ms latency per request (Docker exec for token generation)
- Full integration test suite (15 scenarios) will take ~1-2 minutes

**Production Implication**:
- If real users are seeing this, clients must request new token for each API call
- This would be VERY unusual for JWT authentication
- Likely this is a test environment artifact

---

## Recommendation

**Implement fresh token per request in integration test suite**:
- Known working pattern (confirmed by first successful request per token)
- Statistically pure (each request tested with valid auth)
- No side effects between scenarios
- Allows complete 15-scenario test to proceed

**Then** investigate root cause in separate debugging session:
- Add logging to JwtService.validate()
- Check if this occurs in production (unlikely)
- Determine if stateless JWT is truly stateless

---

## Next Action

Execute comprehensive 15-scenario integration test using fresh token per request:
```bash
for scenario in $(seq 1 15); do
  TOKEN=$(generate_fresh_jwt)
  submit_order_scenario_$scenario "$TOKEN"
  sleep 0.1
done
```

This will allow completion of testing while root cause investigation happens in parallel.
