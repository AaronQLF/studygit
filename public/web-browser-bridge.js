// Runs inside proxied pages served by /api/web/proxy. Mirrors the Electron
// webview preload (electron/webview-preload.ts) but talks to the host
// renderer through postMessage instead of ipcRenderer.sendToHost.

(function () {
  "use strict";

  var ANCHOR_CONTEXT = 32;
  // The proxied document is sandboxed without `allow-same-origin`, so
  // `window.location.origin` here is `"null"`. postMessage rejects
  // `"null"` as a targetOrigin, so use "*" — messages we send carry no
  // secrets (selection text the user just made, highlight ids/colors),
  // and only our parent window holds a reference to this iframe.
  var TARGET_ORIGIN = "*";

  var WIKIPEDIA_READER_CSS =
    "#mw-head, #mw-page-base, #mw-head-base," +
    "#mw-navigation, #mw-panel, #mw-sidebar-button," +
    ".mw-header, .vector-header-container," +
    ".vector-page-toolbar, .vector-sticky-header," +
    ".vector-menu-tabs, .vector-page-titlebar-toc," +
    ".mw-jump-link, .mw-editsection," +
    "#siteNotice, #localNotice, .mw-notification-area," +
    "#mw-indicator-good-star, .printfooter," +
    "#footer, #mw-navigation-heading," +
    ".vector-column-end, .vector-column-start," +
    ".vector-page-tools-container," +
    ".vector-toc-collapsed-button," +
    ".navbox, .sister-wikipedia, .sistersitebox," +
    ".reference-accessdate { display: none !important; }" +
    "html, body { background: #fff !important; }" +
    "#content, .mw-body, .mw-page-container {" +
    "margin: 0 auto !important;" +
    "padding: 24px 28px 64px !important;" +
    "max-width: 760px !important;" +
    "border: none !important;" +
    "box-shadow: none !important;" +
    "background: #fff !important;" +
    "}" +
    ".mw-body-content {" +
    "font-family: Georgia, 'Iowan Old Style', 'Charter', serif !important;" +
    "font-size: 16.5px !important;" +
    "line-height: 1.6 !important;" +
    "color: #1c1c1f !important;" +
    "}";

  function sendToHost(channel) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (window.parent === window) return;
    window.parent.postMessage(
      { type: "pg-browser", channel: channel, args: args },
      TARGET_ORIGIN
    );
  }

  function onHost(channel, handler) {
    window.addEventListener("message", function (event) {
      // Authenticate by source window (must be our parent) rather than
      // by origin string, since the parent's origin is unknown to this
      // sandboxed document.
      if (event.source !== window.parent) return;
      var data = event.data;
      if (!data || data.type !== "pg-browser-host" || data.channel !== channel) {
        return;
      }
      handler.apply(null, data.args || []);
    });
  }

  function injectStylesheet(css, id) {
    if (document.getElementById(id)) return;
    var style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function maybeInjectReaderStyles() {
    try {
      var host = location.hostname;
      if (/(?:^|\.)wikipedia\.org$/i.test(host)) {
        injectStylesheet(WIKIPEDIA_READER_CSS, "pg-wikipedia-reader-css");
      }
    } catch (_err) {}
  }

  function collectTextNodes(root) {
    var out = [];
    var offset = 0;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    for (var n = walker.nextNode(); n; n = walker.nextNode()) {
      var t = n;
      var len = t.nodeValue ? t.nodeValue.length : 0;
      if (len === 0) continue;
      out.push({ node: t, start: offset, end: offset + len });
      offset += len;
    }
    return out;
  }

  function flatText(index) {
    var out = "";
    for (var i = 0; i < index.length; i++) {
      out += index[i].node.nodeValue || "";
    }
    return out;
  }

  function nodeOffsetInIndex(index, node, offset) {
    for (var i = 0; i < index.length; i++) {
      var e = index[i];
      if (e.node === node) {
        return e.start + Math.min(offset, e.end - e.start);
      }
    }
    if (node.nodeType === 1) {
      var el = node;
      var children =
        offset >= el.childNodes.length
          ? Array.prototype.slice.call(el.childNodes)
          : Array.prototype.slice.call(el.childNodes, 0, offset);
      for (var j = children.length - 1; j >= 0; j--) {
        var c = children[j];
        var w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
        var last = null;
        for (var t = w.nextNode(); t; t = w.nextNode()) last = t;
        if (last) {
          for (var k = 0; k < index.length; k++) {
            if (index[k].node === last) return index[k].end;
          }
        }
      }
    }
    return null;
  }

  var lastSelection = null;

  function describeSelection() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    var range = sel.getRangeAt(0);
    var root = document.body;
    if (!root.contains(range.commonAncestorContainer)) return null;
    var index = collectTextNodes(root);
    if (index.length === 0) return null;
    var full = flatText(index);
    var startGlobal = nodeOffsetInIndex(
      index,
      range.startContainer,
      range.startOffset
    );
    var endGlobal = nodeOffsetInIndex(
      index,
      range.endContainer,
      range.endOffset
    );
    if (
      startGlobal == null ||
      endGlobal == null ||
      endGlobal <= startGlobal
    ) {
      return null;
    }
    var rawText = full.slice(startGlobal, endGlobal);
    var text = rawText.replace(/^\s+|\s+$/g, "");
    if (!text) return null;
    var leading = rawText.length - rawText.trimStart().length;
    var trailing = rawText.length - rawText.trimEnd().length;
    var realStart = startGlobal + leading;
    var realEnd = endGlobal - trailing;
    var prefix = full.slice(Math.max(0, realStart - ANCHOR_CONTEXT), realStart);
    var suffix = full.slice(realEnd, realEnd + ANCHOR_CONTEXT);
    var rect = range.getBoundingClientRect();
    return {
      text: text,
      prefix: prefix,
      suffix: suffix,
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
    };
  }

  function pushSelection() {
    var payload = describeSelection();
    lastSelection = payload;
    sendToHost("pg-selection", payload);
  }

  document.addEventListener("mouseup", function () {
    requestAnimationFrame(pushSelection);
  });

  document.addEventListener("keyup", function (event) {
    if (event.shiftKey || event.key.indexOf("Arrow") === 0) {
      requestAnimationFrame(pushSelection);
    }
  });

  document.addEventListener("selectionchange", function () {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      if (lastSelection) {
        lastSelection = null;
        sendToHost("pg-selection", null);
      }
    }
  });

  function rangeFromIndex(index, start, end) {
    if (start >= end) return null;
    var startNode = null;
    var startOffset = 0;
    var endNode = null;
    var endOffset = 0;
    for (var i = 0; i < index.length; i++) {
      var e = index[i];
      if (!startNode && start >= e.start && start < e.end) {
        startNode = e.node;
        startOffset = start - e.start;
      }
      if (end > e.start && end <= e.end) {
        endNode = e.node;
        endOffset = end - e.start;
      }
    }
    if (!startNode || !endNode) return null;
    var range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }

  function findAnchor(full, text, prefix, suffix) {
    if (!text) return null;
    if (prefix || suffix) {
      var composite = prefix + text + suffix;
      var idx = full.indexOf(composite);
      if (idx !== -1) {
        return {
          start: idx + prefix.length,
          end: idx + prefix.length + text.length,
        };
      }
    }
    var first = full.indexOf(text);
    if (first === -1) return null;
    var second = full.indexOf(text, first + 1);
    if (second !== -1) return null;
    return { start: first, end: first + text.length };
  }

  function wrapRange(root, range, id, color) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var t = node;
        var r = document.createRange();
        r.selectNodeContents(t);
        var intersects =
          range.compareBoundaryPoints(Range.END_TO_START, r) < 0 &&
          range.compareBoundaryPoints(Range.START_TO_END, r) > 0;
        return intersects
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    var pieces = [];
    for (var n = walker.nextNode(); n; n = walker.nextNode()) {
      var textNode = n;
      var len = textNode.nodeValue ? textNode.nodeValue.length : 0;
      if (len === 0) continue;
      var pieceStart = 0;
      var pieceEnd = len;
      if (textNode === range.startContainer) pieceStart = range.startOffset;
      if (textNode === range.endContainer) pieceEnd = range.endOffset;
      if (pieceEnd > pieceStart) {
        pieces.push({ node: textNode, start: pieceStart, end: pieceEnd });
      }
    }
    for (var i = 0; i < pieces.length; i++) {
      var piece = pieces[i];
      var node = piece.node;
      var start = piece.start;
      var end = piece.end;
      var value = node.nodeValue || "";
      var before = value.slice(0, start);
      var middle = value.slice(start, end);
      var after = value.slice(end);
      var parent = node.parentNode;
      if (!parent) continue;
      var mark = document.createElement("mark");
      mark.dataset.pgHighlightId = id;
      mark.style.backgroundColor = color;
      mark.style.color = "inherit";
      mark.style.padding = "0";
      mark.style.borderRadius = "2px";
      mark.appendChild(document.createTextNode(middle));
      var next = node.nextSibling;
      parent.removeChild(node);
      if (before) {
        var beforeNode = document.createTextNode(before);
        if (next) parent.insertBefore(beforeNode, next);
        else parent.appendChild(beforeNode);
      }
      if (next) parent.insertBefore(mark, next);
      else parent.appendChild(mark);
      if (after) {
        var afterNode = document.createTextNode(after);
        if (next) parent.insertBefore(afterNode, next);
        else parent.appendChild(afterNode);
      }
    }
  }

  function applyHighlight(id, color) {
    var snapshot = lastSelection;
    if (!snapshot) return false;
    var root = document.body;
    var index = collectTextNodes(root);
    var full = flatText(index);
    var anchor = findAnchor(
      full,
      snapshot.text,
      snapshot.prefix,
      snapshot.suffix
    );
    if (!anchor) return false;
    var range = rangeFromIndex(index, anchor.start, anchor.end);
    if (!range) return false;
    wrapRange(root, range, id, color);
    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    lastSelection = null;
    sendToHost("pg-highlight-applied", {
      id: id,
      color: color,
      text: snapshot.text,
      prefix: snapshot.prefix,
      suffix: snapshot.suffix,
    });
    sendToHost("pg-selection", null);
    return true;
  }

  onHost("pg-apply-highlight", function (payload) {
    var ok = applyHighlight(payload.id, payload.color);
    if (!ok) sendToHost("pg-highlight-failed", { id: payload.id });
  });

  onHost("pg-clear-highlights", function () {
    var marks = document.querySelectorAll("mark[data-pg-highlight-id]");
    marks.forEach(function (m) {
      var parent = m.parentNode;
      if (!parent) return;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
    });
    document.body.normalize();
  });

  onHost("pg-page-info", function () {
    sendToHost("pg-page-info", {
      url: location.href,
      title: document.title,
    });
  });

  function readProxyFinalUrl() {
    var meta = document.querySelector('meta[name="pg-proxy-final-url"]');
    return meta ? meta.getAttribute("content") || location.href : location.href;
  }

  function emitPageInfo() {
    sendToHost("pg-page-info", {
      url: readProxyFinalUrl(),
      title: document.title,
    });
  }

  document.addEventListener(
    "click",
    function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var anchor = target.closest("a[href]");
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      var href = anchor.href;
      if (!href || !/^https?:/i.test(href)) return;
      event.preventDefault();
      event.stopPropagation();
      sendToHost("pg-navigate", href);
    },
    true
  );

  window.addEventListener("DOMContentLoaded", function () {
    maybeInjectReaderStyles();
    emitPageInfo();
  });
  window.addEventListener("popstate", maybeInjectReaderStyles);
  window.addEventListener("pageshow", maybeInjectReaderStyles);
  if (document.readyState !== "loading") {
    maybeInjectReaderStyles();
    emitPageInfo();
  }
})();
