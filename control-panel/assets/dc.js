/* Minimal runtime for the control-panel pages: renders the <x-dc> template
   with the page's Component class (renderVals / setState), handling {{holes}},
   data-for / data-if repeats and data-on-* events. */
(function () {
  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (patch) {
    var next = typeof patch === 'function' ? patch(this.state, this.props) : patch;
    this.state = Object.assign({}, this.state, next);
    if (this.__render) this.__render();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__render) this.__render(); };

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

  function lookup(path, scope) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var parts = path.split('.'), cur = scope;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  function interp(str, scope) {
    return str.replace(HOLE, function (_, p) { var v = lookup(p, scope); return v == null ? '' : String(v); });
  }

  function build(node, scope) {
    if (node.nodeType === 3) return [document.createTextNode(interp(node.nodeValue, scope))];
    if (node.nodeType !== 1) return [];
    if (node.hasAttribute('data-for')) {
      var list = lookup(node.getAttribute('data-for'), scope) || [];
      var as = node.getAttribute('data-as') || 'item';
      var out = [];
      list.forEach(function (item, idx) {
        var s = Object.create(scope); s[as] = item; s.$index = idx;
        var c = node.cloneNode(true); c.removeAttribute('data-for'); c.removeAttribute('data-as');
        out = out.concat(build(c, s));
      });
      return out;
    }
    if (node.hasAttribute('data-if')) {
      if (!lookup(node.getAttribute('data-if'), scope)) return [];
      node = node.cloneNode(true); node.removeAttribute('data-if');
    }
    var el = node.namespaceURI === 'http://www.w3.org/2000/svg'
      ? document.createElementNS(node.namespaceURI, node.localName)
      : document.createElement(node.localName);
    var deferred = [];
    Array.prototype.forEach.call(node.attributes, function (a) {
      var m;
      if (a.name.indexOf('data-on-') === 0) {
        var fn = (m = WHOLE.exec(a.value)) ? lookup(m[1], scope) : null;
        var ev = a.name.slice(8);
        if (ev === 'change' && (node.localName === 'textarea' || (node.localName === 'input' && /^(text|email|search|password|tel|url|number|)$/i.test(node.getAttribute('type') || '')))) ev = 'input';
        if (typeof fn === 'function') el.addEventListener(ev, fn);
      } else if (a.name === 'data-checked') {
        deferred.push(function () { el.checked = !!lookup((WHOLE.exec(a.value) || [0, a.value])[1], scope); });
      } else if (a.name === 'data-value') {
        deferred.push(function () { var v = lookup((WHOLE.exec(a.value) || [0, a.value])[1], scope); el.value = v == null ? '' : v; });
      } else {
        el.setAttribute(a.name, interp(a.value, scope));
      }
    });
    Array.prototype.forEach.call(node.childNodes, function (ch) {
      build(ch, scope).forEach(function (n) { el.appendChild(n); });
    });
    deferred.forEach(function (f) { f(); });
    return [el];
  }

  function boot() {
    var host = document.querySelector('x-dc');
    var tpl = host.firstElementChild;
    host.removeChild(tpl);
    var script = document.querySelector('script[data-dc-script]');
    var props = {};
    try {
      var decl = JSON.parse(script.getAttribute('data-props') || '{}');
      Object.keys(decl).forEach(function (k) { if (k.charAt(0) !== '$' && 'default' in decl[k]) props[k] = decl[k]['default']; });
    } catch (e) {}
    var Component = new Function('DCLogic', script.textContent + '\nreturn Component;')(DCLogic);
    var comp = new Component(props);
    if (!comp.state) comp.state = {};
    comp.__render = function () {
      var act = document.activeElement, focusId = act && act.id, sel = null;
      try { if (act && act.selectionStart != null) sel = [act.selectionStart, act.selectionEnd]; } catch (e) {}
      var nodes = build(tpl, comp.renderVals());
      host.replaceChildren.apply(host, nodes);
      if (focusId) {
        var f = document.getElementById(focusId);
        if (f) { f.focus(); if (sel) { try { f.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
      }
    };
    comp.__render();
    if (comp.componentDidMount) comp.componentDidMount();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
