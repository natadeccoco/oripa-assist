# 販売値付けの「1時間ルール」チェックを、毎晩22:20（念のため23:50にもう一度）に動くよう登録する
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ps1 = Join-Path $here 'nezuke_check.ps1'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
$arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ps1`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg -WorkingDirectory $here
$triggers = @((New-ScheduledTaskTrigger -Daily -At 22:20), (New-ScheduledTaskTrigger -Daily -At 23:50))
Register-ScheduledTask -TaskName 'MycaNezukeCheck' -Action $action -Trigger $triggers -Settings $settings -Description '満額3万円以上の買取を1時間以内に値付けしたか確認し、していなければ役員の販売警告グループに知らせる（22:20・23:50）' -Force | Out-Null
Write-Host '登録しました: MycaNezukeCheck（毎晩22:20・23:50）'
Write-Host 'ためしに今1回動かします（今日の分・確認だけで警告は送りません）…'
& powershell -NoProfile -ExecutionPolicy Bypass -File $ps1 -Dry
Write-Host ''
Write-Host '終わりました。この画面は閉じて大丈夫です。'
Read-Host 'Enterで閉じる'
