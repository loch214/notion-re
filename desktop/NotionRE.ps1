# Notion(RE) desktop launcher.
# Opening the app starts the local server (hidden) and opens the app in its own window.
# Closing the window keeps a tray icon (like Notion minimising to the tray); "Exit" in the
# tray menu stops the server and closes the window. The server stays on localhost only.

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$Root = Split-Path $PSScriptRoot -Parent
$Port = 5179
$Url = "http://localhost:$Port/"
$AppProfile = Join-Path $env:LOCALAPPDATA 'NotionRE\browser'

function Find-Browser {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
  return $null
}

function Open-Window {
  $browser = Find-Browser
  $browserArgs = @("--app=$Url", "--user-data-dir=`"$AppProfile`"", '--window-size=1400,900', '--no-first-run', '--no-default-browser-check')
  Start-Process -FilePath $browser -ArgumentList $browserArgs | Out-Null
}

# A second launch only opens the window again.
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'NotionRE-Launcher', [ref]$created)
if (-not $created) { Open-Window; exit }

function Test-Server {
  try { return (Invoke-WebRequest -Uri "${Url}api/workspace" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { return $false }
}

function Get-Newest($dirs) {
  $newest = [datetime]::MinValue
  foreach ($d in $dirs) {
    Get-ChildItem -Path (Join-Path $Root $d) -Recurse -File | ForEach-Object { if ($_.LastWriteTime -gt $newest) { $newest = $_.LastWriteTime } }
  }
  return $newest
}

$vite = Join-Path $Root 'node_modules\vite\bin\vite.js'
$server = $null
if (-not (Test-Server)) {
  # Rebuild when the code changed since the last build.
  $dist = Join-Path $Root 'dist\index.html'
  if (-not (Test-Path $dist) -or (Get-Item $dist).LastWriteTime -lt (Get-Newest @('src', 'shared'))) {
    Start-Process -FilePath 'node' -ArgumentList "`"$vite`" build" -WorkingDirectory $Root -WindowStyle Hidden -Wait | Out-Null
  }
  $server = Start-Process -FilePath 'node' -ArgumentList "`"$vite`" preview --port $Port --strictPort" -WorkingDirectory $Root -WindowStyle Hidden -PassThru
  for ($i = 0; $i -lt 100 -and -not (Test-Server); $i++) { Start-Sleep -Milliseconds 150 }
}

Open-Window

# Our own tray icon: a dark rounded square with a white N.
$bmp = New-Object System.Drawing.Bitmap 32, 32
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'
$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 32, 32, 32))), 1, 1, 30, 30)
$font = New-Object System.Drawing.Font('Segoe UI', 17, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = 'Center'
$fmt.LineAlignment = 'Center'
$g.DrawString('N', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF(0, 1, 32, 32)), $fmt)
$g.Dispose()
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())

$iconFile = Join-Path $PSScriptRoot 'icon.ico'
if (-not (Test-Path $iconFile)) {
  $fs = [System.IO.File]::Create($iconFile)
  $icon.Save($fs)
  $fs.Close()
}

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = $icon
$tray.Text = 'Notion(RE)'
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$open = $menu.Items.Add('Open Notion(RE)')
$open.Font = New-Object System.Drawing.Font($open.Font, [System.Drawing.FontStyle]::Bold)
$open.add_Click({ Open-Window })
[void]$menu.Items.Add('-')
$exit = $menu.Items.Add('Exit')
$exit.add_Click({
  # Close the app window(s), stop the server we started (and Claude Code under it), then quit.
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe' or Name='msedge.exe'" |
    Where-Object { $_.CommandLine -like '*NotionRE\browser*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  if ($server -and -not $server.HasExited) { & taskkill /pid $server.Id /T /F | Out-Null }
  $tray.Visible = $false
  $tray.Dispose()
  [System.Windows.Forms.Application]::Exit()
})
$tray.ContextMenuStrip = $menu
$tray.add_MouseClick({ param($s, $e) if ($e.Button -eq 'Left') { Open-Window } })
$tray.Visible = $true

[System.Windows.Forms.Application]::Run()
$mutex.ReleaseMutex()
