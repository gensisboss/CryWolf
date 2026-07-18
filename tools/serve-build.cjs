const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'build', 'web-mobile');
const port = Number(process.env.PORT || 7456);
const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
};

if (!fs.existsSync(path.join(root, 'index.html'))) {
    console.error('Missing build/web-mobile. Build the web-mobile platform in Cocos Creator first.');
    process.exit(1);
}

http.createServer((request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
    const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== root) {
        response.writeHead(403).end('Forbidden');
        return;
    }

    fs.readFile(filePath, (error, data) => {
        if (error) {
            response.writeHead(404).end('Not found');
            return;
        }
        response.setHeader('Content-Type', mimeTypes[path.extname(filePath)] || 'application/octet-stream');
        response.end(data);
    });
}).listen(port, '127.0.0.1', () => {
    console.log(`CryWolf preview: http://127.0.0.1:${port}`);
});
