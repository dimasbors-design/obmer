# Мастер очистки и оптимизации Windows 10/11
# Портативная утилита: одна папка, запуск через START.bat (сам попросит права администратора).
# Всё, что делается, пишется в журнал в папке Logs.

$ErrorActionPreference = 'Continue'
$AppVersion = '1.3'

# ---------- Права администратора ----------
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    try {
        Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
    } catch {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show('Без прав администратора мастер не сможет чистить системные папки. Запустите START.bat ещё раз и нажмите «Да».', 'Мастер очистки') | Out-Null
    }
    exit
}

# Прячем чёрное окно консоли, остаётся только окно мастера
try {
    Add-Type -Name Native -Namespace MOWin -MemberDefinition '[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow(); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);' -ErrorAction Stop
    [MOWin.Native]::ShowWindow([MOWin.Native]::GetConsoleWindow(), 0) | Out-Null
} catch {}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
[System.Windows.Forms.Application]::EnableVisualStyles()

# ---------- Папки и журнал ----------
$Root = Split-Path -Parent $PSCommandPath
$ToolsDir = Join-Path $Root 'Tools'
$LogDir = Join-Path $Root 'Logs'
try {
    New-Item -ItemType Directory -Force -Path $LogDir -ErrorAction Stop | Out-Null
    $probe = Join-Path $LogDir '.probe'
    [IO.File]::WriteAllText($probe, 'x'); Remove-Item -LiteralPath $probe -Force
} catch {
    $LogDir = Join-Path $env:TEMP 'MasterOchistki-Logs'
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}
New-Item -ItemType Directory -Force -Path $ToolsDir -ErrorAction SilentlyContinue | Out-Null
$Stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm'
$LogFile = Join-Path $LogDir "journal_$Stamp.txt"
$SysDrive = $env:SystemDrive
$script:Done = New-Object System.Collections.ArrayList
$script:Busy = $false
$script:Visited = @()

$C_Safe   = [Drawing.Color]::FromArgb(46, 125, 50)
$C_Decide = [Drawing.Color]::FromArgb(176, 112, 0)
$C_Danger = [Drawing.Color]::FromArgb(198, 40, 40)
$C_Muted  = [Drawing.Color]::FromArgb(90, 90, 90)
$C_Accent = [Drawing.Color]::FromArgb(25, 118, 210)

function Pump { [System.Windows.Forms.Application]::DoEvents() }

function Format-Size([double]$b) {
    if ($b -ge 1GB) { return ('{0:N1} ГБ' -f ($b / 1GB)) }
    if ($b -ge 1MB) { return ('{0:N0} МБ' -f ($b / 1MB)) }
    if ($b -gt 0)   { return ('{0:N0} КБ' -f ($b / 1KB)) }
    return 'пусто'
}

function Write-Log([string]$msg) {
    $line = (Get-Date -Format 'HH:mm:ss') + '  ' + $msg
    try { Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8 } catch {}
    if ($script:LogBox) {
        $script:LogBox.AppendText($line + "`r`n")
        Pump
    }
}

function Add-Done([string]$msg) { [void]$script:Done.Add($msg); Write-Log ('ГОТОВО: ' + $msg) }

function Set-Status([string]$t) { if ($script:StatusLabel) { $script:StatusLabel.Text = $t; Pump } }

function Set-Busy([bool]$on) {
    $script:Busy = $on
    if ($script:Form) { $script:Form.UseWaitCursor = $on }
    if ($script:BtnNext) { $script:BtnNext.Enabled = -not $on }
    if ($script:BtnBack) { $script:BtnBack.Enabled = (-not $on) -and ($script:Current -gt 0) }
    if ($script:Content) { $script:Content.Enabled = -not $on }
    if ($script:MechPic -and $script:MechAnim) {
        if ($on) { $script:MechPic.Image = $script:MechAnim; $script:MechCap.Text = 'РАБОТАЕМ…' }
        else { $script:MechPic.Image = $script:MechIdle; $script:MechCap.Text = 'ГОТОВО' }
    }
    if (-not $on) { Set-Status 'Готово. Можно продолжать.' }
    Pump
}

function Ask([string]$text, [string]$title = 'Мастер очистки') {
    return ([System.Windows.Forms.MessageBox]::Show($text, $title, 'YesNo', 'Question') -eq 'Yes')
}
function Say([string]$text) { [System.Windows.Forms.MessageBox]::Show($text, 'Мастер очистки') | Out-Null }

function Get-FreeBytes {
    try { return [double](Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$SysDrive'").FreeSpace } catch { return 0 }
}

# Долгие операции идут в отдельном процессе, окно при этом не зависает
function Invoke-Bg([scriptblock]$Script, $ArgList, [string]$Label) {
    if ($null -eq $ArgList) { $job = Start-Job -ScriptBlock $Script }
    else { $job = Start-Job -ScriptBlock $Script -ArgumentList $ArgList }
    $t0 = Get-Date
    while ($job.State -eq 'Running' -or $job.State -eq 'NotStarted') {
        Start-Sleep -Milliseconds 250
        $sec = [int]((Get-Date) - $t0).TotalSeconds
        Set-Status ("$Label  (идёт {0}:{1:D2})" -f [int][math]::Floor($sec / 60), ($sec % 60))
    }
    $out = Receive-Job -Job $job -ErrorAction SilentlyContinue
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    return $out
}

function Wait-Proc($proc, [string]$Label, [int]$TimeoutMin = 0, [string]$KillName = '') {
    $t0 = Get-Date
    $limit = $TimeoutMin * 60
    while (-not $proc.HasExited) {
        Start-Sleep -Milliseconds 300
        $sec = [int]((Get-Date) - $t0).TotalSeconds
        Set-Status ("$Label  (идёт {0}:{1:D2})" -f [int][math]::Floor($sec / 60), ($sec % 60))
        if ($limit -gt 0 -and $sec -ge $limit) {
            if (Ask ("«$Label» идёт уже " + [int]($sec / 60) + " мин. и, похоже, зависла. Остановить её и продолжить дальше? Это безопасно: уже очищенное останется очищенным.")) {
                try { $proc.Kill() } catch {}
                if ($KillName) { Get-Process -Name $KillName -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }
                Write-Log ("$Label — остановлено по таймауту")
                return $false
            }
            $limit += $TimeoutMin * 60
        }
    }
    return $true
}

$SizeSb = {
    param($paths)
    foreach ($p in $paths) {
        $s = 0
        if ($p -and (Test-Path -LiteralPath $p)) {
            $s = (Get-ChildItem -LiteralPath $p -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        }
        if (-not $s) { $s = 0 }
        [pscustomobject]@{ Path = $p; Size = [double]$s }
    }
}

$CleanPathsSb = {
    param($paths)
    foreach ($p in $paths) {
        if ($p -and (Test-Path -LiteralPath $p)) {
            Get-ChildItem -LiteralPath $p -Force -ErrorAction SilentlyContinue | ForEach-Object {
                Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }
    'OK'
}

# ---------- Сведения о компьютере ----------
function Get-SysInfo {
    $i = @{}
    try {
        $os = Get-CimInstance Win32_OperatingSystem
        $i.Os = $os.Caption + ' (сборка ' + $os.BuildNumber + ')'
        $i.RamGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
        $i.UptimeDays = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalDays, 1)
    } catch { $i.Os = 'Windows'; $i.RamGB = 0; $i.UptimeDays = 0 }
    try { $i.Cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name.Trim() } catch { $i.Cpu = '?' }
    try { $i.IsLaptop = [bool](Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue) } catch { $i.IsLaptop = $false }
    try {
        $ld = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$SysDrive'"
        $i.Free = [double]$ld.FreeSpace; $i.Total = [double]$ld.Size
    } catch { $i.Free = 0; $i.Total = 1 }
    $i.DiskType = 'неизвестно'; $i.DiskHealth = 'неизвестно'; $i.Wear = $null; $i.Temp = $null; $i.IsSsd = $false
    try {
        $disk = Get-Partition -DriveLetter $SysDrive.Substring(0, 1) -ErrorAction Stop | Get-Disk -ErrorAction Stop
        $pd = Get-PhysicalDisk -ErrorAction Stop | Where-Object { [string]$_.DeviceId -eq [string]$disk.Number } | Select-Object -First 1
        if ($pd) {
            $i.DiskName = $pd.FriendlyName
            $mt = [string]$pd.MediaType
            if ($mt -eq 'SSD' -or [string]$pd.BusType -eq 'NVMe') { $i.DiskType = 'SSD'; $i.IsSsd = $true }
            elseif ($mt -eq 'HDD') { $i.DiskType = 'HDD (жёсткий диск)' }
            else { $i.DiskType = $mt }
            $hs = [string]$pd.HealthStatus
            if ($hs -eq 'Healthy') { $i.DiskHealth = 'исправен' } elseif ($hs) { $i.DiskHealth = $hs }
            try {
                $rc = $pd | Get-StorageReliabilityCounter -ErrorAction Stop
                if ($rc.Wear -ne $null) { $i.Wear = [int]$rc.Wear }
                if ($rc.Temperature) { $i.Temp = [int]$rc.Temperature }
            } catch {}
        }
    } catch {}
    try { $h = Get-Item -LiteralPath "$SysDrive\hiberfil.sys" -Force -ErrorAction Stop; $i.Hiber = [double]$h.Length } catch { $i.Hiber = 0 }
    $i.WinOld = Test-Path -LiteralPath "$SysDrive\Windows.old"
    return $i
}

# ============================================================
#   ШАГ 2: Безопасная очистка
# ============================================================
function Get-RecycleBins {
    $r = @()
    try { Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { $r += ($_.DeviceID + '\$Recycle.Bin') } } catch { $r += "$SysDrive\`$Recycle.Bin" }
    return $r
}

function Get-BrowserCachePaths {
    $r = @()
    $bases = @(
        "$env:LOCALAPPDATA\Google\Chrome\User Data",
        "$env:LOCALAPPDATA\Microsoft\Edge\User Data",
        "$env:LOCALAPPDATA\Yandex\YandexBrowser\User Data",
        "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data",
        "$env:APPDATA\Opera Software\Opera Stable"
    )
    foreach ($base in $bases) {
        if (-not (Test-Path -LiteralPath $base)) { continue }
        $profiles = @(Get-ChildItem -LiteralPath $base -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' })
        if ($base -like '*Opera*') { $profiles = @(Get-Item -LiteralPath $base) }
        foreach ($pr in $profiles) {
            foreach ($c in @('Cache', 'Code Cache', 'GPUCache')) {
                $p = Join-Path $pr.FullName $c
                if (Test-Path -LiteralPath $p) { $r += $p }
            }
        }
    }
    $ff = "$env:LOCALAPPDATA\Mozilla\Firefox\Profiles"
    if (Test-Path -LiteralPath $ff) {
        Get-ChildItem -LiteralPath $ff -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            $p = Join-Path $_.FullName 'cache2'
            if (Test-Path -LiteralPath $p) { $r += $p }
        }
    }
    return $r
}

$CleanItems = @(
    @{ Id = 'restore';  Level = 'safe';   Default = $true;  Paths = @(); Name = 'Создать точку восстановления (чтобы можно было откатить всё назад)' },
    @{ Id = 'recycle';  Level = 'safe';   Default = $true;  Paths = (Get-RecycleBins); Name = 'Очистить Корзину на всех дисках' },
    @{ Id = 'usertemp'; Level = 'safe';   Default = $true;  Paths = @($env:TEMP); Name = 'Временные файлы программ (%TEMP%)' },
    @{ Id = 'wintemp';  Level = 'safe';   Default = $true;  Paths = @("$env:windir\Temp"); Name = 'Временные файлы Windows (Windows\Temp)' },
    @{ Id = 'wu';       Level = 'safe';   Default = $true;  Paths = @("$env:windir\SoftwareDistribution\Download"); Name = 'Скачанные файлы обновлений Windows (кэш Windows Update)' },
    @{ Id = 'do';       Level = 'safe';   Default = $true;  Paths = @("$env:windir\ServiceProfiles\NetworkService\AppData\Local\Microsoft\Windows\DeliveryOptimization\Cache"); Name = 'Кэш оптимизации доставки обновлений' },
    @{ Id = 'wer';      Level = 'safe';   Default = $true;  Paths = @("$env:ProgramData\Microsoft\Windows\WER\ReportArchive", "$env:ProgramData\Microsoft\Windows\WER\ReportQueue", "$env:LOCALAPPDATA\Microsoft\Windows\WER"); Name = 'Отчёты об ошибках Windows' },
    @{ Id = 'cleanmgr'; Level = 'safe';   Default = $true;  Paths = @(); Name = 'Очистка диска Windows с системными файлами (cleanmgr, папку Загрузки не трогает)' },
    @{ Id = 'dism';     Level = 'safe';   Default = $true;  Paths = @(); Name = 'Удалить старые версии системных компонентов (DISM, 5–30 минут)' },
    @{ Id = 'browser';  Level = 'decide'; Default = $false; Paths = (Get-BrowserCachePaths); Name = 'Кэш браузеров (пароли, вкладки, история и входы на сайты остаются)' },
    @{ Id = 'winold';   Level = 'decide'; Default = $false; Paths = @("$SysDrive\Windows.old"); Name = 'Папка Windows.old — старая Windows (после удаления откат на прошлую версию невозможен)' }
)

function Update-CleanSizes {
    $all = @()
    foreach ($it in $CleanItems) { $all += $it.Paths }
    $all = @($all | Where-Object { $_ })
    $res = Invoke-Bg $SizeSb (, $all) 'Считаю, сколько места занимает мусор'
    $map = @{}
    foreach ($r in $res) { if ($r -and $r.Path) { $map[$r.Path] = $r.Size } }
    $total = 0
    foreach ($it in $CleanItems) {
        $s = 0
        foreach ($p in $it.Paths) { if ($map.ContainsKey($p)) { $s += $map[$p] } }
        $it.Size = $s
        if ($it.SizeLabel) {
            if ($it.Paths.Count -gt 0) { $it.SizeLabel.Text = (Format-Size $s) } else { $it.SizeLabel.Text = '—' }
        }
        if ($it.Id -eq 'winold' -and $it.Row) { $it.Hidden = ($s -le 0); $it.Row.Visible = -not $it.Hidden }
        if ($it.Check -and $it.Check.Checked -and -not $it.Hidden) { $total += $s }
    }
    return $total
}

function Invoke-Cleanmgr([bool]$main, [bool]$winold) {
    $base = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VolumeCaches'
    # Никогда не трогаем: папку Загрузки, файлы для «Вернуть компьютер в исходное состояние»
    # «История файлов пользователя» не трогаем: удаляет резервные версии файлов и часто зависает на других дисках
    $never = @('DownloadsFolder', 'Windows ESD installation files', 'User file versions', 'BranchCache')
    $oldWin = @('Previous Installations', 'Windows Upgrade Log Files')
    $set = @()
    Get-ChildItem -LiteralPath $base -ErrorAction SilentlyContinue | ForEach-Object {
        $n = $_.PSChildName
        if ($never -contains $n) { return }
        if ($oldWin -contains $n) { if ($winold) { $set += $_.PSPath } ; return }
        if ($main) { $set += $_.PSPath }
    }
    if ($set.Count -eq 0) { return }
    foreach ($k in $set) { New-ItemProperty -LiteralPath $k -Name 'StateFlags4242' -PropertyType DWord -Value 2 -Force -ErrorAction SilentlyContinue | Out-Null }
    $p = Start-Process -FilePath "$env:windir\System32\cleanmgr.exe" -ArgumentList '/d', $SysDrive, '/sagerun:4242' -PassThru
    [void](Wait-Proc $p 'Очистка диска Windows' 15 'cleanmgr')
    foreach ($k in $set) { Remove-ItemProperty -LiteralPath $k -Name 'StateFlags4242' -ErrorAction SilentlyContinue }
}

function Invoke-SafeClean {
    $sel = @($CleanItems | Where-Object { $_.Check.Checked -and -not $_.Hidden })
    if ($sel.Count -eq 0) { Say 'Ничего не отмечено.'; return }
    $ids = $sel | ForEach-Object { $_.Id }
    if (($ids -contains 'browser') -and (Get-Process -Name chrome, msedge, firefox, browser, opera, brave -ErrorAction SilentlyContinue)) {
        if (-not (Ask 'Браузер сейчас открыт, его кэш очистится только частично. Лучше закрыть браузер и нажать «Да». Продолжить?')) { return }
    }
    if ($ids -contains 'winold') {
        if (-not (Ask 'Удалить Windows.old? После этого вернуться к предыдущей версии Windows будет нельзя. Если компьютер работает нормально уже неделю-две — удалять можно.')) { return }
    }
    Set-Busy $true
    $before = Get-FreeBytes
    Write-Log ("Свободно на $SysDrive до очистки: " + (Format-Size $before))
    try {
        if ($ids -contains 'restore') {
            Write-Log 'Создаю точку восстановления…'
            $rp = Invoke-Bg {
                try {
                    Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction SilentlyContinue
                    $k = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore'
                    New-ItemProperty -Path $k -Name 'SystemRestorePointCreationFrequency' -PropertyType DWord -Value 0 -Force | Out-Null
                    Checkpoint-Computer -Description 'Мастер очистки' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop
                    Remove-ItemProperty -Path $k -Name 'SystemRestorePointCreationFrequency' -ErrorAction SilentlyContinue
                    'OK'
                } catch { 'ERR ' + $_.Exception.Message }
            } $null 'Создаю точку восстановления'
            if ([string]$rp -like 'OK*') { Add-Done 'Создана точка восстановления «Мастер очистки» (откат: Win+R → rstrui)' }
            else {
                Write-Log ('Точка восстановления не создалась: ' + $rp)
                if (-not (Ask 'Точку восстановления создать не удалось (бывает, если защита системы выключена). Продолжить очистку без неё? Всё, что отмечено зелёным, безопасно.')) { return }
            }
        }
        foreach ($id in @('recycle', 'usertemp', 'wintemp', 'wer', 'browser')) {
            if ($ids -notcontains $id) { continue }
            $it = $CleanItems | Where-Object { $_.Id -eq $id }
            if ($id -eq 'recycle') {
                Invoke-Bg { Clear-RecycleBin -Force -ErrorAction SilentlyContinue; 'OK' } $null 'Очищаю Корзину' | Out-Null
            } else {
                Invoke-Bg $CleanPathsSb (, $it.Paths) ('Удаляю: ' + $it.Name) | Out-Null
            }
            Add-Done ($it.Name + ' — очищено (было ' + (Format-Size $it.Size) + ')')
        }
        if ($ids -contains 'wu') {
            $wuPath = "$env:windir\SoftwareDistribution\Download"
            Invoke-Bg {
                param($p)
                Stop-Service -Name wuauserv, bits -Force -ErrorAction SilentlyContinue
                Get-ChildItem -LiteralPath $p -Force -ErrorAction SilentlyContinue | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
                Start-Service -Name bits, wuauserv -ErrorAction SilentlyContinue
                'OK'
            } $wuPath 'Очищаю кэш Windows Update' | Out-Null
            Add-Done 'Кэш Windows Update очищен'
        }
        if ($ids -contains 'do') {
            $doPath = ($CleanItems | Where-Object { $_.Id -eq 'do' }).Paths
            Invoke-Bg {
                param($p)
                if (Get-Command Delete-DeliveryOptimizationCache -ErrorAction SilentlyContinue) { Delete-DeliveryOptimizationCache -Force -ErrorAction SilentlyContinue }
                foreach ($x in $p) { Get-ChildItem -LiteralPath $x -Force -ErrorAction SilentlyContinue | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue } }
                'OK'
            } (, $doPath) 'Очищаю кэш оптимизации доставки' | Out-Null
            Add-Done 'Кэш оптимизации доставки очищен'
        }
        if (($ids -contains 'cleanmgr') -or ($ids -contains 'winold')) {
            Write-Log 'Запускаю «Очистку диска» Windows с системными файлами…'
            Invoke-Cleanmgr ($ids -contains 'cleanmgr') ($ids -contains 'winold')
            if ($ids -contains 'cleanmgr') { Add-Done 'Очистка диска Windows (системные файлы, эскизы, журналы, дампы) выполнена' }
            if ($ids -contains 'winold') { Add-Done 'Windows.old удалена' }
        }
        if ($ids -contains 'dism') {
            Write-Log 'DISM: очистка хранилища компонентов. Это долго (5–30 минут), компьютер можно не трогать…'
            $p = Start-Process -FilePath "$env:windir\System32\dism.exe" -ArgumentList '/Online', '/Cleanup-Image', '/StartComponentCleanup' -WindowStyle Hidden -PassThru
            [void](Wait-Proc $p 'DISM чистит старые компоненты Windows')
            Add-Done ('DISM StartComponentCleanup завершён (код ' + $p.ExitCode + ')')
        }
    } finally {
        $after = Get-FreeBytes
        $freed = $after - $before
        if ($freed -lt 0) { $freed = 0 }
        $script:FreedClean = $freed
        Write-Log ("Свободно на $SysDrive после очистки: " + (Format-Size $after) + '  (освобождено ' + (Format-Size $freed) + ')')
        if ($script:CleanResult) { $script:CleanResult.Text = 'Было свободно: ' + (Format-Size $before) + '   →   стало: ' + (Format-Size $after) + '   (освобождено ' + (Format-Size $freed) + ')' }
        Update-CleanSizes | Out-Null
        Set-Busy $false
    }
}

# ============================================================
#   ШАГ 3: Крупные и старые файлы
# ============================================================
function Get-DownloadsPath {
    try {
        $v = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders' -ErrorAction Stop).'{374DE290-123F-4565-9164-39C4925E467B}'
        if ($v) { return [Environment]::ExpandEnvironmentVariables($v) }
    } catch {}
    return (Join-Path $env:USERPROFILE 'Downloads')
}

$BigSb = {
    param($root, $minBytes, $downloads)
    $cloudMask = 0x00400000 -bor 0x00040000 -bor 0x00001000   # файлы «только в облаке» (OneDrive) — пропускаем
    $out = @()
    $dirs = @(Get-ChildItem -LiteralPath $root -Force -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'AppData' -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) })
    $files = @(Get-ChildItem -LiteralPath $root -Force -File -ErrorAction SilentlyContinue)
    foreach ($d in $dirs) { $files += @(Get-ChildItem -LiteralPath $d.FullName -Recurse -Force -File -ErrorAction SilentlyContinue | Where-Object { $_.Length -ge $minBytes }) }
    foreach ($f in $files) {
        if ($f.Length -lt $minBytes) { continue }
        if ([int64]$f.Attributes -band $cloudMask) { continue }
        $out += [pscustomobject]@{ Path = $f.FullName; Size = [double]$f.Length; Date = $f.LastWriteTime; Kind = 'big' }
    }
    if ($downloads -and (Test-Path -LiteralPath $downloads)) {
        $limit = (Get-Date).AddDays(-30)
        Get-ChildItem -LiteralPath $downloads -Force -File -ErrorAction SilentlyContinue | Where-Object {
            $_.Extension -match '^\.(exe|msi|zip|rar|7z|iso|torrent)$' -and $_.LastWriteTime -lt $limit -and $_.Length -lt $minBytes
        } | ForEach-Object { $out += [pscustomobject]@{ Path = $_.FullName; Size = [double]$_.Length; Date = $_.LastWriteTime; Kind = 'old' } }
    }
    $out | Sort-Object Size -Descending
}

function Invoke-BigScan {
    Set-Busy $true
    try {
        $min = [double]$script:BigMin.Value * 1MB
        $dl = Get-DownloadsPath
        $res = Invoke-Bg $BigSb @($env:USERPROFILE, $min, $dl) 'Ищу крупные файлы в папке пользователя'
        $lv = $script:BigList
        $lv.BeginUpdate(); $lv.Items.Clear()
        $sum = 0
        foreach ($r in $res) {
            if (-not $r.Path) { continue }
            $kind = 'крупный файл'
            if ($r.Kind -eq 'old') { $kind = 'старый установщик/архив в Загрузках' }
            $hint = 'на ваше решение'
            $color = $C_Decide
            if ($r.Path -match '\\OneDrive') { $hint = 'OneDrive: удалится и из облака'; $color = $C_Danger }
            elseif ($r.Kind -eq 'old') { $hint = 'обычно можно удалить'; $color = $C_Safe }
            $item = New-Object System.Windows.Forms.ListViewItem((Split-Path $r.Path -Leaf))
            [void]$item.SubItems.Add((Format-Size $r.Size))
            [void]$item.SubItems.Add($r.Date.ToString('dd.MM.yyyy'))
            [void]$item.SubItems.Add($kind)
            [void]$item.SubItems.Add($hint)
            [void]$item.SubItems.Add($r.Path)
            $item.ForeColor = $color
            $item.Tag = $r
            [void]$lv.Items.Add($item)
            $sum += $r.Size
        }
        $lv.EndUpdate()
        $script:BigSummary.Text = 'Найдено: ' + $lv.Items.Count + ' файлов, всего ' + (Format-Size $sum) + '. Отметьте галочками то, что точно не нужно.'
        Write-Log ('Поиск крупных файлов: найдено ' + $lv.Items.Count + ' на ' + (Format-Size $sum))
    } finally { Set-Busy $false }
}

function Remove-BigChecked {
    $lv = $script:BigList
    $sel = @($lv.CheckedItems)
    if ($sel.Count -eq 0) { Say 'Отметьте галочками файлы, которые нужно удалить.'; return }
    $sum = 0; foreach ($i in $sel) { $sum += $i.Tag.Size }
    $perm = $script:BigPermanent.Checked
    $how = 'в Корзину (можно будет восстановить)'
    if ($perm) { $how = 'НАВСЕГДА, без Корзины' }
    if (-not (Ask ("Удалить " + $sel.Count + " файл(ов) на " + (Format-Size $sum) + " " + $how + "?"))) { return }
    Set-Busy $true
    try {
        foreach ($i in $sel) {
            $p = $i.Tag.Path
            try {
                if ($perm) { Remove-Item -LiteralPath $p -Force -ErrorAction Stop }
                else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin) }
                Write-Log ('Удалён файл: ' + $p + ' (' + (Format-Size $i.Tag.Size) + ')')
                $lv.Items.Remove($i)
            } catch { Write-Log ('Не удалось удалить: ' + $p + ' — ' + $_.Exception.Message) }
        }
        $where = 'в Корзину'
        if ($perm) { $where = 'безвозвратно' }
        Add-Done ('Удалены выбранные крупные/старые файлы ' + $where + ': ' + $sel.Count + ' шт., ' + (Format-Size $sum))
        if (-not $perm) { $script:NeedEmptyBin = $true }
    } finally { Set-Busy $false }
}

# ============================================================
#   ШАГ 4: Программы-помощники
# ============================================================
$Tools = @(
    @{ Key = 'wiztree'; Name = 'WizTree — что занимает место на диске'; Exe = @('WizTree64.exe', 'WizTree.exe');
       Installed = @("$env:ProgramFiles\WizTree\WizTree64.exe", "${env:ProgramFiles(x86)}\WizTree\WizTree.exe");
       Page = 'https://diskanalyzer.com/download';
       Tips = "1. Слева вверху выберите диск C: и нажмите «Scan» (Сканировать).`r`n2. Вкладка «Tree View» — самые большие папки, «File View» — самые большие файлы. Квадраты внизу: чем больше, тем больше места.`r`n3. Удаляйте только своё: фильмы, старые установщики, архивы, копии телефонов, игры, в которые не играете.`r`n4. НЕ трогайте: папки Windows, Program Files, ProgramData, файлы pagefile.sys, hiberfil.sys, swapfile.sys.`r`n5. Удобнее всего: правый клик → «Open in Explorer» и удалить в проводнике в Корзину." },
    @{ Key = 'bcu'; Name = 'Bulk Crap Uninstaller — удаление ненужных программ'; Exe = @('BCUninstaller.exe');
       Installed = @("$env:ProgramFiles\BCUninstaller\BCUninstaller.exe", "${env:ProgramFiles(x86)}\BCUninstaller\BCUninstaller.exe");
       Page = 'https://www.bcuninstaller.com/';
       Tips = "1. При первом запуске можно согласиться с настройками по умолчанию.`r`n2. Сортируйте по колонке «Size» (размер) или «Install date» (дата установки) — сверху окажутся большие и старые программы.`r`n3. Отметьте галочками то, чем не пользуетесь (старые игры, пробные антивирусы, тулбары, «ускорители»).`r`n4. Нажмите «Uninstall» → в мастере оставьте «Quiet uninstall» если доступно → потом согласитесь на поиск остатков (Leftovers) и удалите только отмеченные зелёным/«Very good».`r`n5. НЕ удаляйте: драйверы (Intel, AMD, NVIDIA, Realtek), Microsoft Visual C++ Redistributable, .NET, антивирус, программы производителя ноутбука, если не уверены." },
    @{ Key = 'rapr'; Name = 'DriverStore Explorer — старые копии драйверов'; Exe = @('Rapr.exe');
       Installed = @();
       Page = 'https://github.com/lostindark/DriverStoreExplorer/releases';
       Tips = "1. Дождитесь, пока загрузится список драйверов.`r`n2. Справа нажмите «Select Old Driver(s)» — отметятся только СТАРЫЕ версии, текущие останутся.`r`n3. Нажмите «Delete Driver(s)».`r`n4. Галочку «Force Deletion» НЕ ставьте — тогда используемые драйверы удалить невозможно.`r`n5. Обычно освобождает 1–10 ГБ на компьютерах, которые давно обновлялись." }
)

function Find-ToolExe($t) {
    foreach ($e in $t.Exe) {
        $f = Get-ChildItem -LiteralPath $ToolsDir -Recurse -File -Filter $e -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($f) { return $f.FullName }
    }
    foreach ($p in $t.Installed) { if ($p -and (Test-Path -LiteralPath $p)) { return $p } }
    return $null
}

$DlSb = {
    param($key, $dest)
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = 'SilentlyContinue'
    $hdr = @{ 'User-Agent' = 'MasterOchistki' }
    try {
        $url = $null
        if ($key -eq 'wiztree') {
            $h = (Invoke-WebRequest -Uri 'https://diskanalyzer.com/download' -UseBasicParsing -Headers $hdr).Content
            $m = [regex]::Match($h, 'files/wiztree_[0-9_]+_portable\.zip')
            if ($m.Success) { $url = 'https://diskanalyzer.com/' + $m.Value }
        } elseif ($key -eq 'bcu') {
            $r = Invoke-RestMethod -Uri 'https://api.github.com/repos/Klocman/Bulk-Crap-Uninstaller/releases/latest' -UseBasicParsing -Headers $hdr
            $a = $r.assets | Where-Object { $_.name -match 'portable' -and $_.name -match '\.zip$' } | Select-Object -First 1
            if ($a) { $url = $a.browser_download_url }
        } elseif ($key -eq 'rapr') {
            $r = Invoke-RestMethod -Uri 'https://api.github.com/repos/lostindark/DriverStoreExplorer/releases/latest' -UseBasicParsing -Headers $hdr
            $a = $r.assets | Where-Object { $_.name -match '\.zip$' } | Select-Object -First 1
            if ($a) { $url = $a.browser_download_url }
        }
        if (-not $url) { return 'NOURL' }
        $zip = Join-Path $env:TEMP ($key + '-download.zip')
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -Headers $hdr
        New-Item -ItemType Directory -Force -Path $dest | Out-Null
        Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force
        Get-ChildItem -LiteralPath $dest -Recurse -File | Unblock-File -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
        return ('OK ' + $url)
    } catch { return ('ERR ' + $_.Exception.Message) }
}

function Update-ToolCard($t) {
    $exe = Find-ToolExe $t
    $t.ExePath = $exe
    if ($exe) {
        $t.StateLabel.Text = 'Найдена: ' + $exe
        $t.StateLabel.ForeColor = $C_Safe
        $t.RunBtn.Text = 'Запустить'
    } else {
        $t.StateLabel.Text = 'Не найдена в папке Tools. Нажмите «Скачать» — мастер скачает портативную версию с официального сайта.'
        $t.StateLabel.ForeColor = $C_Decide
        $t.RunBtn.Text = 'Скачать'
    }
}

function Invoke-Tool($t) {
    if ($t.ExePath -and (Test-Path -LiteralPath $t.ExePath)) {
        Write-Log ('Запуск: ' + $t.Name)
        try { Start-Process -FilePath $t.ExePath -WorkingDirectory (Split-Path $t.ExePath) } catch { Say ('Не удалось запустить: ' + $_.Exception.Message) }
        [void]$script:Done.Add('Запускалась программа: ' + $t.Name)
        return
    }
    if (-not (Ask ("Скачать " + $t.Name + " с официального сайта в папку Tools?`r`n`r`nЕсли интернет не работает или скачивание не получится, откроется страница сайта — скачайте portable-версию и распакуйте её в папку:`r`n" + (Join-Path $ToolsDir $t.Key)))) { return }
    Set-Busy $true
    try {
        $res = [string](Invoke-Bg $DlSb @($t.Key, (Join-Path $ToolsDir $t.Key)) ('Скачиваю ' + $t.Name))
        Write-Log ('Скачивание ' + $t.Key + ': ' + $res)
        if ($res -notlike 'OK*') {
            Say ('Автоматически скачать не получилось. Сейчас откроется официальная страница — скачайте portable (zip) и распакуйте в папку ' + (Join-Path $ToolsDir $t.Key) + ', потом нажмите «Проверить снова».')
            Start-Process $t.Page
        }
    } finally {
        Set-Busy $false
        Update-ToolCard $t
    }
}

# ============================================================
#   ШАГ 5: Автозагрузка и скорость
# ============================================================
$KeepRx = 'SecurityHealth|Windows ?Defender|MsMpEng|Realtek|RtkAud|RAVCpl|RAVBg|Synaptics|SynTP|ETDCtrl|Elan|igfx|Intel.*(Graphics|Audio|Wireless|Bluetooth)|NVIDIA|nvcpl|Radeon|AMD.*(Software|Radeon|Noise)|Dolby|Waves|MaxxAudio|Conexant|IDT|SmartAudio|Bluetooth|Touchpad|Kaspersky|ESET|egui|Avast|AVG|Avira|Bitdefender|Norton|McAfee|Malwarebytes|Dr\.?Web|360 ?Total|Defender'
$OkRx = 'Steam|Discord|Spotify|Epic ?Games|EpicGamesLauncher|uTorrent|BitTorrent|qBittorrent|Skype|Zoom|Origin|EADesktop|EA Desktop|Battle\.net|Ubisoft|Uplay|GOG ?Galaxy|YandexBrowser|Yandex\.Browser|Opera.*(Assistant|Launcher)|Browser ?Assistant|GoogleUpdate|Google ?Update|Adobe ?(ARM|Updater|Creative Cloud|GC)|AdobeAAM|CCleaner|iTunesHelper|Teams|Viber|WhatsApp|Cortana|MicrosoftEdgeAutoLaunch|Edge.*AutoLaunch|Mail\.ru|Amigo|Razer|Wallpaper ?Engine|Overwolf|MEGAsync|Lightshot|Punto'

function Get-ExePath([string]$cmd) {
    if (-not $cmd) { return '' }
    $c = [Environment]::ExpandEnvironmentVariables($cmd.Trim())
    if ($c.StartsWith('"')) {
        $e = $c.IndexOf('"', 1)
        if ($e -gt 1) { return $c.Substring(1, $e - 1) }
    }
    $m = [regex]::Match($c, '^(.+?\.(exe|cmd|bat|com|vbs|lnk))(\s|$)', 'IgnoreCase')
    if ($m.Success) { return $m.Groups[1].Value }
    return ($c -split ' ')[0]
}

function Test-Broken([string]$exe) {
    if (-not $exe) { return $false }
    if ([IO.Path]::IsPathRooted($exe)) { return -not (Test-Path -LiteralPath $exe) }
    return $false   # короткие имена (rundll32 и т. п.) не считаем битыми
}

function Get-StartupEntries {
    $list = @()
    $ap = 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved'
    $srcs = @(
        @{ Run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; Appr = "HKCU:\$ap\Run"; Loc = 'реестр (ваш)' },
        @{ Run = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run'; Appr = "HKLM:\$ap\Run"; Loc = 'реестр (все)' },
        @{ Run = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'; Appr = "HKLM:\$ap\Run32"; Loc = 'реестр (32-бит)' }
    )
    foreach ($s in $srcs) {
        if (-not (Test-Path -LiteralPath $s.Run)) { continue }
        $key = Get-Item -LiteralPath $s.Run
        foreach ($vn in $key.GetValueNames()) {
            if (-not $vn) { continue }
            $cmd = [string]$key.GetValue($vn)
            $exe = Get-ExePath $cmd
            $list += [pscustomobject]@{ Name = $vn; Cmd = $cmd; Exe = $exe; Loc = $s.Loc; Appr = $s.Appr; Kind = 'reg'; Src = $s.Run; Enabled = (Get-ApprovedState $s.Appr $vn); Broken = (Test-Broken $exe) }
        }
    }
    $shell = New-Object -ComObject WScript.Shell
    $folders = @(
        @{ Dir = [Environment]::GetFolderPath('Startup'); Appr = "HKCU:\$ap\StartupFolder"; Loc = 'папка автозагрузки (ваша)' },
        @{ Dir = [Environment]::GetFolderPath('CommonStartup'); Appr = "HKLM:\$ap\StartupFolder"; Loc = 'папка автозагрузки (все)' }
    )
    foreach ($f in $folders) {
        if (-not $f.Dir -or -not (Test-Path -LiteralPath $f.Dir)) { continue }
        Get-ChildItem -LiteralPath $f.Dir -File -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object {
            $target = $_.FullName
            if ($_.Extension -eq '.lnk') { try { $target = $shell.CreateShortcut($_.FullName).TargetPath } catch {} }
            $broken = $false
            if ($target) { $broken = Test-Broken $target }
            $list += [pscustomobject]@{ Name = $_.Name; Cmd = $target; Exe = $target; Loc = $f.Loc; Appr = $f.Appr; Kind = 'file'; Src = $_.FullName; Enabled = (Get-ApprovedState $f.Appr $_.Name); Broken = $broken }
        }
    }
    return $list
}

function Get-ApprovedState($appr, $name) {
    try {
        $v = (Get-ItemProperty -LiteralPath $appr -Name $name -ErrorAction Stop).$name
        if ($v -is [byte[]] -and $v.Length -gt 0) { return -not ($v[0] -band 1) }
    } catch {}
    return $true
}

function Set-StartupEnabled($e, [bool]$on) {
    if (-not (Test-Path -LiteralPath $e.Appr)) { New-Item -Path $e.Appr -Force | Out-Null }
    $b = New-Object byte[] 12
    if ($on) { $b[0] = 2 } else {
        $b[0] = 3
        $ft = [BitConverter]::GetBytes((Get-Date).ToFileTime())
        [Array]::Copy($ft, 0, $b, 4, 8)
    }
    New-ItemProperty -LiteralPath $e.Appr -Name $e.Name -PropertyType Binary -Value $b -Force | Out-Null
}

function Get-Advice($e) {
    $s = $e.Name + ' ' + $e.Cmd
    if ($e.Broken) { return @('битая запись (программы уже нет)', $C_Safe, 'broken') }
    if ($s -match $KeepRx) { return @('не трогать (драйвер/защита)', $C_Danger, 'keep') }
    if ($s -match $OkRx) { return @('можно отключить', $C_Safe, 'ok') }
    if ($s -match 'OneDrive') { return @('на решение (синхронизация файлов)', $C_Decide, 'decide') }
    return @('на ваше решение', $C_Decide, 'decide')
}

function Fill-Startup {
    $lv = $script:StartList
    $lv.BeginUpdate(); $lv.Items.Clear()
    $en = 0
    foreach ($e in (Get-StartupEntries)) {
        $adv = Get-Advice $e
        $state = 'включено'
        if (-not $e.Enabled) { $state = 'отключено' } else { $en++ }
        $item = New-Object System.Windows.Forms.ListViewItem($e.Name)
        [void]$item.SubItems.Add($state)
        [void]$item.SubItems.Add($adv[0])
        [void]$item.SubItems.Add($e.Loc)
        [void]$item.SubItems.Add($e.Cmd)
        $item.ForeColor = $adv[1]
        if (-not $e.Enabled) { $item.ForeColor = [Drawing.Color]::Gray }
        $e | Add-Member -NotePropertyName Advice -NotePropertyValue $adv[2] -Force
        $item.Tag = $e
        [void]$lv.Items.Add($item)
    }
    $lv.EndUpdate()
    $script:StartupEnabledCount = $en
    $script:StartSummary.Text = 'В автозагрузке включено программ: ' + $en + '. Чем их меньше, тем быстрее включается компьютер. Отметьте галочками ненужное.'
}

function Invoke-StartupAction([string]$what) {
    $sel = @($script:StartList.CheckedItems)
    if ($sel.Count -eq 0) { Say 'Сначала отметьте строки галочками.'; return }
    if ($what -eq 'off') {
        $keep = @($sel | Where-Object { $_.Tag.Advice -eq 'keep' })
        if ($keep.Count -gt 0 -and -not (Ask ('Среди отмеченных есть то, что помечено «не трогать» (' + (($keep | ForEach-Object { $_.Tag.Name }) -join ', ') + '). Всё равно отключить?'))) { return }
    }
    foreach ($i in $sel) {
        $e = $i.Tag
        try {
            if ($what -eq 'off') { Set-StartupEnabled $e $false; Write-Log ('Автозагрузка: отключено «' + $e.Name + '»') }
            elseif ($what -eq 'on') { Set-StartupEnabled $e $true; Write-Log ('Автозагрузка: включено обратно «' + $e.Name + '»') }
        } catch { Write-Log ('Ошибка с «' + $e.Name + '»: ' + $_.Exception.Message) }
    }
    if ($what -eq 'off') { Add-Done ('Отключено в автозагрузке: ' + (($sel | ForEach-Object { $_.Tag.Name }) -join ', ') + ' (вернуть можно здесь же или в Диспетчере задач)') }
    else { Add-Done ('Включено обратно в автозагрузке: ' + (($sel | ForEach-Object { $_.Tag.Name }) -join ', ')) }
    Fill-Startup
}

function Remove-BrokenStartup {
    $broken = @($script:StartList.Items | Where-Object { $_.Tag.Broken })
    if ($broken.Count -eq 0) { Say 'Битых записей в автозагрузке нет — чистить в реестре нечего.'; return }
    if (-not (Ask ('Найдено битых записей (программа уже удалена, а запись осталась): ' + $broken.Count + '. Удалить их? Перед удалением будет сделана резервная копия в папку Logs.'))) { return }
    $bk = Join-Path $LogDir ('backup_autostart_' + $Stamp)
    New-Item -ItemType Directory -Force -Path $bk | Out-Null
    $exported = @{}
    foreach ($i in $broken) {
        $e = $i.Tag
        try {
            if ($e.Kind -eq 'reg') {
                if (-not $exported.ContainsKey($e.Src)) {
                    $regPath = $e.Src -replace '^HKCU:\\', 'HKCU\' -replace '^HKLM:\\', 'HKLM\'
                    $file = Join-Path $bk (('{0}.reg' -f $exported.Count))
                    & reg.exe export $regPath $file /y | Out-Null
                    $exported[$e.Src] = $file
                }
                Remove-ItemProperty -LiteralPath $e.Src -Name $e.Name -ErrorAction Stop
                Remove-ItemProperty -LiteralPath $e.Appr -Name $e.Name -ErrorAction SilentlyContinue
            } else {
                Move-Item -LiteralPath $e.Src -Destination $bk -Force -ErrorAction Stop
            }
            Write-Log ('Удалена битая запись автозагрузки: ' + $e.Name + ' → ' + $e.Cmd)
        } catch { Write-Log ('Не удалось удалить запись ' + $e.Name + ': ' + $_.Exception.Message) }
    }
    Add-Done ('Удалены битые записи автозагрузки: ' + $broken.Count + ' (копия: ' + $bk + ')')
    Fill-Startup
}

function Invoke-Optimize {
    $s = $script:Opt
    $any = $s.Power.Checked -or $s.Fx.Checked -or $s.Hiber.Checked -or $s.Trim.Checked -or $s.Sfc.Checked
    if (-not $any) { Say 'Ничего не отмечено.'; return }
    if ($s.Hiber.Checked -and $script:Sys.IsLaptop) {
        if (-not (Ask 'Это ноутбук. Без гибернации пропадут «Гибернация» и «Быстрый запуск», а при севшей батарее несохранённое может пропасть. Всё равно отключить?')) { return }
    }
    Set-Busy $true
    try {
        if ($s.Power.Checked) {
            $guid = '381b4222-f694-41f0-9685-ff5bb260df2e'; $nm = 'Сбалансированная'
            if ($s.PowerCombo.SelectedIndex -eq 1) { $guid = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'; $nm = 'Высокая производительность' }
            & powercfg.exe /setactive $guid 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0 -and $guid -like '8c5e*') {
                & powercfg.exe -duplicatescheme $guid 2>&1 | Out-Null
                & powercfg.exe /setactive $guid 2>&1 | Out-Null
            }
            if ($LASTEXITCODE -eq 0) { Add-Done ('План электропитания: ' + $nm) } else { Write-Log ('Не удалось включить план «' + $nm + '» (на некоторых ноутбуках его нет — используйте «Режим питания» в Параметрах)') }
        }
        if ($s.Fx.Checked) {
            Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' -Name 'EnableTransparency' -Value 0 -Type DWord -ErrorAction SilentlyContinue
            Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop\WindowMetrics' -Name 'MinAnimate' -Value '0' -ErrorAction SilentlyContinue
            Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' -Name 'TaskbarAnimations' -Value 0 -Type DWord -ErrorAction SilentlyContinue
            Add-Done 'Отключены прозрачность и анимации окон (заработает после перезахода в Windows)'
        }
        if ($s.Hiber.Checked) {
            & powercfg.exe /h off 2>&1 | Out-Null
            Add-Done ('Гибернация отключена, освобождено около ' + (Format-Size $script:Sys.Hiber) + ' (включить: powercfg /h on)')
        }
        if ($s.Trim.Checked) {
            $letter = $SysDrive.Substring(0, 1)
            if ($script:Sys.IsSsd) {
                Invoke-Bg { param($l) Optimize-Volume -DriveLetter $l -ReTrim -ErrorAction SilentlyContinue; 'OK' } $letter 'Оптимизация SSD (TRIM)' | Out-Null
                Add-Done 'Диск SSD оптимизирован (TRIM)'
            } else {
                Invoke-Bg { param($l) Optimize-Volume -DriveLetter $l -Defrag -ErrorAction SilentlyContinue; 'OK' } $letter 'Дефрагментация жёсткого диска (может быть долго)' | Out-Null
                Add-Done 'Жёсткий диск дефрагментирован'
            }
        }
        if ($s.Sfc.Checked) {
            Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'echo Проверка системных файлов, 10-20 минут. Окно можно закрыть, когда появится итог. & sfc /scannow'
            Add-Done 'Запущена проверка системных файлов sfc /scannow (в отдельном окне)'
        }
    } finally { Set-Busy $false }
}

# ============================================================
#   ШАГ 6: Шпаргалка команд
# ============================================================
$Cheats = @(
    @{ T = 'Chrome: данные отдельных сайтов'; C = 'chrome://settings/content/all'; K = 'copy'; D = 'Откройте Chrome, вставьте в адресную строку и нажмите Enter. Сверху справа сортировка «по объёму данных» — удалите корзинкой данные сайтов, которыми не пользуетесь.' },
    @{ T = 'Chrome: очистить кэш'; C = 'chrome://settings/clearBrowserData'; K = 'copy'; D = 'Вставьте в адресную строку Chrome. Период «Всё время», оставьте только галочку «Изображения и другие файлы, сохранённые в кэше». Пароли и входы на сайты не трогаются.' },
    @{ T = 'Chrome: лишние расширения'; C = 'chrome://extensions'; K = 'copy'; D = 'Каждое расширение отнимает память. Выключите или удалите то, чем не пользуетесь.' },
    @{ T = 'Edge: данные сайтов'; C = 'edge://settings/siteData'; K = 'copy'; D = 'Вставьте в адресную строку Microsoft Edge и нажмите Enter. Удалите данные ненужных сайтов.' },
    @{ T = 'Edge: очистить кэш'; C = 'edge://settings/clearBrowserData'; K = 'copy'; D = 'Как в Chrome: оставьте только «Кэшированные изображения и файлы».' },
    @{ T = 'Firefox: данные сайтов и кэш'; C = 'about:preferences#privacy'; K = 'copy'; D = 'Вставьте в адресную строку Firefox → раздел «Куки и данные сайтов» → «Управление данными…».' },
    @{ T = 'Контроль памяти Windows'; C = 'ms-settings:storagesense'; K = 'run'; D = 'Включите «Контроль памяти» — Windows сама будет чистить временные файлы и Корзину раз в месяц.' },
    @{ T = 'Приложения: список и удаление'; C = 'ms-settings:appsfeatures'; K = 'run'; D = 'Стандартный список программ Windows. Можно сортировать по размеру.' },
    @{ T = 'Автозагрузка в Параметрах'; C = 'ms-settings:startupapps'; K = 'run'; D = 'Включение/отключение программ при запуске (то же, что в шаге 5).' },
    @{ T = 'Центр обновления Windows'; C = 'ms-settings:windowsupdate'; K = 'run'; D = 'Установите обновления и в «Дополнительные параметры → Необязательные обновления» — обновления драйверов.' },
    @{ T = 'Режим питания (Windows 11 и ноутбуки)'; C = 'ms-settings:powersleep'; K = 'run'; D = 'Здесь выбирается «Режим питания»: «Максимальная производительность» быстрее, «Сбалансированный» дольше держит батарею.' },
    @{ T = 'Очистка диска Windows'; C = 'cleanmgr'; K = 'run'; D = 'Выберите диск C:, затем «Очистить системные файлы». Галочку «Загрузки» не ставьте, если там есть нужное.' },
    @{ T = 'Диспетчер задач'; C = 'taskmgr'; K = 'run'; D = 'Вкладка «Автозагрузка» — что запускается с Windows; «Процессы» — что грузит компьютер прямо сейчас (сортируйте по ЦП и Памяти).' },
    @{ T = 'Визуальные эффекты'; C = 'SystemPropertiesPerformance'; K = 'run'; D = 'Выберите «Обеспечить наилучшее быстродействие», потом верните галочки «Сглаживание неровностей экранных шрифтов» и «Вывод эскизов вместо значков».' },
    @{ T = 'Монитор ресурсов'; C = 'resmon'; K = 'run'; D = 'Показывает, кто нагружает диск и сеть. Полезно, если компьютер «шуршит» и тормозит.' },
    @{ T = 'Откат системы (если что-то пошло не так)'; C = 'rstrui'; K = 'run'; D = 'Восстановление системы: выберите точку «Мастер очистки» и откатитесь к состоянию до очистки. Личные файлы не трогаются.' },
    @{ T = 'Отключить гибернацию'; C = 'powercfg /h off'; K = 'cmd'; D = 'Удаляет файл hiberfil.sys (размером с половину ОЗУ). Для обычного ПК. На ноутбуке — на ваше решение. Включить обратно: powercfg /h on.' },
    @{ T = 'Отчёт о батарее ноутбука'; C = 'powercfg /batteryreport'; K = 'battery'; D = 'Создаёт отчёт: заводская ёмкость батареи и текущая. Если текущая меньше 60% — батарею пора менять.' },
    @{ T = 'Проверка системных файлов'; C = 'sfc /scannow'; K = 'cmd'; D = 'Находит и чинит повреждённые файлы Windows. 10–20 минут.' },
    @{ T = 'Восстановление образа Windows'; C = 'DISM /Online /Cleanup-Image /RestoreHealth'; K = 'cmd'; D = 'Если sfc написал, что не смог всё исправить, — выполните это, потом снова sfc /scannow. Нужен интернет.' },
    @{ T = 'Проверка диска без перезагрузки'; C = 'chkdsk C: /scan'; K = 'cmd'; D = 'Проверяет файловую систему на ошибки, ничего не удаляет.' }
)

function Invoke-Cheat($c) {
    try {
        switch ($c.K) {
            'run' { Start-Process $c.C; Write-Log ('Открыто: ' + $c.C) }
            'cmd' { Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $c.C; Write-Log ('Выполнено в окне: ' + $c.C) }
            'battery' {
                $out = Join-Path $LogDir 'battery-report.html'
                & powercfg.exe /batteryreport /output $out 2>&1 | Out-Null
                if (Test-Path -LiteralPath $out) { Start-Process $out; Write-Log ('Отчёт о батарее: ' + $out) } else { Say 'Отчёт не создан — похоже, у этого компьютера нет батареи.' }
            }
        }
    } catch { Say ('Не получилось: ' + $_.Exception.Message) }
}

# ============================================================
#   ШАГ 7: Итог и рекомендации
# ============================================================
function Build-Report {
    $s = Get-SysInfo
    $now = Get-FreeBytes
    $L = New-Object System.Collections.ArrayList
    [void]$L.Add('ОТЧЁТ МАСТЕРА ОЧИСТКИ  ' + (Get-Date -Format 'dd.MM.yyyy HH:mm') + '   (' + $env:COMPUTERNAME + ')')
    [void]$L.Add('')
    [void]$L.Add('Свободно на диске ' + $SysDrive + ': было ' + (Format-Size $script:FreeAtStart) + ', стало ' + (Format-Size $now) + '  (разница ' + (Format-Size ([math]::Max(0, $now - $script:FreeAtStart))) + ')')
    [void]$L.Add('')
    [void]$L.Add('ЧТО СДЕЛАНО:')
    if ($script:Done.Count -eq 0) { [void]$L.Add('  — пока ничего') } else { foreach ($d in $script:Done) { [void]$L.Add('  • ' + $d) } }
    [void]$L.Add('')
    [void]$L.Add('РЕКОМЕНДАЦИИ:')
    $rec = @()
    $pct = 0; if ($s.Total -gt 0) { $pct = [math]::Round(100 * $s.Free / $s.Total) }
    if ($pct -lt 15) { $rec += "Свободно всего $pct% диска $SysDrive. Для нормальной работы нужно хотя бы 15–20%: перенесите фото/видео на другой диск или в облако, посмотрите WizTree (шаг 4)." }
    if (-not $s.IsSsd -and $s.DiskType -like 'HDD*') { $rec += 'Система стоит на жёстком диске (HDD). Замена на SSD — самое заметное ускорение: включение и запуск программ в 3–5 раз быстрее.' }
    if ($s.RamGB -gt 0 -and $s.RamGB -lt 7.5) { $rec += ('Оперативной памяти ' + $s.RamGB + ' ГБ. Для Windows 10/11 и браузера комфортно от 8 ГБ, лучше 16 ГБ.') }
    if ($s.Wear -ne $null -and $s.Wear -ge 80) { $rec += ('Износ SSD ' + $s.Wear + '% — сделайте копию важных файлов и планируйте замену диска.') }
    if ($s.DiskHealth -ne 'исправен' -and $s.DiskHealth -ne 'неизвестно') { $rec += ('Состояние диска: ' + $s.DiskHealth + '. Срочно сделайте копию важных файлов.') }
    if ($s.UptimeDays -ge 7) { $rec += ('Компьютер не перезагружался ' + $s.UptimeDays + ' дн. Перезагрузите его — «Завершение работы» в Windows 10/11 не очищает память полностью.') }
    if ($script:StartupEnabledCount -gt 10) { $rec += ('В автозагрузке ' + $script:StartupEnabledCount + ' программ. Оставьте только нужное (шаг 5).') }
    if ($s.WinOld) { $rec += 'Есть папка Windows.old (старая Windows). Если всё работает нормально — удалите её в шаге 2.' }
    if (-not $s.IsLaptop -and $s.Hiber -gt 1GB) { $rec += ('Файл гибернации занимает ' + (Format-Size $s.Hiber) + '. На настольном ПК его можно отключить (шаг 5).') }
    if ($script:NeedEmptyBin) { $rec += 'Удалённые крупные файлы лежат в Корзине. Когда убедитесь, что они не нужны, — очистите Корзину (кнопка ниже).' }
    try {
        $sp = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\StorageSense\Parameters\StoragePolicy' -ErrorAction Stop).'01'
        if ($sp -ne 1) { $rec += 'Включите «Контроль памяти» (шаг 6, ms-settings:storagesense) — Windows будет сама чистить временные файлы.' }
    } catch { $rec += 'Включите «Контроль памяти» (шаг 6, ms-settings:storagesense) — Windows будет сама чистить временные файлы.' }
    if ($s.IsLaptop) { $rec += 'Это ноутбук: проверьте износ батареи (шаг 6 → «Отчёт о батарее») и почистите от пыли вентилятор, если он шумит и корпус горячий.' }
    $rec += 'Установите обновления Windows и драйверов (шаг 6 → Центр обновления).'
    $rec += 'Повторяйте мастер раз в 2–3 месяца.'
    $n = 1; foreach ($r in $rec) { [void]$L.Add('  ' + $n + '. ' + $r); $n++ }
    [void]$L.Add('')
    [void]$L.Add('Журнал всех действий: ' + $LogFile)
    [void]$L.Add('Откатить изменения системы: Win+R → rstrui → точка «Мастер очистки».')
    return ($L -join "`r`n")
}

# ============================================================
#   ИНТЕРФЕЙС
# ============================================================
$FontMain = New-Object Drawing.Font('Segoe UI', 10)
$FontBold = New-Object Drawing.Font('Segoe UI', 10, [Drawing.FontStyle]::Bold)
$FontHead = New-Object Drawing.Font('Segoe UI', 14, [Drawing.FontStyle]::Bold)
$FontMono = New-Object Drawing.Font('Consolas', 10)

function New-Label([string]$text, [int]$x, [int]$y, [int]$w, [int]$h, $font = $null, $color = $null) {
    $l = New-Object Windows.Forms.Label
    $l.Text = $text
    $l.Location = New-Object Drawing.Point($x, $y)
    $l.Size = New-Object Drawing.Size($w, $h)
    if ($font) { $l.Font = $font } else { $l.Font = $FontMain }
    if ($color) { $l.ForeColor = $color }
    return $l
}
function New-Btn([string]$text, [int]$x, [int]$y, [int]$w, [int]$h = 34) {
    $b = New-Object Windows.Forms.Button
    $b.Text = $text
    $b.Location = New-Object Drawing.Point($x, $y)
    $b.Size = New-Object Drawing.Size($w, $h)
    $b.Font = $FontBold
    $b.FlatStyle = 'Flat'
    $b.FlatAppearance.BorderSize = 2
    $b.FlatAppearance.BorderColor = [Drawing.Color]::FromArgb(21, 23, 26)
    $b.BackColor = [Drawing.Color]::FromArgb(170, 176, 184)
    $b.ForeColor = [Drawing.Color]::FromArgb(27, 29, 32)
    $b.Cursor = [System.Windows.Forms.Cursors]::Hand
    return $b
}
function Set-Primary($b) {
    $b.BackColor = [Drawing.Color]::FromArgb(245, 154, 31)
    $b.ForeColor = [Drawing.Color]::FromArgb(27, 29, 32)
    $b.FlatAppearance.MouseOverBackColor = [Drawing.Color]::FromArgb(255, 180, 58)
}
function New-Lv([int]$x, [int]$y, [int]$w, [int]$h) {
    $lv = New-Object Windows.Forms.ListView
    $lv.View = 'Details'; $lv.CheckBoxes = $true; $lv.FullRowSelect = $true; $lv.GridLines = $true
    $lv.Location = New-Object Drawing.Point($x, $y); $lv.Size = New-Object Drawing.Size($w, $h)
    $lv.Font = $FontMain
    $lv.Anchor = 'Top, Left, Right'
    return $lv
}
function Level-Text($lvl) {
    if ($lvl -eq 'safe') { return @('безопасно', $C_Safe) }
    if ($lvl -eq 'decide') { return @('на ваше решение', $C_Decide) }
    return @('не трогать', $C_Danger)
}

# ---------- Страницы ----------
function Build-Welcome($p) {
    $y = 10
    $p.Controls.Add((New-Label 'Мастер по шагам почистит и ускорит этот компьютер' 10 $y 780 30 $FontHead))
    $y += 40
    $p.Controls.Add((New-Label 'Сначала мастер смотрит, потом показывает, что нашёл, а удаляет только то, что вы отметили. Перед очисткой создаётся точка восстановления, а каждое действие записывается в журнал.' 10 $y 780 44))
    $y += 50
    $tb = New-Object Windows.Forms.TextBox
    $tb.Multiline = $true; $tb.ReadOnly = $true; $tb.Font = $FontMono; $tb.ScrollBars = 'Vertical'
    $tb.Location = New-Object Drawing.Point(10, $y); $tb.Size = New-Object Drawing.Size(780, 170); $tb.Anchor = 'Top, Left, Right'
    $tb.Text = 'Собираю сведения о компьютере…'
    $script:WelcomeInfo = $tb
    $p.Controls.Add($tb)
    $y += 182
    $p.Controls.Add((New-Label 'Цвета в мастере:' 10 $y 780 22 $FontBold)); $y += 24
    $p.Controls.Add((New-Label '■ Безопасно — можно смело чистить, Windows всё восстановит сама.' 20 $y 770 22 $null $C_Safe)); $y += 24
    $p.Controls.Add((New-Label '■ На ваше решение — посмотрите и решите сами, мастер подскажет.' 20 $y 770 22 $null $C_Decide)); $y += 24
    $p.Controls.Add((New-Label '■ Не трогать — системное, драйверы, защита. Мастер это не удаляет.' 20 $y 770 22 $null $C_Danger)); $y += 34
    $p.Controls.Add((New-Label 'Шаги: 2) безопасная очистка → 3) крупные и старые файлы → 4) WizTree, удаление программ, старые драйверы → 5) автозагрузка и скорость → 6) шпаргалка команд → 7) итог и рекомендации.' 10 $y 780 44 $null $C_Muted))
    $y += 54
    $b = New-Btn '►  Начать: анализ и безопасная очистка' 10 $y 380 44
    Set-Primary $b
    $b.Add_Click({ Go-Step 1 })
    $p.Controls.Add($b)
}
function Enter-Welcome {
    if ($script:SysShown) { return }
    $s = $script:Sys
    $t = @()
    $t += 'Система:      ' + $s.Os
    $t += 'Процессор:    ' + $s.Cpu
    $t += 'Память (ОЗУ): ' + $s.RamGB + ' ГБ'
    $kind = 'настольный ПК'; if ($s.IsLaptop) { $kind = 'ноутбук' }
    $t += 'Тип:          ' + $kind
    $disk = 'Диск ' + $SysDrive + '      ' + $s.DiskType + ', состояние: ' + $s.DiskHealth
    if ($s.Wear -ne $null) { $disk += ', износ ' + $s.Wear + '%' }
    if ($s.Temp) { $disk += ', ' + $s.Temp + '°C' }
    $t += $disk
    $pct = 0; if ($s.Total -gt 0) { $pct = [math]::Round(100 * $s.Free / $s.Total) }
    $t += 'Свободно:     ' + (Format-Size $s.Free) + ' из ' + (Format-Size $s.Total) + " ($pct%)"
    $t += 'Без перезагрузки: ' + $s.UptimeDays + ' дн.'
    if ($s.Hiber -gt 0) { $t += 'Файл гибернации: ' + (Format-Size $s.Hiber) }
    if ($s.WinOld) { $t += 'Есть папка Windows.old (старая Windows)' }
    $script:WelcomeInfo.Text = ($t -join "`r`n")
    $script:SysShown = $true
    Write-Log ('Компьютер: ' + ($t -join ' | '))
}

function Build-Clean($p) {
    $y = 10
    $p.Controls.Add((New-Label 'Безопасная очистка' 10 $y 780 30 $FontHead)); $y += 38
    $p.Controls.Add((New-Label 'Мастер посчитал, сколько места занимает мусор. Зелёное отмечено сразу — это безопасно. Жёлтое — на ваше решение. Нажмите «Очистить отмеченное».' 10 $y 780 44)); $y += 52
    foreach ($it in $CleanItems) {
        $row = New-Object Windows.Forms.Panel
        $row.Location = New-Object Drawing.Point(10, $y); $row.Size = New-Object Drawing.Size(780, 34)
        $row.BackColor = [Drawing.Color]::FromArgb(245, 246, 247); $row.BorderStyle = 'FixedSingle'
        $cb = New-Object Windows.Forms.CheckBox
        $cb.Text = $it.Name; $cb.Checked = $it.Default; $cb.Font = $FontBold
        $cb.Location = New-Object Drawing.Point(8, 4); $cb.Size = New-Object Drawing.Size(548, 26)
        $lt = Level-Text $it.Level
        $lvl = New-Label $lt[0].ToUpper() 560 6 120 22 (New-Object Drawing.Font('Segoe UI', 8, [Drawing.FontStyle]::Bold)) ([Drawing.Color]::FromArgb(17, 34, 51))
        $lvl.TextAlign = 'MiddleCenter'; $lvl.BorderStyle = 'FixedSingle'
        if ($it.Level -eq 'safe') { $lvl.BackColor = [Drawing.Color]::FromArgb(127, 208, 75) } else { $lvl.BackColor = [Drawing.Color]::FromArgb(242, 183, 5) }
        $sz = New-Label '…' 686 5 86 24 (New-Object Drawing.Font('Consolas', 10, [Drawing.FontStyle]::Bold)) ([Drawing.Color]::FromArgb(157, 255, 92))
        $sz.TextAlign = 'MiddleRight'; $sz.BackColor = [Drawing.Color]::FromArgb(20, 33, 15)
        $row.Controls.Add($cb); $row.Controls.Add($lvl); $row.Controls.Add($sz)
        $it.Check = $cb; $it.SizeLabel = $sz; $it.Row = $row
        $p.Controls.Add($row)
        $y += 38
    }
    $y += 6
    $script:CleanTotal = New-Label '' 10 $y 780 24 $FontBold
    $p.Controls.Add($script:CleanTotal); $y += 30
    $b = New-Btn 'ОЧИСТИТЬ ОТМЕЧЕННОЕ' 10 $y 260 40
    Set-Primary $b
    $b.Add_Click({ Invoke-SafeClean })
    $p.Controls.Add($b)
    $b2 = New-Btn 'Пересчитать' 280 $y 140 40
    $b2.Add_Click({ Set-Busy $true; try { $t = Update-CleanSizes; $script:CleanTotal.Text = 'Можно освободить примерно: ' + (Format-Size $t) + ' (без учёта «Очистки диска» и DISM)' } finally { Set-Busy $false } })
    $p.Controls.Add($b2)
    $y += 50
    $script:CleanResult = New-Label '' 10 $y 780 24 $FontBold $C_Safe
    $p.Controls.Add($script:CleanResult); $y += 32
    $p.Controls.Add((New-Label 'Не трогаем никогда: папку «Загрузки» (только вы сами в шаге 3), файлы для «Вернуть компьютер в исходное состояние», System32 и WinSxS вручную, файл подкачки, пароли и вкладки браузеров. «Чистильщики реестра» не используются — они не ускоряют компьютер, но могут сломать программы.' 10 $y 780 64 $null $C_Danger))
}
function Enter-Clean {
    if ($script:CleanAnalyzed) { return }
    $script:CleanAnalyzed = $true
    Set-Busy $true
    try {
        $t = Update-CleanSizes
        $script:CleanTotal.Text = 'Можно освободить примерно: ' + (Format-Size $t) + ' (плюс то, что найдут «Очистка диска» и DISM)'
        Write-Log ('Анализ мусора: можно освободить примерно ' + (Format-Size $t))
    } finally { Set-Busy $false }
}

function Build-Big($p) {
    $y = 10
    $p.Controls.Add((New-Label 'Крупные и старые файлы' 10 $y 780 30 $FontHead)); $y += 38
    $p.Controls.Add((New-Label 'Ищу в вашей папке пользователя (Рабочий стол, Документы, Загрузки, Видео и т. д.) большие файлы и старые установщики в Загрузках. Системные папки не просматриваются. Отметьте ненужное галочкой.' 10 $y 780 44)); $y += 50
    $p.Controls.Add((New-Label 'Показывать файлы больше, МБ:' 10 ($y + 4) 230 24))
    $n = New-Object Windows.Forms.NumericUpDown
    $n.Minimum = 50; $n.Maximum = 50000; $n.Increment = 100; $n.Value = 500; $n.Font = $FontMain
    $n.Location = New-Object Drawing.Point(240, $y); $n.Size = New-Object Drawing.Size(90, 28)
    $script:BigMin = $n; $p.Controls.Add($n)
    $bs = New-Btn 'Найти' 340 ($y - 2) 120 32
    $bs.Add_Click({ Invoke-BigScan }); $p.Controls.Add($bs)
    $y += 38
    $lv = New-Lv 10 $y 780 300
    [void]$lv.Columns.Add('Файл', 230); [void]$lv.Columns.Add('Размер', 80); [void]$lv.Columns.Add('Изменён', 90)
    [void]$lv.Columns.Add('Что это', 150); [void]$lv.Columns.Add('Совет', 160); [void]$lv.Columns.Add('Путь', 400)
    $lv.Add_DoubleClick({ $s = $script:BigList.SelectedItems; if ($s.Count -gt 0) { Start-Process 'explorer.exe' ('/select,"' + $s[0].Tag.Path + '"') } })
    $script:BigList = $lv; $p.Controls.Add($lv)
    $y += 306
    $script:BigSummary = New-Label 'Двойной щелчок по строке — показать файл в проводнике.' 10 $y 780 24 $null $C_Muted
    $p.Controls.Add($script:BigSummary); $y += 30
    $cb = New-Object Windows.Forms.CheckBox
    $cb.Text = 'Удалять сразу навсегда (иначе — в Корзину, чтобы можно было вернуть)'; $cb.Font = $FontMain
    $cb.Location = New-Object Drawing.Point(10, $y); $cb.Size = New-Object Drawing.Size(600, 26)
    $script:BigPermanent = $cb; $p.Controls.Add($cb); $y += 32
    $bd = New-Btn 'Удалить отмеченные' 10 $y 220 38
    $bd.Add_Click({ Remove-BigChecked }); $p.Controls.Add($bd)
    $bo = New-Btn 'Открыть Загрузки' 240 $y 180 38
    $bo.Add_Click({ Start-Process 'explorer.exe' (Get-DownloadsPath) }); $p.Controls.Add($bo)
}
function Enter-Big { if (-not $script:BigScanned) { $script:BigScanned = $true; Invoke-BigScan } }

function Build-Tools($p) {
    $y = 10
    $p.Controls.Add((New-Label 'Что занимает место, ненужные программы, старые драйверы' 10 $y 780 30 $FontHead)); $y += 38
    $p.Controls.Add((New-Label 'Три проверенные бесплатные программы. Мастер запускает их по очереди и подсказывает, что нажимать. Если программы нет в папке Tools — нажмите «Скачать».' 10 $y 780 44)); $y += 52
    $n = 1
    foreach ($t in $Tools) {
        $gb = New-Object Windows.Forms.GroupBox
        $gb.Text = ('{0}. {1}' -f $n, $t.Name); $gb.Font = $FontBold
        $gb.Location = New-Object Drawing.Point(10, $y); $gb.Size = New-Object Drawing.Size(780, 230); $gb.Anchor = 'Top, Left, Right'
        $tips = New-Object Windows.Forms.TextBox
        $tips.Multiline = $true; $tips.ReadOnly = $true; $tips.Font = $FontMain; $tips.ScrollBars = 'Vertical'; $tips.BorderStyle = 'None'; $tips.BackColor = [Drawing.Color]::FromArgb(230, 232, 235)
        $tips.Location = New-Object Drawing.Point(12, 24); $tips.Size = New-Object Drawing.Size(756, 130); $tips.Anchor = 'Top, Left, Right'
        $tips.Text = $t.Tips
        $gb.Controls.Add($tips)
        $st = New-Label '' 12 158 756 22; $st.Font = $FontMain
        $gb.Controls.Add($st)
        $rb = New-Btn 'Запустить' 12 184 160 36
        $rb.Font = $FontBold; $rb.Tag = $t
        $rb.Add_Click({ Invoke-Tool $this.Tag })
        $gb.Controls.Add($rb)
        $cb = New-Btn 'Проверить снова' 182 184 160 36
        $cb.Tag = $t; $cb.Font = $FontMain
        $cb.Add_Click({ Update-ToolCard $this.Tag })
        $gb.Controls.Add($cb)
        $wb = New-Btn 'Сайт программы' 352 184 160 36
        $wb.Tag = $t; $wb.Font = $FontMain
        $wb.Add_Click({ Start-Process $this.Tag.Page })
        $gb.Controls.Add($wb)
        $t.StateLabel = $st; $t.RunBtn = $rb
        $p.Controls.Add($gb)
        $y += 240; $n++
    }
}
function Enter-Tools { foreach ($t in $Tools) { Update-ToolCard $t } }

function Build-Speed($p) {
    $y = 10
    $p.Controls.Add((New-Label 'Автозагрузка и скорость' 10 $y 780 30 $FontHead)); $y += 38
    $script:StartSummary = New-Label '' 10 $y 780 44
    $p.Controls.Add($script:StartSummary); $y += 48
    $lv = New-Lv 10 $y 780 230
    [void]$lv.Columns.Add('Программа', 190); [void]$lv.Columns.Add('Сейчас', 85); [void]$lv.Columns.Add('Совет', 200)
    [void]$lv.Columns.Add('Откуда', 150); [void]$lv.Columns.Add('Команда', 400)
    $script:StartList = $lv; $p.Controls.Add($lv)
    $y += 236
    $b1 = New-Btn 'Отметить рекомендованные' 10 $y 220 34
    $b1.Add_Click({ foreach ($i in $script:StartList.Items) { $i.Checked = ($i.Tag.Enabled -and $i.Tag.Advice -eq 'ok') } })
    $b2 = New-Btn 'Отключить отмеченные' 236 $y 190 34
    $b2.Add_Click({ Invoke-StartupAction 'off' })
    $b3 = New-Btn 'Включить обратно' 432 $y 160 34
    $b3.Add_Click({ Invoke-StartupAction 'on' })
    $b4 = New-Btn 'Удалить битые записи' 598 $y 192 34
    $b4.Add_Click({ Remove-BrokenStartup })
    $p.Controls.AddRange(@($b1, $b2, $b3, $b4)); $y += 40
    $p.Controls.Add((New-Label 'Отключение обратимо: программа не удаляется, просто не стартует с Windows. Это то же самое, что вкладка «Автозагрузка» в Диспетчере задач.' 10 $y 780 40 $null $C_Muted)); $y += 46

    $p.Controls.Add((New-Label 'Ускорение работы' 10 $y 780 26 $FontBold)); $y += 30
    $script:Opt = @{}
    $s = $script:Sys
    $cbP = New-Object Windows.Forms.CheckBox; $cbP.Font = $FontMain
    $cbP.Text = 'План электропитания:'; $cbP.Location = New-Object Drawing.Point(10, $y); $cbP.Size = New-Object Drawing.Size(200, 26)
    $combo = New-Object Windows.Forms.ComboBox; $combo.DropDownStyle = 'DropDownList'; $combo.Font = $FontMain
    [void]$combo.Items.Add('Сбалансированная (для ноутбука)'); [void]$combo.Items.Add('Высокая производительность (для ПК)')
    if ($s.IsLaptop) { $combo.SelectedIndex = 0 } else { $combo.SelectedIndex = 1 }
    $combo.Location = New-Object Drawing.Point(215, $y); $combo.Size = New-Object Drawing.Size(320, 28)
    $cur = ''
    try { $cur = ((& powercfg.exe /getactivescheme) -join ' ') -replace '^.*\(', '' -replace '\).*$', '' } catch {}
    $lblCur = New-Label ('сейчас: ' + $cur) 545 ($y + 3) 245 24 $null $C_Muted
    $p.Controls.AddRange(@($cbP, $combo, $lblCur)); $y += 32
    $cbF = New-Object Windows.Forms.CheckBox; $cbF.Font = $FontMain
    $cbF.Text = 'Отключить прозрачность и анимацию окон (заметно на слабых компьютерах)'
    $cbF.Location = New-Object Drawing.Point(10, $y); $cbF.Size = New-Object Drawing.Size(600, 26)
    $bFx = New-Btn 'Визуальные эффекты…' 615 ($y - 3) 175 30
    $bFx.Add_Click({ Start-Process 'SystemPropertiesPerformance.exe' })
    $p.Controls.AddRange(@($cbF, $bFx)); $y += 32
    $cbH = New-Object Windows.Forms.CheckBox; $cbH.Font = $FontMain
    $hb = 'Отключить гибернацию'
    if ($s.Hiber -gt 0) { $hb += ' — освободит ' + (Format-Size $s.Hiber) } else { $hb += ' (уже отключена)' }
    if ($s.IsLaptop) { $hb += '  [ноутбук: на ваше решение]'; $cbH.ForeColor = $C_Decide }
    $cbH.Text = $hb; $cbH.Enabled = ($s.Hiber -gt 0)
    $cbH.Location = New-Object Drawing.Point(10, $y); $cbH.Size = New-Object Drawing.Size(780, 26)
    $p.Controls.Add($cbH); $y += 32
    $cbT = New-Object Windows.Forms.CheckBox; $cbT.Font = $FontMain
    if ($s.IsSsd) { $cbT.Text = 'Оптимизировать SSD (команда TRIM, 1–2 минуты)'; $cbT.Checked = $true }
    else { $cbT.Text = 'Дефрагментировать жёсткий диск (может занять час и больше)' }
    $cbT.Location = New-Object Drawing.Point(10, $y); $cbT.Size = New-Object Drawing.Size(780, 26)
    $p.Controls.Add($cbT); $y += 32
    $cbS = New-Object Windows.Forms.CheckBox; $cbS.Font = $FontMain
    $cbS.Text = 'Проверить и починить системные файлы Windows (sfc /scannow, 10–20 минут, в отдельном окне)'
    $cbS.Location = New-Object Drawing.Point(10, $y); $cbS.Size = New-Object Drawing.Size(780, 26)
    $p.Controls.Add($cbS); $y += 34
    $diskTxt = 'Диск ' + $SysDrive + ': ' + $s.DiskType + ', состояние: ' + $s.DiskHealth
    if ($s.Wear -ne $null) { $diskTxt += ', износ ' + $s.Wear + '%' }
    if ($s.Temp) { $diskTxt += ', температура ' + $s.Temp + '°C' }
    $diskColor = $C_Safe
    if ($s.DiskHealth -ne 'исправен') { $diskColor = $C_Decide }
    $p.Controls.Add((New-Label $diskTxt 10 $y 780 24 $FontBold $diskColor)); $y += 30
    $bA = New-Btn 'ПРИМЕНИТЬ ОТМЕЧЕННОЕ' 10 $y 260 40
    Set-Primary $bA
    $bA.Add_Click({ Invoke-Optimize })
    $p.Controls.Add($bA)
    $script:Opt.Power = $cbP; $script:Opt.PowerCombo = $combo; $script:Opt.Fx = $cbF; $script:Opt.Hiber = $cbH; $script:Opt.Trim = $cbT; $script:Opt.Sfc = $cbS
}
function Enter-Speed { Fill-Startup }

function Build-Cheats($p) {
    $y = 10
    $p.Controls.Add((New-Label 'Шпаргалка полезных команд' 10 $y 780 30 $FontHead)); $y += 38
    $p.Controls.Add((New-Label 'Адреса для браузера копируются кнопкой «Копировать» — вставьте их в адресную строку браузера (Ctrl+V) и нажмите Enter. Команды Windows можно сразу открыть кнопкой «Открыть».' 10 $y 780 44)); $y += 50
    foreach ($c in $Cheats) {
        $p.Controls.Add((New-Label $c.T 10 $y 780 22 $FontBold))
        $y += 24
        $tb = New-Object Windows.Forms.TextBox
        $tb.ReadOnly = $true; $tb.Font = $FontMono; $tb.Text = $c.C
        $tb.Location = New-Object Drawing.Point(10, $y); $tb.Size = New-Object Drawing.Size(440, 26)
        $p.Controls.Add($tb)
        $bc = New-Btn 'Копировать' 460 ($y - 2) 120 30
        $bc.Tag = $c
        $bc.Add_Click({ [System.Windows.Forms.Clipboard]::SetText($this.Tag.C); Set-Status ('Скопировано: ' + $this.Tag.C + ' — вставьте Ctrl+V') })
        $p.Controls.Add($bc)
        if ($c.K -ne 'copy') {
            $bo = New-Btn 'Открыть' 588 ($y - 2) 120 30
            $bo.Tag = $c
            $bo.Add_Click({ Invoke-Cheat $this.Tag })
            $p.Controls.Add($bo)
        }
        $y += 30
        $d = New-Label $c.D 10 $y 780 40 $null $C_Muted
        $p.Controls.Add($d)
        $y += 48
    }
}

function Build-Final($p) {
    $y = 10
    $p.Controls.Add((New-Label 'Итог и рекомендации' 10 $y 780 30 $FontHead)); $y += 38
    $tb = New-Object Windows.Forms.TextBox
    $tb.Multiline = $true; $tb.ReadOnly = $true; $tb.Font = $FontMain; $tb.ScrollBars = 'Vertical'
    $tb.Location = New-Object Drawing.Point(10, $y); $tb.Size = New-Object Drawing.Size(780, 380); $tb.Anchor = 'Top, Left, Right'
    $script:FinalBox = $tb; $p.Controls.Add($tb); $y += 390
    $b1 = New-Btn 'Обновить отчёт' 10 $y 170 38
    $b1.Add_Click({ Enter-Final })
    $b2 = New-Btn 'Открыть папку журналов' 190 $y 220 38
    $b2.Add_Click({ Start-Process 'explorer.exe' $LogDir })
    $b3 = New-Btn 'Очистить Корзину' 420 $y 170 38
    $b3.Add_Click({ if (Ask 'Очистить Корзину на всех дисках? Вернуть файлы будет нельзя.') { Clear-RecycleBin -Force -ErrorAction SilentlyContinue; $script:NeedEmptyBin = $false; Add-Done 'Корзина очищена'; Enter-Final } })
    $b4 = New-Btn 'Закрыть мастер' 600 $y 190 38
    $b4.Add_Click({ $script:Form.Close() })
    $p.Controls.AddRange(@($b1, $b2, $b3, $b4))
}
function Enter-Final {
    Set-Busy $true
    try {
        $r = Build-Report
        $script:FinalBox.Text = $r
        $rf = Join-Path $LogDir ('report_' + $Stamp + '.txt')
        Set-Content -LiteralPath $rf -Value $r -Encoding UTF8
        Write-Log ('Отчёт сохранён: ' + $rf)
    } finally { Set-Busy $false }
}

$Steps = @(
    @{ Title = '1. Начало';                 Build = ${function:Build-Welcome}; Enter = ${function:Enter-Welcome} },
    @{ Title = '2. Безопасная очистка';     Build = ${function:Build-Clean};   Enter = ${function:Enter-Clean} },
    @{ Title = '3. Крупные файлы';          Build = ${function:Build-Big};     Enter = ${function:Enter-Big} },
    @{ Title = '4. Место, программы, драйверы'; Build = ${function:Build-Tools}; Enter = ${function:Enter-Tools} },
    @{ Title = '5. Автозагрузка и скорость'; Build = ${function:Build-Speed};  Enter = ${function:Enter-Speed} },
    @{ Title = '6. Шпаргалка команд';       Build = ${function:Build-Cheats};  Enter = $null },
    @{ Title = '7. Итог и рекомендации';    Build = ${function:Build-Final};   Enter = ${function:Enter-Final} }
)

function Go-Step([int]$n) {
    if ($script:Busy) { return }
    if ($n -lt 0 -or $n -ge $Steps.Count) { return }
    $st = $Steps[$n]
    if (-not $st.Panel) {
        $pn = New-Object Windows.Forms.Panel
        $pn.Dock = 'Fill'; $pn.AutoScroll = $true; $pn.BackColor = [Drawing.Color]::FromArgb(230, 232, 235); $pn.BorderStyle = 'FixedSingle'; $pn.Padding = New-Object Windows.Forms.Padding(8)
        $pn.Visible = $false
        & $st.Build $pn
        $script:Content.Controls.Add($pn)
        $st.Panel = $pn
    }
    foreach ($o in $Steps) { if ($o.Panel) { $o.Panel.Visible = $false } }
    $st.Panel.Visible = $true
    $script:Current = $n
    if ($script:Visited -notcontains $n) { $script:Visited += $n }
    for ($i = 0; $i -lt $script:NavLabels.Count; $i++) {
        $l = $script:NavLabels[$i]
        if ($i -eq $n) { $l.BackColor = [Drawing.Color]::FromArgb(245, 154, 31); $l.ForeColor = [Drawing.Color]::FromArgb(27, 29, 32) }
        elseif ($script:Visited -contains $i) { $l.BackColor = [Drawing.Color]::FromArgb(63, 68, 75); $l.ForeColor = [Drawing.Color]::FromArgb(143, 209, 106) }
        else { $l.BackColor = [Drawing.Color]::FromArgb(63, 68, 75); $l.ForeColor = [Drawing.Color]::FromArgb(200, 204, 210) }
    }
    $script:BtnBack.Enabled = ($n -gt 0)
    if ($n -eq $Steps.Count - 1) { $script:BtnNext.Text = 'Закрыть' } else { $script:BtnNext.Text = 'Далее  ►' }
    Write-Log ('— Шаг ' + $st.Title)
    if ($st.Enter) { & $st.Enter }
}

# ---------- Главное окно (стиль «мастерская») ----------
$C_Steel  = [Drawing.Color]::FromArgb(46, 50, 55)
$C_Dark   = [Drawing.Color]::FromArgb(27, 29, 32)
$C_Orange = [Drawing.Color]::FromArgb(245, 154, 31)
$C_Yellow = [Drawing.Color]::FromArgb(242, 183, 5)
$C_Plate  = [Drawing.Color]::FromArgb(230, 232, 235)
$C_Tag    = [Drawing.Color]::FromArgb(63, 68, 75)

$form = New-Object Windows.Forms.Form
$form.Text = "Мастерская очистки Windows  v$AppVersion"
$form.Size = New-Object Drawing.Size(1100, 820)
$form.MinimumSize = New-Object Drawing.Size(920, 640)
$form.StartPosition = 'CenterScreen'
$form.Font = $FontMain
$form.BackColor = $C_Steel
$script:Form = $form

$content = New-Object Windows.Forms.Panel
$content.Dock = 'Fill'; $content.BackColor = $C_Steel
$content.Padding = New-Object Windows.Forms.Padding(14, 14, 14, 10)
$script:Content = $content

# Шапка: жёлто-чёрная полоса + оранжевая плашка
$head = New-Object Windows.Forms.Panel
$head.Dock = 'Top'; $head.Height = 86; $head.BackColor = $C_Orange
$head.Add_Paint({
    param($sender, $e)
    $g = $e.Graphics
    $w = $sender.ClientSize.Width
    $g.FillRectangle((New-Object Drawing.SolidBrush($C_Dark)), 0, 0, $w, 14)
    $yb = New-Object Drawing.SolidBrush($C_Yellow)
    for ($x = -20; $x -lt $w + 20; $x += 36) {
        $pts = [Drawing.Point[]]@((New-Object Drawing.Point($x, 14)), (New-Object Drawing.Point(($x + 18), 14)), (New-Object Drawing.Point(($x + 32), 0)), (New-Object Drawing.Point(($x + 14), 0)))
        $g.FillPolygon($yb, $pts)
    }
    $g.FillRectangle((New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(122, 58, 0))), 0, ($sender.ClientSize.Height - 4), $w, 4)
})
$hTitle = New-Label 'МАСТЕРСКАЯ ОЧИСТКИ' 20 20 700 40 (New-Object Drawing.Font('Segoe UI Black', 22, [Drawing.FontStyle]::Bold)) $C_Dark
$hTitle.BackColor = [Drawing.Color]::Transparent
$hSub = New-Label 'РЕМОНТ · ЧИСТКА · ТЮНИНГ ДЛЯ WINDOWS' 24 58 700 20 (New-Object Drawing.Font('Segoe UI', 9, [Drawing.FontStyle]::Bold)) ([Drawing.Color]::FromArgb(74, 34, 0))
$hSub.BackColor = [Drawing.Color]::Transparent
$hVer = New-Label ("v$AppVersion") 0 34 60 26 (New-Object Drawing.Font('Consolas', 10, [Drawing.FontStyle]::Bold)) $C_Yellow
$hVer.BackColor = $C_Dark; $hVer.TextAlign = 'MiddleCenter'; $hVer.Anchor = 'Top, Right'
$hVer.Left = 1100 - 100
$head.Controls.AddRange(@($hTitle, $hSub, $hVer))

$nav = New-Object Windows.Forms.Panel
$nav.Dock = 'Left'; $nav.Width = 250; $nav.BackColor = [Drawing.Color]::FromArgb(36, 39, 43)
$script:NavLabels = @()
$ny = 16
for ($i = 0; $i -lt $Steps.Count; $i++) {
    $l = New-Label $Steps[$i].Title 12 $ny 226 40 $FontBold
    $l.TextAlign = 'MiddleLeft'; $l.Padding = New-Object Windows.Forms.Padding(10, 0, 0, 0); $l.Cursor = [System.Windows.Forms.Cursors]::Hand
    $l.BorderStyle = 'FixedSingle'
    $l.Tag = $i
    $l.Add_Click({ Go-Step ([int]$this.Tag) })
    $nav.Controls.Add($l)
    $script:NavLabels += $l
    $ny += 46
}
$nav.Controls.Add((New-Label 'Ничего не разбираем без вашей отметки. Перед работой — точка восстановления.' 14 ($ny + 8) 222 60 $null ([Drawing.Color]::FromArgb(139, 145, 152))))

$bottom = New-Object Windows.Forms.Panel
$bottom.Dock = 'Bottom'; $bottom.Height = 190; $bottom.BackColor = [Drawing.Color]::FromArgb(36, 39, 43)
$bottom.Padding = New-Object Windows.Forms.Padding(10, 8, 10, 0)

# Механик: работает (анимация), пока идёт операция
$mech = New-Object Windows.Forms.Panel
$mech.Dock = 'Left'; $mech.Width = 160; $mech.BackColor = [Drawing.Color]::FromArgb(36, 39, 43)
$pic = New-Object Windows.Forms.PictureBox
$pic.SizeMode = 'Zoom'; $pic.Dock = 'Fill'; $pic.BackColor = [Drawing.Color]::FromArgb(36, 39, 43)
$mcap = New-Label 'ЖДУ КОМАНДУ' 0 0 160 22 (New-Object Drawing.Font('Segoe UI', 9, [Drawing.FontStyle]::Bold)) $C_Yellow
$mcap.Dock = 'Bottom'; $mcap.TextAlign = 'MiddleCenter'; $mcap.BackColor = [Drawing.Color]::FromArgb(17, 17, 17)
$mech.Controls.Add($pic); $mech.Controls.Add($mcap)
$script:MechPic = $pic; $script:MechCap = $mcap
try {
    $script:MechAnim = [Drawing.Image]::FromFile((Join-Path $Root 'assets\mechanic.gif'))
    $script:MechIdle = [Drawing.Image]::FromFile((Join-Path $Root 'assets\mechanic_idle.png'))
    $pic.Image = $script:MechIdle
} catch { $mech.Visible = $false }

$log = New-Object Windows.Forms.TextBox
$log.Multiline = $true; $log.ReadOnly = $true; $log.ScrollBars = 'Vertical'; $log.Font = New-Object Drawing.Font('Consolas', 9.5)
$log.Dock = 'Fill'; $log.BackColor = [Drawing.Color]::FromArgb(15, 26, 12); $log.ForeColor = [Drawing.Color]::FromArgb(143, 227, 90)
$log.BorderStyle = 'FixedSingle'
$script:LogBox = $log
$gap = New-Object Windows.Forms.Panel; $gap.Dock = 'Left'; $gap.Width = 10
$bar = New-Object Windows.Forms.Panel
$bar.Dock = 'Bottom'; $bar.Height = 54
$status = New-Label 'Готово.' 0 17 600 24 $null ([Drawing.Color]::FromArgb(200, 204, 210))
$status.Anchor = 'Left, Bottom'
$script:StatusLabel = $status
$btnBack = New-Btn '◄  НАЗАД' 0 8 130 40
$btnNext = New-Btn 'ДАЛЕЕ  ►' 0 8 150 40
Set-Primary $btnNext
$btnBack.Anchor = 'Top, Right'; $btnNext.Anchor = 'Top, Right'
$script:BtnBack = $btnBack; $script:BtnNext = $btnNext
$btnBack.Add_Click({ Go-Step ($script:Current - 1) })
$btnNext.Add_Click({ if ($script:Current -ge $Steps.Count - 1) { $script:Form.Close() } else { Go-Step ($script:Current + 1) } })
$bar.Controls.AddRange(@($status, $btnBack, $btnNext))
$logCap = New-Label 'ЖУРНАЛ РАБОТ (сохраняется в папку Logs)' 4 0 500 20 (New-Object Drawing.Font('Segoe UI', 8.5, [Drawing.FontStyle]::Bold)) ([Drawing.Color]::FromArgb(139, 145, 152))
$logCap.Dock = 'Top'
$bottom.Controls.Add($log); $bottom.Controls.Add($logCap); $bottom.Controls.Add($gap); $bottom.Controls.Add($mech); $bottom.Controls.Add($bar)

$form.Controls.Add($content)
$form.Controls.Add($nav)
$form.Controls.Add($bottom)
$form.Controls.Add($head)

$form.Add_Resize({
    $hVer.Left = $head.ClientSize.Width - 84
    $head.Invalidate()
    $w = $bar.ClientSize.Width
    $script:BtnNext.Left = $w - 160
    $script:BtnBack.Left = $w - 300
    $script:StatusLabel.Width = [math]::Max(100, $w - 320)
})
$form.Add_Shown({
    $hVer.Left = $head.ClientSize.Width - 84
    $script:BtnNext.Left = $bar.ClientSize.Width - 160
    $script:BtnBack.Left = $bar.ClientSize.Width - 300
    Write-Log ("Мастер очистки v$AppVersion запущен. Журнал: $LogFile")
    Set-Status 'Собираю сведения о компьютере…'
    $script:Sys = Get-SysInfo
    $script:FreeAtStart = $script:Sys.Free
    Go-Step 0
    Set-Status 'Готово. Нажмите «Начать».'
})
$form.Add_FormClosing({
    param($sender, $e)
    if ($script:Busy) {
        if (-not (Ask 'Сейчас идёт операция. Закрыть мастер всё равно? (Начатая очистка Windows доработает сама.)')) { $e.Cancel = $true; return }
    }
    Write-Log 'Мастер закрыт.'
})

try {
    [void]$form.ShowDialog()
} catch {
    [System.Windows.Forms.MessageBox]::Show("Ошибка мастера:`r`n" + $_.Exception.Message + "`r`n`r`nЖурнал: $LogFile", 'Мастер очистки') | Out-Null
}
