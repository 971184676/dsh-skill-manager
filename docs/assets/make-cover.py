"""Generate the X post cover image for the DSH Skill Manager.

Real data (measured on this machine via lib/skill-model.js):
  153 unique skills, 185 installations, 13 duplicates, 4 tools.
Category counts are the real ones, so the mock panel tells the truth.
"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1600, 900
BG = (13, 17, 23)
PANEL = (22, 27, 34)
PANEL_DEEP = (9, 12, 17)
BORDER = (48, 54, 61)
TEXT = (230, 237, 243)
DIM = (139, 148, 158)
FAINT = (110, 118, 129)
RED = (248, 81, 73)
GREEN = (63, 185, 80)
BLUE = (88, 166, 255)
PURPLE = (163, 113, 247)

YAHEI = r"C:\Windows\Fonts\msyh.ttc"
YAHEI_BD = r"C:\Windows\Fonts\msyhbd.ttc"
MONO = r"C:\Windows\Fonts\consola.ttf"
MONO_BD = r"C:\Windows\Fonts\consolab.ttf"


def font(path, size):
    return ImageFont.truetype(path, size)


F_LABEL = font(YAHEI, 24)
F_H1 = font(YAHEI_BD, 58)
F_H1R = font(YAHEI_BD, 58)
F_PANEL_T = font(YAHEI_BD, 26)
F_ROW = font(YAHEI, 25)
F_ROW_SM = font(YAHEI, 23)
F_COUNT = font(MONO_BD, 24)
F_MONO = font(MONO, 23)
F_FOOT = font(YAHEI, 22)
F_BIG0 = font(YAHEI_BD, 92)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)


def rrect(box, radius, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(xy, s, f, fill, anchor=None):
    d.text(xy, s, font=f, fill=fill, anchor=anchor)


# ---------- header ----------
text((60, 44), "同一台电脑 · 同一批技能", F_LABEL, DIM)

# headline: 153 个技能装好了,DSH 里 0 个可见。
x = 60
y1 = 88
seg = "153 个技能装好了,"
text((x, y1), seg, F_H1, TEXT)
x += d.textlength(seg, font=F_H1)
seg2 = "DSH 里 "
text((x, y1), seg2, F_H1, TEXT)
x += d.textlength(seg2, font=F_H1)
seg3 = "0"
text((x, y1), seg3, F_H1R, RED)
x += d.textlength(seg3, font=F_H1R)
seg4 = " 个可见"
text((x, y1), seg4, F_H1, TEXT)

text((60, 178), "技能就在硬盘上。注册表里没有,所以等于不存在。", F_LABEL, DIM)

# ---------- panels ----------
P_TOP, P_H = 244, 420
LW = 728
LX, RX = 60, 812

# left: the problem
rrect((LX, P_TOP, LX + LW, P_TOP + P_H), 16, fill=PANEL, outline=BORDER, width=2)
d.ellipse((LX + 24, P_TOP + 26, LX + 38, P_TOP + 40), fill=RED)
text((LX + 50, P_TOP + 18), "之前 · DSH 默认", F_PANEL_T, TEXT)
text((LX + LW - 24, P_TOP + 22), "技能列表", F_ROW_SM, FAINT, anchor="ra")
d.line((LX, P_TOP + 60, LX + LW, P_TOP + 60), fill=BORDER, width=2)

# empty state (centred in the lower area)
cy = P_TOP + 200
text((LX + LW / 2, cy - 46), "0", F_BIG0, (74, 84, 96), anchor="mm")
text((LX + LW / 2, cy + 40), "没有找到任何技能", F_ROW, FAINT, anchor="mm")
text((LX + LW / 2, cy + 78), "装了,但看不见。", F_ROW_SM, (70, 78, 88), anchor="mm")

# right: the solution
rrect((RX, P_TOP, RX + LW, P_TOP + P_H), 16, fill=PANEL, outline=(56, 98, 148), width=2)
d.ellipse((RX + 24, P_TOP + 26, RX + 38, P_TOP + 40), fill=GREEN)
text((RX + 50, P_TOP + 18), "现在 · 技能仓库", F_PANEL_T, TEXT)
text((RX + LW - 24, P_TOP + 22), "按分类", F_ROW_SM, FAINT, anchor="ra")
d.line((RX, P_TOP + 60, RX + LW, P_TOP + 60), fill=(56, 98, 148), width=2)

CATS = [
    ("飞书办公 / Lark", 27),
    ("视频与动画", 18),
    ("前端与设计", 14),
    ("Cloudflare / 云平台", 10),
    ("技能管理", 8),
    ("开发方法论", 8),
    ("Office 文档", 1),
    ("未分类", 67),
]
ROW_H = 38
ry = P_TOP + 68
BAR_COLORS = [PURPLE, BLUE, GREEN, (219, 109, 40), (88, 166, 255), (163, 113, 247), (63, 185, 80), (110, 118, 129)]
for i, (label, n) in enumerate(CATS):
    yy = ry + i * ROW_H
    rrect((RX + 22, yy + 7, RX + 27, yy + 27), 2, fill=BAR_COLORS[i])
    text((RX + 42, yy + 4), label, F_ROW, TEXT)
    text((RX + LW - 26, yy + 6), str(n), F_COUNT, DIM, anchor="ra")

# panel footer summary
fy = P_TOP + P_H - 40
d.line((RX, fy - 10, RX + LW, fy - 10), fill=BORDER, width=1)
text((RX + 22, fy), "共 153 个技能 · 来自 4 个工具 · 13 个重复已合并", F_ROW_SM, DIM)

# ---------- terminal ----------
T_TOP, T_H = 686, 78
rrect((60, T_TOP, 60 + W - 120, T_TOP + T_H), 12, fill=PANEL_DEEP, outline=BORDER, width=2)
text((84, T_TOP + 26), "$", F_MONO, GREEN)
cmd = "ls ~/.claude/skills ~/.codex/skills ~/.gemini/skills ~/.agents/skills | wc -l"
text((108, T_TOP + 26), cmd, F_MONO, (200, 209, 217))

# ---------- footer ----------
text((60, 800), "github.com/971184676/dsh-skill-manager", F_FOOT, BLUE)
text((W - 60, 800), "MIT 开源 · 零依赖 · 中英双语", F_FOOT, FAINT, anchor="ra")

out_dir = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(out_dir, "x-cover.png")
img.save(out, "PNG")
print("saved:", out, img.size)