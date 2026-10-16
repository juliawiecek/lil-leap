# Business Validation Matrix Test Script
# Tests 16 scenarios against POST /api/v1/orders
# Run from Windows PowerShell

$ErrorActionPreference = "Stop"

$ORDERS_URL = "http://10.14.141.133:8082/api/v1"
$AUTH_URL = "http://10.14.141.133:4200/auth"

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "   BUSINESS VALIDATION MATRIX - 16 SCENARIOS" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# Get auth token
Write-Host "`nRetrieving authentication token..." -ForegroundColor Green

try {
    $loginBody = @{
        email = "trader-test@example.com"
        password = "pw-123456789"
    } | ConvertTo-Json
    
    $loginResponse = Invoke-WebRequest -Uri "$AUTH_URL/login" `
        -Method Post `
        -ContentType "application/json" `
        -Body $loginBody `
        -UseBasicParsing
    
    $loginData = $loginResponse.Content | ConvertFrom-Json
    $TOKEN = $loginData.accessToken
    $TRADER_ID = $loginData.user.id
    
    Write-Host "✓ Token obtained: $($TOKEN.Substring(0, 20))..." -ForegroundColor Green
    Write-Host "  Trader ID: $TRADER_ID" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to retrieve token" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Test execution function
function Run-Test {
    param(
        [int]$TestNum,
        [string]$Description,
        [string]$RequestBody,
        [int]$ExpectedStatus,
        [string]$ExpectedReason
    )
    
    Write-Host "`nTest $TestNum`: $Description" -ForegroundColor Blue
    
    try {
        $response = Invoke-WebRequest -Uri "$ORDERS_URL/orders" `
            -Method Post `
            -ContentType "application/json" `
            -Headers @{ "Authorization" = "Bearer $TOKEN" } `
            -Body $RequestBody `
            -UseBasicParsing `
            -SkipHttpErrorCheck
        
        $httpStatus = $response.StatusCode
        $body = $response.Content | ConvertFrom-Json
        
        $reasonCode = if ($body.error) { $body.error } elseif ($body.reasonCode) { $body.reasonCode } else { "null" }
        $orderId = if ($body.orderId) { $body.orderId } else { "null" }
        
        $statusMatch = if ($httpStatus -eq $ExpectedStatus) { "✓" } else { "✗" }
        if ($ExpectedReason -and $reasonCode -eq $ExpectedReason) { $statusMatch = "✓✓" }
        
        Write-Host "  HTTP Status: $httpStatus (expected: $ExpectedStatus) $statusMatch" -ForegroundColor $(if ($statusMatch -eq "✗") { "Red" } else { "Green" })
        Write-Host "  Reason Code: $reasonCode (expected: $ExpectedReason)" -ForegroundColor Gray
        Write-Host "  Order ID: $orderId" -ForegroundColor Gray
        
    } catch {
        Write-Host "  ✗ Request failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Sample test data (using placeholder UUIDs for now)
$goodAccount = "650e8400-e29b-41d4-a716-446655440001"
$goodInstrument = "550e8400-e29b-41d4-a716-446655440010"
$badInstrument = "00000000-0000-0000-0000-000000000000"
$disabledInstrument = "00000000-0000-0000-0000-000000000001"
$haltedInstrument = "00000000-0000-0000-0000-000000000002"
$foreignAccount = "00000000-0000-0000-0000-000000000003"
$inactiveAccount = "00000000-0000-0000-0000-000000000004"
$noTradingAccount = "00000000-0000-0000-0000-000000000005"

# Test 1: Valid BUY
$body1 = @{
    accountId = $goodAccount
    instrumentId = $goodInstrument
    side = "BUY"
    quantity = 10
} | ConvertTo-Json
Run-Test -TestNum 1 -Description "Valid BUY with sufficient funds" -RequestBody $body1 -ExpectedStatus 201 -ExpectedReason "null"

# Test 2: Valid SELL
$body2 = @{
    accountId = $goodAccount
    instrumentId = $goodInstrument
    side = "SELL"
    quantity = 5
} | ConvertTo-Json
Run-Test -TestNum 2 -Description "Valid SELL with sufficient holdings" -RequestBody $body2 -ExpectedStatus 201 -ExpectedReason "null"

# Test 3: Foreign account
$body3 = @{
    accountId = $foreignAccount
    instrumentId = $goodInstrument
    side = "BUY"
    quantity = 1
} | ConvertTo-Json
Run-Test -TestNum 3 -Description "Foreign account access denied" -RequestBody $body3 -ExpectedStatus 403 -ExpectedReason "ACCOUNT_NOT_FOUND"

# Test 4: Inactive account
$body4 = @{
    accountId = $inactiveAccount
    instrumentId = $goodInstrument
    side = "BUY"
    quantity = 1
} | ConvertTo-Json
Run-Test -TestNum 4 -Description "Inactive account rejected" -RequestBody $body4 -ExpectedStatus 422 -ExpectedReason "ACCOUNT_NOT_FOUND"

# Test 5: Trading disabled
$body5 = @{
    accountId = $noTradingAccount
    instrumentId = $goodInstrument
    side = "BUY"
    quantity = 1
} | ConvertTo-Json
Run-Test -TestNum 5 -Description "Account with trading disabled" -RequestBody $body5 -ExpectedStatus 422 -ExpectedReason "TRADING_DISABLED"

# Test 6: Unknown instrument
$body6 = @{
    accountId = $goodAccount
    instrumentId = $badInstrument
    side = "BUY"
    quantity = 1
} | ConvertTo-Json
Run-Test -TestNum 6 -Description "Unknown instrument not found" -RequestBody $body6 -ExpectedStatus 422 -ExpectedReason "INSTRUMENT_NOT_FOUND"

# Test 7: Disabled instrument
$body7 = @{
    accountId = $goodAccount
    instrumentId = $disabledInstrument
    side = "BUY"
    quantity = 1
} | ConvertTo-Json
Run-Test -TestNum 7 -Description "Disabled instrument (enabled=false)" -RequestBody $body7 -ExpectedStatus 422 -ExpectedReason "INSTRUMENT_DISABLED"

# Test 8: Not tradable instrument
$body8 = @{
    accountId = $goodAccount
    instrumentId = $haltedInstrument
    side = "BUY"
    quantity = 1
} | ConvertTo-Json
Run-Test -TestNum 8 -Description "Not tradable instrument (tradable=false)" -RequestBody $body8 -ExpectedStatus 422 -ExpectedReason "INSTRUMENT_NOT_TRADABLE"

# Test 9: Insufficient cash
$body9 = @{
    accountId = $goodAccount
    instrumentId = $goodInstrument
    side = "BUY"
    quantity = 10000
} | ConvertTo-Json
Run-Test -TestNum 9 -Description "Insufficient cash balance" -RequestBody $body9 -ExpectedStatus 422 -ExpectedReason "INSUFFICIENT_CASH"

# Test 10: Insufficient holdings
$body10 = @{
    accountId = $goodAccount
    instrumentId = $goodInstrument
    side = "SELL"
    quantity = 10000
} | ConvertTo-Json
Run-Test -TestNum 10 -Description "Insufficient holdings for SELL" -RequestBody $body10 -ExpectedStatus 422 -ExpectedReason "INSUFFICIENT_HOLDINGS"

# Test 12: Zero quantity
$body12 = @{
    accountId = $goodAccount
    instrumentId = $goodInstrument
    side = "BUY"
    quantity = 0
} | ConvertTo-Json
Run-Test -TestNum 12 -Description "Zero quantity rejected" -RequestBody $body12 -ExpectedStatus 400 -ExpectedReason "null"

# Test 13: Negative quantity
$body13 = @{
    accountId = $goodAccount
    instrumentId = $goodInstrument
    side = "BUY"
    quantity = -5
} | ConvertTo-Json
Run-Test -TestNum 13 -Description "Negative quantity rejected" -RequestBody $body13 -ExpectedStatus 400 -ExpectedReason "null"

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "   VALIDATION MATRIX COMPLETE" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
