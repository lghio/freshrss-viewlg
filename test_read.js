const { Readability } = require('@tehshrike/readability');
const { JSDOM } = require('jsdom');
const fs = require('fs');

JSDOM.fromURL('https://www.camilleroux.com/veille-et-digest-faire-sa-veille-techno-directement-dans-claude-code/').then(dom => {
  const article = new Readability(dom.window.document).parse();
  console.log(article.content.includes('<video'));
});
