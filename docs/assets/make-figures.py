"""Generate the illustrated figures for the DSH Skill Manager article / X post.

Every number and skill name is REAL — measured on this machine by running the
dependency-free scanner in lib/skill-model.js:

  ~/.agents/skills     146        total installations  185
  ~/.codex/skills       18        unique after dedup   153
  ~/.claude/skills      12        multi-installation    13
  ~/.gemini/skills       9        (e.g. hyperframes x4 across all four tools)

Font note: Consolas has no CJK glyphs, so any mixed Chinese/Latin line in a
terminal mock is drawn with Microsoft YaHei to avoid tofu boxes.

Run:  python docs/assets/make-figures.py
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1600, 900
BG = (13, 17, 23)
PANEL = (22, 27, 34)
DEEP = (9, 12, 17)
BORDER = (48, 54, 61)
TEXT = (230, 237, 243)
DIM = (139, 148, 158)
FAINT = (110, 118, 129)
RED = (248, 81, 73)
GREEN = (63, 185, 80)
BLUE = (88, 166, 255)
PURPLE = (163, 113, 247)

FONTS = r"C:\Windows\Fonts"
OUT = os.path.dirname(os.path.abspath(__file__))


def f(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


YAHEI, YAHEI_BD = "msyh.ttc", "msyhbd.ttc"
MONO, MONO_BD = "consola.ttf", "consolab.ttf"

FT_LABEL = f(YAHEI, 24)
FT_TITLE = f(YAHEI_BD, 46)
FT_SUB = f(YAHEI, 24)
FT_H = f(YAHEI_BD, 26)
FT_BODY = f(YAHEI, 24)
FT_SMALL = f(YAHEI, 21)
FT_TINY = f(YAHEI, 19)
FT_MIX = f(YAHEI, 22)          # mixed CJK + Latin inside terminal/composer mocks
FM = f(MONO, 23)
FM_SM = f(MONO, 20)
FM_XS = f(MONO, 17)
FM_BD = f(MONO_BD, 24)
FT_BIG = f(YAHEI_BD, 46)
F_NAV = f(YAHEI_BD, 27)
F_NAV_N = f(YAHEI, 27)


def new():
    img = Image.new("RGB", (W, H), BG)
    return img, ImageDraw.Draw(img)


def rr(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def star(d, cx, cy, r, fill):
    pts = []
    for i in range(10):
        ang = math.pi / 2 + i * math.pi / 5
        rad = r if i % 2 == 0 else r * 0.42
        pts.append((cx + rad * math.cos(ang), cy - rad * math.sin(ang)))
    d.polygon(pts, fill=fill)


def caret(d, cx, cy, w, h, fill):
    d.polygon([(cx - w, cy - h / 2), (cx + w, cy - h / 2), (cx, cy + h / 2)], fill=fill)


def fit(d, s, font, maxw):
    """Truncate with an ellipsis so text never bleeds out of its container."""
    if d.textlength(s, font=font) <= maxw:
        return s
    while s and d.textlength(s + "…", font=font) > maxw:
        s = s[:-1]
    return s + "…"


def save(img, name):
    img.save(os.path.join(OUT, name), "PNG")
    print("saved:", name, img.size)


# ============================================================
# Figure 1 — the four scattered skill directories
# ============================================================
def fig_scattered():
    img, d = new()
    d.text((60, 44), "问题", font=FT_LABEL, fill=RED)
    d.text((60, 84), "技能散落在 4 个互不相通的地方", font=FT_TITLE, fill=TEXT)
    d.text((60, 150), "每个 AI 工具各扫各的目录,谁也看不全。装的越多,越乱。", font=FT_SUB, fill=DIM)

    cards = [
        ("~/.agents/skills", "AGENTS 通用标准", 146),
        ("~/.codex/skills", "Codex", 18),
        ("~/.claude/skills", "DSH / Claude", 12),
        ("~/.gemini/skills", "Gemini", 9),
    ]
    CW, CH = 728, 186
    positions = [(60, 230), (812, 230), (60, 440), (812, 440)]
    for (path, tool, n), (x, y) in zip(cards, positions):
        rr(d, (x, y, x + CW, y + CH), 16, fill=PANEL, outline=BORDER, width=2)
        d.text((x + 28, y + 26), path, font=FM_BD, fill=BLUE)
        d.text((x + 28, y + 78), tool, font=FT_BODY, fill=DIM)
        d.text((x + CW - 28, y + 44), str(n), font=FT_BIG, fill=TEXT, anchor="ra")
        d.text((x + CW - 28, y + 104), "个技能", font=FT_TINY, fill=FAINT, anchor="ra")
        d.rounded_rectangle((x + 28, y + 132, x + 28 + int((CW - 130) * n / 146) + 10, y + 144), radius=6, fill=BLUE)

    rr(d, (60, 668, 1540, 754), 14, fill=DEEP, outline=BORDER, width=2)
    d.text((88, 696), "合计", font=FT_BODY, fill=DIM)
    d.text((160, 686), "185", font=f(YAHEI_BD, 34), fill=TEXT)
    d.text((252, 696), "处安装", font=FT_BODY, fill=DIM)
    d.text((362, 698), "→", font=FT_BODY, fill=FAINT)
    d.text((412, 696), "去重后", font=FT_BODY, fill=DIM)
    d.text((524, 686), "153", font=f(YAHEI_BD, 34), fill=GREEN)
    d.text((626, 696), "个唯一技能", font=FT_BODY, fill=DIM)
    d.text((1512, 696), "同一个技能最多装了 4 份", font=FT_SMALL, fill=FAINT, anchor="ra")
    d.text((60, 800), "这就是「装了却用不了」的根源:技能在,但没人把它们汇总起来。", font=FT_BODY, fill=FAINT)
    save(img, "fig1-scattered.png")


# ============================================================
# Figure 2 — the symptom: on disk, but not in the conversation
# ============================================================
def fig_symptom():
    img, d = new()
    d.text((60, 44), "症状", font=FT_LABEL, fill=RED)
    d.text((60, 84), "硬盘上有,对话里却没有", font=FT_TITLE, fill=TEXT)

    rr(d, (60, 168, 1540, 424), 16, fill=PANEL, outline=BORDER, width=2)
    d.ellipse((88, 194, 102, 208), fill=GREEN)
    d.text((118, 186), "第一步:先数一数你到底装了多少", font=FT_H, fill=TEXT)
    d.line((60, 228, 1540, 228), fill=BORDER, width=2)
    rr(d, (88, 250, 1512, 344), 10, fill=DEEP)
    d.text((110, 268), "$", font=FM, fill=GREEN)
    d.text((134, 268), "ls ~/.claude/skills ~/.codex/skills ~/.gemini/skills ~/.agents/skills 2>/dev/null | wc -l", font=FM, fill=(200, 209, 217))
    d.text((110, 304), "185", font=FM_BD, fill=TEXT)
    d.text((88, 372), "硬盘上确实有 185 个技能。它们都在,没有被删。", font=FT_BODY, fill=DIM)

    rr(d, (60, 460, 1540, 764), 16, fill=PANEL, outline=(110, 47, 44), width=2)
    d.ellipse((88, 486, 102, 500), fill=RED)
    d.text((118, 478), "第二步:在对话里用一下", font=FT_H, fill=TEXT)
    d.line((60, 520, 1540, 520), fill=(110, 47, 44), width=2)
    rr(d, (88, 542, 1512, 668), 10, fill=DEEP)
    d.text((110, 562), ">", font=FM, fill=BLUE)
    d.text((136, 560), "用 lark-doc 帮我建个会议纪要文档", font=FT_MIX, fill=(200, 209, 217))
    d.text((110, 608), 'skill "lark-doc" is unknown or no longer available', font=FM, fill=RED)
    d.text((88, 694), "技能明明躺在硬盘上,技能注册表里却没有它 —— 所以等于不存在。", font=FT_BODY, fill=DIM)
    save(img, "fig2-symptom.png")


# ============================================================
# Figure 3 — the skill library panel (the solution)
# ============================================================
def fig_panel():
    img, d = new()
    rr(d, (30, 30, 1570, 870), 18, fill=PANEL, outline=BORDER, width=2)

    # toolbar
    d.text((60, 52), "技能库", font=f(YAHEI_BD, 32), fill=TEXT)
    d.text((60, 94), "全机器技能 · 已去重 · 按分类", font=FT_TINY, fill=FAINT)

    rr(d, (620, 60, 860, 106), 9, fill=DEEP, outline=BORDER, width=1)
    d.text((636, 72), "搜索技能…", font=FT_TINY, fill=FAINT)
    rr(d, (876, 60, 986, 106), 9, fill=DEEP, outline=BORDER, width=1)
    d.text((892, 72), "来源", font=FT_TINY, fill=DIM)
    caret(d, 966, 82, 7, 8, FAINT)

    bx = 1060
    for label, w in [("刷新", 84), ("添加", 84), ("分类", 84), ("回收站", 96), ("导出", 84)]:
        rr(d, (bx, 60, bx + w, 106), 9, fill=DEEP, outline=BORDER, width=1)
        d.text((bx + w / 2, 74), label, font=FT_TINY, fill=DIM, anchor="ma")
        bx += w + 12
    d.line((30, 132, 1570, 132), fill=BORDER, width=2)

    # sidebar
    cats = [("全部技能", 153, True), ("未分类", 67, False), ("飞书办公 / Lark", 27, False),
            ("视频与动画", 18, False), ("前端与设计", 14, False), ("Cloudflare / 云平台", 10, False),
            ("技能管理", 8, False), ("开发方法论", 8, False), ("Office 文档", 1, False)]
    y = 160
    for label, n, active in cats:
        if active:
            rr(d, (50, y, 350, y + 46), 9, fill=(28, 45, 66))
        d.text((70, y + 12), label, font=FT_SMALL, fill=TEXT if active else DIM)
        d.text((332, y + 13), str(n), font=FM_SM, fill=TEXT if active else FAINT, anchor="ra")
        y += 52

    # cards — 3 x 3, real skills from this machine
    cards = [
        ("lark-doc", "飞书办公 / Lark", ["AGENTS"], 1, "~/.agents/skills/lark-doc"),
        ("hyperframes", "视频与动画", ["Claude", "Codex", "Gemini"], 4, "~/.claude/skills/hyperframes"),
        ("cloudflare", "Cloudflare / 云平台", ["AGENTS"], 1, "~/.agents/skills/cloudflare"),
        ("test-driven-development", "开发方法论", ["Claude", "AGENTS"], 2, "~/.claude/skills/test-driven-development"),
        ("find-skills", "技能管理", ["AGENTS"], 1, "~/.agents/skills/find-skills"),
        ("frontend-design", "前端与设计", ["Claude", "AGENTS"], 2, "~/.claude/skills/frontend-design"),
        ("lark-base", "飞书办公 / Lark", ["AGENTS"], 1, "~/.agents/skills/lark-base"),
        ("wrangler", "Cloudflare / 云平台", ["AGENTS"], 1, "~/.agents/skills/wrangler"),
        ("systematic-debugging", "开发方法论", ["Claude", "AGENTS"], 2, "~/.agents/skills/systematic-debugging"),
    ]
    CW, CH = 374, 198
    gx, gy = 382, 156
    for i, (name, cat, tools, n, path) in enumerate(cards):
        col, row = i % 3, i // 3
        x = gx + col * (CW + 18)
        yy = gy + row * (CH + 18)
        rr(d, (x, yy, x + CW, yy + CH), 12, fill=DEEP, outline=BORDER, width=1)
        d.text((x + 20, yy + 20), name, font=f(YAHEI_BD, 22), fill=TEXT)
        d.text((x + 20, yy + 58), cat, font=FT_TINY, fill=FAINT)
        if n > 1:
            d.text((x + CW - 20, yy + 58), f"{n} 处安装", font=FT_TINY, fill=GREEN, anchor="ra")
        tx = x + 20
        for t in tools[:3]:
            w = int(d.textlength(t, font=FT_TINY)) + 20
            rr(d, (tx, yy + 92, tx + w, yy + 122), 7, fill=(30, 38, 48), outline=BORDER, width=1)
            d.text((tx + 10, yy + 97), t, font=FT_TINY, fill=DIM)
            tx += w + 8
        d.line((x + 20, yy + 140, x + CW - 20, yy + 140), fill=(34, 40, 48), width=1)
        d.text((x + 20, yy + 156), fit(d, path, FM_XS, CW - 40), font=FM_XS, fill=(84, 92, 102))

    # status bar
    d.line((30, 812, 1570, 812), fill=BORDER, width=2)
    d.text((60, 828), "4 个工具 · 153 个技能 · 185 处安装 · 13 冲突", font=FT_TINY, fill=FAINT)
    star(d, 1440, 838, 10, (90, 98, 108))
    d.text((1460, 828), "Star 项目", font=FT_TINY, fill=(90, 98, 108))
    save(img, "fig3-panel.png")


# ============================================================
# Figure 4 — the "/" picker in the composer
# ============================================================
def fig_picker():
    img, d = new()
    d.text((60, 44), "用法", font=FT_LABEL, fill=BLUE)
    d.text((60, 84), "输入框打 / ,就能按分类选技能", font=FT_TITLE, fill=TEXT)
    d.text((60, 148), "和 DSH 原生的 / 命令菜单同一个入口,不需要记技能名。", font=FT_SUB, fill=DIM)

    # the "/" dropdown as it floats above the composer
    rr(d, (60, 196, 920, 556), 14, fill=PANEL, outline=(56, 98, 148), width=2)
    groups = [
        ("Cloudflare / 云平台", ["cloudflare", "wrangler"]),
        ("飞书办公 / Lark", ["lark-base", "lark-doc", "lark-drive"]),
        ("开发方法论", ["test-driven-development"]),
    ]
    y = 216
    for gname, items in groups:
        d.text((84, y), gname, font=FT_TINY, fill=(96, 104, 114))
        y += 30
        for it in items:
            if it == "lark-doc":
                rr(d, (72, y - 4, 908, y + 32), 8, fill=(28, 45, 66))
            d.text((100, y), it, font=FT_SMALL, fill=TEXT)
            y += 36
        y += 8
    d.text((946, 392), "选中", font=FT_BODY, fill=FAINT)

    # composer with the trigger typed
    rr(d, (60, 586, 1540, 662), 12, fill=PANEL, outline=BORDER, width=2)
    d.text((88, 610), "/", font=FM_BD, fill=DIM)

    # result
    d.text((60, 700), "选中之后,引用会插进输入框,你接着打字就行", font=FT_TINY, fill=FAINT)
    rr(d, (60, 728, 1540, 808), 12, fill=PANEL, outline=(56, 98, 148), width=2)
    d.text((88, 754), "@lark-doc", font=FM_BD, fill=BLUE)
    w = d.textlength("@lark-doc ", font=FM_BD)
    tail = "帮我建个会议纪要文档"
    d.text((88 + w, 752), tail, font=FT_MIX, fill=(200, 209, 217))
    cx = 88 + w + d.textlength(tail, font=FT_MIX) + 5
    d.line((cx, 752, cx, 788), fill=BLUE, width=2)

    d.text((60, 840), "技能名会自动补全;也可以只打几个字筛选,比如输入「视频」就只剩视频相关的技能。",
           font=FT_BODY, fill=FAINT)
    save(img, "fig4-picker.png")


# ============================================================
# Figure 5 — the new entry in the DSH left navigation bar
# ============================================================
def fig_sidebar():
    img, d = new()
    d.text((60, 44), "入口", font=FT_LABEL, fill=GREEN)
    d.text((60, 84), "装完重启,它就在左侧导航栏里", font=FT_TITLE, fill=TEXT)
    d.text((60, 150), "和 DSH 自带的「插件」「自动化任务」并列,不需要记任何命令。", font=FT_SUB, fill=DIM)

    PX, PY, PW, PH = 150, 214, 470, 596
    rr(d, (PX, PY, PX + PW, PY + PH), 16, fill=PANEL, outline=BORDER, width=2)

    items = [
        ("new", "新会话", False),
        ("plugin", "插件", False),
        ("clock", "自动化任务", False),
        ("grid", "技能库", True),
        ("folder", "工作区", False),
    ]
    iy = PY + 34
    IH = 104
    SKILL_CY = 0
    for kind, label, active in items:
        if active:
            rr(d, (PX + 16, iy, PX + PW - 16, iy + IH - 22), 12, fill=(26, 48, 72), outline=(56, 98, 148), width=2)
        cx, cy = PX + 58, iy + (IH - 22) / 2
        col = BLUE if active else (120, 128, 138)
        if kind == "new":
            d.ellipse((cx - 11, cy - 11, cx + 11, cy + 11), outline=col, width=2)
            d.line((cx - 5, cy, cx + 5, cy), fill=col, width=2)
            d.line((cx, cy - 5, cx, cy + 5), fill=col, width=2)
        elif kind == "clock":
            d.ellipse((cx - 11, cy - 11, cx + 11, cy + 11), outline=col, width=2)
            d.line((cx, cy, cx, cy - 6), fill=col, width=2)
            d.line((cx, cy, cx + 5, cy + 3), fill=col, width=2)
        elif kind == "grid":
            for dx, dy in ((-9, -9), (1, -9), (-9, 1), (1, 1)):
                rr(d, (cx + dx, cy + dy, cx + dx + 8, cy + dy + 8), 2, fill=col)
        elif kind == "plugin":
            rr(d, (cx - 10, cy - 7, cx + 10, cy + 11), 3, outline=col, width=2)
            d.ellipse((cx - 4, cy - 13, cx + 4, cy - 5), outline=col, width=2)
        else:
            rr(d, (cx - 11, cy - 8, cx + 11, cy + 10), 3, outline=col, width=2)
        d.text((PX + 92, cy - 15), label, font=F_NAV if active else F_NAV_N, fill=TEXT if active else DIM)
        if active:
            SKILL_CY = cy
            lw = d.textlength(label, font=F_NAV)
            bx0 = PX + 92 + lw + 18
            rr(d, (bx0, cy - 12, bx0 + 66, cy + 14), 7, fill=(56, 98, 148))
            d.text((bx0 + 12, cy - 8), "新增", font=FT_TINY, fill=(206, 228, 255))
        iy += IH

    # callout
    ax = PX + PW + 60
    d.line((ax, SKILL_CY, ax + 70, SKILL_CY), fill=(56, 98, 148), width=3)
    caret(d, ax - 6, SKILL_CY, 9, 12, (56, 98, 148))
    arrow_x = ax + 70
    d.text((arrow_x + 24, SKILL_CY - 118), "这一条就是插件加的", font=f(YAHEI_BD, 30), fill=TEXT)
    d.text((arrow_x + 24, SKILL_CY - 66), "点开左侧这个图标,就是完整的技能库面板:", font=FT_BODY, fill=DIM)

    # mini preview of the panel
    mx, my, mw, mh = arrow_x, SKILL_CY - 30, 620, 250
    rr(d, (mx, my, mx + mw, my + mh), 12, fill=DEEP, outline=BORDER, width=2)
    rr(d, (mx + 14, my + 14, mx + mw - 14, my + 46), 8, fill=PANEL)
    d.text((mx + 28, my + 22), "技能库", font=FT_TINY, fill=TEXT)
    rows = [("飞书办公 / Lark", 27), ("视频与动画", 18), ("前端与设计", 14),
            ("Cloudflare / 云平台", 10)]
    ry = my + 62
    for label, n in rows:
        d.text((mx + 28, ry), label, font=FT_TINY, fill=DIM)
        d.text((mx + mw - 32, ry), str(n), font=FM_XS, fill=FAINT, anchor="ra")
        d.line((mx + 28, ry + 26, mx + mw - 28, ry + 26), fill=(30, 36, 44), width=1)
        ry += 36
    save(img, "fig5-sidebar.png")


if __name__ == "__main__":
    fig_scattered()
    fig_symptom()
    fig_panel()
    fig_picker()
    fig_sidebar()
    print("all figures written to", OUT)