# Cellix Add-in Setup Script
# Run this as Administrator!

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Cellix Add-in Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as administrator'" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[1/5] Adding loopback exemption for WebView2..." -ForegroundColor Yellow
try {
    CheckNetIsolation LoopbackExempt -a -n="microsoft.win32webviewhost_cw5n1h2txyewy" 2>$null
    Write-Host "      Loopback exemption added successfully" -ForegroundColor Green
} catch {
    Write-Host "      Warning: Could not add loopback exemption" -ForegroundColor Yellow
}

# Create catalog folder
$catalogPath = "C:\Users\$env:USERNAME\Cellix\addin-catalog"
Write-Host "[2/5] Creating catalog folder at $catalogPath..." -ForegroundColor Yellow
if (-not (Test-Path $catalogPath)) {
    New-Item -ItemType Directory -Path $catalogPath -Force | Out-Null
}
Write-Host "      Folder created" -ForegroundColor Green

# Copy manifest
$manifestSource = "C:\Users\$env:USERNAME\Cellix\apps\addin\manifest.xml"
$manifestDest = "$catalogPath\manifest.xml"
Write-Host "[3/5] Copying manifest file..." -ForegroundColor Yellow
if (Test-Path $manifestSource) {
    Copy-Item $manifestSource $manifestDest -Force
    Write-Host "      Manifest copied" -ForegroundColor Green
} else {
    Write-Host "      ERROR: Manifest not found at $manifestSource" -ForegroundColor Red
    exit 1
}

# Create Windows share
$shareName = "CellixAddinCatalog"
Write-Host "[4/5] Creating Windows network share..." -ForegroundColor Yellow
try {
    # Remove existing share if exists
    $existingShare = Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue
    if ($existingShare) {
        Remove-SmbShare -Name $shareName -Force
    }

    # Create new share with full access for current user
    New-SmbShare -Name $shareName -Path $catalogPath -FullAccess $env:USERNAME | Out-Null
    Write-Host "      Share created: \\$env:COMPUTERNAME\$shareName" -ForegroundColor Green
} catch {
    Write-Host "      Warning: Could not create SMB share. Will use file:// path instead." -ForegroundColor Yellow
}

# Add trusted catalog to registry
Write-Host "[5/5] Adding trusted catalog to registry..." -ForegroundColor Yellow
$guid = [guid]::NewGuid().ToString()
$regPath = "HKCU:\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\{$guid}"
$shareUrl = "\\$env:COMPUTERNAME\$shareName"

try {
    # Create registry key
    New-Item -Path $regPath -Force | Out-Null

    # Set values
    Set-ItemProperty -Path $regPath -Name "Id" -Value "{$guid}"
    Set-ItemProperty -Path $regPath -Name "Url" -Value $shareUrl
    Set-ItemProperty -Path $regPath -Name "Flags" -Value 1 -Type DWord

    Write-Host "      Registry configured for: $shareUrl" -ForegroundColor Green
} catch {
    Write-Host "      ERROR: Could not configure registry" -ForegroundColor Red
    Write-Host "      $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Close ALL Excel windows completely" -ForegroundColor White
Write-Host "2. Make sure the dev server is running (pnpm dev)" -ForegroundColor White
Write-Host "3. Open Excel" -ForegroundColor White
Write-Host "4. Go to: Start (Home) > Invoegtoepassingen (Add-ins)" -ForegroundColor White
Write-Host "5. Click 'Meer invoegtoepassingen' (More Add-ins)" -ForegroundColor White
Write-Host "6. Look for 'GEDEELDE MAP' (SHARED FOLDER) tab" -ForegroundColor White
Write-Host "7. Select 'Cellix' and click 'Toevoegen' (Add)" -ForegroundColor White
Write-Host ""
Write-Host "Network share path: $shareUrl" -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to exit"
