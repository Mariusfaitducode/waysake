' Starts tower-autoupdate.ps1 without any window (a console would flash every 2 minutes otherwise).
' Used by the "WaysakeAutoUpdate" scheduled task. Argument: the data folder (e.g. C:/Atlas).
Dim data
data = "C:/Atlas"
If WScript.Arguments.Count > 0 Then data = WScript.Arguments(0)
WScript.Quit CreateObject("WScript.Shell").Run("powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""C:\Atlas-app\scripts\tower-autoupdate.ps1"" -Data """ & data & """", 0, True)
