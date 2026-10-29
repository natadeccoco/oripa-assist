# 全店の買取 → 買取表より高く買った行を「買取表チェック（全店）」スプレッドシートにためる（毎晩22:10・23:40）  ※Windows PowerShell 5.1 以上
# 設定は同じフォルダの config.json（MYCA_EMAIL / MYCA_PASSWORD / LOSS_GAS_URL / LOSS_KEY）  ※ロスのチェックと同じ本部の受け口・合言葉を使う
# 手で試す: powershell -ExecutionPolicy Bypass -File kaitori_check.ps1            … 今日の分
#           powershell -ExecutionPolicy Bypass -File kaitori_check.ps1 -DaysBack 1 … 昨日から（※買取表は「今の価格」で照らすので、前の日の分は参考）
#   ※同じ明細は2回書かない（本部側で覚えている）。何回実行しても大丈夫
param([int]$DaysBack = 0)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$logFile = Join-Path $here 'log.txt'
function Log($m) {
  $line = "{0} [買取表チェック] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m; Write-Host $line
  for ($k = 0; $k -lt 10; $k++) { try { Add-Content -Path $logFile -Value $line -Encoding UTF8 -ErrorAction Stop; break } catch { Start-Sleep -Milliseconds 300 } }
}
$lockFile = Join-Path $here 'running_kaitori.lock'
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

  # ---- 対象：今日（-DaysBack で前の日から）の完了した買取 ----
  $since = (Get-Date).Date.AddDays(-$DaysBack)
  $a = [uri]::EscapeDataString($since.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.000Z'))
  $b = [uri]::EscapeDataString((Get-Date).Date.AddDays(1).AddSeconds(-1).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.000Z'))
  $lines = New-Object System.Collections.ArrayList
  $byKey = @{}
  $nTx = 0
  foreach ($name in $STORE_IDS.Keys) {
    $sid = $STORE_IDS[$name]; $skip = 0
    while ($true) {
      $r = GetJson "/api/store/$sid/transaction?status=completed&transaction_kind=buy&finishedAtStart=$a&finishedAtEnd=$b&take=500&skip=$skip&orderBy=-finished_at"
      $txs = @($r.transactions | Where-Object { $_ })
      foreach ($t in $txs) {
        $nTx++; $i = 0
        foreach ($c in @($t.transaction_carts | Where-Object { $_ })) {
          $nm = [string]$(if ($c.product__displayNameWithMeta) { $c.product__displayNameWithMeta } else { $c.product_name })
          $l = [ordered]@{ k = "$($t.id)-$i"; store = $name; tx = [string]$t.id; rec = [string]$t.reception_number; at = [string]$t.finished_at
            name = $nm; pname = [string]$c.product_name; no = [string]$c.product__item__cardnumber; exp = [string]$c.product__item__expansion
            rar = [string]$c.product__item__rarity; cat = [string]$c.product_category_name; unit = [int]$c.unit_price; cnt = [int]$c.item_count }
          [void]$lines.Add($l); $byKey[$l.k] = @{ l = $l; sid = $sid; pid = $c.product_id; cid = $t.customer_id }
          $i++
        }
      }
      if ($txs.Count -lt 500) { break }; $skip += 500
    }
    Start-Sleep -Milliseconds 150
  }
  if ($lines.Count -eq 0) { Log "買取 0件（$($since.ToString('M/d'))〜）"; exit 0 }

  # ---- 1回目：本部で買取表と照らし合わせて、高く買った行のキーをもらう ----
  $j = PostGas ([ordered]@{ action='kaitori'; kind='dailyjudge'; key=[string]$cfg.LOSS_KEY; lines=$lines.ToArray() })
  $hits = @($j.hits | Where-Object { $_ })

  # ---- 該当行だけ、状態（商品の状態）とお客様名（カナ）を付ける ----
  $condCache = @{}; $custCache = @{}
  $out = New-Object System.Collections.ArrayList
  foreach ($k in $hits) {
    $x = $byKey[$k]; if (-not $x) { continue }
    $pk = "$($x.sid)-$($x.pid)"
    if (-not $condCache.ContainsKey($pk)) { $cond = ''; try { $p = GetJson "/api/store/$($x.sid)/product?id=$($x.pid)"; $cond = [string](@($p.products)[0].condition_option_display_name) } catch { }; $condCache[$pk] = $cond; Start-Sleep -Milliseconds 100 }
    $cust = ''
    if ($x.cid) {
      $ck = "$($x.sid)-$($x.cid)"
      if (-not $custCache.ContainsKey($ck)) { $n = ''; try { $cs = GetJson "/api/store/$($x.sid)/customer?id=$($x.cid)"; $n = [string](@($cs)[0].full_name_ruby) } catch { }; $custCache[$ck] = $n; Start-Sleep -Milliseconds 100 }
      $cust = $custCache[$ck]
    }
    $l = $x.l; $l['cond'] = $condCache[$pk]; $l['cust'] = $cust
    [void]$out.Add($l)
  }
  $w = 0
  if ($out.Count -gt 0) { $j2 = PostGas ([ordered]@{ action='kaitori'; kind='dailywrite'; key=[string]$cfg.LOSS_KEY; lines=$out.ToArray() }); $w = $j2.written }
  Log "買取 $nTx 件・明細 $($lines.Count) 行（$($since.ToString('M/d'))〜）→ 買取表より高い $($hits.Count) 行、新しく書いた $w 行"
} catch {
  Log "ERROR: $($_.Exception.Message)"; exit 1
} finally { Remove-Item $lockFile -Force -ErrorAction SilentlyContinue }
