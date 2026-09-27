(function () {
  "use strict";

  var button = document.getElementById("manual-print-button");
  var status = document.getElementById("manual-print-status");

  if (!button || !status) {
    return;
  }

  var defaultLabel = button.textContent;
  var resetTimer;
  var printLifecycleStarted = false;

  function restoreButton() {
    window.clearTimeout(resetTimer);
    button.disabled = false;
    button.textContent = defaultLabel;
  }

  window.addEventListener("beforeprint", function () {
    printLifecycleStarted = true;
    status.textContent = "打印窗口已打开。";
  });

  window.addEventListener("afterprint", function () {
    restoreButton();
    status.textContent = "打印窗口已关闭。";
    resetTimer = window.setTimeout(function () {
      status.textContent = "";
    }, 3000);
  });

  button.addEventListener("click", function () {
    printLifecycleStarted = false;
    button.disabled = true;
    button.textContent = "正在打开打印窗口…";
    status.textContent = "正在调用系统打印功能。";

    window.requestAnimationFrame(function () {
      try {
        window.print();
        if (!printLifecycleStarted) {
          resetTimer = window.setTimeout(function () {
            restoreButton();
            status.textContent =
              "未显示打印窗口时，请使用浏览器菜单中的“打印”。";
          }, 1500);
        }
      } catch (error) {
        restoreButton();
        status.textContent = "打印功能不可用，请使用浏览器菜单中的“打印”。";
      }
    });
  });
})();
