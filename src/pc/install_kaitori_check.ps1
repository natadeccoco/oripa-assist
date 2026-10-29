# 全店の買取の「買取表チェック」を、毎晩22:10（念のため23:40にもう一度）に動くよう登録する
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ps1 = Join-Path $here 'kaitori_check.ps1'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
$arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ps1`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg -WorkingDirectory $here
$triggers = @((New-ScheduledTaskTrigger -Daily -At 22:10), (New-ScheduledTaskTrigger -Daily -At 23:40))
Register-ScheduledTask -TaskName 'MycaKaitoriCheck' -Action $action -Trigger $triggers -Settings $settings -Description '全店の買取→買取表より高く買った行を「買取表チェック（全店）」にためる（22:10・23:40）' -Force | Out-Null
Write-Host '登録しました: MycaKaitoriCheck（毎晩22:10・23:40）'
Write-Host 'ためしに今1回動かします（今日の分）…'
& powershell -NoProfile -ExecutionPolicy Bypass -File $ps1
Write-Host ''
Write-Host '終わりました。この画面は閉じて大丈夫です。'
Read-Host 'Enterで閉じる'
