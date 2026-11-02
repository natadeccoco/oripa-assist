# マイカの最新在庫をeBay出品ツールへ送る（CSVアップロードの代わり）  ※Windows PowerShell 5.1 以上
# マイカのログインは同じフォルダの config.json（MYCA_EMAIL / MYCA_PASSWORD）を使う
# 合言葉は初回にこのPCで作り ebay_stock_key.txt に保存する
# 手で試す: powershell -ExecutionPolicy Bypass -File ebay_stock.ps1
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$logFile = Join-Path $here 'log.txt'
$EBAY_URL = 'https://script.google.com/macros/s/AKfycbwRTgFmVWAZdwpHO0E9GTF8rebmNEZ8yfrdF2Hi0pDWE5NYXPW3UwyfU49SevycPcIJ/exec'
function Log($m) {
  $line = "{0} [eBay在庫] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m; Write-Host $line
  for ($k = 0; $k -lt 10; $k++) { try { Add-Content -Path $logFile -Value $line -Encoding UTF8 -ErrorAction Stop; break } catch { Start-Sleep -Milliseconds 300 } }
}
$lockFile = Join-Path $here 'running_ebay_stock.lock'
if ((Test-Path $lockFile) -and (((Get-Date) - (Get-Item $lockFile).LastWriteTime).TotalMinutes -lt 30)) { Log 'skip: 実行中'; exit 0 }
Set-Content -Path $lockFile -Value (Get-Date -Format 's')
try {
  $cfg = Get-Content (Join-Path $here 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($k in 'MYCA_EMAIL','MYCA_PASSWORD') { if (-not $cfg.$k) { throw "config.json に $k がありません" } }
  $keyFile = Join-Path $here 'ebay_stock_key.txt'
  if (-not (Test-Path $keyFile)) { Set-Content -Path $keyFile -Value (([guid]::NewGuid().ToString('N')) + ([guid]::NewGuid().ToString('N'))) -Encoding ASCII }
  $KEY = (Get-Content $keyFile -Raw).Trim()
  function PostGas($obj) {
    $body = $obj | ConvertTo-Json -Depth 6 -Compress
    $r = Invoke-WebRequest -Uri $EBAY_URL -Method POST -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'text/plain;charset=utf-8' -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 280
    return ([System.Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json)
  }
  $BASE = 'https://pos.mycalinks.com'
  $STORE_IDS = @{ '柏店'=322; '津田沼店'=323; '松戸店'=324; '横浜店'=325; '中野店'=326; '町田店'=327; '千葉中央店'=328; 'お台場店'=409 }
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
  $csrf = (GetJson '/api/auth/csrf').csrfToken
  $body = @{ csrfToken=$csrf; email=$cfg.MYCA_EMAIL; password=$cfg.MYCA_PASSWORD; mode='admin'; json='true'; callbackUrl="$BASE/auth" }
  try { Invoke-WebRequest -Uri "$BASE/api/auth/callback/credentials" -TimeoutSec 60 -Method POST -Body $body -ContentType 'application/x-www-form-urlencoded' -WebSession $s -Headers $hdr -MaximumRedirection 0 -UseBasicParsing | Out-Null } catch { }
  $ok = $false; foreach ($c in $s.Cookies.GetCookies($BASE)) { if ($c.Name -match 'session-token') { $ok = $true } }
  if (-not $ok) { throw 'マイカにログインできませんでした' }

  $act = PostGas ([ordered]@{ action='stock'; key=$KEY; list=$true })
  if (-not $act.ok) { throw "対象店舗を取得できませんでした: $($act.error)" }
  $failed = $false
  foreach ($name in $act.stores) {
    $sid = $STORE_IDS[[string]$name]
    if (-not $sid) { Log "$name : マイカの店舗IDが不明"; $failed = $true; continue }
    $items = New-Object System.Collections.ArrayList
    for ($skip = 0; ; $skip += 500) {
      $j = GetJson "/api/store/$sid/product?is_active=true&is_consignment_product=false&stock_number_gte=1&take=500&skip=$skip"
      $list = @($j.products)
      foreach ($p in $list) {
        if (-not $p) { continue }
        $price = 0; foreach ($pv in @($p.specific_sell_price, $p.sell_price, $p.actual_sell_price, $p.item_sell_price)) { if ($pv -and [double]$pv -gt 0) { $price = $pv; break } }
        [void]$items.Add([ordered]@{ id=[string]$p.id; name=[string]$p.display_name; condition=[string]$p.condition_option_display_name; specialty=[string]$p.specialty__display_name
          category=[string]$p.item_category_display_name; expansion=[string]$p.item_expansion; cardnumber=[string]$p.item_cardnumber; rarity=[string]$p.item_rarity; pack=[string]$p.item_pack_name
          price=$price; stock=$p.stock_number; mycaId=[string]$p.item_myca_item_id; cost=$p.average_wholesale_price })
      }
      if ($list.Count -lt 500) { break }
      Start-Sleep -Milliseconds 150
    }
    $res = PostGas ([ordered]@{ action='stock'; key=$KEY; store=[string]$name; items=$items.ToArray() })
    if ($res.ok) { Log "$name : $($res.count) 件を反映" } else { Log "$name : 反映できず（$($res.error)）"; $failed = $true }
  }
  if ($failed) { exit 1 }
} catch {
  Log "ERROR: $($_.Exception.Message)"; exit 1
} finally { Remove-Item $lockFile -Force -ErrorAction SilentlyContinue }
