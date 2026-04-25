# deploy_all_functions.ps1
# Redeploys ALL Edge Functions so they pick up the updated _shared/cors.ts.
# Usage: .\supabase\deploy_all_functions.ps1
#
# Requires: supabase CLI authenticated (run `supabase login` first, or set SUPABASE_ACCESS_TOKEN)
# Project ref: dqqjaujnulutinskmqsu

$PROJECT_REF = "dqqjaujnulutinskmqsu"
$FUNCTIONS_DIR = Join-Path $PSScriptRoot "functions"

$functions = Get-ChildItem -Path $FUNCTIONS_DIR -Directory | Where-Object {
    Test-Path (Join-Path $_.FullName "index.ts")
}

$total   = $functions.Count
$success = 0
$failed  = @()

Write-Host "Deploying $total Edge Functions to project $PROJECT_REF..." -ForegroundColor Cyan

foreach ($fn in $functions) {
    $name = $fn.Name
    Write-Host "  [$($success+1)/$total] Deploying $name ..." -NoNewline

    $result = supabase functions deploy $name --project-ref $PROJECT_REF 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host " OK" -ForegroundColor Green
        $success++
    } else {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Host "    $result" -ForegroundColor DarkRed
        $failed += $name
    }
}

Write-Host ""
Write-Host "Done: $success/$total deployed." -ForegroundColor Cyan
if ($failed.Count -gt 0) {
    Write-Host "Failed ($($failed.Count)):" -ForegroundColor Yellow
    $failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}
