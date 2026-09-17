# Windows-only development setup. Trusts a localhost leaf certificate for this user.
$ErrorActionPreference = 'Stop'
$openssl = Get-Command openssl -ErrorAction SilentlyContinue
if ($openssl) { $openssl = $openssl.Source }
else { $openssl = Join-Path $env:ProgramFiles 'Git/usr/bin/openssl.exe' }
if (-not (Test-Path -LiteralPath $openssl)) {
    throw 'OpenSSL is required. Install Git for Windows, then run this script again.'
}

$tlsDir = Join-Path $env:LOCALAPPDATA 'NextTrade/tls'
New-Item -ItemType Directory -Force -Path $tlsDir | Out-Null
# Private key and password files are accessible only to this Windows account.
$acl = Get-Acl -LiteralPath $tlsDir
$acl.SetAccessRuleProtection($true, $false)
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$acl.SetAccessRule($rule)
Set-Acl -LiteralPath $tlsDir -AclObject $acl

$certPath = Join-Path $tlsDir 'localhost.crt'
$keyPath = Join-Path $tlsDir 'localhost.key'
$storePath = Join-Path $tlsDir 'backend.p12'
$passwordPath = Join-Path $tlsDir 'password.dpapi'
# Reuse existing material. Refuse partial state rather than overwrite private keys.
$existing = @($certPath, $keyPath, $storePath, $passwordPath | Where-Object { Test-Path -LiteralPath $_ })
if ($existing.Count -eq 0) {
    & $openssl genrsa -out $keyPath 3072
    if ($LASTEXITCODE -ne 0) { throw 'Could not generate localhost private key.' }
    & $openssl req -x509 -key $keyPath -sha256 -days 90 -out $certPath -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1' -addext 'basicConstraints=critical,CA:FALSE' -addext 'keyUsage=critical,digitalSignature,keyEncipherment' -addext 'extendedKeyUsage=serverAuth'
    if ($LASTEXITCODE -ne 0) { throw 'Could not generate localhost certificate.' }
    $random = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($random)
    $rng.Dispose()
    $password = [Convert]::ToBase64String($random)
    $env:NEXTTRADE_PFX_PASSWORD = $password
    try {
        & $openssl pkcs12 -export -out $storePath -inkey $keyPath -in $certPath -name backend -passout env:NEXTTRADE_PFX_PASSWORD
        if ($LASTEXITCODE -ne 0) { throw 'Could not export backend keystore.' }
        ConvertTo-SecureString $password -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $passwordPath
    } finally {
        Remove-Item Env:NEXTTRADE_PFX_PASSWORD
        $password = $null
    }
} elseif ($existing.Count -ne 4) {
    throw "Incomplete TLS files in $tlsDir. Move them aside and rerun setup."
}

& $openssl x509 -in $certPath -checkend 0 -noout
if ($LASTEXITCODE -ne 0) { throw "Certificate expired. Move $tlsDir aside and rerun setup." }
Import-Certificate -FilePath $certPath -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
Write-Host "Trusted localhost certificate for the current Windows user. Files: $tlsDir"
Write-Host 'Restart the frontend with npm start. See backend/README.md for backend environment settings.'
