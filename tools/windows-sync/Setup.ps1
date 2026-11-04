# One-time setup for Exam Corner Sync. Run it by double-clicking Setup.bat.
$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Cfg = Get-Content -LiteralPath (Join-Path $Here 'sync-config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$Repo = [Environment]::ExpandEnvironmentVariables($Cfg.repoFolder)
$Branch = $Cfg.branch

function Step($t) { Write-Host ''; Write-Host "==> $t" -ForegroundColor Cyan }
function Run-Git {
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  & git @args
  $code = $LASTEXITCODE; $ErrorActionPreference = $old
  if ($code -ne 0) { throw "git $($args -join ' ') नहीं चला (code $code)" }
}

Step '1/4  Git check कर रहे हैं'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host 'Git नहीं मिला। इसे free में install कर रहे हैं...'
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  }
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host 'Git अपने आप install नहीं हुआ। यह page खुल रहा है: वहाँ से Git download करके install करें, फिर Setup.bat दोबारा चलाएँ।' -ForegroundColor Yellow
    Start-Process 'https://git-scm.com/download/win'
    exit 1
  }
}
Write-Host 'Git मिल गया।'

Step '2/4  Website की copy laptop पर ला रहे हैं'
if (Test-Path -LiteralPath (Join-Path $Repo '.git')) {
  Write-Host "पहले से है: $Repo"
  Run-Git -C $Repo fetch origin $Branch
} else {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Repo) | Out-Null
  Run-Git clone --branch $Branch --single-branch $Cfg.repoUrl $Repo
}
Run-Git -C $Repo config user.name 'Exam Corner Sync'
Run-Git -C $Repo config user.email 'examcorner-sync@users.noreply.github.com'

Step '3/4  GitHub login check (browser खुल सकता है, उसमें GitHub से login करके Authorize दबाइए)'
Run-Git -C $Repo push --dry-run origin "HEAD:$Branch"
Write-Host 'GitHub पर upload करने की इजाज़त है।' -ForegroundColor Green

Step '4/4  Laptop चालू होते ही sync अपने आप चले, ऐसा set कर रहे हैं'
$script = Join-Path $Here 'ExamCornerSync.ps1'
$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup 'Exam Corner Sync.lnk'
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lnk)
$s.TargetPath = (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')
$s.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$s.WorkingDirectory = $Here
$s.WindowStyle = 7
$s.Description = 'Exam Corner Sync'
$s.Save()
Start-Process -FilePath $s.TargetPath -ArgumentList $s.Arguments -WindowStyle Hidden

Write-Host ''
Write-Host 'हो गया! नीचे दाईं तरफ (घड़ी के पास) Exam Corner Sync का icon आ गया होगा।' -ForegroundColor Green
Write-Host 'अब Downloads में जो भी नई PDF आएगी, वो website पर चली जाएगी।'
