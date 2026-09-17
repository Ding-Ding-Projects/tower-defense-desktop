/**
 * The smallest fake DOM that can prove the accessibility mirror (see
 * src/render/hud/a11y-mirror.js) is doing its job: real elements, real
 * attributes, real bubbling click events, with no browser required.
 *
 * Not itself a *.test.js file, so `npm test`'s glob never tries to run it.
 */

class FakeEventTarget {
  constructor() {
    this._listeners = new Map();
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }

  removeEventListener(type, fn) {
    const arr = this._listeners.get(type);
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i !== -1) arr.splice(i, 1);
  }

  dispatchEvent(event) {
    const arr = this._listeners.get(event.type) ?? [];
    for (const fn of arr.slice()) fn(event);
    if (event.bubbles && this.parentNode && typeof this.parentNode.dispatchEvent === 'function') {
      this.parentNode.dispatchEvent(event);
    }
    return true;
  }
}

class FakeElement extends FakeEventTarget {
  constructor(tagName, doc) {
    super();
    this.tagName = tagName;
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this._attributes = new Map();
    this.textContent = '';
    this.disabled = false;
    this.className = '';
    this.type = '';
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  /**
   * The multi-argument sibling of appendChild, which the real DOM has and this did not.
   * Its absence was not neutral: `pause-settings.js` builds its whole dialog with
   * `append`, so that module could not be driven against this fake at all, and the first
   * screen written to use it failed here rather than in the browser.
   * @param {...any} children
   */
  append(...children) {
    for (const child of children) this.appendChild(child);
  }

  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i !== -1) this.children.splice(i, 1);
    child.parentNode = null;
    return child;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  setAttribute(name, value) {
    this._attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this._attributes.has(name) ? this._attributes.get(name) : null;
  }

  hasAttribute(name) {
    return this._attributes.has(name);
  }

  /** Simulates activating this control (mouse click or keyboard Enter/Space). */
  click() {
    if (this.disabled) return;
    this.dispatchEvent({ type: 'click', bubbles: true });
  }
}

export class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
}

/** @returns {{doc: FakeDocument, host: FakeElement}} */
export function createFakeHost() {
  const doc = new FakeDocument();
  const host = doc.createElement('div');
  return { doc, host };
}
