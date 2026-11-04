# Exam Corner Sync for Windows.
# Watches the Downloads folder. When a new PDF arrives (for example from a ChatGPT or Gemini
# scheduled task), it puts the PDF on the Exam Corner website: it copies the file into the
# site's repo, adds a study-material entry, then commits and pushes to GitHub.
#
# File names starting with EC_ are filed automatically, with no question asked:
#   EC_<EXAM>_<SUBJECT>_<TYPE>_<title words>.pdf      e.g. EC_UPSC_polity_long_Fundamental_Rights.pdf
# TYPE is one of: long (or notes), short, mindmap, pyq. It can be left out (then it is long).
# Any other new PDF opens a small window that asks where to put it, or lets you skip it.
#
# Uses only what comes with Windows (PowerShell 5.1) plus Git for Windows. Costs nothing.

param([switch]$Once)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Cfg = Get-Content -LiteralPath (Join-Path $Here 'sync-config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
function Expand([string]$p) { [Environment]::ExpandEnvironmentVariables($p) }

$Repo = Expand $Cfg.repoFolder
$Branch = $Cfg.branch
# "DOWNLOADS" means the real Downloads folder, even if it was moved (for example into OneDrive).
function Downloads-Folder {
  try { $p = (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path; if ($p) { return $p } } catch {}
  return (Join-Path $env:USERPROFILE 'Downloads')
}
$Watch = @($Cfg.watchFolders | ForEach-Object { if ($_ -eq 'DOWNLOADS') { Downloads-Folder } else { Expand $_ } })
$DataDir = Join-Path $env:LOCALAPPDATA 'ExamCornerSync'
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$StateFile = Join-Path $DataDir 'state.json'
$LogFile = Join-Path $DataDir 'sync-log.txt'
$Utf8 = New-Object System.Text.UTF8Encoding($false)

$TypeLabels = [ordered]@{ long = 'Long Notes'; short = 'Short Notes'; mindmap = 'Mind Map'; pyq = 'PYQ' }
$TypeAliases = @{ long = 'long'; notes = 'long'; note = 'long'; short = 'short'; mindmap = 'mindmap'; map = 'mindmap'; pyq = 'pyq' }

function Log([string]$msg) {
  $line = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $msg
  try { [IO.File]::AppendAllText($LogFile, $line + "`r`n", $Utf8) } catch {}
}

# ---------- one copy only ----------
$created = $false
$Mutex = New-Object System.Threading.Mutex($true, 'Local\ExamCornerSync', [ref]$created)
if (-not $created) { exit }

# ---------- git ----------
function Git {
  $GitArgs = @($args)
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'   # git writes progress to stderr; that is not an error
  $out = & git -C $Repo @GitArgs 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $old
  if ($code -ne 0) { throw "git $($GitArgs -join ' ') failed: $($out -join ' ')" }
  return ($out -join "`n")
}

# ---------- state: which PDFs were already seen ----------
function Key($f) { '{0}|{1}|{2}' -f $f.FullName, $f.Length, $f.LastWriteTimeUtc.Ticks }
function Load-State {
  $s = @{ seen = @{}; queue = @() }
  if (Test-Path -LiteralPath $StateFile) {
    try {
      $j = Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json
      foreach ($k in @($j.seen)) { if ($k) { $s.seen[$k] = $true } }
      $s.queue = @($j.queue | Where-Object { $_ })
      $s.fresh = $false
      return $s
    } catch { Log "State file unreadable, starting fresh: $_" }
  }
  $s.fresh = $true
  return $s
}
function Save-State {
  $keys = @($State.seen.Keys)
  if ($keys.Count -gt 3000) { $keys = $keys[($keys.Count - 3000)..($keys.Count - 1)] }
  $obj = [ordered]@{ seen = $keys; queue = @($State.queue) }
  [IO.File]::WriteAllText($StateFile, ($obj | ConvertTo-Json -Depth 6), $Utf8)
}

function All-Pdfs {
  foreach ($w in $Watch) {
    if (Test-Path -LiteralPath $w) { Get-ChildItem -LiteralPath $w -Filter '*.pdf' -File -ErrorAction SilentlyContinue }
  }
}

# A file is ready when the browser has finished writing it.
function Is-Ready($f) {
  if (((Get-Date) - $f.LastWriteTime).TotalSeconds -lt 4) { return $false }
  try { $s = [IO.File]::Open($f.FullName, 'Open', 'Read', 'None'); $s.Close(); return $true } catch { return $false }
}

# ---------- exams and subjects from the site ----------
function Load-Exams {
  $p = Join-Path $Repo 'content\exams.json'
  (Get-Content -LiteralPath $p -Raw -Encoding UTF8 | ConvertFrom-Json).exams
}
function Norm([string]$s) { ($s -replace '[^A-Za-z0-9]', '').ToLowerInvariant() }

function Find-Exam($exams, [string]$token) {
  $t = Norm $token
  if (-not $t) { return $null }
  foreach ($prop in $Cfg.examAliases.PSObject.Properties) {
    if ((Norm $prop.Name) -eq $t) { $hit = $exams | Where-Object { $_.id -eq $prop.Value } | Select-Object -First 1; if ($hit) { return $hit } }
  }
  $hit = $exams | Where-Object { (Norm $_.id) -eq $t -or (Norm $_.name) -eq $t } | Select-Object -First 1
  if ($hit) { return $hit }
  return ($exams | Where-Object { (Norm $_.name).StartsWith($t) -or (Norm $_.id).StartsWith($t) } | Select-Object -First 1)
}
function Find-Subject($exam, [string]$token) {
  $t = Norm $token
  if ($t -in @('general', 'all', 'misc', 'gen')) { return '' }
  $hit = @($exam.subjects) | Where-Object { $_ -and ((Norm $_.id) -eq $t -or (Norm $_.name) -eq $t) } | Select-Object -First 1
  if ($hit) { return $hit.id }
  return $null
}

function Clean-Base([string]$name) {
  $b = [IO.Path]::GetFileNameWithoutExtension($name)
  return ($b -replace '\s*\(\d+\)$', '').Trim()   # "notes (1)" -> "notes"
}
function Words([string]$s) { (($s -replace '[_]+', ' ') -replace '\s+', ' ').Trim() }

# EC_<EXAM>_<SUBJECT>_<TYPE>_<title>  ->  route, or $null
function Parse-Name($exams, [string]$fileName) {
  $b = Clean-Base $fileName
  if ($b -notmatch '^(?i)EC[_\- ]') { return $null }
  $parts = @(($b -split '_') | Where-Object { $_ -ne '' })
  if ($parts.Count -lt 3) { return $null }
  $exam = Find-Exam $exams $parts[1]
  if (-not $exam) { return $null }
  $subject = Find-Subject $exam $parts[2]
  if ($null -eq $subject) { return $null }
  $rest = @()
  if ($parts.Count -gt 3) { $rest = $parts[3..($parts.Count - 1)] }
  $type = 'long'
  if ($rest.Count -gt 0 -and $TypeAliases.ContainsKey($rest[0].ToLowerInvariant())) { $type = $TypeAliases[$rest[0].ToLowerInvariant()]; $rest = @($rest | Select-Object -Skip 1) }
  $title = Words ($rest -join ' ')
  if (-not $title) { $title = '{0} {1:d MMM yyyy}' -f $TypeLabels[$type], (Get-Date) }
  return @{ exam = $exam.id; subject = $subject; type = $type; title = $title }
}

# ---------- the "where should this go?" window ----------
function Ask-Route($exams, $file) {
  $form = New-Object System.Windows.Forms.Form
  $form.Text = 'Exam Corner: नई PDF मिली'
  $form.Size = New-Object System.Drawing.Size(500, 360)
  $form.StartPosition = 'CenterScreen'
  $form.TopMost = $true
  $form.FormBorderStyle = 'FixedDialog'
  $form.MaximizeBox = $false
  $form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

  $y = 14
  function Add-Label($text, $top, $bold) {
    $l = New-Object System.Windows.Forms.Label
    $l.Text = $text; $l.Left = 16; $l.Top = $top; $l.Width = 450; $l.Height = 22
    if ($bold) { $l.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold) }
    $form.Controls.Add($l)
  }
  Add-Label ('📄 ' + $file.Name) $y $true; $y += 30
  Add-Label 'इसे website पर कहाँ लगाना है?' $y $false; $y += 30

  function Add-Combo($label, $top) {
    $l = New-Object System.Windows.Forms.Label
    $l.Text = $label; $l.Left = 16; $l.Top = $top + 3; $l.Width = 110
    $form.Controls.Add($l)
    $c = New-Object System.Windows.Forms.ComboBox
    $c.Left = 130; $c.Top = $top; $c.Width = 336; $c.DropDownStyle = 'DropDownList'
    $form.Controls.Add($c)
    return $c
  }
  $cExam = Add-Combo 'Exam' $y; $y += 36
  $cSubj = Add-Combo 'Subject' $y; $y += 36
  $cType = Add-Combo 'Type' $y; $y += 36

  $l = New-Object System.Windows.Forms.Label
  $l.Text = 'Title'; $l.Left = 16; $l.Top = $y + 3; $l.Width = 110
  $form.Controls.Add($l)
  $tTitle = New-Object System.Windows.Forms.TextBox
  $tTitle.Left = 130; $tTitle.Top = $y; $tTitle.Width = 336
  $tTitle.Text = Words (Clean-Base $file.Name)
  $form.Controls.Add($tTitle); $y += 46

  foreach ($e in $exams) { [void]$cExam.Items.Add($e.name) }
  foreach ($k in $TypeLabels.Keys) { [void]$cType.Items.Add($TypeLabels[$k]) }
  $cType.SelectedIndex = 0

  $fillSubjects = {
    $cSubj.Items.Clear()
    [void]$cSubj.Items.Add('General (no subject)')
    $e = $exams[$cExam.SelectedIndex]
    foreach ($s in @($e.subjects)) { if ($s) { [void]$cSubj.Items.Add($s.name) } }
    $cSubj.SelectedIndex = 0
  }
  $cExam.Add_SelectedIndexChanged($fillSubjects)

  # Best guess: an exam name or alias that appears in the file name.
  $guess = 0
  $fn = Norm $file.Name
  for ($i = 0; $i -lt $exams.Count; $i++) {
    $names = @($exams[$i].name) + @($Cfg.examAliases.PSObject.Properties | Where-Object { $_.Value -eq $exams[$i].id } | ForEach-Object { $_.Name })
    foreach ($n in $names) { $nn = Norm $n; if ($nn.Length -ge 3 -and $fn.Contains($nn)) { $guess = $i; break } }
  }
  if ($exams.Count -gt 0) { $cExam.SelectedIndex = $guess }

  $ok = New-Object System.Windows.Forms.Button
  $ok.Text = 'Website पर भेजो'; $ok.Left = 130; $ok.Top = $y; $ok.Width = 170; $ok.Height = 34
  $ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
  $skip = New-Object System.Windows.Forms.Button
  $skip.Text = 'छोड़ दो (Skip)'; $skip.Left = 310; $skip.Top = $y; $skip.Width = 156; $skip.Height = 34
  $skip.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
  $form.Controls.Add($ok); $form.Controls.Add($skip)
  $form.AcceptButton = $ok; $form.CancelButton = $skip

  $result = $form.ShowDialog()
  if ($result -ne [System.Windows.Forms.DialogResult]::OK -or $cExam.SelectedIndex -lt 0) { $form.Dispose(); return $null }
  $exam = $exams[$cExam.SelectedIndex]
  $subject = ''
  if ($cSubj.SelectedIndex -gt 0) { $subject = @($exam.subjects | Where-Object { $_ })[$cSubj.SelectedIndex - 1].id }
  $type = @($TypeLabels.Keys)[$cType.SelectedIndex]
  $title = $tTitle.Text.Trim()
  if (-not $title) { $title = Words (Clean-Base $file.Name) }
  $form.Dispose()
  return @{ exam = $exam.id; subject = $subject; type = $type; title = $title }
}

# ---------- put one PDF on the website ----------
function Slugify([string]$s) {
  $x = ($s.ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')
  if ($x.Length -gt 50) { $x = $x.Substring(0, 50).Trim('-') }
  return $x
}
function Base36([long]$n) {
  $c = '0123456789abcdefghijklmnopqrstuvwxyz'; $s = ''
  while ($n -gt 0) { $s = "$($c[[int]($n % 36)])$s"; $n = [long][math]::Floor($n / 36) }
  return $s
}

function Publish($job) {
  $src = $job.path
  if (-not (Test-Path -LiteralPath $src)) { throw "File is gone: $src" }
  $size = (Get-Item -LiteralPath $src).Length
  if ($size -gt 95MB) { throw 'File is larger than 95 MB; GitHub cannot take it.' }

  for ($try = 1; $try -le 3; $try++) {
    Git fetch origin $Branch | Out-Null
    Git checkout -q -B $Branch "origin/$Branch" | Out-Null
    Git reset -q --hard "origin/$Branch" | Out-Null
    Git clean -q -fd -- uploads content | Out-Null

    $now = Get-Date
    $stamp = Base36 ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
    $fileSlug = Slugify (Clean-Base (Split-Path -Leaf $src)); if (-not $fileSlug) { $fileSlug = 'file' }
    $rel = 'uploads/{0:yyyy}/{0:MM}/{1}-{2}.pdf' -f $now, $stamp, $fileSlug
    $dest = Join-Path $Repo ($rel -replace '/', '\')
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
    Copy-Item -LiteralPath $src -Destination $dest -Force

    $idSlug = Slugify $job.title; if (-not $idSlug) { $idSlug = $job.type }
    $id = "$idSlug-$stamp"
    $label = (Split-Path -Leaf $src) -replace '[\[\]()]', ' '
    $md = "[📄 $label (download/open)]($rel)`n"
    [IO.File]::WriteAllText((Join-Path $Repo "content\exam-items\$id.md"), $md, $Utf8)

    $jsonPath = Join-Path $Repo 'content\exam-items.json'
    $text = [IO.File]::ReadAllText($jsonPath, $Utf8)
    $count = @(($text | ConvertFrom-Json).items).Count
    $item = [ordered]@{ id = $id; exam = $job.exam; subject = $job.subject; type = $job.type; title = $job.title; summary = ''; date = ('{0:yyyy-MM-dd}' -f $now) }
    $entry = ($item | ConvertTo-Json -Compress)
    $sep = ''; if ($count -gt 0) { $sep = ',' }
    $rx = New-Object System.Text.RegularExpressions.Regex('"items"\s*:\s*\[')
    $newText = $rx.Replace($text, ('"items": [' + "`n    " + $entry + $sep).Replace('$', '$$'), 1)
    $null = $newText | ConvertFrom-Json   # stop here if the result is not valid JSON
    [IO.File]::WriteAllText($jsonPath, $newText, $Utf8)

    Git add -A -- uploads content | Out-Null
    Git commit -q -m "Auto-sync: $($job.title)" | Out-Null
    try { Git push -q origin "HEAD:$Branch" | Out-Null; return $id }
    catch { Log "Push attempt $try failed: $_"; Start-Sleep -Seconds (3 * $try) }
  }
  throw 'Could not push to GitHub after 3 tries (no internet?). Will try again later.'
}

# ---------- tray icon ----------
$Tray = New-Object System.Windows.Forms.NotifyIcon
$Tray.Icon = [System.Drawing.SystemIcons]::Information
$Tray.Text = 'Exam Corner Sync (चल रहा है)'
$Menu = New-Object System.Windows.Forms.ContextMenuStrip
[void]$Menu.Items.Add('Website खोलो', $null, { Start-Process $Cfg.siteUrl })
[void]$Menu.Items.Add('Log देखो', $null, { if (Test-Path $LogFile) { Start-Process notepad.exe $LogFile } })
[void]$Menu.Items.Add('बंद करो (Exit)', $null, { $Tray.Visible = $false; [System.Windows.Forms.Application]::Exit() })
$Tray.ContextMenuStrip = $Menu
$Tray.Visible = $true
function Notify([string]$title, [string]$text, $icon = 'Info') { try { $Tray.ShowBalloonTip(6000, $title, $text, $icon) } catch {} }

# ---------- main loop ----------
$State = Load-State
if ($State.fresh) {
  foreach ($f in All-Pdfs) { $State.seen[(Key $f)] = $true }   # don't ask about PDFs that were already there
  Save-State
  Log 'Started for the first time. Old PDFs in Downloads were skipped.'
}
if (-not (Test-Path -LiteralPath (Join-Path $Repo '.git'))) {
  [System.Windows.Forms.MessageBox]::Show("Website का folder नहीं मिला:`n$Repo`n`nपहले Setup.bat चलाइए।", 'Exam Corner Sync') | Out-Null
  exit
}
Log "Watching: $($Watch -join ', ')"

$Busy = $false
$RetryAt = Get-Date
$Warned = $false
function Tick {
  if ($script:Busy) { return }
  $script:Busy = $true
  try {
    $exams = $null
    foreach ($f in @(All-Pdfs)) {
      $k = Key $f
      if ($State.seen.ContainsKey($k)) { continue }
      if (-not (Is-Ready $f)) { continue }
      $State.seen[$k] = $true; Save-State
      if ($null -eq $exams) { $exams = @(Load-Exams) }
      $route = Parse-Name $exams $f.Name
      if (-not $route) {
        if (-not $Cfg.askForEveryNewPdf) { Log "Skipped (name not EC_...): $($f.Name)"; continue }
        $route = Ask-Route $exams $f
        if (-not $route) { Log "Skipped by you: $($f.Name)"; continue }
      }
      $route.path = $f.FullName
      $State.queue = @($State.queue) + @([pscustomobject]$route); Save-State
    }

    while (@($State.queue).Count -gt 0 -and (Get-Date) -ge $script:RetryAt) {
      $job = @($State.queue)[0]
      try {
        $id = Publish $job
        Log "Uploaded: $($job.path) -> $($job.exam) / $($job.subject) / $($job.type) ($id)"
        Notify 'Exam Corner ✅' "$($job.title)`nwebsite पर भेज दिया। 1–2 मिनट में दिखेगा।"
        $State.queue = @($State.queue | Select-Object -Skip 1); Save-State
        $script:Warned = $false
      } catch {
        $msg = "$_"
        Log "Failed: $($job.path): $msg"
        if ($msg -like 'File is gone*' -or $msg -like 'File is larger*') {
          Notify 'Exam Corner ⚠️' $msg 'Warning'
          $State.queue = @($State.queue | Select-Object -Skip 1); Save-State
        } else {
          $script:RetryAt = (Get-Date).AddMinutes(2)
          if (-not $script:Warned) { Notify 'Exam Corner ⚠️' 'Upload नहीं हुआ (internet?). हर 2 मिनट में फिर कोशिश होगी।' 'Warning'; $script:Warned = $true }
        }
        break
      }
    }
  } catch { Log "Error: $_" }
  finally { $script:Busy = $false }
}

if ($Once) { Tick; $Tray.Visible = $false; exit }

$Timer = New-Object System.Windows.Forms.Timer
$Timer.Interval = [Math]::Max(5, [int]$Cfg.checkEverySeconds) * 1000
$Timer.Add_Tick({ Tick })
$Timer.Start()
Notify 'Exam Corner Sync' 'चालू है। Downloads में नई PDF आते ही website पर जाएगी।'
Tick
[System.Windows.Forms.Application]::Run()
$Tray.Visible = $false
$Tray.Dispose()
