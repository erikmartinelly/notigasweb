const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

const dom = new JSDOM(html, {
    runScripts: "dangerously",
    resources: "usable",
    url: "http://localhost"
});

dom.window.onerror = function(msg, source, lineno, colno, error) {
    console.error("ERROR EN BROWSER:", msg, source, lineno);
};

dom.window.console.error = function() {
    console.log("CONSOLE.ERROR:", ...arguments);
};

dom.window.console.log = function() {
    console.log("CONSOLE.LOG:", ...arguments);
};

setTimeout(() => {
    console.log("TEST FINISHED");
}, 5000);
