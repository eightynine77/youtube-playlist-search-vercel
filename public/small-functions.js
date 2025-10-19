document.addEventListener("keydown", function (e) {
  if (e.key === "Tab") {
    const focusable = [...document.querySelectorAll('[tabindex]:not([tabindex="-1"])')]
      .sort((a, b) => a.tabIndex - b.tabIndex);

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }

    else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});