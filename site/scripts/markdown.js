/**
 * A small, deliberately limited Markdown renderer for the offline documentation
 * bundle. There is no bundler and no CDN, so this is hand-written rather than an
 * imported library; it only needs to cover what the project's own docs/features/*.md
 * articles actually use: headings, paragraphs, lists, fenced code, inline code,
 * bold/italic and links. Every text run is inserted as a text node (never innerHTML
 * on untrusted content), so even though these files are project-authored and
 * trusted, a stray "<" in a stat name cannot become markup.
 */

/**
 * @param {string} text
 * @returns {Array<Text|HTMLElement>}
 */
function renderInline(text) {
  /** @type {Array<Text|HTMLElement>} */
  const nodes = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(document.createTextNode(text.slice(lastIndex, match.index)));
    const token = match[0];
    if (token.startsWith('`')) {
      const code = document.createElement('code');
      code.textContent = token.slice(1, -1);
      nodes.push(code);
    } else if (token.startsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = token.slice(2, -2);
      nodes.push(strong);
    } else if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const a = document.createElement('a');
      a.textContent = linkMatch ? linkMatch[1] : token;
      a.href = linkMatch ? linkMatch[2] : '#';
      nodes.push(a);
    } else {
      const em = document.createElement('em');
      em.textContent = token.slice(1, -1);
      nodes.push(em);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(document.createTextNode(text.slice(lastIndex)));
  return nodes;
}

/**
 * @param {HTMLElement} container  cleared and filled with the rendered article
 * @param {string} markdown
 */
export function renderMarkdown(container, markdown) {
  container.innerHTML = '';
  const lines = markdown.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 4);
      const el = document.createElement(`h${level}`);
      el.append(...renderInline(heading[2]));
      container.appendChild(el);
      i += 1;
      continue;
    }

    if (line.trim().startsWith('```')) {
      const fenceLang = line.trim().slice(3).trim();
      const codeLines = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      if (fenceLang) code.dataset.lang = fenceLang;
      code.textContent = codeLines.join('\n');
      pre.appendChild(code);
      container.appendChild(pre);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const ul = document.createElement('ul');
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        const li = document.createElement('li');
        li.append(...renderInline(lines[i].replace(/^[-*]\s+/, '')));
        ul.appendChild(li);
        i += 1;
      }
      container.appendChild(ul);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const ol = document.createElement('ol');
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        const li = document.createElement('li');
        li.append(...renderInline(lines[i].replace(/^\d+\.\s+/, '')));
        ol.appendChild(li);
        i += 1;
      }
      container.appendChild(ol);
      continue;
    }

    if (line.trim().startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      const bq = document.createElement('blockquote');
      const p = document.createElement('p');
      p.append(...renderInline(quoteLines.join(' ')));
      bq.appendChild(p);
      container.appendChild(bq);
      continue;
    }

    const paraLines = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s+/.test(lines[i]) && !lines[i].trim().startsWith('```')) {
      paraLines.push(lines[i]);
      i += 1;
    }
    const p = document.createElement('p');
    p.append(...renderInline(paraLines.join(' ')));
    container.appendChild(p);
  }
}
