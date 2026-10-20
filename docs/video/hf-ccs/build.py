#!/usr/bin/env python3
"""Generate index.html for the ccs demo video (HyperFrames composition)."""

HEAD = """<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="vendor/gsap.min.js"></script>
    <style>
      @font-face { font-family: "PingFang SC"; src: local("PingFang SC"); }
      @font-face { font-family: "Hiragino Sans GB"; src: local("Hiragino Sans GB"); }
      @font-face { font-family: "SF Mono"; src: local("SF Mono"); }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: #0a0e14; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden;
              font-family: "PingFang SC", "Hiragino Sans GB", sans-serif; }
      .scene { position: absolute; inset: 0; display: flex; flex-direction: column;
               align-items: center; justify-content: center; }
      .mono { font-family: "SF Mono", Menlo, monospace; }
      .kw { color: #58c4da; }
      .dim { color: #9ca3af; }
      .bad { color: #ff6b6b; }
      .good { color: #34d399; }
      .g0 { opacity: 0; }
      .kcap { display: inline-flex; align-items: center; justify-content: center;
              border: 3px solid #374151; border-bottom-width: 8px; border-radius: 14px;
              color: #f4f4f5; background: #1f2937; }
      .term { background: #11151c; border: 1px solid #263041; border-radius: 16px;
              box-shadow: 0 30px 80px rgba(0,0,0,.55); overflow: hidden; }
      .term .bar { height: 52px; background: #171d27; display: flex;
                   align-items: center; gap: 10px; padding: 0 20px; }
      .term .bar i { width: 16px; height: 16px; border-radius: 50%; display: inline-block; }
      .term .body { padding: 28px 36px; font-size: 30px; line-height: 1.75; color: #e5e7eb; }
      .term .p { color: #34d399; }
      .shot { display: block; box-shadow: 0 30px 90px rgba(0,0,0,.6); }
      .ann { position: absolute; border: 4px solid #58c4da; border-radius: 12px;
             box-shadow: 0 0 0 6px rgba(88,196,218,.15), 0 0 40px rgba(88,196,218,.35); }
      .ann .tag { position: absolute; left: 0; top: -64px;
                  background: #58c4da; color: #06232b; font-size: 28px; font-weight: 700;
                  padding: 8px 18px; border-radius: 8px; white-space: nowrap; }
      .ann .tag.below { top: auto; bottom: -64px; }
      .chip { display: inline-flex; align-items: center; gap: 14px;
              border: 2px solid #263041; background: #11151c; border-radius: 999px;
              padding: 18px 34px; color: #e5e7eb; font-size: 30px; }
      .chip b { color: #58c4da; font-size: 44px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="ccs-demo" data-start="0" data-duration="30" data-fps="30" data-width="1920" data-height="1080">
$scenes
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      const inFade = (sel, at, d = 0.35, y = 30) =>
        tl.fromTo(sel, { opacity: 0, y }, { opacity: 1, y: 0, duration: d }, at);
$tweens
      tl.seek(0);
      window.__timelines = window.__timelines || {};
      window.__timelines["ccs-demo"] = tl;
    </script>
  </body>
</html>
"""

# ---------- scenes ----------
SCENES = []  # (start, dur, html, tweens)

def scene(start, dur, html, tweens):
    SCENES.append((start, dur, html, tweens))

G0 = 'class="g0"'

scene(0, 1.4, f"""
      <div class="scene clip" data-start="0" data-duration="1.4" data-track-index="0">
        <div id="t-logo" {G0} class="mono" style="font-size:230px; font-weight:800; color:#f4f4f5;">ccs</div>
        <div id="t-sub" {G0} style="margin-top:18px; font-size:46px; color:#9ca3af;">跨目录找回 Claude Code 全部会话</div>
      </div>
""", """
      inFade("#t-logo", 0, 0.4, 60);
      inFade("#t-sub", 0.3);
      tl.to("#t-logo, #t-sub", { opacity: 0, duration: 0.3 }, 1.1);
""")

scene(1.4, 3.0, f"""
      <div class="scene clip" data-start="1.4" data-duration="3.0" data-track-index="0">
        <div id="p1" {G0} style="position:absolute; left:0; right:0; top:340px; text-align:center;">
          <div class="mono bad" style="font-size:96px; font-weight:700;">claude --resume</div>
          <div class="dim" style="font-size:44px; margin-top:22px;">只列<b style="color:#f4f4f5;">当前目录</b>的会话 —— 换个仓库就找不到</div>
        </div>
        <div id="p2" {G0} style="position:absolute; left:0; top:340px; width:1920px; text-align:center;">
          <div style="font-size:130px; font-weight:800; color:#58c4da;">ccs</div>
          <div style="font-size:50px; color:#e5e7eb; margin-top:16px;">扫描<b class="kw">全库</b> · 一张列表 · 回车<b class="kw">恢复到原目录</b></div>
        </div>
      </div>
""", """
      inFade("#p1", 1.5);
      tl.to("#p1", { opacity: 0, duration: 0.3 }, 2.6);
      inFade("#p2", 2.9, 0.4, 40);
      // p2 holds till scene clip end (4.4)
""")


# ---------- install scene ----------
scene(4.4, 3.0, """
      <div class="scene clip" data-start="4.4" data-duration="3.0" data-track-index="0">
        <div id="i-term" class="g0 term" style="width:1560px;">
          <div class="bar"><i style="background:#ff5f57;"></i><i style="background:#febc2e;"></i><i style="background:#28c840;"></i></div>
          <div class="body">
            <div style="display:flex; gap:14px; align-items:center;">
              <span class="p mono">$</span>
              <span id="i-cmd" class="mono" style="font-size:32px; color:#e5e7eb; word-break:break-all;"></span>
            </div>
            <div id="i-done" class="g0 dim mono" style="margin-top:18px; font-size:26px;">ccs → ~/.local/bin ✓</div>
          </div>
        </div>
        <div id="i-note" class="g0" style="margin-top:44px; font-size:42px; color:#e5e7eb;">一行装好 · <b class="kw">即装即用</b></div>
      </div>
""", """
      const CMD = "curl -fsSL https://raw.githubusercontent.com/biedongbin/ccs/main/install.sh | sh";
      const cmdEl = document.querySelector("#i-cmd");
      for (let i = 0; i < CMD.length; i++) {
        const sp = document.createElement("span");
        sp.textContent = CMD[i];
        sp.style.opacity = "0";
        cmdEl.appendChild(sp);
      }
      tl.to("#i-term", { opacity: 1, duration: 0.3 }, 4.5);
      for (let i = 0; i < CMD.length; i++) {
        tl.to(cmdEl.children[i], { opacity: 1, duration: 0.01 }, 4.7 + i * 0.018);
      }
      tl.to("#i-done", { opacity: 1, duration: 0.3 }, 6.5);
      tl.to("#i-note", { opacity: 1, duration: 0.3 }, 6.7);
      tl.to("#i-term, #i-note", { opacity: 0, duration: 0.3 }, 7.1);
""")

# ---------- main UI scene ----------
scene(7.4, 6.0, """
      <div class="scene clip" data-start="7.4" data-duration="6.0" data-track-index="0">
        <div id="m-wrap" class="g0" style="position:relative; width:1920px;">
          <img class="shot" src="assets/tui-v2-main.png" style="width:1800px;" />
          <div id="m-ann-list" class="ann g0" style="left:42px; top:60px; width:768px; height:520px;">
            <div class="tag">主列表 · 所有项目的会话</div>
          </div>
          <div id="m-ann-detail" class="ann g0" style="left:990px; top:60px; width:768px; height:520px;">
            <div class="tag">详情栏 · 可复制</div>
          </div>
          <div id="m-ann-keys" class="ann g0" style="left:42px; top:520px; width:1716px; height:150px;">
            <div class="tag below">一栏看全快捷键</div>
          </div>
        </div>
        <div id="m-title" class="g0" style="margin-top:48px; font-size:44px; color:#e5e7eb;">
          主从双栏 · <b class="kw">详情栏</b>纯文本可复制 · 底部<b class="kw">快捷键</b>一栏看全
        </div>
      </div>
""", """
      tl.fromTo("#m-wrap", { opacity: 0, scale: 0.94 },
        { opacity: 1, scale: 1, duration: 0.6, ease: "power2.out", transformOrigin: "50% 50%" }, 7.5);
      inFade("#m-title", 7.7);
      inFade("#m-ann-list", 8.2);
      inFade("#m-ann-detail", 8.8);
      inFade("#m-ann-keys", 9.4);
      tl.to("#m-ann-list, #m-ann-detail, #m-ann-keys", { opacity: 0, duration: 0.3 }, 11.3);
      tl.fromTo("#m-wrap", { scale: 1 }, { scale: 1.05, duration: 1.8, ease: "power1.inOut", transformOrigin: "50% 60%", immediateRender: false }, 11.5);
      tl.to("#m-wrap, #m-title", { opacity: 0, duration: 0.3 }, 13.1);
""")

# ---------- search scene: keycap -> slash shot -> done shot ----------
scene(13.4, 4.8, """
      <div class="scene clip" data-start="13.4" data-duration="4.8" data-track-index="0">
        <div id="s-key" class="g0" style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:36px;">
          <div class="kcap" style="width:150px; height:150px; font-size:80px;">/</div>
          <div style="font-size:56px; color:#e5e7eb;">按 <b class="kw">/</b> 搜索：标题 / 项目路径 / 会话 ID</div>
        </div>
        <div id="s-shot1" class="g0" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">
          <img class="shot" src="assets/tui-v2-slash.png" style="width:1850px;" />
        </div>
        <div id="s-shot2" class="g0" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">
          <img class="shot" src="assets/tui-v2-done.png" style="width:1850px;" />
          <div id="s-cap2" class="g0" style="position:absolute; bottom:70px; left:0; right:0; text-align:center; font-size:40px; color:#e5e7eb;">
            输入「视频」→ 列表实时过滤到 1 条
          </div>
        </div>
      </div>
""", """
      inFade("#s-key", 13.5);
      tl.to("#s-key", { opacity: 0, duration: 0.25 }, 14.15);
      inFade("#s-shot1", 14.4);
      tl.to("#s-shot1", { opacity: 0, duration: 0.25 }, 15.9);
      inFade("#s-shot2", 16.0);
      inFade("#s-cap2", 16.4);
      tl.to("#s-shot2, #s-cap2", { opacity: 0, duration: 0.25 }, 18.0);
""")

# ---------- resume scene: fake terminal shows the real two-Enter resume ----------
scene(18.2, 3.2, """
      <div class="scene clip" data-start="18.2" data-duration="3.2" data-track-index="0">
        <div id="r-term" class="g0 term" style="width:1500px;">
          <div class="body" style="font-size:34px;">
            <div id="r-l1"><span class="p mono">$</span> <span class="mono">ccs</span></div>
            <div id="r-l2" class="g0" style="margin:10px 0; padding:14px 22px; border:2px solid #58c4da; border-radius:10px;">
              <span class="mono dim" style="font-size:26px;">10-20</span>
              <b style="margin-left:18px;">视频：理解 answer-me-with-html 的视频实现原理</b>
              <span class="mono dim" style="float:right;">870b25d3</span>
            </div>
            <div id="r-l3" class="g0" style="margin-top:12px;"><span class="p mono">$</span> <span class="mono">claude --resume 870b25d3…</span></div>
          </div>
          <div id="r-ok" class="g0" style="position:absolute; inset:0; background:#11151c; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:22px;">
            <div class="good" style="font-size:110px;">✓</div>
            <div style="font-size:50px; color:#f4f4f5;">已恢复到会话当初的启动目录</div>
            <div class="dim" style="font-size:30px;">chdir + exec 原地接管 · 上下文全在</div>
          </div>
        </div>
      </div>
""", """
      tl.to("#r-term", { opacity: 1, duration: 0.3 }, 18.4);
      inFade("#r-l2", 18.7);
      inFade("#r-l3", 19.3);
      tl.to("#r-ok", { opacity: 1, duration: 0.35 }, 19.9);
      tl.to("#r-ok", { opacity: 0, duration: 0.3 }, 21.1);
""")

# ---------- config scene ----------
scene(21.4, 5.0, """
      <div class="scene clip" data-start="21.4" data-duration="5.0" data-track-index="0">
        <div id="c-wrap" class="g0" style="position:relative;">
          <img class="shot" src="assets/tui-config.png" style="width:1300px;" />
        </div>
        <div id="c-chips" class="g0" style="margin-top:40px; display:flex; gap:40px;">
          <div class="chip"><b>10</b> 语言</div>
          <div class="chip"><b>4+</b> 主题</div>
          <div class="chip"><b>自定义</b> 调色板</div>
        </div>
      </div>
""", """
      tl.fromTo("#c-wrap", { opacity: 0, scale: 0.95 },
        { opacity: 1, scale: 1, duration: 0.5, ease: "power2.out" }, 21.5);
      inFade("#c-chips", 22.2);
      tl.to("#c-chips", { opacity: 0, duration: 0.3 }, 25.6);
      tl.to("#c-wrap", { opacity: 0, duration: 0.3 }, 26.0);
""")

# ---------- end scene ----------
scene(26.4, 3.6, """
      <div class="scene clip" data-start="26.4" data-duration="3.6" data-track-index="0">
        <div style="display:flex; align-items:baseline; gap:24px;">
          <div id="e-logo" class="g0 mono" style="font-size:150px; font-weight:800; color:#f4f4f5;">ccs</div>
          <div id="e-sub" class="g0" style="font-size:40px; color:#9ca3af;">跨目录找回 Claude Code 会话</div>
        </div>
        <div id="e-cmd" class="g0 term" style="margin-top:50px; padding:24px 40px; width:fit-content;">
          <span class="p mono" style="font-size:36px;">$</span>
          <span class="mono" style="font-size:36px; color:#e5e7eb;">curl -fsSL https://raw.githubusercontent.com/biedongbin/ccs/main/install.sh | sh</span>
        </div>
        <div id="e-git" class="g0 mono" style="margin-top:34px; color:#58c4da;">github.com/biedongbin/ccs</div>
      </div>
""", """
      inFade("#e-logo", 26.5, 0.4, 50);
      inFade("#e-sub", 26.7);
      inFade("#e-cmd", 26.9);
      inFade("#e-git", 27.1);
      tl.to("#e-logo, #e-sub, #e-cmd, #e-git", { opacity: 0, duration: 0.3 }, 29.6);
""")

# ---------- assemble ----------
from string import Template

# ---------- i18n: VIDEO_LANG=en translates the generated html ----------
ZH2EN = [
  ("跨目录找回 Claude Code 全部会话", "Find every Claude Code session, across all directories"),
  ("只列<b style=\"color:#f4f4f5;\">当前目录</b>的会话 —— 换个仓库就找不到",
   "only lists <b style=\"color:#f4f4f5;\">this directory</b>&#39;s sessions — switch repos and they&#39;re gone"),
  ("扫描<b class=\"kw\">全库</b> · 一张列表 · 回车<b class=\"kw\">恢复到原目录</b>",
   "Every project in <b class=\"kw\">one list</b> · Enter <b class=\"kw\">resumes in its original directory</b>"),
  ("一行装好 · <b class=\"kw\">即装即用</b>", "One line · <b class=\"kw\">ready to run</b>"),
  ("主列表 · 所有项目的会话", "Master list · every project"),
  ("详情栏 · 可复制", "Detail pane · copyable"),
  ("一栏看全快捷键", "All shortcuts in one bar"),
  ("主从双栏 · <b class=\"kw\">详情栏</b>纯文本可复制 · 底部<b class=\"kw\">快捷键</b>一栏看全",
   "Master&#8211;detail · <b class=\"kw\">copyable</b> detail pane · every <b class=\"kw\">shortcut</b> in one bar"),
  ("按 <b class=\"kw\">/</b> 搜索：标题 / 项目路径 / 会话 ID",
   "Press <b class=\"kw\">/</b> to search: title / path / session ID"),
  ("输入「视频」→ 列表实时过滤到 1 条", "Type a keyword &#8594; the list filters live to 1 hit"),
  ("视频：理解 answer-me-with-html 的视频实现原理", "Video: how answer-me-with-html renders explainer videos"),
  ("已恢复到会话当初的启动目录", "Resumed in the session&#39;s original directory"),
  ("chdir + exec 原地接管 · 上下文全在", "chdir + exec in place · full context intact"),
  ("<b>10</b> 语言", "<b>10</b> languages"),
  ("<b>4+</b> 主题", "<b>4+</b> themes"),
  ("<b>自定义</b> 调色板", "<b>Custom</b> palettes"),
  ("跨目录找回 Claude Code 会话", "Find any Claude Code session, in any directory"),
]

def main():
    html_parts, tween_parts = [], []
    for start, dur, html, tweens in SCENES:
        html_parts.append(html)
        tween_parts.append(tweens)
    out = Template(HEAD).safe_substitute(
        scenes="\n".join(html_parts), tweens="\n".join(tween_parts))
    import os
    if os.environ.get("VIDEO_LANG") == "en":
        for zh, en in ZH2EN:
            assert zh in out, "i18n miss: " + zh[:30]
            out = out.replace(zh, en)
        out = out.replace('lang="zh-CN"', 'lang="en"')
        out = out.replace('data-composition-id="ccs-demo"', 'data-composition-id="ccs-demo-en"')
        out = out.replace('window.__timelines["ccs-demo"]', 'window.__timelines["ccs-demo-en"]')
        out = out.replace('src="assets/', 'src="assets-en/')
        out = (out.replace('tui-v2-main.png', 'main.png').replace('tui-v2-slash.png', 'slash.png')
                 .replace('tui-v2-done.png', 'done.png').replace('tui-config.png', 'config.png'))
    open("index.html", "w").write(out)
    print(f"index.html: {len(out)} bytes, {len(SCENES)} scenes, lang={os.environ.get('VIDEO_LANG', 'zh')}")

if __name__ == "__main__":
    main()
