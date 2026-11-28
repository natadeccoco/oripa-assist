# 販売値付けの「1時間ルール」チェック（毎晩22:20・23:50）  ※Windows PowerShell 5.1 以上
# 今日の全店の買取から、満額（状態Aの販売価格）3万円以上のカードを本部に送る → 本部が「販売値付け」の記録と照らし、
# 買取から1時間以内に値付けしていないものを役員の「販売警告」グループに知らせる（同じものは1回だけ）
# 設定は同じフォルダの config.json（MYCA_EMAIL / MYCA_PASSWORD / LOSS_GAS_URL / LOSS_KEY）  ※ロスのチェックと同じ本部の受け口・合言葉を使う
# 手で試す: powershell -ExecutionPolicy Bypass -File nezuke_check.ps1        … 今日の分
#           powershell -ExecutionPolicy Bypass -File nezuke_check.ps1 -Dry   … 送るだけで警告しない（確認用）
param([switch]$Dry)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$logFile = Join-Path $here 'log.txt'
function Log($m) {
  $line = "{0} [値付けチェック] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m; Write-Host $line
  for ($k = 0; $k -lt 10; $k++) { try { Add-Content -Path $logFile -Value $line -Encoding UTF8 -ErrorAction Stop; break } catch { Start-Sleep -Milliseconds 300 } }
}
$lockFile = Join-Path $here 'running_nezuke.lock'
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
  function PostGas($obj) {
    $payload = $obj | ConvertTo-Json -Depth 8 -Compress
    $r = Invoke-WebRequest -Uri $cfg.LOSS_GAS_URL -Method POST -Body ([System.Text.Encoding]::UTF8.GetBytes($payload)) -ContentType 'text/plain;charset=utf-8' -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 300
    $txt = [System.Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
    $j = $txt | ConvertFrom-Json
    if (-not $j.ok) { throw "本部の受け口: $txt" }
    return $j
  }
  # ---- ログイン（myca_import.ps1 と同じ） ----
  $csrf = (GetJson '/api/auth/csrf').csrfToken
  $body = @{ csrfToken=$csrf; email=$cfg.MYCA_EMAIL; password=$cfg.MYCA_PASSWORD; mode='admin'; json='true'; callbackUrl="$BASE/auth" }
  try { Invoke-WebRequest -Uri "$BASE/api/auth/callback/credentials" -TimeoutSec 60 -Method POST -Body $body -ContentType 'application/x-www-form-urlencoded' -WebSession $s -Headers $hdr -MaximumRedirection 0 -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null } catch { }
  $ok = $false; foreach ($c in $s.Cookies.GetCookies($BASE)) { if ($c.Name -match 'session-token') { $ok = $true } }
  if (-not $ok) { throw 'マイカにログインできませんでした' }

  # ---- 今日の完了した買取 → 1万円以上で買ったカードだけ、マイカで満額（sell_price）を調べる ----
  $since = (Get-Date).Date
  $a = [uri]::EscapeDataString($since.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.000Z'))
  $b = [uri]::EscapeDataString((Get-Date).Date.AddDays(1).AddSeconds(-1).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.000Z'))
  $lines = New-Object System.Collections.ArrayList
  $fullCache = @{}
  foreach ($name in $STORE_IDS.Keys) {
    $sid = $STORE_IDS[$name]; $skip = 0
    while ($true) {
      $r = GetJson "/api/store/$sid/transaction?status=completed&transaction_kind=buy&finishedAtStart=$a&finishedAtEnd=$b&take=500&skip=$skip&orderBy=-finished_at"
      $txs = @($r.transactions | Where-Object { $_ })
      foreach ($t in $txs) {
        if ($t.is_return) { continue }
        foreach ($c in @($t.transaction_carts | Where-Object { $_ })) {
          if ([int]$c.unit_price -lt 10000 -or [string]$c.product_category_name -eq 'ボックス') { continue }
          $pk = "$sid-$($c.product_id)"
          if (-not $fullCache.ContainsKey($pk)) { $f = 0; try { $p = GetJson "/api/store/$sid/product?id=$($c.product_id)"; $f = [int](@($p.products)[0].sell_price) } catch { }; $fullCache[$pk] = $f; Start-Sleep -Milliseconds 100 }
          if ($fullCache[$pk] -lt 30000) { continue }
          $nm = [string]$(if ($c.product__displayNameWithMeta) { $c.product__displayNameWithMeta } else { $c.product_name })
          [void]$lines.Add([ordered]@{ store = $name; tx = [string]$t.id; rec = [string]$t.reception_number; at = [string]$t.finished_at; pid = [string]$c.product_id; name = $nm; full = $fullCache[$pk]; cnt = [int]$c.item_count })
        }
      }
      if ($txs.Count -lt 500) { break }; $skip += 500
    }
    Start-Sleep -Milliseconds 150
  }
  if ($lines.Count -eq 0) { Log '満額3万円以上の買取 0件'; exit 0 }
  $j = PostGas ([ordered]@{ action='nzcheck'; key=[string]$cfg.LOSS_KEY; dry=[bool]$Dry; lines=$lines.ToArray() })
  Log "満額3万円以上 $($lines.Count) 行 → 1時間以内に値付けしていない $($j.warned) 行$(if ($Dry) { '（確認だけ・警告なし）' })"
} catch {
  Log "ERROR: $($_.Exception.Message)"; exit 1
} finally { Remove-Item $lockFile -Force -ErrorAction SilentlyContinue }
