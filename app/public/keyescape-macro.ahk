#Requires AutoHotkey v2.0
#SingleInstance Force
CoordMode "Mouse", "Screen"
SetWorkingDir A_ScriptDir

/*
    키이스케이프 반자동 매크로
    ────────────────────────────────────────────────
    F8   활성 / 비활성          (평소엔 비활성)
    F7   목표 URL · 시각 설정
    F9   현재 마우스 위치를 순서에 추가
    F11  순서 되감기 (처음부터)
    F12  저장된 위치 전부 삭제
    ESC  종료

    활성 상태에서 우클릭 = 저장된 위치를 순서대로 하나씩 클릭
    목표 시각이 되면 지정한 URL 로 강제 이동 (1회)

    ※ 클릭은 화면 좌표 기준이다. 창 크기·스크롤·슬롯 개수가
      달라지면 엉뚱한 곳을 누른다. 오픈 직전에 다시 기록할 것.
*/

CFG := A_ScriptDir "\keyescape.ini"

TargetURL  := IniRead(CFG, "main", "url", "https://www.keyescape.com/reservation1.php?zizum_num=20&theme_num=95&theme_info_num=83")
TargetTime := IniRead(CFG, "main", "time", "10:00:00")

active := false
fired  := false
idx    := 1
spots  := []

LoadSpots()

; ─────────── 상태창 ───────────
g := Gui("+AlwaysOnTop +ToolWindow", "KE 매크로")
g.BackColor := "1A1C22"
g.SetFont("s10 cE8E4DA", "Malgun Gothic")
txtState := g.Add("Text", "w250 h22", "비활성")
g.SetFont("s9 c858B99")
txtTime  := g.Add("Text", "w250 h18", "")
txtSpots := g.Add("Text", "w250 h18", "")
g.SetFont("s8 c5A6070")
g.Add("Text", "w250 h50", "F8 활성  F7 설정  F9 위치추가`nF11 되감기  F12 전체삭제  ESC 종료`n활성 중 우클릭 = 다음 위치 클릭")
g.Show("x20 y20 NoActivate")

SetTimer Paint, 200
SetTimer CheckTime, 20

; ─────────── 단축키 ───────────
F8:: {
    global active, fired, idx
    active := !active
    fired := false
    idx := 1
    Paint()
}

F7:: {
    global TargetURL, TargetTime, CFG
    u := InputBox("이동할 주소", "목표 URL", "w620 h130", TargetURL)
    if (u.Result = "OK" && u.Value != "") {
        TargetURL := u.Value
        IniWrite TargetURL, CFG, "main", "url"
    }
    t := InputBox("HH:MM:SS 형식", "목표 시각", "w300 h130", TargetTime)
    if (t.Result = "OK" && t.Value != "") {
        TargetTime := t.Value
        IniWrite TargetTime, CFG, "main", "time"
    }
    Paint()
}

F9:: {
    global spots
    MouseGetPos(&mx, &my)
    spots.Push({ x: mx, y: my })
    SaveSpots()
    Flash(spots.Length . "번째 위치 저장 (" . mx . ", " . my . ")")
    Paint()
}

F11:: {
    global idx
    idx := 1
    Flash("순서를 처음으로 되감았습니다")
    Paint()
}

F12:: {
    global spots, idx
    spots := []
    idx := 1
    SaveSpots()
    Flash("저장된 위치를 모두 지웠습니다")
    Paint()
}

Esc::ExitApp

; 활성 상태에서만 우클릭을 가로챈다
#HotIf active
RButton:: PlayNext()
#HotIf

; ─────────── 동작 ───────────
PlayNext() {
    global spots, idx
    if (spots.Length = 0) {
        Flash("저장된 위치가 없습니다 · F9 로 기록하세요")
        return
    }
    if (idx > spots.Length) {
        Flash("순서 끝 · F11 로 되감기")
        return
    }
    p := spots[idx]
    MouseMove(p.x, p.y, 0)
    Click()
    idx++
    Paint()
}

CheckTime() {
    global active, fired, TargetTime
    if (!active || fired)
        return
    now := Format("{:02}:{:02}:{:02}", A_Hour, A_Min, A_Sec)
    if (now = TargetTime) {
        fired := true
        GoToURL()
    }
}

GoToURL() {
    global TargetURL
    hwnd := WinExist("ahk_exe chrome.exe")
    if (!hwnd)
        hwnd := WinExist("ahk_exe msedge.exe")
    if (!hwnd)
        hwnd := WinExist("ahk_exe whale.exe")
    if (!hwnd) {
        Flash("브라우저 창을 못 찾았습니다")
        return
    }

    WinActivate hwnd
    WinWaitActive hwnd, , 1

    if (TargetURL = "") {
        Send "{F5}"
        Flash("새로고침")
        return
    }

    ; 주소 입력은 타이핑보다 붙여넣기가 훨씬 빠르다
    old := ClipboardAll()
    A_Clipboard := TargetURL
    Send "^l"
    Sleep 25
    Send "^v"
    Sleep 15
    Send "{Enter}"
    SetTimer(() => (A_Clipboard := old), -800)
    Flash("이동했습니다")
}

; ─────────── 보조 ───────────
LoadSpots() {
    global spots, CFG
    raw := IniRead(CFG, "spots", "list", "")
    spots := []
    for pair in StrSplit(raw, ";") {
        if (pair = "")
            continue
        xy := StrSplit(pair, ",")
        if (xy.Length = 2)
            spots.Push({ x: Integer(xy[1]), y: Integer(xy[2]) })
    }
}

SaveSpots() {
    global spots, CFG
    out := ""
    for p in spots
        out .= p.x . "," . p.y . ";"
    IniWrite out, CFG, "spots", "list"
}

SecondsLeft() {
    global TargetTime
    parts := StrSplit(TargetTime, ":")
    if (parts.Length < 3)
        return -1
    tgt := Integer(parts[1]) * 3600 + Integer(parts[2]) * 60 + Integer(parts[3])
    cur := A_Hour * 3600 + A_Min * 60 + A_Sec
    d := tgt - cur
    if (d < 0)
        d += 86400
    return d
}

Paint() {
    global active, idx, spots, TargetTime, TargetURL
    txtState.Value := active ? "● 활성" : "○ 비활성"
    txtState.Opt(active ? "cC9922E" : "c858B99")

    d := SecondsLeft()
    txtTime.Value := TargetTime . "  까지  "
        . Format("{:02}:{:02}:{:02}", d // 3600, Mod(d, 3600) // 60, Mod(d, 60))

    txtSpots.Value := "위치 " . spots.Length . "개 · 다음 "
        . (idx > spots.Length ? "없음" : idx . "번")
}

Flash(t) {
    ToolTip t
    SetTimer(() => ToolTip(), -1600)
}
