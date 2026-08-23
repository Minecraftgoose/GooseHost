(function () {
  if (!location.hostname.includes('goose.cc.cd')) return;
  if (location.hostname.includes('goose.gs.cn')) return;

  var newHost = location.hostname.replace('goose.cc.cd', 'goose.gs.cn');
  var newUrl = location.protocol + '//' + newHost + location.pathname + location.search + location.hash;

  var bar = document.createElement('div');
  bar.id = 'gh-moved-bar';
  bar.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:999999;' +
    'background:#0a0f0d;border-bottom:2px solid #02ff8e;' +
    'color:#fff;padding:10px 16px;text-align:center;' +
    'font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;' +
    'font-size:14px;line-height:1.6;box-shadow:0 4px 20px rgba(0,0,0,0.4);';

  var txt = document.createElement('span');
  txt.innerHTML = 'GooseHost 已搬家！新地址：<strong style="color:#02ff8e;">' + newHost + '</strong>';

  var goBtn = document.createElement('a');
  goBtn.href = newUrl;
  goBtn.textContent = '前往新地址 →';
  goBtn.style.cssText =
    'display:inline-block;margin-left:12px;padding:5px 14px;border-radius:6px;' +
    'background:linear-gradient(135deg,#02ff8e,#00cc6a);color:#001a0d;' +
    'text-decoration:none;font-weight:600;font-size:13px;';

  var closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', '关闭');
  closeBtn.style.cssText =
    'position:absolute;right:8px;top:6px;background:none;border:none;' +
    'color:rgba(255,255,255,0.6);font-size:18px;cursor:pointer;line-height:1;';
  closeBtn.onclick = function () { bar.remove(); };

  bar.appendChild(txt);
  bar.appendChild(goBtn);
  bar.appendChild(closeBtn);
  document.documentElement.appendChild(bar);

  var pad = document.createElement('style');
  pad.textContent = '@media (max-width:480px){#gh-moved-bar{font-size:12px;padding:8px 10px}#gh-moved-bar a{margin-left:8px;padding:4px 10px;font-size:12px}}';
  document.head.appendChild(pad);
})();
