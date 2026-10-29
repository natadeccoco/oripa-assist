# マイカのロス → 「ロス申請」の承認と照らし合わせ、承認のないロスをLINE WORKSに警告（毎晩22時）  ※Windows PowerShell 5.1 以上
# 設定は同じフォルダの config.json（MYCA_EMAIL / MYCA_PASSWORD / LOSS_GAS_URL / LOSS_KEY / LOSS_CHECK_FROM）
# 手で試す: powershell -ExecutionPolicy Bypass -File loss_check.ps1
#   ※同じロスは2回警告しない（本部側で覚えている）。何回実行しても大丈夫
param([int]$DaysBack = 2)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$logFile = Join-Path $here 'log.txt'
function Log($m) {
  $line = "{0} [ロス] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m; Write-Host $line
  for ($k = 0; $k -lt 10; $k++) { try { Add-Content -Path $logFile -Value $line -Encoding UTF8 -ErrorAction Stop; break } catch { Start-Sleep -Milliseconds 300 } }
}
$lockFile = Join-Path $here 'running_loss.lock'
if ((Test-Path $lockFile) -and (((Get-Date) - (Get-Item $lockFile).LastWriteTime).TotalMinutes -lt 30)) { Log 'skip: 実行中'; exit 0 }
Set-Content -Path $lockFile -Value (Get-Date -Format 's')
try {
  $cfg = Get-Content (Join-Path $here 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($k in 'MYCA_EMAIL','MYCA_PASSWORD','LOSS_GAS_URL','LOSS_KEY') { if (-not $cfg.$k) { throw "config.json に $k がありません" } }
  $BASE = 'https://pos.mycalinks.com'
  $STORE_IDS = [ordered]@{ '柏'=322; '津田沼'=323; '松戸'=324; '横浜'=325; '中野'=326; '町田'=327; '千葉中央'=328; 'お台場'=409 }
  $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $s.UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  $hdr = @{ 'Accept'='application/json, text/plain, */*' }
  function GetJson($path) {
    $last = $null
    for ($t = 1; $t -le 3; $t++) {
      try {
        $r = Invoke-WebRequest -Uri ($BASE + $path) -WebSession $s -Headers $hdr -UseBasicParsing -TimeoutSec 60
        return ([System.Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json)
      } catch { $last = $_.Exception.Message; Start-Sleep -Seconds (5 * $t) }
    }
    throw "$path : $last"
  }
  # ---- ログイン（myca_import.ps1 と同じ） ----
  $csrf = (GetJson '/api/auth/csrf').csrfToken
  $body = @{ csrfToken=$csrf; email=$cfg.MYCA_EMAIL; password=$cfg.MYCA_PASSWORD; mode='admin'; json='true'; callbackUrl="$BASE/auth" }
  try { Invoke-WebRequest -Uri "$BASE/api/auth/callback/credentials" -TimeoutSec 60 -Method POST -Body $body -ContentType 'application/x-www-form-urlencoded' -WebSession $s -Headers $hdr -MaximumRedirection 0 -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null } catch { }
  $ok = $false; foreach ($c in $s.Cookies.GetCookies($BASE)) { if ($c.Name -match 'session-token') { $ok = $true } }
  if (-not $ok) { throw 'マイカにログインできませんでした' }

  # ---- 対象：直近 $DaysBack 日（ただし LOSS_CHECK_FROM より前は見ない） ----
  $since = (Get-Date).Date.AddDays(-$DaysBack)
  if ($cfg.LOSS_CHECK_FROM) { $f = [datetime]::ParseExact([string]$cfg.LOSS_CHECK_FROM, 'yyyy-MM-dd', $null); if ($f -gt $since) { $since = $f } }
  $sinceUtc = $since.ToUniversalTime()
  $stores = New-Object System.Collections.ArrayList
  $total = 0
  foreach ($name in $STORE_IDS.Keys) {
    $list = @(GetJson "/api/store/$($STORE_IDS[$name])/loss")
    $rows = New-Object System.Collections.ArrayList
    foreach ($L in $list) {
      if (-not $L -or -not $L.created_at) { continue }
      $ca = [datetime]::Parse([string]$L.created_at, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal)
      if ($ca -lt $sinceUtc) { continue }
      $prods = @($L.products | Where-Object { $_ } | ForEach-Object { [ordered]@{ name = [string]$(if ($_.product.displayNameWithMeta) { $_.product.displayNameWithMeta } else { $_.product.display_name }); count = [int]$_.item_count } })
      [void]$rows.Add([ordered]@{ id = [string]$L.id; created_at = [string]$L.created_at; reason = [string]$L.reason; genre = [string]$L.loss_genre.display_name
        count = [int]$L.total_item_count; total = [int]$L.total_sell_price; staff = [string]$L.staff_account.display_name; products = $prods })
    }
    $total += $rows.Count
    [void]$stores.Add([ordered]@{ store = $name; losses = $rows.ToArray() })
    Start-Sleep -Milliseconds 150
  }
  $payload = [ordered]@{ action='losscheck'; key=[string]$cfg.LOSS_KEY; stores=$stores.ToArray() } | ConvertTo-Json -Depth 10 -Compress
  $r = Invoke-WebRequest -Uri $cfg.LOSS_GAS_URL -Method POST -Body ([System.Text.Encoding]::UTF8.GetBytes($payload)) -ContentType 'text/plain;charset=utf-8' -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 300
  $txt = [System.Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
  Log "マイカのロス $total 件（$($since.ToString('M/d'))以降）→ 本部: $($txt.Substring(0, [Math]::Min(200, $txt.Length)))"
  if ($txt -notmatch '"ok":true') { exit 1 }
} catch {
  Log "ERROR: $($_.Exception.Message)"; exit 1
} finally { Remove-Item $lockFile -Force -ErrorAction SilentlyContinue }
