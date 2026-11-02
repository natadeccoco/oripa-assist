# eBay用のマイカ在庫取得を、毎日10:00〜22:00の30分おきに動くよう登録する
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ps1 = Join-Path $here 'ebay_stock.ps1'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 25) -MultipleInstances IgnoreNew
$arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ps1`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg -WorkingDirectory $here
$trigger = New-ScheduledTaskTrigger -Daily -At 10:00
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At 10:00 -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Hours 12)).Repetition
Register-ScheduledTask -TaskName 'MycaEbayStock' -Action $action -Trigger $trigger -Settings $settings -Description 'マイカの在庫をeBay出品ツールへ送る' -Force | Out-Null
Write-Host '登録しました: MycaEbayStock（毎日10:00〜22:00の30分おき）'
Write-Host 'ためしに今1回動かします…'
& powershell -NoProfile -ExecutionPolicy Bypass -File $ps1
Write-Host ''
Write-Host '終わりました。この画面は閉じて大丈夫です。'
Read-Host 'Enterで閉じる'
