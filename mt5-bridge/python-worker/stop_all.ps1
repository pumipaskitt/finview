# stop_all.ps1 — หยุด controller, worker ทั้งหมด และ terminal instances
# รันใน PowerShell (Admin) บน Windows VPS

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " MT5 Bridge — Stop All" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. หยุด controller.py
Write-Host "`n[1] Stopping controller..." -ForegroundColor Yellow
$controllers = Get-WmiObject Win32_Process | Where-Object {
    $_.CommandLine -like "*controller.py*"
}
if ($controllers) {
    $controllers | ForEach-Object {
        Write-Host "    Killing controller PID=$($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "    (no controller running)"
}

# 2. หยุด worker.py ทั้งหมด
Write-Host "`n[2] Stopping workers..." -ForegroundColor Yellow
$workers = Get-WmiObject Win32_Process | Where-Object {
    $_.CommandLine -like "*worker.py*"
}
if ($workers) {
    $workers | ForEach-Object {
        Write-Host "    Killing worker PID=$($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "    (no workers running)"
}

# 3. หยุด terminal64.exe ทั้งหมด
Write-Host "`n[3] Stopping MT5 terminals..." -ForegroundColor Yellow
$terminals = Get-Process -Name "terminal64" -ErrorAction SilentlyContinue
if ($terminals) {
    $terminals | ForEach-Object {
        Write-Host "    Killing terminal PID=$($_.Id)"
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "    (no terminals running)"
}

# 4. สรุปผล
Write-Host "`n[4] Verifying..." -ForegroundColor Yellow
$remaining = @(
    Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like "*controller.py*" }
    Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like "*worker.py*" }
    Get-Process -Name "terminal64" -ErrorAction SilentlyContinue
)
if ($remaining.Count -eq 0) {
    Write-Host "`n✅ All stopped successfully" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  Some processes still running:" -ForegroundColor Red
    $remaining | ForEach-Object { Write-Host "    PID=$($_.ProcessId ?? $_.Id) CMD=$($_.CommandLine ?? $_.Name)" }
}

Write-Host "`n========================================`n" -ForegroundColor Cyan
