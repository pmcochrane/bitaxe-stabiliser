const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const readmePath = path.join(rootDir, 'README.md');
const publicDir = path.join(rootDir, 'public');

const readme = fs.readFileSync(readmePath, 'utf-8');
fs.writeFileSync(path.join(publicDir, 'readme.md'), readme);

console.log('README.md copied to public folder');
