// Every table that is wider than the screen can be dragged sideways with the mouse:
// press the left button on the table and move left or right. A small movement is still a normal click,
// and buttons, links, boxes and dropdowns inside the table work as before.
const SKIP = 'a,button,input,select,textarea,label,[role="button"],[role="combobox"],[contenteditable="true"],[data-no-drag]';
const THRESHOLD = 6;

function scroller(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 1 && n.querySelector(':scope > table, :scope > div > table')) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return n;
    }
  }
  return null;
}

export function enableTableDragScroll() {
  if (typeof window === 'undefined' || window.__tableDragScroll) return;
  window.__tableDragScroll = true;
  let drag = null;

  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest(SKIP) || !e.target.closest('table')) return;
    const box = scroller(e.target);
    if (box) drag = { box, x: e.clientX, left: box.scrollLeft, moved: false };
  });

  document.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.box.classList.add('table-dragging');
      window.getSelection()?.removeAllRanges();
    }
    drag.box.scrollLeft = drag.left - dx;
    e.preventDefault();
  });

  const end = () => {
    if (!drag) return;
    if (drag.moved) {
      drag.box.classList.remove('table-dragging');
      // The click that ends a drag must not open a row.
      const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
    }
    drag = null;
  };
  document.addEventListener('mouseup', end);
  window.addEventListener('blur', end);
}
