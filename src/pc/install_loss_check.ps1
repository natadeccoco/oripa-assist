# 承認のないロスのチェックを、毎晩22時（念のため23:30にもう一度）に動くよう登録する
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ps1 = Join-Path $here 'loss_check.ps1'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
$arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ps1`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg -WorkingDirectory $here
$triggers = @((New-ScheduledTaskTrigger -Daily -At 22:00), (New-ScheduledTaskTrigger -Daily -At 23:30))
Register-ScheduledTask -TaskName 'MycaLossCheck' -Action $action -Trigger $triggers -Settings $settings -Description 'マイカのロス→承認のないロスをLINE WORKSの「ロス申請」グループに警告（22:00・23:30）' -Force | Out-Null
Write-Host '登録しました: MycaLossCheck（毎晩22:00・23:30）'
Write-Host 'ためしに今1回動かします…'
& powershell -NoProfile -ExecutionPolicy Bypass -File $ps1
Write-Host ''
Write-Host '終わりました。この画面は閉じて大丈夫です。'
Read-Host 'Enterで閉じる'
